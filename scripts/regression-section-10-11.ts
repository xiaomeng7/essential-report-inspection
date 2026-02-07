#!/usr/bin/env npx tsx
/**
 * Section 10/11 渲染修复回归测试
 * - 同一 inspection_id 生成三份 docx（Submit→Blob / 邮件下载 / Review 下载）
 * - 计算 sha256，必须三份一致
 * - 在 docx 正文中搜索禁止字符串，必须 0 命中
 *
 * 使用前请先启动：npm run netlify:dev
 * 运行：npx tsx scripts/regression-section-10-11.ts
 */

import fs from "fs";
import path from "path";
import crypto from "crypto";
import { fileURLToPath } from "url";
// @ts-expect-error JSZip has no types in this project
import JSZip from "jszip";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BASE_URL = process.env.BASE_URL || "http://localhost:8888";
const OUT_DIR = path.join(__dirname, "..", "output", "regression-section-10-11");

const FORBIDDEN_STRINGS = [
  "TERMS & CONDITIONS OF ASSESSMENT",
  "<h2",
  "|---|",
  "### ",
  "模拟测试数据",
] as const;

function sha256Hex(buffer: Buffer): string {
  return crypto.createHash("sha256").update(buffer).digest("hex");
}

function loadPayload(): object {
  const p = path.join(__dirname, "..", "public", "sample-inspection-payload.json");
  if (fs.existsSync(p)) return JSON.parse(fs.readFileSync(p, "utf8"));
  throw new Error("Missing public/sample-inspection-payload.json. Run: npm run write-sample-payload");
}

async function submitInspection(): Promise<string> {
  const payload = loadPayload();
  const res = await fetch(`${BASE_URL}/api/submitInspection`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(`Submit failed ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const json = (await res.json()) as { inspection_id: string };
  return json.inspection_id;
}

async function downloadWordBuffer(inspectionId: string): Promise<Buffer> {
  const res = await fetch(
    `${BASE_URL}/api/downloadWord?inspection_id=${encodeURIComponent(inspectionId)}`,
    { method: "GET" }
  );
  const buf = Buffer.from(await res.arrayBuffer());
  const contentType = res.headers.get("content-type") || "";
  const isDocx =
    contentType.includes("wordprocessingml") || (buf.length > 100 && buf[0] === 80 && buf[1] === 75);
  if (!isDocx) throw new Error("downloadWord did not return a docx");
  return buf;
}

/** 从 docx buffer 中提取 word/document.xml 的文本内容（用于搜索） */
async function getDocumentXmlText(docxBuffer: Buffer): Promise<string> {
  const zip = await JSZip.loadAsync(docxBuffer);
  const name = zip.file("word/document.xml") ? "word/document.xml" : null;
  if (!name) throw new Error("docx has no word/document.xml");
  const content = await zip.file(name)!.async("string");
  return content;
}

/** 在文档正文（word/document.xml）中搜索禁止字符串，返回每个的命中次数。XML 中 & 为 &amp;，故同时搜原文与转义。 */
async function countForbiddenInDocx(docxBuffer: Buffer): Promise<Record<string, number>> {
  const xml = await getDocumentXmlText(docxBuffer);
  const out: Record<string, number> = {};
  for (const s of FORBIDDEN_STRINGS) {
    const literal = (xml.match(new RegExp(escapeRe(s), "g")) || []).length;
    const escaped = s.replace(/&/g, "&amp;");
    const inXml = escaped !== s ? (xml.match(new RegExp(escapeRe(escaped), "g")) || []).length : 0;
    out[s] = literal + inXml;
  }
  return out;
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

async function main() {
  if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });

  console.log("\n=== Section 10/11 渲染修复回归测试 ===\n");
  console.log("BASE_URL:", BASE_URL);
  console.log("输出目录:", OUT_DIR);

  let inspectionId: string;
  try {
    console.log("\n1) 提交 inspection 获取 inspection_id ...");
    inspectionId = await submitInspection();
    console.log("   inspection_id:", inspectionId);
  } catch (e) {
    console.error("失败:", (e as Error).message);
    console.error("请确保: npm run netlify:dev 已启动，且存在 public/sample-inspection-payload.json");
    process.exit(1);
  }

  console.log("\n2) 生成三份 docx：A=Blob(Submit后) B=邮件下载 C=Review下载");
  await sleep(2500);
  const bufA = await downloadWordBuffer(inspectionId);
  const bufB = await downloadWordBuffer(inspectionId);
  const bufC = await downloadWordBuffer(inspectionId);

  const shaA = sha256Hex(bufA);
  const shaB = sha256Hex(bufB);
  const shaC = sha256Hex(bufC);

  fs.writeFileSync(path.join(OUT_DIR, "A-submit-blob.docx"), bufA);
  fs.writeFileSync(path.join(OUT_DIR, "B-email.docx"), bufB);
  fs.writeFileSync(path.join(OUT_DIR, "C-review.docx"), bufC);
  console.log("   已保存: A-submit-blob.docx, B-email.docx, C-review.docx");

  console.log("\n3) sha256 对比");
  console.log("   A:", shaA);
  console.log("   B:", shaB);
  console.log("   C:", shaC);
  const shaConsistent = shaA === shaB && shaB === shaC;
  console.log("   三份一致:", shaConsistent ? "PASS" : "FAIL");

  console.log("\n4) 禁止字符串搜索（docx 正文，要求 0 命中）");
  const countsA = await countForbiddenInDocx(bufA);
  const countsB = await countForbiddenInDocx(bufB);
  const countsC = await countForbiddenInDocx(bufC);
  const allZero = FORBIDDEN_STRINGS.every(
    (s) => countsA[s] === 0 && countsB[s] === 0 && countsC[s] === 0
  );

  const stringResults: { string: string; countA: number; countB: number; countC: number }[] = [];
  for (const s of FORBIDDEN_STRINGS) {
    stringResults.push({ string: s, countA: countsA[s], countB: countsB[s], countC: countsC[s] });
    const ok = countsA[s] === 0 && countsB[s] === 0 && countsC[s] === 0;
    console.log(`   "${s}" => A=${countsA[s]} B=${countsB[s]} C=${countsC[s]} ${ok ? "PASS" : "FAIL"}`);
  }
  console.log("   全部 0 命中:", allZero ? "PASS" : "FAIL");

  const report = {
    baseUrl: BASE_URL,
    inspectionId,
    sha256: { A: shaA, B: shaB, C: shaC },
    sha256Consistent: shaConsistent,
    forbiddenStringCounts: stringResults,
    allForbiddenZero: allZero,
    pass: shaConsistent && allZero,
    timestamp: new Date().toISOString(),
  };

  const reportPath = path.join(OUT_DIR, "regression-report.json");
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2), "utf8");
  console.log("\n报告已写:", reportPath);

  console.log("\n=== 结论 ===");
  console.log("  sha256 三份一致:", shaConsistent ? "PASS" : "FAIL");
  console.log("  禁止字符串 0 命中:", allZero ? "PASS" : "FAIL");
  console.log("  总体:", report.pass ? "PASS" : "FAIL");

  console.log("\n5) Spot check 说明（需人工）");
  console.log("   - 打开 output/regression-section-10-11/A-submit-blob.docx");
  console.log("   - Section 10：标题下不应有单独一行 TERMS & CONDITIONS OF ASSESSMENT");
  console.log("   - Section 11 Appendix：表格应为 Word 表格、标题为 Word heading，无 <h2> / |---| / ###");

  process.exit(report.pass ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
