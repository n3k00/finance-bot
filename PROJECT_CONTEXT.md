# Project Context

Last updated: 2026-06-30

## Product

Finance Bot is an invite-only Telegram finance tracker. Users record personal expenses and bank ledger entries from Telegram, confirm parsed entries in chat, and review saved data in a Next.js dashboard.

The app is intentionally small and admin-controlled:

- One shared Telegram bot is used for all users.
- Access is controlled by `telegram_allowlist`.
- Users do not need to provide their own Telegram bot token.
- Users do not need to provide their own AI API key.
- Supabase is the primary database.
- Notion sync is optional.

## Current Production

- Web: `https://finance-bot-pi.vercel.app`
- Supabase project ref: `tnpjpojkiwmqrliynebd`
- Hosted Edge Function: `telegram-webhook`
- Telegram Mini App path: `/telegram`
- Website login path: `/login`
- Main app path after auth: `/dashboard`

## Main User Flows

### Telegram Mini App login

1. User opens the shared Telegram bot.
2. User taps the bot menu button labeled `စာရင်း`.
3. Telegram opens the Mini App at `/telegram`.
4. The app sends Telegram `initData` to `/api/telegram/auth`.
5. Backend verifies the Telegram signature.
6. Backend checks `telegram_allowlist`.
7. If allowed, Supabase Auth account is created or linked.
8. User is redirected to `/dashboard`.

If the Telegram ID is not allowed, the Mini App shows the user's Telegram ID, a copy button, and a message link to `@n3k000`.

### Website direct login

1. User opens `/login`.
2. User clicks "Sign in with Telegram".
3. App redirects to Telegram OpenID Connect.
4. Callback route `/api/telegram/oidc/callback` verifies the Telegram ID token.
5. Backend checks `telegram_allowlist`.
6. If allowed, Supabase Auth account is created or linked.
7. User is redirected to `/dashboard`.

### Recording entries from Telegram

1. User sends a message to the bot.
2. The Edge Function identifies the user through Telegram ID and `telegram_allowlist`.
3. The message is classified as personal expense, bank ledger, report query, or ordinary chat.
4. Entry messages are parsed by the built-in rule parser first.
5. If rule parsing is not enough, the shared admin AI key is used as fallback.
6. Bot sends a confirmation card.
7. User can adjust personal category using inline buttons.
8. User taps `သိမ်းမယ်` or `မသိမ်းဘူး`.
9. Confirmed entries are saved to `entries_log`.
10. If Notion is configured, the entry is also copied to Notion.

## Telegram Commands

Telegram command menu is configured with:

- `/help` - manual and examples
- `/p` - personal expense entry
- `/m` - bank ledger entry
- `/in` - bank ledger money in
- `/out` - bank ledger money out
- `/report` - summary
- `/table` - table-style summary

The bot also supports `/?` as a help alias, but Telegram does not allow `?` in the official command menu.

## AI Policy

The current design uses an admin-managed shared AI key:

- Edge Function secrets:
  - `SHARED_AI_API_KEY`
  - `SHARED_AI_BASE_URL`
  - `SHARED_AI_MODEL`
- Per-user AI fields still exist in `bot_config` for backwards compatibility.
- Runtime prefers per-user key only if one is saved; otherwise it uses shared admin secrets.
- Settings UI no longer asks normal users for provider, model, or API key.

## Important Files

- `web/src/app/telegram/page.tsx` - Mini App entry page
- `web/src/app/login/page.tsx` - website Telegram OIDC login page
- `web/src/app/api/telegram/auth/route.ts` - Mini App auth endpoint
- `web/src/app/api/telegram/oidc/start/route.ts` - website Telegram OIDC start
- `web/src/app/api/telegram/oidc/callback/route.ts` - website Telegram OIDC callback
- `web/src/app/AdminShell.tsx` - dashboard shell and mobile nav
- `web/src/app/setup/SetupForm.tsx` - user settings form
- `web/src/lib/actions.ts` - server actions, Telegram webhook/menu/command registration
- `web/src/lib/telegramAuth.ts` - allowlist auth and Supabase session creation
- `web/src/lib/telegramMiniApp.ts` - Telegram Mini App signature verification
- `web/src/lib/telegramOidc.ts` - Telegram OIDC helpers
- `supabase/schema.sql` - Supabase schema source
- `supabase/functions/telegram-webhook/index.ts` - Telegram webhook runtime
- `supabase/functions/telegram-webhook/_parse.ts` - rule parser and AI parser fallback
- `supabase/functions/telegram-webhook/_telegram.ts` - Telegram Bot API helpers
- `supabase/functions/telegram-webhook/_notion.ts` - optional Notion sync

## Operating Notes

- `supabase/functions/telegram-webhook` must be redeployed after Edge Function changes.
- Vercel must be redeployed after `web/` changes.
- `supabase/schema.sql` changes must be applied to hosted Supabase manually or with `npx supabase db query --linked`.
- Do not expose service role keys or shared AI keys in frontend code.
- Keep allowlist management in Supabase Dashboard or SQL for now; no admin panel exists yet.
