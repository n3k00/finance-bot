# Finance Bot

Invite-only Telegram finance tracker for personal expenses and bank account ledger entries.

Users send short messages to a shared Telegram bot, confirm the parsed result, and review saved data in a Next.js dashboard. Supabase is the primary database. Notion sync is optional.

## Current Stack

- Web app: Next.js 16, React 19, TypeScript, Tailwind CSS
- Hosting: Vercel
- Auth: Supabase Auth
- Database: Supabase Postgres
- Bot runtime: Supabase Edge Function
- Telegram auth: Mini App `initData` plus Telegram OpenID Connect for website login
- AI: admin-managed shared OpenAI-compatible API key with rule-based parser first
- Optional integration: Notion

## Production References

- Web: `https://finance-bot-pi.vercel.app`
- Supabase project ref: `tnpjpojkiwmqrliynebd`
- Edge Function: `telegram-webhook`
- Mini App route: `/telegram`
- Login route: `/login`

## How It Works

```text
Telegram message
  -> Supabase Edge Function
  -> rule parser first
  -> shared AI fallback if needed
  -> Telegram confirmation card
  -> entries_log in Supabase
  -> optional Notion sync
  -> dashboard/reports
```

Access is controlled by `telegram_allowlist`. A user must be in the allowlist before they can use the Mini App or website login.

## Repository Layout

```text
.
├── README.md
├── PROJECT_CONTEXT.md
├── ARCHITECTURE.md
├── DATABASE.md
├── TASK_LOG.md
├── supabase/
│   ├── config.toml
│   ├── schema.sql
│   └── functions/
│       └── telegram-webhook/
│           ├── index.ts
│           ├── _parse.ts
│           ├── _chat.ts
│           ├── _telegram.ts
│           ├── _notion.ts
│           └── _types.ts
└── web/
    ├── package.json
    ├── .env.local.example
    └── src/
        ├── app/
        └── lib/
```

## Local Development

```powershell
cd web
npm install
npm run dev
```

Open:

```text
http://localhost:3000
```

Useful checks:

```powershell
cd web
npm run lint
npm run build
```

Edge Function type check:

```powershell
deno check supabase\functions\telegram-webhook\index.ts
```

## Required Web Environment Variables

Set in `web/.env.local` for local dev and in Vercel for hosted web:

```text
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
NEXT_PUBLIC_SITE_URL=
SUPABASE_SERVICE_ROLE_KEY=
TELEGRAM_BOT_TOKEN=
TELEGRAM_MINI_APP_BOT_TOKEN=
TELEGRAM_OIDC_CLIENT_ID=
TELEGRAM_OIDC_CLIENT_SECRET=
WEBHOOK_SECRET=
```

Do not expose service role keys or bot tokens as `NEXT_PUBLIC_*`.

## Required Edge Function Secrets

Set in Supabase Edge Function secrets:

```text
SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=
WEBHOOK_SECRET=
TELEGRAM_BOT_TOKEN=
WEB_APP_URL=
SHARED_AI_API_KEY=
SHARED_AI_BASE_URL=
SHARED_AI_MODEL=
```

The shared AI key is admin-managed. Normal users do not enter API keys.

## Deploy

Deploy Edge Function:

```powershell
npx supabase functions deploy telegram-webhook --project-ref tnpjpojkiwmqrliynebd --no-verify-jwt
```

Deploy web:

```powershell
cd web
npx vercel --prod --yes
```

## Telegram Setup

The shared Telegram bot uses:

- Webhook: Supabase Edge Function URL
- Chat menu button: opens `/telegram`
- Bot command menu:
  - `/help`
  - `/p`
  - `/m`
  - `/in`
  - `/out`
  - `/report`
  - `/table`

`/?` is also supported as a help alias but cannot be shown in Telegram's official command menu.

The command menu is updated by `setMyCommands` in `web/src/lib/actions.ts`.

## User Commands

Personal entries:

```text
မုန့် 2000
/p coffee 2500
ဒီနေ့ ဆေးလိပ်ဝယ်တာ 5000 ကုန်တယ်
```

Bank ledger:

```text
/m ကိုအောင် kpay ဝင် 100000
/in ကိုအောင် kpay 100000
/out taxi cash 280000
```

Reports:

```text
/report
/report last month
/table ဒီလ
ဒီလ ငွေသုံးတာ ဘယ်လောက်ရှိပြီလဲ
```

## Docs

Read these before larger changes:

- `PROJECT_CONTEXT.md` - product state, decisions, and operating notes
- `ARCHITECTURE.md` - runtime architecture and deployment flow
- `DATABASE.md` - schema and data model
- `TASK_LOG.md` - recent changes and follow-ups

## Notes

- Supabase is the source of truth.
- Notion is optional and should not block Supabase saving.
- Every entry must be confirmed before it is saved.
- Keep `supabase/schema.sql` in sync with hosted DB changes.
- Use `npx supabase db query --linked` for direct hosted SQL changes.
