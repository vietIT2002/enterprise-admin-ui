# Bulk actions, import and export

Read this when you build row selection and bulk actions on a list, a CSV or Excel import, or an export. The selection state and its always-rendered count region (`SelectionStatus`) are at the end of this file; the bar markup is `BulkBar` in `accessibility.md`; progress, toasts and confirmation basics are in `feedback-states.md`. Numbers in the examples are formatted for vi-VN (`1.284`).

## Contents
- [Selection scope](#selection-scope)
- [Bulk bar](#bulk-bar)
- [Running a bulk action](#running-a-bulk-action)
- [Partial failure](#partial-failure)
- [Confirming destructive bulk actions](#confirming-destructive-bulk-actions)
- [Import: before upload](#import-before-upload)
- [Import: column mapping](#import-column-mapping)
- [Import: preview and validation](#import-preview-and-validation)
- [Import: options for existing records](#import-options-for-existing-records)
- [Import: running and summary](#import-running-and-summary)
- [Export](#export)
- [Audit trail](#audit-trail)
- [Code: selection state](#code-selection-state)

## Selection scope

A selection has one of two scopes, and the bulk bar always says which one is active.

| Scope | How the user gets it | Bar reads | The action sends |
|---|---|---|---|
| This page (default) | Row checkboxes or the header checkbox | "3 selected" | The selected IDs |
| All matching | "Select all 1.284 matching" in the bar | "All 1.284 matching selected" | The current filters and search |

1. The first column holds the checkboxes. The header checkbox is checked, indeterminate or empty and selects the rows on this page only (`aria-label="Select all rows on this page"`). Each row checkbox is named after its record (`aria-label="Select order DH-1043"`), and its cell or label gives it a hit area of at least 24×24px [WCAG 2.5.8].
2. Once every row on the page is selected and the results span more than one page, the bar adds a link button "Select all 1.284 matching" [NN/g]. After the click the bar reads "All 1.284 matching selected" with a "Clear selection" link.
3. One reset rule, the same in `tables.md` and `react-shadcn.md`:
   - A change of page, page size, sort, filter or search clears the whole selection, because each one replaces the rows on screen.
   - Unticking a row ends "all matching" and keeps the other selected rows.
   - After a bulk run in one request, the selection becomes the failed IDs that are on the current page (`selectIds`); none failed leaves it empty.
   - Starting a background job clears the selection.
4. An action on all matching sends the filter: the list query without `page`, `size` and `sort`. The server resolves the set when the action runs and reports the count it acted on.
5. An action on page scope sends the selected IDs.
6. A selected row also shows its checked checkbox, so the row background is never the only signal [Atlassian].

## Bulk bar

1. Selecting a row replaces the toolbar with the bulk bar, at the same 40px height, directly above the table [Carbon]. Placed there, it never covers the focused row the way a bar floating at the bottom does [WCAG 2.4.11].
2. Left to right:
   - the count, "3 selected", in `tabular-nums`;
   - "Select all 1.284 matching" when it is offered, or "Clear selection" once all matching is selected;
   - the `actions` slot: at most 3 action buttons, verb first ("Assign owner", "Change status", "Export"), then a "More" menu for the rest, with destructive items last, separated, in `text-destructive`;
   - Cancel at the far right, which clears the selection and moves focus to the header checkbox through a ref, because the bar and its Cancel button unmount [Carbon] `[inferred]` for the focus target.
3. An action that applies to only some of the selected rows stays enabled. Its confirmation or its result names the rows it skips and why [Fiori].
4. An action that applies to none of the selected rows also stays enabled and explains on click: "None of the 3 selected orders can be cancelled: all are shipped." [Fiori; Atlassian avoids disabled buttons].
5. While the bar is open, the row action menus (⋯) are disabled, so two kinds of action do not compete [Carbon].
6. The count is announced through a visually hidden `role="status"` element outside the bar, rendered with the list before anything is selected, which receives "3 selected" or "All 1.284 matching selected". The bar mounts and unmounts with the selection, so its own text is plain, not a live region [WCAG 4.1.3]. `SelectionStatus` below is that element; `BulkBar` in `accessibility.md` has one built in, so a list renders one of the two, never both.

## Running a bulk action

| Work | How it runs | What the user sees |
|---|---|---|
| Up to about 100 items, done within 10 s `[inferred]` threshold | One request | The action button disables and shows a 16px spinner, keeping its label; the bar stays open |
| More than about 100 items | Background job | A progress banner at the top of the content, above the table; the page stays usable; a notification when done |

Job and result banners always sit there, at the top of the content, above the table (`feedback-states.md`). Background job, in order:
1. **Start.** The confirmation (or the action itself, when it needs none) starts the job. The selection clears and the banner appears: "Updating 1.245 orders" with a determinate bar and "View job" `[inferred]`.
2. **Progress.** Counts that say what is being processed: "Updating 340 of 1.245" and the percent [NN/g], refreshed at least every 2 seconds `[inferred]`. The bar uses `role="progressbar"` with `aria-valuenow`, `aria-valuemin`, `aria-valuemax` and a label; the status text is updated at milestones, not every tick.
3. **Still usable.** The banner is not a dialog and blocks nothing. The user can filter, open records and start other work [Primer]. The job also appears in the app's jobs list or notifications.
4. **Stop.** While the job can still stop, the banner offers Stop with a confirmation that states what is kept: "Stop update? 340 orders are already updated."
5. **Done.** The banner turns into the result ([Partial failure](#partial-failure) when anything failed), and the table refetches in place keeping page, sort and filters. The selection stays as the user left it. Users who left the page get the result in the jobs list:
   - full success: a toast with a link, "1.245 orders updated · View results";
   - any failure: a persistent notification, never a toast, "Bulk update finished: 1.230 updated · 15 failed · View results", flagged until opened.

For the inline case the result is a success toast naming the count ("50 orders updated") when nothing failed, otherwise the partial-failure banner.

## Partial failure

1. Report every number: "48 updated, 2 failed" [SKILL.md States]. Rows skipped by a rule are a separate count with the reason: "9 cancelled · 3 skipped (already shipped)".
2. The message is a persistent banner at the top of the content, above the table, warning tone (`bg-warning-subtle text-warning-subtle-foreground`), with an icon, the counts, "View failed (2)" and "Retry failed" [NN/g]. It stays until the user closes it or retries. It is never a toast (`feedback-states.md`).
3. "View failed" opens a list with the record link and a plain reason per item: "DH-1043: Order is already shipped". Items with a temporary cause ("Timed out") get their own Retry.
4. "Retry failed" re-runs the same action on the failed IDs the server returned. Those IDs are used even when the first run targeted all matching, so the retry never touches rows that already succeeded.
5. After a run in one request, the selection becomes the failed IDs on the current page (`selectIds`), so the user sees them ticked and the bar can retry them. Failed rows on other pages are reached through "View failed".
6. When every item failed, the banner uses the danger tone, states the shared reason once ("Couldn't update orders: the warehouse service is down") and lists the items.
7. When every item succeeded, a success toast is enough: "50 orders updated". A message such as "Done" or "Bulk update complete" is used only when nothing failed or was skipped.

## Confirming destructive bulk actions

1. Confirm deletes, cancellations and any other change that cannot be undone [WCAG 3.3.4]. Reversible bulk changes (archive, assign, add tag) run at once and offer Undo in the toast for 10 seconds, with no dialog [NN/g; see `feedback-states.md`].
2. Before the dialog opens, fetch the impact from the server: how many items will change, how many will be skipped and why.
3. The title names the count and the object; the body names what is skipped and what cannot be undone:
   > **Cancel 12 orders?**
   > 3 already shipped will be skipped. Cancelled orders can't be reopened.
4. For all matching, the title uses the server's count and the body names the filter: "Delete 1.284 orders? This includes every order matching Status: Draft · Created before 01/10/2026."
5. The dialog is a shadcn `AlertDialog` with the buttons in this order, safe first and the destructive one at the right:
   - `AlertDialogCancel`: "Cancel", or "Keep orders" when the action itself is called Cancel, so the two buttons never share a word;
   - `AlertDialogAction className={buttonVariants({ variant: 'destructive' })}`, verb + object with the count it will act on: "Cancel 9 orders" `[inferred]` for the count. Neither button takes a `variant` prop.
6. Radix focuses `AlertDialogCancel` on open, so Enter does nothing destructive; Esc closes [Carbon, NN/g].
7. Typing a name to confirm belongs to Danger-zone actions (`feedback-states.md`). A large bulk delete relies on the count in the title and in the button.
8. After the click, the button shows a spinner. Radix closes the dialog on `AlertDialogAction` click, so keep it open during the request with `onClick={(e) => { e.preventDefault(); void confirm() }}`. A failure keeps the dialog open with an inline error. A background job closes the dialog and the progress banner takes over.

## Import: before upload

The import is a wizard on its own page (`/products/import`) or a full-width panel, with named steps "Upload · Map columns · Review · Import". Completed steps stay clickable [SKILL.md Wizard; Carbon]; step titles stay under 12 characters [Ant]. The Upload step holds, in order:

1. One sentence on what the import does: "Add or update products from a CSV or Excel file."
2. **Download template:** "Download template (XLSX)" first, then "CSV (UTF-8 with BOM)". XLSX opens in columns in Excel with any regional settings; the CSV carries a BOM so Excel reads Vietnamese letters (see [Export](#export)). Both hold the header row and one example row, using the exact column names that auto-match in the next step. Below the links, a short column guide says which columns are required and their format ("Price: a number without separators, e.g. 1250000").
3. **Limits stated before upload:** accepted types, size limit and row limit in one line: "CSV or XLSX · up to 10 MB · up to 5.000 rows" (use the real limits).
4. A drop zone with a "Choose file" button, so dragging is never the only way in [WCAG 2.5.7].
5. **Encoding:** read UTF-8 with or without a BOM. When decoding produces replacement characters (`�`), stop on this step with the fix: "This file isn't UTF-8, so Vietnamese letters can't be read. In Excel, save it as CSV UTF-8." `[inferred]`
6. **Delimiter:** detect `,` or `;` from the header row. Excel with Vietnamese regional settings writes `;`, because the comma is the decimal separator. The next step shows what was detected ("Semicolon-separated · 1.200 rows") with a way to change it `[inferred]`.
7. An XLSX file with several sheets asks which sheet to read `[inferred]`.
8. File-level errors (wrong type, too large, too many rows, no data rows) appear inline under the drop zone and keep the user on this step.

## Import: column mapping

1. A table with one row per file column: **File column** · **Sample values** (the first 2–3 values) · **Import as** (a select of target fields plus "Don't import").
2. **Auto-match** each file header against each target field's label and aliases (English and Vietnamese), both normalised the same way: `foldVi` from `@/lib/format` (diacritics and case removed, `đ` → `d`, the same folding as search in `filters-search.md`), then runs of spaces, `_` and `-` become one space:
   `const headerKey = (h: string) => foldVi(h).replace(/[\s_-]+/g, ' ').trim()`
   so "Giá bán" and "Gia_ban" both give `gia ban` and match that alias.
3. **Required target fields** are marked `*` and listed above the table: "Required: SKU*, Name*, Price*". Next stays enabled, like Save (SKILL.md Saving). Clicking it with a required field unmapped shows the error beside that field in the list, "Map a column to Price", and moves focus to it (`tabIndex={-1}` on the error).
4. Each target field takes at most one column; a second column mapped to the same field shows an inline error on that row.
5. **Unmapped file columns** are ignored and listed in one line: "2 columns won't be imported: Notes, Internal code."
6. Fields the user's role cannot set show "Not allowed for your role" and are skipped (`permissions-audit.md`).
7. **Remember the mapping** per user and entity, keyed by the file's headers. A file with the same headers opens with that mapping and the line "Mapping from your last import applied".

## Import: preview and validation

1. Validate every row on the server with the same rules as the create form (`forms.md`) before anything is written [WCAG 3.3.4].
2. A summary line with the error count: "1.200 rows · 1.186 valid · 14 with errors".
3. The preview table shows the mapped columns plus **Row**, the row number as it appears in the file (the header is row 1), so the user can find it in Excel.
4. Each error names row, column and problem: "Row 18 · Email: 'an@' is not a valid email". The cell carries an icon and the message, not colour alone [WCAG 1.4.1].
5. A filter above the table: "All rows" / "Errors only (14)".
6. Number and date cells are parsed with the file's convention (from Excel in vi-VN: `.` for thousands, `,` for decimals, dates `dd/MM/yyyy`). The preview shows the parsed value in the project format, so the user sees before the run that the cell `1.250.000` was read as `1.250.000 ₫` and not as 1.25 `[inferred]`.
7. **Download failed rows:** a CSV in the template format plus an Error column at the end, UTF-8 with BOM. The user fixes the rows and uploads the file again; on re-import the Error column is listed as unmapped and ignored.
8. **State the choice** next to the run button: "14 rows with errors will be skipped. Fix them in the file and upload it again, or import the 1.186 valid rows now." The primary button is "Import 1.186 products"; "Upload a new file" is secondary.
9. When no row is valid, the step shows the error list and "Upload a new file" only.

## Import: options for existing records

On the Review step, a radio group with the matching key named in each label:

| Option | Rows whose key exists | Rows whose key is new |
|---|---|---|
| Create new only (default) | Skipped | Created |
| Update existing by SKU | Updated | Skipped |
| Create and update | Updated | Created |

- The key is a unique field named for the entity: SKU for products, email for users, tax code (MST) for customers. The update options need the key column mapped.
- The preview counts the effect before the run: "1.100 new · 86 existing" `[inferred]`.
- Duplicate keys within the file are errors on every row involved: "Row 18 · SKU AO-001 also appears in row 7".
- In the update options an empty cell keeps the current value; the options say so in one line under the group `[inferred]`.

## Import: running and summary

1. "Import 1.186 products" starts the job and the step turns into progress: "Importing 340 of 1.186" with a determinate bar and "You can leave this page. You'll get a notification when it's done." plus "Run in background" [NN/g, Primer].
2. Stop asks first and states what is kept: "Stop import? 340 rows are already imported."
3. Rows that fail on the server during the run (a SKU created by someone else a moment ago) join the failed rows.
4. When a background import ends, the jobs list keeps the entry and the user is told according to the result:
   - no failed row: a success toast with a link, "Import finished: 1.186 created · View results";
   - any failed row: a persistent notification, never a toast, "Import finished: 1.100 created · 50 updated · 14 failed · View results", flagged until opened.
5. The summary is a page at a stable URL, kept at least 30 days (`feedback-states.md`):
   - four labelled figures: **Created** 1.100 · **Updated** 50 · **Skipped** 22 · **Failed** 14;
   - "Download failed rows (14)" and "View import log";
   - "View imported products", a link to the list filtered to this import, and "Import another file".
6. The import log records the file name, the user, the time, the option and key chosen, the mapping, the counts and each row's outcome.
7. Failures are never folded into a success message: "Import finished" carries the failed count, and an import with failures never ends in a toast.

## Export

1. Export sits in the list's page header as a secondary button or in its overflow menu [Polaris]; the bulk bar also offers it for the selection.
2. The export dialog states the scope as a radio group with counts: "Selected (3)", shown when rows are selected and chosen by default then, and "All matching (1.245)".
3. The file holds what the user sees: current filters, search, sort and visible columns, with "All columns" as an option `[inferred]`. Columns the role cannot see are left out and masked fields stay masked (`permissions-audit.md`).
4. Formats: CSV and XLSX. The button names the result: "Export 1.245 orders".
5. **CSV encoding:** UTF-8 with BOM, so Excel opens Vietnamese text correctly. Excel with Vietnamese regional settings splits CSV on `;`, so XLSX is the format that opens in columns for those users `[inferred]`.
6. **Raw values** that a spreadsheet can calculate with and the import can read back [NN/g]:
   - numbers without separators or symbols (`1250000`), the unit or currency in the header ("Total (VND)");
   - calendar dates as stored (`2026-11-04`); date-times as `2026-11-04 15:58` in the project time zone through `exportDateTime` (below), with the zone in the header ("Created (GMT+7)") `[inferred]`;
   - statuses as their label text.
7. The export request either returns the file, which downloads at once, or the server returns a job ID; the UI then shows background progress: "Preparing 12.400 orders. You'll get a notification when the file is ready."
8. The notification and the jobs list link to the file and state the expiry as an absolute time: "Orders export is ready · Download · Link expires 06/11/2026 15:58". An expired entry offers "Export again".
9. File name: entity and date, `orders-2026-11-04.csv` `[inferred]`.

`exportDateTime` writes date-time cells; the file-name date is `exportDateTime(new Date().toISOString(), TIME_ZONE).slice(0, 10)`.

```ts
// lib/export-values.ts: cell values for CSV and XLSX files, not for the screen.
const stamps = new Map<string, Intl.DateTimeFormat>()

// The parts are joined in ISO order, so no display pattern applies; 'en' only pins the Gregorian calendar and Latin digits.
export function exportDateTime(iso: string, timeZone: string) {
  let f = stamps.get(timeZone)
  if (!f) stamps.set(timeZone, (f = new Intl.DateTimeFormat('en', {
    timeZone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })))
  const p = Object.fromEntries(f.formatToParts(new Date(iso)).map((x) => [x.type, x.value]))
  return `${p.year}-${p.month}-${p.day} ${p.hour}:${p.minute}` // '2026-11-04T08:58:00Z', 'Asia/Ho_Chi_Minh' → 2026-11-04 15:58
}
```

## Audit trail

Every bulk action, import and export writes one audit entry. No surveyed system specifies this UI, so the fields are `[inferred]`, consistent with `permissions-audit.md`.

| Field | Example |
|---|---|
| Who | Lê Hoa (link to the user) |
| When | `04/11/2026 15:58`, absolute, in the project locale |
| What | "Bulk update: Status → Cancelled", "Import products (create and update by SKU)", "Export orders (XLSX)" |
| Scope | "12 selected orders" with their IDs, or the filter: "Status: Late · Created before 01/10/2026" |
| Counts | "9 updated · 3 skipped · 0 failed"; for an export, rows and columns exported |
| Link | The job and its summary; for an import, the file and the log |

- Each changed record's history shows the change with its source, "Bulk update by Lê Hoa" or "Import job 218", linked to the job.
- Exports are logged although they change nothing, because data leaves the system.

## Code: selection state

A reducer for page-scoped selection with the "all matching" upgrade, plus the helpers the bulk bar and the request need.

```ts
// selection.ts
export type Selection = { ids: ReadonlySet<string>; allMatching: boolean }
export type SelectionAction =
  | { type: 'toggleRow'; id: string }
  | { type: 'togglePage'; pageIds: string[] }
  | { type: 'selectAllMatching' }
  | { type: 'selectIds'; ids: string[] } // after a run in one request: the failed IDs on this page
  | { type: 'clear' } // Cancel, or a background job started
  | { type: 'filtersChanged' } // filters or search
  | { type: 'pageChanged' } // page, page size or sort

export const emptySelection: Selection = { ids: new Set(), allMatching: false }
export const isPageSelected = (s: Selection, pageIds: string[]) =>
  pageIds.length > 0 && pageIds.every((id) => s.ids.has(id))

export function selectionReducer(state: Selection, action: SelectionAction): Selection {
  switch (action.type) {
    case 'toggleRow': {
      const ids = new Set(state.ids)
      if (ids.has(action.id)) ids.delete(action.id)
      else ids.add(action.id)
      return { ids, allMatching: false } // unticking a row ends "all matching"
    }
    case 'togglePage':
      return { ids: new Set(isPageSelected(state, action.pageIds) ? [] : action.pageIds), allMatching: false }
    case 'selectAllMatching':
      return { ...state, allMatching: true }
    case 'selectIds':
      return { ids: new Set(action.ids), allMatching: false }
    case 'clear':
    case 'filtersChanged':
    case 'pageChanged':
      return emptySelection
  }
}

export const canSelectAllMatching = (s: Selection, pageIds: string[], total: number) =>
  !s.allMatching && isPageSelected(s, pageIds) && total > pageIds.length
export const selectedCount = (s: Selection, total: number) => (s.allMatching ? total : s.ids.size)

// filterKey decides the matching set; pageKey only what is on screen.
export function listKeys(query: URLSearchParams) {
  const filter = new URLSearchParams(query)
  for (const k of ['page', 'size', 'sort']) filter.delete(k)
  return { filterKey: filter.toString(), pageKey: ['page', 'size', 'sort'].map((k) => query.get(k)).join('|') }
}
export const bulkTarget = (s: Selection, query: URLSearchParams) =>
  s.allMatching ? { filter: listKeys(query).filterKey } : { ids: [...s.ids] }
```

Wiring in React: the reset events come from the URL, and the count region is always rendered.

```tsx
import { useEffect, useReducer } from 'react'
import { formatNumber } from '@/lib/format'
import { emptySelection, listKeys, selectedCount, selectionReducer, type Selection } from './selection'

export function useSelection(query: URLSearchParams) {
  const [selection, dispatch] = useReducer(selectionReducer, emptySelection)
  const { filterKey, pageKey } = listKeys(query)
  useEffect(() => dispatch({ type: 'filtersChanged' }), [filterKey])
  useEffect(() => dispatch({ type: 'pageChanged' }), [pageKey])
  return [selection, dispatch] as const
}

export function SelectionStatus({ selection, total, locale }: { selection: Selection; total: number; locale: string }) {
  const n = selectedCount(selection, total)
  const count = formatNumber(n, locale)
  const text = n === 0 ? '' : selection.allMatching ? `All ${count} matching selected` : `${count} selected`
  return <p role="status" className="sr-only">{text}</p>
}
```

Two ways to show the bar, never both count regions:
- a bar of your own: render `SelectionStatus` next to the table on first render, and give the bar the same `selectedCount` in `tabular-nums`;
- `BulkBar` from `accessibility.md`: pass `count={selectedCount(selection, total)}`, `onClear={() => dispatch({ type: 'clear' })}`, the header checkbox ref as `headerCheckbox` and the buttons as `actions`. It carries the count region, and its Cancel moves focus to that checkbox.

The page passes `LOCALE` from `@/lib/locale`, or the user's setting when locale is per user. The bulk request body is `bulkTarget(selection, query)`. After the request:
- a run in one request: `dispatch({ type: 'selectIds', ids: result.failedIds.filter((id) => pageIds.includes(id)) })`;
- a background job started: `dispatch({ type: 'clear' })`.
