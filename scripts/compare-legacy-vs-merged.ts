import fs from "fs";
import path from "path";
import { buildReportData } from "../netlify/functions/generateWordReport";
import { buildReportPlan, compareLegacyVsMergedCapexRows } from "../netlify/functions/lib/reportEngine/engine";

type StoredInspectionLike = {
  inspection_id: string;
  findings: Array<Record<string, unknown>>;
  limitations: string[];
  raw: Record<string, unknown>;
};

function rank(priority?: string): number {
  const p = (priority || "").toUpperCase();
  if (p === "IMMEDIATE" || p === "URGENT") return 1;
  if (p === "RECOMMENDED" || p === "RECOMMENDED_0_3_MONTHS") return 2;
  if (p === "PLAN" || p === "PLAN_MONITOR") return 3;
  return 99;
}

function normalizeInspectionFromSample(input: Record<string, unknown>): StoredInspectionLike {
  const raw = (input.raw && typeof input.raw === "object" ? input.raw : input) as Record<string, unknown>;
  const findings = Array.isArray(input.findings)
    ? (input.findings as Array<Record<string, unknown>>)
    : (Array.isArray(raw.findings) ? (raw.findings as Array<Record<string, unknown>>) : []);
  const limitations = Array.isArray(input.limitations)
    ? (input.limitations as string[])
    : [];
  const inspectionId = String(input.inspection_id || (raw.inspection_id as string) || "SAMPLE_INSPECTION");
  return {
    inspection_id: inspectionId,
    findings,
    limitations,
    raw,
  };
}

async function main(): Promise<void> {
  const samplePath = path.join(process.cwd(), "sample-inspection.json");
  if (!fs.existsSync(samplePath)) {
    console.log("⚠️ compare skipped: sample-inspection.json not found");
    return;
  }

  const sample = JSON.parse(fs.readFileSync(samplePath, "utf8")) as Record<string, unknown>;
  const inspection = normalizeInspectionFromSample(sample);

  const plan = buildReportPlan({
    inspection: inspection as any,
    profile: "investor",
    modules: ["safety", "capacity", "energy", "lifecycle"],
  });

  let legacyCapexRows = "";
  try {
    const legacy = await buildReportData(inspection as any);
    legacyCapexRows = String((legacy as Record<string, unknown>).CAPEX_TABLE_ROWS || "");
  } catch (error) {
    console.log("⚠️ legacy build unavailable in this environment, capex compare skipped");
    console.log("reason:", error instanceof Error ? error.message : String(error));
  }

  const capexDiff = compareLegacyVsMergedCapexRows(legacyCapexRows, plan.merged.capexRows);
  const mergedPriorities = plan.merged.findings.map((f) => f.priority || "UNKNOWN");
  const sortedByRank = [...mergedPriorities].sort((a, b) => rank(a) - rank(b));
  const orderOk = JSON.stringify(mergedPriorities) === JSON.stringify(sortedByRank);

  console.log("=== Legacy vs Merged (Investor Baseline / Shadow) ===");
  console.log("merged.findings.count:", plan.merged.findings.length);
  console.log("merged.capexRows.count:", plan.merged.capexRows.length);
  console.log("findings.priority.order.ok:", orderOk);
  console.log("capex.aligned:", capexDiff.aligned);
  if (!capexDiff.aligned) {
    console.log("capex.onlyInLegacy:", capexDiff.onlyInLegacy.slice(0, 10));
    console.log("capex.onlyInMerged:", capexDiff.onlyInMerged.slice(0, 10));
  }
}

main().catch((e) => {
  console.error("compare script failed:", e);
  process.exit(1);
});
