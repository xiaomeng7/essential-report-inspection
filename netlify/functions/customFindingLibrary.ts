import type { Handler, HandlerEvent } from "@netlify/functions";
import { connectLambda, getStore } from "@netlify/blobs";

const STORE_NAME = "custom-finding-library";
const KEY_ENTRIES = "entries";

export type CustomFindingLibraryEntry = {
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
  is_common?: boolean;
  use_count?: number;
  created_at?: string;
  updated_at?: string;
};

function genId(): string {
  return `lib_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 9)}`;
}

async function getEntries(event: HandlerEvent): Promise<CustomFindingLibraryEntry[]> {
  connectLambda(event);
  const store = getStore({ name: STORE_NAME, consistency: "eventual" });
  const raw = await store.get(KEY_ENTRIES);
  if (!raw) return [];
  try {
    const list = JSON.parse(raw) as CustomFindingLibraryEntry[];
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

async function setEntries(event: HandlerEvent, entries: CustomFindingLibraryEntry[]): Promise<void> {
  connectLambda(event);
  const store = getStore({ name: STORE_NAME, consistency: "eventual" });
  await store.set(KEY_ENTRIES, JSON.stringify(entries));
}

export const handler: Handler = async (event: HandlerEvent) => {
  const method = event.httpMethod;
  const path = event.path ?? "";
  const isGet = method === "GET";
  const isPost = method === "POST";
  const isPut = method === "PUT";
  const isDelete = method === "DELETE";

  if (!isGet && !isPost && !isPut && !isDelete) {
    return { statusCode: 405, headers: { "Content-Type": "application/json" }, body: JSON.stringify({ error: "Method Not Allowed" }) };
  }

  let body: Record<string, unknown> = {};
  if ((isPost || isPut || isDelete) && event.body) {
    try {
      body = JSON.parse(event.body) as Record<string, unknown>;
    } catch {
      return { statusCode: 400, headers: { "Content-Type": "application/json" }, body: JSON.stringify({ error: "Invalid JSON body" }) };
    }
  }

  const entries = await getEntries(event);

  if (isGet) {
    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ entries }),
    };
  }

  if (isPost) {
    const title = String(body.title ?? "").trim();
    if (!title) {
      return { statusCode: 400, headers: { "Content-Type": "application/json" }, body: JSON.stringify({ error: "title is required" }) };
    }
    const now = new Date().toISOString();
    const entry: CustomFindingLibraryEntry = {
      id: genId(),
      title,
      safety: String(body.safety ?? "LOW"),
      urgency: String(body.urgency ?? "LONG_TERM"),
      liability: String(body.liability ?? "LOW"),
      budget_low: typeof body.budget_low === "number" ? body.budget_low : undefined,
      budget_high: typeof body.budget_high === "number" ? body.budget_high : undefined,
      priority: String(body.priority ?? "PLAN_MONITOR"),
      severity: typeof body.severity === "number" ? body.severity : 2,
      likelihood: typeof body.likelihood === "number" ? body.likelihood : 2,
      escalation: String(body.escalation ?? "LOW"),
      is_common: !!body.is_common,
      use_count: 0,
      created_at: now,
      updated_at: now,
    };
    entries.push(entry);
    await setEntries(event, entries);
    return { statusCode: 200, headers: { "Content-Type": "application/json" }, body: JSON.stringify({ entry }) };
  }

  if (isPut) {
    const id = body.id as string;
    if (!id) {
      return { statusCode: 400, headers: { "Content-Type": "application/json" }, body: JSON.stringify({ error: "id is required" }) };
    }
    const idx = entries.findIndex((e) => e.id === id);
    if (idx === -1) {
      return { statusCode: 404, headers: { "Content-Type": "application/json" }, body: JSON.stringify({ error: "Entry not found" }) };
    }
    const now = new Date().toISOString();
    const existing = entries[idx];
    const entry: CustomFindingLibraryEntry = {
      ...existing,
      title: body.title !== undefined ? String(body.title).trim() : existing.title,
      safety: body.safety !== undefined ? String(body.safety) : existing.safety,
      urgency: body.urgency !== undefined ? String(body.urgency) : existing.urgency,
      liability: body.liability !== undefined ? String(body.liability) : existing.liability,
      budget_low: body.budget_low !== undefined ? (typeof body.budget_low === "number" ? body.budget_low : undefined) : existing.budget_low,
      budget_high: body.budget_high !== undefined ? (typeof body.budget_high === "number" ? body.budget_high : undefined) : existing.budget_high,
      priority: body.priority !== undefined ? String(body.priority) : existing.priority,
      severity: body.severity !== undefined ? Number(body.severity) : existing.severity,
      likelihood: body.likelihood !== undefined ? Number(body.likelihood) : existing.likelihood,
      escalation: body.escalation !== undefined ? String(body.escalation) : existing.escalation,
      is_common: body.is_common !== undefined ? !!body.is_common : existing.is_common,
      updated_at: now,
    };
    entries[idx] = entry;
    await setEntries(event, entries);
    return { statusCode: 200, headers: { "Content-Type": "application/json" }, body: JSON.stringify({ entry }) };
  }

  if (isDelete) {
    const id = (body.id as string) ?? (event.queryStringParameters?.id as string);
    if (!id) {
      return { statusCode: 400, headers: { "Content-Type": "application/json" }, body: JSON.stringify({ error: "id is required" }) };
    }
    const newEntries = entries.filter((e) => e.id !== id);
    if (newEntries.length === entries.length) {
      return { statusCode: 404, headers: { "Content-Type": "application/json" }, body: JSON.stringify({ error: "Entry not found" }) };
    }
    await setEntries(event, newEntries);
    return { statusCode: 200, headers: { "Content-Type": "application/json" }, body: JSON.stringify({ deleted: id }) };
  }

  return { statusCode: 405, headers: { "Content-Type": "application/json" }, body: JSON.stringify({ error: "Method Not Allowed" }) };
};
