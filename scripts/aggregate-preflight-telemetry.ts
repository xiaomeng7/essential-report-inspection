import { promises as fs } from "node:fs";
import path from "node:path";

const PREFIX = "[report-preflight-summary]";

type ParsedEntry = {
  inspection_id?: string;
  profile?: string;
  modulesSelected?: string[];
  injected?: {
    exec?: boolean;
    wtm?: boolean;
    capex?: boolean;
    findings?: boolean;
  };
  timestamp?: number | string;
  summary?: {
    warningCounts?: Record<string, number>;
    severity?: "none" | "low" | "medium" | "high" | string;
    baselineComplete?: boolean;
    enhancedComplete?: boolean;
    assetsCoverage?: "observed" | "declared" | "unknown" | string;
    tariffSource?: "customer" | "default" | "missing" | string;
    circuitsCount?: number;
    enhancedSkipped?: boolean;
    enhancedSkipCode?: string;
    enhancedSkipNote?: string;
    subscriptionLead?: boolean;
    subscriptionLeadReasons?: string[];
  };
};

type AggregateStats = {
  totalReports: number;
  baselineCompletionRate: number;
  enhancedCompletionRate: number;
  defaultTariffRate: number;
  highSeverityRate: number;
  ownerHighSeverityRate: number;
  subscriptionLeadRate: number;
  ownerSubscriptionLeadRate: number;
  topWarningCodes: Array<{ code: string; count: number }>;
  topSubscriptionLeadReasons: Array<{ reason: string; count: number }>;
  topEnhancedSkipCodes: Array<{ code: string; count: number }>;
  severityBreakdown: Record<"none" | "low" | "medium" | "high", number>;
  circuitsCountStats: {
    min: number | null;
    avg: number | null;
    p50: number | null;
    p90: number | null;
    max: number | null;
  };
  assetsCoverageBreakdown: Record<"observed" | "declared" | "unknown", number>;
};

type AggregateOutput = {
  totalInputLines: number;
  parsedLines: number;
  skippedLines: number;
  overall: AggregateStats;
  byProfile: Record<string, AggregateStats>;
};

type CliArgs = {
  file?: string;
  dir?: string;
  json: boolean;
  out?: string;
  since?: string;
  until?: string;
};

function parseArgs(argv: string[]): CliArgs {
  const args: CliArgs = { json: false };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === "--file") args.file = argv[i + 1], i += 1;
    else if (a === "--dir") args.dir = argv[i + 1], i += 1;
    else if (a === "--json") args.json = true;
    else if (a === "--out") args.out = argv[i + 1], i += 1;
    else if (a === "--since") args.since = argv[i + 1], i += 1;
    else if (a === "--until") args.until = argv[i + 1], i += 1;
  }
  return args;
}

async function readStdin(): Promise<string> {
  const chunks: Buffer[] = [];
  return await new Promise<string>((resolve, reject) => {
    process.stdin.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
    process.stdin.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    process.stdin.on("error", reject);
  });
}

async function collectLogFiles(dirPath: string): Promise<string[]> {
  const out: string[] = [];
  async function walk(cur: string): Promise<void> {
    const entries = await fs.readdir(cur, { withFileTypes: true });
    for (const entry of entries) {
      const full = path.join(cur, entry.name);
      if (entry.isDirectory()) await walk(full);
      else if (entry.isFile() && (entry.name.endsWith(".log") || entry.name.endsWith(".txt"))) out.push(full);
    }
  }
  await walk(dirPath);
  return out;
}

function toTimestamp(input: unknown): number | undefined {
  if (typeof input === "number" && Number.isFinite(input)) return input;
  if (typeof input === "string") {
    const num = Number(input);
    if (Number.isFinite(num)) return num;
    const ms = Date.parse(input);
    if (!Number.isNaN(ms)) return ms;
  }
  return undefined;
}

function percentile(sorted: number[], p: number): number | null {
  if (sorted.length === 0) return null;
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.floor(p * (sorted.length - 1))));
  return sorted[idx];
}

function rate(n: number, d: number): number {
  return d > 0 ? n / d : 0;
}

function pickProfile(profile?: string): string {
  if (!profile) return "unknown";
  if (profile === "owner" || profile === "investor" || profile === "tenant") return profile;
  return "unknown";
}

function defaultStats(): AggregateStats {
  return {
    totalReports: 0,
    baselineCompletionRate: 0,
    enhancedCompletionRate: 0,
    defaultTariffRate: 0,
    highSeverityRate: 0,
    ownerHighSeverityRate: 0,
    subscriptionLeadRate: 0,
    ownerSubscriptionLeadRate: 0,
    topWarningCodes: [],
    topSubscriptionLeadReasons: [],
    topEnhancedSkipCodes: [],
    severityBreakdown: { none: 0, low: 0, medium: 0, high: 0 },
    circuitsCountStats: { min: null, avg: null, p50: null, p90: null, max: null },
    assetsCoverageBreakdown: { observed: 0, declared: 0, unknown: 0 },
  };
}

function computeStats(entries: ParsedEntry[]): AggregateStats {
  const stats = defaultStats();
  const warningTotals = new Map<string, number>();
  const leadReasonTotals = new Map<string, number>();
  const skipCodeTotals = new Map<string, number>();
  const circuitValues: number[] = [];
  let baselineCompleteCount = 0;
  let enhancedCompleteCount = 0;
  let defaultTariffCount = 0;
  let highSeverityCount = 0;
  let ownerTotal = 0;
  let ownerHigh = 0;
  let subscriptionLeadCount = 0;
  let ownerSubscriptionLeadCount = 0;

  for (const e of entries) {
    const profile = pickProfile(e.profile);
    const summary = e.summary ?? {};
    stats.totalReports += 1;
    if (summary.baselineComplete === true) baselineCompleteCount += 1;
    if (summary.enhancedComplete === true) enhancedCompleteCount += 1;
    if (summary.tariffSource === "default") defaultTariffCount += 1;
    if (summary.severity === "high") highSeverityCount += 1;
    if (profile === "owner") {
      ownerTotal += 1;
      if (summary.severity === "high") ownerHigh += 1;
    }
    if (summary.subscriptionLead === true) {
      subscriptionLeadCount += 1;
      if (profile === "owner") ownerSubscriptionLeadCount += 1;
    }
    if (typeof summary.circuitsCount === "number" && Number.isFinite(summary.circuitsCount)) {
      circuitValues.push(summary.circuitsCount);
    }
    if (summary.assetsCoverage === "observed" || summary.assetsCoverage === "declared" || summary.assetsCoverage === "unknown") {
      stats.assetsCoverageBreakdown[summary.assetsCoverage] += 1;
    }
    if (summary.severity === "none" || summary.severity === "low" || summary.severity === "medium" || summary.severity === "high") {
      stats.severityBreakdown[summary.severity] += 1;
    }
    for (const [code, count] of Object.entries(summary.warningCounts ?? {})) {
      warningTotals.set(code, (warningTotals.get(code) ?? 0) + Number(count || 0));
    }
    for (const reason of summary.subscriptionLeadReasons ?? []) {
      leadReasonTotals.set(reason, (leadReasonTotals.get(reason) ?? 0) + 1);
    }
    if (summary.enhancedSkipped && summary.enhancedSkipCode) {
      skipCodeTotals.set(summary.enhancedSkipCode, (skipCodeTotals.get(summary.enhancedSkipCode) ?? 0) + 1);
    }
  }

  stats.baselineCompletionRate = rate(baselineCompleteCount, stats.totalReports);
  stats.enhancedCompletionRate = rate(enhancedCompleteCount, stats.totalReports);
  stats.defaultTariffRate = rate(defaultTariffCount, stats.totalReports);
  stats.highSeverityRate = rate(highSeverityCount, stats.totalReports);
  stats.ownerHighSeverityRate = rate(ownerHigh, ownerTotal);
  stats.subscriptionLeadRate = rate(subscriptionLeadCount, stats.totalReports);
  stats.ownerSubscriptionLeadRate = rate(ownerSubscriptionLeadCount, ownerTotal);
  stats.topWarningCodes = [...warningTotals.entries()]
    .map(([code, count]) => ({ code, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);
  stats.topSubscriptionLeadReasons = [...leadReasonTotals.entries()]
    .map(([reason, count]) => ({ reason, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);
  stats.topEnhancedSkipCodes = [...skipCodeTotals.entries()]
    .map(([code, count]) => ({ code, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);

  if (circuitValues.length > 0) {
    const sorted = [...circuitValues].sort((a, b) => a - b);
    const sum = sorted.reduce((s, n) => s + n, 0);
    stats.circuitsCountStats = {
      min: sorted[0],
      avg: sum / sorted.length,
      p50: percentile(sorted, 0.5),
      p90: percentile(sorted, 0.9),
      max: sorted[sorted.length - 1],
    };
  }

  return stats;
}

function toHuman(output: AggregateOutput): string {
  const lines: string[] = [];
  const o = output.overall;
  lines.push("Preflight Telemetry Dashboard");
  lines.push("============================");
  lines.push(`Parsed reports: ${output.parsedLines} (skipped: ${output.skippedLines}, input lines: ${output.totalInputLines})`);
  lines.push("");
  lines.push("Top 5 KPI:");
  lines.push(`1) baselineCompletionRate: ${(o.baselineCompletionRate * 100).toFixed(1)}%`);
  lines.push(`2) enhancedCompletionRate: ${(o.enhancedCompletionRate * 100).toFixed(1)}%`);
  lines.push(`3) defaultTariffRate: ${(o.defaultTariffRate * 100).toFixed(1)}%`);
  lines.push(`4) ownerHighSeverityRate: ${(o.ownerHighSeverityRate * 100).toFixed(1)}%`);
  lines.push(`5) highSeverityRate: ${(o.highSeverityRate * 100).toFixed(1)}%`);
  lines.push(`subscriptionLeadRate: ${(o.subscriptionLeadRate * 100).toFixed(1)}% (owner: ${(o.ownerSubscriptionLeadRate * 100).toFixed(1)}%)`);
  lines.push("");
  lines.push(`Severity breakdown: none=${o.severityBreakdown.none}, low=${o.severityBreakdown.low}, medium=${o.severityBreakdown.medium}, high=${o.severityBreakdown.high}`);
  lines.push(`Assets coverage: observed=${o.assetsCoverageBreakdown.observed}, declared=${o.assetsCoverageBreakdown.declared}, unknown=${o.assetsCoverageBreakdown.unknown}`);
  lines.push(
    `Circuits stats: min=${o.circuitsCountStats.min ?? "-"}, avg=${o.circuitsCountStats.avg?.toFixed(2) ?? "-"}, p50=${o.circuitsCountStats.p50 ?? "-"}, p90=${o.circuitsCountStats.p90 ?? "-"}, max=${o.circuitsCountStats.max ?? "-"}`
  );
  lines.push("");
  lines.push("Top warning codes:");
  for (const row of o.topWarningCodes) lines.push(`- ${row.code}: ${row.count}`);
  if (o.topEnhancedSkipCodes.length > 0) {
    lines.push("");
    lines.push("Top enhanced skip codes:");
    for (const row of o.topEnhancedSkipCodes) lines.push(`- ${row.code}: ${row.count}`);
  }
  if (o.topSubscriptionLeadReasons.length > 0) {
    lines.push("");
    lines.push("Top subscription lead reasons:");
    for (const row of o.topSubscriptionLeadReasons) lines.push(`- ${row.reason}: ${row.count}`);
  }
  lines.push("");
  lines.push("By profile:");
  for (const [profile, s] of Object.entries(output.byProfile)) {
    lines.push(`- ${profile}: total=${s.totalReports}, baseline=${(s.baselineCompletionRate * 100).toFixed(1)}%, enhanced=${(s.enhancedCompletionRate * 100).toFixed(1)}%, high=${(s.highSeverityRate * 100).toFixed(1)}%`);
  }
  return lines.join("\n");
}

export function parsePreflightSummaryLines(
  text: string,
  options?: { sinceMs?: number; untilMs?: number }
): { totalInputLines: number; parsedLines: number; skippedLines: number; entries: ParsedEntry[] } {
  const lines = text.split(/\r?\n/);
  const entries: ParsedEntry[] = [];
  let parsedLines = 0;
  let skippedLines = 0;

  for (const line of lines) {
    if (!line.includes(PREFIX)) continue;
    const idx = line.indexOf(PREFIX);
    const jsonPart = line.slice(idx + PREFIX.length).trim();
    if (!jsonPart) {
      skippedLines += 1;
      continue;
    }
    try {
      const obj = JSON.parse(jsonPart) as ParsedEntry;
      const ts = toTimestamp(obj.timestamp);
      if (options?.sinceMs !== undefined && ts !== undefined && ts < options.sinceMs) continue;
      if (options?.untilMs !== undefined && ts !== undefined && ts > options.untilMs) continue;
      entries.push(obj);
      parsedLines += 1;
    } catch {
      skippedLines += 1;
    }
  }
  return { totalInputLines: lines.length, parsedLines, skippedLines, entries };
}

export function aggregatePreflightEntries(parsed: {
  totalInputLines: number;
  parsedLines: number;
  skippedLines: number;
  entries: ParsedEntry[];
}): AggregateOutput {
  const byProfileMap = new Map<string, ParsedEntry[]>();
  for (const entry of parsed.entries) {
    const profile = pickProfile(entry.profile);
    const arr = byProfileMap.get(profile) ?? [];
    arr.push(entry);
    byProfileMap.set(profile, arr);
  }
  const byProfile: Record<string, AggregateStats> = {};
  for (const [profile, items] of byProfileMap.entries()) byProfile[profile] = computeStats(items);
  return {
    totalInputLines: parsed.totalInputLines,
    parsedLines: parsed.parsedLines,
    skippedLines: parsed.skippedLines,
    overall: computeStats(parsed.entries),
    byProfile,
  };
}

async function readInput(args: CliArgs): Promise<string> {
  const chunks: string[] = [];
  if (args.file) chunks.push(await fs.readFile(args.file, "utf8"));
  if (args.dir) {
    const files = await collectLogFiles(args.dir);
    for (const f of files) chunks.push(await fs.readFile(f, "utf8"));
  }
  if (!args.file && !args.dir) chunks.push(await readStdin());
  return chunks.join("\n");
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const rawText = await readInput(args);
  const sinceMs = args.since ? toTimestamp(args.since) : undefined;
  const untilMs = args.until ? toTimestamp(args.until) : undefined;
  const parsed = parsePreflightSummaryLines(rawText, { sinceMs, untilMs });
  const output = aggregatePreflightEntries(parsed);

  if (args.out) {
    await fs.writeFile(args.out, JSON.stringify(output, null, 2), "utf8");
  }
  if (args.json) {
    process.stdout.write(`${JSON.stringify(output, null, 2)}\n`);
  } else {
    process.stdout.write(`${toHuman(output)}\n`);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err) => {
    console.error("aggregate-preflight-telemetry failed:", err);
    process.exit(1);
  });
}
