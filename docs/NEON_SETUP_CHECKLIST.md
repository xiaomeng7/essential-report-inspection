# Neon DB setup checklist

## 1. Netlify environment variables

| Variable | Description | Required |
|----------|-------------|----------|
| **NEON_DATABASE_URL** | Full Postgres connection string from Neon (e.g. `postgres://user:pass@ep-xxx.region.aws.neon.tech/neondb?sslmode=require`) | Yes, for DB features |
| **ADMIN_TOKEN** | Secret for admin API and Config Admin (`Authorization: Bearer <token>`) | Recommended |

- In Netlify: Site → Environment variables → Add variable / Import from .env.
- For local dev: copy to `.env` (do not commit). Use `netlify dev` so functions get env.

## 2. Neon connection

1. Create a project at [console.neon.tech](https://console.neon.tech).
2. Copy the connection string from the dashboard (Connection string / URI).
3. Ensure **SSL** is used (`?sslmode=require` at the end if not present).

## 3. Run migrations

```bash
# Option A: psql
psql "$NEON_DATABASE_URL" -f migrations/001_initial_schema.sql

# Option B: Neon SQL Editor — paste migrations/001_initial_schema.sql and run
```

## 4. Seed findings and dimensions

```bash
NEON_DATABASE_URL="postgres://..." npx tsx scripts/seed-neon-findings.ts
```

## 5. Validate

```bash
NEON_DATABASE_URL="postgres://..." npx tsx scripts/validate-neon-db.ts
```

- (a) Reads custom dimensions from DB.
- (b) Checks inspections table (after at least one Submit with DB configured).
- (c) Checks finding_definitions + join with dimensions.

## 6. Admin UI

- Open `/admin/findings-dims`.
- Enter the same token as Config Admin (ADMIN_TOKEN).
- Search/filter findings, Edit dimensions (creates new version, sets active), Bulk apply preset.

## 7. Report generation (unchanged)

- Submit still writes Blobs and, when DB is configured, writes `inspections` + `inspection_findings` and updates `report_docx_key` when Word is generated.
- Report content and Word pipeline still use Blobs + existing config; `customDimensionsToFindingDimensions()` is unchanged. To use DB dimensions in report gen, you would load active dimensions from DB and merge (future step).
