-- ServiceM8 job link & cache table.
-- Stores mapping between inspections and external ServiceM8 jobs,
-- and caches job/contact/address payloads to avoid repeated API calls.

create table if not exists service_job_link (
  id bigserial primary key,
  inspection_id text references inspections(inspection_id) on delete cascade,
  job_uuid text not null,
  job_number text not null,
  job_cache jsonb not null,
  fetched_at timestamptz not null default now()
);

create index if not exists idx_service_job_link_job_number
  on service_job_link(job_number);

create index if not exists idx_service_job_link_job_uuid
  on service_job_link(job_uuid);

