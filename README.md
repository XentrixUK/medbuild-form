# MedBuild Intake — Xentrix medical portfolio prospect form

Free-portfolio lead capture for newly-qualified UK doctors (final year → FY2 → IMG).
Branded to Xentrix. Collects everything needed to build a portfolio page, stores it in a
local SQLite DB, and exposes a simple admin API for the sales pipeline.

## Run it

```bash
npm install
npm start
# → http://localhost:3000
```

Set env vars in production:

- `PORT` — port to listen on (default 3000, local dev only)
- `ADMIN_KEY` — key that gates the admin/read endpoints (default is a dev placeholder — **change it**)
- `TURSO_DATABASE_URL` + `TURSO_AUTH_TOKEN` — libSQL/Turso connection (falls back to local `prospects.db` if unset)
- `BLOB_READ_WRITE_TOKEN` — Vercel Blob token for CV storage (falls back to local `uploads/` if unset)

## What it captures

**Contact:** name, email, phone, location, referral source
**Training (UK-specific):** career stage (final year / FY1 / FY2 / IMG / other), medical school,
graduation year, GMC number, specialty interest, deanery
**Portfolio content:** summary, education, rotations, research/audits, teaching, certifications,
memberships, achievements
**Build prefs:** CV upload OR "build one for me", tone, colour direction, wanted sections,
LinkedIn/ORCID, custom-domain interest (upsell signal), notes
**Consent (UK GDPR):** required processing consent + separate optional marketing opt-in

## Endpoints

| Method | Path | Auth | Purpose |
|---|---|---|---|
| GET  | `/` | — | The form |
| POST | `/api/submit` | — | Form submission (multipart, optional CV) |
| GET  | `/api/prospects?key=…` | admin | List all prospects (JSON) |
| GET  | `/api/prospects/:id?key=…` | admin | One prospect |
| DELETE | `/api/prospects/:id?key=…` | admin | **GDPR erasure** — hard delete |
| GET  | `/health` | — | Health + count |

Admin key can be passed as `?key=` or header `x-admin-key`.

## Data & privacy

- Stored in `prospects.db` (SQLite, WAL mode). CVs land in `uploads/`.
- IP is **hashed** (SHA-256, truncated), never stored raw.
- Erasure is one call: `DELETE /api/prospects/:id`. Email lookup via the indexed `email` column.
- You are the data controller. Keep the privacy notice on the form accurate.

## Tests

```bash
node test.js     # 18 integration assertions (validation, upload, admin gate, GDPR delete)
node shot.js     # regenerates desktop + mobile screenshots
```

## Deploying (Vercel + Turso + Blob)

The project already runs on Vercel serverless (`api/index.js` wraps the express app in `app.js`).

1. **Turso** — `turso db create medbuild-form`, then `turso db show medbuild-form --url` and `turso db tokens create medbuild-form` → set `TURSO_DATABASE_URL` + `TURSO_AUTH_TOKEN` in Vercel.
2. **Vercel Blob** — enable a Blob store in the Vercel dashboard; the `BLOB_READ_WRITE_TOKEN` env var is auto-populated on the project.
3. **Env vars on Vercel** — set `ADMIN_KEY` (not the dev default), `TURSO_DATABASE_URL`, `TURSO_AUTH_TOKEN`.
4. **Deploy** — `vercel --prod` (or push to `main` if the repo is linked).

Still to do before this is truly production-grade:

- **Real admin auth** — replace the key gate with iron-session / a proper login.
- **Email on submit** — wire Resend to notify the team + auto-reply to the prospect. Route notifications to `hello@xentrix.xyz`.
- **Rate limiting + captcha** on `/api/submit` (public endpoint).

## Pipeline evolution (built-in hooks)

The `status` column (`new → contacted → building → delivered → upsell → closed`) and the
`wants_custom_domain` flag are there so this feeds straight into the sales pipeline. Once a
portfolio is delivered, the `upsell` status + domain interest tells Hana who's warm for the
custom-domain / blog / full-site upsell.
