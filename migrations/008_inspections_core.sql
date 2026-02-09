-- Core inspections tables (MVP).
-- Stores inspection metadata, findings, photos, and tasks.
-- Raw JSON stored for flexibility; DB is additional to Netlify Blobs (not replacement).

-- Table 1: inspections (main inspection metadata)
create table inspections (
  inspection_id text primary key,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  assessment_date date,
  prepared_for text,
  prepared_by text,
  property_address text,
  property_type text,
  overall_status text,
  risk_rating text,
  capex_low integer,
  capex_high integer,
  source text not null default 'netlify' check (source in ('netlify', 'import', 'manual')),
  raw_json jsonb not null
);

-- Indexes for inspections
create index idx_inspections_created_at on inspections(created_at desc);
create index idx_inspections_assessment_date on inspections(assessment_date desc nulls last);
create index idx_inspections_source on inspections(source);

-- Optional: enable pg_trgm in Neon dashboard then run:
-- create extension if not exists pg_trgm;
-- create index idx_inspections_property_address_trgm on inspections using gin(property_address gin_trgm_ops);

-- Table 2: inspection_findings (findings associated with an inspection)
create table inspection_findings (
  inspection_id text not null references inspections(inspection_id) on delete cascade,
  finding_id text not null,
  priority text,
  is_custom boolean not null default false,
  created_at timestamptz not null default now(),
  primary key (inspection_id, finding_id)
);

-- Indexes for inspection_findings
create index idx_inspection_findings_finding_id on inspection_findings(finding_id);
create index idx_inspection_findings_priority on inspection_findings(priority);
create index idx_inspection_findings_custom on inspection_findings(is_custom);

-- Table 3: inspection_photos (photos associated with an inspection)
create table inspection_photos (
  inspection_id text not null references inspections(inspection_id) on delete cascade,
  photo_id text not null,
  finding_id text,
  room_name text,
  caption text,
  blob_key text,  -- e.g. photos/EH-.../P01.png (Netlify Blobs key)
  created_at timestamptz not null default now(),
  primary key (inspection_id, photo_id)
);

-- Indexes for inspection_photos
create index idx_inspection_photos_finding_id on inspection_photos(finding_id);
create index idx_inspection_photos_blob_key on inspection_photos(blob_key);

-- Table 4: inspection_tasks (future-ready task management)
create table inspection_tasks (
  id bigserial primary key,
  inspection_id text not null references inspections(inspection_id) on delete cascade,
  finding_id text,
  task_type text not null default 'follow_up' check (task_type in ('repair', 'quote', 'monitor', 'retest', 'follow_up')),
  due_date date,
  status text not null default 'open' check (status in ('open', 'scheduled', 'done', 'cancelled')),
  budget_low integer,
  budget_high integer,
  notes text,
  created_at timestamptz not null default now()
);

-- Indexes for inspection_tasks
create index idx_inspection_tasks_inspection_id on inspection_tasks(inspection_id);
create index idx_inspection_tasks_finding_id on inspection_tasks(finding_id);
create index idx_inspection_tasks_status on inspection_tasks(status);
create index idx_inspection_tasks_due_date on inspection_tasks(due_date nulls last);

-- Note:
-- - These tables are MVP and do not replace Netlify Blobs storage
-- - Writes to DB should be best-effort; failures must not break existing flow
-- - raw_json stores full inspection payload for flexibility
-- - inspection_tasks table is created but not yet used in runtime
