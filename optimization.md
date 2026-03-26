# ScopeLock — Optimization Tracker

Code review findings, status, and rationale for each change.

---

## Refactor Safety

All structural changes (App.tsx extraction, CSS splitting) must be done with the current test suite in place and passing. The agreement generator and PDF payload tests are not optional — they are the regression guardrail for document output during refactors. Do not begin structural work without running `npm test` first and keeping it green throughout.

---

## Priority Order

1. ✅ Tests (done)
2. ✅ App.tsx state extraction (done)
3. 🧩 CSS split
4. 🧼 HTML escape utility

---

## Done

### Tests — agreement generator + PDF payload contract
**Files:** `src/lib/__tests__/agreement-generator.test.ts`, `src/lib/__tests__/pdf-payload.test.ts`
**Coverage:** 68 tests across both files; 0 failures.

The agreement generator is core product IP. It conditionally includes/omits legal sections (exclusions, warranty, dispute resolution, change orders, hidden damage) based on job data. A silent regression here — a section appearing when it shouldn't, or vice versa — produces a broken legal document. That is expensive to catch after the fact, especially once clients are signing things.

The PDF payload tests protect the contract between the client and `/api/pdf`. As e-sign and payment flows are added, the payload shape will be touched. These tests will catch drift before it reaches production.

These tests validate behavior, not implementation, ensuring refactors to UI or data flow cannot silently alter document output.

Vitest was added as a dev dependency. `vite.config.ts` uses `import { defineConfig } from 'vitest/config'` so the `test: { environment: 'node' }` block type-checks under `tsc -b`. `App.css?raw` is stubbed via `vi.mock` in the payload test file (Vite's raw suffix isn't available in the Node runner).

### App.tsx — navigation, auth/profile, grouped flow state
**Files:** `src/hooks/useAppNavigation.ts` (~61 lines), `src/hooks/useAuthProfile.ts` (~189 lines), `src/App.tsx` (~672 lines; previously ~784)

`useAppNavigation` owns `view`, `pushState`/`popstate`, `navigateTo`, and `replaceView` (used after PDF capture and on auth success). `useAuthProfile` wraps `useAuth`, profile fetch/`loadProfile`/`setProfile`, and post-capture `sessionStorage` + `visibilitychange` redirect; it receives `replaceView` and `setWorkOrdersSuccessBanner` from App so redirects stay consistent. Invoice flow, change-order flow, and draft state (job, unsaved modal, WO counter persist error) are grouped into object `useState` values in App. The full view-switching JSX remains in `App.tsx`.

---

## To Do

### 1. Split App.css
**Priority: Medium**
**Current size: 3,474 lines**

A single 3,474-line stylesheet means every UI change requires mentally scanning a large global surface. It also makes it easy to accidentally break unrelated components with a selector that's broader than intended.

**What to do:**
- Co-locate styles with components. Move `.job-form-*` rules to a `JobForm.css`, `.invoice-*` to `InvoiceWizard.css`, `.co-*` to `ChangeOrderWizard.css`, etc.
- Keep `App.css` for the design system tokens (`--primary`, `--surface`, etc.), the base layout (`app-header`, `app-main`, `app-footer`), and any truly global rules.
- Do not change class names or selectors during the split — this is a file organization change, not a refactor. Move rules, verify visually, commit.

The payoff: a developer working on the invoice wizard only needs to open one ~200-line file, not scroll through 3,474 lines looking for `.invoice-`.

---

### 2. Extract shared HTML escaping utility
**Priority: Low**
**Affected files:** `src/lib/agreement-sections-html.ts`, `src/lib/change-order-generator.ts`

Both files define an identical `esc()`/`escapeHtml()` function. If a bug were found in the escaping logic (e.g. a missing entity), it would need to be fixed in two places and the second fix could be missed.

**What to do:**
- Create `src/lib/html-escape.ts` exporting a single `esc()` function.
- Replace both inline definitions with an import.

Small change, zero risk, eliminates the duplication permanently. Do this after the App.tsx and CSS work is stable.

---

## Not Doing / Already Done

### README accuracy
The original critique flagged a mismatch where the README described ScopeLock as a static app with no backend. **This is already fixed.** The current README correctly describes the Node server requirement, Chrome/Puppeteer dependency, Supabase auth/DB, and deployment expectations. ARCHITECTURE.md and CLAUDE.md are also accurate. No action needed.
