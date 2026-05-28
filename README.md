# IronWork

Mobile-first work orders, e-signatures, and invoices for welders.

**Live app:** [ironwork.app](https://ironwork.app) — create a work order, preview the agreement, and walk the full flow without cloning anything.

IronWork turns a jobsite conversation into a signed work order, clean PDF, change-order trail, and invoice with an optional payment link. Scope, exclusions, hidden damage, deposits, late fees, and workmanship warranty terms are captured in plain language before work starts.

**Stack:** TypeScript · React · Vite · Node · Supabase · Puppeteer · DocuSeal · Stripe Connect · Resend

---

## Built for welding jobs

- **Lock scope before the first bead** — customer, job site, welding work, materials, exclusions, and payment terms in one mobile form
- **Protect against scope creep** — signed change orders when repairs expose more damage or the customer adds fabrication
- **Keep paperwork tied to the job** — work orders, change orders, signed PDFs, invoices, and clients organized in one place
- **Send documents from the truck** — preview, e-sign, download PDFs, and issue invoices without rebuilding paperwork by hand
- **Get paid with less chasing** — Stripe payment links, deposits, taxes, late fees, and signed change-order line items on one invoice per job

## Workflow

1. **Create the work order** — customer, job site, scope, exclusions, price, deposit, schedule, warranty
2. **Preview the agreement** — numbered, plain-language sections built for welding jobs
3. **Send for signature** — DocuSeal e-sign, resend, offline-signed fallback, signed PDF tracking
4. **Manage changes** — change orders from work-order detail; signature required before billing
5. **Invoice the job** — PDF invoice, signed change orders as line items, email send, optional payment link, payment tracking

---

## Features

- Mobile-first work-order form for shop, truck, or jobsite
- Agreement preview before sign-in; account creation on first save, download, or signature send
- Email/password auth via Supabase
- Business profile defaults (exclusions, warranty, payment methods, tax, numbering)
- Bottom nav: **Home · Work Orders · Invoices · Clients** (+ profile settings)
- Work order list and detail with signature progress, PDF re-download, and job value rollups
- **Clients** page — search, inline edit contact fields; edits propagate to unsigned work orders
- Change-order wizard with offline-sign support, standalone/combined PDFs; billable only after signature
- Invoice wizard, list, and detail; one standard invoice per work order
- Invoice email with PDF attachment (Resend); Stripe Connect onboarding and payment links
- Invoice lifecycle: Draft → Downloaded → Invoiced → Paid (see below)
- Job site autocomplete (optional Geoapify key); US phone formatting
- Installable PWA shell (not offline-first — PDF, auth, Stripe, and DocuSeal need network)
- CI: lint, test, and build on every push/PR

---

## Quick start

**Requirements:** Node.js **≥ 20**, Chrome/Chromium on the same machine as the app server, Supabase project with migrations applied.

```bash
npm install

# Copy env vars and fill in from Supabase (Project Settings → API)
cp .env.example .env.local

# Dev: Vite (HMR) + /api/pdf + e-sign + Stripe + webhooks
npm run dev
```

Default URL: **`http://127.0.0.1:3000`**. Startup logs show which Chrome binary Puppeteer uses.

```bash
curl -s http://127.0.0.1:3000/api/pdf/health
# {"ok":true}
```

---

## Scripts

| Command | What runs |
|--------|-----------|
| `npm run dev` | `node server/app-server.mjs` — Vite middleware (HMR) + all API routes |
| `npm run build` | TypeScript + Vite production bundle → `dist/` |
| `npm run preview` | Production server over `dist/` + API routes (**run `build` first**) |
| `npm start` | Same as preview — `NODE_ENV=production node server/app-server.mjs` |
| `npm run test` | Vitest unit/route tests |
| `npm run lint` | ESLint + Vite public env check |

There is **no** standalone `vite preview` workflow. The supported path is always the custom app server so PDFs and API routes work on one origin.

GitHub Actions (`.github/workflows/ci.yml`) runs **`lint` → `test` → `build`** on `main` pushes and pull requests.

---

## Architecture note

This is **not** a static SPA you can drop on pure CDN hosting.

Every PDF (work order, invoice, change order, combined WO + COs) is rendered by a **Node process** using **Puppeteer** and a local **Chrome/Chromium** binary. The browser builds HTML and `POST`s it to **`/api/pdf`** on the **same origin** as the UI.

`POST /api/pdf` requires **`Authorization: Bearer <Supabase access_token>`**. Only **`GET /api/pdf/health`** is unauthenticated (for uptime probes).

---

## Environment variables

**Client (Vite — `VITE_*`, read at build time):**

```
VITE_SUPABASE_URL=...
VITE_SUPABASE_ANON_KEY=...
VITE_GEOAPIFY_API_KEY=...        # optional — job site autocomplete
VITE_UMAMI_WEBSITE_ID=...        # optional — analytics
```

**Server (runtime — not `VITE_`):**

The server loads **`.env`** then **`.env.local`** via `dotenv`.

| Variable | Purpose |
|----------|---------|
| `PUPPETEER_EXECUTABLE_PATH` / `CHROME_PATH` | Chrome/Chromium path (default `/usr/bin/google-chrome-stable`) |
| `PORT` / `HOST` | HTTP bind (default `3000` / `127.0.0.1`; use `0.0.0.0` in containers) |
| `NODE_ENV` | `production` serves `dist/` instead of Vite dev middleware |
| `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` | Server-side JWT verification and RLS-bypass updates |
| `DOCUSEAL_API_KEY` / `DOCUSEAL_BASE_URL` | E-sign send/resend/status |
| `DOCUSEAL_WEBHOOK_HEADER_NAME` / `DOCUSEAL_WEBHOOK_HEADER_VALUE` | Inbound DocuSeal webhook auth |
| `STRIPE_SECRET_KEY` / `STRIPE_WEBHOOK_SECRET` | Connect, payment links, payment reconciliation |
| `RESEND_API_KEY` / `RESEND_FROM_EMAIL` | Invoice email with PDF attachment |
| `APP_BASE_URL` | Optional public origin for Stripe Connect return/refresh URLs |
| `SENTRY_DSN` | Optional server error tracking |

See **`.env.example`** for the full list and comments.

---

## API routes (same app server)

**PDF**

- `GET /api/pdf/health` — readiness probe
- `POST /api/pdf` — authenticated; HTML → PDF via Puppeteer

**E-sign (DocuSeal)**

- `POST /api/esign/work-orders/:jobId/send|resend`
- `GET /api/esign/work-orders/:jobId/status`
- `POST /api/esign/change-orders/:coId/send|resend`
- `GET /api/esign/change-orders/:coId/status`
- `POST /api/webhooks/docuseal` — webhook (header secret, not JWT)

**Invoices**

- `POST /api/invoices/:id/send` — email PDF; optional payment link; sets `issued_at` on first successful send
- `POST /api/invoices/:id/mark-downloaded` — sets `downloaded_at` after PDF download (does not issue)
- `POST /api/invoices/:id/mark-paid-offline` / `unmark-paid-offline`

**Stripe**

- `POST /api/stripe/connect/start` / `GET /api/stripe/connect/status`
- `POST /api/stripe/invoices/:invoiceId/payment-link` — does **not** set `issued_at` alone
- `POST /api/stripe/webhook`

Send/resend, payment-link, and invoice email routes require a valid user **JWT**. Invoice send and payment-link creation are blocked until the parent work order is signature-satisfied (DocuSeal completed or offline-signed).

---

## Auth and product flow

**Anonymous**

- **Home → Create Work Order → JobForm → Preview.** Header shows **Sign In** only.
- **Download & Save** opens **CaptureModal** (business name, email, password, optional **Save defaults?**) → `signUp`. With Supabase email confirmation enabled, the pending work order is stored locally until the user confirms email, then the draft restores and the user saves again. With confirmation disabled, profile + job persist immediately.
- **Save & Send for Signature** uses the same capture path when anonymous, then `POST /api/esign/work-orders/:jobId/send`.

**Returning user**

- **Sign In** on **AuthPage** (email + password). New accounts are created through capture on first save, not a separate signup page.

**Signed in with profile**

- Bottom nav: **Home · Work Orders · Invoices · Clients**; profile gear for Edit Profile (Stripe Connect, defaults, business info).
- New work-order drafts are **in-memory** until **Download & Save** persists the job and upserts **clients** by normalized name.
- Change orders are created from **Work Order detail**. One invoice per work order; signed/offline-signed change orders appear as line items.

**E-sign UI sync**

- Work-order and change-order **detail** call DocuSeal/DB status **once** when the screen opens (and again after send/resend). There is **no** client interval polling; webhooks update the database in the background.
- **InvoiceFinalPage** refetches the invoice once on mount so Stripe webhook payment updates appear without leaving the page.

---

## Invoice lifecycle

| State | Meaning |
|-------|---------|
| No row | UI label **Invoice** — not yet created |
| `issued_at = null` | **Draft** |
| `downloaded_at` set, still draft | **Downloaded** chip (via `mark-downloaded`; does not issue) |
| `issued_at` set | **Invoiced** (first successful email send only) |
| `payment_status = paid/offline` | **Paid** (Stripe webhook or manual offline mark) |

Payment-link creation alone does not issue an invoice. Unsigned change orders may appear in the invoice UI but cannot be selected or persisted as billable line items.

---

## Tech stack

- **Vite** + **React 19** + **TypeScript**
- **Supabase** — auth, Postgres, RLS
- **Node `http` server** — Vite middleware (dev) or static `dist/` (prod)
- **Puppeteer Core** + system Chrome/Chromium
- **DocuSeal** — work order and change order e-sign
- **Stripe Connect Express** — onboarding and invoice payment links
- **Resend** — invoice email delivery
- **Sentry** (optional) — server error tracking
- Plain CSS — co-located per component; no Tailwind

---

## Project structure

```
src/
  App.tsx, App.css           # View routing + global shell tokens
  components/                # Pages and UI (each major surface has a paired .css)
    HomePage, JobForm, AgreementPreview, CaptureModal
    WorkOrdersPage, WorkOrderDetailPage
    ChangeOrderWizard, ChangeOrderDetailPage
    InvoiceWizard, InvoiceFinalPage, InvoicesPage
    ClientsPage, EditProfilePage, AuthPage, …
  hooks/                     # useAppNavigation, useAuthProfile, useWorkOrderDraft, …
  lib/
    agreement-*, change-order-*, invoice-*, docuseal-*
    agreement-pdf.ts, esign-api.ts, stripe-connect.ts, invoice-send.ts
    db/                        # profile, clients, jobs, change-orders, invoices
  types/
server/
  app-server.mjs             # HTTP entry: static/Vite + route dispatch
  esign-routes.mjs           # DocuSeal send/resend/status + webhook
  invoice-routes.mjs         # Invoice send, mark-downloaded, offline paid
  stripe-routes.mjs          # Connect + payment links + webhook
  jobs-routes.mjs            # Job-level server actions
  lib/                       # auth, PDF, rate-limit, stripe, sentry, …
supabase/migrations/
```

Styling: co-locate with the owning component. `App.css` is for design tokens, shell layout, shared utilities, and print/PDF globals only.

---

## Database

Tables: `business_profiles`, `clients`, `jobs`, `change_orders`, `invoices` — all with RLS.

```bash
npx supabase db push
```

Or paste migrations in Supabase Dashboard → SQL Editor.

---

## Deployment

IronWork runs as a **long-lived Node process** with **Chrome available** on the same host.

1. `npm ci` (or `npm install`)
2. Set **`VITE_*`** for the build environment → **`npm run build`**
3. Run **`npm start`** (or `NODE_ENV=production node server/app-server.mjs`) with:
   - **`PUPPETEER_EXECUTABLE_PATH`** or **`CHROME_PATH`** set explicitly in Docker/containers
   - **`HOST=0.0.0.0`** and platform **`PORT`**
   - All server env vars on the **running process** (not only build-time `VITE_*`)
4. One public origin for SPA + `/api/*` (reverse proxy if needed)
5. Probe **`GET /api/pdf/health`** for readiness

**What does not work:** uploading only `dist/` to static hosting with no `POST /api/pdf` handler.

Production runbook and observability notes: **[PRODUCTION.md](./PRODUCTION.md)**. Deep system reference: **[ARCHITECTURE.md](./ARCHITECTURE.md)**.

---

## Roadmap

**Current focus:** production hardening, custom branding (logo), ACH / bank payments.

Shipped: work orders, change orders, DocuSeal e-sign, Stripe Connect + payment links, client management, invoice email, PWA install shell.

Full backlog: **[ARCHITECTURE.md — Roadmap](./ARCHITECTURE.md#roadmap)**.

---

## License

MIT
