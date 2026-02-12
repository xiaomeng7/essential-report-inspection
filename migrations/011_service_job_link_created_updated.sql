-- Add created_at and updated_at to service_job_link (referenced by code but never added).

alter table service_job_link
  add column if not exists created_at timestamptz default now(),
  add column if not exists updated_at timestamptz default now();
