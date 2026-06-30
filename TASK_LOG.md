# Task Log

This file tracks notable implementation decisions and operational updates.

## 2026-06-30

### Documentation set added

- Added `PROJECT_CONTEXT.md`.
- Added `ARCHITECTURE.md`.
- Added `DATABASE.md`.
- Added `TASK_LOG.md`.
- Refreshed root `README.md`.

### Telegram command menu

- Added `/?` as a help alias in the Edge Function.
- Added Telegram Bot API `setMyCommands` support in `web/src/lib/actions.ts`.
- Registered command menu:
  - `/help`
  - `/p`
  - `/m`
  - `/in`
  - `/out`
  - `/report`
  - `/table`

### Shared admin AI key

- Added shared AI secret fallback in `supabase/functions/telegram-webhook/index.ts`.
- Set hosted Edge Function secrets:
  - `SHARED_AI_API_KEY`
  - `SHARED_AI_BASE_URL`
  - `SHARED_AI_MODEL`
- Removed user-facing AI key/provider/model controls from settings.
- Removed dashboard warning that asked users to add an AI key.

### Rule parser and categories

- Added rule-first parser with AI fallback in `_parse.ts`.
- Made `openai_api_key` nullable in `bot_config`.
- Added `personal_categories text[]`.
- Added default categories:
  - Food
  - Drink
  - Transport
  - Shopping
  - Bills
  - Entertainment
  - Health
  - Family Support
  - Education
  - Tobacco
  - Donation
  - Gift
  - Other
- Added Telegram category edit buttons for pending personal entries.

### Allowlist updates

- Added Telegram ID `1393740866` to `telegram_allowlist` with `is_active = true`.

## Current verification commands

Run these before deploying related changes:

```powershell
deno check supabase\functions\telegram-webhook\index.ts
cd web
npm run lint
npm run build
```

Deploy commands:

```powershell
npx supabase functions deploy telegram-webhook --project-ref tnpjpojkiwmqrliynebd --no-verify-jwt
cd web
npx vercel --prod --yes
```

## Open follow-ups

- Add an admin UI for `telegram_allowlist` if direct Supabase edits become inconvenient.
- Add richer edit-before-confirm flow for amount/date/description, not only category.
- Add cleanup for old `pending_entries`.
- Consider usage limits for shared AI key if invite-only user count grows.
