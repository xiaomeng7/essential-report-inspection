/**
 * Auto-discover and run all SQL migrations in migrations/ directory.
 * Tracks applied migrations in schema_migrations table to avoid re-running.
 * Usage: npm run db:migrate (requires NEON_DATABASE_URL in .env)
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

async function run() {
  const client = new Client({ connectionString: url });
  try {
    await client.connect();

    // 1. Create schema_migrations table if not exists
    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        filename TEXT PRIMARY KEY,
        applied_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);
    console.log("✅ schema_migrations table ready");

    // 2. Read all .sql files from migrations/ directory
    const allFiles = fs.readdirSync(migrationsDir);
    const sqlFiles = allFiles
      .filter((f) => f.endsWith(".sql"))
      .sort(); // 3. Sort lexicographically

    if (sqlFiles.length === 0) {
      console.log("⚠️  No .sql files found in migrations/ directory");
      return;
    }

    console.log(`📋 Found ${sqlFiles.length} migration file(s): ${sqlFiles.join(", ")}`);

    // 4. Get already applied migrations
    const appliedResult = await client.query<{ filename: string }>(
      "SELECT filename FROM schema_migrations ORDER BY filename"
    );
    const appliedSet = new Set(appliedResult.rows.map((r) => r.filename));

    const toApply = sqlFiles.filter((f) => !appliedSet.has(f));
    const skipped = sqlFiles.filter((f) => appliedSet.has(f));

    if (toApply.length === 0) {
      console.log(`✅ All migrations already applied (${skipped.length} skipped)`);
      return;
    }

    console.log(`📦 Applying ${toApply.length} migration(s), skipping ${skipped.length} already applied`);

    // 5. Run each unapplied migration in a transaction
    for (const filename of toApply) {
      const filePath = path.join(migrationsDir, filename);
      const sql = fs.readFileSync(filePath, "utf8");

      if (!sql.trim()) {
        console.warn(`⚠️  Skipping empty file: ${filename}`);
        continue;
      }

      await client.query("BEGIN");
      try {
        await client.query(sql);
        await client.query("INSERT INTO schema_migrations (filename) VALUES ($1)", [filename]);
        await client.query("COMMIT");
        console.log(`✅ Applied: ${filename}`);
      } catch (e) {
        await client.query("ROLLBACK");
        throw e;
      }
    }

    console.log(`\n✅ Migration complete: applied ${toApply.length}, skipped ${skipped.length}`);
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
