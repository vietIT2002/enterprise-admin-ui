# Next.js guidance that depends on the project's config (roadmap R2)

Status: proposed, 2026-11-10. Small change.

## Why

SKILL.md and `references/react-shadcn.md` state Next.js build rules as if they held for every project. An agent following them may give wrong advice or rewrite a server page that already works.

The Next.js docs (updated 2026-10-15) and the 16.4 release notes (2026-10-06) say:

- `cacheComponents` has been a `next.config` flag since 16.0. Since 16.4, `create-next-app` turns it on for new apps; upgraded apps keep their setting. Next 17 is to turn it on everywhere and remove the flag.
- With the flag on, awaiting `params` or `searchParams` in a Page with no `<Suspense>` above it fails `next build` ("Uncached data was accessed outside of `<Suspense>`"). A `loading.js` in the segment, or a Suspense boundary higher up, is a valid fix.
- With the flag off, awaiting `searchParams` makes the page dynamic, and the build passes.

So:

- The reference's "New Next 16 apps turn on `cacheComponents`" is close for 16.4+, but it does not say that the setting decides.
- SKILL.md's "a page that awaits `searchParams` fails `next build`" is wrong unless the flag is on and nothing above the page suspends.

## Goals

- An agent reads the installed `next` version and `next.config.*` before applying version-specific advice.
- The text states the exact failure condition and lists the valid fixes. The fixes are:
  - a client component reading `useSearchParams()` under `<Suspense>`;
  - an async child awaiting the promise under `<Suspense>`;
  - `loading.tsx`;
  - `generateStaticParams` for `params`.
- A server page that already builds is kept as it is.
- SKILL.md and the reference agree.
- The reference carries a source link and the date and version it was checked against.
- A build fixture backs each claim. It can be re-run when Next changes.

## Non-goals

- Other framework guidance, such as React Router or nuqs.
- An agent-behaviour evaluation (old vs new text). It belongs to R5's evaluation harness; this change is checked by build results and review.
- Adding Next.js to the root `devDependencies`, or to `npm test`.

## Approaches considered

1. Fix the text and build once outside the repo. This is fast and adds nothing to the repo, but nothing warns when Next changes.
2. **Chosen:** fix the text, and add a small fixture in the repo with its own pinned `package.json`. It runs through `npm run check:next`, not `npm test`, and CI runs it manually or on a schedule. This keeps `npm test` fast and the skill free of dependencies, and it matches the roadmap. Its cost is the fixture's `node_modules` (over 100 MB) and about a minute per build.
3. Like 2, but CI runs the fixture on every push. This is the safest option, but it makes every CI run much slower.

## Design

**Text**

- **SKILL.md, States → Mock data (line 143).** Replace the absolute claim with a short conditional, within about the same length:
  - check `cacheComponents` in `next.config`;
  - with it on, a page that awaits `searchParams` needs a `<Suspense>` boundary above it (`loading.tsx` counts), or `next build` fails;
  - reading `?state=` in a client component under `<Suspense>` works in both modes, as the reference shows;
  - keep a server page that already builds.
- **`react-shadcn.md`, Setup, "Next.js App Router" bullet.**
  - Rewrite it: first check the version and `cacheComponents`, then the condition and the fixes (above).
  - Note that `useSearchParams()` in a client component needs `<Suspense>` in a prerendered route, whichever way the flag is set (if the fixture confirms it).
  - Keep "run `next build`; `tsc` and `eslint` pass either way".
  - Add "checked 2026-11 against next 16.4.x" with links to the `cacheComponents` and `blocking-route` docs.
- **`filters-search.md` line 171.** Unchanged, unless the fixture contradicts it.
- **CHANGELOG, Unreleased, Fixed.** One entry.

**Fixture:** `tests/next-build/`.

- `package.json` (private) pins exact versions of `next` (16.4.6, the current latest), `react` and `react-dom`, and has its own lockfile. The pages are plain `.jsx`, so TypeScript is not needed: the failures are build-time rendering errors, not type errors.
- Each case is a small route source. `tools/check-next-build.mjs` writes the cases into the fixture's `app/`, sets `cacheComponents` (and `partialPrefetching`, as the docs ask) in `next.config.mjs`, runs `next build`, and checks the result against the expectations. Failing cases must also match the expected error text. It prints a table of case × mode → expected/actual, and exits 1 on any mismatch.
- Cases:

  | Case | Flag on | Flag off |
  |---|---|---|
  | page awaits `searchParams`, nothing suspends | fail (next 16.4.6: "Next.js encountered uncached or runtime data during prerendering") | pass |
  | same, plus `loading.jsx` | pass | pass |
  | sync page, `<Suspense>` around a client component using `useSearchParams()` (the skill's pattern) | pass | pass |
  | sync page, `<Suspense>` around an async child awaiting `searchParams` | pass | pass |
  | client component using `useSearchParams()` with no Suspense, prerendered route | fail (16.4.6: "Next.js encountered URL data `useSearchParams()` in a Client Component outside of `<Suspense>`") | fail (16.4.6: "`useSearchParams()` should be wrapped in a suspense boundary") |

- The passing cases share one build per mode. Each expected failure gets a build of its own, so one failing route cannot hide another. That is about five builds in all.
- Root `package.json` gets `"check:next": "node tools/check-next-build.mjs"`. `--next <version>` overrides the pinned version (it installs into a temporary copy).
- `.gitignore` adds the fixture's `node_modules/`, `.next/` and generated `app/`.

**CI:** `.github/workflows/next-build.yml`.

- On `workflow_dispatch`, it runs against the pinned version.
- A weekly `schedule` runs it against `next@latest`. A failure there means the guidance needs re-checking, for example when Next 17 changes the flag.
- It is not part of `ci.yml`.

## Builder's calls

- The exact wording within the length limits.
- The script's internal structure, and how it captures build output.
- The Node version in the workflow; match `ci.yml`.
- If a case's real result differs from the table, the result wins. The text then states what the build actually does, and the table in this doc is updated.

## Done when

- `npm run check:next` passes on Windows (locally) against next 16.4.6, with every case matching.
- `npm test` and `npm run check:adapters` still pass.
- SKILL.md and the reference state compatible conditions, and nothing in either says that awaiting `searchParams` always fails.
