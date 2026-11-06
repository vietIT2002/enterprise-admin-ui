# Reports and printable documents

Read this when you build a report (figures over a period, grouped, compared and exported) or a document people print or save as a PDF (invoice, payslip, quotation, delivery note, statement).

## Contents
- [Report page](#report-page)
- [Comparisons and totals](#comparisons-and-totals)
- [Export and print of a report](#export-and-print-of-a-report)
- [Printable documents](#printable-documents)
- [Code: print stylesheet](#code-print-stylesheet)
- [Checklist](#checklist)

## Report page

Baseline without this skill:
- the period was not stated;
- comparisons had no base;
- a missing base showed "Infinity%";
- there was no totals row and no "last updated" line;
- charts had no table equivalent.

1. **Header:** the title names the measure and the period: "Revenue · October 2026". Under it, in one line, the basis of the figures: "Amounts in VND, before VAT · Updated 06/11/2026 08:00".
2. **Filters:** the period comes first, with presets as a segmented control or select (This month, Last month, This quarter, This year, Custom range), then 1–3 dimensions (customer, product, branch).
   - Filters live in the URL, like list filters (`filters-search.md`).
   - Changing a filter keeps the table on screen, dimmed, until the new figures arrive.
3. **Layout:** at most one chart above the table, and only when a trend over time is the point. The table is the report.
   - A chart has a text summary ("Up 12.4% on September, driven by Minh Phát") and the same numbers in the table [WCAG 1.1.1].
   - Pie and donut charts are for 2–5 parts of a whole (`dashboards-charts.md`).
4. **Table:**
   - Group rows by the chosen dimension, with the default order by the measure, high to low.
   - Every column is sortable, and the header shows the sort with `aria-sort`.
   - Numbers follow `tables.md`: right-aligned, `tabular-nums`, the currency in the header ("Revenue (₫)"), one decimal rule per column.
5. **States:**
   - A period with no data: "No revenue recorded for October 2026", with a link to change the period.
   - Loading keeps the header and filters, and skeleton rows fill the table.
   - An error is inline, with Retry (`feedback-states.md`).

## Comparisons and totals

- **Name the base and the period** of every comparison: "+12.4% vs Sep 2026", "−3.1% vs Oct 2025". A bare "+12.4%" is a template tell.
- **No base, no percentage:** when the base is 0 or missing, show "—" with a tooltip "No revenue in Sep 2026"; never "Infinity", "NaN" or "+100%".
- **Signs, not only colour:** a negative change keeps its minus sign ("−3.1%") or parentheses in accounting style. Green and red may support the sign but never replace it [WCAG 1.4.1].
- **Totals row:**
  - It closes the table: a `<tfoot>` row in `font-medium`, with a top border, labelled "Total".
  - With groups, each group ends with a subtotal row, and the grand total equals the sum of the subtotals. Compute it from the same numbers you display, rounded the same way.
  - A total that can be scrolled out of view sticks to the bottom of a table container with a height (`tables.md` point 5).
- **Shares:** a "Share" column shows each row's part of the total ("18.2%"); the shares of the shown rows plus "Other" add to 100%.

## Export and print of a report

- **Export** downloads exactly what is on screen: the same filters, sort and columns. Name the file after the report and period: `revenue-by-customer-2026-10.xlsx`. Offer CSV and Excel; the import and export details are in `bulk-import-export.md`.
- **Print** is a secondary action. The print stylesheet hides the app shell, filters and buttons, and keeps the title, the period line, the table with its totals and the "Updated" line (code below).

## Printable documents

Baseline without this skill: there was no print stylesheet, so the sidebar and buttons printed and rows were cut across pages; the tax code was missing; light grey labels disappeared on a black-and-white printer.

1. **On screen:**
   - The document sits on the page as a sheet (`max-w-[210mm]`, white, 1px border), under a page header.
   - The page header holds the breadcrumb, the status badge with text (Draft, Issued, Paid, Overdue) and the actions. The one primary action fits the status: "Send invoice" for Issued, "Record payment" for Overdue. Print and Download PDF are secondary.
2. **Parties:** seller and buyer blocks, each with the legal name, address and tax code (MST), and the buyer's contact person when known.
3. **Identity:** the document number ("HĐ-2026-0187"), the issue date and the due date, top right, as label/value pairs.
4. **Lines:**
   - A real `<table>` with `<th scope="col">` headers: No., Description, Qty, Unit price, Tax rate, Amount.
   - Numbers right-aligned in `tabular-nums`, and the currency in the header or the totals.
5. **Totals:**
   - Subtotal, then tax per rate ("VAT 8%", "VAT 10%"), the total, the amount paid and the amount due.
   - Compute them from the lines with the same rounding; the total equals subtotal plus tax.
   - Where the locale expects it, also write the total in words ("Bằng chữ: …").
6. **Payment:** the bank, account number and payment reference, plus the terms ("Due within 30 days").
7. **Print:**
   - A4 with `@page` margins.
   - The shell, actions and toasts are hidden.
   - Rows never split across pages, and the table header repeats on every page.
   - Each page has a footer with the document number and "Page 1 of 2" where the browser supports it.
8. **Black and white:**
   - Text is at least `#475569` on white.
   - Status is printed as text.
   - Borders are 1px `#94a3b8` or darker, because lighter lines vanish on office printers.
9. **Structure:** one `<h1>` with the document type and number, `<h2>` for the parties and totals blocks, and table headers as `<th>`.

## Code: print stylesheet

```css
@page { size: A4; margin: 14mm 12mm 16mm; }
@media print {
  html, body { background: #fff; }
  nav, aside, header.app-header, .page-actions, .no-print, [role="status"], .toast { display: none !important; }
  main, .sheet { margin: 0; padding: 0; max-width: none; border: 0; box-shadow: none; }
  table { border-collapse: collapse; width: 100%; }
  thead { display: table-header-group; }   /* repeat the header row on every page */
  tfoot { display: table-row-group; }      /* totals once, after the last row */
  tr, .totals, .parties { break-inside: avoid; }
  h1, h2 { break-after: avoid; }
  a { color: inherit; text-decoration: none; }
  * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
}
```

Test it in the browser's print preview with a long document (40+ lines) before calling it done. In React, wrap the page actions in `<div className="page-actions print:hidden">`; Tailwind's `print:` variant does the same as the class list above.

## Checklist

- [ ] The report title states the measure and period; the basis line says currency, tax basis and when it was updated
- [ ] Every comparison names its base and period; a missing base shows "—"
- [ ] Negative values keep a sign or parentheses; colour only supports it
- [ ] Totals and subtotals equal the sum of what is shown
- [ ] Export downloads the filtered view; print hides the shell and keeps title, period and totals
- [ ] Documents print on A4 without split rows, with the header row repeated and legible in black and white
- [ ] Seller and buyer show name, address and tax code; totals show tax per rate and the amount due
