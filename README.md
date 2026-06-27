# Telegram → AI → Notion Expense Tracker

Log personal expenses and business cashflow from Telegram. Send a short
message → AI parses it → you confirm → it lands in Notion. Web dashboard
shows recent entries and totals.

```
┌───────────┐    ┌────────────────────────────┐    ┌─────────┐
│ Telegram  │ ─▶ │ Supabase Edge Function     │ ─▶ │ Notion  │
│  /p 3500  │    │  parse (OpenAI) + confirm  │    │  DB     │
└───────────┘    └────────────────────────────┘    └─────────┘
                          │
                          ▼
                   ┌─────────────────┐
                   │ entries_log     │ ◀── Next.js dashboard
                   └─────────────────┘
```

## Stack

- **Web**: Next.js 16 + TypeScript + Tailwind (App Router)
- **Bot runtime**: Supabase Edge Functions (Deno)
- **AI parser**: OpenAI `gpt-4o-mini` (structured JSON output)
- **Database**: Notion (two databases — Personal & Business)
- **Config storage**: Supabase Postgres (`bot_config`, `pending_entries`, `entries_log`)
- **Auth**: Supabase Auth (email + password, or magic link)

## Repo layout

```
.
├── web/                              # Next.js app (dashboard + setup)
│   ├── src/app/
│   │   ├── login/                    # auth
│   │   ├── setup/                    # bot config form (server action)
│   │   ├── dashboard/                # recent entries + totals
│   │   ├── auth/callback/route.ts    # magic-link callback
│   │   └── logout/route.ts
│   └── src/lib/
│       ├── supabase/{client,server,queries}.ts
│       ├── actions.ts                # saveBotConfig server action
│       └── types.ts
└── supabase/
    ├── schema.sql                    # run this in Supabase SQL editor
    └── functions/telegram-webhook/   # Deno Edge Function
        ├── index.ts                  # webhook entrypoint
        ├── _parse.ts                 # OpenAI prompts + JSON parser
        ├── _telegram.ts              # Telegram Bot API helpers
        ├── _notion.ts                # Notion API helpers
        └── _types.ts
```

## Setup

### 1. Supabase project

1. Create a project at <https://supabase.com> — note the **Project URL**, **anon key**, and **service role key**.
2. Open **SQL Editor** → paste `supabase/schema.sql` → Run.
3. Open **Authentication → Providers → Email** → make sure **Email** and **Allow new users to sign up** are enabled.

### 2. Telegram bot

1. Open Telegram, message [@BotFather](https://t.me/BotFather) → `/newbot` → copy the **bot token**.
2. Message [@userinfobot](https://t.me/userinfobot) → copy **your user id** (numeric).

### 3. Notion integration

1. Go to <https://www.notion.so/my-integrations> → **Create new integration** → copy the **Internal Integration Secret**.
2. Create two databases in Notion (Personal, Business). Add these properties:

   **Personal**
   | Property | Type |
   |----------|------|
   | Name | Title |
   | Date | Date |
   | Type | Select (`Expense`, `Income`, `Transfer`) |
   | Category | Select (`Food`, `Drink`, `Transport`, `Shopping`, `Bills`, `Entertainment`, `Health`, `Family Support`, `Education`, `Other`) |
   | Description | Rich text |
   | Amount | Number |
   | Currency | Select (`MMK`, `USD`, `THB`) |
   | Payment Method | Select (`Cash`, `Bank`, `KPay`, `Wave`, `Card`, `Other`) |
   | Note | Rich text |

   **Business**
   | Property | Type |
   |----------|------|
   | Name | Title |
   | Date | Date |
   | Direction | Select (`In`, `Out`, `Receivable`, `Payable`) |
   | Person | Rich text |
   | Amount | Number |
   | Currency | Select (`MMK`, `USD`, `THB`, `USDT`) |
   | Payment Method | Select (`cash`, `bank_transfer`, `kpay`, `wave`, `binance`, `other`) |
   | Purpose | Rich text |
   | Status | Select (`Paid`, `Received`, `Pending`, `Partial`) |
   | Note | Rich text |

3. Open each database → **•••** → **Connections** → add the integration.
4. Copy the database id from the URL: `notion.so/<DATABASE_ID>?v=...` → the 32-char hex string.

### 4. OpenAI key

Create a key at <https://platform.openai.com/api-keys> (`gpt-4o-mini` is enough). Don't reuse the opencode subscription key — get your own.

### 5. Deploy the Edge Function

Install the Supabase CLI:

```bash
npm install -g supabase
supabase login
supabase link --project-ref <your-project-ref>
```

Deploy and set secrets:

```bash
supabase functions deploy telegram-webhook --no-verify-jwt

supabase secrets set \
  SUPABASE_URL=https://<your-project>.supabase.co \
  SUPABASE_SERVICE_ROLE_KEY=<service-role-key> \
  WEBHOOK_SECRET=<any-random-string-you-pick>
```

`--no-verify-jwt` is required because Telegram does not send a Supabase JWT.

### 6. Register the Telegram webhook

```bash
curl "https://api.telegram.org/bot<BOT_TOKEN>/setWebhook" \
  --data-urlencode "url=https://<your-project>.supabase.co/functions/v1/telegram-webhook" \
  --data-urlencode "secret_token=<WEBHOOK_SECRET>"
```

Verify:

```bash
curl "https://api.telegram.org/bot<BOT_TOKEN>/getWebhookInfo"
```

### 7. Run the web app

```bash
cd web
cp .env.local.example .env.local
# fill in NEXT_PUBLIC_SUPABASE_URL + NEXT_PUBLIC_SUPABASE_ANON_KEY
npm install
npm run dev
```

Open <http://localhost:3000> → **Sign up** → go to **Setup** → paste bot token, OpenAI key, Notion token, both database ids, and your Telegram user id → **Save config**.

### 8. Try it

In Telegram, message your bot:

```
/p မနက်စာ 3500
/p ကော်ဖီ 2500
/b ကိုအောင်ကို 500000 လွှဲ ပစ္စည်းဖိုး
/b ABC shop 850000 ကျန်
```

The bot replies with a confirmation card → tap **✅ Confirm** → entry is saved to Notion and shows up on the dashboard.

## Deploy the web app

Push the `web/` folder to GitHub and import it in Vercel. Set the env vars:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`

## Notes

- Business money and personal money are kept in **separate Notion databases**, separate tables, and separate prefixes (`/p` vs `/b`). Don't mix.
- Every entry goes through a **confirm step** before Notion insert — wrong parses never silently land in your ledger.
- The web dashboard reads from `entries_log` (a Supabase mirror), not from Notion directly, so it stays fast even with thousands of rows.
- Pending entries older than ~24h can be cleaned up with a scheduled function (not included yet).

## Roadmap (not implemented)

- Monthly report commands (`/report personal`, `/report business`)
- Edit-before-confirm flow
- Auto-cleanup of expired pending entries
- Charts on the dashboard
- Partial payment handling (`XYZ က 400000 ပေးလိုက်ပြီ ကျန် 100000`)
