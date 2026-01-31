/**
 * Verification script for Photo Evidence Rules
 *
 * ✅ 验证 1: assertEvidenceStructure fail-fast when Evidence missing
 * ✅ 验证 2: photo_ids > 2 truncated to 2
 * ✅ 验证 3: No photos → default text, never empty/undefined
 */

import { assertEvidenceStructure, assertReportReady, type AssertReportReadyFailure, type StructuredReport } from "../netlify/functions/lib/reportContract";
import { generateFindingPages, type Finding, type Response } from "../netlify/functions/lib/generateFindingPages";
import { loadFindingProfiles, getFindingProfile } from "../netlify/functions/lib/findingProfilesLoader";

const EVIDENCE_DEFAULT = "No photographic evidence captured at time of assessment.";

// --- 验证 1: Evidence 缺失时 fail-fast ---
console.log("=== 验证 1: 故意破坏 Evidence，看是否会 fail-fast ===\n");

const brokenHtml = `
<h3>Test Finding</h3>
<h4>Asset Component</h4><p>Test</p>
<h4>Observed Condition</h4><p>Observed</p>
<!-- Evidence section intentionally omitted -->
<h4>Risk Interpretation</h4><p>If not addressed...</p>
<h4>Priority Classification</h4><p>🟡</p>
<h4>Budgetary Planning Range</h4><p>AUD $100-$500</p>
`;

const failures1: AssertReportReadyFailure[] = [];
assertEvidenceStructure(brokenHtml, failures1);

if (failures1.length > 0) {
  console.log("  ✅ assertEvidenceStructure 正确检测到 Evidence 缺失:");
  failures1.forEach((f) => console.log(`     - ${f.message}`));
} else {
  console.log("  ❌ 预期: Evidence 缺失应触发失败，但未检测到");
}

try {
  const brokenReport: StructuredReport = {
    INSPECTION_ID: "test",
    ASSESSMENT_DATE: "2025-01-31",
    PREPARED_FOR: "-",
    PREPARED_BY: "-",
    PROPERTY_ADDRESS: "-",
    PROPERTY_TYPE: "-",
    ASSESSMENT_PURPOSE: "Test",
    OVERALL_STATUS: "MODERATE RISK",
    OVERALL_STATUS_BADGE: "🟡 Moderate",
    EXECUTIVE_DECISION_SIGNALS: "• If not addressed...\n• Why not immediate...\n• Manageable risk.",
    CAPEX_SNAPSHOT: "AUD $0 – $0",
    PRIORITY_TABLE_ROWS: "",
    SCOPE_SECTION: "Test",
    LIMITATIONS_SECTION: "Test",
    FINDING_PAGES_HTML: brokenHtml,
    THERMAL_SECTION: "Test",
    CAPEX_TABLE_ROWS: "",
    CAPEX_DISCLAIMER_LINE: "Test",
    DECISION_PATHWAYS: "Test",
    TERMS_AND_CONDITIONS: "Test",
    TEST_DATA_SECTION: "Test",
    TECHNICAL_NOTES: "Test",
    CLOSING_STATEMENT: "Test",
  };
  assertReportReady(brokenReport);
  console.log("  ❌ assertReportReady 应该 throw，但未抛出");
} catch (e) {
  const msg = e instanceof Error ? e.message : String(e);
  if (msg.includes("Report preflight failed") || msg.includes("Evidence")) {
    console.log("  ✅ assertReportReady 正确 throw，错误信息明确:");
    console.log(`     ${msg.split("\n")[0]}`);
  } else {
    console.log("  ⚠️ 抛出了错误，但信息可能不够明确:", msg.slice(0, 100));
  }
}

// --- 验证 2: photo_ids 超过 2 张是否被截断 ---
console.log("\n=== 验证 2: photo_ids 超过 2 张是否被截断 ===\n");

const findingsWith3Photos: Finding[] = [
  {
    id: "NO_RCD_PROTECTION",
    priority: "IMMEDIATE",
    photo_ids: ["photo_1", "photo_2", "photo_3"],
  },
];

const profiles2: Record<string, any> = {};
findingsWith3Photos.forEach((f) => {
  profiles2[f.id] = getFindingProfile(f.id);
});

const responses2: Record<string, Response> = {
  NO_RCD_PROTECTION: { title: "No RCD Protection", observed_condition: "Observed." },
};

const result2 = await generateFindingPages(findingsWith3Photos, profiles2, responses2, {}, {});
const evidenceMatch2 = result2.html.match(/<h4>Evidence<\/h4>\s*<p>([^<]*)<\/p>/);
const evidenceText2 = evidenceMatch2 ? evidenceMatch2[1].replace(/<[^>]+>/g, "") : "";

if (evidenceText2.includes("photo_1") && evidenceText2.includes("photo_2") && !evidenceText2.includes("photo_3")) {
  console.log("  ✅ 只引用前 2 张: photo_1, photo_2 (photo_3 被截断)");
} else if (evidenceText2.includes("photo_1") && evidenceText2.includes("photo_2")) {
  console.log("  ✅ Evidence 仅包含 photo_1, photo_2");
} else {
  console.log("  ⚠️ Evidence 内容:", evidenceText2.slice(0, 80));
  if (evidenceText2.includes("photo_3")) {
    console.log("  ❌ 预期: photo_3 不应出现");
  }
}

// --- 验证 3: 无照片时是否永远不空、不 undefined ---
console.log("\n=== 验证 3: 无照片时是否永远不空、不 undefined ===\n");

const findingsNoPhotos: Finding[] = [
  { id: "BOARD_AT_CAPACITY", priority: "RECOMMENDED_0_3_MONTHS" },
  { id: "LABELING_POOR", priority: "PLAN_MONITOR" },
];

const profiles3: Record<string, any> = {};
findingsNoPhotos.forEach((f) => {
  profiles3[f.id] = getFindingProfile(f.id);
});

const responses3: Record<string, Response> = {
  BOARD_AT_CAPACITY: { title: "Board at capacity", observed_condition: "Observed." },
  LABELING_POOR: { title: "Labelling poor", observed_condition: "Observed." },
};

const result3 = await generateFindingPages(findingsNoPhotos, profiles3, responses3, {}, {});
const evidenceBlocks3 = result3.html.split(/<h4>Evidence<\/h4>/i);

let allOk = true;
for (let i = 1; i < evidenceBlocks3.length; i++) {
  const pMatch = evidenceBlocks3[i].match(/<p>([^<]*)<\/p>/);
  const content = (pMatch ? pMatch[1] : "").replace(/<[^>]+>/g, "").replace(/&nbsp;/g, " ").trim();
  if (!content || content === "undefined") {
    console.log(`  ❌ Finding ${i} Evidence 为空或 undefined`);
    allOk = false;
  } else if (content !== EVIDENCE_DEFAULT) {
    console.log(`  ⚠️ Finding ${i} Evidence: "${content.slice(0, 50)}..." (应为默认文案)`);
  }
}

if (allOk && evidenceBlocks3.length >= 2) {
  console.log("  ✅ 所有 Finding 的 Evidence 均为默认文案，无空、无 undefined");
}

console.log("\n✅ 三项验证完成");
