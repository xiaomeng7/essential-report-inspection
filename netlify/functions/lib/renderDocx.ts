/** Minimal word/styles.xml required by docx-merger (html-docx output lacks it) */
const MINIMAL_STYLES_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:docDefaults><w:rPrDefault><w:rPr></w:rPr></w:rPrDefault></w:docDefaults>
  <w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:qFormat/></w:style>
</w:styles>`;

/** Inject word/styles.xml if missing (docx-merger fails on null) */
function ensureStylesXml(docxBuffer: Buffer): Buffer {
  const zip = new PizZip(docxBuffer);
  if (zip.files["word/styles.xml"]) return docxBuffer;

  zip.file("word/styles.xml", MINIMAL_STYLES_XML);

  const ct = zip.files["[Content_Types].xml"];
  if (ct) {
    let ctStr = ct.asText();
    if (!ctStr.includes("word/styles.xml")) {
      const insertBefore = "</Types>";
      ctStr = ctStr.replace(insertBefore,
        '  <Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>' + insertBefore);
      zip.file("[Content_Types].xml", ctStr);
    }
  }

  const rels = zip.files["word/_rels/document.xml.rels"];
  if (rels) {
    let relsStr = rels.asText();
    if (!relsStr.includes("styles.xml")) {
      const insertBefore = "</Relationships>";
      relsStr = relsStr.replace(insertBefore,
        '  <Relationship Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml" Id="rIdStyles"/>' + insertBefore);
      zip.file("word/_rels/document.xml.rels", relsStr);
    }
  }

  return zip.generate({ type: "nodebuffer" }) as Buffer;
}

/**
 * 免费替代方案：使用 html-docx-js-typescript + docx-merger 将 HTML 转换为 DOCX
 * 
 * 由于 docxtemplater-html-module 是付费模块，我们使用以下策略：
 * 1. 使用 docxtemplater 填充封面信息（6个字段）
 * 2. 将 HTML 内容转换为完整的 DOCX 文件
 * 3. 使用 docx-merger 合并封面 DOCX 和正文 DOCX
 * 
 * 或者使用更简单的方案 B：将 HTML 转换为格式化的纯文本插入（会丢失格式但更简单）
 */

const VERSION = "2026-01-31-v2-html-to-docx";

import Docxtemplater from "docxtemplater";
import PizZip from "pizzip";
import HTMLtoDOCX from "html-to-docx";
import DocxMerger from "docx-merger";
import juice from "juice";
import { sanitizeText } from "./sanitizeText";

/**
 * Extract body fragment from full HTML document.
 * Removes <html>, <head>, <style>, <meta>, <!doctype>, keeps only <body> content.
 * This fixes issues where html-docx-js-typescript doesn't handle full HTML documents correctly.
 */
function extractBodyFragment(html: string): string {
  if (!html || typeof html !== "string") return "";
  
  let fragment = html;
  
  // Remove <!doctype ...>
  fragment = fragment.replace(/<!doctype[^>]*>/gi, "");
  
  // Remove <style>...</style> (including content)
  fragment = fragment.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "");
  
  // Remove <head>...</head> (including content)
  fragment = fragment.replace(/<head[^>]*>[\s\S]*?<\/head>/gi, "");
  
  // Extract <body>...</body> content if present
  const bodyMatch = /<body[^>]*>([\s\S]*?)<\/body>/i.exec(fragment);
  if (bodyMatch && bodyMatch[1]) {
    fragment = bodyMatch[1];
  } else {
    // Remove opening/closing html and body tags if no body match
    fragment = fragment.replace(/<\/?html[^>]*>/gi, "");
    fragment = fragment.replace(/<\/?body[^>]*>/gi, "");
  }
  
  // Remove <meta ...> tags
  fragment = fragment.replace(/<meta[^>]*\/?>/gi, "");
  
  fragment = fragment.trim();
  
  // Diagnostic: if fragment is too short, log snippet
  if (fragment.length < 2000) {
    const snippet = fragment.length > 500 ? fragment.substring(0, 500) + "..." : fragment;
    console.log("[docx-diag] extractBodyFragment WARNING: fragmentLength=" + fragment.length + " (< 2000), snippet=" + snippet);
  }
  
  return fragment;
}

/**
 * Preprocess HTML to avoid html-to-docx bugs (e.g. Invalid XML name: @w in buildTableCellWidth).
 * Strips ALL attributes from table elements and removes width everywhere so the converter never sees them.
 */
function cleanHtmlForDocx(html: string): string {
  if (!html || typeof html !== "string") return html;
  let out = html;
  // Remove width="..." and width:... from entire document so html-to-docx never builds invalid XML
  out = out.replace(/\swidth\s*=\s*["'][^"']*["']/gi, " ");
  out = out.replace(/\swidth\s*:\s*[^;}"']+;?/gi, " ");
  const tableTags = ["table", "thead", "tbody", "tfoot", "tr", "th", "td"];
  for (const tag of tableTags) {
    const re = new RegExp(`<${tag}([^>]*)>`, "gi");
    out = out.replace(re, () => `<${tag}>`);
  }
  out = out.replace(/<colgroup[^>]*>/gi, "<colgroup>");
  out = out.replace(/<col[^>]*\/?>/gi, "<col/>");
  out = out.replace(/\s@(\w+)=/gi, " ");
  return out;
}

/**
 * Fallback: replace tables with simple paragraphs so html-to-docx can complete (avoids Invalid XML name bugs).
 */
function stripTablesForDocx(html: string): string {
  if (!html || typeof html !== "string") return html;
  return html.replace(/<table[\s\S]*?<\/table>/gi, "<p>[Table]</p>");
}

/**
 * NEW: Stable rendering path that merges cover + body without relying on placeholder injection.
 * 
 * Flow:
 * 1. Render cover using docxtemplater (cover fields only)
 * 2. Convert HTML to DOCX using html-docx-js-typescript
 * 3. Merge cover + body DOCX using docx-merger
 * 
 * This avoids the failed "inject HTML into placeholder" approach.
 */
export async function renderDocxByMergingCoverAndBody(
  coverTemplateBuffer: Buffer,
  templateData: Record<string, any>,
  reportHtml: string,
  runId?: string
): Promise<Buffer> {
  const RID = runId || "unknown";
  console.log("[docx-diag][RUN_ID=" + RID + "] renderDocxByMergingCoverAndBody: START");
  
  // 1. Render cover DOCX with docxtemplater (cover fields only, no HTML injection)
  const coverZip = new PizZip(coverTemplateBuffer);
  const coverDoc = new Docxtemplater(coverZip, {
    paragraphLoop: true,
    linebreaks: true,
    delimiters: { start: "{{", end: "}}" },
  });
  
  const coverData: Record<string, string> = {
    INSPECTION_ID: templateData.INSPECTION_ID || "",
    ASSESSMENT_DATE: templateData.ASSESSMENT_DATE || "",
    PREPARED_FOR: templateData.PREPARED_FOR || "",
    PREPARED_BY: templateData.PREPARED_BY || "",
    PROPERTY_ADDRESS: templateData.PROPERTY_ADDRESS || "",
    PROPERTY_TYPE: templateData.PROPERTY_TYPE || "",
    ASSESSMENT_PURPOSE: templateData.ASSESSMENT_PURPOSE || "",
    REPORT_BODY_HTML: "", // Empty - we don't inject via placeholder
    TERMS_AND_CONDITIONS: "",
  };
  
  coverDoc.setData(coverData);
  
  try {
    coverDoc.render();
  } catch (error: any) {
    console.error("[docx-diag][RUN_ID=" + RID + "] Cover render error:", error);
    if (error.properties && error.properties.errors instanceof Array) {
      const errorMessages = error.properties.errors
        .map((e: any) => `${e.name}: ${e.message}`)
        .join("\n");
      throw new Error(`Cover template render failed: ${errorMessages}`);
    }
    throw error;
  }
  
  const coverBuffer = coverDoc.getZip().generate({ type: "nodebuffer" });
  
  // Read cover document.xml for diagnostics
  const coverZipCheck = new PizZip(coverBuffer);
  const coverDocEntry = coverZipCheck.files["word/document.xml"];
  const coverDocXml = coverDocEntry ? (coverDocEntry as { asText?: () => string }).asText?.() ?? "" : "";
  const coverDocXmlLength = coverDocXml.length;
  console.log("[docx-diag][RUN_ID=" + RID + "] coverDocumentXmlLength=" + coverDocXmlLength);
  
  // 2. Inline CSS so html-to-docx gets style on each element (Word formatting)
  let htmlWithInlineStyles = reportHtml;
  try {
    htmlWithInlineStyles = juice(reportHtml);
    console.log("[docx-diag][RUN_ID=" + RID + "] juice inlined CSS, length=" + htmlWithInlineStyles.length);
  } catch (juiceErr) {
    console.warn("[docx-diag][RUN_ID=" + RID + "] juice inlining failed, using original HTML:", juiceErr);
  }
  // Extract body inner HTML (remove html/head/style wrapper)
  let bodyInner = htmlWithInlineStyles;
  if (htmlWithInlineStyles.includes("<body")) {
    bodyInner = extractBodyFragment(htmlWithInlineStyles);
  }
  
  const rawHtmlLength = reportHtml.length;
  const fragmentLength = bodyInner.length;
  console.log("[docx-diag][RUN_ID=" + RID + "] rawHtmlLength=" + rawHtmlLength + " fragmentLength=" + fragmentLength);
  
  // FORCE_SIMPLE_HTML override for testing
  if (process.env.FORCE_SIMPLE_HTML === "1") {
    bodyInner = "<p>HELLO TEST</p><p>Second line</p><p>Third paragraph for testing html-docx conversion</p>";
    console.log("[docx-diag][RUN_ID=" + RID + "] force simple html enabled: replaced with test HTML");
  }
  
  // 3. Convert HTML to DOCX using html-to-docx (generates real content in document.xml, not altChunk)
  if (!bodyInner || bodyInner.trim().length === 0) {
    throw new Error("Body HTML is empty after extracting fragment; cannot generate body DOCX");
  }
  
  // html-to-docx expects full HTML document, so wrap fragment if needed
  let htmlForConversion = bodyInner;
  if (!bodyInner.toLowerCase().includes("<!doctype") && !bodyInner.toLowerCase().includes("<html")) {
    htmlForConversion = `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
</head>
<body>
${bodyInner}
</body>
</html>`;
  }
  
  // Preprocess: strip table attributes that trigger html-to-docx bug (Invalid XML name: @w)
  htmlForConversion = cleanHtmlForDocx(htmlForConversion);
  console.log("[docx-diag][RUN_ID=" + RID + "] htmlForConversion length=" + htmlForConversion.length + " (after cleanHtmlForDocx)");

  let bodyBuffer: Buffer;
  try {
    bodyBuffer = await HTMLtoDOCX(htmlForConversion, null, {
      table: { row: { cantSplit: true } },
      footer: false,
      pageNumber: false,
      font: "Calibri",
      fontSize: 11,
    });
  } catch (htmlToDocxErr: unknown) {
    const errMsg = htmlToDocxErr instanceof Error ? htmlToDocxErr.message : String(htmlToDocxErr);
    const isInvalidXml = /Invalid XML name|invalid character|InvalidCharacterError/i.test(errMsg);
    if (isInvalidXml) {
      console.warn("[docx-diag][RUN_ID=" + RID + "] html-to-docx failed with XML error, retrying without tables:", errMsg.slice(0, 120));
      const fallbackHtml = stripTablesForDocx(htmlForConversion);
      bodyBuffer = await HTMLtoDOCX(fallbackHtml, null, {
        table: { row: { cantSplit: true } },
        footer: false,
        pageNumber: false,
        font: "Calibri",
        fontSize: 11,
      });
    } else {
      throw htmlToDocxErr;
    }
  }
  
  // 4. Merge cover + body manually (docx-merger has issues with html-to-docx output)
  // Strategy: Take cover DOCX structure, append body content to document.xml
  console.log("[docx-diag][RUN_ID=" + RID + "] manual merge: extracting cover and body structures");
  
  const coverZipFinal = new PizZip(coverBuffer);
  const bodyZipFinal = new PizZip(bodyBuffer);
  
  // Reuse bodyDocEntry/bodyDocXml from diagnostics above if already defined, otherwise extract
  const bodyDocEntry2 = bodyZipFinal.files["word/document.xml"];
  const bodyDocXml2 = bodyDocEntry2 ? (bodyDocEntry2 as { asText?: () => string }).asText?.() ?? "" : "";
  
  // Extract <w:body>...</w:body> content from body
  const bodyMatch = /<w:body[^>]*>([\s\S]*?)<\/w:body>/i.exec(bodyDocXml2);
  if (!bodyMatch || !bodyMatch[1]) {
    throw new Error("Cannot extract <w:body> from body DOCX");
  }
  const bodyContent = bodyMatch[1];
  
  // Extract cover document.xml
  const coverDocEntry2 = coverZipFinal.files["word/document.xml"];
  let coverDocXml2 = coverDocEntry2 ? (coverDocEntry2 as { asText?: () => string }).asText?.() ?? "" : "";
  
  // Insert body content before </w:body> in cover
  // Cover has structure: <w:document>...<w:body>...[cover content]...<w:sectPr>...</w:sectPr></w:body></w:document>
  // We want to insert body content before <w:sectPr>
  
  const coverBodyMatch = /<w:body[^>]*>([\s\S]*?)<\/w:body>/i.exec(coverDocXml2);
  if (!coverBodyMatch) {
    throw new Error("Cannot find <w:body> in cover DOCX");
  }
  
  const coverBodyInner = coverBodyMatch[1];
  // Find last <w:sectPr> (page setup) in cover body - we want to keep it at the end
  const sectPrMatch = /(<w:sectPr[\s\S]*?<\/w:sectPr>)\s*$/i.exec(coverBodyInner);
  
  let mergedBodyInner: string;
  if (sectPrMatch) {
    // Insert body content before sectPr
    const beforeSectPr = coverBodyInner.substring(0, sectPrMatch.index!);
    const sectPr = sectPrMatch[1];
    mergedBodyInner = beforeSectPr + "\n" + bodyContent + "\n" + sectPr;
  } else {
    // No sectPr, just append
    mergedBodyInner = coverBodyInner + "\n" + bodyContent;
  }
  
  // Replace body content in cover XML
  const mergedDocXml2 = coverDocXml2.replace(
    /<w:body[^>]*>[\s\S]*?<\/w:body>/i,
    `<w:body>${mergedBodyInner}</w:body>`
  );
  
  // Update cover ZIP with merged document.xml
  coverZipFinal.file("word/document.xml", mergedDocXml2);
  
  // Copy styles from body if needed (html-to-docx has its own styles)
  const bodyStylesEntry = bodyZipFinal.files["word/styles.xml"];
  if (bodyStylesEntry) {
    const bodyStyles = bodyStylesEntry.asText();
    if (bodyStyles && bodyStyles.length > 1000) {
      // html-to-docx has better styles, use them
      coverZipFinal.file("word/styles.xml", bodyStyles);
      console.log("[docx-diag][RUN_ID=" + RID + "] copied styles.xml from body DOCX");
    }
  }
  
  // Generate final merged buffer
  const mergedBuffer = coverZipFinal.generate({ type: "nodebuffer" }) as Buffer;
  
  // 5. Verify merged DOCX has body content
  const mergedZip = new PizZip(mergedBuffer);
  const mergedDocEntry = mergedZip.files["word/document.xml"];
  const mergedDocXmlFinal = mergedDocEntry ? (mergedDocEntry as { asText?: () => string }).asText?.() ?? "" : "";
  const mergedDocXmlLength = mergedDocXmlFinal.length;
  
  // Compute body doc xml length for diagnostics
  const bodyDocXmlLength2 = bodyDocXml2.length;
  const coverDocXmlLength2 = coverDocXml2.length;
  
  console.log("[docx-diag][RUN_ID=" + RID + "] bodyDocxDocumentXmlLength=" + bodyDocXmlLength2);
  console.log("[docx-diag][RUN_ID=" + RID + "] mergedDocumentXmlLength=" + mergedDocXmlLength);
  
  // Validation: merged document.xml must be significantly larger than cover (indicating body was merged)
  const MIN_MERGED_LENGTH = 20000;
  if (mergedDocXmlLength < MIN_MERGED_LENGTH) {
    const diagnostic = {
      mergedDocXmlLength,
      coverDocXmlLength: coverDocXmlLength2,
      bodyDocXmlLength: bodyDocXmlLength2,
      fragmentLength,
      minRequired: MIN_MERGED_LENGTH,
    };
    throw new Error("DOCX_RENDER_FAILED: merged document.xml too small (body not injected). " + JSON.stringify(diagnostic));
  }
  
  // Check for body markers
  const hasBodyMarker = 
    mergedDocXmlFinal.includes("Executive Summary") ||
    mergedDocXmlFinal.includes("Executive") ||
    mergedDocXmlFinal.includes("Evidence") ||
    mergedDocXmlFinal.includes("Observed Condition") ||
    mergedDocXmlFinal.includes("HELLO TEST") || // for FORCE_SIMPLE_HTML test
    mergedDocXmlFinal.includes("Recommended Findings");
  
  if (!hasBodyMarker) {
    console.warn("[docx-diag][RUN_ID=" + RID + "] WARNING: merged DOCX has no recognizable body markers (may be empty body)");
  } else {
    console.log("[docx-diag][RUN_ID=" + RID + "] ✅ merged DOCX contains body markers");
  }
  
  console.log("[docx-diag][RUN_ID=" + RID + "] renderDocxByMergingCoverAndBody: SUCCESS");
  return mergedBuffer;
}

/**
 * 方案 A：将 HTML 转换为 DOCX 并合并（推荐，保留格式）
 * 
 * 输入：
 * - templateBuffer: Word 模板的 Buffer（包含封面占位符）
 * - data: 包含封面字段和 REPORT_BODY_HTML
 * 
 * 输出：合并后的 DOCX Buffer
 */
export async function renderDocxWithHtmlMerge(
  templateBuffer: Buffer,
  data: Record<string, any>
): Promise<Buffer> {
  // 1. 使用 docxtemplater 填充封面信息
  const zip = new PizZip(templateBuffer);
  const doc = new Docxtemplater(zip, {
    paragraphLoop: true,
    linebreaks: true,
    delimiters: { start: "{{", end: "}}" },
  });

  // 准备封面数据（6 封面 + ASSESSMENT_PURPOSE + REPORT_BODY_HTML/TERMS 等置空，方案 A 下正文由 asBlob 单独生成并合并）
  const coverData: Record<string, string> = {
    INSPECTION_ID: data.INSPECTION_ID || "",
    ASSESSMENT_DATE: data.ASSESSMENT_DATE || "",
    PREPARED_FOR: data.PREPARED_FOR || "",
    PREPARED_BY: data.PREPARED_BY || "",
    PROPERTY_ADDRESS: data.PROPERTY_ADDRESS || "",
    PROPERTY_TYPE: data.PROPERTY_TYPE || "",
    ASSESSMENT_PURPOSE: data.ASSESSMENT_PURPOSE || "",
    REPORT_BODY_HTML: "",
    TERMS_AND_CONDITIONS: "",
  };

  doc.setData(coverData);
  
  try {
    doc.render();
  } catch (error: any) {
    console.error("Docxtemplater render error:", error);
    if (error.properties && error.properties.errors instanceof Array) {
      const errorMessages = error.properties.errors
        .map((e: any) => `${e.name}: ${e.message}`)
        .join("\n");
      throw new Error(`模板渲染失败: ${errorMessages}`);
    }
    throw error;
  }

  // 2. 生成封面 DOCX
  const coverBuffer = doc.getZip().generate({ type: "nodebuffer" });

  // 3. 将 HTML 转换为 DOCX（提取 body fragment，移除 html/head/style 等外层标签）
  const rawHtml = data.REPORT_BODY_HTML || "";
  if (!rawHtml) {
    throw new Error("REPORT_BODY_HTML 不能为空");
  }
  
  let fragment = extractBodyFragment(rawHtml);
  
  // FORCE_SIMPLE_HTML=1: override with test HTML to verify html-docx module works
  if (process.env.FORCE_SIMPLE_HTML === "1") {
    fragment = "<p>HELLO TEST</p><p>Second line</p><p>Third paragraph for testing</p>";
    console.log("[docx-diag] force simple html enabled: replaced REPORT_BODY_HTML with test HTML");
  }
  
  console.log("[docx-diag] rawHtmlLength=" + rawHtml.length + " fragmentLength=" + fragment.length);

  const htmlDocxResult = await asBlob(fragment, {
    pageSize: {
      width: 12240, // A4 width in twips (8.5 inches)
      height: 15840, // A4 height in twips (11 inches)
    },
  });

  // 4. 转为 Buffer（Node 返回 Buffer，浏览器返回 Blob）
  let htmlDocxBuffer = Buffer.isBuffer(htmlDocxResult)
    ? htmlDocxResult
    : Buffer.from(await (htmlDocxResult as Blob).arrayBuffer());

  // 4.5. html-docx 输出缺少 word/styles.xml，docx-merger 会抛错；注入 minimal styles
  htmlDocxBuffer = ensureStylesXml(htmlDocxBuffer);

  // 5. 使用 docx-merger 合并两个 DOCX（封面 + 正文）
  return new Promise((resolve, reject) => {
    const merger = new DocxMerger({}, [
      coverBuffer.toString("binary"),
      htmlDocxBuffer.toString("binary"),
    ]);

    merger.save("nodebuffer", (mergedBuffer: Buffer) => {
      if (mergedBuffer) {
        // Post-render validation: read merged document.xml to ensure body injected
        try {
          const mergedZip = new PizZip(mergedBuffer);
          const mergedDocEntry = mergedZip.files["word/document.xml"];
          const mergedDocXml = mergedDocEntry ? (mergedDocEntry as { asText?: () => string }).asText?.() ?? "" : "";
          const outLen = mergedDocXml.length;
          const containsPlaceholder = mergedDocXml.includes("{{REPORT_BODY_HTML}}");
          const containsHtmlDoctype = mergedDocXml.includes("<!doctype") || mergedDocXml.includes("<html");
          console.log("[docx-diag] post-merge: outDocumentXmlLength=" + outLen + " containsPlaceholder=" + containsPlaceholder + " containsHtmlDoctype=" + containsHtmlDoctype);
          if (outLen < 20000) {
            reject(new Error("DOCX_RENDER_FAILED: body not injected; outXmlLen=" + outLen + " fragmentLen=" + fragment.length + " placeholderStillThere=" + containsPlaceholder));
            return;
          }
        } catch (validateErr) {
          console.warn("[docx-diag] post-merge validation failed:", validateErr);
          // Don't fail the render if validation itself errors - just warn
        }
        resolve(mergedBuffer);
      } else {
        reject(new Error("合并 DOCX 失败"));
      }
    });
  });
}

/**
 * 方案 B：将 HTML 转为纯文本插入模板（已禁用，不可达）。
 * B 会把 HTML 当纯文本塞进 docx，导致 Word 无法渲染结构，正文全部不可见（只有封面）。
 * renderDocx() 仅允许 A；若 A 失败则直接 throw，不再 fallback 到 B。
 */
export function renderDocxWithHtmlAsText(
  templateBuffer: Buffer,
  data: Record<string, any>
): Buffer {
  const zip = new PizZip(templateBuffer);
  
  // 检查模板是否包含 REPORT_BODY_HTML 占位符
  const documentXml = zip.files["word/document.xml"]?.asText() || "";
  if (!documentXml.includes("REPORT_BODY_HTML")) {
    throw new Error("模板中未找到 {{REPORT_BODY_HTML}} 占位符。请在模板正文插入 {{REPORT_BODY_HTML}}");
  }

  const doc = new Docxtemplater(zip, {
    paragraphLoop: true,
    linebreaks: true,
    delimiters: { start: "{{", end: "}}" },
  });

  // 将 HTML 转换为格式化的纯文本
  let htmlContent = data.REPORT_BODY_HTML || "";
  // Sanitize HTML before converting to text (defensive; preserve emoji for consistency with markdownToHtml)
  htmlContent = sanitizeText(htmlContent, { preserveEmoji: true });
  const textContent = htmlToFormattedText(htmlContent);

  // 准备所有数据（需覆盖模板中所有占位符）
  const templateData: Record<string, string> = {
    INSPECTION_ID: data.INSPECTION_ID || "",
    ASSESSMENT_DATE: data.ASSESSMENT_DATE || "",
    PREPARED_FOR: data.PREPARED_FOR || "",
    PREPARED_BY: data.PREPARED_BY || "",
    PROPERTY_ADDRESS: data.PROPERTY_ADDRESS || "",
    PROPERTY_TYPE: data.PROPERTY_TYPE || "",
    ASSESSMENT_PURPOSE: data.ASSESSMENT_PURPOSE || "",
    REPORT_BODY_HTML: textContent, // 使用格式化文本替代 HTML
  };

  doc.setData(templateData);

  try {
    doc.render();
  } catch (error: any) {
    console.error("Docxtemplater render error:", error);
    if (error.properties && error.properties.errors instanceof Array) {
      const errorMessages = error.properties.errors
        .map((e: any) => `${e.name}: ${e.message}`)
        .join("\n");
      throw new Error(`模板渲染失败: ${errorMessages}`);
    }
    throw error;
  }

  return doc.getZip().generate({ type: "nodebuffer" });
}

/**
 * 将 HTML 转换为格式化的纯文本
 * 保留基本的段落结构和换行
 */
function htmlToFormattedText(html: string): string {
  if (!html) return "";

  let text = html;

  // 移除 script 和 style 标签及其内容
  text = text.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "");
  text = text.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "");

  // 转换标题
  text = text.replace(/<h1[^>]*>(.*?)<\/h1>/gi, "\n\n$1\n");
  text = text.replace(/<h2[^>]*>(.*?)<\/h2>/gi, "\n\n$1\n");
  text = text.replace(/<h3[^>]*>(.*?)<\/h3>/gi, "\n\n$1\n");

  // 转换段落
  text = text.replace(/<p[^>]*>(.*?)<\/p>/gi, "\n$1\n");

  // 转换列表项
  text = text.replace(/<li[^>]*>(.*?)<\/li>/gi, "• $1\n");

  // 转换粗体（保留文本）
  text = text.replace(/<strong[^>]*>(.*?)<\/strong>/gi, "$1");
  text = text.replace(/<b[^>]*>(.*?)<\/b>/gi, "$1");

  // 转换换行
  text = text.replace(/<br[^>]*\/?>/gi, "\n");

  // 移除所有剩余的 HTML 标签
  text = text.replace(/<[^>]+>/g, "");

  // 解码 HTML 实体
  text = text
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");

  // 清理多余的空白行
  text = text.replace(/\n{3,}/g, "\n\n");
  text = text.trim();

  return text;
}

/**
 * Gold 模板专用：仅用 docxtemplater 填充占位符，无 HTML 注入
 * 用于 Gold_Report_Template.docx（45 个占位符，无 REPORT_BODY_HTML）
 */
export function renderDocxGoldTemplate(
  templateBuffer: Buffer,
  data: Record<string, string>
): Buffer {
  const zip = new PizZip(templateBuffer);
  const doc = new Docxtemplater(zip, {
    paragraphLoop: true,
    linebreaks: true,
    delimiters: { start: "{{", end: "}}" },
  });
  doc.setData(data);
  try {
    doc.render();
  } catch (e: any) {
    const msg = e?.properties?.errors?.map((err: any) => `${err.id}: ${err.message}`).join("; ") || e?.message || String(e);
    throw new Error("Gold template render failed: " + msg);
  }
  let out = doc.getZip().generate({ type: "nodebuffer" });
  if (Buffer.isBuffer(out)) return out;
  return Buffer.from(out as ArrayBuffer);
}

/**
 * 主函数：仅允许 HTML_MERGE(A)。禁止使用 HTML_ASTEXT(B) —— B 会把 HTML 当纯文本塞进 docx，
 * 导致 Word 无法渲染结构，正文全部不可见（只有封面）。
 * 
 * Debug 环境变量：FORCE_DOCX_RENDERER=A|B 可强制指定 renderer（B 仅用于 debug）。
 */
export async function renderDocx(
  templateBuffer: Buffer,
  data: Record<string, any>
): Promise<Buffer> {
  const html = data.REPORT_BODY_HTML;
  if (!html || typeof html !== "string" || String(html).trim().length === 0) {
    throw new Error("REPORT_BODY_HTML is required for DOCX generation; cannot render without body HTML.");
  }

  const forcedRenderer = process.env.FORCE_DOCX_RENDERER as "A" | "B" | undefined;
  if (forcedRenderer === "B") {
    console.log("[report-fp] renderer forced: B (HTML_ASTEXT) — may cause body content loss");
    return renderDocxWithHtmlAsText(templateBuffer, data);
  }

  // Use renderDocxByMergingCoverAndBody (HTMLtoDOCX) — no asBlob dependency
  const reportHtml = data.REPORT_BODY_HTML || "";
  const buf = await renderDocxByMergingCoverAndBody(templateBuffer, data, reportHtml);
  if (!buf || !Buffer.isBuffer(buf) || buf.length === 0) {
    throw new Error("renderDocxByMergingCoverAndBody returned empty or invalid buffer");
  }
  return buf;
}
