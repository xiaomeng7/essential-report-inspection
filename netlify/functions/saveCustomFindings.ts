import type { Handler, HandlerEvent, HandlerContext } from "@netlify/functions";
import { get, save } from "./lib/store";
import { getRoomLocationAndPhotos } from "./lib/deriveCustomFindings";
import { uploadPhotoToFinding } from "./lib/uploadPhotoToFinding";
import { upsertInspectionFindings } from "./lib/dbInspection";
import { upsertInspectionFindings as upsertInspectionFindingsCore, upsertInspectionPhotos, touchInspectionUpdatedAt } from "./lib/dbInspectionsCore";
import { isDbConfigured } from "./lib/db";

type CustomFindingInput = {
  id: string;
  title: string;
  safety: string;
  urgency: string;
  liability: string;
  budget_low?: number;
  budget_high?: number;
  priority: string;
  severity: number;
  likelihood: number;
  escalation: string;
};

export const handler: Handler = async (event: HandlerEvent, _ctx: HandlerContext) => {
  if (event.httpMethod !== "POST") {
    return {
      statusCode: 405,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ error: "Method Not Allowed" }),
    };
  }

  const path = event.path ?? "";
  const match = /saveCustomFindings\/([^/]+)/.exec(path);
  const inspection_id = match?.[1];

  if (!inspection_id) {
    return {
      statusCode: 400,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ error: "Missing inspection_id" }),
    };
  }

  let body: { custom_findings?: CustomFindingInput[] };
  try {
    body = JSON.parse(event.body ?? "{}");
  } catch {
    return {
      statusCode: 400,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ error: "Invalid JSON body" }),
    };
  }

  const customFindings = body.custom_findings;
  if (!Array.isArray(customFindings) || customFindings.length === 0) {
    return {
      statusCode: 400,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ error: "Missing or empty custom_findings array" }),
    };
  }

  const data = await get(inspection_id, event);
  if (!data) {
    return {
      statusCode: 404,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ error: "Inspection not found", inspection_id }),
    };
  }

  const raw = data.raw as Record<string, unknown>;
  const isBase64 = (s: string) => typeof s === "string" && s.startsWith("data:image");

  const toUpload: Array<{ finding_id: string; images: string[]; location: string }> = [];
  const newFindings = customFindings.map((cf) => {
    const { location, photo_ids: roomPhotoIds } = getRoomLocationAndPhotos(raw, cf.id);
    const photoIds = roomPhotoIds.filter((x) => !isBase64(x));
    const base64Photos = roomPhotoIds.filter(isBase64);
    if (base64Photos.length > 0) {
      toUpload.push({ finding_id: cf.id, images: base64Photos.slice(0, 2 - photoIds.length), location });
    }
    return {
      id: cf.id,
      priority: cf.priority || "PLAN_MONITOR",
      title: cf.title || cf.id.replace(/_/g, " "),
      location: location || undefined,
      photo_ids: photoIds.length > 0 ? photoIds : undefined,
    };
  });

  const mergedFindings = [...data.findings, ...newFindings];

  const completed = (data.raw.custom_findings_completed as Array<Record<string, unknown>>) ?? [];
  const updated = [
    ...completed,
    ...customFindings.map((cf) => ({
      id: cf.id,
      title: cf.title,
      safety: cf.safety,
      urgency: cf.urgency,
      liability: cf.liability,
      budget_low: cf.budget_low,
      budget_high: cf.budget_high,
      priority: cf.priority,
      severity: cf.severity,
      likelihood: cf.likelihood,
      escalation: cf.escalation,
    })),
  ];

  const rawUpdated = { ...data.raw, custom_findings_completed: updated };

  await save(
    inspection_id,
    {
      ...data,
      raw: rawUpdated,
      findings: mergedFindings,
    },
    event
  );

  for (const { finding_id, images, location } of toUpload) {
    for (let i = 0; i < images.length; i++) {
      try {
        const caption = location ? `${location} - Photo ${i + 1}` : `Photo ${i + 1}`;
        await uploadPhotoToFinding(inspection_id, finding_id, images[i], caption, event);
      } catch (e) {
        console.error("Custom finding photo upload failed:", finding_id, e);
      }
    }
  }

  // Best-effort DB persistence (non-blocking)
  try {
    // Legacy DB call (keep for backward compatibility)
    await upsertInspectionFindings(
      inspection_id,
      customFindings.map((cf) => {
        const { location } = getRoomLocationAndPhotos(raw, cf.id);
        const existingF = mergedFindings.find((x) => x.id === cf.id);
        return {
          inspection_id,
          finding_id: cf.id,
          finding_kind: "custom",
          notes: cf.title || location || null,
          priority_override: cf.priority ?? null,
          photo_ids: existingF?.photo_ids ?? [],
        };
      })
    );
    
    // New DB core tables (008 schema)
    if (isDbConfigured()) {
      // Upsert custom findings
      const customFindingsData = customFindings.map((cf) => ({
        finding_id: cf.id,
        priority: cf.priority ?? null,
        is_custom: true,
      }));
      const findingsCount = await upsertInspectionFindingsCore(inspection_id, customFindingsData);
      
      // Update photos mapping for custom findings
      const photosData: Array<{ photo_id: string; finding_id?: string | null; room_name?: string | null; caption?: string | null; blob_key?: string | null }> = [];
      for (const cf of customFindings) {
        const existingF = mergedFindings.find((x) => x.id === cf.id);
        const photoIds = existingF?.photo_ids ?? [];
        const { location } = getRoomLocationAndPhotos(raw, cf.id);
        for (const photoId of photoIds) {
          if (typeof photoId === 'string' && photoId.trim()) {
            photosData.push({
              photo_id: photoId,
              finding_id: cf.id,
              room_name: location || null,
              caption: null,
              blob_key: `photos/${inspection_id}/${photoId}.jpg`,
            });
          }
        }
      }
      const photosCount = await upsertInspectionPhotos(inspection_id, photosData);
      
      // Touch updated_at
      await touchInspectionUpdatedAt(inspection_id);
      
      console.log(`[db-inspections] updated inspection_id=${inspection_id} findings=${findingsCount} photos=${photosCount}`);
    }
  } catch (e) {
    console.error("[db-inspections] DB persistence failed (non-fatal):", e instanceof Error ? e.message : String(e));
  }

  return {
    statusCode: 200,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      ok: true,
      inspection_id,
      findings_count: mergedFindings.length,
    }),
  };
};
