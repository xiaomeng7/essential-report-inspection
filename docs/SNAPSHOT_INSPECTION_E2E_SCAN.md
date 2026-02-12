# Snapshot ↔ Inspection End-to-End Flow – File & Endpoint Scan

## Quick Manual QA Checklist

- [ ] **Netlify (Inspection)**: `SERVICEM8_API_KEY`, `INTERNAL_API_KEY`, `SERVICEM8_BASE_URL` (optional)
- [ ] **Netlify (Snapshot)**: `SERVICEM8_API_KEY`, `SERVICEM8_BASE_URL`, `SNAPSHOT_SIGNING_SECRET`, `INSPECTION_BASE_URL`, `INTERNAL_API_KEY`
- [ ] Snapshot create-job returns `job_number` + `job_uuid`
- [ ] Snapshot push succeeds (check logs: `[internal-service-job-link] CALLED_WITH_INTERNAL_API_KEY success`)
- [ ] Prefill GET `/api/servicem8/job-prefill?job_number=XXX` returns JSON: `{ ok: true, job: {...} }`
- [ ] `job.customer_name` or `job.address.full_address` non-empty when ServiceM8 has data
- [ ] Run E2E: `SNAPSHOT_BASE_URL=... INSPECTION_BASE_URL=... SNAPSHOT_SIGNING_SECRET=... INTERNAL_API_KEY=... npm run test:snapshot-inspection-e2e`

## Overview

| Step | Project | Action |
|------|---------|--------|
| 1 | Snapshot | Create ServiceM8 job → get `job_number` + `job_uuid` |
| 2 | Snapshot | POST to Inspection internal endpoint with mapping |
| 3 | Inspection | Technician enters `job_number` → prefill fetches data (DB-first, then ServiceM8) |

---

## Snapshot (risk-snapshot-netlify ZH)

### Files

| File | Purpose |
|------|---------|
| `netlify/functions/createServiceM8Job.ts` | Create job, extract job_number, push to Inspection |
| `.env.example` | Env var template |
| `SERVICEM8_SETUP.md` | Setup docs |
| `scripts/test-servicem8-create-job.ts` | Test create job |
| `scripts/test-inspection-link-push.ts` | Test inspection push only |

### Endpoints

- **Create job**: `POST /.netlify/functions/createServiceM8Job` (or via Netlify routing)
- **ServiceM8**: `X-API-Key` header, base `SERVICEM8_BASE_URL` (default `https://api.servicem8.com/api_1.0`)

### Env vars (current)

| Var | Purpose |
|-----|---------|
| `SERVICEM8_API_KEY` | ServiceM8 auth (X-API-Key) |
| `SERVICEM8_BASE_URL` | ServiceM8 base URL |
| `INSPECTION_BASE_URL` | Inspection site root |
| `INTERNAL_API_KEY` | Auth for Inspection internal endpoint |

### Push URL (current)

`${INSPECTION_BASE_URL}/.netlify/functions/internalServiceJobLink`

**Recommended**: `${INSPECTION_BASE_URL}/api/internal/service-job-link` (canonical redirect)

---

## Inspection (essential-report_specs)

### Files

| File | Purpose |
|------|---------|
| `netlify/functions/internalServiceJobLink.ts` | Receive job mapping from Snapshot |
| `netlify/functions/servicem8JobPrefill.ts` | Prefill by job_number (DB-first, ServiceM8 fallback) |
| `netlify/functions/lib/serviceM8.ts` | ServiceM8 client (X-API-Key) |
| `netlify/functions/lib/dbServiceJobLink.ts` | DB helpers for service_job_link |
| `netlify.toml` | Redirects |

### Endpoints

| Path | Method | Handler |
|------|--------|---------|
| `/api/internal/service-job-link` | POST | internalServiceJobLink |
| `/api/servicem8/job-prefill` | GET | servicem8JobPrefill |

### Env vars (current)

| Var | Purpose |
|-----|---------|
| `SERVICEM8_API_KEY` | ServiceM8 auth |
| `SERVICEM8_API_BASE_URL` | ServiceM8 base URL |
| `INTERNAL_API_KEY` | Auth for internal endpoint |

### Auth

- **internalServiceJobLink**: `x-internal-api-key` header must match `INTERNAL_API_KEY`
- **servicem8JobPrefill**: No auth (technician-facing)

---

## Env Var Alignment (Target)

| Var | Snapshot | Inspection |
|-----|----------|------------|
| `SERVICEM8_API_KEY` | ✓ | ✓ |
| `SERVICEM8_BASE_URL` | ✓ | Change: `SERVICEM8_API_BASE_URL` → `SERVICEM8_BASE_URL` |
| `INSPECTION_BASE_URL` | ✓ | N/A |
| `INTERNAL_API_KEY` | ✓ | ✓ |

---

## Data Flow

1. Snapshot: `createServiceM8Job` creates job → returns `{ job_uuid, job_number }`
2. Snapshot: `pushServiceJobLinkToInspection({ job_uuid, job_number })` → POST to Inspection
3. Inspection: `internalServiceJobLink` upserts `service_job_link` table
4. Technician: enters job_number in Wizard → prefill API called
5. Prefill: `selectJobLink(job_number)` → if found use job_uuid; else `resolveJobNumberToUuid` via ServiceM8
6. Prefill: `fetchJobByUuid` → get full job details → return normalized JSON
