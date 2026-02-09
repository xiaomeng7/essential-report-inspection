/**
 * Admin UI: Findings management (Neon 003). Filters, list with pagination, drawer (Dimensions / Copy / History).
 * API: GET /api/admin/findings (meta, facets, items), GET :finding_id, POST override, POST override/reset, POST bulk.
 */

import { useState, useEffect, useCallback } from "react";

const ADMIN_TOKEN_KEY = "admin_token";

const SAFETY_OPTS = ["HIGH", "MODERATE", "LOW"];
const URGENCY_OPTS = ["IMMEDIATE", "SHORT_TERM", "LONG_TERM"];
const LIABILITY_OPTS = ["HIGH", "MEDIUM", "LOW"];
const PRIORITY_OPTS = ["IMMEDIATE", "RECOMMENDED_0_3_MONTHS", "PLAN_MONITOR"];
const ESCALATION_OPTS = ["HIGH", "MODERATE", "LOW"];

type CopyStatus = { has_title: boolean; has_why: boolean; has_action: boolean; has_planning: boolean };
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
  copy_status: CopyStatus;
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
  active_override: { version: number; dimensions: Dimensions; note?: string; created_at?: string } | null;
  dimensions_effective: Dimensions;
  dimensions_source: string;
  override_version: number | null;
  history: Array<{ version: number; active: boolean; dimensions: Dimensions; note?: string; created_at?: string }>;
};

export function AdminFindingsPage({ onBack }: { onBack: () => void }) {
  const [token, setToken] = useState(() =>
    typeof localStorage !== "undefined" ? localStorage.getItem(ADMIN_TOKEN_KEY) ?? "" : ""
  );
  const [q, setQ] = useState("");
  const [systemGroup, setSystemGroup] = useState("");
  const [spaceGroup, setSpaceGroup] = useState("");
  const [tagsFilter, setTagsFilter] = useState<string[]>([]);
  const [priority, setPriority] = useState("");
  const [hasOverrides, setHasOverrides] = useState(false);
  const [missingCopy, setMissingCopy] = useState(false);
  const [page, setPage] = useState(1);
  const [pageSize] = useState(20);
  const [sort, setSort] = useState("finding_id");
  const [order, setOrder] = useState<"asc" | "desc">("asc");

  const [meta, setMeta] = useState<ListResponse["meta"] | null>(null);
  const [facets, setFacets] = useState<Facets | null>(null);
  const [items, setItems] = useState<FindingItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<DetailResponse | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [drawerTab, setDrawerTab] = useState<"dimensions" | "copy" | "history">("dimensions");
  const [editDims, setEditDims] = useState<Dimensions>({});
  const [saving, setSaving] = useState(false);
  const [tagInput, setTagInput] = useState("");

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
      if (priority) params.set("priority", priority);
      if (hasOverrides) params.set("hasOverrides", "true");
      if (missingCopy) params.set("missingCopy", "true");
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
  }, [token, q, systemGroup, spaceGroup, tagsFilter, priority, hasOverrides, missingCopy, page, pageSize, sort, order]);

  useEffect(() => {
    if (token) fetchList();
  }, [token, fetchList]);

  const fetchDetail = useCallback(
    async (finding_id: string) => {
      if (!token) return;
      setDetailLoading(true);
      try {
        const res = await fetch(`/api/admin/findings/${encodeURIComponent(finding_id)}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) throw new Error(await res.text());
        const data = (await res.json()) as DetailResponse;
        setDetail(data);
        setEditDims(data.dimensions_effective ?? {});
      } catch {
        setDetail(null);
      } finally {
        setDetailLoading(false);
      }
    },
    [token]
  );

  useEffect(() => {
    if (selectedId) fetchDetail(selectedId);
    else setDetail(null);
  }, [selectedId, fetchDetail]);

  const resetFilters = () => {
    setQ("");
    setSystemGroup("");
    setSpaceGroup("");
    setTagsFilter([]);
    setPriority("");
    setHasOverrides(false);
    setMissingCopy(false);
    setPage(1);
  };

  const saveOverride = async () => {
    if (!selectedId || !token) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/admin/findings/${encodeURIComponent(selectedId)}/override`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          dimensions: editDims,
          note: "Admin UI",
          updated_by: "admin-ui",
        }),
      });
      if (!res.ok) throw new Error(await res.text());
      await fetchDetail(selectedId);
      await fetchList();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

  const resetOverride = async () => {
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
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

  const restoreVersion = async (versionDimensions: Dimensions) => {
    if (!selectedId) return;
    setEditDims(versionDimensions);
    await saveOverride();
  };

  const addTagFilter = () => {
    const t = tagInput.trim();
    if (t && !tagsFilter.includes(t)) setTagsFilter((prev) => [...prev, t]);
    setTagInput("");
  };

  if (!token) {
    return (
      <div style={{ padding: 24, maxWidth: 400 }}>
        <h2>Admin: Findings</h2>
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
  const priorityOpts = facets ? Object.keys(facets.priority).filter((k) => k !== "_").sort() : [];

  return (
    <div style={{ display: "flex", height: "100vh", overflow: "hidden" }}>
      {/* Left: filters */}
      <div style={{ width: 260, padding: 16, borderRight: "1px solid #eee", overflowY: "auto", flexShrink: 0 }}>
        <h3 style={{ margin: "0 0 12px 0" }}>Filters</h3>
        <input
          type="text"
          placeholder="Search finding_id / title"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          style={{ width: "100%", padding: 8, marginBottom: 8, boxSizing: "border-box" }}
        />
        <label style={{ display: "block", marginBottom: 4, fontSize: 12, color: "#666" }}>system_group</label>
        <select
          value={systemGroup}
          onChange={(e) => setSystemGroup(e.target.value)}
          style={{ width: "100%", padding: 8, marginBottom: 8 }}
        >
          <option value="">All</option>
          {systemGroupOpts.map((g) => (
            <option key={g} value={g}>
              {g} ({facets?.system_group[g] ?? 0})
            </option>
          ))}
        </select>
        <label style={{ display: "block", marginBottom: 4, fontSize: 12, color: "#666" }}>space_group</label>
        <select
          value={spaceGroup}
          onChange={(e) => setSpaceGroup(e.target.value)}
          style={{ width: "100%", padding: 8, marginBottom: 8 }}
        >
          <option value="">All</option>
          {spaceGroupOpts.map((g) => (
            <option key={g} value={g}>
              {g} ({facets?.space_group[g] ?? 0})
            </option>
          ))}
        </select>
        <label style={{ display: "block", marginBottom: 4, fontSize: 12, color: "#666" }}>tags</label>
        <div style={{ display: "flex", gap: 4, marginBottom: 8 }}>
          <input
            type="text"
            placeholder="Add tag"
            value={tagInput}
            onChange={(e) => setTagInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addTagFilter())}
            style={{ flex: 1, padding: 8 }}
          />
          <button type="button" onClick={addTagFilter}>
            +
          </button>
        </div>
        {tagsFilter.length > 0 && (
          <div style={{ marginBottom: 8, flexWrap: "wrap", display: "flex", gap: 4 }}>
            {tagsFilter.map((t) => (
              <span
                key={t}
                style={{ background: "#e3f2fd", padding: "2px 8px", borderRadius: 4, fontSize: 12, display: "flex", alignItems: "center", gap: 4 }}
              >
                {t}
                <button type="button" onClick={() => setTagsFilter((prev) => prev.filter((x) => x !== t))} style={{ padding: 0, border: 0, background: "none", cursor: "pointer" }}>
                  ×
                </button>
              </span>
            ))}
          </div>
        )}
        <label style={{ display: "block", marginBottom: 4, fontSize: 12, color: "#666" }}>priority</label>
        <select value={priority} onChange={(e) => setPriority(e.target.value)} style={{ width: "100%", padding: 8, marginBottom: 8 }}>
          <option value="">All</option>
          {priorityOpts.map((p) => (
            <option key={p} value={p}>
              {p} ({facets?.priority[p] ?? 0})
            </option>
          ))}
        </select>
        <label style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
          <input type="checkbox" checked={hasOverrides} onChange={(e) => setHasOverrides(e.target.checked)} />
          Has overrides
        </label>
        <label style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
          <input type="checkbox" checked={missingCopy} onChange={(e) => setMissingCopy(e.target.checked)} />
          Missing copy
        </label>
        <button type="button" onClick={resetFilters} style={{ marginRight: 8 }}>
          Reset filters
        </button>
        <button type="button" className="btn-primary" onClick={() => fetchList()}>
          Apply
        </button>
      </div>

      {/* Middle: list + toolbar */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0 }}>
        <div style={{ padding: 16, borderBottom: "1px solid #eee", display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
          <h1 style={{ margin: 0 }}>Findings</h1>
          <button type="button" className="btn-secondary" onClick={onBack}>
            Back
          </button>
          <span style={{ marginLeft: "auto" }}>
            Sort:{" "}
            <select value={sort} onChange={(e) => setSort(e.target.value)} style={{ padding: 4 }}>
              <option value="finding_id">finding_id</option>
              <option value="title">title</option>
              <option value="system_group">system_group</option>
              <option value="updated_at">updated_at</option>
            </select>
            <select value={order} onChange={(e) => setOrder(e.target.value as "asc" | "desc")} style={{ padding: 4 }}>
              <option value="asc">asc</option>
              <option value="desc">desc</option>
            </select>
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
            <div style={{ flex: 1, overflow: "auto", padding: 16 }}>
              <table style={{ borderCollapse: "collapse", width: "100%", fontSize: 14 }}>
                <thead>
                  <tr style={{ background: "#f5f5f5" }}>
                    <th style={{ padding: 8, textAlign: "left" }}>finding_id</th>
                    <th style={{ padding: 8, textAlign: "left" }}>title</th>
                    <th style={{ padding: 8, textAlign: "left" }}>Groups / Tags</th>
                    <th style={{ padding: 8, textAlign: "left" }}>Dimensions</th>
                    <th style={{ padding: 8, textAlign: "left" }}>Override</th>
                    <th style={{ padding: 8, textAlign: "left" }}>Copy</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((f) => (
                    <tr
                      key={f.finding_id}
                      style={{
                        borderBottom: "1px solid #eee",
                        background: selectedId === f.finding_id ? "#e3f2fd" : undefined,
                        cursor: "pointer",
                      }}
                      onClick={() => setSelectedId(f.finding_id)}
                    >
                      <td style={{ padding: 8 }}>{f.finding_id}</td>
                      <td style={{ padding: 8, maxWidth: 220 }}>{f.title ?? "—"}</td>
                      <td style={{ padding: 8 }}>
                        {[f.system_group, f.space_group].filter(Boolean).map((g) => (
                          <span key={g} style={{ marginRight: 6, background: "#eee", padding: "2px 6px", borderRadius: 4, fontSize: 12 }}>
                            {g}
                          </span>
                        ))}
                        {(f.tags ?? []).slice(0, 3).map((t) => (
                          <span key={t} style={{ marginRight: 4, color: "#1565c0", fontSize: 12 }}>
                            #{t}
                          </span>
                        ))}
                      </td>
                      <td style={{ padding: 8, fontSize: 12 }}>
                        {(f.dimensions_effective as { priority?: string })?.priority ?? "—"}
                      </td>
                      <td style={{ padding: 8 }}>
                        {f.dimensions_source === "override" ? (
                          <span style={{ color: "#2e7d32" }}>v{f.override_version}</span>
                        ) : (
                          <span style={{ color: "#666" }}>seed</span>
                        )}
                      </td>
                      <td style={{ padding: 8 }}>
                        {[
                          f.copy_status?.has_title && "T",
                          f.copy_status?.has_why && "W",
                          f.copy_status?.has_action && "A",
                          f.copy_status?.has_planning && "P",
                        ]
                          .filter(Boolean)
                          .join(" ") || "—"}
                      </td>
                    </tr>
                  ))}
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

      {/* Right: drawer */}
      {selectedId && (
        <div style={{ width: 420, borderLeft: "1px solid #eee", display: "flex", flexDirection: "column", flexShrink: 0 }}>
          <div style={{ padding: 12, borderBottom: "1px solid #eee", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <strong>{selectedId}</strong>
            <button type="button" onClick={() => setSelectedId(null)}>×</button>
          </div>
          <div style={{ display: "flex", borderBottom: "1px solid #eee" }}>
            {(["dimensions", "copy", "history"] as const).map((tab) => (
              <button
                key={tab}
                type="button"
                onClick={() => setDrawerTab(tab)}
                style={{
                  padding: "10px 16px",
                  border: "none",
                  background: drawerTab === tab ? "#e3f2fd" : "transparent",
                  cursor: "pointer",
                  textTransform: "capitalize",
                }}
              >
                {tab}
              </button>
            ))}
          </div>
          <div style={{ flex: 1, overflow: "auto", padding: 16 }}>
            {detailLoading ? (
              <p>Loading…</p>
            ) : drawerTab === "dimensions" && detail ? (
              <div>
                <p style={{ fontSize: 12, color: "#666" }}>
                  Source: {detail.dimensions_source} {detail.override_version != null ? `(v${detail.override_version})` : ""}
                </p>
                <div style={{ display: "grid", gridTemplateColumns: "100px 1fr", gap: 8 }}>
                  {(["safety", "urgency", "liability", "priority", "escalation"] as const).map((k) => (
                    <div key={k}>
                      <label>{k}</label>
                      <select
                        value={String(editDims[k] ?? "")}
                        onChange={(e) => setEditDims((prev) => ({ ...prev, [k]: e.target.value || undefined }))}
                        style={{ width: "100%", padding: 6 }}
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
                      <label>{k} (1-5)</label>
                      <input
                        type="number"
                        min={1}
                        max={5}
                        value={editDims[k] ?? ""}
                        onChange={(e) => setEditDims((prev) => ({ ...prev, [k]: e.target.value ? Number(e.target.value) : undefined }))}
                        style={{ width: "100%", padding: 6 }}
                      />
                    </div>
                  ))}
                  {(["budget_low", "budget_high"] as const).map((k) => (
                    <div key={k}>
                      <label>{k}</label>
                      <input
                        type="number"
                        value={editDims[k] ?? ""}
                        onChange={(e) => setEditDims((prev) => ({ ...prev, [k]: e.target.value ? Number(e.target.value) : undefined }))}
                        style={{ width: "100%", padding: 6 }}
                      />
                    </div>
                  ))}
                </div>
                <div style={{ marginTop: 16, display: "flex", gap: 8 }}>
                  <button type="button" className="btn-primary" disabled={saving} onClick={saveOverride}>
                    {saving ? "Saving…" : "Save (new override)"}
                  </button>
                  {detail.dimensions_source === "override" && (
                    <button type="button" className="btn-secondary" disabled={saving} onClick={resetOverride}>
                      Reset to seed
                    </button>
                  )}
                </div>
              </div>
            ) : drawerTab === "copy" && detail ? (
              <div>
                <p><strong>Title</strong></p>
                <p style={{ whiteSpace: "pre-wrap", fontSize: 14 }}>{(detail.definition as { title?: string }).title ?? "—"}</p>
                <p><strong>Why it matters</strong></p>
                <p style={{ whiteSpace: "pre-wrap", fontSize: 14 }}>{(detail.definition as { why_it_matters?: string }).why_it_matters ?? "—"}</p>
                <p><strong>Recommended action</strong></p>
                <p style={{ whiteSpace: "pre-wrap", fontSize: 14 }}>{(detail.definition as { recommended_action?: string }).recommended_action ?? "—"}</p>
                <p><strong>Planning guidance</strong></p>
                <p style={{ whiteSpace: "pre-wrap", fontSize: 14 }}>{(detail.definition as { planning_guidance?: string }).planning_guidance ?? "—"}</p>
                <p style={{ fontSize: 12, color: "#666" }}>Copy is managed by seed pipeline; edit in profiles/responses.</p>
              </div>
            ) : drawerTab === "history" && detail ? (
              <div>
                {detail.history.length === 0 ? (
                  <p>No override history.</p>
                ) : (
                  <ul style={{ listStyle: "none", padding: 0 }}>
                    {detail.history.map((h) => (
                      <li key={h.version} style={{ marginBottom: 12, padding: 8, background: "#f5f5f5", borderRadius: 4 }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                          <span>Version {h.version} {h.active ? "(active)" : ""}</span>
                          {!h.active && (
                            <button
                              type="button"
                              className="btn-secondary"
                              onClick={() => restoreVersion(h.dimensions)}
                              disabled={saving}
                            >
                              Restore
                            </button>
                          )}
                        </div>
                        {h.note && <p style={{ margin: 4, fontSize: 12, color: "#666" }}>{h.note}</p>}
                        {h.created_at && <p style={{ margin: 4, fontSize: 11, color: "#999" }}>{h.created_at}</p>}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            ) : null}
          </div>
        </div>
      )}
    </div>
  );
}
