import { promises as fs } from "node:fs";
import path from "node:path";
import { aggregatePreflightEntries, parsePreflightSummaryLines } from "./aggregate-preflight-telemetry";

type CliArgs = {
  file?: string;
  dir?: string;
  out?: string;
  since?: string;
  until?: string;
};

function parseArgs(argv: string[]): CliArgs {
  const args: CliArgs = {};
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === "--file") args.file = argv[i + 1], i += 1;
    else if (a === "--dir") args.dir = argv[i + 1], i += 1;
    else if (a === "--out") args.out = argv[i + 1], i += 1;
    else if (a === "--since") args.since = argv[i + 1], i += 1;
    else if (a === "--until") args.until = argv[i + 1], i += 1;
  }
  return args;
}

function toMs(input?: string): number | undefined {
  if (!input) return undefined;
  const asNum = Number(input);
  if (Number.isFinite(asNum)) return asNum;
  const d = Date.parse(input);
  return Number.isNaN(d) ? undefined : d;
}

async function readStdin(): Promise<string> {
  const chunks: Buffer[] = [];
  return await new Promise<string>((resolve, reject) => {
    process.stdin.on("data", (c) => chunks.push(Buffer.from(c)));
    process.stdin.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    process.stdin.on("error", reject);
  });
}

async function collect(dirPath: string): Promise<string[]> {
  const out: string[] = [];
  async function walk(cur: string): Promise<void> {
    const entries = await fs.readdir(cur, { withFileTypes: true });
    for (const e of entries) {
      const full = path.join(cur, e.name);
      if (e.isDirectory()) await walk(full);
      else if (e.isFile() && (e.name.endsWith(".log") || e.name.endsWith(".txt"))) out.push(full);
    }
  }
  await walk(dirPath);
  return out;
}

async function readInput(args: CliArgs): Promise<string> {
  const parts: string[] = [];
  if (args.file) parts.push(await fs.readFile(args.file, "utf8"));
  if (args.dir) {
    const files = await collect(args.dir);
    for (const f of files) parts.push(await fs.readFile(f, "utf8"));
  }
  if (!args.file && !args.dir) parts.push(await readStdin());
  return parts.join("\n");
}

function defaultOutPath(): string {
  const d = new Date().toISOString().slice(0, 10);
  return path.join(process.cwd(), "reports", `weekly-preflight-report-${d}.md`);
}

function pct(v: number): string {
  return `${(v * 100).toFixed(1)}%`;
}

function top3ActionSuggestions(input: {
  baselineCompletionRate: number;
  defaultTariffRate: number;
  topEnhancedSkipCodes: Array<{ code: string; count: number }>;
}): string[] {
  const suggestions: string[] = [];
  if (input.baselineCompletionRate < 0.9) {
    suggestions.push("Re-train baseline SOP and reinforce mandatory baseline fields in technician coaching.");
  }
  if (input.defaultTariffRate > 0.7) {
    suggestions.push("Update snapshot intake/sales script to collect tariff and recent bills earlier.");
  }
  const topSkip = input.topEnhancedSkipCodes[0]?.code;
  if (topSkip === "time_insufficient") {
    suggestions.push("Adjust scheduling windows or adopt a 6-circuit quick-set workflow for enhanced capture.");
  }
  while (suggestions.length < 3) {
    suggestions.push("Review top warning codes weekly and target top-2 causes with focused technician feedback.");
  }
  return suggestions.slice(0, 3);
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const rawText = await readInput(args);
  const parsed = parsePreflightSummaryLines(rawText, { sinceMs: toMs(args.since), untilMs: toMs(args.until) });
  const agg = aggregatePreflightEntries(parsed);
  const overall = agg.overall;
  const suggestions = top3ActionSuggestions({
    baselineCompletionRate: overall.baselineCompletionRate,
    defaultTariffRate: overall.defaultTariffRate,
    topEnhancedSkipCodes: overall.topEnhancedSkipCodes,
  });

  const byProfileRows = Object.entries(agg.byProfile)
    .map(([profile, s]) => `| ${profile} | ${s.totalReports} | ${pct(s.baselineCompletionRate)} | ${pct(s.highSeverityRate)} |`)
    .join("\n");

  const topWarnings = overall.topWarningCodes.map((w) => `- ${w.code}: ${w.count}`).join("\n") || "- none";
  const topSkips = overall.topEnhancedSkipCodes.map((w) => `- ${w.code}: ${w.count}`).join("\n") || "- none";

  const md = `# Weekly Preflight Report

## Summary counts

- Total parsed reports: ${agg.parsedLines}
- Skipped lines: ${agg.skippedLines}

## By profile

| Profile | Total | Baseline completion | High severity |
|---|---:|---:|---:|
${byProfileRows || "| - | 0 | 0.0% | 0.0% |"}

## KPI table

| KPI | Value |
|---|---:|
| baselineCompletionRate | ${pct(overall.baselineCompletionRate)} |
| enhancedCompletionRate | ${pct(overall.enhancedCompletionRate)} |
| defaultTariffRate | ${pct(overall.defaultTariffRate)} |
| highSeverityRate | ${pct(overall.highSeverityRate)} |
| ownerHighSeverityRate | ${pct(overall.ownerHighSeverityRate)} |

## Top warning codes

${topWarnings}

## Top skip reasons

${topSkips}

## Action suggestions

1. ${suggestions[0]}
2. ${suggestions[1]}
3. ${suggestions[2]}
`;

  const outPath = args.out || defaultOutPath();
  await fs.mkdir(path.dirname(outPath), { recursive: true });
  await fs.writeFile(outPath, md, "utf8");
  process.stdout.write(`✅ weekly preflight report written: ${outPath}\n`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err) => {
    console.error("generate-weekly-preflight-report failed:", err);
    process.exit(1);
  });
}
