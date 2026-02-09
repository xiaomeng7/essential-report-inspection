-- Full Neon findings management schema (replaces 001 finding_definitions / finding_custom_dimensions for this flow).
-- Run after 001/002 if you need dimension_presets; this migration drops and recreates finding_* tables.

-- Drop dependent objects first (view, then tables with foreign keys, then parent table)
drop view if exists finding_effective_dimensions cascade;
drop table if exists finding_custom_dimensions cascade;
drop table if exists finding_dimensions_seed cascade;
drop table if exists finding_definitions cascade;

create table finding_definitions (
  finding_id text primary key,
  system_group text,
  space_group text,
  tags text[] default '{}'::text[],
  title text,
  why_it_matters text,
  recommended_action text,
  planning_guidance text,
  source text not null default 'seed' check (source in ('seed','manual')),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table finding_dimensions_seed (
  finding_id text primary key references finding_definitions(finding_id) on delete cascade,
  safety text,
  urgency text,
  liability text,
  budget_low int,
  budget_high int,
  priority text,
  severity int,
  likelihood int,
  escalation text,
  seed_version text not null,
  seeded_at timestamptz default now()
);

create table finding_custom_dimensions (
  id bigserial primary key,
  finding_id text not null references finding_definitions(finding_id) on delete cascade,
  version int not null,
  active boolean not null default false,
  safety text,
  urgency text,
  liability text,
  budget_low int,
  budget_high int,
  priority text,
  severity int,
  likelihood int,
  escalation text,
  note text,
  updated_by text,
  created_at timestamptz default now(),
  unique (finding_id, version)
);

-- Indexes: btree system_group, space_group; gin tags
create index idx_fd_system on finding_definitions (system_group);
create index idx_fd_space on finding_definitions (space_group);
create index idx_fd_tags on finding_definitions using gin (tags);

-- Optional: enable pg_trgm in Neon dashboard then run: create index idx_fd_finding_id_trgm on finding_definitions using gin (finding_id gin_trgm_ops); create index idx_fd_title_trgm on finding_definitions using gin (title gin_trgm_ops);
create index idx_fd_finding_id on finding_definitions (finding_id);
create index idx_fd_title on finding_definitions (title);

-- One active override per finding
create unique index idx_fcd_active_per_finding on finding_custom_dimensions (finding_id) where (active = true);

-- Helper view: effective dimensions (override ?? seed) and dimensions_source
create or replace view finding_effective_dimensions as
select
  fd.finding_id,
  coalesce(fcd.safety, fds.safety) as safety,
  coalesce(fcd.urgency, fds.urgency) as urgency,
  coalesce(fcd.liability, fds.liability) as liability,
  coalesce(fcd.budget_low, fds.budget_low) as budget_low,
  coalesce(fcd.budget_high, fds.budget_high) as budget_high,
  coalesce(fcd.priority, fds.priority) as priority,
  coalesce(fcd.severity, fds.severity) as severity,
  coalesce(fcd.likelihood, fds.likelihood) as likelihood,
  coalesce(fcd.escalation, fds.escalation) as escalation,
  case when fcd.id is not null then 'override' else 'seed' end as dimensions_source,
  fcd.version as override_version
from finding_definitions fd
left join finding_dimensions_seed fds on fds.finding_id = fd.finding_id
left join finding_custom_dimensions fcd on fcd.finding_id = fd.finding_id and fcd.active = true;
