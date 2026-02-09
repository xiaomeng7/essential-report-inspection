# Neon Postgres migrations

## Apply schema

1. Create a Neon project at [console.neon.tech](https://console.neon.tech) and get the connection string.
2. Set `NEON_DATABASE_URL=postgres://user:pass@host/db?sslmode=require` in `.env`.
3. Run migrations (auto-applies all `.sql` files in `migrations/`):

```bash
npm run db:migrate
```

The migration runner (`scripts/run-migration.ts`) automatically:
- Discovers all `.sql` files in `migrations/` directory
- Sorts them lexicographically
- Tracks applied migrations in `schema_migrations` table
- Only runs migrations that haven't been applied yet
- Runs each migration in a transaction (rolls back on error)

**Note:** Safe to run multiple times; already-applied migrations are skipped.

Alternatively, you can run migrations manually:

```bash
psql "$NEON_DATABASE_URL" -f migrations/001_initial_schema.sql
```

Or use the Neon SQL Editor: paste contents of migration files and run.

## Seed data

After schema is applied:

```bash
NEON_DATABASE_URL="postgres://..." npx tsx scripts/seed-neon-findings.ts
```

This upserts `finding_definitions` from `profiles/finding_profiles.yml` and `responses.yml`, and creates one active `finding_custom_dimensions` row per finding (with safe defaults and `needs_review=true`). Inserts 3 default `dimension_presets` if the table is empty.

## Netlify env

In Netlify dashboard → Site → Environment variables, add:

- **NEON_DATABASE_URL**: your Neon connection string (e.g. `postgres://user:pass@ep-xxx.region.aws.neon.tech/neondb?sslmode=require`).

Optional (for admin API and Config Admin):

- **ADMIN_TOKEN**: secret token for `Authorization: Bearer <token>` on `/api/admin/*` and config admin.

## Data flow (short)

- **Blobs**: raw inspection JSON, photos, generated DOCX. Unchanged; still the source for report generation.
- **DB**: `inspections` (metadata + `report_docx_key`), `inspection_findings` (per-finding refs), `finding_definitions` (149 findings), `finding_custom_dimensions` (Custom 9, versioned). Admin UI edits dimensions in DB; report pipeline can keep reading from Blob/config until you wire DB dimensions into it.
