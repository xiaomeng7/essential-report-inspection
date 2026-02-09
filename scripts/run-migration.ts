/**
 * 执行 migrations/001_init.sql（需先配置 .env 中的 NEON_DATABASE_URL）
 * 使用方式：npm run db:migrate
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

const migrationsDir = path.join(projectRoot, "migrations");
const migrationFiles = ["001_init.sql", "002_dimension_presets.sql", "003_findings_management.sql"].filter((f) =>
  fs.existsSync(path.join(migrationsDir, f))
);

async function run() {
  const client = new Client({ connectionString: url });
  try {
    await client.connect();
    for (const f of migrationFiles) {
      const sql = fs.readFileSync(path.join(migrationsDir, f), "utf8");
      await client.query(sql);
      console.log("执行完成:", f);
    }
  } catch (e) {
    console.error("迁移失败:", e instanceof Error ? e.message : e);
    process.exit(1);
  } finally {
    await client.end();
  }
}

run();
