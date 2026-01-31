# Clickable Evidence Links — Pipeline Audit

## 1) Call Graph (Evidence HTML → DOCX)

```
generateWordReport (handler)
  └─ buildStructuredReport
       └─ buildObservedConditionsSection
            └─ generateFindingPages
                 └─ extractEvidence
                      → HTML: <ul><li>Photo P01 — caption (<a href="...">View photo</a>)</li></ul>
  └─ renderReportFromSlots(structuredReport)
  └─ markdownToHtml(markdown)          ← sanitize point 1
       ├─ md.render()                  (markdown-it, html: true)
       ├─ docxSafeNormalize(htmlBody)
       └─ sanitizeText(htmlBody, { preserveEmoji: true })
  └─ templateData = sanitizeObject(safeTemplateData)  ← sanitize point 2 (coverData only; REPORT_BODY_HTML passed through)
  └─ renderDocx(templateBuffer, templateData)
       └─ renderDocxWithHtmlMerge
            └─ asBlob(htmlContent)     (html-docx-js-typescript: HTML → MHT → DOCX altChunk)
            └─ DocxMerger(cover, body)
  └─ [DEV] verify hyperlinks in outBuffer
```

### Sanitize Points

| Point | File | What | Anchor impact |
|-------|------|------|---------------|
| 1 | markdownToHtml.ts | docxSafeNormalize + sanitizeText | ✅ Does not strip `<a>` or `href` |
| 2 | generateWordReport.ts | sanitizeObject on templateData | ✅ sanitizeText does char-level only, no HTML strip |
| 3 | renderDocx.ts (plan B fallback) | sanitizeText + htmlToFormattedText | ❌ htmlToFormattedText strips all HTML → links lost if fallback |

**Note:** Plan A (asBlob) is default. Plan B fallback strips HTML; links would be lost. If Plan A fails, verify cause before accepting Plan B.

---

## 2) Deviation List

| Item | Status | Notes |
|------|--------|-------|
| Clickable in Word | ⚠️ | html-docx-js-typescript embeds HTML as MHT altChunk. Word renders MHTML; links in MHTML should be clickable. Verified via dev-only check for `href=` in DOCX parts. |
| Anchor preserved | ✅ | sanitizeText + docxSafeNormalize do not strip `<a href>`. Smoke test passes. |
| baseUrl OK | ✅ | `getBaseUrl(event)` uses `x-forwarded-proto` + `host` from headers; fallback to env. |
| Token/expires OK | ✅ | `signPhotoUrl` / `verifyPhotoToken` in lib/photoUrl.ts; expires = unix seconds. |
| Content-Type OK | ✅ | inspectionPhoto returns `image/jpeg` or `image/png` with `Cache-Control: private, max-age=3600`. |

---

## 3) Root Cause Ranking (if failures occur)

| Rank | Possible cause | How to verify | Fix |
|------|----------------|---------------|-----|
| 1 | Plan B fallback used (htmlToFormattedText) | Log "方案 A 失败，回退到方案 B" | Fix Plan A (asBlob) error; do not rely on Plan B for links |
| 2 | baseUrl wrong (hardcoded / wrong proto) | Log `[report] photo baseUrl:` in dev | Use getBaseUrl(event) |
| 3 | sanitizeText stripping HTML | Run `npm run smoke:sanitize` | Add allowlist or bypass sanitize for REPORT_BODY_HTML |
| 4 | MHT encoding breaks href | Inspect afchunk.mht in DOCX | html-docx-js uses `=3D` for `=`; MIME decode should restore |
| 5 | Word not rendering MHTML links | Manual open DOCX, click link | Consider native w:hyperlink if MHTML links fail |

---

## 4) Minimal Patches Applied

### netlify/functions/lib/photoUrl.ts (NEW)
- `signPhotoUrl(inspectionId, photoId, baseUrl, secret?, ttlSeconds?)`
- `verifyPhotoToken(secret, inspectionId, photoId, expires, token)`

### netlify/functions/generateWordReport.ts
- `getBaseUrl(event)`: proto from `x-forwarded-proto`, host from `host`
- Use getBaseUrl for baseUrl (no hardcoded netlify.app)
- Dev-only: verify DOCX contains w:hyperlink or href= when input had `<a href>`

### netlify/functions/lib/generateFindingPages.ts
- Use `signPhotoUrl` from lib/photoUrl

### netlify/functions/inspectionPhoto.ts
- Use `verifyPhotoToken` from lib/photoUrl

### scripts/smoke-sanitize-anchor.ts (NEW)
- Asserts `<a href="...">` preserved after sanitizeText + docxSafeNormalize

---

## 5) Verification Checklist

| Step | Action | Expected |
|------|--------|----------|
| 1 | `npm run smoke:sanitize` | ✅ PASS |
| 2 | Upload 2 photos → generate report | Evidence shows "View photo" links |
| 3 | Open DOCX in Word, click "View photo" | Browser opens photo URL |
| 4 | In dev: `NETLIFY_DEV=true` or `NODE_ENV=development` | Log `[report] ✅ Hyperlink verify OK: href= in word/afchunk.mht` |
| 5 | Set REPORT_PHOTO_SIGNING_SECRET | Links include token+expires; inspectionPhoto validates |
| 6 | Call inspectionPhoto with expired expires | 403 |

---

## 6) HTML Allowlist (Optional)

Current sanitizeText does **not** strip HTML. No allowlist needed. If future changes introduce HTML stripping, add:

```ts
// Allow: a, p, ul, li, h1-h4, table, tr, td, th, strong, em, br, div
// For <a>: allow href only
```

Use a proper HTML sanitizer (e.g. DOMPurify with allowed tags) if needed. Smoke test `npm run smoke:sanitize` will catch regressions.
