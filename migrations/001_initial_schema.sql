-- Neon Postgres schema for inspection data and 9 custom finding dimensions.
-- Blobs remain source for: raw JSON, photos, generated DOCX/PDF. DB stores references and structured metadata.
--
-- Data flow (high level):
--   [Wizard/Submit] -> Blobs (raw, report docx) + DB (inspections, inspection_findings)
--   [Admin] -> DB (finding_definitions, finding_custom_dimensions versions)
--   [Report gen] -> Read Blobs as today; optional: read active dimensions from DB for Custom 9 -> D1-D9 mapping unchanged

-- Stubs for future ServiceM8/CRM
CREATE TABLE IF NOT EXISTS clients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT,
  email TEXT,
  phone TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS properties (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID REFERENCES clients(id),
  address_line TEXT,
  suburb TEXT,
  state TEXT,
  postcode TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 149 findings: definitions from finding_profiles.yml + responses.yml
CREATE TABLE IF NOT EXISTS finding_definitions (
  finding_id TEXT PRIMARY KEY,
  title_en TEXT NOT NULL,
  title_zh TEXT,
  why_it_matters_en TEXT,
  why_it_matters_zh TEXT,
  recommended_action_en TEXT,
  recommended_action_zh TEXT,
  planning_guidance_en TEXT,
  planning_guidance_zh TEXT,
  system_group TEXT,
  space_group TEXT,
  tags TEXT[] DEFAULT '{}',
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Custom 9 dimensions per finding, versioned (one active per finding_id)
CREATE TABLE IF NOT EXISTS finding_custom_dimensions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  finding_id TEXT NOT NULL REFERENCES finding_definitions(finding_id),
  version INT NOT NULL DEFAULT 1,
  is_active BOOLEAN DEFAULT false,
  safety TEXT,
  urgency TEXT,
  liability TEXT,
  budget_low INT,
  budget_high INT,
  priority TEXT,
  severity SMALLINT,
  likelihood SMALLINT,
  escalation TEXT,
  needs_review BOOLEAN DEFAULT true,
  updated_by TEXT,
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(finding_id, version)
);

CREATE INDEX IF NOT EXISTS idx_finding_custom_dimensions_finding_active
  ON finding_custom_dimensions(finding_id) WHERE is_active = true;

-- Inspections: metadata + blob keys (raw JSON and report docx live in Blobs)
CREATE TABLE IF NOT EXISTS inspections (
  inspection_id TEXT PRIMARY KEY,
  client_id UUID REFERENCES clients(id),
  property_id UUID REFERENCES properties(id),
  assessment_date TIMESTAMPTZ,
  prepared_for TEXT,
  prepared_by TEXT,
  overall_status TEXT,
  risk_rating TEXT,
  capex_low NUMERIC,
  capex_high NUMERIC,
  blobs_key TEXT,
  report_docx_key TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Per-inspection findings (rule-evaluated + custom), notes, photos refs
CREATE TABLE IF NOT EXISTS inspection_findings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  inspection_id TEXT NOT NULL REFERENCES inspections(inspection_id) ON DELETE CASCADE,
  finding_id TEXT NOT NULL REFERENCES finding_definitions(finding_id),
  finding_kind TEXT NOT NULL DEFAULT 'rule',
  notes TEXT,
  recommended_action_override TEXT,
  priority_override TEXT,
  photo_ids TEXT[] DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(inspection_id, finding_id)
);

CREATE INDEX IF NOT EXISTS idx_inspection_findings_inspection
  ON inspection_findings(inspection_id);

-- Dimension presets for bulk apply (admin)
CREATE TABLE IF NOT EXISTS dimension_presets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  safety TEXT,
  urgency TEXT,
  liability TEXT,
  budget_low INT,
  budget_high INT,
  priority TEXT,
  severity SMALLINT,
  likelihood SMALLINT,
  escalation TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Seed default presets in scripts/seed-neon-findings.ts or run manually
