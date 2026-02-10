-- Update service_job_link table to DB-first structure:
-- - job_number as PRIMARY KEY (for fast lookup)
-- - Add source, prefill_json, prefill_fetched_at columns
-- - Keep job_uuid UNIQUE for integrity

-- Step 1: Add new columns if they don't exist
alter table service_job_link
  add column if not exists source text,
  add column if not exists snapshot_ref text,
  add column if not exists prefill_json jsonb,
  add column if not exists prefill_fetched_at timestamptz;

-- Step 2: Ensure job_uuid is UNIQUE (if not already)
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'service_job_link_job_uuid_key'
  ) then
    alter table service_job_link add constraint service_job_link_job_uuid_key unique (job_uuid);
  end if;
end $$;

-- Step 3: If job_number is not already the primary key, we need to migrate carefully.
-- For now, keep id as PK but ensure job_number has unique index for fast lookups.
-- Note: Changing PK requires data migration; keeping id as PK is safer for existing data.
-- The unique index on job_number will serve as a logical PK for lookups.

-- Ensure unique index on job_number (for fast lookup and uniqueness)
drop index if exists idx_service_job_link_job_number;
create unique index if not exists idx_service_job_link_job_number_unique
  on service_job_link(job_number);

-- Keep index on job_uuid for reverse lookups
drop index if exists idx_service_job_link_job_uuid;
create index if not exists idx_service_job_link_job_uuid
  on service_job_link(job_uuid);
