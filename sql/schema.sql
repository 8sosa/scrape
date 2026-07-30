-- Run this in the Supabase SQL editor before starting the scraper.
-- If you already created the v1 (Reddit-only) table, drop it first —
-- no production data exists yet, so this is a clean replacement:
--   drop table if exists public.processed_leads;

create table if not exists public.processed_leads (
  id bigint generated always as identity primary key,
  lead_id text not null unique,
  platform text not null,
  channel text not null,
  title text not null,
  url text not null,
  created_at timestamptz not null default now()
);

create index if not exists processed_leads_lead_id_idx
  on public.processed_leads (lead_id);

-- Draft applications: one row per lead that reached the notify step, holding
-- the drafted cover note and apply target, awaiting (or past) an Approve/Skip
-- decision made via the Telegram inline buttons.
create table if not exists public.draft_applications (
  id uuid primary key default gen_random_uuid(),
  lead_id text not null unique references public.processed_leads (lead_id) on delete cascade,
  method text not null check (method in ('email', 'external-link')),
  target text not null,
  title text not null,
  cover_note text not null,
  status text not null default 'pending' check (status in ('pending', 'approved', 'skipped', 'sent', 'failed')),
  telegram_chat_id text,
  telegram_message_id text,
  created_at timestamptz not null default now()
);

create index if not exists draft_applications_lead_id_idx
  on public.draft_applications (lead_id);
