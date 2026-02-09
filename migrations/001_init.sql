create table if not exists finding_definitions (
  finding_id text primary key,
  title_en text,
  title_zh text,
  why_it_matters_en text,
  why_it_matters_zh text,
  recommended_action_en text,
  recommended_action_zh text,
  planning_guidance_en text,
  planning_guidance_zh text,
  system_group text,
  space_group text,
  tags text[] default '{}'::text[],
  is_active boolean default true,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists finding_custom_dimensions (
  id bigserial primary key,
  finding_id text references finding_definitions(finding_id) on delete cascade,
  version int not null,
  is_active boolean default true,

  safety text,
  urgency text,
  liability text,
  budget_low int,
  budget_high int,
  priority text,
  severity int,
  likelihood int,
  escalation text,

  needs_review boolean default true,
  updated_by text,
  updated_at timestamptz default now(),

  unique (finding_id, version)
);

create index if not exists idx_finding_defs_system on finding_definitions(system_group);
create index if not exists idx_finding_defs_space on finding_definitions(space_group);
create index if not exists idx_finding_defs_tags on finding_definitions using gin(tags);
create index if not exists idx_dim_active on finding_custom_dimensions(finding_id, is_active);
