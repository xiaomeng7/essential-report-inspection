/**
 * Admin API: Export inspection in different formats (json, serviceM8).
 * Route: /api/admin/inspections/:inspection_id/export (add redirect in netlify.toml).
 * Auth: Bearer ADMIN_TOKEN (same as admin.ts).
 */

import type { Handler, HandlerEvent, HandlerContext } from "@netlify/functions";
import { sql, isDbConfigured } from "./lib/db";

function checkAuth(event: HandlerEvent): boolean {
  const auth = event.headers.authorization || event.headers.Authorization;
  const token = process.env.ADMIN_TOKEN || "admin-secret-token-change-me";
  return auth === `Bearer ${token}`;
}

function json(body: unknown, status = 200) {
  return {
    statusCode: status,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  };
}

export const handler: Handler = async (event: HandlerEvent, _ctx: HandlerContext) => {
  if (!checkAuth(event)) {
    return json({ error: "Unauthorized" }, 401);
  }

  if (event.httpMethod !== "GET") {
    return json({ error: "Method not allowed" }, 405);
  }

  if (!isDbConfigured()) {
    return json({ error: "Database not configured (NEON_DATABASE_URL)" }, 503);
  }

  try {
    const path = event.path ?? "";
    const match = /inspections\/([^/]+)\/export/.exec(path) || /admin\/inspections\/([^/]+)\/export/.exec(path);
    const inspection_id = match?.[1];

    if (!inspection_id) {
      return json({ error: "Missing inspection_id" }, 400);
    }

    const params = event.queryStringParameters ?? {};
    const format = (params.format ?? "json").toLowerCase();

    if (format !== "json" && format !== "servicem8") {
      return json({ error: "Invalid format. Supported: json, serviceM8" }, 400);
    }

    const db = sql();

    // Get inspection row
    const inspectionRows = await db`
      SELECT 
        inspection_id,
        created_at,
        updated_at,
        assessment_date,
        prepared_for,
        prepared_by,
        property_address,
        property_type,
        overall_status,
        risk_rating,
        capex_low,
        capex_high,
        source,
        raw_json
      FROM inspections
      WHERE inspection_id = ${inspection_id}
    `;

    if (inspectionRows.length === 0) {
      return json({ error: "Inspection not found" }, 404);
    }

    const inspection = inspectionRows[0];

    // Get findings
    const findings = await db`
      SELECT 
        finding_id,
        priority,
        is_custom,
        created_at
      FROM inspection_findings
      WHERE inspection_id = ${inspection_id}
      ORDER BY created_at ASC
    `;

    // Get photos
    const photos = await db`
      SELECT 
        photo_id,
        finding_id,
        room_name,
        caption,
        blob_key,
        created_at
      FROM inspection_photos
      WHERE inspection_id = ${inspection_id}
      ORDER BY created_at ASC
    `;

    // Get tasks
    const tasks = await db`
      SELECT 
        id,
        finding_id,
        task_type,
        due_date,
        status,
        budget_low,
        budget_high,
        notes,
        created_at
      FROM inspection_tasks
      WHERE inspection_id = ${inspection_id}
      ORDER BY created_at ASC
    `;

    if (format === "json") {
      // Full JSON export with DB + raw_json
      return json({
        inspection: {
          inspection_id: inspection.inspection_id,
          created_at: inspection.created_at ? new Date(inspection.created_at).toISOString() : null,
          updated_at: inspection.updated_at ? new Date(inspection.updated_at).toISOString() : null,
          assessment_date: inspection.assessment_date ? new Date(inspection.assessment_date).toISOString().split('T')[0] : null,
          prepared_for: inspection.prepared_for,
          prepared_by: inspection.prepared_by,
          property_address: inspection.property_address,
          property_type: inspection.property_type,
          overall_status: inspection.overall_status,
          risk_rating: inspection.risk_rating,
          capex_low: inspection.capex_low,
          capex_high: inspection.capex_high,
          source: inspection.source,
          raw_json: inspection.raw_json,
        },
        findings: findings.map((f) => ({
          finding_id: f.finding_id,
          priority: f.priority,
          is_custom: f.is_custom,
          created_at: f.created_at ? new Date(f.created_at).toISOString() : null,
        })),
        photos: photos.map((p) => ({
          photo_id: p.photo_id,
          finding_id: p.finding_id,
          room_name: p.room_name,
          caption: p.caption,
          blob_key: p.blob_key,
          created_at: p.created_at ? new Date(p.created_at).toISOString() : null,
        })),
        tasks: tasks.map((t) => ({
          id: t.id,
          finding_id: t.finding_id,
          task_type: t.task_type,
          due_date: t.due_date ? new Date(t.due_date).toISOString().split('T')[0] : null,
          status: t.status,
          budget_low: t.budget_low,
          budget_high: t.budget_high,
          notes: t.notes,
          created_at: t.created_at ? new Date(t.created_at).toISOString() : null,
        })),
      });
    }

    // serviceM8 format: simple mapping with customer fields, address, notes, recommended tasks
    const serviceM8Data = {
      customer: {
        name: inspection.prepared_for || "N/A",
        address: inspection.property_address || "N/A",
        property_type: inspection.property_type || "N/A",
      },
      inspection: {
        inspection_id: inspection.inspection_id,
        assessment_date: inspection.assessment_date ? new Date(inspection.assessment_date).toISOString().split('T')[0] : null,
        prepared_by: inspection.prepared_by || "N/A",
        overall_status: inspection.overall_status || "N/A",
        risk_rating: inspection.risk_rating || "N/A",
      },
      notes: inspection.raw_json ? JSON.stringify(inspection.raw_json, null, 2) : "",
      recommended_tasks: tasks
        .filter((t) => t.status === "open" || t.status === "scheduled")
        .map((t) => ({
          task_id: t.id,
          finding_id: t.finding_id,
          task_type: t.task_type,
          due_date: t.due_date ? new Date(t.due_date).toISOString().split('T')[0] : null,
          status: t.status,
          budget_low: t.budget_low,
          budget_high: t.budget_high,
          notes: t.notes || "",
        })),
    };

    return json(serviceM8Data);
  } catch (e) {
    console.error("[adminExportInspection] Error:", e);
    return json(
      {
        error: "Failed to export inspection",
        message: e instanceof Error ? e.message : String(e),
      },
      500
    );
  }
};
