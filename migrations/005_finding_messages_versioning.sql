-- Add draft/published versioning to finding_messages table.
-- Safe migration: adds columns with defaults, then alters PK to include status.

-- Step 1: Add status column with default 'published' (existing rows become published)
alter table finding_messages
  add column if not exists status text not null default 'published'
  check (status in ('draft', 'published'));

-- Step 2: Add version column (nullable, for tracking published versions)
alter table finding_messages
  add column if not exists version text;

-- Step 3: Ensure updated_at and updated_by exist (may already exist from 004)
alter table finding_messages
  add column if not exists updated_at timestamptz not null default now();

alter table finding_messages
  add column if not exists updated_by text;

-- Step 4: Drop existing PK constraint (safe: we'll recreate it)
-- Note: This is safe because we're adding status column with default 'published' first,
-- so all existing rows will have status='published' and the new PK will work.
alter table finding_messages
  drop constraint if exists finding_messages_pkey;

-- Step 5: Create new PK that includes status (allows draft + published for same finding_id/lang)
-- This allows one draft and one published message per (finding_id, lang) pair.
alter table finding_messages
  add constraint finding_messages_pkey primary key (finding_id, lang, status);

-- Step 6: Add indexes for common queries
create index if not exists idx_finding_messages_lang_status 
  on finding_messages(lang, status);

create index if not exists idx_finding_messages_finding_lang_status 
  on finding_messages(finding_id, lang, status);

-- Step 7: Update existing rows to have status='published' explicitly (defensive)
update finding_messages
set status = 'published'
where status is null or status not in ('draft', 'published');

-- Note: Existing is_active column remains for backward compatibility.
-- Status='published' + is_active=true means active published message.
-- Status='draft' means work-in-progress, not yet published.
