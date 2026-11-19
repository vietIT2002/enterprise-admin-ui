# An authenticated app fixture, signed-in audits and workflow checks (roadmap R5, part 1)

Status: proposed, 2026-11-15. Project-sized. Agent evaluation is part 2, a separate design.

## Why

The skill is measured today on single-file pages with mock data. The workflows that matter most in admin apps can only be checked against a server with data and roles. Three such workflows are:

- keeping input when a save fails;
- refusing an action to a role that may not take it;
- applying a bulk action to exactly the records that match.

A page behind a login also cannot be audited reliably today. `audit-cli` opens a fresh browser context without a session, follows redirects, and audits whatever page it lands on. A login screen would be graded as if it were the requested screen.

Part 1 builds the tools. Part 2 uses them to compare agents with and without the skill.

The tools are:
- a small app with a login, two roles and a disposable backend;
- the ability for `audit-cli` to audit a signed-in screen, and to refuse to grade the wrong one;
- deterministic checks for the three workflows, which also fail on broken variants of the app.

## Goals

- **Fixture app.** It has no dependencies and runs on Node's `http`. Its data is deterministic, in memory, and reset per test. There are two users, an admin and a viewer. There is an orders list and an order edit form. Test-only routes inject failures, read the raw data and create sessions. No production credentials exist anywhere.
- **Signed-in audits.**
  - `audit-cli` accepts `--cookie name=value` (repeatable) and `--expect-text <text>` (repeatable).
  - When either is given, a redirect to a different path, a missing expected text, or an HTTP error is reported as a **setup failure**: an error with exit 2 and a message that names what went wrong. It is never graded.
  - Without these flags, today's behaviour is unchanged, including following redirects.
- **Workflow checks.** Three checks drive the UI the way a person would, with Playwright (already a devDependency), and then check the backend's state:
  - **W1 input kept:** a failed save keeps every edited value and shows an error in `role="alert"`. A retry then saves the values.
  - **W2 permission boundary:** the viewer gets no enabled bulk Cancel action in the UI, and the API answers 403 to the viewer's update and bulk requests. The data is unchanged.
  - **W3 scope:** with a status filter, "Select all N matching" followed by bulk Cancel changes exactly the N matching orders on the server, and no others. N comes from the server.
- **The checks are proven.** Each check passes on the reference app and fails on a broken variant of it:
  - **W1:** the failure path clears the fields.
  - **W2:** the UI shows Cancel to the viewer and the server skips its role check.
  - **W3:** "all matching" sends only the current page's ids.
- **UI contract.** Each check finds controls by accessible name or label, not by ids. This is so later agent-built UIs can be graded. The contract is written down.

## Non-goals (part 2 or later)

- Agent A/B evaluation, token or duration accounting, and human review.
- Concurrent edit, export and session-expiry workflows. The API keeps a `version` on each order, so a conflict check can be added later.
- Real authentication security: password hashing, CSRF, rate limits. This is a test fixture on localhost.
- Changing `audit.js` or the SKILL.md word budget. The new flags are documented in `--help` and the CHANGELOG, not SKILL.md.

## Approaches considered

1. **Chosen: Playwright workflow checks in `tests/`, and a minimal signed-in mode in `audit-cli`.** The shipped CLI only gets two flags and an identity check. The heavier workflow driving lives in dev tooling, which already depends on Playwright. This matches the roadmap's "a separate authenticated test adapter if that avoids complicating the dependency-free audit CLI".
2. **Everything in the dependency-free `audit-cli`, over raw DevTools Protocol.** There would be a single tool, but the shipped script would grow by several hundred lines of workflow driving that users never need.
3. **Fixture and Playwright checks only, with no `audit-cli` change.** This is the least work, but `audit-cli` would still grade a login page as the requested screen. That leaves R5's "login redirects are reported as an evaluation setup failure" unmet for the tool users actually run.

## Design

### Fixture app: `tests/app/`

**`server.mjs`** exports `startApp({ port = 0, variant = 'reference' }) → Promise<{ url, close() }>`.
- It also runs standalone with `node tests/app/server.mjs`, which prints the URL.
- `variant` is `'reference' | 'loses-input' | 'no-permission-check' | 'page-only-select-all'`.
- It only uses `node:` modules.

**Data**
- 60 orders, from a fixed seed table in the file, so there is no randomness.
- Fields: `id` (`SO-1001`…), `customer`, `status` (`Pending`, `Confirmed`, `Shipped`, `Cancelled`), `total` (integer VND), `orderDate`, `note`, `version`.
- 23 orders are Pending, which is more than one page of 20, so W3 is meaningful.
- The data lives in memory and is rebuilt by `POST /__test/reset`.

**Users and sessions**
- Users: `lan` (role `admin`) and `minh` (role `viewer`). The password for both is `test`, and it is never used outside this fixture.
- Login sets a cookie, `sid=<random>; HttpOnly; Path=/; SameSite=Lax`. Sessions live in memory.

**Routes**

| Route | Behaviour |
|---|---|
| `GET /login`, `POST /login`, `POST /logout` | A login form, which redirects to `next` (or `/orders`) after success. |
| `GET /orders`, `GET /orders/:id/edit` | Signed-in pages. Without a session, they 302 to `/login?next=<path>`. |
| `GET /api/orders?status=&q=&page=&size=20` | Returns `{ rows, total }`. |
| `PUT /api/orders/:id` | Body `{ customer, note, status, version }`. Answers 200 with the saved order, 400 `{ errors: { field: message } }`, 403 for a viewer, 409 when the version is stale, or 500 when a failure is injected. |
| `POST /api/orders/bulk-cancel` | Body `{ ids }` or `{ filter: { status, q } }`. Answers 200 `{ changed }`, or 403 for a viewer. |
| `POST /__test/reset` | Rebuilds the data and clears injected failures. |
| `POST /__test/fail` | Body `{ method, path, times = 1 }`. The next `times` matching requests answer 500 `{ message: "The server could not save the order. Try again." }`. |
| `GET /__test/orders` | Returns the raw data. |
| `POST /__test/session` | Body `{ user }`. Returns `{ cookie: "sid=…" }`. |

Test routes exist in every variant. The fixture is never deployed.

**Reference UI**
- It is server-rendered HTML, with an inline script that calls the JSON API. It follows the skill: header, filters, count, states, sticky Save bar, confirmation dialog.
- It is styled with **plain CSS inline in the page, with no Tailwind CDN and no network request outside the fixture**. The workflow checks and the `audit-cli` tests must then run offline. This avoids the CDN stall and the "Tailwind CDN did not load" setup error. `audit.js` measures computed styles, so plain CSS audits like any other page. (Decided after the builder check.)
- Every signed-in page shows `Signed in as <Name> · <Role>` in the header: "Signed in as Lan · Admin" or "Signed in as Minh · Viewer".
- **`/orders`:**
  - A Status filter (a select labelled "Status") and a search box. A count, "N orders".
  - A row checkbox per order, and a header checkbox with the label "Select all on this page".
  - After a page is selected, a bar offers a button "Select all N matching".
  - A bulk "Cancel orders" button. It opens an alertdialog that names the count, and its confirm button is labelled "Cancel N orders".
  - The viewer does not get the bulk button.
- **`/orders/:id/edit`:**
  - Fields labelled "Customer", "Note" and "Status".
  - A "Save order" button.
  - Server errors show next to the field, or in a `role="alert"` banner.
  - A failed request keeps every value.
  - Success shows "Order SO-xxxx saved" in `role="status"`.
  - The viewer sees the form read-only, and the API refuses the viewer's saves anyway.

**Variants** change only the behaviour named:
- `loses-input`: the client's failure path clears the fields.
- `no-permission-check`: the viewer is shown the bulk button, and the server skips its role check on `PUT` and bulk-cancel.
- `page-only-select-all`: "Select all N matching" sends the current page's ids instead of the filter.

### Workflow checks: `tests/workflows/`

**`checks.mjs`** exports three functions, each `async (ctx) → { workflow, status: 'pass' | 'fail', problems: string[], evidence: string[] }`.
- `ctx` is `{ url, browser }`: the app URL and a Playwright `Browser`.
- Each check creates its own context and signs in through `POST /__test/session`.
- Each check calls `POST /__test/reset` first, and checks `/__test/orders`.

| Check | Steps (by accessible name or label) | Pass when |
|---|---|---|
| **W1 `inputKept`** | Sign in as admin. Open `/orders/SO-1005/edit`. Set Customer and Note to new values. Inject a failure for `PUT /api/orders/SO-1005`. Click "Save order". Wait for `role="alert"`. Then click "Save order" again. | After the failure: both fields still show the new values, the alert text is non-empty, and the server data is unchanged. After the retry: the server has both new values, and `role="status"` names the order. |
| **W2 `permissionBoundary`** | Sign in as viewer. Open `/orders`. Look for a button named /Cancel orders/i. Then call `PUT /api/orders/SO-1001` and `POST /api/orders/bulk-cancel` with the viewer's cookie. | No enabled "Cancel orders" button is visible; both API calls answer 403; the server data is unchanged. |
| **W3 `selectAllMatching`** | Sign in as admin. Open `/orders`. Choose Status "Pending" in the "Status" select. Check "Select all on this page". Click "Select all N matching". Click "Cancel orders", then the dialog's "Cancel N orders". | N in the button equals the number of Pending orders on the server (23). Afterwards exactly those 23 are Cancelled and every other order is unchanged. |

**`CONTRACT.md`** lists every name, label and role the checks rely on, so a later agent-built UI knows what it is graded on.

### `audit-cli` signed-in mode

**Flags**
- `--cookie <name=value>` (repeatable). For each target URL, the cookie is set with `Network.setCookie` (the `url` is the target) in that tab's browser context before navigating. It is applied to every tab: the audit, the states and the checks. A `file:` target with `--cookie` is a `UsageError`.
- `--expect-text <text>` (repeatable). After load and settle, the page's visible text (`document.body.innerText`) must contain each text.

**Identity check** (only when either flag is given)
- The final document URL's pathname must equal the requested pathname, ignoring one trailing slash.
- Failures:
  - A redirect gives the error `Setup: redirected to <final path> — sign in first (--cookie), or audit the page it redirected to`.
  - A missing text gives `Setup: "<text>" not found on <path> — wrong user, role or page`.
  - An HTTP status of 400 or higher keeps today's error.
- Every setup failure is a page error, which exits 2, and nothing is graded for that page. The check runs on the page itself and on each `--states` and `--checks` tab.

**Docs**
- `--help`, the header comment and the CHANGELOG.
- The help text says the cookie belongs to a test session, because command lines are visible to other local processes.

### Tests

- **`tests/app.test.mjs`** (Playwright Chromium, like `audit-fixtures.test.mjs`):
  - each check passes on the reference app;
  - each check fails on its variant, with a literal problem;
  - the app's 302 for a signed-out page;
  - 403 for the viewer;
  - reset restores the seed data.
- **`tests/audit-cli.test.mjs`** additions, against `startApp()`:
  - `/orders` without `--cookie` but with `--expect-text "Signed in as"` → exit 2, "redirected to /login".
  - With an admin cookie and `--expect-text "Signed in as Lan · Admin"` → audited, no error.
  - With the viewer's cookie and `--expect-text "Lan · Admin"` → exit 2, "not found".
  - With an admin cookie, `--checks --disposable --require search` → `search` passes. This shows the cookie reaches the check tabs.
  - The existing "a redirect is followed and the final page audited" test still passes, because it uses no new flags.
- **Unit tests:** `parseCli` for both flags, including the `file:` + `--cookie` error.
- **Reference UI audit:** `audit-cli` on `/orders` and on `/orders/SO-1005/edit` with an admin cookie has no ✗ errors, so the reference follows the skill.
  - If an `audit.js` rule conflicts with the markup the workflow contract fixes, the UI gives way and the contract stays fixed. (Decided after the builder check.)
  - A conflict that cannot be resolved that way is reported, not hidden with a flag.

## Builder's calls

- The app's internal structure: one file, or a server plus page modules.
- The exact page markup and copy, within the contract above.
- How the reference UI renders: server-rendered rows or client-rendered from the API.
- Playwright usage details: `waitFor` strategy and timeouts.
- How `tests/app.test.mjs` shares one browser across checks.

## Done when

- Every goal has a passing test.
- `npm test` passes, run alone. CI passes.
- `audit.js` and SKILL.md are unchanged.
- No production credentials, external services or new dependencies.
- Commits and PR text carry no Claude or Claude Code attribution.
