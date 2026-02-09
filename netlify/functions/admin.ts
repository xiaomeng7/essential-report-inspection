/**
 * Admin API: findings list (GET), set dimensions (POST), bulk dimensions, presets.
 * Route: /api/admin/* (add redirect in netlify.toml from /api/admin/* to this function so event.path is preserved).
 * Auth: Bearer ADMIN_TOKEN (same as configAdmin).
 */

import type { Handler, HandlerEvent, HandlerContext } from "@netlify/functions";
import { sql, isDbConfigured, getActiveDimensionsMetaMap } from "./lib/db";
import { has003Schema, getFindingDefinitionsMap, getEffectiveDimensionsMap, getOverrideHistory, getSeedDimensions } from "./lib/dbFindings";
import { getEffectiveFindingIndex, clearEffectiveFindingCache } from "./lib/getEffectiveFindingData";

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

  const path = (event.path || "").replace(/^\/api\/admin\/?/, "") || "findings";
  const segments = path.split("/").filter(Boolean);
  const method = event.httpMethod;
  const needsDb = method !== "GET" || (segments[0] !== "findings" || segments.length > 1);
  if (needsDb && !isDbConfigured()) {
    return json({ error: "Database not configured (NEON_DATABASE_URL)" }, 503);
  }

  try {
    if (segments[0] === "findings" && method === "GET" && segments.length === 1) {
      const params = event.queryStringParameters ?? {};
      const q = (params.q ?? "").trim();
      const system_group = (params.system_group ?? "").trim();
      const space_group = (params.space_group ?? "").trim();
      const tagsParam = (params.tags ?? params.tag ?? "").trim();
      const tagsFilter = tagsParam ? tagsParam.split(/[\s,]+/).filter(Boolean) : [];
      const priority = (params.priority ?? "").trim();
      const hasOverrides = params.hasOverrides === "true" || params.hasOverrides === "1";
      const missingCopy = params.missingCopy === "true" || params.missingCopy === "1";
      const page = Math.max(1, parseInt(params.page ?? "1", 10) || 1);
      const pageSize = Math.min(100, Math.max(1, parseInt(params.pageSize ?? "20", 10) || 20));
      const sort = (params.sort ?? "finding_id").trim() || "finding_id";
      const order = (params.order ?? "asc").toLowerCase() === "desc" ? "desc" : "asc";

      const index = await getEffectiveFindingIndex();
      let effectiveDimsMap = new Map<string, { dimensions_source: string; override_version: number | null }>();
      let defs003Map = new Map<string, { updated_at: Date }>();
      if (isDbConfigured()) {
        try {
          if (await has003Schema()) {
            const ed = await getEffectiveDimensionsMap();
            for (const [id, v] of ed) {
              effectiveDimsMap.set(id, { dimensions_source: v.dimensions_source, override_version: v.override_version });
            }
            const defs003 = await getFindingDefinitionsMap();
            for (const [id, row] of defs003) {
              defs003Map.set(id, { updated_at: row.updated_at });
            }
          } else {
            const legacyMeta = await getActiveDimensionsMetaMap();
            for (const [id, m] of legacyMeta) {
              const isOverride = m.version > 1 || (m.updated_by != null && m.updated_by !== "seed");
              effectiveDimsMap.set(id, { dimensions_source: isOverride ? "override" : "seed", override_version: isOverride ? m.version : null });
            }
          }
        } catch (_e) {
          /* ignore */
        }
      }

      const nonEmpty = (s: unknown) => s != null && String(s).trim() !== "";
      const copyStatus = (def: { title_en?: string | null; why_it_matters_en?: string | null; recommended_action_en?: string | null; planning_guidance_en?: string | null }) => ({
        has_title: nonEmpty(def.title_en) != null,
        has_why: nonEmpty(def.why_it_matters_en) != null,
        has_action: nonEmpty(def.recommended_action_en) != null,
        has_planning: nonEmpty(def.planning_guidance_en) != null,
      });

      let list = index.map((e) => {
        const meta = effectiveDimsMap.get(e.finding_id);
        const defMeta = defs003Map.get(e.finding_id);
        return {
          finding_id: e.finding_id,
          title: e.definition.title_en,
          system_group: e.definition.system_group ?? null,
          space_group: e.definition.space_group ?? null,
          tags: e.definition.tags ?? [],
          dimensions_effective: e.dimensions,
          dimensions_source: meta?.dimensions_source ?? "seed",
          override_version: meta?.override_version ?? null,
          copy_status: copyStatus(e.definition),
          updated_at: defMeta?.updated_at ?? null,
        };
      });

      if (q) {
        const qLower = q.toLowerCase();
        list = list.filter(
          (r) =>
            String(r.finding_id ?? "").toLowerCase().includes(qLower) ||
            String(r.title ?? "").toLowerCase().includes(qLower)
        );
      }
      if (system_group) list = list.filter((r) => r.system_group === system_group);
      if (space_group) list = list.filter((r) => r.space_group === space_group);
      for (const t of tagsFilter) {
        list = list.filter((r) => Array.isArray(r.tags) && r.tags.includes(t));
      }
      if (priority) {
        list = list.filter((r) => (r.dimensions_effective as { priority?: string }).priority === priority);
      }
      if (hasOverrides) {
        list = list.filter((r) => r.dimensions_source === "override");
      }
      if (missingCopy) {
        list = list.filter(
          (r) => !r.copy_status.has_title || !r.copy_status.has_why || !r.copy_status.has_action || !r.copy_status.has_planning
        );
      }

      const total = list.length;

      const sortKey = sort as keyof (typeof list)[0];
      list = [...list].sort((a, b) => {
        const av = a[sortKey as keyof typeof a];
        const bv = b[sortKey as keyof typeof b];
        if (av == null && bv == null) return 0;
        if (av == null) return order === "asc" ? 1 : -1;
        if (bv == null) return order === "asc" ? -1 : 1;
        const cmp = String(av).localeCompare(String(bv), undefined, { numeric: true });
        return order === "desc" ? -cmp : cmp;
      });

      const start = (page - 1) * pageSize;
      const items = list.slice(start, start + pageSize);

      const facets = {
        system_group: {} as Record<string, number>,
        space_group: {} as Record<string, number>,
        tags: {} as Record<string, number>,
        priority: {} as Record<string, number>,
      };
      for (const r of list) {
        const sg = r.system_group ?? "_";
        facets.system_group[sg] = (facets.system_group[sg] ?? 0) + 1;
        const sp = r.space_group ?? "_";
        facets.space_group[sp] = (facets.space_group[sp] ?? 0) + 1;
        const pr = (r.dimensions_effective as { priority?: string }).priority ?? "_";
        facets.priority[pr] = (facets.priority[pr] ?? 0) + 1;
        for (const t of r.tags ?? []) {
          facets.tags[t] = (facets.tags[t] ?? 0) + 1;
        }
      }

      return json({
        meta: { total, page, pageSize, totalPages: Math.ceil(total / pageSize) },
        facets,
        items,
      });
    }

    if (segments[0] === "findings" && segments[1] && segments[1] !== "bulkDimensions" && method === "GET" && segments.length >= 2) {
      const finding_id = decodeURIComponent(segments[1]);
      if (segments[2] !== "override" && segments[2] !== "dimensions") {
        if (!isDbConfigured()) return json({ error: "Database not configured" }, 503);
        try {
          if (!(await has003Schema())) {
            const effective = (await getEffectiveFindingIndex()).find((e) => e.finding_id === finding_id);
            if (!effective) return json({ error: "Not found" }, 404);
            return json({
              definition: effective.definition,
              dimensions_effective: effective.dimensions,
              dimensions_source: "seed",
              override_version: null,
              history: [],
            });
          }
          const defs = await getFindingDefinitionsMap();
          const def = defs.get(finding_id);
          if (!def) return json({ error: "Not found" }, 404);
          const effectiveMap = await getEffectiveDimensionsMap();
          const ed = effectiveMap.get(finding_id);
          const seed = await getSeedDimensions(finding_id);
          const historyRows = await getOverrideHistory(finding_id);
          const activeOverride = historyRows.find((r) => r.active);
          const history = historyRows.map((r) => ({
            version: r.version,
            active: r.active,
            dimensions: {
              safety: r.safety ?? undefined,
              urgency: r.urgency ?? undefined,
              liability: r.liability ?? undefined,
              budget_low: r.budget_low ?? undefined,
              budget_high: r.budget_high ?? undefined,
              priority: r.priority ?? undefined,
              severity: r.severity ?? undefined,
              likelihood: r.likelihood ?? undefined,
              escalation: r.escalation ?? undefined,
            },
            note: r.note ?? undefined,
            created_at: r.created_at != null ? String(r.created_at) : undefined,
          }));
          return json({
            definition: def,
            seed_dimensions: seed,
            active_override: activeOverride ? {
              version: activeOverride.version,
              dimensions: {
                safety: activeOverride.safety ?? undefined,
                urgency: activeOverride.urgency ?? undefined,
                liability: activeOverride.liability ?? undefined,
                budget_low: activeOverride.budget_low ?? undefined,
                budget_high: activeOverride.budget_high ?? undefined,
                priority: activeOverride.priority ?? undefined,
                severity: activeOverride.severity ?? undefined,
                likelihood: activeOverride.likelihood ?? undefined,
                escalation: activeOverride.escalation ?? undefined,
              },
              note: activeOverride.note ?? undefined,
              created_at: activeOverride.created_at != null ? String(activeOverride.created_at) : undefined,
            } : null,
            dimensions_effective: ed?.dimensions ?? seed ?? {},
            dimensions_source: ed?.dimensions_source ?? "seed",
            override_version: ed?.override_version ?? null,
            history,
          });
        } catch (e) {
          console.error(e);
          return json({ error: "Internal server error", message: e instanceof Error ? e.message : String(e) }, 500);
        }
      }
    }

    if (segments[0] === "findings" && segments[2] === "override" && segments[3] === "reset" && method === "POST") {
      const finding_id = decodeURIComponent(segments[1]);
      if (!finding_id || !isDbConfigured()) return json({ error: "Bad request or DB not configured" }, 400);
      try {
        if (await has003Schema()) {
          const q = sql();
          await q`UPDATE finding_custom_dimensions SET active = false WHERE finding_id = ${finding_id}`;
          clearEffectiveFindingCache();
          return json({ ok: true, finding_id, message: "Override reset; effective dimensions fall back to seed." });
        }
        const db = sql();
        await db`UPDATE finding_custom_dimensions SET is_active = false WHERE finding_id = ${finding_id}`;
        clearEffectiveFindingCache();
        return json({ ok: true, finding_id });
      } catch (e) {
        console.error(e);
        return json({ error: "Internal server error", message: e instanceof Error ? e.message : String(e) }, 500);
      }
    }

    if (segments[0] === "findings" && segments[2] === "override" && method === "POST") {
      const finding_id = decodeURIComponent(segments[1]);
      if (!finding_id) return json({ error: "finding_id required" }, 400);
      let body: Record<string, unknown> = {};
      try {
        body = JSON.parse(event.body ?? "{}");
      } catch {
        return json({ error: "Invalid JSON" }, 400);
      }
      const dimensions = (body.dimensions as Record<string, unknown>) ?? body;
      const note = (body.note as string) ?? "";
      const updated_by = (body.updated_by as string) ?? "admin";
      if (!isDbConfigured()) return json({ error: "Database not configured" }, 503);
      try {
        if (await has003Schema()) {
          const q = sql();
          const prev = await q`SELECT COALESCE(MAX(version), 0) + 1 as v FROM finding_custom_dimensions WHERE finding_id = ${finding_id}`;
          const version = Number((prev[0] as { v: number })?.v) || 1;
          await q`UPDATE finding_custom_dimensions SET active = false WHERE finding_id = ${finding_id}`;
          await q`
            INSERT INTO finding_custom_dimensions (finding_id, version, active, safety, urgency, liability, budget_low, budget_high, priority, severity, likelihood, escalation, note, updated_by, created_at)
            VALUES (${finding_id}, ${version}, true,
              ${(dimensions.safety as string) ?? null}, ${(dimensions.urgency as string) ?? null}, ${(dimensions.liability as string) ?? null},
              ${dimensions.budget_low != null ? Number(dimensions.budget_low) : null}, ${dimensions.budget_high != null ? Number(dimensions.budget_high) : null},
              ${(dimensions.priority as string) ?? null}, ${dimensions.severity != null ? Number(dimensions.severity) : null},
              ${dimensions.likelihood != null ? Number(dimensions.likelihood) : null}, ${(dimensions.escalation as string) ?? null},
              ${note}, ${updated_by}, now())
          `;
          clearEffectiveFindingCache();
          return json({ ok: true, finding_id, new_version: version });
        }
      } catch (e) {
        console.error(e);
        return json({ error: "Internal server error", message: e instanceof Error ? e.message : String(e) }, 500);
      }
    }

    if (segments[0] === "findings" && segments[1] === "bulk" && method === "POST") {
      let body: { filter?: Record<string, unknown>; dimensions?: Record<string, unknown>; note?: string; updated_by?: string } = {};
      try {
        body = JSON.parse(event.body ?? "{}");
      } catch {
        return json({ error: "Invalid JSON" }, 400);
      }
      const filter = body.filter ?? {};
      const dimensions = body.dimensions ?? {};
      const note = (body.note as string) ?? "Bulk update";
      const updated_by = (body.updated_by as string) ?? "admin";
      if (!isDbConfigured()) return json({ error: "Database not configured" }, 503);
      try {
        const index = await getEffectiveFindingIndex();
        let findingIds = index.map((e) => e.finding_id);
        if (filter.system_group) findingIds = findingIds.filter((id) => index.find((e) => e.finding_id === id)?.definition.system_group === filter.system_group);
        if (filter.space_group) findingIds = findingIds.filter((id) => index.find((e) => e.finding_id === id)?.definition.space_group === filter.space_group);
        if (filter.priority) findingIds = findingIds.filter((id) => index.find((e) => e.finding_id === id)?.dimensions.priority === filter.priority);
        if (await has003Schema()) {
          const q = sql();
          let updated = 0;
          for (const finding_id of findingIds) {
            const prev = await q`SELECT COALESCE(MAX(version), 0) + 1 as v FROM finding_custom_dimensions WHERE finding_id = ${finding_id}`;
            const version = Number((prev[0] as { v: number })?.v) || 1;
            await q`UPDATE finding_custom_dimensions SET active = false WHERE finding_id = ${finding_id}`;
            await q`
              INSERT INTO finding_custom_dimensions (finding_id, version, active, safety, urgency, liability, budget_low, budget_high, priority, severity, likelihood, escalation, note, updated_by, created_at)
              VALUES (${finding_id}, ${version}, true,
                ${(dimensions.safety as string) ?? null}, ${(dimensions.urgency as string) ?? null}, ${(dimensions.liability as string) ?? null},
                ${dimensions.budget_low != null ? Number(dimensions.budget_low) : null}, ${dimensions.budget_high != null ? Number(dimensions.budget_high) : null},
                ${(dimensions.priority as string) ?? null}, ${dimensions.severity != null ? Number(dimensions.severity) : null},
                ${dimensions.likelihood != null ? Number(dimensions.likelihood) : null}, ${(dimensions.escalation as string) ?? null},
                ${note}, ${updated_by}, now())
            `;
            updated++;
          }
          clearEffectiveFindingCache();
          return json({ ok: true, updated });
        }
        return json({ error: "Bulk requires 003 schema" }, 400);
      } catch (e) {
        console.error(e);
        return json({ error: "Internal server error", message: e instanceof Error ? e.message : String(e) }, 500);
      }
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
      if (isDbConfigured()) {
        try {
          if (await has003Schema()) {
            const dimensions = body;
            const note = (body.note as string) ?? "";
            const updated_by = (body.updated_by as string) ?? "admin";
            const q = sql();
            const prev = await q`SELECT COALESCE(MAX(version), 0) + 1 as v FROM finding_custom_dimensions WHERE finding_id = ${finding_id}`;
            const version = Number((prev[0] as { v: number })?.v) || 1;
            await q`UPDATE finding_custom_dimensions SET active = false WHERE finding_id = ${finding_id}`;
            await q`
              INSERT INTO finding_custom_dimensions (finding_id, version, active, safety, urgency, liability, budget_low, budget_high, priority, severity, likelihood, escalation, note, updated_by, created_at)
              VALUES (${finding_id}, ${version}, true,
                ${(dimensions.safety as string) ?? null}, ${(dimensions.urgency as string) ?? null}, ${(dimensions.liability as string) ?? null},
                ${dimensions.budget_low != null ? Number(dimensions.budget_low) : null}, ${dimensions.budget_high != null ? Number(dimensions.budget_high) : null},
                ${(dimensions.priority as string) ?? null}, ${dimensions.severity != null ? Number(dimensions.severity) : null},
                ${dimensions.likelihood != null ? Number(dimensions.likelihood) : null}, ${(dimensions.escalation as string) ?? null},
                ${note}, ${updated_by}, now())
            `;
            clearEffectiveFindingCache();
            return json({ ok: true, finding_id, version });
          }
        } catch (e) {
          console.error(e);
          return json({ error: "Internal server error", message: e instanceof Error ? e.message : String(e) }, 500);
        }
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
      clearEffectiveFindingCache();
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
      if (isDbConfigured()) {
        try {
          if (await has003Schema()) {
            const q = sql();
            let dims: Record<string, unknown> = body.dimensions ?? {};
            if (body.preset_id) {
              const presets = await q`SELECT * FROM dimension_presets WHERE id = ${body.preset_id}`;
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
              const prev = await q`SELECT COALESCE(MAX(version), 0) + 1 as v FROM finding_custom_dimensions WHERE finding_id = ${finding_id}`;
              const version = Number((prev[0] as { v: number })?.v) || 1;
              await q`UPDATE finding_custom_dimensions SET active = false WHERE finding_id = ${finding_id}`;
              await q`
                INSERT INTO finding_custom_dimensions (finding_id, version, active, safety, urgency, liability, budget_low, budget_high, priority, severity, likelihood, escalation, note, updated_by, created_at)
                VALUES (${finding_id}, ${version}, true,
                  ${(dims.safety as string) ?? null}, ${(dims.urgency as string) ?? null}, ${(dims.liability as string) ?? null},
                  ${dims.budget_low != null ? Number(dims.budget_low) : null}, ${dims.budget_high != null ? Number(dims.budget_high) : null},
                  ${(dims.priority as string) ?? null}, ${dims.severity != null ? Number(dims.severity) : null},
                  ${dims.likelihood != null ? Number(dims.likelihood) : null}, ${(dims.escalation as string) ?? null},
                  'Bulk apply', 'bulk', now())
              `;
              updated++;
            }
            clearEffectiveFindingCache();
            return json({ ok: true, updated });
          }
        } catch (e) {
          console.error(e);
          return json({ error: "Internal server error", message: e instanceof Error ? e.message : String(e) }, 500);
        }
      }
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
      clearEffectiveFindingCache();
      return json({ ok: true, updated });
    }

    if (segments[0] === "dimensions" && segments[1] === "presets" && method === "GET") {
      const db = sql();
      const presets = await db`SELECT id, name, safety, urgency, liability, budget_low, budget_high, priority, severity, likelihood, escalation, created_at FROM dimension_presets ORDER BY name`;
      return json({ presets });
    }

    // Publish finding messages: copy draft to published
    if (segments[0] === "findings" && segments[1] === "messages" && segments[2] === "publish" && method === "POST") {
      if (!isDbConfigured()) {
        return json({ error: "Database not configured" }, 503);
      }
      let body: { version?: string; finding_ids?: string[]; lang?: string } = {};
      try {
        body = JSON.parse(event.body ?? "{}");
      } catch {
        return json({ error: "Invalid JSON" }, 400);
      }
      const version = (body.version ?? "").trim() || new Date().toISOString().split("T")[0]; // Default to today's date
      const findingIds = body.finding_ids ?? []; // Empty = all drafts
      const lang = (body.lang ?? "en-AU").trim();

      try {
        const q = sql();
        let published = 0;
        let skipped = 0;
        let errors: string[] = [];

        // Get draft messages to publish
        let draftQuery = q`
          SELECT finding_id, lang, title, observed_condition, why_it_matters, recommended_action,
                 planning_guidance, priority_rationale, risk_interpretation, disclaimer_line, source
          FROM finding_messages
          WHERE status = 'draft' AND lang = ${lang} AND is_active = true
        `;
        
        if (findingIds.length > 0) {
          draftQuery = q`
            SELECT finding_id, lang, title, observed_condition, why_it_matters, recommended_action,
                   planning_guidance, priority_rationale, risk_interpretation, disclaimer_line, source
            FROM finding_messages
            WHERE status = 'draft' AND lang = ${lang} AND finding_id = ANY(${findingIds}) AND is_active = true
          `;
        }

        const drafts = await draftQuery;

        for (const draft of drafts) {
          const findingId = draft.finding_id as string;
          try {
            // Upsert: copy draft to published (replace if exists)
            await q`
              INSERT INTO finding_messages (
                finding_id, lang, title, observed_condition, why_it_matters, recommended_action,
                planning_guidance, priority_rationale, risk_interpretation, disclaimer_line, source,
                status, version, updated_at, updated_by, is_active
              )
              VALUES (
                ${findingId}, ${lang}, ${draft.title}, ${draft.observed_condition}, ${draft.why_it_matters}, ${draft.recommended_action},
                ${draft.planning_guidance}, ${draft.priority_rationale}, ${draft.risk_interpretation}, ${draft.disclaimer_line}, ${draft.source},
                'published', ${version}, now(), 'admin', true
              )
              ON CONFLICT (finding_id, lang, status) DO UPDATE SET
                title = EXCLUDED.title,
                observed_condition = EXCLUDED.observed_condition,
                why_it_matters = EXCLUDED.why_it_matters,
                recommended_action = EXCLUDED.recommended_action,
                planning_guidance = EXCLUDED.planning_guidance,
                priority_rationale = EXCLUDED.priority_rationale,
                risk_interpretation = EXCLUDED.risk_interpretation,
                disclaimer_line = EXCLUDED.disclaimer_line,
                source = EXCLUDED.source,
                version = EXCLUDED.version,
                updated_at = EXCLUDED.updated_at,
                updated_by = EXCLUDED.updated_by,
                is_active = EXCLUDED.is_active
            `;
            published++;
          } catch (e) {
            errors.push(`${findingId}: ${e instanceof Error ? e.message : String(e)}`);
            skipped++;
          }
        }

        return json({
          ok: true,
          version,
          lang,
          published,
          skipped,
          total_drafts: drafts.length,
          errors: errors.length > 0 ? errors : undefined,
        });
      } catch (e) {
        console.error("Publish messages error:", e);
        return json({ error: "Internal server error", message: e instanceof Error ? e.message : String(e) }, 500);
      }
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
