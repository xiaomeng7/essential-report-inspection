import { useMemo, useState, type ChangeEvent, type DragEvent } from "react";

type Props = {
  onBack: () => void;
};

type SlotSource = {
  source?: "legacy" | "merged";
  reason?: string;
};

type ReportEngineTelemetryRecord = {
  reportId?: string;
  profile?: string;
  modules?: string[];
  injectionMode?: string;
  slotSourceMap?: Record<string, SlotSource>;
  fallbackReasons?: string[];
  mergedMetrics?: {
    findingsCount?: number;
    capexRowCount?: number;
    capexTbdCount?: number;
  };
  validationFlags?: {
    mergedFindingsValidationPassed?: boolean;
    mergedCapexValidationPassed?: boolean;
  };
  timestamp?: number;
};

type PreflightSummaryEntry = {
  profile?: string;
  summary?: {
    severity?: "none" | "low" | "medium" | "high" | string;
    baselineComplete?: boolean;
    enhancedComplete?: boolean;
    subscriptionLead?: boolean;
    warningCounts?: Record<string, number>;
  };
};

const TELEMETRY_PREFIX = "[REPORT_ENGINE_TELEMETRY]";
const PREFLIGHT_PREFIX = "[report-preflight-summary]";

function toPercent(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}

function safeParseLineJson<T>(line: string, prefix: string): T | null {
  if (!line.includes(prefix)) return null;
  const idx = line.indexOf(prefix);
  const jsonPart = line.slice(idx + prefix.length).trim();
  if (!jsonPart) return null;
  try {
    return JSON.parse(jsonPart) as T;
  } catch {
    return null;
  }
}

function collectTelemetry(lines: string[]): ReportEngineTelemetryRecord[] {
  const out: ReportEngineTelemetryRecord[] = [];
  for (const line of lines) {
    const parsed = safeParseLineJson<ReportEngineTelemetryRecord>(line, TELEMETRY_PREFIX);
    if (parsed) out.push(parsed);
  }
  return out;
}

function collectPreflight(lines: string[]): PreflightSummaryEntry[] {
  const out: PreflightSummaryEntry[] = [];
  for (const line of lines) {
    const parsed = safeParseLineJson<PreflightSummaryEntry>(line, PREFLIGHT_PREFIX);
    if (parsed) out.push(parsed);
  }
  return out;
}

function downloadTextFile(filename: string, content: string, mimeType: string): void {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
}

export function AdminTelemetryPage({ onBack }: Props) {
  const [rawLogs, setRawLogs] = useState("");
  const [loadedFiles, setLoadedFiles] = useState<string[]>([]);
  const [loadingFiles, setLoadingFiles] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  const readAndSetFiles = async (files: File[]) => {
    setLoadingFiles(true);
    setLoadError(null);
    try {
      const texts = await Promise.all(files.map(async (file) => file.text()));
      setRawLogs(texts.join("\n"));
      setLoadedFiles(files.map((f) => f.name));
    } catch (err) {
      setLoadError((err as Error).message || "Failed to read selected files");
    } finally {
      setLoadingFiles(false);
    }
  };

  const handleLogFilesSelected = async (event: ChangeEvent<HTMLInputElement>) => {
    const fileList = event.target.files;
    if (!fileList || fileList.length === 0) return;
    await readAndSetFiles(Array.from(fileList));
    event.target.value = "";
  };

  const handleDrop = async (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setIsDragging(false);
    const files = Array.from(event.dataTransfer.files || []).filter((f) =>
      f.name.toLowerCase().endsWith(".log") || f.name.toLowerCase().endsWith(".txt")
    );
    if (files.length === 0) {
      setLoadError("Only .log or .txt files are supported.");
      return;
    }
    await readAndSetFiles(files);
  };

  const parsed = useMemo(() => {
    const lines = rawLogs.split(/\r?\n/);
    const telemetry = collectTelemetry(lines);
    const preflight = collectPreflight(lines);

    const totalReports = telemetry.length;
    const safeTotal = totalReports > 0 ? totalReports : 1;
    const countMode = (mode: string) => telemetry.filter((t) => t.injectionMode === mode).length;
    const slotMergedCount = (slot: string) =>
      telemetry.filter((t) => t.slotSourceMap?.[slot]?.source === "merged").length;
    const fallbackReasonMap = new Map<string, number>();
    const warningCodeMap = new Map<string, number>();

    let capexRows = 0;
    let capexTbd = 0;
    let findingsValidationFailed = 0;
    let energyCount = 0;
    let lifecycleCount = 0;
    let energyLifecycleBothCount = 0;

    for (const row of telemetry) {
      for (const reason of row.fallbackReasons ?? []) {
        fallbackReasonMap.set(reason, (fallbackReasonMap.get(reason) ?? 0) + 1);
      }
      capexRows += row.mergedMetrics?.capexRowCount ?? 0;
      capexTbd += row.mergedMetrics?.capexTbdCount ?? 0;
      if (row.validationFlags?.mergedFindingsValidationPassed === false) findingsValidationFailed += 1;
      const modules = row.modules ?? [];
      const hasEnergy = modules.includes("energy");
      const hasLifecycle = modules.includes("lifecycle");
      if (hasEnergy) energyCount += 1;
      if (hasLifecycle) lifecycleCount += 1;
      if (hasEnergy && hasLifecycle) energyLifecycleBothCount += 1;
    }

    let preflightHighSeverity = 0;
    let preflightBaselineComplete = 0;
    let preflightEnhancedComplete = 0;
    let preflightSubscriptionLead = 0;
    for (const row of preflight) {
      if (row.summary?.severity === "high") preflightHighSeverity += 1;
      if (row.summary?.baselineComplete === true) preflightBaselineComplete += 1;
      if (row.summary?.enhancedComplete === true) preflightEnhancedComplete += 1;
      if (row.summary?.subscriptionLead === true) preflightSubscriptionLead += 1;
      for (const [code, count] of Object.entries(row.summary?.warningCounts ?? {})) {
        warningCodeMap.set(code, (warningCodeMap.get(code) ?? 0) + Number(count || 0));
      }
    }

    return {
      linesTotal: lines.length,
      telemetry,
      preflight,
      totalReports,
      injectionRatio: {
        legacy: countMode("legacy") / safeTotal,
        mergedExecWtm: countMode("merged_exec+wtm") / safeTotal,
        mergedAll: countMode("merged_all") / safeTotal,
      },
      slotCoverage: {
        wtm: slotMergedCount("WHAT_THIS_MEANS_SECTION") / safeTotal,
        exec: slotMergedCount("EXECUTIVE_DECISION_SIGNALS") / safeTotal,
        capex: slotMergedCount("CAPEX_TABLE_ROWS") / safeTotal,
        findings: slotMergedCount("FINDING_PAGES_HTML") / safeTotal,
      },
      fallbackTop: [...fallbackReasonMap.entries()]
        .map(([reason, count]) => ({ reason, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 8),
      moduleUsage: {
        energyCount,
        lifecycleCount,
        energyLifecycleBothRatio: energyLifecycleBothCount / safeTotal,
      },
      capexTbdRatio: capexRows > 0 ? capexTbd / capexRows : 0,
      findingsValidationFailureRatio: findingsValidationFailed / safeTotal,
      preflightKpi: {
        count: preflight.length,
        highSeverityRate: preflight.length > 0 ? preflightHighSeverity / preflight.length : 0,
        baselineCompletionRate: preflight.length > 0 ? preflightBaselineComplete / preflight.length : 0,
        enhancedCompletionRate: preflight.length > 0 ? preflightEnhancedComplete / preflight.length : 0,
        subscriptionLeadRate: preflight.length > 0 ? preflightSubscriptionLead / preflight.length : 0,
        topWarningCodes: [...warningCodeMap.entries()]
          .map(([code, count]) => ({ code, count }))
          .sort((a, b) => b.count - a.count)
          .slice(0, 8),
      },
    };
  }, [rawLogs]);

  const handleExportJson = () => {
    const payload = {
      meta: {
        generatedAt: new Date().toISOString(),
        sourceLines: parsed.linesTotal,
      },
      summary: parsed,
    };
    const filename = `telemetry-dashboard-${new Date().toISOString().slice(0, 10)}.json`;
    downloadTextFile(filename, JSON.stringify(payload, null, 2), "application/json");
  };

  const handleExportMarkdown = () => {
    const md = [
      "# Telemetry Dashboard Export",
      "",
      `Generated at: ${new Date().toISOString()}`,
      `Source lines: ${parsed.linesTotal}`,
      `Engine telemetry records: ${parsed.telemetry.length}`,
      `Preflight summaries: ${parsed.preflight.length}`,
      "",
      "## Core KPI",
      `- Total reports: ${parsed.totalReports}`,
      `- CapEx TBD ratio: ${toPercent(parsed.capexTbdRatio)}`,
      `- Findings validation fail: ${toPercent(parsed.findingsValidationFailureRatio)}`,
      "",
      "## Injection ratio",
      `- legacy: ${toPercent(parsed.injectionRatio.legacy)}`,
      `- merged_exec+wtm: ${toPercent(parsed.injectionRatio.mergedExecWtm)}`,
      `- merged_all: ${toPercent(parsed.injectionRatio.mergedAll)}`,
      "",
      "## Slot coverage",
      `- WHAT_THIS_MEANS merged: ${toPercent(parsed.slotCoverage.wtm)}`,
      `- EXEC merged: ${toPercent(parsed.slotCoverage.exec)}`,
      `- CAPEX merged: ${toPercent(parsed.slotCoverage.capex)}`,
      `- FINDINGS merged: ${toPercent(parsed.slotCoverage.findings)}`,
      "",
      "## Module usage",
      `- energy count: ${parsed.moduleUsage.energyCount}`,
      `- lifecycle count: ${parsed.moduleUsage.lifecycleCount}`,
      `- energy+lifecycle ratio: ${toPercent(parsed.moduleUsage.energyLifecycleBothRatio)}`,
      "",
      "## Top fallback reasons",
      ...(parsed.fallbackTop.length > 0
        ? parsed.fallbackTop.map((item) => `- ${item.reason}: ${item.count}`)
        : ["- none"]),
      "",
      "## Preflight KPI",
      `- records: ${parsed.preflightKpi.count}`,
      `- high severity rate: ${toPercent(parsed.preflightKpi.highSeverityRate)}`,
      `- baseline completion rate: ${toPercent(parsed.preflightKpi.baselineCompletionRate)}`,
      `- enhanced completion rate: ${toPercent(parsed.preflightKpi.enhancedCompletionRate)}`,
      `- subscription lead rate: ${toPercent(parsed.preflightKpi.subscriptionLeadRate)}`,
      "",
      "## Top warning codes",
      ...(parsed.preflightKpi.topWarningCodes.length > 0
        ? parsed.preflightKpi.topWarningCodes.map((item) => `- ${item.code}: ${item.count}`)
        : ["- none"]),
      "",
    ].join("\n");
    const filename = `telemetry-dashboard-${new Date().toISOString().slice(0, 10)}.md`;
    downloadTextFile(filename, md, "text/markdown");
  };

  return (
    <div className="app" style={{ maxWidth: 1200, margin: "0 auto", padding: "20px" }}>
      <div
        style={{
          backgroundColor: "#e3f2fd",
          padding: "16px",
          borderRadius: "8px",
          marginBottom: "20px",
          border: "2px solid #2196f3",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <h1 style={{ margin: 0, color: "#1976d2" }}>📊 Report Telemetry Dashboard</h1>
            <p style={{ margin: "8px 0 0 0", fontSize: "14px", color: "#666" }}>
              Paste runtime logs containing <code>[REPORT_ENGINE_TELEMETRY]</code> /{" "}
              <code>[report-preflight-summary]</code>.
            </p>
          </div>
          <div style={{ display: "flex", gap: "10px" }}>
            <button
              className="btn-secondary"
              onClick={() => {
                window.history.replaceState(null, "", "/admin/config");
              }}
            >
              Go to Config
            </button>
            <button onClick={onBack} className="btn-secondary">
              Back to home
            </button>
          </div>
        </div>
      </div>

      <div style={{ marginBottom: 16 }}>
        <div style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 10, flexWrap: "wrap" }}>
          <label
            className="btn-secondary"
            style={{ display: "inline-flex", alignItems: "center", minHeight: 36, padding: "8px 12px" }}
          >
            {loadingFiles ? "Reading..." : "Select log files"}
            <input
              type="file"
              accept=".log,.txt,text/plain"
              multiple
              onChange={handleLogFilesSelected}
              style={{ display: "none" }}
              disabled={loadingFiles}
            />
          </label>
          <button
            className="btn-secondary"
            onClick={() => {
              setRawLogs("");
              setLoadedFiles([]);
              setLoadError(null);
            }}
            disabled={!rawLogs}
          >
            Clear
          </button>
          {loadedFiles.length > 0 && (
            <span style={{ fontSize: 12, color: "#666" }}>Loaded: {loadedFiles.join(", ")}</span>
          )}
          <button className="btn-secondary" onClick={handleExportJson} disabled={!rawLogs}>
            Export JSON
          </button>
          <button className="btn-secondary" onClick={handleExportMarkdown} disabled={!rawLogs}>
            Export Markdown
          </button>
        </div>
        <div
          onDragOver={(event) => {
            event.preventDefault();
            setIsDragging(true);
          }}
          onDragLeave={(event) => {
            event.preventDefault();
            setIsDragging(false);
          }}
          onDrop={handleDrop}
          style={{
            border: isDragging ? "2px dashed #1976d2" : "2px dashed #cfd8dc",
            borderRadius: 8,
            backgroundColor: isDragging ? "#eef6ff" : "#fafafa",
            padding: "10px 12px",
            marginBottom: 10,
            fontSize: 12,
            color: "#666",
          }}
        >
          Drag and drop .log/.txt files here for auto parsing.
        </div>
        {loadError && (
          <div
            style={{
              padding: "10px 12px",
              backgroundColor: "#fee",
              border: "1px solid #fcc",
              borderRadius: 8,
              marginBottom: 10,
              color: "#b00020",
              fontSize: 12,
            }}
          >
            {loadError}
          </div>
        )}
        <textarea
          value={rawLogs}
          onChange={(e) => setRawLogs(e.target.value)}
          placeholder="Paste logs here, or use 'Select log files' for auto parsing..."
          style={{
            width: "100%",
            minHeight: 220,
            fontFamily: "monospace",
            fontSize: 12,
            lineHeight: 1.5,
            padding: 12,
            borderRadius: 8,
            border: "1px solid #ccc",
          }}
        />
        <p style={{ margin: "8px 0 0 0", fontSize: 12, color: "#666" }}>
          Parsed lines: {parsed.linesTotal} | Engine telemetry records: {parsed.telemetry.length} | Preflight
          summaries: {parsed.preflight.length}
        </p>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 12, marginBottom: 20 }}>
        <div style={{ background: "#fff", border: "1px solid #eee", borderRadius: 8, padding: 12 }}>
          <strong>Total reports</strong>
          <div style={{ fontSize: 24, marginTop: 4 }}>{parsed.totalReports}</div>
        </div>
        <div style={{ background: "#fff", border: "1px solid #eee", borderRadius: 8, padding: 12 }}>
          <strong>CapEx TBD ratio</strong>
          <div style={{ fontSize: 24, marginTop: 4 }}>{toPercent(parsed.capexTbdRatio)}</div>
        </div>
        <div style={{ background: "#fff", border: "1px solid #eee", borderRadius: 8, padding: 12 }}>
          <strong>Findings validation fail</strong>
          <div style={{ fontSize: 24, marginTop: 4 }}>{toPercent(parsed.findingsValidationFailureRatio)}</div>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
        <div style={{ background: "#fff", border: "1px solid #ddd", borderRadius: 8, padding: 14 }}>
          <h3 style={{ marginTop: 0 }}>Injection ratio</h3>
          <p>legacy: {toPercent(parsed.injectionRatio.legacy)}</p>
          <p>merged_exec+wtm: {toPercent(parsed.injectionRatio.mergedExecWtm)}</p>
          <p>merged_all: {toPercent(parsed.injectionRatio.mergedAll)}</p>
          <h4>Slot coverage</h4>
          <p>WTM merged: {toPercent(parsed.slotCoverage.wtm)}</p>
          <p>EXEC merged: {toPercent(parsed.slotCoverage.exec)}</p>
          <p>CAPEX merged: {toPercent(parsed.slotCoverage.capex)}</p>
          <p>FINDINGS merged: {toPercent(parsed.slotCoverage.findings)}</p>
        </div>

        <div style={{ background: "#fff", border: "1px solid #ddd", borderRadius: 8, padding: 14 }}>
          <h3 style={{ marginTop: 0 }}>Module usage</h3>
          <p>energy count: {parsed.moduleUsage.energyCount}</p>
          <p>lifecycle count: {parsed.moduleUsage.lifecycleCount}</p>
          <p>energy+lifecycle ratio: {toPercent(parsed.moduleUsage.energyLifecycleBothRatio)}</p>
          <h4>Top fallback reasons</h4>
          {parsed.fallbackTop.length === 0 ? (
            <p style={{ color: "#666" }}>No fallback reasons found.</p>
          ) : (
            <ul>
              {parsed.fallbackTop.map((item) => (
                <li key={item.reason}>
                  {item.reason}: {item.count}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      <div style={{ background: "#fff", border: "1px solid #ddd", borderRadius: 8, padding: 14, marginTop: 16 }}>
        <h3 style={{ marginTop: 0 }}>Preflight summary (from logs)</h3>
        <p>records: {parsed.preflightKpi.count}</p>
        <p>high severity rate: {toPercent(parsed.preflightKpi.highSeverityRate)}</p>
        <p>baseline completion rate: {toPercent(parsed.preflightKpi.baselineCompletionRate)}</p>
        <p>enhanced completion rate: {toPercent(parsed.preflightKpi.enhancedCompletionRate)}</p>
        <p>subscription lead rate: {toPercent(parsed.preflightKpi.subscriptionLeadRate)}</p>
        <h4>Top warning codes</h4>
        {parsed.preflightKpi.topWarningCodes.length === 0 ? (
          <p style={{ color: "#666" }}>No warning codes found.</p>
        ) : (
          <ul>
            {parsed.preflightKpi.topWarningCodes.map((row) => (
              <li key={row.code}>
                {row.code}: {row.count}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
