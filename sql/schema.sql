-- Run this in the Supabase SQL editor before starting the scraper.
-- If you already created the v1 (Reddit-only) table, drop it first —
-- no production data exists yet, so this is a clean replacement:
--   drop table if exists public.processed_leads;

create table if not exists public.processed_leads (
  id bigint generated always as identity primary key,
  -- Identifies which deployment claimed this lead, so one Supabase project
  -- can safely host multiple independent deployments (e.g. several friends'
  -- bots) without one's claim on a lead_id silently blocking another's.
  -- Matches the TENANT_ID env var; defaults to 'default' for a deployment
  -- on its own dedicated Supabase project (the common case).
  tenant text not null default 'default',
  lead_id text not null,
  platform text not null,
  channel text not null,
  title text not null,
  url text not null,
  created_at timestamptz not null default now(),
  unique (tenant, lead_id)
);

create index if not exists processed_leads_tenant_lead_id_idx
  on public.processed_leads (tenant, lead_id);

-- --------------------------------------------------------------------------
-- MIGRATING AN EXISTING TABLE (skip this if the table above was just created
-- fresh). If you already have a processed_leads table from before tenant
-- scoping — e.g. you're consolidating a friend's existing deployment onto a
-- shared Supabase project — run this instead of the create table above:
--
--   alter table public.processed_leads
--     add column if not exists tenant text not null default 'default';
--   alter table public.processed_leads
--     drop constraint if exists processed_leads_lead_id_key;
--   alter table public.processed_leads
--     add constraint processed_leads_tenant_lead_id_key unique (tenant, lead_id);
--
-- Existing rows default to tenant='default' — fine as long as only one
-- deployment was ever pointed at this table before. Set TENANT_ID explicitly
-- for every deployment sharing this project going forward, including the
-- original one, so 'default' doesn't end up meaning two different people.
-- --------------------------------------------------------------------------
