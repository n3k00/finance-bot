# Architecture

## Overview

Finance Bot has three runtime surfaces:

1. Next.js web app on Vercel.
2. Supabase Postgres and Supabase Auth.
3. Supabase Edge Function receiving Telegram webhooks.

Telegram is the main input surface. The web app is used for setup, dashboard, reports, and direct website login.

```text
Telegram Bot
  -> Supabase Edge Function: telegram-webhook
  -> Supabase Postgres: pending_entries, entries_log
  -> Optional Notion sync

Telegram Mini App
  -> Next.js /telegram
  -> Next.js /api/telegram/auth
  -> Supabase Auth session
  -> Dashboard

Website Login
  -> Next.js /login
  -> Telegram OIDC
  -> Next.js /api/telegram/oidc/callback
  -> Supabase Auth session
  -> Dashboard
```

## Web App

Location: `web/`

Framework:

- Next.js 16 App Router
- React 19
- TypeScript
- Tailwind CSS
- Supabase SSR helpers

Important routes:

- `/` redirects based on auth state.
- `/login` starts Telegram OpenID Connect login.
- `/telegram` is the Telegram Mini App landing page.
- `/dashboard` shows overview metrics and recent entries.
- `/personal` shows personal expense entries by month.
- `/bank` shows bank ledger entries by month.
- `/reports` shows reporting views.
- `/settings` holds user settings: categories and optional Notion sync.

Auth endpoints:

- `/api/telegram/auth` verifies Telegram Mini App `initData`.
- `/api/telegram/oidc/start` starts Telegram OIDC login.
- `/api/telegram/oidc/callback` exchanges and verifies Telegram OIDC tokens.
- `/api/telegram/web-login` is legacy Telegram web login support.

## Auth Model

The app uses Supabase Auth for web sessions. Telegram identity is the source identity for allowed users.

Core flow:

1. Verify Telegram identity.
2. Check `telegram_allowlist`.
3. Generate or link a Supabase Auth user.
4. Store `telegram_allowlist.linked_user_id`.
5. Use normal Supabase Auth session for dashboard access.

`telegram_allowlist` is admin-managed directly in Supabase.

## Telegram Bot Runtime

Location: `supabase/functions/telegram-webhook/`

Entrypoint: `index.ts`

Responsibilities:

- Validate Telegram webhook secret if configured.
- Resolve user by Telegram chat/from ID.
- Check linked allowlist and load `bot_config`.
- Route messages to help, report, chat, or entry parsing.
- Create rows in `pending_entries`.
- Render confirmation cards.
- Handle confirm/cancel/category callbacks.
- Save confirmed rows to `entries_log`.
- Optionally sync confirmed rows to Notion.

## Parser Strategy

Parser lives in `_parse.ts`.

Parsing strategy:

1. Rule parser first.
2. Shared admin AI fallback if rule parsing is insufficient.
3. If no AI key is configured, return a helpful format error.

Rule parser handles common personal and bank ledger cases:

- Myanmar and English digits.
- Amount extraction.
- Basic date words such as today/yesterday.
- Payment method detection: Cash, KPay, Wave, Bank, Card.
- Personal categories using keyword rules.
- Business direction: in, out, receivable, payable.

AI fallback uses OpenAI-compatible `/chat/completions`.

Runtime AI settings:

- Prefer `bot_config.openai_api_key` if present for backwards compatibility.
- Otherwise use Edge Function secrets:
  - `SHARED_AI_API_KEY`
  - `SHARED_AI_BASE_URL`
  - `SHARED_AI_MODEL`

## Telegram UI

The bot has two Telegram UI concepts:

- Chat menu button: opens the Mini App (`စာရင်း`).
- Bot command menu: shows command suggestions when the user types `/`.

Current command menu:

- `/help`
- `/p`
- `/m`
- `/in`
- `/out`
- `/report`
- `/table`

`/?` is supported in bot logic but cannot be registered in Telegram command menu because Telegram command names cannot contain `?`.

## Deployments

Web:

```powershell
cd web
npm run lint
npm run build
npx vercel --prod --yes
```

Edge Function:

```powershell
npx supabase functions deploy telegram-webhook --project-ref tnpjpojkiwmqrliynebd --no-verify-jwt
```

Type-check Edge Function:

```powershell
deno check supabase\functions\telegram-webhook\index.ts
```

Set Telegram command menu from web server actions:

- `registerTelegramWebhook` registers webhook, menu button, and command menu.
- Command menu can also be set directly with Telegram Bot API `setMyCommands`.
