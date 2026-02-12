# ServiceM8 DB-First Prefill - Manual QA Checklist

## Overview
This feature implements DB-first job number resolution for ServiceM8 prefill:
- **DB-first lookup**: Query `service_job_link` table for `job_number -> job_uuid` mapping
- **Cache prefill data**: Store `prefill_json` with 24h TTL
- **Fallback to API**: If DB miss, resolve via ServiceM8 API, then upsert to DB
- **Internal endpoint**: Snapshot repo can push job mappings via `/api/internal/service-job-link`

## Prerequisites
1. **Database**: `NEON_DATABASE_URL` configured
2. **Migration**: Run `npm run db:migrate`，或依次执行 `npx tsx scripts/apply-010-migration.ts`、`npx tsx scripts/apply-011-migration.ts`（011 增加 created_at/updated_at）
3. **ServiceM8 API**: `SERVICEM8_API_TOKEN` configured (API Key or OAuth)
4. **Secrets**: `SERVICEM8_PREFILL_SECRET` and `INTERNAL_API_KEY` set in Netlify

## Test Cases

### 1. Internal Endpoint: Authentication

```bash
# Should return 401 UNAUTHORIZED
curl -X POST http://localhost:8888/api/internal/service-job-link \
  -H "Content-Type: application/json" \
  -d '{"job_uuid":"test-uuid","job_number":"TEST-001"}'
```

**Expected**: `{"ok":false,"error":"UNAUTHORIZED"}` with status 401

---

### 2. Internal Endpoint: Validation

```bash
# Should return 400 VALIDATION_ERROR
curl -X POST http://localhost:8888/api/internal/service-job-link \
  -H "Content-Type: application/json" \
  -H "x-internal-api-key: YOUR_INTERNAL_API_KEY" \
  -d '{"job_uuid":"","job_number":""}'
```

**Expected**: `{"ok":false,"error":"VALIDATION_ERROR","message":"job_uuid and job_number are required non-empty strings"}` with status 400

---

### 3. Internal Endpoint: Successful Upsert

```bash
# Should return 200 OK and upsert to DB
curl -X POST http://localhost:8888/api/internal/service-job-link \
  -H "Content-Type: application/json" \
  -H "x-internal-api-key: YOUR_INTERNAL_API_KEY" \
  -d '{
    "job_uuid": "test-uuid-12345",
    "job_number": "TEST-001",
    "source": "snapshot",
    "snapshot_ref": "snapshot-abc123"
  }'
```

**Expected**: `{"ok":true}` with status 200

**Verify DB**:
```sql
SELECT job_number, job_uuid, source FROM service_job_link WHERE job_number = 'TEST-001';
-- Should show: TEST-001 | test-uuid-12345 | snapshot
```

---

### 4. Prefill Endpoint: DB Cache Hit (with fresh prefill_json)

**Setup**: Insert a mapping with fresh prefill_json:
```sql
INSERT INTO service_job_link (job_number, job_uuid, prefill_json, prefill_fetched_at, source)
VALUES (
  'CACHED-001',
  'cached-uuid-001',
  '{"job":{"job_uuid":"cached-uuid-001","job_number":"CACHED-001","customer_name":"Test Customer","contact_name":null,"phone":null,"email":null,"address":{"line1":null,"line2":null,"suburb":null,"state":null,"postcode":null,"full_address":null}}}'::jsonb,
  NOW(),
  'test'
);
```

```bash
# Should return cached data WITHOUT calling ServiceM8 API
curl -X GET "http://localhost:8888/api/servicem8/job-prefill?job_number=CACHED-001" \
  -H "x-servicem8-prefill-secret: YOUR_PREFILL_SECRET"
```

**Expected**: 
- `{"ok":true,"job":{...},"cache":{"hit":true,"fetched_at":"..."}}` with status 200
- **Check logs**: Should NOT see `[servicem8] fetchJobByUuid` or `[servicem8] resolveJobNumberToUuid` calls

---

### 5. Prefill Endpoint: DB Hit (job_uuid exists, but no prefill_json)

**Setup**: Insert mapping WITHOUT prefill_json:
```sql
INSERT INTO service_job_link (job_number, job_uuid, source)
VALUES ('MAPPED-001', 'mapped-uuid-001', 'snapshot');
```

```bash
# Should call ServiceM8 API by UUID, then update prefill_json
curl -X GET "http://localhost:8888/api/servicem8/job-prefill?job_number=MAPPED-001" \
  -H "x-servicem8-prefill-secret: YOUR_PREFILL_SECRET"
```

**Expected**:
- `{"ok":true,"job":{...},"cache":{"hit":false,"fetched_at":"..."}}` with status 200
- **Check logs**: Should see `[servicem8] fetchJobByUuid mapped-uuid-001`
- **Verify DB**: `prefill_json` and `prefill_fetched_at` should be updated

---

### 6. Prefill Endpoint: DB Miss (no mapping exists)

**Setup**: Ensure no mapping exists:
```sql
DELETE FROM service_job_link WHERE job_number = 'NEW-001';
```

```bash
# Should call ServiceM8 API to resolve job_number -> job_uuid, then fetch details
curl -X GET "http://localhost:8888/api/servicem8/job-prefill?job_number=NEW-001" \
  -H "x-servicem8-prefill-secret: YOUR_PREFILL_SECRET"
```

**Expected** (if job exists in ServiceM8):
- `{"ok":true,"job":{...},"cache":{"hit":false,"fetched_at":"..."}}` with status 200
- **Check logs**: Should see `[servicem8] resolveJobNumberToUuid NEW-001` then `[servicem8] fetchJobByUuid ...`
- **Verify DB**: New row should be inserted with `job_number`, `job_uuid`, and `prefill_json`

**Expected** (if job NOT found):
- `{"ok":false,"error":"JOB_NOT_FOUND"}` with status 404

---

### 7. Prefill Endpoint: ServiceM8 API Error Handling

**Test with invalid job number**:
```bash
curl -X GET "http://localhost:8888/api/servicem8/job-prefill?job_number=INVALID-99999" \
  -H "x-servicem8-prefill-secret: YOUR_PREFILL_SECRET"
```

**Expected**: `{"ok":false,"error":"JOB_NOT_FOUND"}` with status 404

**Test with ServiceM8 API down** (if possible):
- Should return `{"ok":false,"error":"SERVICEM8_UPSTREAM_ERROR","details":"...","upstream_status":502}` with status 502

---

### 8. Prefill Endpoint: Authentication

```bash
# Should return 401 UNAUTHORIZED
curl -X GET "http://localhost:8888/api/servicem8/job-prefill?job_number=TEST-001"
```

**Expected**: `{"ok":false,"error":"UNAUTHORIZED"}` with status 401

---

### 9. Prefill Endpoint: Validation

```bash
# Should return 400 INVALID_JOB_NUMBER
curl -X GET "http://localhost:8888/api/servicem8/job-prefill?job_number=" \
  -H "x-servicem8-prefill-secret: YOUR_PREFILL_SECRET"
```

**Expected**: `{"ok":false,"error":"INVALID_JOB_NUMBER"}` with status 400

---

## Performance Checks

1. **DB Hit Performance**: 
   - First call with cached prefill_json should return in < 100ms
   - Should NOT make any external API calls

2. **DB Miss Performance**:
   - First call (DB miss) should make 1-2 ServiceM8 API calls:
     - `resolveJobNumberToUuid` (may paginate up to 3 pages)
     - `fetchJobByUuid` (single direct call)
   - Subsequent calls should be DB hits (< 100ms)

3. **Cache TTL**:
   - Prefill data cached for 24 hours
   - After 24h, should refetch from ServiceM8 API

## 如何确认 Snapshot 调用了内部 API（INTERNAL_API_KEY）

1. **看 Netlify 函数日志**  
   登录 Netlify → 你的站点 → **Functions** → 点击 `internalServiceJobLink` → **Logs**。  
   当 Snapshot 用正确的 `x-internal-api-key` 调用并成功时，会有一条日志：  
   `[internal-service-job-link] CALLED_WITH_INTERNAL_API_KEY success`，并带有 `job_number`、`job_uuid`、`source`（例如 `snapshot`）。

2. **看数据库**  
   在 Neon 里查 `service_job_link` 表，看是否有 `source = 'snapshot'` 且 `created_at` / `updated_at` 是最近时间的记录。

3. **用 curl 自测**  
   用下面命令带上你的 `INTERNAL_API_KEY` 调一次，成功会返回 `{"ok":true}`，且 Netlify 日志里会出现上述 `CALLED_WITH_INTERNAL_API_KEY success`。

---

## Integration with Snapshot Repo

Snapshot repo should call internal endpoint when pushing job mappings:

```bash
curl -X POST https://your-netlify-site.netlify.app/api/internal/service-job-link \
  -H "Content-Type: application/json" \
  -H "x-internal-api-key: YOUR_INTERNAL_API_KEY" \
  -d '{
    "job_uuid": "actual-servicem8-uuid",
    "job_number": "722",
    "source": "snapshot",
    "snapshot_ref": "snapshot-commit-hash"
  }'
```

After this, prefill endpoint should use the cached mapping without calling ServiceM8 API.

## Error Logging

Check Netlify function logs for structured error messages:
- `[servicem8]` prefix for ServiceM8 API calls
- `[servicem8-prefill]` prefix for prefill endpoint logic
- `[internal-service-job-link]` prefix for internal endpoint

All errors should include:
- Endpoint path
- Status code
- First 200 chars of error body (no secrets)
