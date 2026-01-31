/**
 * Generate Finding Pages for Word Document
 * 
 * Enforces exact structure for every finding:
 * - Asset Component
 * - Observed Condition
 * - Evidence
 * - Risk Interpretation (min 2 sentences, must include "if not addressed")
 * - Priority Classification
 * - Budgetary Planning Range
 * 
 * Returns docx-compatible HTML content with page breaks.
 */

import type { HandlerEvent } from "@netlify/functions";
import type { FindingProfile } from "./findingProfilesLoader";
import { loadCategoryDefaults, generateBudgetRangeFromBand } from "./findingProfilesLoader";
import { getPhotoMetadata } from "./store";
import { signPhotoUrl } from "./photoUrl";

export type Finding = {
  id: string;
  priority: string;
  title?: string;
  observed?: string;
  facts?: string;
  photo_ids?: string[];
};

export type Response = {
  title?: string;
  observed_condition?: string | string[];
  why_it_matters?: string;
  risk_interpretation?: string;
  budget_range_text?: string;
  budget_range_low?: number;
  budget_range_high?: number;
  budget_range_currency?: string;
  budget_range_note?: string;
  budgetary_range?: {
    low?: number;
    high?: number;
    currency?: string;
    note?: string;
  };
};

export type FindingPagesResult = {
  html: string;
  errors: Array<{ findingId: string; field: string; message: string }>;
};

/**
 * Escape HTML to prevent XSS
 */
function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

/**
 * Convert newlines to <br/> tags
 */
function nl2br(text: string): string {
  return escapeHtml(text).replace(/\n/g, "<br/>");
}

/**
 * Get priority classification text (emoji is separate; no bracket labels)
 */
function getPriorityClassification(priority: string): string {
  const p = (priority || "").toUpperCase();
  if (p === "IMMEDIATE" || p === "URGENT") return "Urgent Liability Risk";
  if (p === "RECOMMENDED" || p === "RECOMMENDED_0_3_MONTHS") return "Budgetary Provision Recommended";
  return "Acceptable";
}

/**
 * Get priority emoji (🔴 Urgent, 🟡 Recommended, 🟢 Acceptable)
 */
function getPriorityEmoji(priority: string): string {
  const p = (priority || "").toUpperCase();
  if (p === "IMMEDIATE" || p === "URGENT") return "🔴";
  if (p === "RECOMMENDED" || p === "RECOMMENDED_0_3_MONTHS") return "🟡";
  return "🟢";
}

/**
 * Normalize priority to standard format
 */
function normalizePriority(priority: string): "IMMEDIATE" | "RECOMMENDED" | "PLAN" {
  if (priority === "IMMEDIATE") return "IMMEDIATE";
  if (priority === "RECOMMENDED" || priority === "RECOMMENDED_0_3_MONTHS") return "RECOMMENDED";
  return "PLAN";
}

/**
 * Validate Risk Interpretation content
 * 
 * Strict validation rules:
 * - Must be >= 2 sentences
 * - Must include "if not addressed" clause
 * - Must include reasoning why it is not Immediate (if priority is not IMMEDIATE)
 */
function validateRiskInterpretation(
  riskInterpretation: string,
  priority: "IMMEDIATE" | "RECOMMENDED" | "PLAN",
  findingId: string
): { valid: boolean; missing: string[] } {
  const missing: string[] = [];
  const text = riskInterpretation.toLowerCase();
  
  // Check minimum 2 sentences
  const sentences = riskInterpretation.split(/[.!?]+/).filter(s => s.trim().length > 0);
  if (sentences.length < 2) {
    missing.push("minimum 2 sentences (found " + sentences.length + ")");
  }
  
  // Check for "if not addressed" phrase (REQUIRED)
  const hasIfNotAddressed = /if.*not.*addressed|if.*left.*unresolved|if.*deferred|if.*not.*remedied|if.*not.*fixed|if.*not.*corrected/i.test(text);
  if (!hasIfNotAddressed) {
    missing.push("'if not addressed' clause");
  }
  
  // Check for "why not Immediate" (REQUIRED if priority is not IMMEDIATE)
  if (priority !== "IMMEDIATE") {
    const hasWhyNotImmediate = /(not immediate|no immediate|not urgent|not critical|manageable|can be planned|allows for planning|within normal|strategic planning|does not present.*immediate|does not require.*immediate|can be.*monitored|allows.*planning|does not pose.*immediate|not.*immediate.*hazard|not.*immediate.*risk)/i.test(text);
    if (!hasWhyNotImmediate) {
      missing.push("explanation of why this is not Immediate priority (why not immediate)");
    }
  }
  
  return {
    valid: missing.length === 0,
    missing,
  };
}

/**
 * Generate Risk Interpretation with required components
 * 
 * Must include:
 * 1. What it means now (current state)
 * 2. What happens if not addressed (REQUIRED clause)
 * 3. Why this priority level (why not Immediate, if not IMMEDIATE)
 */
function generateRiskInterpretation(
  profile: FindingProfile,
  response: Response,
  priority: "IMMEDIATE" | "RECOMMENDED" | "PLAN"
): string {
  const parts: string[] = [];
  
  // 1. What it means now (current state)
  const currentState = profile.messaging?.why_it_matters || 
                      response.why_it_matters || 
                      "This condition may affect electrical safety, reliability, or compliance depending on severity and location.";
  parts.push(currentState.trim());
  
  // 2. What happens if not addressed (REQUIRED - must include "if not addressed")
  let ifNotAddressed = profile.messaging?.if_not_addressed;
  if (!ifNotAddressed && response.risk_interpretation) {
    // Try to extract "if not addressed" clause from risk_interpretation
    const match = response.risk_interpretation.match(/If.*not.*addressed[^.]*\./i);
    if (match) {
      ifNotAddressed = match[0];
    }
  }
  if (!ifNotAddressed) {
    // Generate default based on priority
    if (priority === "IMMEDIATE") {
      ifNotAddressed = "If this condition is not addressed, it may lead to immediate safety hazards, compliance violations, or liability escalation.";
    } else {
      ifNotAddressed = "If this condition is not addressed, it may impact long-term reliability, compliance confidence, or operational efficiency over time.";
    }
  }
  // Ensure it contains "if not addressed" phrase
  if (!/if.*not.*addressed/i.test(ifNotAddressed.toLowerCase())) {
    ifNotAddressed = "If this condition is not addressed, " + ifNotAddressed.toLowerCase().replace(/^if\s+/i, "");
  }
  parts.push(ifNotAddressed.trim());
  
  // 3. Why this priority level (why not Immediate, REQUIRED if not IMMEDIATE)
  if (priority !== "IMMEDIATE") {
    let whyNotImmediate = profile.messaging?.planning_guidance;
    if (!whyNotImmediate && response.risk_interpretation) {
      // Try to extract "why not immediate" explanation
      const match = response.risk_interpretation.match(/(not immediate|manageable|can be planned|allows for planning)[^.]*\./i);
      if (match) {
        whyNotImmediate = match[0];
      }
    }
    if (!whyNotImmediate) {
      // Generate default explanation
      whyNotImmediate = "This risk does not present an immediate hazard and can be managed within normal asset planning cycles, allowing for proper budgeting and contractor engagement without immediate urgency.";
    }
    // Ensure it explains why it's not immediate
    if (!/(not immediate|no immediate|not urgent|manageable|can be planned|allows for planning)/i.test(whyNotImmediate.toLowerCase())) {
      whyNotImmediate = "This condition does not present an immediate hazard. " + whyNotImmediate;
    }
    parts.push(whyNotImmediate.trim());
  } else {
    // For IMMEDIATE, explain why it IS immediate
    const whyImmediate = "This condition presents an immediate safety or compliance risk that requires urgent attention to prevent potential harm or liability escalation.";
    parts.push(whyImmediate.trim());
  }
  
  // Join parts with proper sentence endings
  return parts.map((part, index) => {
    const trimmed = part.trim();
    // Ensure each part ends with proper punctuation
    if (!trimmed.match(/[.!?]$/)) {
      return trimmed + ".";
    }
    return trimmed;
  }).join(" ");
}

/**
 * Generate a single finding page as HTML
 */
function generateFindingPageHtml(
  finding: Finding,
  index: number,
  profile: FindingProfile,
  response: Response,
  evidence: string
): { html: string; errors: Array<{ field: string; message: string }> } {
  const errors: Array<{ field: string; message: string }> = [];
  const htmlParts: string[] = [];
  
  // Page break before each finding block
  htmlParts.push('<div style="page-break-before:always;"></div>');
  
  // Normalize priority
  const effectivePriority = normalizePriority(profile.priority || finding.priority);
  
  // 1. Asset Component (used as finding title and first section)
  const assetComponent = profile.asset_component || 
                        profile.messaging?.title || 
                        response.title || 
                        finding.title || 
                        finding.id.replace(/_/g, " ");
  
  if (!assetComponent || assetComponent.trim().length === 0) {
    errors.push({ field: "asset_component", message: "Asset Component is missing or empty" });
  }
  
  // Finding title = h3; section titles = h4. No complex div/flex.
  htmlParts.push(`<h3>${escapeHtml(assetComponent)}</h3>`);
  htmlParts.push(`<h4>Asset Component</h4>`);
  htmlParts.push(`<p>${nl2br(assetComponent)}</p>`);
  
  // 2. Observed Condition
  let observedCondition: string;
  if (Array.isArray(response.observed_condition) && response.observed_condition.length > 0) {
    observedCondition = response.observed_condition.join(". ");
    if (!observedCondition.endsWith(".")) {
      observedCondition += ".";
    }
  } else if (typeof response.observed_condition === "string") {
    observedCondition = response.observed_condition;
  } else {
    observedCondition = finding.observed || 
                       finding.facts || 
                       `${assetComponent} was observed during the visual inspection.`;
  }
  
  if (!observedCondition || observedCondition.trim().length === 0) {
    errors.push({ field: "observed_condition", message: "Observed Condition is missing or empty" });
  }
  
  htmlParts.push(`<h4>Observed Condition</h4>`);
  htmlParts.push(`<p>${nl2br(observedCondition)}</p>`);
  
  // 3. Evidence (MUST exist per Photo Evidence Rules; default when no photos)
  const EVIDENCE_DEFAULT = "No photographic evidence captured at time of assessment.";
  if (!evidence || evidence.trim().length === 0) {
    evidence = EVIDENCE_DEFAULT;
  }

  htmlParts.push(`<h4>Evidence</h4>`);
  if (evidence.trim().startsWith("<ul>") || evidence.trim().startsWith("<ol>")) {
    htmlParts.push(evidence.trim());
  } else {
    htmlParts.push(`<p>${nl2br(evidence)}</p>`);
  }
  
  // 4. Risk Interpretation: at least 2 sentences and must include "If not addressed"; use safe default when missing
  let riskInterpretation: string;
  if (response.risk_interpretation && typeof response.risk_interpretation === "string" && response.risk_interpretation.trim().length > 0) {
    riskInterpretation = response.risk_interpretation.trim();
  } else {
    riskInterpretation = generateRiskInterpretation(profile, response, effectivePriority);
  }
  const validation = validateRiskInterpretation(riskInterpretation, effectivePriority, finding.id);
  if (!validation.valid) {
    const defaultConsequence = "If this condition is not addressed, it may impact safety, compliance, or reliability over time.";
    const defaultContext = effectivePriority === "IMMEDIATE"
      ? "This condition requires urgent attention to reduce immediate risk."
      : "This risk does not present an immediate hazard and can be managed within normal planning cycles.";
    const sentences = riskInterpretation.split(/[.!?]+/).filter(s => s.trim().length > 0);
    const hasIfNotAddressed = /if.*not.*addressed|if.*left.*unresolved|if.*deferred/i.test(riskInterpretation.toLowerCase());
    const parts: string[] = [riskInterpretation.trim()].filter(Boolean);
    if (!hasIfNotAddressed) parts.push(defaultConsequence);
    if (sentences.length < 2) parts.push(defaultContext);
    riskInterpretation = parts.join(" ").replace(/\s+/g, " ").trim();
    if (!riskInterpretation.endsWith(".")) riskInterpretation += ".";
  }
  if (!riskInterpretation || riskInterpretation.trim().length === 0) {
    riskInterpretation = "This condition may affect electrical safety or compliance. If this condition is not addressed, it may impact reliability or compliance over time.";
  }
  
  htmlParts.push(`<h4>Risk Interpretation</h4>`);
  htmlParts.push(`<p>${nl2br(riskInterpretation)}</p>`);
  
  // 5. Priority Classification: emoji + text only (e.g. 🟡 Budgetary Provision Recommended), no bracket labels
  const priorityKey = effectivePriority === "IMMEDIATE" ? "IMMEDIATE" : effectivePriority === "RECOMMENDED" ? "RECOMMENDED_0_3_MONTHS" : "PLAN_MONITOR";
  const priorityEmoji = getPriorityEmoji(priorityKey);
  const priorityLabel = getPriorityClassification(priorityKey);
  htmlParts.push(`<h4>Priority Classification</h4>`);
  htmlParts.push(`<p>${priorityEmoji} ${escapeHtml(priorityLabel)}</p>`);
  
  // 6. Budgetary Planning Range: profile.budget_range → response budget fields → budget_band mapping → fallback (never empty)
  let budgetaryRangeText: string;
  if (profile.budget_range && profile.budget_range.trim().length > 0) {
    budgetaryRangeText = profile.budget_range.trim();
  } else if (response.budget_range_text && typeof response.budget_range_text === "string" && response.budget_range_text.trim().length > 0) {
    budgetaryRangeText = response.budget_range_text.trim();
  } else if (response.budget_range_low !== undefined && response.budget_range_high !== undefined) {
    const currency = response.budget_range_currency || "AUD";
    budgetaryRangeText = `${currency} $${response.budget_range_low} – $${response.budget_range_high}`;
    if (response.budget_range_note) budgetaryRangeText += `. ${response.budget_range_note}`;
  } else if (response.budgetary_range && typeof response.budgetary_range === "object") {
    const range = response.budgetary_range;
    const currency = range.currency || "AUD";
    const low = range.low;
    const high = range.high;
    if (low !== undefined && high !== undefined) {
      budgetaryRangeText = `${currency} $${low} – $${high}`;
      if (range.note) budgetaryRangeText += `. ${range.note}`;
    } else {
      budgetaryRangeText = (profile.budget_band && generateBudgetRangeFromBand(profile.budget_band)) || "To be confirmed (indicative benchmark only)";
    }
  } else if (profile.budget_band) {
    budgetaryRangeText = generateBudgetRangeFromBand(profile.budget_band);
  } else {
    const categoryDefaults = loadCategoryDefaults();
    const category = profile.category || "OTHER";
    const categoryDefault = categoryDefaults[category] || categoryDefaults["OTHER"];
    budgetaryRangeText = (categoryDefault?.budget_band && generateBudgetRangeFromBand(categoryDefault.budget_band)) || "To be confirmed (indicative benchmark only)";
  }
  if (!budgetaryRangeText || budgetaryRangeText.trim().length === 0) {
    budgetaryRangeText = "To be confirmed (indicative benchmark only)";
  }
  
  htmlParts.push(`<h4>Budgetary Planning Range</h4>`);
  htmlParts.push(`<p>${nl2br(budgetaryRangeText)}</p>`);
  
  return {
    html: htmlParts.join("\n"),
    errors: errors.map(e => ({ ...e, findingId: finding.id })),
  };
}

function getNestedValue(obj: unknown, path: string): unknown {
  const parts = path.split(".");
  let current: unknown = obj;
  for (const part of parts) {
    if (current == null || typeof current !== "object") return undefined;
    current = (current as Record<string, unknown>)[part];
  }
  return current;
}

/**
 * Extract photo_ids from finding or raw data
 */
function getPhotoIds(finding: Finding, inspectionRaw: Record<string, unknown>, canonicalTestData: Record<string, unknown>): string[] {
  if (finding.photo_ids && Array.isArray(finding.photo_ids) && finding.photo_ids.length > 0) {
    return finding.photo_ids.slice(0, 2);
  }
  const findingIdLower = finding.id.toLowerCase();
  const possiblePaths = [
    `${findingIdLower}.photo_ids`,
    `exceptions.${findingIdLower}.photo_ids`,
    `rcd_tests.exceptions.photo_ids`,
    `gpo_tests.exceptions.photo_ids`,
  ];
  for (const path of possiblePaths) {
    const value = getNestedValue(inspectionRaw, path) || getNestedValue(canonicalTestData, path);
    if (value && Array.isArray(value) && value.length > 0) {
      return (value as string[]).slice(0, 2);
    }
  }
  return [];
}

/**
 * Extract evidence from finding and inspection data.
 * When photo_ids exist and inspection_id/event provided, loads metadata from blob and returns HTML link list.
 * Output: <ul><li>Photo P01 — caption (<a href="...">View photo</a>)</li></ul>
 */
async function extractEvidence(
  finding: Finding,
  inspectionRaw: Record<string, unknown>,
  canonicalTestData: Record<string, unknown>,
  profile: FindingProfile,
  inspectionId?: string,
  event?: HandlerEvent,
  baseUrl?: string,
  signingSecret?: string
): Promise<string> {
  const photoIds = getPhotoIds(finding, inspectionRaw, canonicalTestData);

  if (photoIds.length > 0 && inspectionId && event) {
    const items: string[] = [];
    for (const photoId of photoIds) {
      const meta = await getPhotoMetadata(inspectionId, photoId, event);
      const caption = meta?.caption?.trim() || "";
      const captionText = caption || "Photo evidence captured";
      const photoUrl = baseUrl ? signPhotoUrl(inspectionId, photoId, baseUrl, signingSecret) : null;
      const linkPart = photoUrl
        ? ` (<a href="${escapeHtml(photoUrl)}">View photo</a>)`
        : "";
      const textPart = `Photo ${photoId} — ${escapeHtml(captionText)}`;
      items.push(`<li>${textPart}${linkPart}</li>`);
    }
    if (items.length > 0) {
      return `<ul>${items.join("")}</ul>`;
    }
  }

  if (photoIds.length > 0) {
    return `Photo evidence provided: ${photoIds.join(", ")}.`;
  }

  if (finding.facts && finding.facts.trim().length > 0) {
    return finding.facts;
  }

  return "No photographic evidence captured at time of assessment.";
}

/**
 * Generate finding pages for Word document
 *
 * @param findings Array of findings
 * @param profiles Map of finding ID to FindingProfile
 * @param responses Map of finding ID to Response
 * @param inspectionRaw Raw inspection data (for evidence extraction)
 * @param canonicalTestData Canonical test data (for evidence extraction)
 * @param inspectionId Optional inspection ID (for loading photo metadata from blob)
 * @param event Optional HandlerEvent (for blob access)
 * @param baseUrl Optional base URL for photo links (e.g. https://site.netlify.app)
 * @param signingSecret Optional secret for HMAC-SHA256 signed photo URLs
 */
export async function generateFindingPages(
  findings: Finding[],
  profiles: Record<string, FindingProfile>,
  responses: Record<string, Response>,
  inspectionRaw: Record<string, unknown> = {},
  canonicalTestData: Record<string, unknown> = {},
  inspectionId?: string,
  event?: HandlerEvent,
  baseUrl?: string,
  signingSecret?: string
): Promise<FindingPagesResult> {
  const htmlParts: string[] = [];
  const allErrors: Array<{ findingId: string; field: string; message: string }> = [];

  if (findings.length === 0) {
    return {
      html: '<p>No findings were identified during this assessment.</p>',
      errors: [],
    };
  }

  const sortedFindings = [...findings].sort((a, b) => {
    const priorityOrder: Record<string, number> = {
      "IMMEDIATE": 1,
      "RECOMMENDED": 2,
      "RECOMMENDED_0_3_MONTHS": 2,
      "PLAN": 3,
      "PLAN_MONITOR": 3,
    };
    const aPriority = priorityOrder[a.priority] || 99;
    const bPriority = priorityOrder[b.priority] || 99;
    return aPriority - bPriority;
  });

  for (let i = 0; i < sortedFindings.length; i++) {
    const finding = sortedFindings[i];
    const profile = profiles[finding.id];
    if (!profile) {
      const errorMsg = `Finding profile not found for ${finding.id}`;
      allErrors.push({
        findingId: finding.id,
        field: "profile",
        message: errorMsg,
      });
      console.error(`❌ ${errorMsg}`);
      continue;
    }

    const response = responses[finding.id] || {};
    const evidence = await extractEvidence(
      finding,
      inspectionRaw,
      canonicalTestData,
      profile,
      inspectionId,
      event,
      baseUrl,
      signingSecret
    );
    const { html, errors } = generateFindingPageHtml(finding, i, profile, response, evidence);

    htmlParts.push(html);
    if (errors.length > 0) {
      allErrors.push(...errors);
      console.error(`❌ Finding ${finding.id} failed validation:`, errors.map((e) => `${e.field}: ${e.message}`).join(", "));
    }
  }
  
  // Throw error if any validation failed
  if (allErrors.length > 0) {
    // Group errors by finding ID
    const errorsByFinding: Record<string, Array<{ field: string; message: string }>> = {};
    allErrors.forEach(err => {
      if (!errorsByFinding[err.findingId]) {
        errorsByFinding[err.findingId] = [];
      }
      errorsByFinding[err.findingId].push({ field: err.field, message: err.message });
    });
    
    // Build descriptive error message
    const errorMessages: string[] = [];
    Object.entries(errorsByFinding).forEach(([findingId, errors]) => {
      errorMessages.push(`Finding ${findingId}:`);
      errors.forEach(err => {
        errorMessages.push(`  - ${err.field}: ${err.message}`);
      });
    });
    
    const fullErrorMessage = `Finding pages validation failed for ${allErrors.length} error(s) across ${Object.keys(errorsByFinding).length} finding(s):\n${errorMessages.join("\n")}`;
    console.error(`❌ ${fullErrorMessage}`);
    
    // Throw error with descriptive message including finding IDs
    throw new Error(
      `Finding pages validation failed. ` +
      `Finding ID(s): ${Object.keys(errorsByFinding).join(", ")}. ` +
      `First error: Finding ${allErrors[0].findingId} - ${allErrors[0].field}: ${allErrors[0].message}`
    );
  }
  
  return {
    html: htmlParts.join("\n"),
    errors: [],
  };
}
