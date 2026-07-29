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
