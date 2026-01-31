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

const VERSION = "2026-01-31-v1";

import Docxtemplater from "docxtemplater";
import PizZip from "pizzip";
import { asBlob } from "html-docx-js-typescript";
import DocxMerger from "docx-merger";
import { sanitizeText } from "./sanitizeText";

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

  // 3. 将 HTML 转换为 DOCX
  let htmlContent = data.REPORT_BODY_HTML || "";
  if (!htmlContent) {
    throw new Error("REPORT_BODY_HTML 不能为空");
  }

  const htmlDocxResult = await asBlob(htmlContent, {
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
        console.log("[report-fp] Using renderer: HTML_MERGE(A)");
        resolve(mergedBuffer);
      } else {
        reject(new Error("合并 DOCX 失败"));
      }
    });
  });
}

/**
 * 方案 B：将 HTML 转换为格式化的纯文本插入（简单但会丢失格式）
 * 
 * 这个方案会保留基本的段落结构，但会丢失 HTML 格式（粗体、列表等）
 */
export function renderDocxWithHtmlAsText(
  templateBuffer: Buffer,
  data: Record<string, any>
): Buffer {
  console.log("[report-fp] Using renderer: HTML_ASTEXT(B)");
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

  // 准备所有数据
  const templateData: Record<string, string> = {
    INSPECTION_ID: data.INSPECTION_ID || "",
    ASSESSMENT_DATE: data.ASSESSMENT_DATE || "",
    PREPARED_FOR: data.PREPARED_FOR || "",
    PREPARED_BY: data.PREPARED_BY || "",
    PROPERTY_ADDRESS: data.PROPERTY_ADDRESS || "",
    PROPERTY_TYPE: data.PROPERTY_TYPE || "",
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
 * 主函数：根据配置选择方案
 * 
 * 默认使用方案 A（HTML 转 DOCX 并合并），保留更多格式
 * 如果遇到问题，可以切换到方案 B（纯文本）
 */
export async function renderDocx(
  templateBuffer: Buffer,
  data: Record<string, any>
): Promise<Buffer> {
  try {
    const outBuffer = await renderDocxWithHtmlMerge(templateBuffer, data);
    return outBuffer;
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.log("[report-fp] fallback to B because:", msg);
    return renderDocxWithHtmlAsText(templateBuffer, data);
  }
}
