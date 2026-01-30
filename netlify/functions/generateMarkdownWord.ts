/**
 * 生成基于 Markdown 的 Word 报告
 * 
 * 使用 buildMarkdownReport 生成完整的 Markdown 报告，
 * 然后转换为 Word 文档并返回供下载
 */

import type { Handler, HandlerEvent, HandlerContext } from "@netlify/functions";
import { get } from "./lib/store.js";
import { buildMarkdownReport } from "./lib/generateReport.js";
import { loadResponses } from "./generateWordReport.js";
import { markdownToHtml } from "./lib/markdownToHtml.js";
import { renderDocx } from "./lib/renderDocx.js";
import { loadDefaultText } from "./lib/defaultTextLoader.js";
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
      console.log("✅ Loaded Word template from:", templatePath);
      return fs.readFileSync(templatePath);
    }
  }
  
  throw new Error("Could not find report-template-md.docx");
}

export const handler: Handler = async (event: HandlerEvent, _ctx: HandlerContext) => {
  try {
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

    // 2. 加载 responses.yml
    const responses = await loadResponses(event);
    console.log("✅ Loaded responses.yml");

    // 3. 生成 Markdown 报告
    console.log("📝 Generating Markdown report...");
    const markdown = await buildMarkdownReport({
      inspection,
      findings: inspection.findings || [],
      responses,
      event
    });
    console.log(`✅ Markdown report generated: ${markdown.length} characters`);

    // 4. 将 Markdown 转换为 HTML
    console.log("🔄 Converting Markdown to HTML...");
    const html = markdownToHtml(markdown);
    console.log(`✅ HTML generated: ${html.length} characters`);

    // 5. 加载 Word 模板
    console.log("📄 Loading Word template...");
    const templateBuffer = loadWordTemplate();

    // 6. 准备模板数据（封面页数据）
    const defaultText = await loadDefaultText(event);
    const raw = inspection.raw || {};
    
    // Extract basic info from inspection.raw
    const job = raw.job as Record<string, unknown> | undefined;
    const address = getFieldValue(raw, "job.address") || defaultText.PROPERTY_ADDRESS;
    const technicianName = getFieldValue(raw, "signoff.technician_name") || defaultText.PREPARED_BY;
    const assessmentDate = getFieldValue(raw, "created_at") || new Date().toISOString();
    
    // Format date
    let formattedDate = defaultText.ASSESSMENT_DATE;
    try {
      const date = new Date(assessmentDate);
      formattedDate = date.toLocaleDateString("en-AU", {
        year: "numeric",
        month: "long",
        day: "numeric"
      });
    } catch (e) {
      formattedDate = assessmentDate || defaultText.ASSESSMENT_DATE;
    }
    
    const coverData = {
      INSPECTION_ID: inspection.inspection_id || defaultText.INSPECTION_ID,
      ASSESSMENT_DATE: formattedDate,
      PREPARED_FOR: getFieldValue(raw, "job.prepared_for") || defaultText.PREPARED_FOR,
      PREPARED_BY: technicianName,
      PROPERTY_ADDRESS: address,
      PROPERTY_TYPE: getFieldValue(raw, "job.property_type") || defaultText.PROPERTY_TYPE
    };

    // 7. 渲染 Word 文档
    console.log("📝 Rendering Word document...");
    const wordBuffer = await renderDocx(templateBuffer, {
      ...coverData,
      REPORT_BODY_HTML: html
    });
    console.log(`✅ Word document generated: ${wordBuffer.length} bytes`);

    // 8. 返回 Word 文档
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
