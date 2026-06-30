# Database

Source schema: `supabase/schema.sql`

Hosted project ref: `tnpjpojkiwmqrliynebd`

## Tables

### `bot_config`

One row per Supabase Auth user.

Primary key:

- `user_id uuid`

Important columns:

- `telegram_bot_token text` - legacy nullable field; shared bot token is now in Edge Function secrets.
- `ai_provider text` - legacy/provider metadata.
- `ai_base_url text` - legacy/provider metadata.
- `openai_api_key text` - nullable; users normally do not need this now.
- `openai_model text` - legacy/model metadata.
- `personal_categories text[]` - user-editable personal categories.
- `notion_token text` - optional.
- `personal_db_id text` - optional Notion database ID.
- `business_db_id text` - optional Notion database ID.
- `allowed_telegram_ids bigint[]` - legacy field; do not use for new access checks.
- `created_at timestamptz`
- `updated_at timestamptz`

Current runtime behavior:

- Edge Function loads categories and optional Notion settings from this table.
- AI uses shared Edge Function secrets unless a row still has `openai_api_key`.
- Access control does not use `allowed_telegram_ids`; use `telegram_allowlist`.

### `telegram_allowlist`

Admin-managed invite/allow table.

Primary key:

- `telegram_user_id bigint`

Columns:

- `label text`
- `is_active boolean`
- `linked_user_id uuid`
- `created_at timestamptz`
- `updated_at timestamptz`

Behavior:

- A Telegram ID must exist and be active before Mini App or website login is allowed.
- `linked_user_id` is filled when the user successfully logs in.
- Admins currently add rows through Supabase SQL Editor or Table Editor.

Example add:

```sql
insert into public.telegram_allowlist (telegram_user_id, label, is_active)
values (1393740866, 'Added by admin', true)
on conflict (telegram_user_id) do update
set is_active = true,
    label = coalesce(public.telegram_allowlist.label, excluded.label);
```

### `pending_entries`

Temporary parsed entries waiting for Telegram confirmation.

Columns:

- `id uuid`
- `user_id uuid`
- `telegram_chat_id bigint`
- `telegram_message_id bigint`
- `book text` - `personal` or `business`
- `raw_text text`
- `parsed_data jsonb`
- `status text` - `pending`, `confirmed`, `cancelled`, `expired`, `error`
- `notion_page_id text`
- `error_message text`
- `created_at timestamptz`
- `updated_at timestamptz`

Behavior:

- Created after parse.
- Updated when user changes category.
- Marked confirmed or cancelled after callback.

### `entries_log`

Primary saved ledger table used by dashboard and reports.

Columns:

- `id uuid`
- `user_id uuid`
- `book text` - `personal` or `business`
- `notion_page_id text`
- `raw_text text`
- `data jsonb`
- `amount numeric(18,2)`
- `currency text`
- `direction text`
- `category text`
- `person text`
- `entry_date date`
- `created_at timestamptz`

Behavior:

- Inserted only after the user confirms in Telegram.
- Dashboard and reports read from this table.
- Notion is not the primary data source.

## JSON Shapes

### Personal entry

Stored under `data.personal`.

```json
{
  "date": "2026-06-30",
  "type": "Expense",
  "category": "Food",
  "description": "မုန့်ဝယ်စားတာ",
  "amount": 10000,
  "currency": "MMK",
  "payment_method": "Cash",
  "note": ""
}
```

### Business entry

Stored under `data.business`.

```json
{
  "date": "2026-06-30",
  "direction": "in",
  "person": "ကိုအောင်",
  "amount": 100000,
  "currency": "MMK",
  "method": "kpay",
  "account_type": "KPay",
  "account_no": "09265644066",
  "in_amount": 100000,
  "out_amount": 0,
  "debt_amount": 0,
  "purpose": "-",
  "status": "received",
  "note": ""
}
```

## RLS

RLS is enabled on:

- `bot_config`
- `pending_entries`
- `entries_log`
- `telegram_allowlist`

Authenticated users can access their own rows via `auth.uid() = user_id`.

Users can select only their linked allowlist row:

```sql
(select auth.uid()) = linked_user_id
```

The Edge Function uses the Supabase service role key and bypasses RLS where needed.

## Schema Change Workflow

For quick hosted changes:

```powershell
npx supabase db query --linked "select now();"
```

For persistent source-of-truth changes:

1. Edit `supabase/schema.sql`.
2. Apply the hosted change with `npx supabase db query --linked`.
3. Verify with an information schema query.
4. Commit the schema file.

Do not expose service role keys in frontend env variables.
