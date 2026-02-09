/**
 * DB writes for inspections core tables (008 schema).
 * Best-effort writes: failures must not break existing flow.
 * Used by submitInspection (after Blobs save) and saveCustomFindings.
 */

import { sql, isDbConfigured } from "./db";

export type InspectionCoreData = {
  inspection_id: string;
  assessment_date?: string | null;
  prepared_for?: string | null;
  prepared_by?: string | null;
  property_address?: string | null;
  property_type?: string | null;
  overall_status?: string | null;
  risk_rating?: string | null;
  capex_low?: number | null;
  capex_high?: number | null;
  source?: string;
  raw_json: Record<string, unknown>;
};

export type InspectionFindingData = {
  finding_id: string;
  priority?: string | null;
  is_custom?: boolean;
};

export type InspectionPhotoData = {
  photo_id: string;
  finding_id?: string | null;
  room_name?: string | null;
  caption?: string | null;
  blob_key?: string | null;
};

/**
 * Upsert inspection core data into inspections table.
 */
export async function upsertInspectionCore(data: InspectionCoreData): Promise<number> {
  if (!isDbConfigured()) {
    return 0;
  }

  try {
    const q = sql();
    const result = await q`
      INSERT INTO inspections (
        inspection_id, created_at, updated_at, assessment_date, prepared_for, prepared_by,
        property_address, property_type, overall_status, risk_rating, capex_low, capex_high,
        source, raw_json
      )
      VALUES (
        ${data.inspection_id}, now(), now(),
        ${data.assessment_date ?? null},
        ${data.prepared_for ?? null},
        ${data.prepared_by ?? null},
        ${data.property_address ?? null},
        ${data.property_type ?? null},
        ${data.overall_status ?? null},
        ${data.risk_rating ?? null},
        ${data.capex_low ?? null},
        ${data.capex_high ?? null},
        ${data.source ?? 'netlify'},
        ${JSON.stringify(data.raw_json)}::jsonb
      )
      ON CONFLICT (inspection_id) DO UPDATE SET
        updated_at = now(),
        assessment_date = COALESCE(EXCLUDED.assessment_date, inspections.assessment_date),
        prepared_for = COALESCE(EXCLUDED.prepared_for, inspections.prepared_for),
        prepared_by = COALESCE(EXCLUDED.prepared_by, inspections.prepared_by),
        property_address = COALESCE(EXCLUDED.property_address, inspections.property_address),
        property_type = COALESCE(EXCLUDED.property_type, inspections.property_type),
        overall_status = COALESCE(EXCLUDED.overall_status, inspections.overall_status),
        risk_rating = COALESCE(EXCLUDED.risk_rating, inspections.risk_rating),
        capex_low = COALESCE(EXCLUDED.capex_low, inspections.capex_low),
        capex_high = COALESCE(EXCLUDED.capex_high, inspections.capex_high),
        source = COALESCE(EXCLUDED.source, inspections.source),
        raw_json = EXCLUDED.raw_json
      RETURNING inspection_id
    `;
    return result.length > 0 ? 1 : 0;
  } catch (e) {
    console.error("[db-inspections] upsertInspectionCore failed:", e);
    throw e; // Re-throw so caller can log and continue
  }
}

/**
 * Upsert inspection findings into inspection_findings table.
 */
export async function upsertInspectionFindings(
  inspection_id: string,
  findings: InspectionFindingData[]
): Promise<number> {
  if (!isDbConfigured() || findings.length === 0) {
    return 0;
  }

  try {
    const q = sql();
    let inserted = 0;
    for (const f of findings) {
      await q`
        INSERT INTO inspection_findings (
          inspection_id, finding_id, priority, is_custom, created_at
        )
        VALUES (
          ${inspection_id}, ${f.finding_id}, ${f.priority ?? null}, ${f.is_custom ?? false}, now()
        )
        ON CONFLICT (inspection_id, finding_id) DO UPDATE SET
          priority = EXCLUDED.priority,
          is_custom = EXCLUDED.is_custom
      `;
      inserted++;
    }
    return inserted;
  } catch (e) {
    console.error("[db-inspections] upsertInspectionFindings failed:", e);
    throw e; // Re-throw so caller can log and continue
  }
}

/**
 * Upsert inspection photos into inspection_photos table.
 */
export async function upsertInspectionPhotos(
  inspection_id: string,
  photos: InspectionPhotoData[]
): Promise<number> {
  if (!isDbConfigured() || photos.length === 0) {
    return 0;
  }

  try {
    const q = sql();
    let inserted = 0;
    for (const p of photos) {
      await q`
        INSERT INTO inspection_photos (
          inspection_id, photo_id, finding_id, room_name, caption, blob_key, created_at
        )
        VALUES (
          ${inspection_id}, ${p.photo_id}, ${p.finding_id ?? null}, ${p.room_name ?? null},
          ${p.caption ?? null}, ${p.blob_key ?? null}, now()
        )
        ON CONFLICT (inspection_id, photo_id) DO UPDATE SET
          finding_id = EXCLUDED.finding_id,
          room_name = EXCLUDED.room_name,
          caption = EXCLUDED.caption,
          blob_key = EXCLUDED.blob_key
      `;
      inserted++;
    }
    return inserted;
  } catch (e) {
    console.error("[db-inspections] upsertInspectionPhotos failed:", e);
    throw e; // Re-throw so caller can log and continue
  }
}

/**
 * Touch updated_at timestamp for an inspection.
 */
export async function touchInspectionUpdatedAt(inspection_id: string): Promise<void> {
  if (!isDbConfigured()) {
    return;
  }

  try {
    const q = sql();
    await q`
      UPDATE inspections SET updated_at = now() WHERE inspection_id = ${inspection_id}
    `;
  } catch (e) {
    console.error("[db-inspections] touchInspectionUpdatedAt failed:", e);
    // Don't throw - this is best-effort
  }
}
