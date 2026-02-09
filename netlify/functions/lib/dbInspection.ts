/**
 * DB writes for inspections and inspection_findings. Blobs remain source of truth for raw JSON and docx.
 * Call from submitInspection (after Blobs save) and when report_docx_key is known.
 */

import { sql, isDbConfigured } from "./db";

const INSPECTIONS_BLOB_PREFIX = "inspections/";

export type InspectionInsert = {
  inspection_id: string;
  assessment_date?: string | null;
  prepared_for?: string | null;
  prepared_by?: string | null;
  overall_status?: string | null;
  risk_rating?: string | null;
  capex_low?: number | null;
  capex_high?: number | null;
  blobs_key?: string | null;
  report_docx_key?: string | null;
};

export async function upsertInspection(row: InspectionInsert): Promise<void> {
  if (!isDbConfigured()) return;
  const db = sql();
  const blobs_key = row.blobs_key ?? INSPECTIONS_BLOB_PREFIX + row.inspection_id;
  await db`
    INSERT INTO inspections (
      inspection_id, assessment_date, prepared_for, prepared_by,
      overall_status, risk_rating, capex_low, capex_high, blobs_key, report_docx_key, updated_at
    ) VALUES (
      ${row.inspection_id}, ${row.assessment_date ?? null}, ${row.prepared_for ?? null}, ${row.prepared_by ?? null},
      ${row.overall_status ?? null}, ${row.risk_rating ?? null}, ${row.capex_low ?? null}, ${row.capex_high ?? null},
      ${blobs_key}, ${row.report_docx_key ?? null}, now()
    )
    ON CONFLICT (inspection_id) DO UPDATE SET
      assessment_date = COALESCE(EXCLUDED.assessment_date, inspections.assessment_date),
      prepared_for = COALESCE(EXCLUDED.prepared_for, inspections.prepared_for),
      prepared_by = COALESCE(EXCLUDED.prepared_by, inspections.prepared_by),
      overall_status = COALESCE(EXCLUDED.overall_status, inspections.overall_status),
      risk_rating = COALESCE(EXCLUDED.risk_rating, inspections.risk_rating),
      capex_low = COALESCE(EXCLUDED.capex_low, inspections.capex_low),
      capex_high = COALESCE(EXCLUDED.capex_high, inspections.capex_high),
      blobs_key = COALESCE(EXCLUDED.blobs_key, inspections.blobs_key),
      report_docx_key = COALESCE(EXCLUDED.report_docx_key, inspections.report_docx_key),
      updated_at = now()
  `;
}

export async function updateInspectionReportKey(inspection_id: string, report_docx_key: string): Promise<void> {
  if (!isDbConfigured()) return;
  const db = sql();
  await db`
    UPDATE inspections SET report_docx_key = ${report_docx_key}, updated_at = now() WHERE inspection_id = ${inspection_id}
  `;
}

export type InspectionFindingInsert = {
  inspection_id: string;
  finding_id: string;
  finding_kind: "rule" | "custom";
  notes?: string | null;
  recommended_action_override?: string | null;
  priority_override?: string | null;
  photo_ids?: string[];
};

export async function upsertInspectionFindings(inspection_id: string, findings: InspectionFindingInsert[]): Promise<void> {
  if (!isDbConfigured() || findings.length === 0) return;
  const db = sql();
  for (const f of findings) {
    await db`
      INSERT INTO inspection_findings (inspection_id, finding_id, finding_kind, notes, recommended_action_override, priority_override, photo_ids, updated_at)
      VALUES (${inspection_id}, ${f.finding_id}, ${f.finding_kind}, ${f.notes ?? null}, ${f.recommended_action_override ?? null}, ${f.priority_override ?? null}, ${f.photo_ids ?? []}, now())
      ON CONFLICT (inspection_id, finding_id) DO UPDATE SET
        finding_kind = EXCLUDED.finding_kind,
        notes = EXCLUDED.notes,
        recommended_action_override = EXCLUDED.recommended_action_override,
        priority_override = EXCLUDED.priority_override,
        photo_ids = EXCLUDED.photo_ids,
        updated_at = now()
    `;
  }
}
