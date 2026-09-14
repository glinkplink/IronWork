# MVP workflow test log

Operator test of the IronWork welder job → e-sign → invoice path. Not a product feature.

**Dates:** 13–14 Sep 2026 (UTC)  
**Shop:** Rivera Mobile Welding (Alex Rivera)  
**Account:** `mvp.ui.16c0.sep13@example.com`  
**Customer:** Jordan Lee, `jordan.mvp.16c0@example.com`, 500 Castro Street, Mountain View, CA 94041

| Record | Number | ID |
|--------|--------|----|
| Work order | #0001 | `1a8bf4cb-e18d-4207-bb05-6216a7f1f79c` |
| Change order | #0001 | `0d525bd8-37e4-4618-9e3b-ad64471d7a0a` |
| Invoice | #0001 | `b217388a-1519-47d8-9272-83fdb5eb10e2` |

Invoice totals: subtotal **2125**, tax **127.50** (6%), total **2252.50**. Stripe Connect account on the profile: `acct_1UFEAvFnL2J2UaQV`.

DB snapshot **14 Sep 2026**: WO `esign_status=sent`, `offline_signed_at` set; CO `esign_status=not_sent`, `offline_signed_at` set; invoice `issued_at` null, `downloaded_at` set, `payment_status=unpaid`, no payment URL.

---

## 13 Sep 2026 — local quality gates and guest UI

Pass:

- `npm run lint`
- `npm run test` (453+ tests)
- `npm run build` (warning: `VITE_UMAMI_WEBSITE_ID` unset in `index.html`)
- Local `GET /api/pdf/health` → `{"ok":true}`
- Puppeteer PDF smoke (unauthenticated health path / Chrome present)
- Stripe test-mode balance API
- DocuSeal `GET /templates` → 200
- Geoapify autocomplete → 200
- Guest landing, job form, Geoapify street fill, phone format, agreement preview
- Mobile 390px landing / form / preview
- Offline/unreachable Supabase shows a friendly connection error (after the copy fix on this branch)

Skipped that day until Supabase DNS came back: signed-in save, WO/CO/invoice, e-sign, Stripe, invoice email.

---

## 13 Sep 2026 — signed-in local workflow (Supabase live)

Pass:

- Auth (password grant) and authenticated `POST /api/pdf` → PDF
- Create and save WO #0001 ($1850); download WO PDF
- DocuSeal send on the work order → `esign_status=sent`, submission id set
- Mark WO signed offline (`offline_signed_at` 13 Sep 2026 14:02 UTC)
- Create CO #0001 (hinge reinforcement plates, $275); mark signed offline
- Invoice wizard → Invoice #0001 including the signed CO; status **Downloaded** (not issued)

Blocked / failed:

- Local **Send Invoice** with no `RESEND_API_KEY` in that agent → UI **Email delivery is temporarily unavailable.** (HTTP 503)
- Stripe `POST /api/stripe/connect/start` → 200, onboarding URL, **`onboardingComplete: false`**

Also noted: first-time capture PDF did not call mark-downloaded; that path was patched on this branch. WO `last_downloaded_at` was still null in the 14 Sep snapshot.

---

## 13 Sep 2026 — production `ironwork.app` (no Resend key in that agent)

Pass:

- Browser sign-in with the same tester shop
- Invoice #0001 loads (Downloaded, not sent)
- `GET /api/pdf/health` and `GET /api/webhooks/docuseal` from the signed-in browser → 200 `{"ok":true}`

Failed:

- Email-only **Send Invoice** → Cloudflare **502** HTML (`ironwork.app | 502: Bad gateway`, error 502ku, ~15:08 UTC). UI fallback: **Could not send invoice** (no JSON `error` field). `issued_at` unchanged.

`curl` to `ironwork.app` without a real browser hits the Cloudflare challenge (403).

---

## 13 Sep 2026 — local Send Invoice with Resend configured (other session)

Same shop, local `http://127.0.0.1:3000`, invoice #0001, email-only send.

- `POST /api/invoices/b217388a-1519-47d8-9272-83fdb5eb10e2/send` → **502**
- Body: `{"error":"Could not send invoice email."}`
- UI: **Could not send invoice email.**
- `issued_at` still null

That 502 is the app’s Resend-API failure (not the missing-key 503). Resend did not accept the send. Customer address is `@example.com` (no real inbox). `RESEND_FROM_EMAIL` must be a verified Resend domain; until the domain is verified, Resend often only allows sending to the Resend account owner.

---

## 13–14 Sep 2026 — Stripe Connect KYC on production (other session)

Pass:

- Profile Stripe section: **Setup in progress** / **Continue Stripe setup**
- Redirect to Stripe Express test onboarding (test-mode hosted form)

Failed / not finished:

- Automated browser could not complete Stripe CAPTCHA / phone step. Stripe: **Something went wrong. Please try again.** Profile remained **Setup in progress**, not **Connected**.
- Payment-link UI still hidden: **Want to accept online payments? Connect Stripe to send invoices with payment links.**
- No payment link created, no send-with-link, no paid webhook.

---

## What is left

1. **Invoice email that actually sends** — Resend 2xx, invoice `issued_at` set, UI leaves Downloaded-only. Diagnose the local 502 (`Could not send invoice email.`) from Resend (unverified from-domain, recipient restrictions, or bad key). Then retry production send (that path was a Cloudflare 502 HTML, not the JSON Resend error).
2. **Human Stripe Connect KYC** on the tester shop (CAPTCHA blocked automation). Until `charges_enabled`, skip payment links.
3. **Send invoice with payment link** — create link, email includes URL, customer can open Checkout.
4. **Stripe paid webhook** — test-mode pay → `payment_status=paid` / `paid_at` → Paid on home / work-order UI.
5. **Customer DocuSeal signing UI** — WO send already worked; billing used **offline sign**. Nobody completed the signer email/link. CO was offline-signed only (`esign_status=not_sent`).

Optional / not MVP blockers: Umami (`VITE_UMAMI_WEBSITE_ID`), Sentry, a real customer mailbox (not `@example.com`).
