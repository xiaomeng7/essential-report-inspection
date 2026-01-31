/**
 * Generate report by inspection ID
 * 
 * Loads inspection from Netlify Blobs or local fixture, then runs the full report generation pipeline:
 * normalizeInspection -> deriveFindings -> load profiles/responses -> scoring -> executiveSignals -> 
 * buildReportMarkdown -> markdownToHtml -> renderDocx
 * 
 * Outputs: /tmp/<id>.md and /tmp/<id>.docx
 */

import { get } from "../netlify/functions/lib/store";
import { normalizeInspection } from "../netlify/functions/lib/normalizeInspection";
import { deriveFindings } from "../netlify/functions/lib/deriveFindings";
import { loadFindingProfiles, getFindingProfile } from "../netlify/functions/lib/findingProfilesLoader";
import { loadResponses, buildReportData } from "../netlify/functions/generateWordReport";
import { computeOverall, convertProfileForScoring, findingScore, type FindingForScoring } from "../netlify/functions/lib/scoring";
import { generateExecutiveSignals, type TopFinding } from "../netlify/functions/lib/executiveSignals";
import { buildReportMarkdown } from "../netlify/functions/lib/buildReportMarkdown";
import { markdownToHtml } from "../netlify/functions/lib/markdownToHtml";
import { renderDocx } from "../netlify/functions/lib/renderDocx";
import { validateReportDataAgainstPlaceholderMap } from "../src/reporting/placeholderMap";
import fs from "fs";
import path from "path";

// Mock HandlerEvent for local execution
const mockEvent = undefined; // Will use file system fallback

/**
 * Load inspection from local fixture if not found in Blobs
 */
async function loadInspectionWithFallback(inspectionId: string): Promise<any> {
  // Try Netlify Blobs first
  try {
    const inspection = await get(inspectionId, mockEvent);
    if (inspection) {
      console.log(`✅ Loaded inspection ${inspectionId} from Netlify Blobs`);
      return inspection;
    }
  } catch (e) {
    console.warn(`⚠️ Could not load from Blobs:`, e);
  }
  
  // Fallback to local fixture
  const fixturePaths = [
    path.join(process.cwd(), `${inspectionId}.json`),
    path.join(process.cwd(), "fixtures", `${inspectionId}.json`),
    path.join(process.cwd(), "test-data", `${inspectionId}.json`),
    path.join(process.cwd(), "sample-inspection.json"),
  ];
  
  for (const fixturePath of fixturePaths) {
    if (fs.existsSync(fixturePath)) {
      try {
        const content = fs.readFileSync(fixturePath, "utf-8");
        const inspection = JSON.parse(content);
        console.log(`✅ Loaded inspection ${inspectionId} from fixture: ${fixturePath}`);
        return inspection;
      } catch (e) {
        console.warn(`Failed to load fixture ${fixturePath}:`, e);
      }
    }
  }
  
  throw new Error(`Inspection ${inspectionId} not found in Blobs or local fixtures`);
}

/**
 * Estimate page count from markdown content
 */
function estimatePageCount(markdown: string): number {
  // Rough estimate: ~500 words per page, ~5 characters per word
  const words = markdown.split(/\s+/).length;
  const estimatedPages = Math.ceil(words / 500);
  return Math.max(1, estimatedPages);
}

/**
 * Main function
 */
async function generateReportById(inspectionId: string) {
  console.log(`\n🚀 Generating report for inspection: ${inspectionId}\n`);
  
  try {
    // 1. Load inspection
    console.log("Step 1: Loading inspection...");
    const inspection = await loadInspectionWithFallback(inspectionId);
    console.log(`   Found ${inspection.findings?.length || 0} findings\n`);
    
    // 2. Normalize inspection
    console.log("Step 2: Normalizing inspection data...");
    const { canonical, missingFields } = normalizeInspection(inspection.raw || {}, inspection.inspection_id);
    if (missingFields.length > 0) {
      console.log(`   ⚠️ Missing canonical fields: ${missingFields.join(", ")}`);
    }
    console.log(`   ✅ Normalized to canonical format\n`);
    
    // 3. Derive findings (skip if error, use inspection.findings instead)
    console.log("Step 3: Deriving findings...");
    let derivedFindings: any[] = [];
    try {
      derivedFindings = deriveFindings(inspection.raw || {});
      console.log(`   ✅ Derived ${derivedFindings.length} findings\n`);
    } catch (error) {
      console.log(`   ⚠️ Skipping deriveFindings due to error: ${error instanceof Error ? error.message : String(error)}`);
      console.log(`   ℹ️ Using inspection.findings instead\n`);
    }
    
    // Use derived findings if available, otherwise use inspection.findings
    const findings = derivedFindings.length > 0 
      ? derivedFindings.map(f => ({ id: f.id, priority: f.priority, title: f.title }))
      : (inspection.findings || []);
    
    // 4. Load profiles and responses
    console.log("Step 4: Loading finding profiles and responses...");
    const profiles = loadFindingProfiles();
    const responses = await loadResponses(mockEvent);
    console.log(`   ✅ Loaded ${Object.keys(profiles).length} profiles, ${Object.keys(responses.findings || {}).length} responses\n`);
    
    // 5. Scoring
    console.log("Step 5: Computing scores...");
    const findingsForScoring: FindingForScoring[] = findings.map(f => ({
      id: f.id,
      priority: f.priority || "PLAN",
    }));
    
    const profilesForScoring: Record<string, any> = {};
    for (const finding of findings) {
      const profile = getFindingProfile(finding.id);
      profilesForScoring[finding.id] = convertProfileForScoring(profile);
    }
    
    const overallScore = computeOverall(findingsForScoring, profilesForScoring);
    console.log(`   ✅ Overall level: ${overallScore.overall_level}`);
    console.log(`   ✅ Aggregate score: ${overallScore.aggregate_score.toFixed(2)}`);
    console.log(`   ✅ CapEx range: $${overallScore.capex_low} – $${overallScore.capex_high}\n`);
    
    // 6. Executive signals
    console.log("Step 6: Generating executive signals...");
    const counts = {
      immediate: findings.filter(f => f.priority === "IMMEDIATE").length,
      urgent: findings.filter(f => f.priority === "URGENT").length,
      recommended: findings.filter(f => f.priority === "RECOMMENDED_0_3_MONTHS" || f.priority === "RECOMMENDED").length,
      plan: findings.filter(f => f.priority === "PLAN_MONITOR" || f.priority === "PLAN").length,
    };
    
    // Calculate top findings by score
    const findingsWithScores: Array<{ finding: typeof findings[0], score: number }> = [];
    for (const finding of findings) {
      const profile = profilesForScoring[finding.id] || {};
      const effectivePriority = finding.priority || profile.default_priority || "PLAN";
      const score = findingScore(profile, effectivePriority);
      findingsWithScores.push({ finding, score });
    }
    
    const topFindings: TopFinding[] = findingsWithScores
      .sort((a, b) => b.score - a.score)
      .slice(0, 3)
      .map(item => ({
        id: item.finding.id,
        title: item.finding.title,
        priority: item.finding.priority || "PLAN",
        score: item.score,
      }));
    
    const executiveSignals = generateExecutiveSignals({
      overall_level: overallScore.overall_level,
      counts,
      capex: {
        low: overallScore.capex_low,
        high: overallScore.capex_high,
      },
      capex_incomplete: overallScore.capex_incomplete,
      topFindings,
      dominantRisk: overallScore.dominant_risk.length > 0 ? overallScore.dominant_risk : undefined,
    });
    console.log(`   ✅ Generated ${executiveSignals.bullets.length} executive signal bullets\n`);
    
    // 7. Build report data
    console.log("Step 7: Building report data...");
    const reportData = await buildReportData(inspection, mockEvent);
    const validation = validateReportDataAgainstPlaceholderMap(reportData);
    console.log(`   ✅ Report data built`);
    if (validation.missingRequired.length > 0) {
      console.log(`   ⚠️ Missing required placeholders: ${validation.missingRequired.join(", ")}`);
    }
    if (validation.missingOptional.length > 0) {
      console.log(`   ℹ️ Missing optional placeholders: ${validation.missingOptional.join(", ")}`);
    }
    console.log("");
    
    // 8. Build Markdown
    console.log("Step 8: Building Markdown report...");
    const markdown = await buildReportMarkdown({
      inspection,
      canonical,
      findings,
      responses,
      computed: {
        OVERALL_STATUS: reportData.OVERALL_STATUS,
        RISK_RATING: reportData.RISK_RATING,
        CAPEX_RANGE: reportData.CAPEX_RANGE,
        EXECUTIVE_SUMMARY: reportData.EXECUTIVE_SUMMARY,
        EXECUTIVE_DECISION_SIGNALS: reportData.EXECUTIVE_DECISION_SIGNALS,
        CAPEX_SNAPSHOT: reportData.CAPEX_SNAPSHOT,
        CAPEX_TABLE_ROWS: reportData.CAPEX_TABLE_ROWS,
      },
      event: mockEvent,
    });
    console.log(`   ✅ Markdown generated: ${markdown.length} characters\n`);
    
    // 9. Convert to HTML
    console.log("Step 9: Converting Markdown to HTML...");
    const html = markdownToHtml(markdown);
    console.log(`   ✅ HTML generated: ${html.length} characters\n`);
    
    // 10. Render DOCX
    console.log("Step 10: Rendering Word document...");
    const templatePath = path.join(process.cwd(), "netlify", "functions", "report-template-md.docx");
    let templateBuffer: Buffer;
    if (fs.existsSync(templatePath)) {
      templateBuffer = fs.readFileSync(templatePath);
    } else {
      throw new Error(`Template not found: ${templatePath}`);
    }
    
    const docxBuffer = await renderDocx(templateBuffer, {
      ...reportData,
      REPORT_BODY_HTML: html,
    });
    console.log(`   ✅ Word document generated: ${docxBuffer.length} bytes\n`);
    
    // 11. Save files
    console.log("Step 11: Saving output files...");
    const outputDir = "/tmp";
    // Ensure output directory exists
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }
    const mdPath = path.join(outputDir, `${inspectionId}.md`);
    const docxPath = path.join(outputDir, `${inspectionId}.docx`);
    
    fs.writeFileSync(mdPath, markdown, "utf-8");
    fs.writeFileSync(docxPath, docxBuffer);
    console.log(`   ✅ Markdown saved: ${mdPath}`);
    console.log(`   ✅ Word document saved: ${docxPath}\n`);
    
    // 12. Print summary
    console.log("=".repeat(60));
    console.log("📊 REPORT GENERATION SUMMARY");
    console.log("=".repeat(60));
    console.log(`Inspection ID: ${inspectionId}`);
    console.log(`Estimated Pages: ${estimatePageCount(markdown)}`);
    console.log("");
    console.log("Findings by Priority:");
    console.log(`  IMMEDIATE: ${counts.immediate}`);
    console.log(`  URGENT: ${counts.urgent}`);
    console.log(`  RECOMMENDED: ${counts.recommended}`);
    console.log(`  PLAN: ${counts.plan}`);
    console.log(`  Total: ${findings.length}`);
    console.log("");
    console.log("CapEx Total Range:");
    console.log(`  Low: $${overallScore.capex_low.toLocaleString()}`);
    console.log(`  High: $${overallScore.capex_high.toLocaleString()}`);
    console.log(`  Incomplete: ${overallScore.capex_incomplete ? "Yes" : "No"}`);
    console.log("");
    if (validation.missingRequired.length > 0) {
      console.log("⚠️ Missing Required Placeholders:");
      validation.missingRequired.forEach(key => console.log(`  - ${key}`));
      console.log("");
    }
    if (validation.missingOptional.length > 0) {
      console.log("ℹ️ Missing Optional Placeholders:");
      validation.missingOptional.forEach(key => console.log(`  - ${key}`));
      console.log("");
    }
    console.log("Overall Risk Level:", overallScore.overall_level);
    console.log("Dominant Risk:", overallScore.dominant_risk.join(", ") || "None");
    console.log("");
    console.log("=".repeat(60));
    console.log("✅ Report generation completed successfully!");
    console.log("=".repeat(60));
    
  } catch (error) {
    console.error("\n❌ Error generating report:", error);
    if (error instanceof Error) {
      console.error("Error message:", error.message);
      console.error("Error stack:", error.stack);
    }
    process.exit(1);
  }
}

// Main execution
const inspectionId = process.argv[2];
if (!inspectionId) {
  console.error("Usage: npx tsx scripts/generate-report-by-id.ts <inspection_id>");
  console.error("Example: npx tsx scripts/generate-report-by-id.ts EH-2026-01-004");
  process.exit(1);
}

generateReportById(inspectionId).catch(console.error);
