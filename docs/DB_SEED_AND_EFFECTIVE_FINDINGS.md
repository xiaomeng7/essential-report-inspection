# DB 种子与运行时 Effective Finding 数据

## 概述

- **基线数据源**：`profiles/finding_profiles.yml`（约 149 个 findings，含 9 维度）、`responses.yml`（约 69 个，文案）。
- **运行时**：Neon Postgres（`NEON_DATABASE_URL`）。DB 中为种子 + Admin 覆盖；运行时读取「effective」数据：**DB 优先，无则用 YAML**。
- **deriveFindings**：不变，仍由前端/后端规则决定「哪些 finding 出现」。

## 运行清单

### 1. 执行迁移（首次或新环境）

```bash
npm run db:migrate
```

会执行 `migrations/001_init.sql`、`migrations/002_dimension_presets.sql`。

### 2. 种子 DB（finding_definitions + finding_custom_dimensions）

```bash
npm run db:seed
```

- 从 `finding_profiles.yml` + `responses.yml` 读取并 **upsert** `finding_definitions`（已有非空文案不会覆盖）。
- 仅当某 `finding_id` 在 `finding_custom_dimensions` 中**尚无任何行**时，插入 version=1、is_active=true、needs_review=false。
- 依赖 `.env` 中的 `NEON_DATABASE_URL`，未设置时退出码非 0。

### 3. 调用 listFindings（列表，带过滤与分页）

```bash
# 需设置 Authorization: Bearer <ADMIN_TOKEN>
curl -s -H "Authorization: Bearer YOUR_ADMIN_TOKEN" "http://localhost:8888/api/listFindings?limit=10&offset=0"
```

可选查询参数：`system_group`、`space_group`、`tag`、`q`（搜索 finding_id/title_en）、`missing_copy=true`、`missing_dims=true`、`limit`、`offset`。返回为 **effective** 数据（DB 覆盖优先，否则 YAML）。

### 4. 通过 updateFindingDimensions 更新 9 维度（带版本）

```bash
curl -s -X POST -H "Authorization: Bearer YOUR_ADMIN_TOKEN" -H "Content-Type: application/json" \
  -d '{"finding_id":"ALARM_SOUNDED","dimensions":{"priority":"IMMEDIATE","safety":"HIGH"},"updated_by":"admin"}' \
  "http://localhost:8888/api/updateFindingDimensions"
```

- 会为该 `finding_id` 插入新版本（version=max+1），并将旧版本的 `is_active` 置为 false。
- 返回新插入的当前有效行。

## 相关文件

| 用途 | 路径 |
|------|------|
| 迁移 | `migrations/001_init.sql`, `migrations/002_dimension_presets.sql` |
| 迁移脚本 | `scripts/run-migration.ts`（`npm run db:migrate`） |
| 种子脚本 | `scripts/db-seed-findings.ts`（`npm run db:seed`） |
| DB 访问 | `netlify/functions/lib/db.ts`（`getActiveDimensionsMap`, `getDefinitionsMap`） |
| Effective 合并 | `netlify/functions/lib/getEffectiveFindingData.ts`（`getEffectiveFinding`, `getEffectiveFindingIndex`） |
| Admin 列表（effective） | `netlify/functions/admin.ts` GET `/api/admin/findings` |
| 列表 API | `netlify/functions/listFindings.ts` GET `/api/listFindings` |
| 更新维度 API | `netlify/functions/updateFindingDimensions.ts` POST `/api/updateFindingDimensions` |

报告生成已改为在需要 9 维与文案时使用 `getEffectiveFinding(finding_id)`，并保留原有 YAML 回退。
