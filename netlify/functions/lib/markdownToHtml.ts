/**
 * 将 Markdown 转换为 HTML
 * 
 * 使用 markdown-it 库，支持基础 Markdown 语法：
 * - 标题（# ## ###）
 * - 列表（- * 1.）
 * - 表格
 * - 粗体、斜体
 * - 链接
 * - 换行
 */

import MarkdownIt from "markdown-it";

// 初始化 markdown-it
const md = new MarkdownIt({
  html: true,        // 允许 HTML 标签
  linkify: true,     // 自动将 URL 转换为链接
  breaks: true,      // 将换行符转换为 <br>
  typographer: true, // 启用一些语言中性的替换 + 引号美化
});

import { sanitizeText } from "./sanitizeText";

/**
 * 将 Markdown 字符串转换为 HTML
 * 
 * @param markdown - Markdown 格式的字符串
 * @returns HTML 格式的字符串（已清理）
 * 
 * @example
 * ```typescript
 * const md = "# Hello\n\nThis is **bold** text.";
 * const html = markdownToHtml(md);
 * // 返回: "<h1>Hello</h1>\n<p>This is <strong>bold</strong> text.</p>\n"
 * ```
 */
export function markdownToHtml(markdown: string): string {
  if (!markdown) {
    return "";
  }

  try {
    const html = md.render(markdown);
    // Sanitize the final HTML string before returning
    return sanitizeText(html);
  } catch (error) {
    console.error("Markdown 转换失败:", error);
    // 如果转换失败，返回原始文本（转义 HTML）
    const fallbackHtml = markdown
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/\n/g, "<br>");
    // Sanitize fallback HTML as well
    return sanitizeText(fallbackHtml);
  }
}

/**
 * 示例用法：
 * 
 * ```typescript
 * const markdown = `
 * # 报告标题
 * 
 * ## 第一部分
 * 
 * - 项目 1
 * - 项目 2
 * 
 * **粗体文本** 和 *斜体文本*
 * `;
 * 
 * const html = markdownToHtml(markdown);
 * console.log(html);
 * ```
 */
