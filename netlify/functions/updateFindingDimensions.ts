/**
 * Admin endpoint: update 9 dimensions for a finding with versioning.
 * POST body: { finding_id, dimensions: { safety, urgency, liability, budget_low, budget_high, priority, severity, likelihood, escalation }, updated_by }
 * Inserts new row with version = max(version)+1, is_active=true; sets previous rows is_active=false.
 */

import type { Handler, HandlerEvent, HandlerContext } from "@netlify/functions";
import { sql, isDbConfigured } from "./lib/db";
import { clearEffectiveFindingCache } from "./lib/getEffectiveFindingData";

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

type DimensionsInput = {
  safety?: string;
  urgency?: string;
  liability?: string;
  budget_low?: number;
  budget_high?: number;
  priority?: string;
  severity?: number;
  likelihood?: number;
  escalation?: string;
};

export const handler: Handler = async (event: HandlerEvent, _ctx: HandlerContext) => {
  if (event.httpMethod !== "POST") {
    return json({ error: "Method not allowed" }, 405);
  }
  if (!checkAuth(event)) {
    return json({ error: "Unauthorized" }, 401);
  }
  if (!isDbConfigured()) {
    return json({ error: "Database not configured (NEON_DATABASE_URL)" }, 503);
  }

  let body: { finding_id?: string; dimensions?: DimensionsInput; updated_by?: string } = {};
  try {
    body = JSON.parse(event.body ?? "{}");
  } catch {
    return json({ error: "Invalid JSON" }, 400);
  }
  const finding_id = body.finding_id;
  const dimensions = body.dimensions ?? {};
  const updated_by = body.updated_by ?? "admin";

  if (!finding_id || typeof finding_id !== "string" || !finding_id.trim()) {
    return json({ error: "finding_id is required" }, 400);
  }

  try {
    const q = sql();
    const prev = await q`
      SELECT COALESCE(MAX(version), 0) + 1 as v FROM finding_custom_dimensions WHERE finding_id = ${finding_id}
    `;
    const version = Number((prev[0] as { v: number })?.v) || 1;
    await q`UPDATE finding_custom_dimensions SET active = false WHERE finding_id = ${finding_id} AND status = 'draft'`;
    await q`
      INSERT INTO finding_custom_dimensions (
        finding_id, version, active,
        safety, urgency, liability, budget_low, budget_high, priority, severity, likelihood, escalation,
        note, updated_by, status, updated_at
      ) VALUES (
        ${finding_id}, ${version}, true,
        ${dimensions.safety ?? null}, ${dimensions.urgency ?? null}, ${dimensions.liability ?? null},
        ${dimensions.budget_low != null ? Number(dimensions.budget_low) : null},
        ${dimensions.budget_high != null ? Number(dimensions.budget_high) : null},
        ${dimensions.priority ?? null},
        ${dimensions.severity != null ? Number(dimensions.severity) : null},
        ${dimensions.likelihood != null ? Number(dimensions.likelihood) : null},
        ${dimensions.escalation ?? null},
        '', ${updated_by}, 'draft', now()
      )
    `;
    const inserted = await q`
      SELECT id, finding_id, version, active, safety, urgency, liability, budget_low, budget_high,
             priority, severity, likelihood, escalation, note, updated_by, status, updated_at
      FROM finding_custom_dimensions
      WHERE finding_id = ${finding_id} AND active = true AND status = 'draft'
    `;
    const row = inserted[0];
    clearEffectiveFindingCache();
    return json({ ok: true, row });
  } catch (e) {
    console.error("[updateFindingDimensions]", e);
    return json(
      { error: "Internal server error", message: e instanceof Error ? e.message : String(e) },
      500
    );
  }
};
