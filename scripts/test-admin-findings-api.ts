/**
 * Unit tests for GET /api/admin/findings filtering, pagination, and response shape.
 * Run: npx tsx scripts/test-admin-findings-api.ts  or  npm run test:admin-findings-api
 *
 * Tests filter/sort/paginate logic and response structure (meta, facets, items) without requiring DB.
 */

import { handler } from "../netlify/functions/admin";

type HandlerEvent = {
  path: string;
  httpMethod: string;
  headers: Record<string, string>;
  queryStringParameters: Record<string, string> | null;
  body: string | null;
};

function createEvent(params: Record<string, string>, auth = true): HandlerEvent {
  return {
    path: "/api/admin/findings",
    httpMethod: "GET",
    headers: auth ? { authorization: "Bearer admin-secret-token-change-me" } : {},
    queryStringParameters: params,
    body: null,
  };
}

async function runTests(): Promise<void> {
  console.log("=== GET /api/admin/findings: response shape ===\n");

  const res = await handler(createEvent({}), {} as any, () => {}) as { statusCode: number; body: string };
  if (res.statusCode !== 200) {
    throw new Error(`Expected 200, got ${res.statusCode}: ${res.body}`);
  }
  const data = JSON.parse(res.body) as {
    meta?: { total: number; page: number; pageSize: number; totalPages: number };
    facets?: { system_group?: Record<string, number>; space_group?: Record<string, number>; tags?: Record<string, number>; priority?: Record<string, number> };
    items?: unknown[];
  };

  if (!data.meta || typeof data.meta.total !== "number" || data.meta.page === undefined || data.meta.pageSize === undefined || data.meta.totalPages === undefined) {
    throw new Error("Response must include meta: { total, page, pageSize, totalPages }");
  }
  console.log("  ✓ meta present with total, page, pageSize, totalPages");

  if (!data.facets || !data.facets.system_group || !data.facets.space_group || !data.facets.tags || !data.facets.priority) {
    throw new Error("Response must include facets: { system_group, space_group, tags, priority }");
  }
  console.log("  ✓ facets present");

  if (!Array.isArray(data.items)) {
    throw new Error("Response must include items array");
  }
  console.log("  ✓ items array present");

  if (data.items.length > 0) {
    const item = data.items[0] as Record<string, unknown>;
    if (item.dimensions_effective == null) throw new Error("Each item must include dimensions_effective");
    if (item.dimensions_source !== "seed" && item.dimensions_source !== "override") throw new Error("Each item must include dimensions_source (seed|override)");
    const cs = item.copy_status as Record<string, boolean> | undefined;
    if (!cs || typeof cs.has_title !== "boolean" || typeof cs.has_why !== "boolean" || typeof cs.has_action !== "boolean" || typeof cs.has_planning !== "boolean") {
      throw new Error("Each item must include copy_status: { has_title, has_why, has_action, has_planning }");
    }
    if (item.title === undefined) throw new Error("Each item must include title");
    if (item.updated_at !== undefined && item.updated_at !== null && typeof item.updated_at !== "string") throw new Error("item.updated_at must be string or null");
    console.log("  ✓ item shape: dimensions_effective, dimensions_source, copy_status object, title, updated_at");
  }

  console.log("\n=== GET /api/admin/findings: filtering ===\n");

  const resQ = await handler(createEvent({ q: "SWITCHBOARD" }), {} as any, () => {}) as { statusCode: number; body: string };
  const dataQ = JSON.parse(resQ.body) as { items?: { finding_id: string }[] };
  if (dataQ.items && dataQ.items.length > 0) {
    const allMatch = dataQ.items.every((i) => i.finding_id.toUpperCase().includes("SWITCHBOARD"));
    if (!allMatch) throw new Error("Filter q=SWITCHBOARD should only return findings containing SWITCHBOARD");
    console.log("  ✓ q=SWITCHBOARD filters by finding_id/title");
  }

  const resPg = await handler(createEvent({ page: "2", pageSize: "5" }), {} as any, () => {}) as { statusCode: number; body: string };
  const dataPg = JSON.parse(resPg.body) as { meta: { page: number; pageSize: number }; items: unknown[] };
  if (dataPg.meta.page !== 2 || dataPg.meta.pageSize !== 5) {
    throw new Error("page=2 pageSize=5 should set meta.page=2, meta.pageSize=5");
  }
  if (dataPg.items.length > 5) {
    throw new Error("pageSize=5 should return at most 5 items");
  }
  console.log("  ✓ page and pageSize applied");

  const resSystem = await handler(createEvent({ system_group: "Safety" }), {} as any, () => {}) as { statusCode: number; body: string };
  const dataSystem = JSON.parse(resSystem.body) as { items?: { system_group: string }[] };
  if (dataSystem.items && dataSystem.items.length > 0) {
    const allSafety = dataSystem.items.every((i) => i.system_group === "Safety");
    if (!allSafety) throw new Error("system_group=Safety should only return items with system_group Safety");
    console.log("  ✓ system_group filter applied");
  }

  console.log("\n=== Unauthorized returns 401 ===\n");
  const unauth = await handler(createEvent({}, false), {} as any, () => {}) as { statusCode: number };
  if (unauth.statusCode !== 401) throw new Error("Expected 401 without auth");
  console.log("  ✓ 401 without Bearer token");

  console.log("\n=== All admin findings API tests passed ===\n");
}

runTests().catch((e) => {
  console.error(e);
  process.exit(1);
});
