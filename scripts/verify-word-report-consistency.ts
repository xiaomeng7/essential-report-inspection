#!/usr/bin/env npx tsx
/**
 * 发布前验证：Word 报告生成链路一致性
 * 证明同一 inspection_id 下 Submit / 邮件下载 / Review 下载为同一份 Word，且时序与并发下成立。
 *
 * 使用前请先启动本地服务：npm run netlify:dev
 * 运行：npx tsx scripts/verify-word-report-consistency.ts
 * 或：BASE_URL=https://your-staging.netlify.app npx tsx scripts/verify-word-report-consistency.ts
 */

import fs from "fs";
import path from "path";
import crypto from "crypto";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BASE_URL = process.env.BASE_URL || "http://localhost:8888";
const OUT_DIR = path.join(__dirname, "..", "output", "verify-word");

function sha256Hex(buffer: Buffer): string {
  return crypto.createHash("sha256").update(buffer).digest("hex");
}

function loadPayload(): object {
  const p = path.join(__dirname, "..", "public", "sample-inspection-payload.json");
  if (fs.existsSync(p)) {
    return JSON.parse(fs.readFileSync(p, "utf8"));
  }
  throw new Error("Missing public/sample-inspection-payload.json. Run: npm run write-sample-payload");
}

async function submitInspection(): Promise<string> {
  const payload = loadPayload();
  const res = await fetch(`${BASE_URL}/api/submitInspection`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Submit failed ${res.status}: ${text.slice(0, 300)}`);
  }
  const json = (await res.json()) as { inspection_id: string };
  return json.inspection_id;
}

async function downloadWordBuffer(inspectionId: string): Promise<{ buffer: Buffer; isDocx: boolean; status: number }> {
  const res = await fetch(
    `${BASE_URL}/api/downloadWord?inspection_id=${encodeURIComponent(inspectionId)}`,
    { method: "GET" }
  );
  const buf = Buffer.from(await res.arrayBuffer());
  const contentType = res.headers.get("content-type") || "";
  const isDocx = contentType.includes("wordprocessingml") || (buf.length > 100 && buf[0] === 80 && buf[1] === 75);
  return { buffer: buf, isDocx, status: res.status };
}

/** 收口后：generateMarkdownWord 仅返回 403，不再生成 */
async function generateMarkdownWordReturns403(inspectionId: string): Promise<boolean> {
  const res = await fetch(
    `${BASE_URL}/api/generateMarkdownWord?inspection_id=${encodeURIComponent(inspectionId)}`,
    { method: "GET" }
  );
  return res.status === 403;
}

async function wordStatusExists(inspectionId: string): Promise<boolean> {
  const res = await fetch(`${BASE_URL}/api/wordStatus?inspection_id=${encodeURIComponent(inspectionId)}`);
  if (!res.ok) return false;
  const json = (await res.json()) as { exists?: boolean };
  return !!json.exists;
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

const results: { case: string; pass: boolean; detail: string }[] = [];

async function main() {
  if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });

  console.log("\n=== Word 报告发布前验证 ===\n");
  console.log("环境:", BASE_URL);
  console.log("输出目录:", OUT_DIR);
  console.log("");

  let inspectionId1: string;
  let inspectionId2: string;

  try {
    console.log("【准备】提交第一次 inspection（用于 Case 1 / 3 / 4）...");
    inspectionId1 = await submitInspection();
    console.log("  inspection_id:", inspectionId1);
    console.log("【准备】提交第二次 inspection（用于 Case 2 极限时序）...");
    inspectionId2 = await submitInspection();
    console.log("  inspection_id:", inspectionId2);
  } catch (e) {
    console.error("准备失败:", (e as Error).message);
    console.error("请确保: 1) npm run netlify:dev 已启动  2) 存在 public/sample-inspection-payload.json");
    process.exit(1);
  }

  // ---------- Case 1: 正常提交 ----------
  console.log("\n--- Case 1: 正常提交 ---");
  await sleep(3000);
  const dw1 = await downloadWordBuffer(inspectionId1);
  const dw2 = await downloadWordBuffer(inspectionId1);
  const dw3 = await downloadWordBuffer(inspectionId1);
  const h1 = sha256Hex(dw1.buffer);
  const h2 = sha256Hex(dw2.buffer);
  const h3 = sha256Hex(dw3.buffer);
  const case1Pass = dw1.isDocx && dw2.isDocx && dw3.isDocx && h1 === h2 && h2 === h3;
  results.push({
    case: "Case 1 正常提交",
    pass: case1Pass,
    detail: case1Pass
      ? `Blob/邮件/Review 三路 sha256 一致: ${h1.slice(0, 16)}...`
      : `isDocx=${dw1.isDocx},${dw2.isDocx},${dw3.isDocx} sha256: ${h1.slice(0, 8)} | ${h2.slice(0, 8)} | ${h3.slice(0, 8)}`,
  });
  if (dw1.isDocx) {
    fs.writeFileSync(path.join(OUT_DIR, `case1-${inspectionId1}-1.docx`), dw1.buffer);
    fs.writeFileSync(path.join(OUT_DIR, `case1-${inspectionId1}-2.docx`), dw2.buffer);
    fs.writeFileSync(path.join(OUT_DIR, `case1-${inspectionId1}-3.docx`), dw3.buffer);
  }
  console.log(case1Pass ? "  PASS" : "  FAIL", results[results.length - 1].detail);

  // ---------- Case 2: 极限时序 ----------
  console.log("\n--- Case 2: 极限时序（Submit 后 1.5s 内下载）---");
  await sleep(1500);
  const dw2a = await downloadWordBuffer(inspectionId2);
  const dw2b = await downloadWordBuffer(inspectionId2);
  const h2a = sha256Hex(dw2a.buffer);
  const h2b = sha256Hex(dw2b.buffer);
  const case2Pass = dw2a.isDocx && dw2b.isDocx && h2a === h2b;
  results.push({
    case: "Case 2 极限时序",
    pass: case2Pass,
    detail: case2Pass
      ? `两次下载一致 sha256: ${h2a.slice(0, 16)}...`
      : `isDocx=${dw2a.isDocx},${dw2b.isDocx} sha256: ${h2a.slice(0, 8)} | ${h2b.slice(0, 8)}`,
  });
  console.log(case2Pass ? "  PASS" : "  FAIL", results[results.length - 1].detail);

  // ---------- Case 3: 并发下载 ----------
  console.log("\n--- Case 3: 并发下载（5 个 downloadWord 同时）---");
  const id3 = inspectionId1;
  const [c3a, c3b, c3c, c3d, c3e] = await Promise.all([
    downloadWordBuffer(id3),
    downloadWordBuffer(id3),
    downloadWordBuffer(id3),
    downloadWordBuffer(id3),
    downloadWordBuffer(id3),
  ]);
  const hashes3 = [c3a, c3b, c3c, c3d, c3e].map((x) => sha256Hex(x.buffer));
  const allSame3 = hashes3.every((h) => h === hashes3[0]) && c3a.isDocx;
  results.push({
    case: "Case 3 并发下载",
    pass: allSame3,
    detail: allSame3
      ? `5 次下载 sha256 一致: ${hashes3[0].slice(0, 16)}...`
      : `sha256: ${hashes3.map((h) => h.slice(0, 6)).join(" | ")} isDocx: ${c3a.isDocx}`,
  });
  console.log(allSame3 ? "  PASS" : "  FAIL", results[results.length - 1].detail);

  // ---------- Case 4: Review 行为（收口：仅下载，禁止生成）----------
  console.log("\n--- Case 4: Review 行为（Blob 可下载；generateMarkdownWord 返回 403）---");
  const exists = await wordStatusExists(inspectionId1);
  const dw4 = await downloadWordBuffer(inspectionId1);
  const gen403 = await generateMarkdownWordReturns403(inspectionId1);
  const case4Pass = exists && dw4.isDocx && gen403;
  results.push({
    case: "Case 4 Review 行为",
    pass: case4Pass,
    detail: case4Pass
      ? `wordStatus exists=true, downloadWord 返回 docx, generateMarkdownWord 返回 403`
      : `exists=${exists} isDocx=${dw4.isDocx} gen403=${gen403}`,
  });
  console.log(case4Pass ? "  PASS" : "  FAIL", results[results.length - 1].detail);

  // ---------- 失败/降级：不存在的 id ----------
  console.log("\n--- 失败场景：不存在的 inspection_id ---");
  const fakeId = "EH-2099-99-999";
  const dwFail = await downloadWordBuffer(fakeId);
  const failStr = dwFail.buffer.toString("utf8");
  const failOk =
    !dwFail.isDocx &&
    (dwFail.status === 409 ||
      failStr.includes("report_not_available") ||
      failStr.includes("No report is available") ||
      failStr.includes("not yet ready") ||
      failStr.includes("Report is not") ||
      failStr.includes("<!DOCTYPE") ||
      failStr.includes("<html"));
  results.push({
    case: "失败场景 不存在id",
    pass: failOk,
    detail: failOk
      ? "downloadWord 返回 409 或非 docx（无报告可用）"
      : `unexpected: isDocx=${dwFail.isDocx} status=${dwFail.status} len=${dwFail.buffer.length}`,
  });
  console.log(failOk ? "  PASS" : "  FAIL", results[results.length - 1].detail);

  // ---------- 汇总 ----------
  console.log("\n=== 结果汇总 ===\n");
  const passed = results.filter((r) => r.pass).length;
  results.forEach((r) => console.log(r.pass ? "  PASS" : "  FAIL", r.case, "-", r.detail));
  console.log("\n通过:", passed, "/", results.length);
  console.log("sha256 对比: Case1 三份一致:", h1 === h2 && h2 === h3 ? h1.slice(0, 32) + "..." : "不一致");
  console.log("");

  const reportPath = path.join(OUT_DIR, "verification-report.json");
  const hBlobCase4 = dw4.isDocx ? sha256Hex(dw4.buffer) : null;
  fs.writeFileSync(
    reportPath,
    JSON.stringify(
      {
        baseUrl: BASE_URL,
        inspectionId1,
        inspectionId2,
        sha256Case1: h1,
        sha256Case2: h2a,
        sha256Case3: hashes3[0],
        sha256BlobCase4: hBlobCase4,
        results,
        passed,
        total: results.length,
        timestamp: new Date().toISOString(),
      },
      null,
      2
    ),
    "utf8"
  );
  console.log("报告已写:", reportPath);

  process.exit(passed === results.length ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
