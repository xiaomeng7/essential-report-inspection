/**
 * Admin endpoint: list findings with filters and pagination, returning effective data.
 * GET query params: system_group, space_group, tag, q (search finding_id/title_en),
 *   missing_copy (true/false), missing_dims (true/false), limit, offset.
 */

import type { Handler, HandlerEvent, HandlerContext } from "@netlify/functions";
import { getEffectiveFindingIndex } from "./lib/getEffectiveFindingData";

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

function nonEmpty(s: unknown): boolean {
  return s != null && String(s).trim() !== "";
}

export const handler: Handler = async (event: HandlerEvent, _ctx: HandlerContext) => {
  if (event.httpMethod !== "GET") {
    return json({ error: "Method not allowed" }, 405);
  }
  if (!checkAuth(event)) {
    return json({ error: "Unauthorized" }, 401);
  }

  const q = event.queryStringParameters?.q ?? "";
  const system_group = event.queryStringParameters?.system_group ?? "";
  const space_group = event.queryStringParameters?.space_group ?? "";
  const tag = event.queryStringParameters?.tag ?? "";
  const missing_copy = event.queryStringParameters?.missing_copy === "true";
  const missing_dims = event.queryStringParameters?.missing_dims === "true";
  const limit = Math.min(100, Math.max(1, parseInt(event.queryStringParameters?.limit ?? "50", 10) || 50));
  const offset = Math.max(0, parseInt(event.queryStringParameters?.offset ?? "0", 10) || 0);

  try {
    const index = await getEffectiveFindingIndex();
    let list = index.map((e) => ({
      finding_id: e.finding_id,
      title_en: e.definition.title_en,
      title_zh: e.definition.title_zh,
      why_it_matters_en: e.definition.why_it_matters_en,
      recommended_action_en: e.definition.recommended_action_en,
      planning_guidance_en: e.definition.planning_guidance_en,
      system_group: e.definition.system_group,
      space_group: e.definition.space_group,
      tags: e.definition.tags,
      safety: e.dimensions.safety,
      urgency: e.dimensions.urgency,
      liability: e.dimensions.liability,
      budget_low: e.dimensions.budget_low,
      budget_high: e.dimensions.budget_high,
      priority: e.dimensions.priority,
      severity: e.dimensions.severity,
      likelihood: e.dimensions.likelihood,
      escalation: e.dimensions.escalation,
    }));

    if (q.trim()) {
      const qLower = q.trim().toLowerCase();
      list = list.filter(
        (r) =>
          r.finding_id.toLowerCase().includes(qLower) ||
          (r.title_en && r.title_en.toLowerCase().includes(qLower))
      );
    }
    if (system_group) list = list.filter((r) => r.system_group === system_group);
    if (space_group) list = list.filter((r) => r.space_group === space_group);
    if (tag) list = list.filter((r) => Array.isArray(r.tags) && r.tags.includes(tag));
    if (missing_copy) {
      list = list.filter(
        (r) =>
          !nonEmpty(r.title_en) ||
          !nonEmpty(r.why_it_matters_en) ||
          !nonEmpty(r.recommended_action_en)
      );
    }
    if (missing_dims) {
      list = list.filter(
        (r) =>
          r.priority == null ||
          r.safety == null ||
          r.severity == null ||
          r.likelihood == null
      );
    }

    const total = list.length;
    const page = list.slice(offset, offset + limit);
    return json({ findings: page, total, limit, offset });
  } catch (e) {
    console.error("[listFindings]", e);
    return json(
      { error: "Internal server error", message: e instanceof Error ? e.message : String(e) },
      500
    );
  }
};
