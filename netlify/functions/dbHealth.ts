import type { Handler } from "@netlify/functions";
import path from "path";
import { config as loadDotenv } from "dotenv";
import { neon } from "@neondatabase/serverless";

const json = (body: object, status = 200) => ({
  statusCode: status,
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(body),
});

/** Netlify Dev 下 Functions 可能拿不到根目录 .env，运行时从常见路径加载 */
function loadEnvIfNeeded(): void {
  if (process.env.NEON_DATABASE_URL) return;
  const candidates = [
    path.resolve(process.cwd(), ".env"),
    path.resolve(process.cwd(), "..", ".env"),
    path.resolve(process.cwd(), "..", "..", ".env"),
  ];
  for (const p of candidates) {
    loadDotenv({ path: p });
    if (process.env.NEON_DATABASE_URL) return;
  }
}

export const handler: Handler = async () => {
  loadEnvIfNeeded();
  const url = process.env.NEON_DATABASE_URL;
  if (!url || url.trim() === "") {
    return json(
      {
        ok: false,
        error: "NEON_DATABASE_URL missing",
        hint: "在项目根目录 .env 中设置 NEON_DATABASE_URL=postgres://... ，然后重启 netlify dev",
      },
      500
    );
  }

  try {
    const sql = neon(url);
    const rows = await sql`select now() as now, current_database() as db`;
    const t = await sql`select tablename from pg_tables where schemaname='public' and tablename like 'finding_%'`;
    return json({ ok: true, rows, finding_tables: t });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : String(e);
    return json(
      {
        ok: false,
        error: message,
        hint:
          "常见原因：1) 连接串格式错误，需含 ?sslmode=require  2) Neon 项目已暂停（免费版闲置会暂停，到 console.neon.tech 唤醒）  3) 网络或防火墙",
      },
      500
    );
  }
};
