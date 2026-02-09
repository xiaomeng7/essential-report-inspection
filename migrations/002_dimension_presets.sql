-- Dimension presets for admin bulk-apply (optional; admin bulk uses this)
create table if not exists dimension_presets (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  safety text,
  urgency text,
  liability text,
  budget_low int,
  budget_high int,
  priority text,
  severity smallint,
  likelihood smallint,
  escalation text,
  created_at timestamptz default now()
);
