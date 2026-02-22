import assert from "node:assert";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { exec } from "node:child_process";

async function runCmd(cmd: string, cwd: string): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const child = exec(cmd, { cwd }, (err: Error | null) => {
      if (err) reject(err);
      else resolve();
    });
    child.stdout?.on("data", () => {});
    child.stderr?.on("data", () => {});
  });
}

async function main(): Promise<void> {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "preflight-weekly-"));
  const logPath = path.join(tmpDir, "mock.log");
  const outPath = path.join(tmpDir, "weekly.md");
  const mock = [
    '[report-preflight-summary] {"inspection_id":"1","profile":"owner","summary":{"warningCounts":{"BASELINE_INSUFFICIENT":1},"severity":"high","baselineComplete":false,"enhancedComplete":false,"assetsCoverage":"unknown","tariffSource":"default","circuitsCount":1,"enhancedSkipped":true,"enhancedSkipCode":"time_insufficient","subscriptionLead":true,"subscriptionLeadReasons":["OWNER_HIGH_SEVERITY"]}}',
    '[report-preflight-summary] {"inspection_id":"2","profile":"investor","summary":{"warningCounts":{"TARIFF_DEFAULT_USED":1},"severity":"medium","baselineComplete":true,"enhancedComplete":true,"assetsCoverage":"declared","tariffSource":"default","circuitsCount":2,"enhancedSkipped":false,"subscriptionLead":false,"subscriptionLeadReasons":[]}}',
  ].join("\n");
  await fs.writeFile(logPath, mock, "utf8");

  await runCmd(`npx tsx scripts/generate-weekly-preflight-report.ts --file "${logPath}" --out "${outPath}"`, process.cwd());
  const md = await fs.readFile(outPath, "utf8");
  assert(md.includes("## KPI table"), "weekly report should contain KPI table");
  assert(md.includes("## Top warning codes"), "weekly report should contain top warning codes");
  assert(md.includes("## Top skip reasons"), "weekly report should contain top skip reasons");
  console.log("✅ weekly preflight report generator tests passed");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
