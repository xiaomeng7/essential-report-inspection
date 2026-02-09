/**
 * Admin UI: edit Custom 9 dimensions per finding. Search/filter, versioning, bulk apply preset.
 * Data flow: DB (finding_definitions + finding_custom_dimensions) -> API -> this UI.
 * Report generation still reads from Blob/config; DB can be synced to config or read at runtime later.
 */

import { useState, useEffect, useCallback } from "react";

const ADMIN_TOKEN_KEY = "admin_token";

type FindingRow = {
  finding_id: string;
  title_en: string;
  system_group: string | null;
  space_group: string | null;
  tags: string[] | null;
  safety: string | null;
  urgency: string | null;
  liability: string | null;
  budget_low: number | null;
  budget_high: number | null;
  priority: string | null;
  severity: number | null;
  likelihood: number | null;
  escalation: string | null;
  needs_review: boolean | null;
  version: number | null;
  is_active: boolean | null;
};

type Preset = {
  id: string;
  name: string;
  safety: string | null;
  urgency: string | null;
  liability: string | null;
  budget_low: number | null;
  budget_high: number | null;
  priority: string | null;
  severity: number | null;
  likelihood: number | null;
  escalation: string | null;
};

const SAFETY_OPTS = ["HIGH", "MODERATE", "LOW"];
const URGENCY_OPTS = ["IMMEDIATE", "SHORT_TERM", "LONG_TERM"];
const LIABILITY_OPTS = ["HIGH", "MEDIUM", "LOW"];
const PRIORITY_OPTS = ["IMMEDIATE", "RECOMMENDED_0_3_MONTHS", "PLAN_MONITOR"];
const ESCALATION_OPTS = ["HIGH", "MODERATE", "LOW"];

export function AdminFindingsDimensionsPage({ onBack }: { onBack: () => void }) {
  const [token, setToken] = useState(() => typeof localStorage !== "undefined" ? localStorage.getItem(ADMIN_TOKEN_KEY) ?? "" : "");
  const [findings, setFindings] = useState<FindingRow[]>([]);
  const [presets, setPresets] = useState<Preset[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [systemGroup, setSystemGroup] = useState("");
  const [tagFilter, setTagFilter] = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [editingFinding, setEditingFinding] = useState<FindingRow | null>(null);
  const [editDims, setEditDims] = useState<Partial<FindingRow>>({});
  const [saving, setSaving] = useState(false);
  const [bulkPresetId, setBulkPresetId] = useState("");

  const fetchFindings = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (query) params.set("query", query);
      if (systemGroup) params.set("system_group", systemGroup);
      if (tagFilter) params.set("tag", tagFilter);
      const res = await fetch(`/api/admin/findings?${params}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error(await res.text());
      const data = (await res.json()) as { findings: FindingRow[] };
      setFindings(data.findings ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setFindings([]);
    } finally {
      setLoading(false);
    }
  }, [token, query, systemGroup, tagFilter]);

  const fetchPresets = useCallback(async () => {
    if (!token) return;
    try {
      const res = await fetch("/api/admin/dimensions/presets", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = (await res.json()) as { presets: Preset[] };
        setPresets(data.presets ?? []);
      }
    } catch {
      setPresets([]);
    }
  }, [token]);

  useEffect(() => {
    if (token) {
      fetchFindings();
      fetchPresets();
    } else {
      setLoading(false);
    }
  }, [token, fetchFindings, fetchPresets]);

  const saveDimensions = async (finding_id: string, dims: Partial<FindingRow>) => {
    setSaving(true);
    try {
      const res = await fetch(`/api/admin/findings/${finding_id}/dimensions`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          ...dims,
          updated_by: "admin-ui",
          needs_review: false,
        }),
      });
      if (!res.ok) throw new Error(await res.text());
      setEditingFinding(null);
      setEditDims({});
      await fetchFindings();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

  const bulkApply = async () => {
    if (selectedIds.size === 0 || !bulkPresetId) return;
    setSaving(true);
    try {
      const res = await fetch("/api/admin/findings/bulkDimensions", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ finding_ids: Array.from(selectedIds), preset_id: bulkPresetId }),
      });
      if (!res.ok) throw new Error(await res.text());
      setSelectedIds(new Set());
      setBulkPresetId("");
      await fetchFindings();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

  const systemGroups = Array.from(new Set(findings.map((f) => f.system_group).filter(Boolean))) as string[];

  if (!token) {
    return (
      <div style={{ padding: 24, maxWidth: 400 }}>
        <h2>Admin: Finding 9 Dimensions</h2>
        <p>Use the same token as Config Admin (ADMIN_TOKEN).</p>
        <input
          type="password"
          placeholder="ADMIN_TOKEN"
          value={token}
          onChange={(e) => setToken(e.target.value)}
          onBlur={() => token && localStorage.setItem(ADMIN_TOKEN_KEY, token)}
          style={{ width: "100%", padding: 8, marginBottom: 12 }}
        />
        <button type="button" className="btn-primary" onClick={() => token && fetchFindings()}>
          Continue
        </button>
        <button type="button" className="btn-secondary" style={{ marginLeft: 8 }} onClick={onBack}>
          Back
        </button>
      </div>
    );
  }

  return (
    <div style={{ padding: 24 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 16, flexWrap: "wrap" }}>
        <h1 style={{ margin: 0 }}>Finding 9 Dimensions (DB)</h1>
        <button type="button" className="btn-secondary" onClick={onBack}>
          Back
        </button>
      </div>

      <div style={{ display: "flex", gap: 12, marginBottom: 16, flexWrap: "wrap" }}>
        <input
          type="text"
          placeholder="Search finding_id or title"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          style={{ padding: 8, minWidth: 200 }}
        />
        <select
          value={systemGroup}
          onChange={(e) => setSystemGroup(e.target.value)}
          style={{ padding: 8 }}
        >
          <option value="">All system groups</option>
          {systemGroups.map((g) => (
            <option key={g} value={g}>
              {g}
            </option>
          ))}
        </select>
        <input
          type="text"
          placeholder="Tag filter"
          value={tagFilter}
          onChange={(e) => setTagFilter(e.target.value)}
          style={{ padding: 8, width: 120 }}
        />
        <button type="button" className="btn-primary" onClick={fetchFindings}>
          Search
        </button>
      </div>

      {error && (
        <div style={{ padding: 12, background: "#ffebee", color: "#c62828", marginBottom: 16, borderRadius: 4 }}>
          {error}
        </div>
      )}

      <div style={{ marginBottom: 16, display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <span>Bulk apply preset:</span>
        <select
          value={bulkPresetId}
          onChange={(e) => setBulkPresetId(e.target.value)}
          style={{ padding: 8 }}
        >
          <option value="">Select preset</option>
          {presets.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
        <button
          type="button"
          className="btn-primary"
          onClick={bulkApply}
          disabled={selectedIds.size === 0 || !bulkPresetId || saving}
        >
          Apply to {selectedIds.size} selected
        </button>
      </div>

      {loading ? (
        <p>Loading…</p>
      ) : (
        <div style={{ overflowX: "auto" }}>
          <table style={{ borderCollapse: "collapse", width: "100%", fontSize: 14 }}>
            <thead>
              <tr style={{ background: "#f5f5f5" }}>
                <th style={{ padding: 8, textAlign: "left" }}>
                  <input
                    type="checkbox"
                    checked={findings.length > 0 && selectedIds.size === findings.length}
                    onChange={(e) =>
                      setSelectedIds(e.target.checked ? new Set(findings.map((f) => f.finding_id)) : new Set())
                    }
                  />
                </th>
                <th style={{ padding: 8, textAlign: "left" }}>finding_id</th>
                <th style={{ padding: 8, textAlign: "left" }}>title_en</th>
                <th style={{ padding: 8, textAlign: "left" }}>system_group</th>
                <th style={{ padding: 8, textAlign: "left" }}>priority</th>
                <th style={{ padding: 8, textAlign: "left" }}>safety</th>
                <th style={{ padding: 8, textAlign: "left" }}>version</th>
                <th style={{ padding: 8, textAlign: "left" }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {findings.map((f) => (
                <tr key={f.finding_id} style={{ borderBottom: "1px solid #eee" }}>
                  <td style={{ padding: 8 }}>
                    <input
                      type="checkbox"
                      checked={selectedIds.has(f.finding_id)}
                      onChange={(e) =>
                        setSelectedIds((prev) => {
                          const next = new Set(prev);
                          if (e.target.checked) next.add(f.finding_id);
                          else next.delete(f.finding_id);
                          return next;
                        })
                      }
                    />
                  </td>
                  <td style={{ padding: 8 }}>{f.finding_id}</td>
                  <td style={{ padding: 8, maxWidth: 200 }}>{f.title_en}</td>
                  <td style={{ padding: 8 }}>{f.system_group ?? "—"}</td>
                  <td style={{ padding: 8 }}>{f.priority ?? "—"}</td>
                  <td style={{ padding: 8 }}>{f.safety ?? "—"}</td>
                  <td style={{ padding: 8 }}>{f.version ?? "—"}</td>
                  <td style={{ padding: 8 }}>
                    <button
                      type="button"
                      className="btn-secondary"
                      onClick={() => {
                        setEditingFinding(f);
                        setEditDims({
                          safety: f.safety ?? undefined,
                          urgency: f.urgency ?? undefined,
                          liability: f.liability ?? undefined,
                          budget_low: f.budget_low ?? undefined,
                          budget_high: f.budget_high ?? undefined,
                          priority: f.priority ?? undefined,
                          severity: f.severity ?? undefined,
                          likelihood: f.likelihood ?? undefined,
                          escalation: f.escalation ?? undefined,
                        });
                      }}
                    >
                      Edit
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {editingFinding && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.4)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 1000,
          }}
          onClick={() => !saving && setEditingFinding(null)}
        >
          <div
            style={{ background: "#fff", padding: 24, borderRadius: 8, maxWidth: 480, width: "90%" }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3>Edit dimensions: {editingFinding.finding_id}</h3>
            <div style={{ display: "grid", gridTemplateColumns: "120px 1fr", gap: 8, marginTop: 12 }}>
              {(["safety", "urgency", "liability", "priority", "escalation"] as const).map((k) => (
                <div key={k}>
                  <label>{k}</label>
                  <select
                    value={(editDims[k] as string) ?? ""}
                    onChange={(e) => setEditDims((prev) => ({ ...prev, [k]: e.target.value }))}
                    style={{ width: "100%", padding: 6 }}
                  >
                    <option value="">—</option>
                    {(k === "safety" ? SAFETY_OPTS : k === "urgency" ? URGENCY_OPTS : k === "liability" ? LIABILITY_OPTS : k === "priority" ? PRIORITY_OPTS : ESCALATION_OPTS).map(
                      (o) => (
                        <option key={o} value={o}>
                          {o}
                        </option>
                      )
                    )}
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
                    value={(editDims[k] as number) ?? ""}
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
                    value={(editDims[k] as number) ?? ""}
                    onChange={(e) => setEditDims((prev) => ({ ...prev, [k]: e.target.value ? Number(e.target.value) : undefined }))}
                    style={{ width: "100%", padding: 6 }}
                  />
                </div>
              ))}
            </div>
            <div style={{ marginTop: 16, display: "flex", gap: 8 }}>
              <button
                type="button"
                className="btn-primary"
                disabled={saving}
                onClick={() => saveDimensions(editingFinding.finding_id, editDims)}
              >
                {saving ? "Saving…" : "Save (new version)"}
              </button>
              <button type="button" className="btn-secondary" disabled={saving} onClick={() => setEditingFinding(null)}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
