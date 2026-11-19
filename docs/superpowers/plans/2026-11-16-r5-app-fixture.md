# R5 Part 1: App Fixture, Signed-in Audits, Workflow Checks — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A dependency-free app fixture with a login, two roles and a disposable backend. `audit-cli` can audit signed-in screens, and refuses to grade the wrong one. Three Playwright workflow checks each pass on the reference app and fail on a broken variant.

**Architecture:**
- `tests/app/server.mjs` serves server-rendered pages, a JSON API and test-only routes from in-memory data.
- `audit-cli.mjs` gains `--cookie` and `--expect-text`, plus an identity check inside `withPage`.
- `tests/workflows/checks.mjs` drives the UI by accessible name and label, then checks the backend through the test routes.
- `tests/app.test.mjs` proves each check against the reference app and its broken variant.

**Tech Stack:** Node 24 ESM with `node:` modules only (app and CLI), Playwright 1.64.1 (an existing devDependency, used only by the tests and checks), and `node:test`.

**Spec:** `docs/superpowers/specs/2026-11-15-r5-app-fixture-design.md`

## Global Constraints

- No new dependencies.
- The app uses only `node:` modules. It makes no network request outside itself: no Tailwind CDN, inline CSS only.
- `skills/enterprise-admin-ui/scripts/audit.js` and `skills/enterprise-admin-ui/SKILL.md` are unchanged.
- **Data:** 60 orders, `SO-1001` to `SO-1060`, from a fixed table. There is no randomness and no `Date.now` in the data. Exactly 23 are `Pending`, and the rest are `Confirmed`, `Shipped` or `Cancelled`. Page size is 20.
- **Users:** `lan` is the `admin` and shows as "Lan · Admin"; `minh` is the `viewer` and shows as "Minh · Viewer". Both passwords are `test`.
- **Header text:** `Signed in as <Name> · <Role>`.
- **Variants:** `'reference' | 'loses-input' | 'no-permission-check' | 'page-only-select-all'`.
- **Injected failure:** a 500 with `{ "message": "The server could not save the order. Try again." }`.
- **Setup-failure messages:**
  - `Setup: redirected to <final path> — sign in first (--cookie), or audit the page it redirected to`
  - `Setup: "<text>" not found on <path> — wrong user, role or page`
- A check result is `{ workflow, status: 'pass' | 'fail', problems: string[], evidence: string[] }`.
- Commit messages and PR text carry no Claude or Claude Code attribution of any kind.
- Run `npm test` alone. Never overlap browser test runs on this machine; overlapping runs fail spuriously.

## Review Focus

1. **State leaking between checks or tests.**
   - Every check calls `POST /__test/reset` first.
   - Each test file starts its own app on port 0.
   - Task 4 runs the three checks in sequence on one app, then in a different order, and expects the same results.
2. **A signed-in audit whose cookie misses the `--states` or `--checks` tabs.**
   - Task 2 asserts that `--checks --require search` passes with an admin cookie on `/orders`.
   - Without the cookie, the same run is a setup failure.
3. **A false redirect setup failure.**
   - A trailing-slash difference or a query string must not count as a redirect.
   - The existing "a redirect is followed and the final page audited" test must still pass.
   - Task 2 unit-tests the path comparison.
4. **A check that passes for the wrong reason,** for example W3 when nothing was cancelled. Every check asserts the server state with literal counts: 23 cancelled, 37 unchanged. Every check has a failing variant test (Task 4).
5. **Flaky waits.** The checks wait on network responses or on visible state with explicit timeouts, never on fixed sleeps. Task 4 runs the suite twice.

---

### Task 1: Fixture app backend, auth, test routes and page shell

**Files:**
- Create: `tests/app/server.mjs`, `tests/app/data.mjs`
- Test: `tests/app.test.mjs` (backend part, `fetch` only, no browser)

**Interfaces:**
- Produces:
  - `startApp({ port = 0, variant = 'reference' } = {}) → Promise<{ url: string, close(): Promise<void> }>`.
  - `seedOrders(): Order[]` from `data.mjs`.
  - A standalone run: `node tests/app/server.mjs [--variant v]` prints the URL.
- Produces the routes exactly as the spec's route table lists them:
  - `GET/POST /login`, `POST /logout`;
  - `GET /orders` and `GET /orders/:id/edit`, which 302 to `/login?next=<path>` without a session;
  - `GET /api/orders`, `PUT /api/orders/:id` (200, 400, 403, 409, 500), `POST /api/orders/bulk-cancel`;
  - `POST /__test/reset`, `POST /__test/fail`, `GET /__test/orders`, `POST /__test/session`.
- Produces a page shell for signed-in pages. It has a header with `Signed in as <Name> · <Role>` and a `<main>` that Task 3 fills. Task 2's identity tests need only the shell.
- In the `no-permission-check` variant, the server skips the role check on `PUT` and bulk-cancel.

- [ ] **Step 1: Write the failing tests** in `tests/app.test.mjs`. Start the app in `before` and close it in `after`.
  - `seedOrders()` has 60 rows, and 23 of them are Pending.
  - `GET /orders` with no cookie → 302, Location `/login?next=%2Forders`.
  - `POST /__test/session {user:'lan'}` gives a cookie. `GET /orders` with it → 200, and the body contains `Signed in as Lan · Admin`.
  - `GET /api/orders?status=Pending&page=1` → `total` 23, `rows.length` 20.
  - `PUT` as the viewer → 403. `bulk-cancel` as the viewer → 403. The data is unchanged.
  - `PUT` with a stale `version` → 409.
  - `POST /__test/fail {method:'PUT', path:'/api/orders/SO-1005'}`: the next `PUT` → 500 with the exact message, and the one after → 200.
  - `bulk-cancel {filter:{status:'Pending'}}` as admin → `{changed: 23}`. Then reset restores the seed.
  - A `no-permission-check` app: the viewer's `PUT` → 200.
- [ ] **Step 2: Run them.**
  Run: `node --test tests/app.test.mjs`
  Expected: FAIL, because the module is missing.
- [ ] **Step 3: Implement `data.mjs` and `server.mjs`.** Use `node:http` and `node:crypto` (`randomUUID` for the session id). Read JSON bodies with a size cap. Unknown routes → 404.
- [ ] **Step 4: Run the tests.**
  Run: `node --test tests/app.test.mjs`
  Expected: PASS.
- [ ] **Step 5: Commit.**
  `git commit -m "test(app): fixture app with login, two roles, a disposable backend and test routes"`

### Task 2: `audit-cli` signed-in mode

**Files:**
- Modify: `skills/enterprise-admin-ui/scripts/audit-cli.mjs`: `parseCli`, `withPage`, `auditTargets` and `main`, plus `HELP` and the header comment.
- Test: `tests/audit-cli-unit.test.mjs`, `tests/audit-cli.test.mjs`

**Interfaces:**
- Consumes: `startApp` from Task 1, in `tests/audit-cli.test.mjs`.
- Produces:
  - `parseCli` returns `cookies: string[]` and `expectText: string[]`, both empty by default.
  - A cookie is `name=value` with a non-empty name; anything else is a `UsageError`.
  - `--cookie` with any non-http(s) target is a `UsageError`.
- Produces: `export function samePath(requested: string, final: string): boolean`. It compares URL pathnames, ignores one trailing slash and ignores query and hash.
- Produces: `withPage(browser, url, { …, cookies = [], expectText = [] }, work)`.
  - Before navigating, it calls `Network.setCookie` for each cookie, with `url` set to the target URL.
  - When either list is non-empty: after load it throws the redirect setup error if `!samePath(url, finalUrl)`. After settling, it throws the not-found setup error for the first missing text.
  - `auditTargets` and every states and checks tab pass both lists through.

- [ ] **Step 1: Write the failing tests.**
  - **Unit:** `parseCli` with the flags and their errors. `samePath`: `('/orders', '/orders/') → true`; `('/orders', '/orders?x=1') → true`; `('/orders', '/login') → false`.
  - **End to end**, with an app started in `before`:
    - `/orders` with `--expect-text "Signed in as"` and no cookie → exit 2, and the output matches `/Setup: redirected to \/login/`.
    - With the admin cookie and `--expect-text "Signed in as Lan · Admin"` → the page `error` is null.
    - With the viewer cookie and `--expect-text "Lan · Admin"` → exit 2, `/Setup: "Lan · Admin" not found/`.
    - With the admin cookie, `--checks --disposable --require search` → the search status is not a setup error. The page shell has a search box after Task 3, so assert only that there is no setup error, and leave `pass` to Task 3.
    - The existing redirect test is unchanged and still passes.
- [ ] **Step 2: Run them.**
  Run: `node --test tests/audit-cli-unit.test.mjs` and `node --test --test-name-pattern="signed-in|Setup" tests/audit-cli.test.mjs`
  Expected: FAIL. The flags are unknown, and `samePath` is not exported.
- [ ] **Step 3: Implement.** The final URL comes from the main frame's last Document response. `HELP` gains both flags, the identity rule, and the note "test sessions only: command lines are visible to other local processes".
- [ ] **Step 4: Run the focused tests, then `npm test` alone.**
  Expected: PASS, and 0 fail overall.
- [ ] **Step 5: Commit.**
  `git commit -m "feat(audit-cli): --cookie and --expect-text; a login redirect or wrong user is a setup failure, not a graded page"`

### Task 3: Reference UI pages and variants

**Files:**
- Modify: `tests/app/server.mjs`, or create `tests/app/pages.mjs` (builder's call).
- Test: `tests/app.test.mjs` (page-level tests) and `tests/audit-cli.test.mjs` (the reference audit).

**Interfaces:**
- Produces the reference UI exactly as the spec's "Reference UI" describes. These names and labels are a contract, and Task 4's `CONTRACT.md` copies them:
  - the label "Status" on a select;
  - a search box;
  - the text "N orders";
  - the checkbox labelled "Select all on this page";
  - the button "Select all N matching";
  - the button "Cancel orders";
  - an alertdialog whose confirm button is "Cancel N orders";
  - the fields "Customer", "Note" and "Status";
  - the button "Save order";
  - `role="alert"` on errors;
  - `role="status"` with "Order SO-xxxx saved".
- Produces the client parts of the variants:
  - `loses-input`: the failure path clears the fields.
  - `no-permission-check`: the bulk button is shown to the viewer.
  - `page-only-select-all`: the "all matching" mode sends the page's ids.

- [ ] **Step 1: Write the failing tests.**
  - `tests/app.test.mjs`, with Playwright: as admin, `/orders` shows "60 orders"; filtering by Pending shows "23 orders"; the viewer has no "Cancel orders" button; `/orders/SO-1005/edit` shows the three labelled fields.
  - `tests/audit-cli.test.mjs`: the admin-cookie audits of `/orders` (`--type list`) and `/orders/SO-1005/edit` (`--type form`) have no ✗ error (`severity === 'error'`), and `--checks --disposable --require search` on `/orders` → search `pass`.
- [ ] **Step 2: Run them.**
  Expected: FAIL, because the shell has no UI.
- [ ] **Step 3: Implement the pages with inline CSS.** No external requests.
- [ ] **Step 4: Run the focused tests, then `npm test` alone.**
  Expected: PASS. If an `audit.js` rule conflicts with the contract, change the UI. If that is impossible, report it in the report and do not hide it.
- [ ] **Step 5: Commit.**
  `git commit -m "test(app): reference orders list and edit form that follow the skill, and broken variants"`

### Task 4: Workflow checks, contract and proof

**Files:**
- Create: `tests/workflows/checks.mjs`, `tests/workflows/CONTRACT.md`
- Test: `tests/app.test.mjs` (the workflow part)

**Interfaces:**
- Consumes: `startApp({ variant })` from Task 1, and the contract from Task 3.
- Produces: `export async function inputKept(ctx)`, `permissionBoundary(ctx)` and `selectAllMatching(ctx)`.
  - `ctx` is `{ url: string, browser: import('playwright').Browser }`.
  - Each returns the result shape from the Global Constraints.
  - Each resets first, creates its own context, signs in with `/__test/session`, and closes its context.
- Produces: `export const WORKFLOWS = [inputKept, permissionBoundary, selectAllMatching]`.

- [ ] **Step 1: Write the failing tests.**
  - On `reference`, each check → `status: 'pass'`, `problems: []`.
  - On each check's variant, that check → `fail`, with a literal problem:
    - `loses-input` → W1 problem matches `/Customer .* cleared|kept/i`;
    - `no-permission-check` → W2 problem matches `/Cancel orders/` or `/403/`;
    - `page-only-select-all` → W3 problem matches `/23/` and `/20/`.
  - W3 on `reference` reports in `evidence`: 23 cancelled, 37 unchanged.
  - Run all three checks in the order W3, W1, W2, and expect the same statuses (Review Focus 1).
- [ ] **Step 2: Run them.**
  Run: `node --test tests/app.test.mjs`
  Expected: FAIL, because `checks.mjs` is missing.
- [ ] **Step 3: Implement the checks** with the spec's steps.
  - Locate everything with `getByRole` or `getByLabel`.
  - Wait on `page.waitForResponse` or on visible state.
  - Write `CONTRACT.md`, listing each check's names, labels, roles and the server state it reads.
- [ ] **Step 4: Run the tests.**
  Run: `node --test tests/app.test.mjs` twice, then `npm test` alone.
  Expected: PASS on both runs, and 0 fail overall.
- [ ] **Step 5: Commit.**
  `git commit -m "test(workflows): input-kept, permission-boundary and select-all-matching checks, each proven on a broken variant"`

### Task 5: Docs

**Files:**
- Modify: `CHANGELOG.md` (Unreleased)

- [ ] **Step 1: Add the CHANGELOG entries.**
  - **Added:** `--cookie` and `--expect-text`, with the setup-failure rule and exit 2.
  - **Added (dev):** the app fixture and workflow checks, and how to run them (`node tests/app/server.mjs`, `node --test tests/app.test.mjs`).
- [ ] **Step 2: Verify.**
  Run: `npm run check:adapters && npm test` (alone), then `git diff main -- skills/enterprise-admin-ui/scripts/audit.js skills/enterprise-admin-ui/SKILL.md`.
  Expected: the adapters match, 0 fail, and the `git diff` output is empty.
- [ ] **Step 3: Commit.**
  `git commit -m "docs: CHANGELOG for signed-in audits and the app fixture"`
