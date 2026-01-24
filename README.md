# Essential Electrical Property Health Inspection

Mobile-first technician inspection web app and backend for on-site electrical health inspections. Uses section-based forms, conditional (gate) logic, skip rules, and a YAML rules engine to produce draft internal reports.

## Tech Stack

- **Frontend**: React + TypeScript + Vite (mobile-first)
- **Backend**: Netlify Functions (Node.js / TypeScript)
- **Deploy**: Netlify
- **Spec**: `SPEC.md`, `FIELD_DICTIONARY.json`, `rules.yml`

## Local Development

### Prerequisites

- Node.js 18+
- npm

### Setup

```bash
npm install
```

### Run full stack (recommended)

Uses Netlify Dev to serve the Vite app and Netlify Functions together:

```bash
npm run netlify:dev
```

- App: http://localhost:8888
- API: `/api/submitInspection`, `/api/review/:id`

### Frontend only

```bash
npm run dev
```

Vite proxies `/api` to `http://localhost:8888`. Run `netlify dev` in another terminal for the API, or use the same port as above.

### Build

```bash
npm run build
```

Output: `dist/` (static) + `netlify/functions/` (serverless).

## Deployment (Netlify)

1. Connect the repo to Netlify.
2. Build command: `npm run build`
3. Publish directory: `dist`
4. Functions directory: `netlify/functions`
5. Deploy.

Redirects in `netlify.toml` handle `/api/*` → functions and `/review/*`, `/*` → SPA.

## Sample Inspection

`sample-inspection.json` is a minimal valid inspection payload. Test the submit endpoint:

```bash
curl -X POST http://localhost:8888/api/submitInspection \
  -H "Content-Type: application/json" \
  -d @sample-inspection.json
```

Response: `{ "inspection_id": "EH-YYYY-XXXX", "status": "accepted", "review_url": "/review/EH-YYYY-XXXX" }`.

Then open `/review/EH-YYYY-XXXX` (or use the returned `review_url`) to view the draft report.

## Flow

1. **Technician** → Complete inspection wizard (sections, gates, skips, autosave).
2. **Submit** → `POST /api/submitInspection` with full inspection JSON.
3. **Backend** → Persist raw JSON, evaluate `rules.yml`, generate findings + draft HTML report.
4. **Review** → `GET /api/review/:inspection_id` returns report HTML, findings, limitations.
5. **Office** → Internal review page shows draft report; no public access.

## Project Structure

```
├── index.html
├── package.json
├── netlify.toml
├── vite.config.ts
├── tsconfig.json
├── SPEC.md
├── FIELD_DICTIONARY.json
├── rules.yml
├── sample-inspection.json
├── src/
│   ├── main.tsx
│   ├── App.tsx
│   ├── styles/index.css
│   ├── components/
│   │   ├── Wizard.tsx
│   │   ├── SectionForm.tsx
│   │   ├── FieldRenderer.tsx
│   │   └── ReviewPage.tsx
│   ├── hooks/
│   │   └── useInspection.ts
│   └── lib/
│       ├── fieldDictionary.ts
│       ├── validation.ts
│       └── gates.ts
└── netlify/
    └── functions/
        ├── submitInspection.ts
        ├── review.ts
        └── lib/
            ├── store.ts
            └── rules.ts
```

## Data & Rules

- **FIELD_DICTIONARY.json**: Sections, fields, enums, gates, `required_when`, `clear_on_gate_change`, skip reasons.
- **rules.yml**: Finding IDs, safety/urgency/liability, hard overrides, base priority matrix, liability adjustment and guardrails.

Backend loads `rules.yml` from the project root and derives findings from submitted facts. Findings are bucketed into Immediate, Recommended (0–3 months), Plan/Monitor; limitations come from skipped items.

## Storage

v1 uses an **in-memory** store in Netlify Functions. Data is lost on cold starts. For production, use Netlify Blobs, a database, or similar.

## Verification (Acceptance Criteria)

- Technician can complete inspection in &lt;20 minutes (section-based, 5–8 questions per section).
- Sections auto-skip correctly (gates: switchboard access, RCD/GPO performed, Solar/Battery/EV).
- Back navigation works without data corruption; gate changes prompt and clear dependent data.
- Skipped answers include `skip_reason` (and optional `skip_note`).
- Submit returns `inspection_id` and `review_url`.
- Backend produces draft report (Immediate / Recommended 0–3 months / Plan–Monitor / Limitations).
- Office can review via `/review/:inspection_id`.

## Non-Goals

- Compliance certification  
- Legal judgement language  
- Customer-facing auto-recommendations  
- Real-time PDF generation in the field  
