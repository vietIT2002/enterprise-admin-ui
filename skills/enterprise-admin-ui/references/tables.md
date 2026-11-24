# Tables

Read this when you build any data table: a list page, a related list on a detail page, line items in a form, or a permission matrix. Numbers in the examples are formatted for vi-VN (`1.284`, `1.250.000 ₫`).

## Contents
- [Density](#density)
- [Alignment and numbers](#alignment-and-numbers)
- [Columns](#columns)
- [Sorting](#sorting)
- [Selection and bulk actions](#selection-and-bulk-actions)
- [Row actions](#row-actions)
- [Pagination and large data](#pagination-and-large-data)
- [Table states](#table-states)
- [Inline editing](#inline-editing)
- [Truncation](#truncation)
- [Totals row](#totals-row)
- [Status column](#status-column)
- [Code: DataTable excerpt](#code-datatable-excerpt)

## Density

- Default rows are single-line at 40px (`--row-height`) with 14px text. Compact mode is 32px with the same 14px text (`--row-height-compact`). Offer the toggle on large lists and remember the choice per user. Carbon defaults to 40px; Fiori compact is 32px [Carbon, Fiori].
- The header row, toolbar, bulk bar and pagination use the same height as the rows, so the table reads as one block [Carbon].
- Put secondary data (email, phone, item count, created by) in its own column, or leave it for the detail page. Without this skill, agents showed 100% of generated order lists stacking two lines in the first column and a 61px median row height.
- Every row is one line. In Tailwind: `h-10` or `py-2.5` on text cells; `py-1` on cells that hold a 32px input or button (a `py-2` or `py-3` cell around a 32px control makes a 52px+ row). A SKU, description or tax code gets its own column or lives on the detail page, never a second line under the name.
- Do: a `Customer` column with the name, plus `Phone` and `City` columns. Don't: name, phone, email and city stacked inside one cell.
- Avatars only for people (employees, users, contacts). Companies, orders and products show a small logo or no image; initials in a circle for a company is a template tell. A logo beside its visible name has `alt=""`; a logo shown alone has `alt` with the name.
- Rows always have a hover background (`hover:bg-muted`). A selected row also has a checked checkbox, so colour is never the only signal [Atlassian].

## Alignment and numbers

- Numbers, amounts, quantities and percentages align right with `tabular-nums`. The column header has the same alignment as its data [Polaris, Primer, Ant].
- Text aligns left. Nothing in a data table is centred.
- IDs, phone numbers, emails, URLs and statuses stay left and are never number-formatted [Fiori].
- Units go in the header, not in each cell: "Amount (VND)", "Weight (kg)". Keep the same decimals within a column [Polaris].
- Format through `@/lib/format` (`data-formatting.md`) with the `locale` prop: `formatNumber(1250000, locale)` gives `1.250.000` and `formatMoney(1250000, 'VND', locale)` gives `1.250.000 ₫`. In a single-currency column whose header names the currency, `formatAmount(value, currency, locale)` prints the currency's decimals without the symbol: `1.250.000` for VND, `54,20` for USD. Do not hand-build separators [Polaris, Fiori].
- Negative numbers put the minus first, as `Intl` prints it (hyphen-minus: `-4,20`). An empty value shows `—`, the same mark everywhere.
- This applies to every table. Without this skill, agents produced right-aligned numbers in lists but unaligned ones in detail-page tables and invoice line items. Line items, related lists, permission counts and summary tables follow the same rule.
- Do: `<TableHead className="text-right">Total (VND)</TableHead>` over `<TableCell className="text-right tabular-nums">`. Don't: right-aligned cells under a left-aligned header.

## Columns

1. The first data column is a human-readable identifier ("DH-1043", a customer name), rendered as a link to the detail page [NN/g].
2. Order the other columns by how often the user needs them: status, the main party, the date, then amounts, then rarely used fields.
3. Show 6–8 columns by default at 1440px. Extra columns go behind a "Columns" menu.
4. The "Columns" menu is a popover with a checkbox per column plus Move up / Move down buttons. Drag is never the only way to reorder [WCAG 2.5.7]. When columns are hidden, the trigger reads "Columns (2 hidden)" [NN/g].
5. When the table is wider than the viewport, its container scrolls sideways (`overflow-x-auto`), not the page, and the first column stays frozen (`sticky left-0 bg-card`) [NN/g, WCAG 1.4.10]. A frozen header row (`sticky top-0 bg-card`) needs a container that also scrolls vertically, so give it a height: `max-h-[calc(100dvh-12rem)] overflow-auto`. In an `overflow-x-auto` container that grows with its rows, `sticky top-0` never sticks (audit `sticky-inert`).
6. Header labels are sentence case with normal letter spacing, 12–14px medium. No `uppercase tracking-wide`.

## Sorting

- Every table opens sorted by one column, usually newest first (`sort=-created_at`, the API field in snake case) or the identifier. Write the default into the code, not just the data.
- When rows carry a due or expiry date (certificates, contracts, invoices, inspections, tasks), the default order is attention first: expired or overdue, then due soon, then the rest, each group by date (`sort=urgency,due_at`) `[inferred]`. The status badge names the group ("Expired", "Expires in 12 days").
- First click sorts ascending, the next descending, the third returns to the default [Primer].
- Show the sort icon (16px chevron) on the sorted column only; other sortable headers reveal a muted icon on hover and focus [Carbon].
- A sortable header is a `<button>` inside the `<th>`. Set `aria-sort="ascending"` or `"descending"` on the `<th>` of the sorted column and omit it elsewhere [Polaris].
- In a numeric column the `<th>` is `text-right` and holds the padding; the button is `inline-flex flex-row-reverse items-center gap-1 text-right` with no horizontal padding (buttons centre their text by default, which shifts a wrapped label), so the label ends at the same edge as the numbers and the icon sits to its left.
- Sort by the value, not the formatted text: dates by timestamp, amounts as numbers, names with `a.localeCompare(b, locale)` (`data-formatting.md`).
- Sort state lives in the URL (see `filters-search.md`).

## Selection and bulk actions

- The first column holds a checkbox. The header checkbox is checked, indeterminate (some rows selected) or empty, with `aria-label="Select all rows on this page"`; each row has `aria-label="Select order DH-1043"`. Each checkbox gets a 24×24px hit area from its cell, a label or an `after:` inset (`relative after:absolute after:-inset-1`) [WCAG 2.5.8].
- Selecting a row opens a bulk bar in place of the toolbar, at the same height. Left to right: the count "3 selected" in `tabular-nums` · "Select all 1.284 matching" when offered · the `actions` slot (at most 3 buttons, the rest under "More") · Cancel at the far right [Carbon].
- Cancel clears the selection and moves focus to the header checkbox (keep a ref to it), because the bar and its Cancel button unmount `[inferred]`.
- The count is announced by a visually hidden `role="status"` element outside the bar, rendered with the list before anything is selected; the bar's own count is plain text [WCAG 4.1.3].
- When results span several pages and the whole page is selected, the bar adds a link button "Select all 1.284 matching". After the click it reads "All 1.284 matching selected" with "Clear selection". Without this skill, agents failed here: 0 of 2 reviewed lists offered this [NN/g].
- **Reset rule**, the same in `bulk-import-export.md` and `react-shadcn.md`:
  - any change of page, page size, sort, filter or search clears the whole selection;
  - unticking a row ends "all matching" and keeps the other selected rows;
  - after a bulk run in one request, the selection becomes the failed IDs on the current page (`selectIds`); none failed leaves it empty;
  - starting a background job clears the selection.
- While the bulk bar is open, row actions (the ⋯ menus) are disabled so two kinds of action do not compete [Carbon].
- Destructive bulk actions confirm in an `AlertDialog` with the count and the impact: "Delete 12 orders? Paid orders can't be restored." `AlertDialogCancel` comes first and Radix focuses it on open; `AlertDialogAction` comes last, labelled "Delete 12 orders", with `className={buttonVariants({ variant: 'destructive' })}` and `onClick={(e) => { e.preventDefault(); void confirm() }}`, so the dialog stays open until the request succeeds and can show its error.
- Partial failure: after the run, a persistent banner at the top of the content, above the table: "48 updated, 2 failed" with "View failed (2)"; never a success toast. When the server answers with a job ID, the UI shows background progress ("Updating 3 of 50") and the job continues while the user works [NN/g]. Details in `bulk-import-export.md`.
- Render the bar above the table, not as a floating bar at the bottom, so it never covers the focused row [WCAG 2.4.11].

## Row actions

- At most 2 visible actions per row; a third or more go into an overflow menu (⋯ button) [NN/g, Carbon].
- Prefer one visible action (Edit) and the rest in the menu [Primer]. The identifier link already opens the record, so a "View" button adds nothing.
- Each button has a unique accessible name that includes the record: `aria-label="Actions for order DH-1043"`, `aria-label="Edit invoice INV-1043"` [Atlassian].
- The actions column is last, right-aligned, with a visually hidden header (`<span className="sr-only">Actions</span>`).
- Destructive items sit last in the menu, separated, in `text-destructive`.
- Do: hide actions the user's role can never use. Don't: show four identical-looking icon buttons per row.

## Pagination and large data

- Pagination sits at the bottom of the table [Carbon, Ant]. Layout: "1–50 of 1.284" on the left; page-size select (25, 50, 100) and Previous / page numbers / Next on the right.
- Paginate once there are more than 50 rows [Polaris]. Show the page-size select above 50 rows and a "Go to page" jumper beyond 5 pages [Ant].
- Always show the total. When the exact count is expensive, show "50+" rather than nothing.
- Up to about 200 rows a plain table renders fine. Beyond that, virtualise rows (`@tanstack/react-virtual`) with fixed row heights, which is one more reason for single-line 40px rows [Fiori].
- Avoid infinite scroll for find-and-compare work. If you use it, show "50 of 1.284 loaded" and restore the scroll position when the user returns from a detail page [NN/g].
- Changing a filter, search or page size resets to page 1 and clears the selection. Returning from a detail page restores the same page, sort and filters, which is why they live in the URL.
- Keep the sticky header from hiding the focused cell when paging by keyboard [WCAG 2.4.11].

## Table states

Keep the table header visible in every state and put the message in the body, spanning all columns. Ant does it this way; Carbon replaces the whole table, which loses the column context [Ant, Carbon]. Without this skill, agents failed here: states were missing on 4 of 8 briefs.

| State | Body shows |
|---|---|
| First use | One sentence about the entity + the primary action: "No orders yet. Orders from all channels appear here." · `Create order` |
| No results | "No orders match these filters" · `Clear filters`. Different wording and action from first use (see `filters-search.md`) |
| Loading | 8–10 skeleton rows at the final column widths, `aria-busy="true"` on the table. A spinner only inside a button [NN/g, Primer] |
| Error | What failed ("Couldn't load orders") + `Retry`. Keep the last valid rows dimmed when you have them |

- Use the skeleton for the first load. For a refetch (new sort or page) keep the old rows at `opacity-60` instead of flashing a skeleton.
- Related lists on detail pages have all four states too: "No contacts yet · Add contact".

## Inline editing

- Allow inline editing only for one simple value per cell: a quantity, a short text, a status select, a toggle. Click or Enter turns the cell into an input; Enter saves, Esc cancels; a save error appears in the cell.
- Anything with several fields, cross-field validation or long text opens a side panel or the edit page [NN/g, Atlassian]. SLDS supports broad inline editing, but the safer default for business data is the panel.
- Never mix save models in one table: either every editable cell saves when committed, or the table has one explicit Save with an "Unsaved changes" indicator (permission matrix, invoice lines).
- Editable cells show an affordance (border or pencil) on focus and hover, not on hover alone.

## Truncation

- Names, IDs and order numbers wrap rather than truncate, because shared prefixes ("Công ty TNHH Thương mại …") become indistinguishable [Polaris, Fiori].
- Long free text (notes, descriptions, addresses) uses `truncate` with a max width (`max-w-[320px]`) and a tooltip or popover showing the full value.
- Header labels wrap to two lines before they are cut [Carbon]. Vietnamese and German labels run up to 50% longer than English, so do not size columns to the English text [Polaris].
- Tooltips attach to focusable elements and are dismissible and hoverable [WCAG 1.4.13].
- Wrapping is the exception: give columns enough width that most rows stay on one line.

## Totals row

- Put totals in a `<TableFooter>` row that stays visible (`sticky bottom-0 bg-card font-medium`, in a container with a height as in point 5): "Total" in the first cell, figures in the numeric columns, right-aligned with `tabular-nums` [Polaris].
- Figures are computed values, not formulas in cells. Say what they cover: "Total (this page)" or "Total (1.284 matching)".
- A line-items table puts subtotal, tax and total below the table in a narrow right block (`ml-auto w-72`), labels left and figures right.
- Mixed currencies show the ISO code beside each total: `formatMoney(value, currency, locale, { currencyDisplay: 'code' })` prints "1.250.000 VND · 54,20 USD". Never add different currencies into one number.

## Status column

- Use a pill badge with text, from the five-tone vocabulary only: neutral, info, success, warning, danger. Never add a sixth colour.
- Classes: neutral `bg-neutral-subtle text-neutral-subtle-foreground`; info `bg-info-subtle text-info-subtle-foreground`; success `bg-success-subtle text-success-subtle-foreground`; warning `bg-warning-subtle text-warning-subtle-foreground`; danger `bg-danger-subtle text-danger-subtle-foreground`. All pass 4.5:1.
- Shape: `inline-flex h-6 items-center whitespace-nowrap rounded-full px-2 text-xs leading-5 font-medium` (`leading-5` keeps Vietnamese marks inside the fixed height). Sentence case, text always present, optionally a 16px icon so colour is never the only signal [Carbon, Atlassian].
- A badge is one line with the whole word. Give the column the width of its longest status ("Ngừng hoạt động") instead of wrapping the badge or abbreviating it ("Ngừng h.đ.").
- Map each entity's statuses to tones once, in DESIGN.md (Pending → info, Paid → success, Overdue → danger), and render them from one `StatusBadge` component. Do not choose colours per page.
- Keep the column left-aligned and near the front. Avoid showing more than 5–6 distinct statuses at once [Carbon].

## Code: DataTable excerpt

TanStack Table v8 with shadcn `Table`. Column `meta.align` drives the header and cell classes, and the columns are built from the `locale` prop, so no formatter is created at module level.

```tsx
import { useMemo } from 'react'
import { type ColumnDef, type RowData, flexRender, getCoreRowModel, useReactTable } from '@tanstack/react-table'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { formatAmount } from '@/lib/format'
import { cn } from '@/lib/utils'

declare module '@tanstack/react-table' {
  interface ColumnMeta<TData extends RowData, TValue> { align?: 'left' | 'right' }
}
type Order = { id: string; number: string; customer: string; total: number }
const alignClass = (a?: 'left' | 'right') => (a === 'right' ? 'text-right tabular-nums' : 'text-left')

const orderColumns = (locale: string): ColumnDef<Order>[] => [
  { accessorKey: 'number', header: 'Order no.' },
  { accessorKey: 'customer', header: 'Customer' },
  { accessorKey: 'total', header: 'Total (VND)', meta: { align: 'right' },
    cell: ({ getValue }) => formatAmount(getValue<number>(), 'VND', locale) }, // 1.250.000
]

export function OrdersTable({ data, locale }: { data: Order[]; locale: string }) {
  const columns = useMemo(() => orderColumns(locale), [locale])
  const table = useReactTable({ data, columns, getCoreRowModel: getCoreRowModel(), getRowId: (r) => r.id })
  return (
    <div className="rounded-md border border-border bg-card">
      <Table aria-label="Orders">
        <TableHeader>{table.getHeaderGroups().map((hg) => (
          <TableRow key={hg.id}>{hg.headers.map((h) => (
            <TableHead key={h.id} className={cn('h-10 px-3', alignClass(h.column.columnDef.meta?.align))}>
              {flexRender(h.column.columnDef.header, h.getContext())}</TableHead>))}</TableRow>))}</TableHeader>
        <TableBody>{table.getRowModel().rows.map((row) => (
          <TableRow key={row.id} className="h-10">
            {row.getVisibleCells().map((c) => (
              <TableCell key={c.id} className={cn('px-3 py-0', alignClass(c.column.columnDef.meta?.align))}>
                {flexRender(c.column.columnDef.cell, c.getContext())}</TableCell>))}</TableRow>))}</TableBody>
      </Table>
    </div>
  )
}

// Page: <OrdersTable data={rows} locale={LOCALE} />, with LOCALE from '@/lib/locale'.
```

Pages pass `LOCALE` from `@/lib/locale`; when the locale is a per-user setting, they pass the user's setting instead. For selection and the bulk bar, build on these instead of a second copy:
- `react-shadcn.md`: the full DataTable with the select column, sorting, the Columns menu and the bulk bar.
- `bulk-import-export.md`: the selection state (`selectIds`, the reset rule) and `SelectionStatus`.
- `accessibility.md`: `BulkBar({ count, locale, onClear, headerCheckbox, actions })`, where `headerCheckbox` is the ref Cancel focuses and `actions` is the slot for the bulk buttons.
