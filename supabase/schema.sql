-- =============================================================
-- Telegram Expense Tracker - Supabase schema
-- Run this in Supabase SQL editor (or via `supabase db push`)
-- =============================================================

-- 1) Bot config (one row per authenticated user) ----------------
create table if not exists public.bot_config (
  user_id              uuid primary key references auth.users (id) on delete cascade,
  telegram_bot_token   text,
  ai_provider          text not null default 'openai',
  ai_base_url          text not null default 'https://api.openai.com/v1',
  openai_api_key       text,
  openai_model         text not null default 'gpt-4o-mini',
  personal_categories  text[] not null default array[
    'Food',
    'Drink',
    'Transport',
    'Shopping',
    'Bills',
    'Entertainment',
    'Health',
    'Family Support',
    'Education',
    'Tobacco',
    'Donation',
    'Gift',
    'Other'
  ],
  notion_token         text,
  personal_db_id       text,
  business_db_id       text,
  allowed_telegram_ids bigint[] not null default '{}',
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);

-- 2) Pending entries (waiting for user confirmation) -------------
create table if not exists public.pending_entries (
  id                   uuid primary key default gen_random_uuid(),
  user_id              uuid not null references auth.users (id) on delete cascade,
  telegram_chat_id     bigint not null,
  telegram_message_id  bigint not null,
  book                 text not null check (book in ('personal','business')),
  raw_text             text not null,
  parsed_data          jsonb not null,
  status               text not null default 'pending'
                       check (status in ('pending','confirmed','cancelled','expired','error')),
  notion_page_id       text,
  error_message        text,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);

create index if not exists pending_entries_chat_idx
  on public.pending_entries (telegram_chat_id, status);

-- 3) Entries log (mirror of every row saved to Notion) -----------
-- Used by the web dashboard so we do not have to hit Notion on
-- every page load.
create table if not exists public.entries_log (
  id                   uuid primary key default gen_random_uuid(),
  user_id              uuid not null references auth.users (id) on delete cascade,
  book                 text not null check (book in ('personal','business')),
  notion_page_id       text,
  raw_text             text,
  data                 jsonb not null,
  amount               numeric(18,2),
  currency             text,
  direction            text,
  category             text,
  person               text,
  entry_date           date not null,
  created_at           timestamptz not null default now()
);

create index if not exists entries_log_user_date_idx
  on public.entries_log (user_id, entry_date desc);
create index if not exists entries_log_user_book_idx
  on public.entries_log (user_id, book, entry_date desc);

-- 3b) Telegram Mini App invite allowlist ------------------------
-- Admin-managed list. Add rows directly from Supabase SQL Editor
-- or Table Editor; no app admin panel is required.
create table if not exists public.telegram_allowlist (
  telegram_user_id     bigint primary key,
  label                text,
  is_active            boolean not null default true,
  linked_user_id       uuid references auth.users (id) on delete set null,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);

create index if not exists telegram_allowlist_linked_user_idx
  on public.telegram_allowlist (linked_user_id);

-- Existing projects created from older versions had Notion fields as
-- required. Keep reruns idempotent while making Notion sync optional.
alter table public.bot_config
  alter column telegram_bot_token drop not null;
alter table public.bot_config
  alter column openai_api_key drop not null;
alter table public.bot_config
  alter column notion_token drop not null;
alter table public.entries_log
  alter column notion_page_id drop not null;
alter table public.entries_log
  add column if not exists raw_text text;
alter table public.bot_config
  add column if not exists ai_provider text not null default 'openai';
alter table public.bot_config
  add column if not exists ai_base_url text not null default 'https://api.openai.com/v1';
alter table public.bot_config
  add column if not exists personal_categories text[] not null default array[
    'Food',
    'Drink',
    'Transport',
    'Shopping',
    'Bills',
    'Entertainment',
    'Health',
    'Family Support',
    'Education',
    'Tobacco',
    'Donation',
    'Gift',
    'Other'
  ];

-- 4) updated_at triggers ----------------------------------------
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists bot_config_touch on public.bot_config;
create trigger bot_config_touch
  before update on public.bot_config
  for each row execute function public.touch_updated_at();

drop trigger if exists pending_entries_touch on public.pending_entries;
create trigger pending_entries_touch
  before update on public.pending_entries
  for each row execute function public.touch_updated_at();

drop trigger if exists telegram_allowlist_touch on public.telegram_allowlist;
create trigger telegram_allowlist_touch
  before update on public.telegram_allowlist
  for each row execute function public.touch_updated_at();

-- Migrate older per-user Telegram ID settings into the shared-bot
-- allowlist model. Existing explicit links are preserved.
insert into public.telegram_allowlist (
  telegram_user_id,
  label,
  is_active,
  linked_user_id
)
select distinct
  legacy.telegram_user_id,
  'Migrated from bot_config',
  true,
  bc.user_id
from public.bot_config bc
cross join lateral unnest(bc.allowed_telegram_ids) as legacy(telegram_user_id)
where legacy.telegram_user_id is not null
on conflict (telegram_user_id) do update
set
  is_active = true,
  linked_user_id = coalesce(
    public.telegram_allowlist.linked_user_id,
    excluded.linked_user_id
  );

-- 5) Row Level Security -----------------------------------------
alter table public.bot_config       enable row level security;
alter table public.pending_entries  enable row level security;
alter table public.entries_log      enable row level security;
alter table public.telegram_allowlist enable row level security;

-- Users can only see or edit their own rows.
drop policy if exists "own bot_config"       on public.bot_config;
drop policy if exists "own pending_entries"  on public.pending_entries;
drop policy if exists "own entries_log"      on public.entries_log;
drop policy if exists "own linked telegram_allowlist" on public.telegram_allowlist;

create policy "own bot_config"
  on public.bot_config for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "own pending_entries"
  on public.pending_entries for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "own entries_log"
  on public.entries_log for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "own linked telegram_allowlist"
  on public.telegram_allowlist for select
  to authenticated
  using ((select auth.uid()) = linked_user_id);

-- 6) Data API grants ---------------------------------------------
-- New Supabase projects may not expose SQL-created tables to the
-- Data API automatically. RLS above still controls which rows each
-- authenticated user can access.
grant usage on schema public to authenticated;
grant select, insert, update, delete on public.bot_config to authenticated;
grant select, insert, update, delete on public.pending_entries to authenticated;
grant select, insert, update, delete on public.entries_log to authenticated;
grant select on public.telegram_allowlist to authenticated;

-- Remove the old helper view if this schema is re-run on an existing
-- project. The Edge Function uses the service role and queries
-- bot_config directly, so exposing secrets through a public view is
-- unnecessary.
drop view if exists public.v_bot_config_by_chat;
