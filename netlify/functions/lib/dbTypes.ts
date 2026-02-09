/**
 * Shared types for DB layer: Custom 9 (UI/storage) and D1–D9 (engine).
 * customDimensionsToFindingDimensions() in dimensionsToPropertySignals.ts maps Custom 9 -> D1–D9; keep that intact.
 */

/** Custom 9 — stored in DB (finding_custom_dimensions) and used in forms/admin */
export type CustomNine = {
  safety?: string; // HIGH | MODERATE | LOW
  urgency?: string; // IMMEDIATE | SHORT_TERM | LONG_TERM
  liability?: string; // HIGH | MEDIUM | LOW
  budget_low?: number;
  budget_high?: number;
  priority?: string; // IMMEDIATE | RECOMMENDED_0_3_MONTHS | PLAN_MONITOR
  severity?: number; // 1-5
  likelihood?: number; // 1-5
  escalation?: string; // HIGH | MODERATE | LOW
};

/** D1–D9 — used by derivePropertySignals; derived at runtime from Custom 9 or profile */
export type FindingDimensionsD19 = {
  safety_impact: "low" | "medium" | "high";
  compliance_risk: "none" | "minor" | "material";
  failure_likelihood: "low" | "medium" | "high";
  urgency: "now" | "short" | "planned";
  degradation_trend: "stable" | "worsening";
  tenant_disruption_risk: "low" | "medium" | "high";
  cost_volatility: "stable" | "uncertain";
  detectability: "obvious" | "hidden";
  decision_complexity: "simple" | "requires_judgement";
};

/** finding_definitions row */
export type FindingDefinitionRow = {
  finding_id: string;
  title_en: string;
  title_zh: string | null;
  why_it_matters_en: string | null;
  why_it_matters_zh: string | null;
  recommended_action_en: string | null;
  recommended_action_zh: string | null;
  planning_guidance_en: string | null;
  planning_guidance_zh: string | null;
  system_group: string | null;
  space_group: string | null;
  tags: string[];
  is_active: boolean;
  created_at: Date;
  updated_at: Date;
};

/** finding_custom_dimensions row */
export type FindingCustomDimensionsRow = {
  id: string;
  finding_id: string;
  version: number;
  is_active: boolean;
  safety: string | null;
  urgency: string | null;
  liability: string | null;
  budget_low: number | null;
  budget_high: number | null;
  priority: string | null;
  severity: number | null;
  likelihood: number | null;
  escalation: string | null;
  needs_review: boolean;
  updated_by: string | null;
  updated_at: Date;
};

/** inspections row */
export type InspectionRow = {
  inspection_id: string;
  client_id: string | null;
  property_id: string | null;
  assessment_date: Date | null;
  prepared_for: string | null;
  prepared_by: string | null;
  overall_status: string | null;
  risk_rating: string | null;
  capex_low: number | null;
  capex_high: number | null;
  blobs_key: string | null;
  report_docx_key: string | null;
  created_at: Date;
  updated_at: Date;
};

/** inspection_findings row */
export type InspectionFindingRow = {
  id: string;
  inspection_id: string;
  finding_id: string;
  finding_kind: "rule" | "custom";
  notes: string | null;
  recommended_action_override: string | null;
  priority_override: string | null;
  photo_ids: string[];
  created_at: Date;
  updated_at: Date;
};

/** dimension_presets row */
export type DimensionPresetRow = {
  id: string;
  name: string;
  safety: string | null;
  urgency: string | null;
  liability: string | null;
  budget_low: number | null;
  budget_high: number | null;
  priority: string | null;
  severity: number | null;
  likelihood: number | null;
  escalation: string | null;
  created_at: Date;
};
