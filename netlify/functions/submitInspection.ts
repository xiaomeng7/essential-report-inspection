import type { Handler, HandlerEvent, HandlerContext } from "@netlify/functions";
import { save, get, getNextInspectionNumber, saveWordDoc } from "./lib/store";
import crypto from "crypto";
import { flattenFacts, evaluateFindings, collectLimitations, buildReportHtml } from "./lib/rules";
import { sendEmailNotification } from "./lib/email";
import { uploadPhotoToFinding } from "./lib/uploadPhotoToFinding";
import { getBaseUrl } from "./lib/baseUrl";
import { generateMarkdownWordBuffer } from "./generateMarkdownWord";
import { logWordReport } from "./lib/wordReportLog";
import { upsertInspection, updateInspectionReportKey, upsertInspectionFindings } from "./lib/dbInspection";
import { upsertInspectionCore, upsertInspectionFindings as upsertInspectionFindingsCore, upsertInspectionPhotos } from "./lib/dbInspectionsCore";
import { normalizeInspection } from "./lib/normalizeInspection";
import { isDbConfigured } from "./lib/db";

const WORD_GENERATE_TIMEOUT_MS = 12_000;

async function genId(event: HandlerEvent): Promise<string> {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0"); // 01-12
  const number = await getNextInspectionNumber(event);
  // Ensure number is between 1-999, then pad to 3 digits
  const numberStr = String(Math.min(Math.max(number, 1), 999)).padStart(3, "0"); // 001-999
  return `EH-${year}-${month}-${numberStr}`;
}

export const handler: Handler = async (event: HandlerEvent, _ctx: HandlerContext) => {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method Not Allowed" };
  }
  let raw: Record<string, unknown>;
  try {
    raw = JSON.parse(event.body ?? "{}") as Record<string, unknown>;
  } catch (e) {
    console.error("JSON parse error:", e);
    return { statusCode: 400, headers: { "Content-Type": "application/json" }, body: JSON.stringify({ error: "Invalid JSON" }) };
  }

  // Address validation: require address_place_id and suburb/state/postcode
  const extractValue = (v: unknown): unknown => {
    if (v == null) return undefined;
    if (typeof v === "string" || typeof v === "number" || typeof v === "boolean") return v;
    if (typeof v === "object" && "value" in (v as object)) {
      const answerValue = (v as { value: unknown }).value;
      if (typeof answerValue === "object" && answerValue !== null && "value" in (answerValue as object)) {
        return extractValue(answerValue);
      }
      return answerValue;
    }
    return undefined;
  };
  const job = raw.job as Record<string, unknown> | undefined;
  const placeId = extractValue(job?.address_place_id);
  const comp = extractValue(job?.address_components) as Record<string, unknown> | undefined;
  const suburb = comp?.suburb;
  const state = comp?.state;
  const postcode = comp?.postcode;
  const hasPlaceId = placeId !== undefined && placeId !== null && String(placeId).trim() !== "";
  const hasComponents = (suburb && String(suburb).trim()) || (state && String(state).trim()) || (postcode && String(postcode).trim());
  if (!hasPlaceId || !hasComponents) {
    return {
      statusCode: 400,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        error: "Invalid address",
        message: "Please select a valid address from suggestions. Address must include suburb, state, and postcode.",
      }),
    };
  }

  // Completeness: required photos for rooms with issues (mirror frontend)
  const rawPayload = raw as Record<string, unknown>;
  const gpoRoomsRaw = rawPayload.gpo_tests as Record<string, unknown> | undefined;
  const gpoRoomsValue = gpoRoomsRaw?.rooms != null ? extractValue(gpoRoomsRaw.rooms) : undefined;
  const rawGpoRooms = Array.isArray(gpoRoomsValue) ? gpoRoomsValue : [];
  for (let i = 0; i < rawGpoRooms.length; i++) {
    const r = rawGpoRooms[i] as Record<string, unknown>;
    if (!r || String(extractValue(r.room_access) ?? r.room_access ?? "").trim() === "not_accessible") continue;
    const issue = String(extractValue(r.issue) ?? r.issue ?? "").trim();
    if (!issue || issue === "none") continue;
    const pids = (extractValue(r.photo_ids) ?? r.photo_ids) as unknown[] | undefined;
    const hasPhoto = Array.isArray(pids) && pids.length > 0;
    if (!hasPhoto) {
      const label = String(extractValue(r.room_type) ?? r.room_type ?? extractValue(r.room_name_custom) ?? r.room_name_custom ?? `Room ${i + 1}`);
      return {
        statusCode: 400,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          error: "incomplete_evidence",
          message: `Please add at least one photo for the GPO room with an issue: ${label}.`,
        }),
      };
    }
  }
  const lightingRaw = rawPayload.lighting as Record<string, unknown> | undefined;
  const lightingRoomsValue = lightingRaw?.rooms != null ? extractValue(lightingRaw.rooms) : undefined;
  const rawLightRooms = Array.isArray(lightingRoomsValue) ? lightingRoomsValue : [];
  for (let i = 0; i < rawLightRooms.length; i++) {
    const r = rawLightRooms[i] as Record<string, unknown>;
    if (!r || String(extractValue(r.room_access) ?? r.room_access ?? "").trim() === "not_accessible") continue;
    const issues = (extractValue(r.issues) ?? r.issues) as unknown[] | undefined;
    const hasIssue = Array.isArray(issues) && issues.some((x) => x != null && String(x) !== "none" && String(x) !== "other");
    if (!hasIssue) continue;
    const pids = (extractValue(r.photo_ids) ?? r.photo_ids) as unknown[] | undefined;
    const hasPhoto = Array.isArray(pids) && pids.length > 0;
    if (!hasPhoto) {
      const label = String(extractValue(r.room_type) ?? r.room_type ?? extractValue(r.room_name_custom) ?? r.room_name_custom ?? `Room ${i + 1}`);
      return {
        statusCode: 400,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          error: "incomplete_evidence",
          message: `Please add at least one photo for the lighting room with an issue: ${label}.`,
        }),
      };
    }
  }

  try {
    console.log("Starting inspection processing...");
    const inspection_id = await genId(event);
    console.log("Generated inspection_id:", inspection_id);
    
    console.log("Flattening facts...");
    const facts = flattenFacts(raw);
    console.log("Facts flattened, keys:", Object.keys(facts).length);
    
    console.log("Evaluating findings...");
    let findings = await evaluateFindings(facts, event);

    const isBase64 = (s: string) => typeof s === "string" && s.startsWith("data:image");
    const toUpload: Array<{ finding_id: string; image: string; caption: string }> = [];
    for (const f of findings) {
      const pids = f.photo_ids ?? [];
      const base64List = pids.filter(isBase64) as string[];
      const realIds = pids.filter((x) => !isBase64(x));
      if (base64List.length > 0) {
        (f as any).photo_ids = realIds;
        const loc = f.location || "";
        for (let i = 0; i < Math.min(base64List.length, 2); i++) {
          toUpload.push({
            finding_id: f.id,
            image: base64List[i],
            caption: loc ? `${loc} - Photo ${i + 1}` : `Photo ${i + 1}`,
          });
        }
      }
    }

    console.log("Collecting limitations...");
    const limitations = collectLimitations(raw);
    console.log("Limitations collected, count:", limitations.length);
    
    console.log("Building report HTML...");
    const report_html = buildReportHtml(findings, limitations, inspection_id, raw);
    console.log("Report HTML built, length:", report_html.length);
    
    console.log("Saving inspection...");
    await save(inspection_id, {
      inspection_id,
      raw,
      report_html,
      findings,
      limitations,
      report_status: "pending",
    }, event);
    console.log("Inspection saved successfully");

    // Best-effort DB persistence (non-blocking)
    try {
      if (isDbConfigured()) {
        const { canonical } = normalizeInspection(raw, inspection_id);
        const jobRaw = raw.job as Record<string, unknown> | undefined;
        const signoffRaw = raw.signoff as Record<string, unknown> | undefined;
        
        // Extract basic fields
        const preparedBy = signoffRaw?.technician_name != null ? extractValue(signoffRaw.technician_name) : undefined;
        const preparedFor = jobRaw?.address != null ? extractValue(jobRaw.address) : undefined;
        const propertyAddress = canonical.property_address || (preparedFor ? String(preparedFor) : null);
        const propertyType = canonical.property_type || (jobRaw?.property_type != null ? String(extractValue(jobRaw.property_type)) : null);
        
        // Calculate overall_status and risk_rating from findings
        const hasImmediate = findings.some(f => f.priority === "IMMEDIATE" || f.priority === "URGENT");
        const hasRecommended = findings.some(f => f.priority === "RECOMMENDED_0_3_MONTHS");
        const overallStatus = hasImmediate ? "HIGH RISK" : hasRecommended ? "MODERATE RISK" : "LOW RISK";
        const riskRating = hasImmediate ? "HIGH" : hasRecommended ? "MODERATE" : "LOW";
        
        // Calculate capex (simplified - will be recalculated in report generation)
        // For now, set to null; can be updated later when report is generated
        const capexLow = null;
        const capexHigh = null;
        
        // Upsert inspection core
        const inspectionCoreCount = await upsertInspectionCore({
          inspection_id,
          assessment_date: canonical.assessment_date || (raw.created_at as string) || new Date().toISOString().split('T')[0],
          prepared_for: preparedFor != null ? String(preparedFor) : null,
          prepared_by: preparedBy != null ? String(preparedBy) : null,
          property_address: propertyAddress,
          property_type: propertyType,
          overall_status: overallStatus,
          risk_rating: riskRating,
          capex_low: capexLow,
          capex_high: capexHigh,
          source: 'netlify',
          raw_json: raw,
        });
        
        // Upsert findings
        const findingsData = findings.map((f) => ({
          finding_id: f.id,
          priority: f.priority ?? null,
          is_custom: false,
        }));
        const findingsCount = await upsertInspectionFindingsCore(inspection_id, findingsData);
        
        // Collect photos from findings
        const photosData: Array<{ photo_id: string; finding_id?: string | null; room_name?: string | null; caption?: string | null; blob_key?: string | null }> = [];
        for (const f of findings) {
          const photoIds = f.photo_ids ?? [];
          for (const photoId of photoIds) {
            if (typeof photoId === 'string' && photoId.trim()) {
              photosData.push({
                photo_id: photoId,
                finding_id: f.id,
                room_name: f.location || null,
                caption: null, // Can be enriched later from photo metadata
                blob_key: `photos/${inspection_id}/${photoId}.jpg`, // Default extension
              });
            }
          }
        }
        const photosCount = await upsertInspectionPhotos(inspection_id, photosData);
        
        console.log(`[db-inspections] inserted inspection_id=${inspection_id} core=${inspectionCoreCount} findings=${findingsCount} photos=${photosCount}`);
      }
    } catch (dbErr) {
      console.error("[db-inspections] DB persistence failed (non-fatal):", dbErr instanceof Error ? dbErr.message : String(dbErr));
    }

    // Legacy DB calls (keep for backward compatibility)
    const jobRaw = raw.job as Record<string, unknown> | undefined;
    const signoffRaw = raw.signoff as Record<string, unknown> | undefined;
    const preparedBy = signoffRaw?.technician_name != null ? extractValue(signoffRaw.technician_name) : undefined;
    const preparedFor = jobRaw?.address != null ? extractValue(jobRaw.address) : undefined;
    try {
      await upsertInspection({
        inspection_id,
        assessment_date: (raw.created_at as string) ?? new Date().toISOString(),
        prepared_for: preparedFor != null ? String(preparedFor) : null,
        prepared_by: preparedBy != null ? String(preparedBy) : null,
        blobs_key: `inspections/${inspection_id}`,
      });
      await upsertInspectionFindings(
        inspection_id,
        findings.map((f) => ({
          inspection_id,
          finding_id: f.id,
          finding_kind: "rule",
          priority_override: f.priority ?? null,
          photo_ids: f.photo_ids ?? [],
        }))
      );
    } catch (dbErr) {
      console.error("[submit] DB upsert inspection/findings failed (non-fatal):", dbErr);
    }

    if (toUpload.length > 0) {
      console.log("Uploading room photos (base64)...", toUpload.length);
      for (const { finding_id, image, caption } of toUpload) {
        try {
          await uploadPhotoToFinding(inspection_id, finding_id, image, caption, event);
        } catch (uploadErr) {
          console.error("Room photo upload failed:", finding_id, uploadErr);
        }
      }
    }

    // 单一权威路径：同进程调用 generateMarkdownWordBuffer，超时 12s，失败不阻断提交
    const inspectionForReport = { inspection_id, raw, report_html, findings, limitations };
    const wordBlobKey = `reports/${inspection_id}.docx`;
    let wordReportGenerated = false;
    const wordGenStart = Date.now();
    try {
      console.log("[submit] Generating Word in-process for", inspection_id);
      const wordBuffer = await Promise.race([
        generateMarkdownWordBuffer(inspectionForReport, event),
        new Promise<never>((_, rej) => setTimeout(() => rej(new Error("Word generation timeout (12s)")), WORD_GENERATE_TIMEOUT_MS)),
      ]);
      await saveWordDoc(wordBlobKey, wordBuffer, event);
      wordReportGenerated = true;
      const reportHash = crypto.createHash("sha256").update(wordBuffer).digest("hex");
      console.log("[submit] Word report saved to blob key=" + wordBlobKey + " size=" + wordBuffer.length + " hash=" + reportHash.slice(0, 16) + "...");
      const existing = await get(inspection_id, event);
      if (existing) {
        await save(inspection_id, { ...existing, report_status: "generated", report_blob_key: wordBlobKey, report_generated_at: new Date().toISOString(), report_hash: reportHash }, event);
      }
      try {
        await updateInspectionReportKey(inspection_id, wordBlobKey);
      } catch (e) {
        console.error("[submit] DB update report_docx_key failed (non-fatal):", e);
      }
    } catch (genErr) {
      const msg = genErr instanceof Error ? genErr.message : String(genErr);
      console.error("[submit] Word generation at submit failed (download link will generate on-demand):", msg);
      if (genErr instanceof Error && genErr.stack) console.error("[submit] stack:", genErr.stack);
      const existing = await get(inspection_id, event);
      if (existing) {
        await save(inspection_id, { ...existing, report_status: "failed" }, event);
      }
      logWordReport({ inspection_id, trigger: "submit", duration_ms: Date.now() - wordGenStart, result: "fail", error_message: msg });
    }
    if (wordReportGenerated) {
      logWordReport({ inspection_id, trigger: "submit", duration_ms: Date.now() - wordGenStart, result: "success", blob_key: wordBlobKey });
    }

    const baseUrlRaw = getBaseUrl(event);
    const baseUrl = baseUrlRaw && String(baseUrlRaw).startsWith("http") ? String(baseUrlRaw).replace(/\/$/, "") : "https://inspection.bhtechnology.com.au";
    
    // Extract address and technician name for email
    // Helper function to extract value from Answer object (handles nested Answer objects)
    const extractValue = (v: unknown): unknown => {
      if (v == null) return undefined;
      if (typeof v === "string" || typeof v === "number" || typeof v === "boolean") return v;
      if (typeof v === "object" && "value" in (v as object)) {
        const answerValue = (v as { value: unknown }).value;
        // If the value itself is an Answer object (nested), recursively extract
        if (typeof answerValue === "object" && answerValue !== null && "value" in (answerValue as object)) {
          return extractValue(answerValue);
        }
        return answerValue;
      }
      return undefined;
    };
    
    const address = (raw.job as Record<string, unknown>)?.address;
    const addressValue = extractValue(address) as string | undefined;
    
    const technicianName = (raw.signoff as Record<string, unknown>)?.technician_name;
    const technicianNameValue = extractValue(technicianName) as string | undefined;
    
    // Send email notification — 仅当 Word 已成功写入 Blob 时提供下载链接，否则不提供或指向“生成中/失败”页
    const reviewUrl = `${baseUrl}/review/${inspection_id}`;
    const downloadWordUrl = wordReportGenerated
      ? `${baseUrl}/api/downloadWord?inspection_id=${encodeURIComponent(inspection_id)}`
      : `${baseUrl}/review/${inspection_id}`;
    console.log("Email links (absolute) - download_word_url:", downloadWordUrl, "wordReportGenerated:", wordReportGenerated);
    console.log("Preparing to send email notification...");
    try {
      await sendEmailNotification({
        inspection_id,
        address: addressValue || "N/A",
        technician_name: technicianNameValue || "N/A",
        findings,
        limitations,
        review_url: reviewUrl,
        download_word_url: downloadWordUrl,
        created_at: (raw.created_at as string) || new Date().toISOString(),
        raw_data: raw, // Include full inspection data for manual review
      });
      console.log("Email notification sent successfully (handler complete)");
    } catch (emailErr) {
      console.error("Failed to send email (inspection still saved):", {
        error: emailErr instanceof Error ? emailErr.message : String(emailErr),
        stack: emailErr instanceof Error ? emailErr.stack : undefined,
      });
      // Don't fail the request — inspection was saved; email is best-effort
    }

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        inspection_id,
        status: "accepted",
        review_url: `/review/${inspection_id}`,
      }),
    };
  } catch (e) {
    console.error("Error processing inspection:", e);
    const errorMessage = e instanceof Error ? e.message : String(e);
    const errorStack = e instanceof Error ? e.stack : undefined;
    console.error("Error stack:", errorStack);
    return {
      statusCode: 500,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        error: "Internal server error",
        message: errorMessage,
        ...(process.env.NETLIFY_DEV && { stack: errorStack }),
      }),
    };
  }
};
