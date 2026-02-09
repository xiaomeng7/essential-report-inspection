#!/usr/bin/env node
const path = require("path");
const fs = require("fs");

const envPath = path.resolve(__dirname, "..", ".env");
const exists = fs.existsSync(envPath);
console.log(".env 路径:", envPath);
console.log(".env 存在:", exists);

if (exists) {
  const raw = fs.readFileSync(envPath, "utf8");
  const hasKey = raw
    .split("\n")
    .some((line) => {
      const trimmed = line.trim();
      return trimmed.startsWith("NEON_DATABASE_URL=") && !trimmed.startsWith("#");
    });
  console.log("含 NEON_DATABASE_URL= 且未注释:", hasKey);
  if (!hasKey) {
    const lines = raw.split("\n").map((l, i) => `${i + 1}: ${l.replace(/=.*/, "=***")}`);
    console.log("当前行（值已隐藏）:\n" + lines.join("\n"));
  }
}

require("dotenv").config({ path: envPath });
const set = !!process.env.NEON_DATABASE_URL;
console.log("dotenv 加载后 NEON_DATABASE_URL set:", set);
process.exit(set ? 0 : 1);
