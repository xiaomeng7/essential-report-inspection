/**
 * Admin API: findings list (GET), set dimensions (POST), bulk dimensions, presets.
 * Route: /api/admin/* (add redirect in netlify.toml from /api/admin/* to this function so event.path is preserved).
 * Auth: Bearer ADMIN_TOKEN (same as configAdmin).
 */

import type { Handler, HandlerEvent, HandlerContext } from "@netlify/functions";
import { getDb, sql, isDbConfigured } from "./lib/db";

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

  if (!isDbConfigured()) {
    return json({ error: "Database not configured (NEON_DATABASE_URL)" }, 503);
  }

  const path = (event.path || "").replace(/^\/api\/admin\/?/, "") || "findings";
  const segments = path.split("/").filter(Boolean);
  const method = event.httpMethod;

  try {
    if (segments[0] === "findings" && method === "GET") {
      const q = event.queryStringParameters?.query ?? "";
      const system_group = event.queryStringParameters?.system_group ?? "";
      const space_group = event.queryStringParameters?.space_group ?? "";
      const tag = event.queryStringParameters?.tag ?? "";
      const db = sql();
      let list = await db`
        SELECT fd.finding_id, fd.title_en, fd.system_group, fd.space_group, fd.tags,
               fcd.safety, fcd.urgency, fcd.liability, fcd.budget_low, fcd.budget_high, fcd.priority,
               fcd.severity, fcd.likelihood, fcd.escalation, fcd.needs_review, fcd.version, fcd.is_active
        FROM finding_definitions fd
        LEFT JOIN finding_custom_dimensions fcd ON fcd.finding_id = fd.finding_id AND fcd.is_active = true
        WHERE fd.is_active = true
      `;
      if (q.trim()) {
        const qq = `%${q.trim().toLowerCase()}%`;
        list = list.filter(
          (r: Record<string, unknown>) =>
            String(r.finding_id ?? "").toLowerCase().includes(q.trim().toLowerCase()) ||
            String(r.title_en ?? "").toLowerCase().includes(qq)
        );
      }
      if (system_group) {
        list = list.filter((r: Record<string, unknown>) => r.system_group === system_group);
      }
      if (space_group) {
        list = list.filter((r: Record<string, unknown>) => r.space_group === space_group);
      }
      if (tag) {
        list = list.filter(
          (r: Record<string, unknown>) => Array.isArray(r.tags) && (r.tags as string[]).includes(tag)
        );
      }
      return json({ findings: list });
    }

    if (segments[0] === "findings" && segments[2] === "dimensions" && method === "POST") {
      const finding_id = segments[1];
      if (!finding_id) return json({ error: "finding_id required" }, 400);
      let body: Record<string, unknown> = {};
      try {
        body = JSON.parse(event.body ?? "{}");
      } catch {
        return json({ error: "Invalid JSON" }, 400);
      }
      const db = sql();
      const prev = await db`
        SELECT COALESCE(MAX(version), 0) + 1 as v FROM finding_custom_dimensions WHERE finding_id = ${finding_id}
      `;
      const version = Number((prev[0] as { v: number })?.v) || 1;
      await db`UPDATE finding_custom_dimensions SET is_active = false WHERE finding_id = ${finding_id}`;
      await db`
        INSERT INTO finding_custom_dimensions (
          finding_id, version, is_active,
          safety, urgency, liability, budget_low, budget_high, priority, severity, likelihood, escalation,
          needs_review, updated_by, updated_at
        ) VALUES (
          ${finding_id}, ${version}, true,
          ${(body.safety as string) ?? null}, ${(body.urgency as string) ?? null}, ${(body.liability as string) ?? null},
          ${body.budget_low != null ? Number(body.budget_low) : null}, ${body.budget_high != null ? Number(body.budget_high) : null},
          ${(body.priority as string) ?? null}, ${body.severity != null ? Number(body.severity) : null},
          ${body.likelihood != null ? Number(body.likelihood) : null}, ${(body.escalation as string) ?? null},
          ${Boolean(body.needs_review)}, ${(body.updated_by as string) ?? null}, now()
        )
      `;
      return json({ ok: true, finding_id, version });
    }

    if (segments[0] === "findings" && segments[1] === "bulkDimensions" && method === "POST") {
      let body: { finding_ids?: string[]; preset_id?: string; dimensions?: Record<string, unknown> } = {};
      try {
        body = JSON.parse(event.body ?? "{}");
      } catch {
        return json({ error: "Invalid JSON" }, 400);
      }
      const finding_ids = body.finding_ids ?? [];
      if (finding_ids.length === 0) return json({ error: "finding_ids required" }, 400);
      const db = sql();
      let dims: Record<string, unknown> = body.dimensions ?? {};
      if (body.preset_id) {
        const presets = await db`SELECT * FROM dimension_presets WHERE id = ${body.preset_id}`;
        if (presets.length > 0) {
          const p = presets[0] as Record<string, unknown>;
          dims = {
            safety: p.safety,
            urgency: p.urgency,
            liability: p.liability,
            budget_low: p.budget_low,
            budget_high: p.budget_high,
            priority: p.priority,
            severity: p.severity,
            likelihood: p.likelihood,
            escalation: p.escalation,
          };
        }
      }
      let updated = 0;
      for (const finding_id of finding_ids) {
        const prev = await db`
          SELECT COALESCE(MAX(version), 0) + 1 as v FROM finding_custom_dimensions WHERE finding_id = ${finding_id}
        `;
        const version = Number((prev[0] as { v: number })?.v) || 1;
        await db`UPDATE finding_custom_dimensions SET is_active = false WHERE finding_id = ${finding_id}`;
        await db`
          INSERT INTO finding_custom_dimensions (
            finding_id, version, is_active,
            safety, urgency, liability, budget_low, budget_high, priority, severity, likelihood, escalation,
            needs_review, updated_by, updated_at
          ) VALUES (
            ${finding_id}, ${version}, true,
            ${(dims.safety as string) ?? null}, ${(dims.urgency as string) ?? null}, ${(dims.liability as string) ?? null},
            ${dims.budget_low != null ? Number(dims.budget_low) : null}, ${dims.budget_high != null ? Number(dims.budget_high) : null},
            ${(dims.priority as string) ?? null}, ${dims.severity != null ? Number(dims.severity) : null},
            ${dims.likelihood != null ? Number(dims.likelihood) : null}, ${(dims.escalation as string) ?? null},
            false, 'bulk', now()
          )
        `;
        updated++;
      }
      return json({ ok: true, updated });
    }

    if (segments[0] === "dimensions" && segments[1] === "presets" && method === "GET") {
      const db = sql();
      const presets = await db`SELECT id, name, safety, urgency, liability, budget_low, budget_high, priority, severity, likelihood, escalation, created_at FROM dimension_presets ORDER BY name`;
      return json({ presets });
    }

    return json({ error: "Not found", path, method }, 404);
  } catch (e) {
    console.error("Admin API error:", e);
    return json(
      { error: "Internal server error", message: e instanceof Error ? e.message : String(e) },
      500
    );
  }
};
