/**
 * 生成基于 Markdown 的 Word 报告
 *
 * 使用 buildMarkdownReport 生成完整的 Markdown 报告，
 * 然后转换为 Word 文档并返回供下载。
 * 不使用 OpenAI 或任何 AI API，仅基于模板与规则（测试阶段保持无 AI）。
 */

import type { Handler, HandlerEvent, HandlerContext } from "@netlify/functions";
import { get, type StoredInspection } from "./lib/store";
import { buildMarkdownReport } from "./lib/generateReport";
import { loadResponses } from "./generateWordReport";
import { markdownToHtml } from "./lib/markdownToHtml";
import { renderDocx, renderDocxGoldTemplate } from "./lib/renderDocx";
import { buildGoldTemplateData } from "./lib/goldTemplateData";
import { sha1 } from "./lib/fingerprint";
import PizZip from "pizzip";
import { getSanitizeFingerprint, resetSanitizeFingerprint } from "./lib/sanitizeText";
import { loadDefaultText } from "./lib/defaultTextLoader";
import { normalizeInspection } from "./lib/normalizeInspection";
import { logWordReport } from "./lib/wordReportLog";
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

/** 优先使用 Gold_Report_Template.docx */
function loadGoldTemplate(): Buffer | null {
  const possiblePaths = [
    path.join(process.cwd(), "Gold_Report_Template.docx"),
    path.join(__dirname, "..", "..", "Gold_Report_Template.docx"),
    path.join(process.cwd(), "netlify", "functions", "Gold_Report_Template.docx"),
    "/opt/build/repo/Gold_Report_Template.docx",
  ];
  for (const templatePath of possiblePaths) {
    if (fs.existsSync(templatePath)) {
      const buf = fs.readFileSync(templatePath);
      console.log("[report-fp] Gold template path:", templatePath, "buffer.length:", buf.length);
      return buf;
    }
  }
  return null;
}

/** 回退：report-template-md.docx（封面 + REPORT_BODY_HTML） */
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

/** 可追溯元信息：写入 docx 的 docProps/custom.xml，供生产排错与一致性校验 */
export type DocxReportMeta = {
  inspection_id: string;
  data_version: string;
  template_version: string;
  generator_version: string;
};

function escapeXml(str: string): string {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/** 向已生成的 docx buffer 注入 docProps/custom.xml（inspection_id / data_version / template_version / generator_version） */
function injectDocxReportMetadata(docxBuffer: Buffer, meta: DocxReportMeta): Buffer {
  const zip = new PizZip(docxBuffer);
  const customXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/custom-properties" xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes">
  <property fmtid="{D5CDD505-2E9C-101B-9397-08002B2CF9AE}" pid="2" name="inspection_id"><vt:lpwstr>${escapeXml(meta.inspection_id)}</vt:lpwstr></property>
  <property fmtid="{D5CDD505-2E9C-101B-9397-08002B2CF9AE}" pid="3" name="data_version"><vt:lpwstr>${escapeXml(meta.data_version)}</vt:lpwstr></property>
  <property fmtid="{D5CDD505-2E9C-101B-9397-08002B2CF9AE}" pid="4" name="template_version"><vt:lpwstr>${escapeXml(meta.template_version)}</vt:lpwstr></property>
  <property fmtid="{D5CDD505-2E9C-101B-9397-08002B2CF9AE}" pid="5" name="generator_version"><vt:lpwstr>${escapeXml(meta.generator_version)}</vt:lpwstr></property>
</Properties>`;
  zip.file("docProps/custom.xml", customXml);

  const ct = zip.files["[Content_Types].xml"];
  if (ct) {
    let ctStr = ct.asText();
    if (!ctStr.includes("docProps/custom.xml")) {
      ctStr = ctStr.replace("</Types>", '  <Override PartName="/docProps/custom.xml" ContentType="application/vnd.openxmlformats-officedocument.custom-properties+xml"/>\n</Types>');
      zip.file("[Content_Types].xml", ctStr);
    }
  }

  const rels = zip.files["_rels/.rels"];
  if (rels) {
    let relsStr = rels.asText();
    if (!relsStr.includes("docProps/custom.xml")) {
      const relId = "rIdReportMeta";
      relsStr = relsStr.replace("</Relationships>", `  <Relationship Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/custom-properties" Target="docProps/custom.xml" Id="${relId}"/>\n</Relationships>`);
      zip.file("_rels/.rels", relsStr);
    }
  }

  return zip.generate({ type: "nodebuffer" }) as Buffer;
}

/**
 * 单一权威路径：根据已保存的 inspection 生成 Word buffer。
 * 供 Submit 同进程调用（避免 fetch 跨请求 + Blob 读写时序）和 Generate Word 接口使用。
 * 生成后注入可追溯元信息（inspection_id / data_version / template_version / generator_version）。
 */
export async function generateMarkdownWordBuffer(inspection: StoredInspection, event?: HandlerEvent): Promise<Buffer> {
  resetSanitizeFingerprint();
  const findingsWithPhotos = (inspection.findings || []).filter((f: any) => Array.isArray(f.photo_ids) && f.photo_ids.length > 0).length;
  const photosByFinding: Record<string, number> = {};
  for (const f of inspection.findings || []) {
    photosByFinding[f.id] = Array.isArray((f as any).photo_ids) ? (f as any).photo_ids.length : 0;
  }
  console.log("[report-fp] generateMarkdownWordBuffer id=" + inspection.inspection_id + " findings=" + (inspection.findings?.length ?? 0) + " findings_with_photos=" + findingsWithPhotos + " photos_by_finding=" + JSON.stringify(photosByFinding));

  const { canonical } = normalizeInspection(inspection.raw, inspection.inspection_id);
  console.log("✅ Normalized inspection data");

  const responses = await loadResponses(event);
  console.log("✅ Loaded responses.yml");

  const goldTemplateBuffer = loadGoldTemplate();
  const templateVersion = goldTemplateBuffer ? "gold" : "fallback";
  let wordBuffer: Buffer;

  if (goldTemplateBuffer) {
    console.log("📄 Using Gold_Report_Template.docx (placeholder fill)");
    const templateData = await buildGoldTemplateData(inspection, event);
    const undefinedKeys = Object.entries(templateData).filter(([, v]) => v === undefined).map(([k]) => k);
    if (undefinedKeys.length > 0) {
      console.warn("[report-fp] Gold templateData undefined keys:", undefinedKeys.slice(0, 10).join(", "), "(total", undefinedKeys.length, ")");
    }
    wordBuffer = renderDocxGoldTemplate(goldTemplateBuffer, templateData);
    console.log(`✅ Word document generated (Gold template): ${wordBuffer.length} bytes`);
  } else {
    console.log("📝 Generating Markdown report (fallback)...");
    const markdown = await buildMarkdownReport({
      inspection,
      findings: inspection.findings || [],
      responses,
      event
    });
    console.log(`✅ Markdown report generated: ${markdown.length} characters`);

    console.log("🔄 Converting Markdown to HTML...");
    const html = markdownToHtml(markdown);
    console.log(`✅ HTML generated: ${html.length} characters`);

    const templateBuffer = loadWordTemplate();
    const zip = new PizZip(templateBuffer);
    const documentXml = zip.files["word/document.xml"]?.asText() || "";
    const hasPlaceholder = documentXml.includes("REPORT_BODY_HTML") || documentXml.includes("report_body_html") || documentXml.includes("Report_Body_Html");
    if (!hasPlaceholder) {
      const sampleXml = documentXml.substring(0, 2000);
      throw new Error(`Template missing required placeholder: REPORT_BODY_HTML. buffer.length=${templateBuffer.length} document.xml[0:2000]=${JSON.stringify(sampleXml)}`);
    }
    const defaultText = await loadDefaultText(event);
    let assessmentDate = canonical.assessment_date || new Date().toISOString();
    let formattedDate = defaultText.ASSESSMENT_DATE;
    try {
      const date = new Date(assessmentDate);
      if (!isNaN(date.getTime())) {
        formattedDate = date.toLocaleDateString("en-AU", { year: "numeric", month: "long", day: "numeric" });
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
    wordBuffer = await renderDocx(templateBuffer, templateData);
    console.log(`✅ Word document generated (fallback): ${wordBuffer.length} bytes`);
  }

  const dataVersion = (inspection as { updated_at?: string }).updated_at ?? sha1(JSON.stringify(inspection.raw)).slice(0, 12);
  const generatorVersion = process.env.COMMIT_REF ?? process.env.CONTEXT ?? process.env.BRANCH ?? "dev";
  const withMeta = injectDocxReportMetadata(wordBuffer, {
    inspection_id: inspection.inspection_id,
    data_version: dataVersion,
    template_version: templateVersion,
    generator_version: generatorVersion,
  });
  return withMeta;
}

export const handler: Handler = async (event: HandlerEvent, _ctx: HandlerContext) => {
  const t0 = Date.now();
  try {
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

    const inspectionId = event.queryStringParameters?.inspection_id;
    if (!inspectionId) {
      return {
        statusCode: 400,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ error: "inspection_id is required" })
      };
    }

    console.log("🚀 Generating Markdown-based Word report for:", inspectionId);

    const inspection = await get(inspectionId, event);
    if (!inspection) {
      return {
        statusCode: 404,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ error: "Inspection not found" })
      };
    }

    const wordBuffer = await generateMarkdownWordBuffer(inspection, event);
    const filename = `${inspectionId}-report.docx`;
    logWordReport({ inspection_id: inspectionId, trigger: "review", duration_ms: Date.now() - t0, result: "success" });

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
    const inspectionIdForLog = event.queryStringParameters?.inspection_id ?? "?";
    logWordReport({ inspection_id: inspectionIdForLog, trigger: "review", duration_ms: Date.now() - t0, result: "fail", error_message: errorMessage });
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
