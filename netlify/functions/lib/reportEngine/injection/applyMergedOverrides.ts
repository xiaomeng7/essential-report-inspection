import type {
  ContentContribution,
  ReportPlan,
  ReportEngineInjectionFlags,
  ReportEngineInjectionMode,
} from "../types";
import {
  buildFindingPagesHtmlFromMerged,
  validateMergedFindingPagesHtml,
} from "../findings/buildFindingPagesHtmlFromMerged";

export type SlotSource = {
  source: "legacy" | "merged";
  reason?: string;
};

export type SlotSourceMap = Record<string, SlotSource>;

export type ApplyMergedOverridesOptions = {
  mode?: ReportEngineInjectionMode;
  injection?: Partial<ReportEngineInjectionFlags>;
  hasExplicitModules?: boolean;
  inspectionId?: string;
  baseUrl?: string;
  signingSecret?: string;
};

export type ApplyMergedOverridesResult<T extends Record<string, unknown>> = {
  templateData: T;
  slotSourceMap: SlotSourceMap;
  injection: ReportEngineInjectionFlags;
};

export const INJECTION_REASON = {
  DEFAULT_LEGACY_MODE: "DEFAULT_LEGACY_MODE",
  INJECTION_FLAG_DISABLED: "INJECTION_FLAG_DISABLED",
  NO_EXPLICIT_MODULES: "NO_EXPLICIT_MODULES",
  MERGED_WTM_APPLIED: "MERGED_WTM_APPLIED",
  MERGED_WTM_EMPTY: "MERGED_WTM_EMPTY",
  MERGED_EXEC_APPLIED: "MERGED_EXEC_APPLIED",
  MERGED_EXEC_EMPTY: "MERGED_EXEC_EMPTY",
  MERGED_CAPEX_APPLIED: "MERGED_CAPEX_APPLIED",
  MERGED_CAPEX_EMPTY: "MERGED_CAPEX_EMPTY",
  MERGED_FINDINGS_APPLIED: "MERGED_FINDINGS_APPLIED",
  MERGED_FINDINGS_VALIDATION_FAILED: "MERGED_FINDINGS_VALIDATION_FAILED",
} as const;

function toBulletLines(items: string[], bullet: "dash" | "dot"): string {
  const normalized = items
    .map((s) => String(s || "").trim())
    .filter((s) => s.length > 0)
    .map((s) => s.replace(/^[-*•]\s+/, "").trim());
  if (normalized.length === 0) return "";
  const prefix = bullet === "dot" ? "• " : "- ";
  return normalized.map((s) => `${prefix}${s}`).join("\n");
}

type CapexRowLike = Pick<
  ContentContribution,
  "key" | "text" | "rowKey" | "sortKey" | "moduleId" | "amountLow" | "amountHigh" | "currency" | "amountIsTbd"
> & { priority?: string };

function priorityRank(priority?: string): number {
  const p = String(priority || "").toUpperCase();
  if (p === "IMMEDIATE" || p === "URGENT") return 1;
  if (p === "RECOMMENDED" || p === "RECOMMENDED_0_3_MONTHS") return 2;
  if (p === "PLAN" || p === "PLAN_MONITOR") return 3;
  return 99;
}

function rowKeyFallback(row: CapexRowLike): string {
  const raw = (row.key || row.text || "capex-row").toLowerCase().replace(/\|/g, " ");
  const slug = raw.replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 64) || "row";
  return `capex:${row.moduleId || "unknown"}:${slug}`;
}

function resolveAmountBand(row: CapexRowLike): { low: number; high: number; currency: string } | undefined {
  if (row.amountIsTbd === true) return undefined;
  if (typeof row.amountLow === "number" || typeof row.amountHigh === "number") {
    const low = typeof row.amountLow === "number" ? row.amountLow : 0;
    const high = typeof row.amountHigh === "number" ? row.amountHigh : low;
    if (Number.isFinite(low) && Number.isFinite(high)) {
      return { low, high, currency: row.currency || "AUD" };
    }
  }
  const parsed = parseMoneyBand(String(row.text || ""));
  if (!parsed) return undefined;
  return { ...parsed, currency: row.currency || "AUD" };
}

export function dedupeCapexRows(rows: CapexRowLike[]): CapexRowLike[] {
  const sorted = [...rows].sort((a, b) => {
    const pa = priorityRank(a.priority);
    const pb = priorityRank(b.priority);
    if (pa !== pb) return pa - pb;
    const sa = a.sortKey ?? rowKeyFallback(a);
    const sb = b.sortKey ?? rowKeyFallback(b);
    return sa.localeCompare(sb);
  });

  const byRowKey = new Map<string, CapexRowLike>();
  for (const row of sorted) {
    const key = row.rowKey && row.rowKey.startsWith("capex:") ? row.rowKey : rowKeyFallback(row);
    const existing = byRowKey.get(key);
    if (!existing) {
      byRowKey.set(key, { ...row, rowKey: key });
      continue;
    }
    const winner = [existing, { ...row, rowKey: key }].sort((a, b) => {
      const pa = priorityRank(a.priority);
      const pb = priorityRank(b.priority);
      if (pa !== pb) return pa - pb;
      const sa = a.sortKey ?? a.rowKey ?? "";
      const sb = b.sortKey ?? b.rowKey ?? "";
      return sa.localeCompare(sb);
    })[0];
    byRowKey.set(key, winner);
  }
  return [...byRowKey.values()].sort((a, b) => {
    const pa = priorityRank(a.priority);
    const pb = priorityRank(b.priority);
    if (pa !== pb) return pa - pb;
    const sa = a.sortKey ?? a.rowKey ?? "";
    const sb = b.sortKey ?? b.rowKey ?? "";
    return sa.localeCompare(sb);
  });
}

function parseMoneyBand(text: string): { low: number; high: number } | undefined {
  const match = text.match(/\$\s*([0-9][0-9,]*)\s*-\s*\$\s*([0-9][0-9,]*)/i);
  if (!match) return undefined;
  const low = Number(match[1].replace(/,/g, ""));
  const high = Number(match[2].replace(/,/g, ""));
  if (!Number.isFinite(low) || !Number.isFinite(high)) return undefined;
  return { low, high };
}

export function computeCapexSnapshotFromRows(rows: CapexRowLike[]): string {
  const bands = rows
    .map((r) => resolveAmountBand(r))
    .filter(Boolean) as Array<{ low: number; high: number; currency: string }>;
  if (bands.length === 0) return "TBD (site dependent)";
  const totalLow = bands.reduce((s, b) => s + b.low, 0);
  const totalHigh = bands.reduce((s, b) => s + b.high, 0);
  const currency = bands[0].currency || "AUD";
  return `${currency} $${totalLow.toLocaleString("en-AU")} - $${totalHigh.toLocaleString("en-AU")} (indicative, planning only)`;
}

function parseMarkdownRow(text: string): { year: string; item: string; cost: string } | undefined {
  const trimmed = String(text || "").trim();
  if (!trimmed.startsWith("|")) return undefined;
  const parts = trimmed.split("|").map((x) => x.trim()).filter((x) => x.length > 0);
  if (parts.length < 3) return undefined;
  return {
    year: parts[0],
    item: parts[1],
    cost: parts[2],
  };
}

export function renderCapexRowsMarkdown(rows: CapexRowLike[]): string {
  const rendered = rows.map((r) => parseMarkdownRow(r.text)).filter(Boolean) as Array<{ year: string; item: string; cost: string }>;
  if (rendered.length === 0) return "";
  return rendered.map((r) => `| ${r.year} | ${r.item} | ${r.cost} |`).join("\n");
}

export function resolveInjectionFlags(
  mode?: ReportEngineInjectionMode,
  injection?: Partial<ReportEngineInjectionFlags>
): ReportEngineInjectionFlags {
  const fromMode: ReportEngineInjectionFlags =
    mode === "merged_what_this_means"
      ? { whatThisMeans: true, executive: false, capex: false, findings: false }
      : mode === "merged_exec+wtm"
      ? { whatThisMeans: true, executive: true, capex: false, findings: false }
      : mode === "merged_all"
      ? { whatThisMeans: true, executive: true, capex: true, findings: true }
      : { whatThisMeans: false, executive: false, capex: false, findings: false };

  return {
    whatThisMeans: injection?.whatThisMeans ?? fromMode.whatThisMeans,
    executive: injection?.executive ?? fromMode.executive,
    capex: injection?.capex ?? fromMode.capex,
    findings: injection?.findings ?? fromMode.findings,
  };
}

export function applyMergedOverrides<T extends Record<string, unknown>>(
  templateData: T,
  plan: ReportPlan,
  options: ApplyMergedOverridesOptions = {}
): ApplyMergedOverridesResult<T> {
  const injection = resolveInjectionFlags(options.mode, options.injection);
  const next = { ...templateData } as T;
  const slotSourceMap: SlotSourceMap = {
    WHAT_THIS_MEANS_SECTION: { source: "legacy", reason: INJECTION_REASON.DEFAULT_LEGACY_MODE },
    EXECUTIVE_DECISION_SIGNALS: { source: "legacy", reason: INJECTION_REASON.DEFAULT_LEGACY_MODE },
    EXEC_SUMMARY_TEXT: { source: "legacy", reason: INJECTION_REASON.DEFAULT_LEGACY_MODE },
    EXECUTIVE_SUMMARY: { source: "legacy", reason: INJECTION_REASON.DEFAULT_LEGACY_MODE },
    CAPEX_TABLE_ROWS: { source: "legacy", reason: INJECTION_REASON.DEFAULT_LEGACY_MODE },
    CAPEX_SNAPSHOT: { source: "legacy", reason: INJECTION_REASON.DEFAULT_LEGACY_MODE },
    FINDING_PAGES_HTML: { source: "legacy", reason: INJECTION_REASON.DEFAULT_LEGACY_MODE },
  };

  if (injection.whatThisMeans) {
    const mergedWtm = toBulletLines(plan.merged.whatThisMeans.map((x) => x.text), "dash");
    if (mergedWtm) {
      (next as Record<string, unknown>).WHAT_THIS_MEANS_SECTION = mergedWtm;
      (next as Record<string, unknown>).WHAT_THIS_MEANS_TEXT = mergedWtm;
      slotSourceMap.WHAT_THIS_MEANS_SECTION = { source: "merged", reason: INJECTION_REASON.MERGED_WTM_APPLIED };
    } else {
      slotSourceMap.WHAT_THIS_MEANS_SECTION = { source: "legacy", reason: INJECTION_REASON.MERGED_WTM_EMPTY };
    }
  } else {
    slotSourceMap.WHAT_THIS_MEANS_SECTION = { source: "legacy", reason: INJECTION_REASON.INJECTION_FLAG_DISABLED };
  }

  if (injection.executive) {
    const mergedExecBullets = toBulletLines(plan.merged.executiveSummary.map((x) => x.text), "dot");
    if (mergedExecBullets) {
      (next as Record<string, unknown>).EXECUTIVE_DECISION_SIGNALS = mergedExecBullets;
      (next as Record<string, unknown>).EXEC_SUMMARY_TEXT = mergedExecBullets;
      (next as Record<string, unknown>).EXECUTIVE_SUMMARY = plan.merged.executiveSummary.map((x) => x.text).join(" ");
      slotSourceMap.EXECUTIVE_DECISION_SIGNALS = { source: "merged", reason: INJECTION_REASON.MERGED_EXEC_APPLIED };
      slotSourceMap.EXEC_SUMMARY_TEXT = { source: "merged", reason: INJECTION_REASON.MERGED_EXEC_APPLIED };
      slotSourceMap.EXECUTIVE_SUMMARY = { source: "merged", reason: INJECTION_REASON.MERGED_EXEC_APPLIED };
    } else {
      slotSourceMap.EXECUTIVE_DECISION_SIGNALS = { source: "legacy", reason: INJECTION_REASON.MERGED_EXEC_EMPTY };
      slotSourceMap.EXEC_SUMMARY_TEXT = { source: "legacy", reason: INJECTION_REASON.MERGED_EXEC_EMPTY };
      slotSourceMap.EXECUTIVE_SUMMARY = { source: "legacy", reason: INJECTION_REASON.MERGED_EXEC_EMPTY };
    }
  } else {
    slotSourceMap.EXECUTIVE_DECISION_SIGNALS = { source: "legacy", reason: INJECTION_REASON.INJECTION_FLAG_DISABLED };
    slotSourceMap.EXEC_SUMMARY_TEXT = { source: "legacy", reason: INJECTION_REASON.INJECTION_FLAG_DISABLED };
    slotSourceMap.EXECUTIVE_SUMMARY = { source: "legacy", reason: INJECTION_REASON.INJECTION_FLAG_DISABLED };
  }

  // Phase 6.5 safety strategy:
  // if modules are not explicitly selected, keep capex on legacy even if inject_capex is true.
  if (injection.capex) {
    const allowCapexSwitch = options.hasExplicitModules === true;
    if (allowCapexSwitch) {
      const mergedRows = dedupeCapexRows(plan.merged.capexRows);
      const rowsMarkdown = renderCapexRowsMarkdown(mergedRows);
      if (rowsMarkdown) {
        (next as Record<string, unknown>).CAPEX_TABLE_ROWS = rowsMarkdown;
        (next as Record<string, unknown>).CAPEX_SNAPSHOT = computeCapexSnapshotFromRows(mergedRows);
        slotSourceMap.CAPEX_TABLE_ROWS = { source: "merged", reason: INJECTION_REASON.MERGED_CAPEX_APPLIED };
        slotSourceMap.CAPEX_SNAPSHOT = { source: "merged", reason: INJECTION_REASON.MERGED_CAPEX_APPLIED };
      } else {
        slotSourceMap.CAPEX_TABLE_ROWS = { source: "legacy", reason: INJECTION_REASON.MERGED_CAPEX_EMPTY };
        slotSourceMap.CAPEX_SNAPSHOT = { source: "legacy", reason: INJECTION_REASON.MERGED_CAPEX_EMPTY };
      }
    } else {
      slotSourceMap.CAPEX_TABLE_ROWS = { source: "legacy", reason: INJECTION_REASON.NO_EXPLICIT_MODULES };
      slotSourceMap.CAPEX_SNAPSHOT = { source: "legacy", reason: INJECTION_REASON.NO_EXPLICIT_MODULES };
    }
  } else {
    slotSourceMap.CAPEX_TABLE_ROWS = { source: "legacy", reason: INJECTION_REASON.INJECTION_FLAG_DISABLED };
    slotSourceMap.CAPEX_SNAPSHOT = { source: "legacy", reason: INJECTION_REASON.INJECTION_FLAG_DISABLED };
  }
  if (injection.findings) {
    const allowFindingsSwitch = options.hasExplicitModules === true;
    if (allowFindingsSwitch) {
      const mergedHtml = buildFindingPagesHtmlFromMerged(plan.merged.findings, {
        inspectionId: options.inspectionId,
        baseUrl: options.baseUrl,
        signingSecret: options.signingSecret,
      });
      const validation = validateMergedFindingPagesHtml(mergedHtml, plan.merged.findings.length || 0);
      if (validation.valid) {
        (next as Record<string, unknown>).FINDING_PAGES_HTML = mergedHtml;
        slotSourceMap.FINDING_PAGES_HTML = { source: "merged", reason: INJECTION_REASON.MERGED_FINDINGS_APPLIED };
      } else {
        slotSourceMap.FINDING_PAGES_HTML = {
          source: "legacy",
          reason: `${INJECTION_REASON.MERGED_FINDINGS_VALIDATION_FAILED}:${validation.errors[0] || "unknown"}`,
        };
      }
    } else {
      slotSourceMap.FINDING_PAGES_HTML = { source: "legacy", reason: INJECTION_REASON.NO_EXPLICIT_MODULES };
    }
  } else {
    slotSourceMap.FINDING_PAGES_HTML = { source: "legacy", reason: INJECTION_REASON.INJECTION_FLAG_DISABLED };
  }

  return { templateData: next, slotSourceMap, injection };
}
