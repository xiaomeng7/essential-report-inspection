/**
 * Docx conversion hardening utilities.
 * Goal: avoid html-to-docx InvalidCharacterError caused by complex table attributes/styles.
 *
 * Keep it dependency-free (regex-based) for Netlify Functions.
 */

export function cleanHtmlForDocx(html: string): string {
  let out = html ?? "";

  // Remove <script>, <style>, <meta>, <link> blocks
  out = out.replace(/<script[\s\S]*?<\/script>/gi, "");
  out = out.replace(/<style[\s\S]*?<\/style>/gi, "");
  out = out.replace(/<meta[^>]*>/gi, "");
  out = out.replace(/<link[^>]*>/gi, "");

  // Remove colgroup/col (often causes width attr issues)
  out = out.replace(/<colgroup[\s\S]*?<\/colgroup>/gi, "");
  out = out.replace(/<col[^>]*>/gi, "");

  // Normalize <br> -> <br/>
  out = out.replace(/<br\s*>/gi, "<br/>");
  out = out.replace(/<br\s*\/>/gi, "<br/>");

  // Drop potentially problematic attributes globally: style, class, id, width/height, align, valign, colspan/rowspan
  // We'll do a targeted cleanup for table-related tags as well.
  out = out.replace(/\s+(style|class|id|width|height|align|valign|cellpadding|cellspacing|border|bgcolor)\s*=\s*(['\"]).*?\2/gi, "");
  out = out.replace(/\s+(colspan|rowspan)\s*=\s*(['\"]).*?\2/gi, "");

  // Hard strip ALL attributes from table tags (most reliable)
  out = out.replace(/<(table)(\s+[^>]*)?>/gi, "<table>");
  out = out.replace(/<(thead)(\s+[^>]*)?>/gi, "<thead>");
  out = out.replace(/<(tbody)(\s+[^>]*)?>/gi, "<tbody>");
  out = out.replace(/<(tfoot)(\s+[^>]*)?>/gi, "<tfoot>");
  out = out.replace(/<(tr)(\s+[^>]*)?>/gi, "<tr>");
  out = out.replace(/<(td)(\s+[^>]*)?>/gi, "<td>");
  out = out.replace(/<(th)(\s+[^>]*)?>/gi, "<th>");

  // Remove empty attributes artifacts like <td >
  out = out.replace(/<([a-z0-9]+)\s+>/gi, "<$1>");

  // Ensure html has a body wrapper (some converters behave better)
  if (!/\<body[\s\>]/i.test(out)) {
    out = `<body>${out}</body>`;
  }

  return out;
}

/**
 * Degrade ALL tables into bullet lists.
 * This is a "nuclear" fallback when html-to-docx still fails.
 */
export function deTable(html: string): string {
  let out = html ?? "";

  // Replace each <table>...</table> with a simplified representation.
  // We keep only text content by stripping tags inside and splitting rows.
  out = out.replace(/<table[\s\S]*?<\/table>/gi, (tableBlock) => {
    const rows = tableBlock.match(/<tr[\s\S]*?<\/tr>/gi) || [];
    const items: string[] = [];

    for (const r of rows) {
      const cells = r.match(/<(td|th)[\s\S]*?<\/(td|th)>/gi) || [];
      const texts = cells
        .map((c) =>
          c
            .replace(/<[^>]+>/g, " ")
            .replace(/\s+/g, " ")
            .trim()
        )
        .filter(Boolean);

      if (texts.length) items.push(texts.join(" — "));
    }

    if (!items.length) return "<p>(Table omitted)</p>";

    const lis = items.map((t) => `<li>${escapeHtml(t)}</li>`).join("");
    return `<ul>${lis}</ul>`;
  });

  return out;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
