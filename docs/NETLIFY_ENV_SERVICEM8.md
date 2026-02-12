# Netlify Environment Variables for ServiceM8

Matches Snapshot repo exactly: Base URL `https://api.servicem8.com/api_1.0`, X-API-Key header.

## Required for job prefill

| Variable | Description | Example |
|----------|-------------|---------|
| `SERVICEM8_API_KEY` | ServiceM8 API key (from Settings → API Keys) | `sk-xxxx...` |

## Optional

| Variable | Description | Default |
|----------|-------------|---------|
| `SERVICEM8_BASE_URL` | Full base URL including api_1.0 (same as Snapshot) | `https://api.servicem8.com/api_1.0` |
| `SERVICEM8_API_BASE_URL` | Fallback alias (deprecated, use SERVICEM8_BASE_URL) | same default |

## Local curl verification

```bash
curl -H "X-API-Key: <your_key>" "https://api.servicem8.com/api_1.0/job.json?cursor=-1"
```

## For internal Snapshot integration only

| Variable | Description |
|----------|-------------|
| `INTERNAL_API_KEY` | Secret for `/api/internal/service-job-link` (Snapshot pushes here; set same value in Snapshot) |

## How to set in Netlify

1. Netlify Dashboard → Your site → **Site configuration** → **Environment variables**
2. Add variable: **Key** = `SERVICEM8_API_KEY`, **Value** = your API key
3. Redeploy after changing env vars
