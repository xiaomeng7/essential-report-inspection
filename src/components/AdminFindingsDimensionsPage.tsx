/**
 * Admin UI: Findings Dimensions Editor (Improved)
 * Efficient browsing and editing of finding dimensions with draft/published workflow.
 * API: GET /api/admin/findings, GET :finding_id, POST override, POST publish, POST rollback.
 */

import { useState, useEffect, useCallback } from "react";

const ADMIN_TOKEN_KEY = "admin_token";

const SAFETY_OPTS = ["HIGH", "MODERATE", "LOW"];
const URGENCY_OPTS = ["IMMEDIATE", "SHORT_TERM", "LONG_TERM"];
const LIABILITY_OPTS = ["HIGH", "MEDIUM", "LOW"];
const PRIORITY_OPTS = ["IMMEDIATE", "RECOMMENDED_0_3_MONTHS", "PLAN_MONITOR"];
const ESCALATION_OPTS = ["HIGH", "MODERATE", "LOW"];

type Dimensions = Record<string, string | number | null | undefined>;

type FindingItem = {
  finding_id: string;
  title: string | null;
  system_group: string | null;
  space_group: string | null;
  tags: string[];
  dimensions_effective: Dimensions;
  dimensions_source: "seed" | "override";
  override_version: number | null;
  updated_at: string | null;
};

type Facets = {
  system_group: Record<string, number>;
  space_group: Record<string, number>;
  tags: Record<string, number>;
  priority: Record<string, number>;
};

type ListResponse = {
  meta: { total: number; page: number; pageSize: number; totalPages: number };
  facets: Facets;
  items: FindingItem[];
};

type DetailResponse = {
  definition: Record<string, unknown>;
  seed_dimensions: Dimensions | null;
  active_override: { version: number; dimensions: Dimensions; note?: string; created_at?: string; updated_by?: string; updated_at?: string } | null;
  draft_override: { version: number; dimensions: Dimensions; note?: string; created_at?: string; updated_by?: string; updated_at?: string } | null;
  dimensions_effective: Dimensions;
  dimensions_source: string;
  override_version: number | null;
  history: Array<{ version: number; active: boolean; dimensions: Dimensions; note?: string; created_at?: string; updated_by?: string }>;
};

export function AdminFindingsDimensionsPage({ onBack }: { onBack: () => void }) {
  const [token, setToken] = useState(() =>
    typeof localStorage !== "undefined" ? localStorage.getItem(ADMIN_TOKEN_KEY) ?? "" : ""
  );
  const [q, setQ] = useState("");
  const [systemGroup, setSystemGroup] = useState("");
  const [spaceGroup, setSpaceGroup] = useState("");
  const [tagsFilter, setTagsFilter] = useState<string[]>([]);
  const [safetyHigh, setSafetyHigh] = useState(false);
  const [urgencyImmediate, setUrgencyImmediate] = useState(false);
  const [liabilityHigh, setLiabilityHigh] = useState(false);
  const [onlyDraft, setOnlyDraft] = useState(false);
  const [page, setPage] = useState(1);
  const [pageSize] = useState(50);
  const [sort] = useState("finding_id");
  const [order] = useState<"asc" | "desc">("asc");

  const [meta, setMeta] = useState<ListResponse["meta"] | null>(null);
  const [facets, setFacets] = useState<Facets | null>(null);
  const [items, setItems] = useState<FindingItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<DetailResponse | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [editDims, setEditDims] = useState<Dimensions>({});
  const [saving, setSaving] = useState(false);
  const [tagInput, setTagInput] = useState("");
  const [publishVersion, setPublishVersion] = useState("");
  const [showPublishModal, setShowPublishModal] = useState(false);
  const [showRollbackModal, setShowRollbackModal] = useState(false);
  const [rollbackVersion, setRollbackVersion] = useState("");

  const fetchList = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (q) params.set("q", q);
      if (systemGroup) params.set("system_group", systemGroup);
      if (spaceGroup) params.set("space_group", spaceGroup);
      tagsFilter.forEach((t) => params.append("tags", t));
      if (safetyHigh) params.set("safety", "HIGH");
      if (urgencyImmediate) params.set("urgency", "IMMEDIATE");
      if (liabilityHigh) params.set("liability", "HIGH");
      if (onlyDraft) params.set("preview", "draft");
      params.set("page", String(page));
      params.set("pageSize", String(pageSize));
      params.set("sort", sort);
      params.set("order", order);
      const res = await fetch(`/api/admin/findings?${params}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error(await res.text());
      const data = (await res.json()) as ListResponse;
      setMeta(data.meta);
      setFacets(data.facets);
      setItems(data.items ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setMeta(null);
      setFacets(null);
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [token, q, systemGroup, spaceGroup, tagsFilter, safetyHigh, urgencyImmediate, liabilityHigh, onlyDraft, page, pageSize, sort, order]);

  useEffect(() => {
    if (token) fetchList();
  }, [token, fetchList]);

  const fetchDetail = useCallback(
    async (finding_id: string) => {
      if (!token) return;
      setDetailLoading(true);
      try {
        const params = new URLSearchParams();
        if (onlyDraft) params.set("preview", "draft");
        const res = await fetch(`/api/admin/findings/${encodeURIComponent(finding_id)}?${params}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) throw new Error(await res.text());
        const data = (await res.json()) as DetailResponse;
        setDetail(data);
        // Initialize editDims with draft if exists, else published, else seed
        const draftDims = data.draft_override?.dimensions;
        const publishedDims = data.active_override?.dimensions;
        const seedDims = data.seed_dimensions;
        setEditDims(draftDims ?? publishedDims ?? seedDims ?? {});
      } catch {
        setDetail(null);
      } finally {
        setDetailLoading(false);
      }
    },
    [token, onlyDraft]
  );

  useEffect(() => {
    if (selectedId) fetchDetail(selectedId);
    else setDetail(null);
  }, [selectedId, fetchDetail, onlyDraft]);

  const resetFilters = () => {
    setQ("");
    setSystemGroup("");
    setSpaceGroup("");
    setTagsFilter([]);
    setSafetyHigh(false);
    setUrgencyImmediate(false);
    setLiabilityHigh(false);
    setOnlyDraft(false);
    setPage(1);
  };

  const saveDraft = async () => {
    if (!selectedId || !token) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/admin/findings/${encodeURIComponent(selectedId)}/override`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          dimensions: editDims,
          note: "Admin UI draft",
          updated_by: "admin-ui",
        }),
      });
      if (!res.ok) throw new Error(await res.text());
      await fetchDetail(selectedId);
      await fetchList();
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

  const discardDraft = async () => {
    if (!selectedId || !token) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/admin/findings/${encodeURIComponent(selectedId)}/override/reset`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error(await res.text());
      await fetchDetail(selectedId);
      await fetchList();
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

  const publishDraft = async () => {
    if (!selectedId || !token || !publishVersion.trim()) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/admin/findings/dimensions/publish`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          version: publishVersion.trim(),
          finding_ids: [selectedId],
        }),
      });
      if (!res.ok) throw new Error(await res.text());
      setShowPublishModal(false);
      setPublishVersion("");
      await fetchDetail(selectedId);
      await fetchList();
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

  const rollbackToVersion = async () => {
    if (!selectedId || !token || !rollbackVersion.trim()) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/admin/findings/dimensions/rollback`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          version: rollbackVersion.trim(),
          finding_ids: [selectedId],
        }),
      });
      if (!res.ok) throw new Error(await res.text());
      setShowRollbackModal(false);
      setRollbackVersion("");
      await fetchDetail(selectedId);
      await fetchList();
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

  const addTagFilter = () => {
    const t = tagInput.trim();
    if (t && !tagsFilter.includes(t)) setTagsFilter((prev) => [...prev, t]);
    setTagInput("");
  };

  if (!token) {
    return (
      <div style={{ padding: 24, maxWidth: 400 }}>
        <h2>Admin: Findings Dimensions</h2>
        <p>Use the same token as Config Admin (ADMIN_TOKEN).</p>
        <input
          type="password"
          placeholder="ADMIN_TOKEN"
          value={token}
          onChange={(e) => setToken(e.target.value)}
          onBlur={() => token && localStorage.setItem(ADMIN_TOKEN_KEY, token)}
          style={{ width: "100%", padding: 8, marginBottom: 12 }}
        />
        <button type="button" className="btn-primary" onClick={() => token && fetchList()}>
          Continue
        </button>
        <button type="button" className="btn-secondary" style={{ marginLeft: 8 }} onClick={onBack}>
          Back
        </button>
      </div>
    );
  }

  const systemGroupOpts = facets ? Object.keys(facets.system_group).filter((k) => k !== "_").sort() : [];
  const spaceGroupOpts = facets ? Object.keys(facets.space_group).filter((k) => k !== "_").sort() : [];

  const publishedDims = detail?.active_override?.dimensions ?? detail?.seed_dimensions ?? {};
  const draftDims = detail?.draft_override?.dimensions;
  const hasDraft = !!draftDims;

  return (
    <div style={{ display: "flex", height: "100vh", overflow: "hidden" }}>
      {/* Left: filters */}
      <div style={{ width: 280, padding: 16, borderRight: "1px solid #eee", overflowY: "auto", flexShrink: 0, background: "#f9f9f9" }}>
        <h3 style={{ margin: "0 0 16px 0" }}>Filters</h3>
        <input
          type="text"
          placeholder="Search finding_id or title"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          style={{ width: "100%", padding: 8, marginBottom: 12, boxSizing: "border-box", border: "1px solid #ddd", borderRadius: 4 }}
        />
        <label style={{ display: "block", marginBottom: 4, fontSize: 12, fontWeight: 500, color: "#333" }}>System Group</label>
        <select
          value={systemGroup}
          onChange={(e) => setSystemGroup(e.target.value)}
          style={{ width: "100%", padding: 8, marginBottom: 12, border: "1px solid #ddd", borderRadius: 4 }}
        >
          <option value="">All</option>
          {systemGroupOpts.map((g) => (
            <option key={g} value={g}>
              {g} ({facets?.system_group[g] ?? 0})
            </option>
          ))}
        </select>
        <label style={{ display: "block", marginBottom: 4, fontSize: 12, fontWeight: 500, color: "#333" }}>Space Group</label>
        <select
          value={spaceGroup}
          onChange={(e) => setSpaceGroup(e.target.value)}
          style={{ width: "100%", padding: 8, marginBottom: 12, border: "1px solid #ddd", borderRadius: 4 }}
        >
          <option value="">All</option>
          {spaceGroupOpts.map((g) => (
            <option key={g} value={g}>
              {g} ({facets?.space_group[g] ?? 0})
            </option>
          ))}
        </select>
        <label style={{ display: "block", marginBottom: 4, fontSize: 12, fontWeight: 500, color: "#333" }}>Tags</label>
        <div style={{ display: "flex", gap: 4, marginBottom: 8 }}>
          <input
            type="text"
            placeholder="Add tag"
            value={tagInput}
            onChange={(e) => setTagInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addTagFilter())}
            style={{ flex: 1, padding: 6, border: "1px solid #ddd", borderRadius: 4 }}
          />
          <button type="button" onClick={addTagFilter} style={{ padding: "6px 12px", border: "1px solid #ddd", borderRadius: 4, background: "#fff", cursor: "pointer" }}>
            +
          </button>
        </div>
        {tagsFilter.length > 0 && (
          <div style={{ marginBottom: 12, flexWrap: "wrap", display: "flex", gap: 4 }}>
            {tagsFilter.map((t) => (
              <span
                key={t}
                style={{ background: "#e3f2fd", padding: "4px 8px", borderRadius: 4, fontSize: 12, display: "flex", alignItems: "center", gap: 4 }}
              >
                {t}
                <button type="button" onClick={() => setTagsFilter((prev) => prev.filter((x) => x !== t))} style={{ padding: 0, border: 0, background: "none", cursor: "pointer" }}>
                  ×
                </button>
              </span>
            ))}
          </div>
        )}
        <div style={{ marginTop: 16, marginBottom: 12 }}>
          <label style={{ display: "block", marginBottom: 8, fontSize: 12, fontWeight: 500, color: "#333" }}>Quick Filters</label>
          <label style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8, cursor: "pointer" }}>
            <input type="checkbox" checked={safetyHigh} onChange={(e) => setSafetyHigh(e.target.checked)} />
            <span style={{ fontSize: 13 }}>Safety = HIGH</span>
          </label>
          <label style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8, cursor: "pointer" }}>
            <input type="checkbox" checked={urgencyImmediate} onChange={(e) => setUrgencyImmediate(e.target.checked)} />
            <span style={{ fontSize: 13 }}>Urgency = IMMEDIATE</span>
          </label>
          <label style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8, cursor: "pointer" }}>
            <input type="checkbox" checked={liabilityHigh} onChange={(e) => setLiabilityHigh(e.target.checked)} />
            <span style={{ fontSize: 13 }}>Liability = HIGH</span>
          </label>
          <label style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12, cursor: "pointer" }}>
            <input type="checkbox" checked={onlyDraft} onChange={(e) => setOnlyDraft(e.target.checked)} />
            <span style={{ fontSize: 13, fontWeight: 500 }}>Only Draft Changes</span>
          </label>
        </div>
        <button type="button" onClick={resetFilters} style={{ width: "100%", padding: 8, marginBottom: 8, border: "1px solid #ddd", borderRadius: 4, background: "#fff", cursor: "pointer" }}>
          Reset Filters
        </button>
        <button type="button" className="btn-primary" onClick={() => fetchList()} style={{ width: "100%" }}>
          Apply
        </button>
      </div>

      {/* Middle: list */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0 }}>
        <div style={{ padding: 16, borderBottom: "1px solid #eee", display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
          <h1 style={{ margin: 0 }}>Findings Dimensions</h1>
          <button type="button" className="btn-secondary" onClick={onBack}>
            Back
          </button>
          <span style={{ marginLeft: "auto", fontSize: 14, color: "#666" }}>
            {meta ? `${meta.total} findings` : ""}
          </span>
        </div>

        {error && (
          <div style={{ padding: 12, background: "#ffebee", color: "#c62828", margin: 16, borderRadius: 4 }}>
            {error}
          </div>
        )}

        {loading ? (
          <div style={{ padding: 24 }}>Loading…</div>
        ) : (
          <>
            <div style={{ flex: 1, overflow: "auto" }}>
              <table style={{ borderCollapse: "collapse", width: "100%", fontSize: 13 }}>
                <thead>
                  <tr style={{ background: "#f5f5f5", position: "sticky", top: 0 }}>
                    <th style={{ padding: 10, textAlign: "left", borderBottom: "2px solid #ddd" }}>Finding ID</th>
                    <th style={{ padding: 10, textAlign: "left", borderBottom: "2px solid #ddd" }}>Title</th>
                    <th style={{ padding: 10, textAlign: "left", borderBottom: "2px solid #ddd" }}>Groups</th>
                    <th style={{ padding: 10, textAlign: "left", borderBottom: "2px solid #ddd" }}>Safety</th>
                    <th style={{ padding: 10, textAlign: "left", borderBottom: "2px solid #ddd" }}>Urgency</th>
                    <th style={{ padding: 10, textAlign: "left", borderBottom: "2px solid #ddd" }}>Liability</th>
                    <th style={{ padding: 10, textAlign: "left", borderBottom: "2px solid #ddd" }}>Priority</th>
                    <th style={{ padding: 10, textAlign: "left", borderBottom: "2px solid #ddd" }}>Budget Range</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((f) => {
                    const dims = f.dimensions_effective as Dimensions;
                    const budgetLow = dims.budget_low;
                    const budgetHigh = dims.budget_high;
                    const budgetRange = budgetLow != null || budgetHigh != null
                      ? `$${budgetLow ?? 0} - $${budgetHigh ?? 0}`
                      : "—";
                    return (
                      <tr
                        key={f.finding_id}
                        style={{
                          borderBottom: "1px solid #eee",
                          background: selectedId === f.finding_id ? "#e3f2fd" : undefined,
                          cursor: "pointer",
                        }}
                        onClick={() => setSelectedId(f.finding_id)}
                      >
                        <td style={{ padding: 10, fontFamily: "monospace", fontSize: 12 }}>{f.finding_id}</td>
                        <td style={{ padding: 10, maxWidth: 200 }}>{f.title ?? "—"}</td>
                        <td style={{ padding: 10 }}>
                          {[f.system_group, f.space_group].filter(Boolean).map((g) => (
                            <span key={g} style={{ marginRight: 6, background: "#eee", padding: "2px 6px", borderRadius: 4, fontSize: 11 }}>
                              {g}
                            </span>
                          ))}
                        </td>
                        <td style={{ padding: 10 }}>{dims.safety ?? "—"}</td>
                        <td style={{ padding: 10 }}>{dims.urgency ?? "—"}</td>
                        <td style={{ padding: 10 }}>{dims.liability ?? "—"}</td>
                        <td style={{ padding: 10 }}>{dims.priority ?? "—"}</td>
                        <td style={{ padding: 10, fontSize: 12 }}>{budgetRange}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {meta && meta.totalPages > 1 && (
              <div style={{ padding: 12, borderTop: "1px solid #eee", display: "flex", alignItems: "center", gap: 12 }}>
                <button type="button" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
                  Prev
                </button>
                <span>
                  Page {meta.page} of {meta.totalPages} ({meta.total} total)
                </span>
                <button type="button" disabled={page >= meta.totalPages} onClick={() => setPage((p) => p + 1)}>
                  Next
                </button>
              </div>
            )}
          </>
        )}
      </div>

      {/* Right: editor panel */}
      {selectedId && (
        <div style={{ width: 600, borderLeft: "1px solid #eee", display: "flex", flexDirection: "column", flexShrink: 0, background: "#fff" }}>
          <div style={{ padding: 12, borderBottom: "1px solid #eee", display: "flex", justifyContent: "space-between", alignItems: "center", background: "#f5f5f5" }}>
            <strong style={{ fontSize: 14 }}>{selectedId}</strong>
            <button type="button" onClick={() => setSelectedId(null)} style={{ padding: "4px 8px", border: "none", background: "none", cursor: "pointer", fontSize: 18 }}>×</button>
          </div>
          <div style={{ flex: 1, overflow: "auto", padding: 16 }}>
            {detailLoading ? (
              <p>Loading…</p>
            ) : detail ? (
              <div>
                <h3 style={{ marginTop: 0, marginBottom: 16 }}>Dimensions Editor</h3>
                
                {/* Published vs Draft comparison */}
                <div style={{ marginBottom: 20 }}>
                  <h4 style={{ fontSize: 14, marginBottom: 8, color: "#666" }}>Published Values</h4>
                  <div style={{ background: "#f9f9f9", padding: 12, borderRadius: 4, marginBottom: 12 }}>
                    <div style={{ display: "grid", gridTemplateColumns: "120px 1fr", gap: 8, fontSize: 13 }}>
                      {(["safety", "urgency", "liability", "priority", "escalation"] as const).map((k) => (
                        <div key={k}>
                          <label style={{ fontSize: 11, color: "#666" }}>{k}</label>
                          <div style={{ padding: 6, background: "#fff", borderRadius: 2 }}>{String(publishedDims[k] ?? "—")}</div>
                        </div>
                      ))}
                      {(["severity", "likelihood"] as const).map((k) => (
                        <div key={k}>
                          <label style={{ fontSize: 11, color: "#666" }}>{k}</label>
                          <div style={{ padding: 6, background: "#fff", borderRadius: 2 }}>{String(publishedDims[k] ?? "—")}</div>
                        </div>
                      ))}
                      {(["budget_low", "budget_high"] as const).map((k) => (
                        <div key={k}>
                          <label style={{ fontSize: 11, color: "#666" }}>{k}</label>
                          <div style={{ padding: 6, background: "#fff", borderRadius: 2 }}>{String(publishedDims[k] ?? "—")}</div>
                        </div>
                      ))}
                    </div>
                    {detail.active_override && (
                      <div style={{ marginTop: 8, fontSize: 11, color: "#666" }}>
                        Last updated: {detail.active_override.updated_by ?? "unknown"} at {detail.active_override.updated_at ? new Date(detail.active_override.updated_at).toLocaleString() : "—"}
                      </div>
                    )}
                  </div>

                  {hasDraft && (
                    <>
                      <h4 style={{ fontSize: 14, marginBottom: 8, color: "#d32f2f" }}>Draft Values (Not Published)</h4>
                      <div style={{ background: "#fff3e0", padding: 12, borderRadius: 4, marginBottom: 12, border: "1px solid #ffb74d" }}>
                        <div style={{ display: "grid", gridTemplateColumns: "120px 1fr", gap: 8, fontSize: 13 }}>
                          {(["safety", "urgency", "liability", "priority", "escalation"] as const).map((k) => (
                            <div key={k}>
                              <label style={{ fontSize: 11, color: "#666" }}>{k}</label>
                              <div style={{ padding: 6, background: "#fff", borderRadius: 2 }}>{String(draftDims[k] ?? "—")}</div>
                            </div>
                          ))}
                          {(["severity", "likelihood"] as const).map((k) => (
                            <div key={k}>
                              <label style={{ fontSize: 11, color: "#666" }}>{k}</label>
                              <div style={{ padding: 6, background: "#fff", borderRadius: 2 }}>{String(draftDims[k] ?? "—")}</div>
                            </div>
                          ))}
                          {(["budget_low", "budget_high"] as const).map((k) => (
                            <div key={k}>
                              <label style={{ fontSize: 11, color: "#666" }}>{k}</label>
                              <div style={{ padding: 6, background: "#fff", borderRadius: 2 }}>{String(draftDims[k] ?? "—")}</div>
                            </div>
                          ))}
                        </div>
                        {detail.draft_override && (
                          <div style={{ marginTop: 8, fontSize: 11, color: "#666" }}>
                            Draft updated: {detail.draft_override.updated_by ?? "unknown"} at {detail.draft_override.updated_at ? new Date(detail.draft_override.updated_at).toLocaleString() : "—"}
                          </div>
                        )}
                      </div>
                    </>
                  )}
                </div>

                {/* Editor */}
                <h4 style={{ fontSize: 14, marginBottom: 8 }}>Edit Draft</h4>
                <div style={{ display: "grid", gridTemplateColumns: "120px 1fr", gap: 8, marginBottom: 16 }}>
                  {(["safety", "urgency", "liability", "priority", "escalation"] as const).map((k) => (
                    <div key={k}>
                      <label style={{ fontSize: 12, fontWeight: 500 }}>{k}</label>
                      <select
                        value={String(editDims[k] ?? "")}
                        onChange={(e) => setEditDims((prev) => ({ ...prev, [k]: e.target.value || undefined }))}
                        style={{ width: "100%", padding: 6, border: "1px solid #ddd", borderRadius: 4 }}
                      >
                        <option value="">—</option>
                        {(k === "safety" ? SAFETY_OPTS : k === "urgency" ? URGENCY_OPTS : k === "liability" ? LIABILITY_OPTS : k === "priority" ? PRIORITY_OPTS : ESCALATION_OPTS).map((o) => (
                          <option key={o} value={o}>
                            {o}
                          </option>
                        ))}
                      </select>
                    </div>
                  ))}
                  {(["severity", "likelihood"] as const).map((k) => (
                    <div key={k}>
                      <label style={{ fontSize: 12, fontWeight: 500 }}>{k} (1-5)</label>
                      <input
                        type="number"
                        min={1}
                        max={5}
                        value={editDims[k] ?? ""}
                        onChange={(e) => setEditDims((prev) => ({ ...prev, [k]: e.target.value ? Number(e.target.value) : undefined }))}
                        style={{ width: "100%", padding: 6, border: "1px solid #ddd", borderRadius: 4 }}
                      />
                    </div>
                  ))}
                  {(["budget_low", "budget_high"] as const).map((k) => (
                    <div key={k}>
                      <label style={{ fontSize: 12, fontWeight: 500 }}>{k}</label>
                      <input
                        type="number"
                        value={editDims[k] ?? ""}
                        onChange={(e) => setEditDims((prev) => ({ ...prev, [k]: e.target.value ? Number(e.target.value) : undefined }))}
                        style={{ width: "100%", padding: 6, border: "1px solid #ddd", borderRadius: 4 }}
                      />
                    </div>
                  ))}
                </div>

                {/* Action buttons */}
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  <button type="button" className="btn-primary" disabled={saving} onClick={saveDraft} style={{ width: "100%" }}>
                    {saving ? "Saving…" : "Save Draft"}
                  </button>
                  {hasDraft && (
                    <>
                      <button type="button" className="btn-secondary" disabled={saving} onClick={discardDraft} style={{ width: "100%" }}>
                        Discard Draft
                      </button>
                      <button type="button" className="btn-primary" disabled={saving} onClick={() => setShowPublishModal(true)} style={{ width: "100%", background: "#2e7d32" }}>
                        Publish Draft
                      </button>
                    </>
                  )}
                  {detail.history.length > 0 && (
                    <button type="button" className="btn-secondary" disabled={saving} onClick={() => setShowRollbackModal(true)} style={{ width: "100%" }}>
                      Rollback to Version
                    </button>
                  )}
                </div>
              </div>
            ) : null}
          </div>
        </div>
      )}

      {/* Publish modal */}
      {showPublishModal && (
        <div style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000 }}>
          <div style={{ background: "#fff", padding: 24, borderRadius: 8, maxWidth: 400, width: "90%" }}>
            <h3 style={{ marginTop: 0 }}>Publish Draft</h3>
            <p style={{ fontSize: 14, color: "#666", marginBottom: 16 }}>Enter a version string for this publish (e.g., "v1.2.3" or "2026-02-03"):</p>
            <input
              type="text"
              placeholder="Version string"
              value={publishVersion}
              onChange={(e) => setPublishVersion(e.target.value)}
              style={{ width: "100%", padding: 8, marginBottom: 16, border: "1px solid #ddd", borderRadius: 4 }}
            />
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <button type="button" className="btn-secondary" onClick={() => { setShowPublishModal(false); setPublishVersion(""); }}>
                Cancel
              </button>
              <button type="button" className="btn-primary" disabled={!publishVersion.trim() || saving} onClick={publishDraft}>
                {saving ? "Publishing…" : "Publish"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Rollback modal */}
      {showRollbackModal && detail && (
        <div style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000 }}>
          <div style={{ background: "#fff", padding: 24, borderRadius: 8, maxWidth: 400, width: "90%" }}>
            <h3 style={{ marginTop: 0 }}>Rollback to Version</h3>
            <p style={{ fontSize: 14, color: "#666", marginBottom: 16 }}>Select a version to rollback to:</p>
            <select
              value={rollbackVersion}
              onChange={(e) => setRollbackVersion(e.target.value)}
              style={{ width: "100%", padding: 8, marginBottom: 16, border: "1px solid #ddd", borderRadius: 4 }}
            >
              <option value="">Select version...</option>
              {detail.history.map((h) => (
                <option key={h.version} value={String(h.version)}>
                  Version {h.version} {h.active ? "(active)" : ""} - {h.created_at ? new Date(h.created_at).toLocaleDateString() : ""}
                </option>
              ))}
            </select>
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <button type="button" className="btn-secondary" onClick={() => { setShowRollbackModal(false); setRollbackVersion(""); }}>
                Cancel
              </button>
              <button type="button" className="btn-primary" disabled={!rollbackVersion.trim() || saving} onClick={rollbackToVersion}>
                {saving ? "Rolling back…" : "Rollback"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
