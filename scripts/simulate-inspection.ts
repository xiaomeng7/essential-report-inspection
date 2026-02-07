#!/usr/bin/env npx tsx
/**
 * 模拟技师上门检查 - 端到端测试脚本
 *
 * 模拟填表行为：地址、各区块、GPO 房间（含 other 问题+照片）、灯具房间（含 other 问题+照片）
 * 提交后检查流程，若存在 custom findings 则模拟工程师补全 7 维度
 * 最终生成 Word 报告并保存到 output/
 *
 * 使用前请先启动本地服务：
 *   npm run netlify:dev
 *
 * 运行：
 *   npm run simulate:inspection
 *   或
 *   npx tsx scripts/simulate-inspection.ts
 *
 * 可指定 base URL（默认 http://localhost:8888）：
 *   BASE_URL=https://your-site.netlify.app npx tsx scripts/simulate-inspection.ts
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const BASE_URL = process.env.BASE_URL || "http://localhost:8888";

/** 1x1 红色像素 PNG，用作模拟照片（约 100 字节） */
const MOCK_PHOTO_BASE64 =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

function ans<T>(value: T) {
  return { value, status: "answered" as const };
}

function buildPayload() {
  return {
    created_at: new Date().toISOString(),
    job: {
      address: ans("123 Example St, Sydney NSW 2000"),
      address_place_id: ans("ChIJN1t_tDeuEmsRUsoyG83frY4"),
      address_components: ans({
        suburb: "Sydney",
        state: "NSW",
        postcode: "2000",
        country: "Australia",
      }),
      client_type: ans("owner"),
      occupancy: ans("owner_occupied"),
      property_type: ans("house"),
      vulnerable_occupants: ans(["none"]),
      reported_issues: ans(["none"]),
    },
    access: {
      switchboard_accessible: ans(true),
      roof_accessible: ans(true),
      underfloor_accessible: ans(false),
      mains_power_available: ans(true),
      photos_allowed: ans(true),
      notes: ans(""),
    },
    switchboard: {
      overall_condition: ans("fair"),
      signs_of_overheating: ans("no"),
      burn_marks_or_carbon: ans("no"),
      water_ingress: ans("yes"),
      asbestos_suspected: ans("no"),
      protection_types_present: ans(["rcd", "rcbo"]),
      board_at_capacity: ans("yes"),
      spare_ways_available: ans("no"),
      labelling_quality: ans("poor"),
      non_standard_or_diy_observed: ans(false),
      photo_ids: ans([]),
    },
    rcd_tests: {
      performed: ans(true),
      summary: {
        total_tested: ans(6),
        total_pass: ans(3),
        total_fail: ans(3),
      },
      no_exceptions: ans(false),
      exceptions: ans([
        { location: "Kitchen", test_current_ma: 30, trip_time_ms: 350, result: "fail", notes: "Trip >300ms", photo_ids: [] },
        { location: "Bathroom", test_current_ma: 30, trip_time_ms: 420, result: "fail", notes: "No trip", photo_ids: [] },
        { location: "Laundry", test_current_ma: 30, trip_time_ms: 380, result: "fail", notes: "Slow trip", photo_ids: [] },
      ]),
      notes: ans(""),
    },
    gpo_tests: {
      performed: ans(true),
      summary: {
        total_gpo_tested: ans(24),
        polarity_pass: ans(22),
        earth_present_pass: ans(21),
        rcd_protection_confirmed: ans(24),
      },
      any_warm_loose_damaged: ans(true),
      rooms: ans([
        { room_type: "kitchen", room_name_custom: "", room_access: "accessible", gpo_count: 4, tested_count: 4, pass_count: 3, issue: "loose", issue_other: "", note: "", photo_ids: [MOCK_PHOTO_BASE64] },
        { room_type: "bedroom_1", room_name_custom: "", room_access: "accessible", gpo_count: 2, tested_count: 2, pass_count: 1, issue: "overheating", issue_other: "", note: "插座发热", photo_ids: [MOCK_PHOTO_BASE64] },
        { room_type: "bathroom", room_name_custom: "", room_access: "accessible", gpo_count: 2, tested_count: 2, pass_count: 2, issue: "damage", issue_other: "", note: "面板破损", photo_ids: [MOCK_PHOTO_BASE64] },
        { room_type: "laundry", room_name_custom: "", room_access: "accessible", gpo_count: 2, tested_count: 2, pass_count: 1, issue: "surface_warm", issue_other: "", note: "", photo_ids: [MOCK_PHOTO_BASE64] },
        { room_type: "living_room", room_name_custom: "", room_access: "accessible", gpo_count: 6, tested_count: 6, pass_count: 5, issue: "cracks_visible", issue_other: "", note: "", photo_ids: [MOCK_PHOTO_BASE64] },
        { room_type: "bedroom_2", room_name_custom: "", room_access: "accessible", gpo_count: 2, tested_count: 2, pass_count: 0, issue: "missing_earth", issue_other: "", note: "", photo_ids: [MOCK_PHOTO_BASE64] },
        { room_type: "other", room_name_custom: "Study", room_access: "accessible", gpo_count: 4, tested_count: 4, pass_count: 3, issue: "burn_marks", issue_other: "", note: "", photo_ids: [MOCK_PHOTO_BASE64] },
      ]),
      notes: ans(""),
    },
    earthing: {
      men_link_confirmed: ans("no"),
      main_earth_conductor_intact: ans("yes"),
      earthing_resistance_measured: ans(0.5),
      bonding_water_gas_verified: ans("yes"),
      photo_ids: ans([]),
    },
    lighting: {
      rooms: ans([
        { room_type: "living_room", room_name_custom: "", room_access: "accessible", issues: ["fitting_overheat", "switch_loose"], issue_other: "", note: "", photo_ids: [MOCK_PHOTO_BASE64] },
        { room_type: "kitchen", room_name_custom: "", room_access: "accessible", issues: ["fitting_not_working"], issue_other: "", note: "吊灯不亮", photo_ids: [MOCK_PHOTO_BASE64] },
        { room_type: "bedroom_1", room_name_custom: "", room_access: "accessible", issues: ["switch_arcing"], issue_other: "", note: "", photo_ids: [MOCK_PHOTO_BASE64] },
        { room_type: "bathroom", room_name_custom: "", room_access: "accessible", issues: ["fitting_overheat", "switch_loose"], issue_other: "", note: "", photo_ids: [MOCK_PHOTO_BASE64] },
        { room_type: "other", room_name_custom: "Hallway", room_access: "accessible", issues: ["dimmer_not_working"], issue_other: "", note: "", photo_ids: [MOCK_PHOTO_BASE64] },
      ]),
    },
    assets: {
      has_solar_pv: ans(false),
      has_battery: ans(false),
      has_ev_charger: ans(false),
    },
    signoff: {
      technician_name: ans("模拟技师 Test Tech"),
      licence_no: ans("L99999"),
      inspection_completed: ans(true),
      customer_informed_immediate: ans(true),
      office_notes_internal: ans("模拟测试数据"),
      ready_for_report_generation: ans(true),
      submit_confirm: ans(true),
    },
  };
}

async function main() {
  // --write-payload: 仅生成 public/sample-inspection-payload.json，供前端「一键测试」使用
  if (process.argv.includes("--write-payload")) {
    const payload = buildPayload();
    const outDir = path.join(__dirname, "..", "public");
    if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
    const outPath = path.join(outDir, "sample-inspection-payload.json");
    fs.writeFileSync(outPath, JSON.stringify(payload, null, 2), "utf8");
    console.log("Wrote", outPath);
    process.exit(0);
  }

  console.log("\n=== 模拟技师上门检查 - 端到端测试 ===\n");
  console.log("Base URL:", BASE_URL);
  console.log("");

  // Pre-check: server reachable
  try {
    const health = await fetch(`${BASE_URL}/api/submitInspection`, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
    if (health.status === 400 && health.headers.get("content-type")?.includes("json")) {
      const json = await health.json().catch(() => ({}));
      if (json.error === "Invalid JSON" || json.error?.includes("JSON")) {
        console.log("✓ 服务器已就绪 (submitInspection 可访问)\n");
      }
    }
  } catch (e) {
    const code = (e as { cause?: { code?: string } })?.cause?.code;
    if (code === "ECONNREFUSED") {
      console.error("❌ 无法连接到服务器。请先启动本地服务：");
      console.error("   npm run netlify:dev\n");
      process.exit(1);
    }
    console.warn("⚠ 预检查跳过:", (e as Error).message, "\n");
  }

  const payload = buildPayload();
  console.log("1. 提交检查数据 (POST /api/submitInspection)...");

  let res = await fetch(`${BASE_URL}/api/submitInspection`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const text = await res.text();
    console.error("❌ 提交失败:", res.status, text.slice(0, 500));
    console.error("提示: 确保已启动 npm run netlify:dev");
    process.exit(1);
  }

  const submitResult = (await res.json()) as {
    inspection_id: string;
    status: string;
    review_url: string;
  };
  const inspectionId = submitResult.inspection_id;
  console.log("   ✅ 提交成功, inspection_id:", inspectionId);
  console.log("   Review URL:", `${BASE_URL}${submitResult.review_url}`);
  console.log("");

  console.log("2. 获取 Review 数据 (GET /api/review/:id)...");
  res = await fetch(`${BASE_URL}/api/review/${inspectionId}`);
  if (!res.ok) {
    const text = await res.text();
    console.error("❌ 获取 Review 失败:", res.status, text.slice(0, 300));
    process.exit(1);
  }

  const reviewData = (await res.json()) as {
    inspection_id: string;
    findings: Array<{ id: string; priority: string; title?: string }>;
    custom_findings_pending?: Array<{
      id: string;
      title: string;
      source: string;
      roomLabel?: string;
    }>;
  };

  console.log("   Findings 数量:", reviewData.findings?.length ?? 0);
  const pending = reviewData.custom_findings_pending ?? [];
  console.log("   Custom findings 待补全:", pending.length);
  console.log("");

  if (pending.length > 0) {
    console.log("3. 模拟工程师补全 custom findings 7 维度 (POST /api/saveCustomFindings/:id)...");
    const customFindings = pending.map((p) => ({
      id: p.id,
      title: p.title,
      safety: "MODERATE",
      urgency: "SHORT_TERM",
      liability: "MEDIUM",
      budget_low: 100,
      budget_high: 500,
      priority: "RECOMMENDED_0_3_MONTHS",
      severity: 3,
      likelihood: 2,
      escalation: "standard",
    }));

    res = await fetch(`${BASE_URL}/api/saveCustomFindings/${inspectionId}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ custom_findings: customFindings }),
    });

    if (!res.ok) {
      const text = await res.text();
      console.error("❌ 保存 custom findings 失败:", res.status, text);
      process.exit(1);
    }
    console.log("   ✅ Custom findings 已保存");
    console.log("");
  } else {
    console.log("3. 无 custom findings 待补全，跳过");
    console.log("");
  }

  const debugParam = process.env.DEBUG_DOCX === "1" ? "&debug=1" : "";
  console.log("4. 生成 Word 报告 (GET /api/generateWordReport?inspection_id=...)...");
  res = await fetch(
    `${BASE_URL}/api/generateWordReport?inspection_id=${encodeURIComponent(inspectionId)}${debugParam}`,
    { method: "GET" }
  );

  if (!res.ok) {
    const text = await res.text();
    console.error("❌ 生成 Word 失败:", res.status, text.slice(0, 500));
    try {
      const errJson = JSON.parse(text);
      if (errJson.message) console.error("   详情:", errJson.message);
    } catch {
      /* ignore */
    }
    process.exit(1);
  }

  let genResult: { ok?: boolean; message?: string; error?: string };
  try {
    genResult = (await res.json()) as typeof genResult;
  } catch {
    console.error("❌ 生成 Word 返回非 JSON 响应");
    process.exit(1);
  }
  if (!genResult?.ok) {
    console.error("❌ 生成 Word 失败:", genResult?.message || genResult?.error || "未知错误");
    process.exit(1);
  }

  console.log("5. 下载 Word 报告 (GET /api/downloadWord?inspection_id=...)...");
  res = await fetch(
    `${BASE_URL}/api/downloadWord?inspection_id=${encodeURIComponent(inspectionId)}`,
    { method: "GET" }
  );

  if (!res.ok) {
    const text = await res.text();
    console.error("❌ 下载 Word 失败:", res.status, text.slice(0, 500));
    process.exit(1);
  }

  const blob = await res.blob();
  const buffer = Buffer.from(await blob.arrayBuffer());

  const outDir = path.join(__dirname, "..", "output");
  if (!fs.existsSync(outDir)) {
    fs.mkdirSync(outDir, { recursive: true });
  }

  const outPath = path.join(outDir, `simulated-report-${inspectionId}.docx`);
  fs.writeFileSync(outPath, buffer);
  console.log("   ✅ 报告已保存:", outPath);
  console.log("   文件大小:", (buffer.length / 1024).toFixed(2), "KB");
  console.log("");

  console.log("=== 测试完成 ===\n");
  console.log("下一步:");
  console.log("  1. 打开报告查看效果:", outPath);
  console.log("  2. 在浏览器中打开 Review 页面:", `${BASE_URL}/review/${inspectionId}`);
  console.log("");
}

main().catch((e) => {
  const err = e as Error & { cause?: { code?: string } };
  if (err?.cause?.code === "ECONNREFUSED") {
    console.error("\n❌ 无法连接到服务器。请先启动本地服务：");
    console.error("   npm run netlify:dev\n");
  } else {
    console.error("Fatal error:", err?.message || err);
    if (err?.stack) console.error(err.stack);
  }
  process.exit(1);
});
