#!/usr/bin/env node
/**
 * 独立的占位符修复脚本（完整替换版）
 * 用于修复 Word 模板中被分割的占位符（跨多个文本节点）
 *
 * ✅ 改进点：
 * 1) 不再用 acc 删除导致坐标系漂移（一次拼接 + 位置映射，稳定）
 * 2) 支持"占位符前后有其它文字"的场景（保留 prefix/suffix）
 * 3) 仅修复看起来像占位符的内容（默认：{{A-Z0-9_}}），降低误伤
 * 4) fixWordTemplateFromErrors 支持按错误白名单修复（更稳）
 * 5) 支持所有文本承载节点：<w:t>, <w:instrText>, <w:delText>, <w:fldSimple>
 *
 * 使用方法：
 *   npx tsx scripts/fix-placeholders.ts <模板文件路径> [输出文件路径]
 *   如果不提供输出路径，会覆盖原文件
 */

import fs from "fs";
import PizZip from "pizzip";

type DocxZip = PizZip;

/**
 * 检查占位符是否被分割
 * 扫描 document.xml, header*.xml, footer*.xml
 * 检查所有文本承载节点：<w:t>, <w:instrText>, <w:delText>, <w:fldSimple> 等
 */
export function hasSplitPlaceholders(buffer: Buffer): boolean {
  try {
    const zip = new PizZip(buffer);

    const targets = Object.keys(zip.files).filter(
      (name) =>
        name === "word/document.xml" ||
        /^word\/header\d+\.xml$/.test(name) ||
        /^word\/footer\d+\.xml$/.test(name)
    );

    // 检测所有文本节点类型中的分割占位符
    // 匹配：{{TAG 结束了文本节点 或 TAG}} 结束了文本节点
    const textNodePatterns = [
      /\{\{[A-Z0-9_]+<\/w:t>|[A-Z0-9_]+\}\}<\/w:t>/,           // <w:t>
      /\{\{[A-Z0-9_]+<\/w:instrText>|[A-Z0-9_]+\}\}<\/w:instrText>/, // <w:instrText>
      /\{\{[A-Z0-9_]+<\/w:delText>|[A-Z0-9_]+\}\}<\/w:delText>/,     // <w:delText>
      /\{\{[A-Z0-9_]+<\/w:fldSimple[^>]*>|[A-Z0-9_]+\}\}<\/w:fldSimple>/, // <w:fldSimple>
    ];

    for (const fileName of targets) {
      const f = zip.files[fileName];
      if (!f) continue;
      const xml = f.asText();
      // 检查是否有任何文本节点类型中存在分割的占位符
      for (const pattern of textNodePatterns) {
        if (pattern.test(xml)) return true;
      }
    }
    return false;
  } catch (e) {
    console.error("检查占位符时出错:", e);
    return false;
  }
}

/**
 * 规范化占位符文本：去掉 {{...}} 内部的所有空白字符
 */
function normalizePlaceholderText(text: string): string {
  return text.replace(/\{\{\s*([^{}]+?)\s*\}\}/g, (_match, inner) => {
    const cleaned = String(inner).replace(/\s+/g, "");
    return `{{${cleaned}}}`;
  });
}

/**
 * 判断一个 {{...}} 是否像"我们的占位符"
 * 你可以按需放宽/收紧规则
 */
function isPlaceholderLike(mustache: string): boolean {
  const normalized = normalizePlaceholderText(mustache);
  const inner = normalized.slice(2, -2);
  return /^[A-Z0-9_]+$/.test(inner);
}

/**
 * 只转义要插入的"新占位符文本"，不要对原 prefix/suffix 二次转义
 */
function escapeXmlTextKeepBraces(text: string): string {
  return text
    .replace(/&(?!amp;|lt;|gt;|quot;|apos;)/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/**
 * 提取所有文本承载节点
 * 支持：<w:t>, <w:instrText>, <w:delText>, <w:fldSimple>
 * 注意：我们只抓最常见的纯文本场景（TEXT 不包含 <）
 * 这对于 Docxtemplater 的占位符修复通常足够。
 */
function extractTextNodes(xml: string) {
  const nodes: Array<{
    startIndex: number;
    endIndex: number;
    attrs: string;
    text: string;
    tagName: string; // 't', 'instrText', 'delText', 'fldSimple'
  }> = [];

  // 定义所有文本节点类型的模式
  const textNodePatterns: Array<{ tagName: string; pattern: RegExp }> = [
    { tagName: 't', pattern: /<w:t([^>]*)>([^<]*)<\/w:t>/g },
    { tagName: 'instrText', pattern: /<w:instrText([^>]*)>([^<]*)<\/w:instrText>/g },
    { tagName: 'delText', pattern: /<w:delText([^>]*)>([^<]*)<\/w:delText>/g },
    { tagName: 'fldSimple', pattern: /<w:fldSimple([^>]*)>([^<]*)<\/w:fldSimple>/g },
  ];

  // 按顺序提取所有文本节点（保持文档顺序）
  for (const { tagName, pattern } of textNodePatterns) {
    pattern.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = pattern.exec(xml)) !== null) {
      nodes.push({
        startIndex: m.index,
        endIndex: m.index + m[0].length,
        attrs: m[1] || "",
        text: m[2] || "",
        tagName,
      });
    }
  }

  // 按在文档中的位置排序
  nodes.sort((a, b) => a.startIndex - b.startIndex);

  return nodes;
}

/**
 * 修复单个 XML 文件中的分割占位符
 *
 * - 将跨多个文本节点的 {{...}} 合并到第一个参与的节点
 * - 支持所有文本承载节点：<w:t>, <w:instrText>, <w:delText>, <w:fldSimple>
 * - 保留第一个节点中占位符之前的文字（prefix）
 * - 保留最后一个节点中占位符之后的文字（suffix）
 * - 中间节点清空
 *
 * @param allowedPlaceholders 可选白名单（如从 errors 推导），不传则修复所有"像占位符"的 mustache
 */
function fixXmlContent(
  xmlContent: string,
  fileName: string,
  allowedPlaceholders?: Set<string>
): { fixed: string; count: number } {
  const tNodes = extractTextNodes(xmlContent);
  if (tNodes.length === 0) {
    return { fixed: xmlContent, count: 0 };
  }

  // 1) 构建拼接全文 + 每个节点在拼接全文的起始位置
  const starts: number[] = new Array(tNodes.length);
  let cursor = 0;
  for (let i = 0; i < tNodes.length; i++) {
    starts[i] = cursor;
    cursor += tNodes[i].text.length;
  }
  const fullText = tNodes.map((n) => n.text).join("");

  // 2) 找出 fullText 内所有 mustache
  // 非贪婪，尽量匹配最短 {{...}}
  const mustacheRe = /\{\{[\s\S]*?\}\}/g;

  type Fix = {
    firstIndex: number;
    lastIndex: number;
    startOffsetInFirst: number;
    endOffsetInLast: number;
    placeholder: string; // normalized
  };

  const fixes: Fix[] = [];

  // 辅助：全局位置 -> nodeIndex
  const findNodeIndex = (pos: number) => {
    // starts 单调递增，找最后一个 starts[i] <= pos
    // 这里用简单二分
    let lo = 0,
      hi = starts.length - 1;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      const s = starts[mid];
      const nextS = mid + 1 < starts.length ? starts[mid + 1] : Number.POSITIVE_INFINITY;
      if (pos >= s && pos < nextS) return mid;
      if (pos < s) hi = mid - 1;
      else lo = mid + 1;
    }
    return -1;
  };

  let mm: RegExpExecArray | null;
  mustacheRe.lastIndex = 0;

  while ((mm = mustacheRe.exec(fullText)) !== null) {
    const raw = mm[0]; // includes {{ }}
    const normalized = normalizePlaceholderText(raw);

    if (!isPlaceholderLike(normalized)) continue;

    if (allowedPlaceholders && !allowedPlaceholders.has(normalized)) {
      continue;
    }

    const gStart = mm.index;
    const gEndExclusive = mm.index + raw.length;

    const first = findNodeIndex(gStart);
    const last = findNodeIndex(gEndExclusive - 1);

    if (first === -1 || last === -1) continue;
    if (first === last) continue; // 不跨节点，无需修复

    const startOffsetInFirst = gStart - starts[first];
    const endOffsetInLast = gEndExclusive - starts[last];

    fixes.push({
      firstIndex: first,
      lastIndex: last,
      startOffsetInFirst,
      endOffsetInLast,
      placeholder: normalized,
    });
  }

  if (fixes.length === 0) {
    // console.log(`✅ ${fileName} 中没有发现需要修复的占位符`);
    return { fixed: xmlContent, count: 0 };
  }

  // 3) 将 fixes 转为"对每个 <w:t> 的替换操作"
  // 为避免索引漂移：把所有替换按 startIndex 倒序应用
  type Op = { start: number; end: number; replacement: string };
  const ops: Op[] = [];
  const touched = new Set<number>(); // 一个 node 可能被多个 fix 覆盖，尽量避免重复写（优先靠前的 fix）

  // 按占位符在文档中出现顺序处理（从前到后），但生成 ops 时最终会倒序应用
  fixes.sort((a, b) => {
    if (a.firstIndex !== b.firstIndex) return a.firstIndex - b.firstIndex;
    return a.startOffsetInFirst - b.startOffsetInFirst;
  });

  for (const fx of fixes) {
    const { firstIndex, lastIndex, startOffsetInFirst, endOffsetInLast } = fx;

    // 若这些节点已经被更早的 fix 改过，跳过，避免互相覆盖（保守策略）
    // 你也可以改成更精细的区间合并，但这版更稳、更不误伤
    let conflict = false;
    for (let i = firstIndex; i <= lastIndex; i++) {
      if (touched.has(i)) {
        conflict = true;
        break;
      }
    }
    if (conflict) continue;

    // 生成新内容
    const escapedPlaceholder = escapeXmlTextKeepBraces(fx.placeholder);

    const firstNode = tNodes[firstIndex];
    const lastNode = tNodes[lastIndex];

    const firstPrefix = firstNode.text.slice(0, startOffsetInFirst);
    const lastSuffix = lastNode.text.slice(endOffsetInLast);

    // first node: prefix + {{TAG}}
    const newFirstInner = firstPrefix + escapedPlaceholder;

    // last node: suffix（占位符之后的剩余）
    const newLastInner = lastSuffix;

    // middle nodes: 清空
    for (let i = firstIndex; i <= lastIndex; i++) {
      const node = tNodes[i];
      let newInner = "";

      if (i === firstIndex) newInner = newFirstInner;
      else if (i === lastIndex) newInner = newLastInner;

      // 根据节点类型生成正确的标签
      const tagName = `w:${node.tagName}`;
      ops.push({
        start: node.startIndex,
        end: node.endIndex,
        replacement: `<${tagName}${node.attrs}>${newInner}</${tagName}>`,
      });

      touched.add(i);
    }
  }

  if (ops.length === 0) {
    return { fixed: xmlContent, count: 0 };
  }

  ops.sort((a, b) => b.start - a.start);

  let fixedXml = xmlContent;
  for (const op of ops) {
    fixedXml = fixedXml.slice(0, op.start) + op.replacement + fixedXml.slice(op.end);
  }

  // 估算修复数量：以"fixes 实际生效数量"为准（每个 fix 至少会产生 2 个 ops）
  const appliedFixCount = Math.floor(ops.length / 2);

  console.log(`✅ 在 ${fileName} 中修复了约 ${appliedFixCount} 个被分割的占位符`);
  return { fixed: fixedXml, count: appliedFixCount };
}

/**
 * 获取需要处理的 XML 文件列表
 */
function listTargetXmlFiles(zip: DocxZip): string[] {
  return Object.keys(zip.files).filter(
    (name) =>
      name === "word/document.xml" ||
      /^word\/header\d+\.xml$/.test(name) ||
      /^word\/footer\d+\.xml$/.test(name)
  );
}

/**
 * 修复 Word 模板中的分割占位符（全量修复）
 */
export function fixWordTemplate(buffer: Buffer): Buffer {
  try {
    const zip = new PizZip(buffer);

    let totalFixCount = 0;
    const targets = listTargetXmlFiles(zip);

    for (const fileName of targets) {
      const f = zip.files[fileName];
      if (!f) continue;
      const result = fixXmlContent(f.asText(), fileName);
      if (result.count > 0) {
        zip.file(fileName, result.fixed);
        totalFixCount += result.count;
      }
    }

    if (totalFixCount > 0) {
      console.log(`✅ 总共修复了约 ${totalFixCount} 个被分割的占位符`);
      return zip.generate({ type: "nodebuffer", compression: "DEFLATE" });
    } else {
      console.log("ℹ️ 没有发现被分割的占位符，模板是干净的");
      return buffer;
    }
  } catch (e) {
    const errorMsg = e instanceof Error ? e.message : String(e);
    console.error("❌ 修复 Word 模板时出错:", errorMsg);
    return buffer;
  }
}

/**
 * 基于 Docxtemplater 错误信息（duplicate_open_tag / duplicate_close_tag）生成白名单
 * 然后只修复白名单内的占位符，减少误伤
 */
export function fixWordTemplateFromErrors(
  buffer: Buffer,
  errors: Array<{ id?: string; context?: string }>
): Buffer {
  try {
    const openTags = new Set<string>();
    const closeTags = new Set<string>();

    for (const err of errors) {
      if (err?.id === "duplicate_open_tag" && err.context) {
        // err.context 里通常包含 "{{PROP" 这种片段
        const fragment = err.context.replace(/\{\{/g, "").trim();
        if (fragment) openTags.add(fragment);
      } else if (err?.id === "duplicate_close_tag" && err.context) {
        // err.context 里通常包含 "TYPE}}" 这种片段
        const fragment = err.context.replace(/\}\}/g, "").trim();
        if (fragment) closeTags.add(fragment);
      }
    }

    // 已知映射（你之前那份）
    const knownMappings: Record<string, string> = {
      "PROP|TYPE": "PROPERTY_TYPE",
      "ASSE|POSE": "ASSESSMENT_PURPOSE",
      "ASSE|DATE": "ASSESSMENT_DATE",
      "PREP|_FOR": "PREPARED_FOR",
      "PREP|D_BY": "PREPARED_BY",
      "IMME|INGS": "IMMEDIATE_FINDINGS",
      "RECO|INGS": "RECOMMENDED_FINDINGS",
      "PLAN|INGS": "PLAN_FINDINGS",
      "URGE|INGS": "URGENT_FINDINGS",
      "EXEC|RAPH": "EXECUTIVE_SUMMARY",
      "OVER|ADGE": "OVERALL_STATUS",
      "RISK|ADGE": "RISK_RATING",
      "RISK|TORS": "RISK_RATING_FACTORS",
      "LIMI|TION": "LIMITATIONS",
      "LIMI|TIONS": "LIMITATIONS",
      "TEST|MARY": "TEST_SUMMARY",
      "TECH|OTES": "TECHNICAL_NOTES",
      "CAPI|ABLE": "CAPABLE",
      "NEXT|TEPS": "NEXT_STEPS",
      "GENE|OTES": "GENERAL_NOTES",
    };

    // 推导完整占位符名（{{NAME}}），做成白名单
    const allow = new Set<string>();

    for (const o of openTags) {
      for (const c of closeTags) {
        const key = `${o}|${c}`;
        let fullName = knownMappings[key];

        if (!fullName) {
          const combined = `${o}${c}`;
          if (/^[A-Z0-9_]{2,}$/.test(combined)) fullName = combined;
          else {
            const combined2 = `${o}_${c}`;
            if (/^[A-Z0-9_]{2,}$/.test(combined2)) fullName = combined2;
          }
        }

        if (fullName) allow.add(`{{${fullName}}}`);
      }
    }

    if (allow.size === 0) {
      // 没有可推导的白名单，则退化为全量修复
      return fixWordTemplate(buffer);
    }

    const zip = new PizZip(buffer);
    let totalFixCount = 0;

    const targets = listTargetXmlFiles(zip);
    for (const fileName of targets) {
      const f = zip.files[fileName];
      if (!f) continue;
      const result = fixXmlContent(f.asText(), fileName, allow);
      if (result.count > 0) {
        zip.file(fileName, result.fixed);
        totalFixCount += result.count;
      }
    }

    if (totalFixCount > 0) {
      console.log(`✅ 基于错误白名单修复了约 ${totalFixCount} 个占位符`);
      return zip.generate({ type: "nodebuffer", compression: "DEFLATE" });
    }

    return buffer;
  } catch (e) {
    console.error("基于错误信息修复时出错:", e);
    return buffer;
  }
}

/**
 * 主函数（命令行使用）
 */
function main() {
  const args = process.argv.slice(2);

  if (args.length < 1) {
    console.error("用法: npx tsx scripts/fix-placeholders.ts <模板文件路径> [输出文件路径]");
    process.exit(1);
  }

  const inputPath = args[0];
  const outputPath = args[1] || inputPath;

  if (!fs.existsSync(inputPath)) {
    console.error(`❌ 错误: 输入文件不存在: ${inputPath}`);
    process.exit(1);
  }

  console.log("=".repeat(60));
  console.log("🔧 Word 模板占位符修复脚本（替换版）");
  console.log("=".repeat(60));
  console.log(`\n输入文件: ${inputPath}`);
  console.log(`输出文件: ${outputPath}\n`);

  console.log("📖 读取模板文件...");
  const originalBuffer = fs.readFileSync(inputPath);
  console.log(`   ✅ 文件大小: ${originalBuffer.length} bytes`);

  console.log("\n🔍 检查占位符...");
  const hasSplit = hasSplitPlaceholders(originalBuffer);
  if (!hasSplit) {
    console.log("   ✅ 没有发现被分割的占位符，无需修复");
    process.exit(0);
  }

  console.log("   ⚠️  发现被分割的占位符，开始修复...");

  console.log("\n🔧 修复占位符...");
  const fixedBuffer = fixWordTemplate(originalBuffer);

  console.log("\n🔍 验证修复结果...");
  const stillHasSplit = hasSplitPlaceholders(fixedBuffer);
  if (stillHasSplit) {
    console.log("   ⚠️  警告: 修复后仍然存在被分割的占位符（可能在复杂 XML 结构里）");
  } else {
    console.log("   ✅ 验证通过: 没有发现被分割的占位符");
  }

  console.log(`\n💾 保存修复后的模板到: ${outputPath}`);
  fs.writeFileSync(outputPath, fixedBuffer);
  console.log("   ✅ 已保存");

  console.log("\n" + "=".repeat(60));
  console.log("✅ 修复完成！");
  console.log("=".repeat(60));
}

if (require.main === module) {
  main();
}
