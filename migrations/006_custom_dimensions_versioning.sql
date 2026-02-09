-- Add draft/published versioning to finding_custom_dimensions table.
-- Safe migration: adds status column with default 'published', updates view to use only published.

-- Step 1: Add status column with default 'published' (existing rows become published)
alter table finding_custom_dimensions
  add column if not exists status text not null default 'published'
  check (status in ('draft', 'published'));

-- Step 2: Add version text column (nullable, for tracking published versions)
-- Note: version int already exists, this adds version text for semantic versioning
alter table finding_custom_dimensions
  add column if not exists version_text text;

-- Step 3: Ensure updated_at exists (may already exist)
alter table finding_custom_dimensions
  add column if not exists updated_at timestamptz not null default now();

-- Step 4: Ensure updated_by exists (may already exist)
alter table finding_custom_dimensions
  add column if not exists updated_by text;

-- Step 5: Update existing rows to have status='published' explicitly (defensive)
update finding_custom_dimensions
set status = 'published'
where status is null or status not in ('draft', 'published');

-- Step 6: Add index for efficient queries
create index if not exists idx_fcd_finding_status 
  on finding_custom_dimensions(finding_id, status);

-- Step 7: Update finding_effective_dimensions view to use only published custom dimensions
-- This ensures draft edits don't affect reports until published
drop view if exists finding_effective_dimensions cascade;

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
left join finding_custom_dimensions fcd on fcd.finding_id = fd.finding_id 
  and fcd.active = true 
  and fcd.status = 'published';

-- Note: 
-- - Status='published' + active=true means published override affects reports
-- - Status='draft' means work-in-progress, not yet published (ignored by effective view)
-- - Admin can preview draft dimensions via query flag or env var
