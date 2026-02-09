-- Add audit log table for tracking publish/rollback actions on finding messages and dimensions.

create table finding_change_log (
  id bigserial primary key,
  entity_type text not null check (entity_type in ('messages', 'dimensions')),
  finding_id text,
  lang text,
  action text not null check (action in ('publish', 'rollback')),
  from_version text,
  to_version text,
  actor text,
  created_at timestamptz not null default now(),
  diff_json jsonb not null
);

-- Indexes for efficient queries
create index idx_fcl_entity_finding on finding_change_log(entity_type, finding_id);
create index idx_fcl_entity_lang on finding_change_log(entity_type, finding_id, lang);
create index idx_fcl_version on finding_change_log(to_version, action);
create index idx_fcl_created on finding_change_log(created_at desc);

-- Note:
-- - entity_type: 'messages' or 'dimensions'
-- - finding_id: null for bulk operations, specific finding_id for single operations
-- - lang: null for dimensions, 'en-AU' etc for messages
-- - action: 'publish' (draft -> published) or 'rollback' (restore previous published)
-- - from_version: version before change (null for first publish)
-- - to_version: version after change (the published version)
-- - diff_json: { before: {...}, after: {...} } snapshot of changes
