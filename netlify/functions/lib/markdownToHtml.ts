/**
 * 将 Markdown 转换为 HTML
 *
 * 稳定支持：h1/h2/h3、表格、原始 HTML（如 <div class="page-break"></div> 分页符）。
 * 使用 markdown-it + markdown-it-table，html: true 保留 raw HTML 不转义。
 * 返回完整 HTML 文档，样式从 reportStyles.css 加载，找不到则用内置 fallback。
 */

const VERSION = "2026-01-31-v1";

import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";
import MarkdownIt from "markdown-it";
import { markdownItTable } from "markdown-it-table";
import { sanitizeText } from "./sanitizeText";
import { sha1 } from "./fingerprint";

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

const FALLBACK_CSS = `
body { font-family: Calibri, Segoe UI, Arial, sans-serif; font-size: 11pt; line-height: 1.4; color: #1a1a1a; padding: 18pt 22pt; }
p { margin: 0 0 8pt 0; }
strong { font-weight: 700; }
h1 { font-size: 18pt; font-weight: 700; margin: 0 0 10pt 0; }
h2 { font-size: 14pt; font-weight: 700; margin: 14pt 0 8pt 0; }
h2.page-title { page-break-before: always; margin-top: 0; margin-bottom: 12pt; }
h3 { font-size: 12pt; font-weight: 700; margin: 10pt 0 6pt 0; }
h4 { font-size: 11pt; font-weight: 700; margin: 8pt 0 4pt 0; }
ul, ol { margin: 0 0 10pt 18pt; padding: 0; }
li { margin: 0 0 4pt 0; }
table { width: 100%; border-collapse: collapse; margin: 10pt 0 12pt 0; table-layout: fixed; font-size: 11pt; }
th, td { border: 1px solid #c8c8c8; padding: 6pt 8pt; vertical-align: top; word-wrap: break-word; }
th { font-weight: 700; background-color: #f5f5f5; }
.table-compact th, .table-compact td { padding: 4pt 6pt; }
.kv { width: 100%; border: 0; }
.kv td { border: 0; padding: 3pt 0; }
.kv td.k { width: 140pt; font-weight: 700; }
.small { font-size: 9.5pt; color: #555; }
.note { font-size: 10pt; color: #333; margin: 8pt 0 10pt 0; }
.disclaimer { font-size: 9.5pt; color: #555; }
.badge { font-weight: 700; }
.page-break, div[style*="page-break-after"] { page-break-after: always; }
h2, h3, h4, table, tr { page-break-inside: avoid; }
tbody { page-break-inside: auto; }
`.trim();

function loadReportCss(): string {
  const possiblePaths = [
    path.join(__dirname, "..", "reportStyles.css"),
    path.join(process.cwd(), "netlify", "functions", "reportStyles.css"),
    path.join(process.cwd(), "reportStyles.css"),
    "/opt/build/repo/netlify/functions/reportStyles.css",
    "/opt/build/repo/reportStyles.css",
  ];
  for (const filePath of possiblePaths) {
    try {
      if (fs.existsSync(filePath)) {
        const css = fs.readFileSync(filePath, "utf-8").trim();
        console.log("[report-fp] CSS path:", filePath, "length:", css.length, "sha1:", sha1(css));
        console.log("[report] CSS loaded from:", filePath);
        return css;
      }
    } catch {
      // continue to next path
    }
  }
  const css = FALLBACK_CSS;
  console.log("[report-fp] CSS path: FALLBACK_CSS length:", css.length, "sha1:", sha1(css));
  console.log("[report] CSS loaded from: FALLBACK_CSS");
  return css;
}

const md = new MarkdownIt({
  html: true,
  linkify: true,
  breaks: true,
  typographer: false,
}).use(markdownItTable);

function docxSafeNormalize(html: string): string {
  return html
    // remove control chars (keep \t \n \r out of here because they might be in HTML source)
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "")
    // nbsp to normal space
    .replace(/\u00A0/g, " ")
    // smart quotes to plain quotes
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    // en/em dash to hyphen
    .replace(/[\u2013\u2014]/g, "-");
}

/**
 * 将 Markdown 转为完整 HTML 文档（raw HTML 如 page-break div 保留不转义）
 */
export function markdownToHtml(markdown: string): string {
  console.log("[report] markdownToHtml VERSION=" + VERSION);
  if (!markdown) {
    return "";
  }

  let htmlBody: string;
  try {
    htmlBody = md.render(markdown);
    htmlBody = docxSafeNormalize(htmlBody);
    htmlBody = sanitizeText(htmlBody, { preserveEmoji: true });
  } catch (error) {
    console.error("Markdown 转换失败:", error);
    htmlBody = markdown
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/\n/g, "<br>");
    htmlBody = docxSafeNormalize(htmlBody);
    htmlBody = sanitizeText(htmlBody, { preserveEmoji: true });
  }

  const css = loadReportCss();
  const fullHtml = `<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<style>${css}</style>
</head>
<body>
${htmlBody}
</body>
</html>`;
  console.log("[report-fp] HTML length:", fullHtml.length, "css sha1:", sha1(css));
  return fullHtml;
}
