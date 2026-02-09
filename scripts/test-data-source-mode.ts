/**
 * Smoke test for DATA_SOURCE_MODE behavior.
 * Tests each mode (db_only, db_prefer, yml_only) and prints behavior.
 * 
 * Usage:
 *   DATA_SOURCE_MODE=db_only tsx scripts/test-data-source-mode.ts
 *   DATA_SOURCE_MODE=db_prefer tsx scripts/test-data-source-mode.ts
 *   DATA_SOURCE_MODE=yml_only tsx scripts/test-data-source-mode.ts
 */

import { getDataSourceMode, isDbOnly, isYmlOnly, allowsDb, allowsYaml } from "../netlify/functions/lib/dataSourceMode";
import { getFindingMessage, getFindingMessagesBatch } from "../netlify/functions/lib/getFindingMessage";

async function testDataSourceMode() {
  console.log("=".repeat(60));
  console.log("DATA_SOURCE_MODE Smoke Test");
  console.log("=".repeat(60));
  
  // Test mode detection
  const mode = getDataSourceMode();
  console.log(`\n📋 Current Mode: ${mode}`);
  console.log(`   - isDbOnly(): ${isDbOnly()}`);
  console.log(`   - isYmlOnly(): ${isYmlOnly()}`);
  console.log(`   - allowsDb(): ${allowsDb()}`);
  console.log(`   - allowsYaml(): ${allowsYaml()}`);
  
  // Test environment detection
  console.log(`\n🌍 Environment:`);
  console.log(`   - CONTEXT: ${process.env.CONTEXT || "(not set)"}`);
  console.log(`   - NODE_ENV: ${process.env.NODE_ENV || "(not set)"}`);
  console.log(`   - DATA_SOURCE_MODE: ${process.env.DATA_SOURCE_MODE || "(not set, using default)"}`);
  
  // Test finding message lookup
  console.log(`\n🔍 Testing getFindingMessage():`);
  const testFindingId = "ALARM_SOUNDED"; // Common finding ID
  
  try {
    const message = await getFindingMessage(testFindingId, "en-AU");
    if (message) {
      console.log(`   ✅ Found message for ${testFindingId}`);
      console.log(`      Title: ${message.title || "(none)"}`);
      console.log(`      Has why_it_matters: ${!!message.why_it_matters}`);
      console.log(`      Has recommended_action: ${!!message.recommended_action}`);
    } else {
      console.log(`   ⚠️  No message found for ${testFindingId} (returned null)`);
    }
  } catch (error) {
    console.log(`   ❌ Error: ${error instanceof Error ? error.message : String(error)}`);
    if (isDbOnly()) {
      console.log(`   ℹ️  Expected in db_only mode when DB is missing or finding not found`);
    }
  }
  
  // Test batch lookup
  console.log(`\n📦 Testing getFindingMessagesBatch():`);
  const testFindingIds = ["ALARM_SOUNDED", "CABLE_DAMAGE_OBSERVED", "NON_EXISTENT_FINDING"];
  
  try {
    const messages = await getFindingMessagesBatch(testFindingIds, "en-AU");
    console.log(`   ✅ Batch lookup completed`);
    console.log(`      Requested: ${testFindingIds.length} findings`);
    console.log(`      Found: ${Object.keys(messages).length} messages`);
    for (const id of testFindingIds) {
      if (messages[id]) {
        console.log(`      - ${id}: ✅ (has title: ${!!messages[id].title})`);
      } else {
        console.log(`      - ${id}: ❌ (not found)`);
      }
    }
  } catch (error) {
    console.log(`   ❌ Error: ${error instanceof Error ? error.message : String(error)}`);
    if (isDbOnly()) {
      console.log(`   ℹ️  Expected in db_only mode when DB is missing or findings not found`);
    }
  }
  
  // Summary
  console.log(`\n📊 Summary:`);
  console.log(`   Mode: ${mode}`);
  if (mode === "db_only") {
    console.log(`   ⚠️  db_only mode: Will throw errors if DB is missing or findings not found`);
    console.log(`   ✅ No YAML fallback will be attempted`);
  } else if (mode === "db_prefer") {
    console.log(`   ✅ db_prefer mode: DB first, YAML fallback if needed`);
  } else if (mode === "yml_only") {
    console.log(`   ✅ yml_only mode: Only reads from YAML, ignores DB`);
  }
  
  console.log("\n" + "=".repeat(60));
}

// Run test
testDataSourceMode().catch((error) => {
  console.error("Test failed:", error);
  process.exit(1);
});
