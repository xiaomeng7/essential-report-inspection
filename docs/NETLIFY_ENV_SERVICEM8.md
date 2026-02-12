# Netlify Environment Variables for ServiceM8

## Required for job prefill

| Variable | Description | Example |
|----------|-------------|---------|
| `SERVICEM8_API_TOKEN` | ServiceM8 API key (from Settings → API Keys) | `sk-xxxx...` |
| or `SERVICEM8_API_KEY` | Same as above (alternative name) | `sk-xxxx...` |

## Optional

| Variable | Description | Default |
|----------|-------------|---------|
| `SERVICEM8_AUTH_TYPE` | `api_key` (X-API-Key), `bearer` (OAuth), or `basic` (Basic Auth) | `api_key` |
| `SERVICEM8_API_BASE_URL` | ServiceM8 API base URL | `https://api.servicem8.com` |

## For internal Snapshot integration only

| Variable | Description |
|----------|-------------|
| `INTERNAL_API_KEY` | Secret for `/api/internal/service-job-link` (Snapshot repo only) |

## How to set in Netlify

1. Netlify Dashboard → Your site → **Site configuration** → **Environment variables**
2. Add variable: **Key** = `SERVICEM8_API_TOKEN`, **Value** = your API key
3. (Optional) Add `SERVICEM8_AUTH_TYPE` = `basic` if X-API-Key returns 401
4. Redeploy after changing env vars

## Auth types

- **api_key** (default): Sends `X-API-Key: your_key` header
- **bearer**: Sends `Authorization: Bearer your_token` (for OAuth)
- **basic**: Sends `Authorization: Basic base64(API_KEY:your_key)` – use if ServiceM8 expects Basic Auth
