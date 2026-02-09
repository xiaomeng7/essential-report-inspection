-- Finding messages table: multi-language copy fields (title, why_it_matters, recommended_action, etc.)
-- Supports versioning and source tracking (seed vs manual edits).

create table finding_messages (
  finding_id text not null,
  lang text not null default 'en-AU',
  title text,
  observed_condition jsonb,
  why_it_matters text,
  recommended_action text,
  planning_guidance text,
  priority_rationale text,
  risk_interpretation text,
  disclaimer_line text,
  source text not null default 'seed:responses.yml',
  is_active boolean not null default true,
  version int not null default 1,
  updated_at timestamptz not null default now(),
  updated_by text,
  primary key (finding_id, lang)
);

create index idx_finding_messages_lang on finding_messages(lang);
create index idx_finding_messages_observed_condition on finding_messages using gin(observed_condition);
