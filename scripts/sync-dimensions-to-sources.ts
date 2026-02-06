#!/usr/bin/env tsx
/**
 * 自动同步脚本：从finding_profiles.yml同步9维度数据到rules.yml和responses.yml
 * 
 * 目的：确保数据一致性，finding_profiles.yml是权威数据源
 */

import fs from "fs";
import path from "path";
import yaml from "js-yaml";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const profilesPath = path.join(__dirname, "..", "profiles", "finding_profiles.yml");
const rulesPath = path.join(__dirname, "..", "rules.yml");
const responsesPath = path.join(__dirname, "..", "netlify", "functions", "responses.yml");

console.log("🔄 开始同步9维度数据...\n");

// 1. 加载finding_profiles.yml（权威数据源）
const profilesData = yaml.load(fs.readFileSync(profilesPath, "utf8")) as any;
const profiles = profilesData.finding_profiles || {};

console.log(`✅ 加载finding_profiles.yml: ${Object.keys(profiles).length}个findings\n`);

// 2. 加载rules.yml
const rulesData = yaml.load(fs.readFileSync(rulesPath, "utf8")) as any;
const rulesFindings = rulesData.findings || {};
const rulesOverrides = rulesData.hard_overrides || {};

// 找出rules.yml中定义的findings
const rulesIds = new Set<string>();
Object.keys(rulesFindings).forEach((k) => rulesIds.add(k));
Object.keys(rulesOverrides).forEach((k) => {
  if (k !== "priority_bucket" && k !== "findings" && rulesOverrides[k]) {
    rulesIds.add(k);
  }
});

console.log(`📋 rules.yml中的findings: ${rulesIds.size}个`);

// 3. 同步到rules.yml
let rulesUpdated = 0;
for (const id of rulesIds) {
  const profile = profiles[id];
  if (!profile) {
    console.warn(`  ⚠️  ${id} 在finding_profiles.yml中不存在，跳过`);
    continue;
  }

  const safety = profile.risk?.safety;
  const urgency = profile.urgency;
  const liability = profile.liability;

  if (!safety || !urgency || !liability) {
    console.warn(`  ⚠️  ${id} 缺少必要字段，跳过`);
    continue;
  }

  // 更新rules.yml中的findings
  if (rulesFindings[id]) {
    const existing = rulesFindings[id];
    if (
      existing.safety !== safety ||
      existing.urgency !== urgency ||
      existing.liability !== liability
    ) {
      rulesFindings[id] = { safety, urgency, liability };
      rulesUpdated++;
      console.log(`  ✅ 更新 ${id}: ${safety}/${urgency}/${liability}`);
    }
  }

  // 更新hard_overrides
  if (rulesOverrides[id] && typeof rulesOverrides[id] === "object") {
    const existing = rulesOverrides[id] as { safety?: string; urgency?: string; liability?: string };
    if (
      existing.safety !== safety ||
      existing.urgency !== urgency ||
      existing.liability !== liability
    ) {
      rulesOverrides[id] = { safety, urgency, liability };
      rulesUpdated++;
      console.log(`  ✅ 更新hard_overrides ${id}: ${safety}/${urgency}/${liability}`);
    }
  }
}

if (rulesUpdated > 0) {
  rulesData.findings = rulesFindings;
  rulesData.hard_overrides = rulesOverrides;
  const rulesYaml = yaml.dump(rulesData, { lineWidth: 120, indent: 2 });
  fs.writeFileSync(rulesPath, rulesYaml, "utf8");
  console.log(`\n✅ 已更新rules.yml: ${rulesUpdated}个findings\n`);
} else {
  console.log(`\n✅ rules.yml已是最新，无需更新\n`);
}

// 4. 加载responses.yml
const responsesData = yaml.load(fs.readFileSync(responsesPath, "utf8")) as any;
const responsesFindings = responsesData.findings || {};
const responsesIds = Object.keys(responsesFindings);

console.log(`📋 responses.yml中的findings: ${responsesIds.length}个`);

// 5. 同步到responses.yml（budgetary_range和default_priority）
let responsesUpdated = 0;
for (const id of responsesIds) {
  const profile = profiles[id];
  if (!profile) {
    console.warn(`  ⚠️  ${id} 在finding_profiles.yml中不存在，跳过`);
    continue;
  }

  const finding = responsesFindings[id];
  let updated = false;

  // 同步budgetary_range
  const budgetLow = profile.budgetary_range?.low;
  const budgetHigh = profile.budgetary_range?.high;
  if (budgetLow != null && budgetHigh != null) {
    if (!finding.budgetary_range) {
      finding.budgetary_range = {};
      updated = true;
    }
    if (finding.budgetary_range.low !== budgetLow || finding.budgetary_range.high !== budgetHigh) {
      finding.budgetary_range.low = budgetLow;
      finding.budgetary_range.high = budgetHigh;
      updated = true;
    }
  }

  // 同步default_priority
  const priority = profile.default_priority;
  if (priority && finding.default_priority !== priority) {
    finding.default_priority = priority;
    updated = true;
  }

  if (updated) {
    responsesUpdated++;
    console.log(`  ✅ 更新 ${id}: priority=${priority}, budget=${budgetLow}-${budgetHigh}`);
  }
}

if (responsesUpdated > 0) {
  responsesData.findings = responsesFindings;
  const responsesYaml = yaml.dump(responsesData, { lineWidth: 120, indent: 2 });
  fs.writeFileSync(responsesPath, responsesYaml, "utf8");
  console.log(`\n✅ 已更新responses.yml: ${responsesUpdated}个findings\n`);
} else {
  console.log(`\n✅ responses.yml已是最新，无需更新\n`);
}

console.log("🎉 同步完成！");
console.log("\n📊 总结:");
console.log(`   - finding_profiles.yml: ${Object.keys(profiles).length}个findings（权威数据源）`);
console.log(`   - rules.yml: ${rulesIds.size}个findings，${rulesUpdated}个已同步`);
console.log(`   - responses.yml: ${responsesIds.length}个findings，${responsesUpdated}个已同步`);
