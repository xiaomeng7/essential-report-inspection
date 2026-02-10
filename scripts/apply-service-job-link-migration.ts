/**
 * Apply 009_service_job_link.sql migration directly.
 * Use this if the normal migration script fails due to existing tables.
 */

import path from "path";
import fs from "fs";
import { config as loadDotenv } from "dotenv";
import { Client } from "pg";

const projectRoot = path.resolve(__dirname, "..");
loadDotenv({ path: path.join(projectRoot, ".env") });

const url = process.env.NEON_DATABASE_URL;
if (!url || !url.trim()) {
  console.error("未设置 NEON_DATABASE_URL，请在项目根目录 .env 中配置");
  process.exit(1);
}

async function run() {
  const client = new Client({ connectionString: url });
  try {
    await client.connect();

    const migrationFile = path.join(projectRoot, "migrations", "009_service_job_link.sql");
    const sql = fs.readFileSync(migrationFile, "utf8");

    console.log("📋 Applying 009_service_job_link.sql...");

    await client.query("BEGIN");
    try {
      await client.query(sql);
      // Mark as applied in schema_migrations
      await client.query("INSERT INTO schema_migrations (filename) VALUES ($1) ON CONFLICT (filename) DO NOTHING", [
        "009_service_job_link.sql",
      ]);
      await client.query("COMMIT");
      console.log("✅ Successfully applied 009_service_job_link.sql");
    } catch (e) {
      await client.query("ROLLBACK");
      throw e;
    }
  } catch (e) {
    console.error("❌ Migration failed:", e instanceof Error ? e.message : e);
    if (e instanceof Error && e.stack) {
      console.error(e.stack);
    }
    process.exit(1);
  } finally {
    await client.end();
  }
}

run();
