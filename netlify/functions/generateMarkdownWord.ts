/**
 * 生成基于 Markdown 的 Word 报告
 * 
 * 使用 buildMarkdownReport 生成完整的 Markdown 报告，
 * 然后转换为 Word 文档并返回供下载
 */

import type { Handler, HandlerEvent, HandlerContext } from "@netlify/functions";
import { get } from "./lib/store";
import { buildMarkdownReport } from "./lib/generateReport";
import { loadResponses } from "./generateWordReport";
import { markdownToHtml } from "./lib/markdownToHtml";
import { renderDocx } from "./lib/renderDocx";
import { sha1 } from "./lib/fingerprint";
import PizZip from "pizzip";
import { getSanitizeFingerprint, resetSanitizeFingerprint } from "./lib/sanitizeText";
import { loadDefaultText } from "./lib/defaultTextLoader";
import { normalizeInspection } from "./lib/normalizeInspection";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

/**
 * Extract value from Answer object (handles nested Answer objects)
 */
function extractValue(v: unknown): unknown {
  if (v == null) return undefined;
  if (typeof v === "string" || typeof v === "number" || typeof v === "boolean") return v;
  if (typeof v === "object" && "value" in (v as object)) {
    const answerValue = (v as { value: unknown }).value;
    if (typeof answerValue === "object" && answerValue !== null && "value" in (answerValue as object)) {
      return extractValue(answerValue);
    }
    return answerValue;
  }
  return undefined;
}

/**
 * Extract field value from inspection.raw by path (e.g., "job.address")
 */
function getFieldValue(raw: Record<string, unknown>, fieldPath: string): string {
  const parts = fieldPath.split(".");
  let current: unknown = raw;
  
  for (const part of parts) {
    if (current == null || typeof current !== "object") return "";
    current = (current as Record<string, unknown>)[part];
  }
  
  const value = extractValue(current);
  return value != null ? String(value) : "";
}

// Get __dirname equivalent for ES modules
let __dirname: string;
try {
  if (typeof import.meta !== "undefined" && import.meta.url) {
    const __filename = fileURLToPath(import.meta.url);
    __dirname = path.dirname(__filename);
  } else {
    __dirname = process.cwd();
  }
} catch (e) {
  console.warn("Could not determine __dirname from import.meta.url, using process.cwd()");
  __dirname = process.cwd();
}

/**
 * 加载 Word 模板（用于封面页）
 */
function loadWordTemplate(): Buffer {
  const possiblePaths = [
    path.join(__dirname, "report-template-md.docx"),
    path.join(process.cwd(), "report-template-md.docx"),
    path.join(process.cwd(), "netlify", "functions", "report-template-md.docx"),
    path.join(__dirname, "..", "report-template-md.docx"),
    "/opt/build/repo/report-template-md.docx",
    "/opt/build/repo/netlify/functions/report-template-md.docx",
  ];
  
  for (const templatePath of possiblePaths) {
    if (fs.existsSync(templatePath)) {
      const buf = fs.readFileSync(templatePath);
      console.log("[report-fp] template path:", templatePath, "buffer.length:", buf.length, "sha1:", sha1(buf));
      return buf;
    }
  }
  
  throw new Error("Could not find report-template-md.docx");
}

export const handler: Handler = async (event: HandlerEvent, _ctx: HandlerContext) => {
  try {
    resetSanitizeFingerprint();
    const buildRef = process.env.COMMIT_REF ?? process.env.CONTEXT ?? process.env.BRANCH ?? "?";
    let pkgVersion = "?";
    try {
      const pkg = JSON.parse(fs.readFileSync(path.join(process.cwd(), "package.json"), "utf8"));
      pkgVersion = pkg.version ?? "?";
    } catch {
      try {
        const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "..", "package.json"), "utf8"));
        pkgVersion = pkg.version ?? "?";
      } catch {
        // ignore
      }
    }
    console.log("[report-fp] BUILD COMMIT_REF/CONTEXT/BRANCH:", buildRef, "package.version:", pkgVersion);

    // 获取 inspection_id
    const inspectionId = event.queryStringParameters?.inspection_id;
    
    if (!inspectionId) {
      return {
        statusCode: 400,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ error: "inspection_id is required" })
      };
    }

    console.log("🚀 Generating Markdown-based Word report for:", inspectionId);

    // 1. 获取检查数据
    const inspection = await get(inspectionId, event);
    if (!inspection) {
      return {
        statusCode: 404,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ error: "Inspection not found" })
      };
    }
    const findingsWithPhotos = (inspection.findings || []).filter((f: any) => Array.isArray(f.photo_ids) && f.photo_ids.length > 0).length;
    const photosByFinding: Record<string, number> = {};
    for (const f of inspection.findings || []) {
      photosByFinding[f.id] = Array.isArray((f as any).photo_ids) ? (f as any).photo_ids.length : 0;
    }
    console.log("[report-fp] inspection loaded id=" + inspection.inspection_id + " findings=" + (inspection.findings?.length ?? 0) + " findings_with_photos=" + findingsWithPhotos + " photos_by_finding=" + JSON.stringify(photosByFinding));

    // 2. 规范化检查数据（canonical layer）
    const { canonical } = normalizeInspection(inspection.raw, inspection.inspection_id);
    console.log("✅ Normalized inspection data");

    // 3. 加载 responses.yml
    const responses = await loadResponses(event);
    console.log("✅ Loaded responses.yml");

    // 4. 生成 Markdown 报告
    console.log("📝 Generating Markdown report...");
    const markdown = await buildMarkdownReport({
      inspection,
      findings: inspection.findings || [],
      responses,
      event
    });
    console.log(`✅ Markdown report generated: ${markdown.length} characters`);

    // 5. 将 Markdown 转换为 HTML
    console.log("🔄 Converting Markdown to HTML...");
    const html = markdownToHtml(markdown);
    console.log(`✅ HTML generated: ${html.length} characters`);

    // 6. 加载 Word 模板
    console.log("📄 Loading Word template...");
    const templateBuffer = loadWordTemplate();

    // P0: 验证模板包含 REPORT_BODY_HTML 占位符
    const zip = new PizZip(templateBuffer);
    const documentXml = zip.files["word/document.xml"]?.asText() || "";
    const hasPlaceholder = documentXml.includes("REPORT_BODY_HTML") || documentXml.includes("report_body_html") || documentXml.includes("Report_Body_Html");
    if (!hasPlaceholder) {
      const sampleXml = documentXml.substring(0, 2000);
      throw new Error(`Template missing required placeholder: REPORT_BODY_HTML. buffer.length=${templateBuffer.length} document.xml[0:2000]=${JSON.stringify(sampleXml)}`);
    }
    console.log("[report-fp] placeholder: required ok (REPORT_BODY_HTML present)");

    // 7. 准备模板数据（封面页数据，使用 canonical）
    const defaultText = await loadDefaultText(event);
    
    // Format assessment_date
    let assessmentDate = canonical.assessment_date || new Date().toISOString();
    let formattedDate = defaultText.ASSESSMENT_DATE;
    try {
      const date = new Date(assessmentDate);
      if (!isNaN(date.getTime())) {
        formattedDate = date.toLocaleDateString("en-AU", {
          year: "numeric",
          month: "long",
          day: "numeric"
        });
      } else {
        formattedDate = assessmentDate || defaultText.ASSESSMENT_DATE;
      }
    } catch (e) {
      formattedDate = assessmentDate || defaultText.ASSESSMENT_DATE;
    }
    
    const coverData = {
      INSPECTION_ID: canonical.inspection_id || inspection.inspection_id || defaultText.INSPECTION_ID,
      ASSESSMENT_DATE: formattedDate,
      PREPARED_FOR: canonical.prepared_for || defaultText.PREPARED_FOR,
      PREPARED_BY: canonical.prepared_by || defaultText.PREPARED_BY,
      PROPERTY_ADDRESS: canonical.property_address || defaultText.PROPERTY_ADDRESS,
      PROPERTY_TYPE: canonical.property_type || defaultText.PROPERTY_TYPE
    };

    const templateData = { ...coverData, REPORT_BODY_HTML: html };
    const undefinedKeys = Object.entries(templateData).filter(([, v]) => v === undefined).map(([k]) => k);
    if (undefinedKeys.length > 0) {
      console.log("[report-fp] placeholder undefined keys:", undefinedKeys.join(", "));
    } else {
      console.log("[report-fp] placeholder: no undefined keys");
    }
    const sf = getSanitizeFingerprint();
    console.log("[report-fp] sanitize callCount:", sf.count, "preserveEmoji:", sf.preserveEmoji);
    for (const f of inspection.findings || []) {
      const count = (f as any).photo_ids && Array.isArray((f as any).photo_ids) ? (f as any).photo_ids.length : 0;
      console.log("[report-fp] photo finding.id:", f.id, "photo_ids:", count);
    }

    // 8. 渲染 Word 文档
    console.log("📝 Rendering Word document...");
    const wordBuffer = await renderDocx(templateBuffer, templateData);
    console.log(`✅ Word document generated: ${wordBuffer.length} bytes`);

    // 9. 返回 Word 文档
    const filename = `${inspectionId}-report.docx`;
    
    return {
      statusCode: 200,
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Content-Length": wordBuffer.length.toString()
      },
      body: wordBuffer.toString("base64"),
      isBase64Encoded: true
    };

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error occurred";
    const errorStack = error instanceof Error ? error.stack : undefined;
    
    console.error("❌ Error generating Markdown-based Word report:", error);
    console.error("Error stack:", errorStack);
    
    return {
      statusCode: 500,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        error: "Failed to generate Word report",
        message: errorMessage,
        stack: process.env.NETLIFY_DEV ? errorStack : undefined
      })
    };
  }
};
