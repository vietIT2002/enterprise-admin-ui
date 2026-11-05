# Filters and search

Read this when you build the area above a table: search, filters, applied chips, saved views, status tabs, URL state and the no-results state.

## Contents
- [Filter bar anatomy](#filter-bar-anatomy)
- [Live vs Apply](#live-vs-apply)
- [Applied chips](#applied-chips)
- [Saved views and status tabs](#saved-views-and-status-tabs)
- [Search](#search)
- [URL state](#url-state)
- [No-results state](#no-results-state)
- [Code: useListParams and FilterChips](#code-uselistparams-and-filterchips)

## Filter bar anatomy

RED: every generated list lacked at least one of chips, Clear all, or a no-results state, and most put a row of KPI cards above the table (F2). Build the area above the table in this order:

1. Status tabs or saved views with counts (see below).
2. Filter row, left to right:
   - Search field, 280–320px wide, with a search icon and a clear button.
   - Two or three visible filters: the ones used most (status, owner, date range). Promote no more than three [Polaris].
   - A "More filters" button that opens a panel for everything else. The button shows the applied count, "More filters (2)", so hidden filters are never invisible [Carbon, Polaris].
   - On the far right: Columns menu and density toggle, then Import / Export if they are not in the page header.
3. Applied chips row (only when something is applied), ending with "Clear all".
4. The table.

Rules:
- One dropdown filters one category. Never mix categories (status and owner) in one menu [Carbon].
- Each visible filter shows its current value on its trigger ("Status: Late") and a way to clear it.
- Use the right control: multi-select with checkboxes for status, date-range picker for dates, number range for amounts, searchable select (combobox) when a list has more than about 10 options.
- Do not put KPI cards or charts between the header and this bar. Summary figures go into tab counts or one text line above the table ("96 orders · 596.722.000 ₫").
- The whole bar fits one row at 1280px. Wrapping is the sign that too many filters are promoted.

## Live vs Apply

Systems disagree: Fiori updates live, NN/g batches behind Apply when results take over a second, Carbon uses instant for single choices and batch for multi-category or slow data [Fiori, NN/g, Carbon]. Use this split:

| Control | Behaviour |
|---|---|
| Search field | Applies after a short pause (300ms), or on Enter |
| Visible quick filters (single or multi-select, date range) | Apply live on each change |
| "More filters" panel | Apply button at the bottom; Reset in the panel footer; nothing changes behind the panel until Apply |
| Server calls slower than about 1 second | Show a loading state on the table while it refetches; keep the old rows dimmed rather than blank |

- Apply closes the panel, updates the chips and the count on the trigger, and returns focus to the "More filters" button.
- Never mix: if the panel has Apply, its fields do not change the table until pressed.

## Applied chips

- Every applied filter becomes a chip below the filter row, in the same order as the filters.
- Chip text is the value alone when it is unambiguous ("Late"), and "Category: value" when it is not ("Owner: Nguyễn An", "Created: 01/11–04/11/2026") [Polaris].
- Multiple values of one filter become one chip per value or one chip "Status: Late, Shipping"; pick one style for the app.
- Each chip has its own remove button, `aria-label="Remove filter Status: Late"`, at least 24×24px [WCAG 2.5.8].
- "Clear all" is a text button after the last chip, and resets filters and the search term to the defaults of the current view, and keeps sort, view and page size. Show the search term as a chip too ("Search: minh phat") and let Clear all remove it, so the user sees everything applied.
- With many chips, show the first five then "+3 more", which expands the row [Fiori].
- Removing a chip or Clear all keeps focus inside the chip row (move it to the next chip, or to the filter row when none are left).
- Do: chips with remove and Clear all. Don't: filters that change the table but leave no visible trace (F2).

## Saved views and status tabs

- Status tabs sit above the filter bar and show counts that come from the server and respect the other filters: "All 96 · Pending 3 · Shipping 6 · Late 2". Counts are text, not coloured badges. Hide a count when it is unavailable rather than showing 0 [Primer].
- A tab is a one-click preset of the status filter. Selecting a tab sets `status` in the URL.
- Saved views extend this: a view stores filters, sort, visible columns and density. Fiori keeps one default view per user; Polaris shows views as tabs [Fiori, Polaris].
- When the user changes filters on a saved view, the view tab shows a dot or "(modified)" and two buttons appear: "Save" (overwrite) and "Save as…" (new name). Cancel reverts to the saved state [Polaris].
- Views have a rename, duplicate and delete in a tab menu. System views (All, Mine) cannot be deleted; say so in the menu rather than hiding the item.
- Offer "Set as my default view" in the same menu.
- Keep at most 6–7 tabs visible; more go into a "More views" menu.

## Search

- The placeholder names the fields searched: "Search order no., customer, phone". A bare "Search…" tells the user nothing. A placeholder is a hint, not a label, so give the input `aria-label="Search orders"` [NN/g].
- Debounce at 300ms. Cancel the previous request when a new one starts. A search of fewer than 2 characters waits for Enter.
- Vietnamese matching ignores diacritics and case: "nguyen" finds "Nguyễn", "duong" finds "Dương" and "Đường". Normalise both sides with `foldVi` from `@/lib/format` (`data-formatting.md`): it decomposes with NFD, drops the combining marks `\u0300-\u036f`, maps `đ`/`Đ` to `d`/`D` (đ does not decompose) and lower-cases. Do this on the server for server-side search (a normalised column or the database's unaccent function).
- Match anywhere in the searched fields, but rank prefix matches on the identifier first.
- Searching never resets the sort. It resets the page to 1.
- Show the term inside the no-results message: `No orders match "nguyen 0912"`.
- `/` focuses the search field when no input has focus. Like every single-key shortcut it can be turned off [WCAG 2.1.4], and the field stays reachable by Tab and click, so the shortcut is never the only path `[inferred]`. Global command-palette search (Ctrl/⌘+K) is separate from the list's own search [GitHub].

## URL state

Keep filters, search, sort, page, page size and view in the query string, so Back, reload and a shared link restore the exact list `[inferred]`.

- Example: `/orders?status=late&sort=-created_at&page=2`. Multiple values repeat the key: `?status=late&status=shipping`. Search is `q`; view is `view`; page size is `size`.
- `sort` is the API field name in snake case, with `-` for descending: `sort=-created_at`, never `-createdAt`. Omit parameters that equal the default so URLs stay short and a default list has a clean URL.
- Changing any filter, `q` or `size` removes `page`. Changing the sort also removes `page`.
- A change of page, page size, sort, filter or search also clears the row selection (`bulk-import-export.md`).
- Use `router.replace` for typing and quick filters (no history entry per keystroke); use `router.push` for page changes and tab switches so Back works.
- Dates use ISO (`from=2026-11-01&to=2026-11-04`), never the display format.
- Dashboard drill-down links use the same parameters: "7 late shipments" links to `/shipments?status=late` and the list opens with the chip shown (F10).
- Validate params on read: unknown status values are ignored, not rendered; a non-numeric `page` falls back to 1.

## No-results state

RED: no list had a distinct no-results state (F2, F3).

- First use means the entity has no records at all: "No orders yet" and the primary action `Create order`. No filters are applied, so there is no Clear filters button.
- No results means records exist but the filters hide them: "No orders match these filters" (or the search term) and a `Clear filters` button. A hint line lists what to try: "Check the spelling or widen the date range."
- Decide between them with the unfiltered total, not with `rows.length`. If the filters are empty and the total is 0, show first use.
- Keep the filter bar, chips and table header visible so the user can adjust without starting over. The message sits in the table body.
- Announce the result count after every filter or search change in a visually hidden live region: `<p role="status" className="sr-only">5 orders match</p>`. Use the same sentence visibly above the table ("5 orders") [Primer, WCAG 4.1.3].
- For zero results, the announcement says "No orders match". Do not move focus.
- Loading and error are separate: an error never shows the no-results message.

## Code: useListParams and FilterChips

The hook keeps list state in the URL (Next.js App Router); `FilterChips` shows what is applied with a remove button per chip and Clear all.

```tsx
'use client'
import { useCallback } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { X } from 'lucide-react'
import { Button } from '@/components/ui/button'

type Patch = Record<string, string | string[] | null>

export function useListParams() {
  const router = useRouter(), pathname = usePathname(), sp = useSearchParams()

  const push = useCallback((next: URLSearchParams, mode: 'push' | 'replace') => {
    const qs = next.toString()
    router[mode](qs ? `${pathname}?${qs}` : pathname, { scroll: false })
  }, [router, pathname])

  const update = useCallback((patch: Patch, mode: 'push' | 'replace' = 'replace') => {
    const next = new URLSearchParams(sp.toString())
    for (const [key, value] of Object.entries(patch)) {
      next.delete(key)
      const values = Array.isArray(value) ? value : value ? [value] : []
      values.forEach((v) => next.append(key, v))
    }
    if (!('page' in patch)) next.delete('page')
    push(next, mode)
  }, [sp, push])

  const clearAll = useCallback(() => {
    const keep = new URLSearchParams()
    for (const k of ['view', 'sort', 'size']) if (sp.get(k)) keep.set(k, sp.get(k)!)
    push(keep, 'replace')
  }, [sp, push])

  return {
    q: sp.get('q') ?? '', sort: sp.get('sort') ?? '-created_at',
    page: Math.max(1, Number(sp.get('page')) || 1),
    getAll: (key: string) => sp.getAll(key), update, clearAll,
  }
}

export type Chip = { key: string; value: string; label: string }

export function FilterChips({ chips, onRemove, onClearAll }: {
  chips: Chip[]; onRemove: (chip: Chip) => void; onClearAll: () => void
}) {
  if (chips.length === 0) return null
  return (
    <div className="flex flex-wrap items-center gap-2 py-2">
      {chips.map((c) => (
        <span key={`${c.key}:${c.value}`} className="inline-flex h-6 items-center gap-1 rounded-full border border-border bg-secondary pl-2 pr-1 text-xs leading-5 font-medium text-secondary-foreground">
          {c.label}
          <button type="button" aria-label={`Remove filter ${c.label}`} onClick={() => onRemove(c)} className="inline-flex size-6 items-center justify-center rounded-full hover:bg-muted">
            <X className="size-4" />
          </button>
        </span>))}
      <Button variant="link" size="sm" onClick={onClearAll}>Clear all</Button>
    </div>
  )
}
```

Usage: build `chips` from `getAll('status')` with labels from DESIGN.md's status vocabulary; `onRemove` calls `update({ [chip.key]: remaining }, 'replace')`. Wrap the page in `<Suspense>` because `useSearchParams` needs it in client components.
