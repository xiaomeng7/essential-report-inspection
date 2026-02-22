import { signPhotoUrl } from "../../photoUrl";
import type { FindingBlock } from "../types";

export type BuildMergedFindingPagesOptions = {
  inspectionId?: string;
  baseUrl?: string;
  signingSecret?: string;
};

export type MergedFindingPagesValidation = {
  valid: boolean;
  errors: string[];
};

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function nl2br(text: string): string {
  return escapeHtml(text).replace(/\n/g, "<br/>");
}

function priorityLabel(priority?: string): string {
  const p = String(priority || "").toUpperCase();
  if (p === "IMMEDIATE" || p === "URGENT") return "🔴 Urgent Liability Risk";
  if (p === "RECOMMENDED" || p === "RECOMMENDED_0_3_MONTHS") return "🟡 Budgetary Provision Recommended";
  return "🟢 Acceptable";
}

function toPhotoLinks(
  evidenceRefs: string[],
  options: BuildMergedFindingPagesOptions
): string {
  if (!Array.isArray(evidenceRefs) || evidenceRefs.length === 0) {
    return "<p>No photographic evidence captured at time of assessment.</p>";
  }
  if (!options.baseUrl || !options.inspectionId) {
    return `<p>Evidence references: ${escapeHtml(evidenceRefs.join(", "))}</p>`;
  }
  const items = evidenceRefs.map((ref) => {
    try {
      const url = signPhotoUrl(options.inspectionId as string, ref, options.baseUrl as string, options.signingSecret);
      return `<li>Photo ${escapeHtml(ref)} — <a href="${escapeHtml(url)}">View photo</a></li>`;
    } catch {
      return `<li>Photo reference: ${escapeHtml(ref)} (Photo link unavailable)</li>`;
    }
  });
  return `<ul>${items.join("")}</ul>`;
}

function blockFromFinding(
  finding: FindingBlock,
  index: number,
  options: BuildMergedFindingPagesOptions
): string {
  const title = finding.title?.trim() || finding.id || `Finding ${index + 1}`;
  const observed = `Module signal observed for ${title}.`;
  const riskInterpretation = finding.rationale?.trim() ||
    "If this condition is not addressed, it may affect reliability, compliance, or planning confidence over time.";
  const riskHtml = finding.html && finding.html.trim().length > 0
    ? finding.html.replace(/\bundefined\b/gi, "unknown")
    : `<p>${nl2br(riskInterpretation)}</p>`;
  const budget = "TBD (site dependent)";
  const evidence = toPhotoLinks(finding.evidenceRefs || [], options);

  return [
    '<div style="page-break-before:always;"></div>',
    `<h3 data-finding-index="${index}" data-module-id="${escapeHtml(finding.moduleId)}">${escapeHtml(title)}</h3>`,
    "<h4>Asset Component</h4>",
    `<p>${nl2br(title)}</p>`,
    "<h4>Observed Condition</h4>",
    `<p>${nl2br(observed)}</p>`,
    "<h4>Evidence</h4>",
    evidence,
    "<h4>Risk Interpretation</h4>",
    riskHtml,
    "<h4>Priority Classification</h4>",
    `<p>${escapeHtml(priorityLabel(finding.priority))}</p>`,
    "<h4>Budgetary Planning Range</h4>",
    `<p>${escapeHtml(budget)}</p>`,
  ].join("\n");
}

export function buildFindingPagesHtmlFromMerged(
  findings: FindingBlock[],
  options: BuildMergedFindingPagesOptions = {}
): string {
  if (!Array.isArray(findings) || findings.length === 0) {
    return "<!-- SENTINEL_FINDINGS_V1 -->\n<p>No findings were identified during this assessment.</p>";
  }
  // Keep incoming order from plan.merged.findings to preserve density clipping and profile module priority ordering.
  const blocks = findings.map((f, idx) => blockFromFinding(f, idx, options));
  return `<!-- SENTINEL_FINDINGS_V1 -->\n${blocks.join("\n")}`;
}

export function validateMergedFindingPagesHtml(html: string, expectedCount: number): MergedFindingPagesValidation {
  const errors: string[] = [];
  if (!html.includes("SENTINEL_FINDINGS_V1")) errors.push("missing SENTINEL_FINDINGS_V1");
  const headings = [
    "<h4>Asset Component</h4>",
    "<h4>Observed Condition</h4>",
    "<h4>Evidence</h4>",
    "<h4>Risk Interpretation</h4>",
    "<h4>Priority Classification</h4>",
    "<h4>Budgetary Planning Range</h4>",
  ];
  for (const h of headings) {
    const count = (html.match(new RegExp(h.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "g")) || []).length;
    if (count < expectedCount) errors.push(`missing heading count for ${h}: got ${count}, expected >= ${expectedCount}`);
  }
  if (/\bundefined\b/i.test(html)) errors.push("contains forbidden token: undefined");
  if (/\|[-—]{3,}\|/.test(html)) errors.push("contains markdown table separator leakage");
  if (/###/.test(html)) errors.push("contains markdown heading leakage");
  if (/<h2/i.test(html)) errors.push("contains forbidden <h2> in finding block html");
  return { valid: errors.length === 0, errors };
}
