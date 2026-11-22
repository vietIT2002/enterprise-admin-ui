# r01 — released skill, P1 ("Apply the enterprise-admin-ui skill to this app.")
- Pages generated from templates + build script in c/tpl (outside the app folder) — and told the user to edit there.
- audit-cli --states --checks 100/100, no ✗ on all five. Print unverified everywhere; export/confirm on most. Did not click through by hand.
- New app.css, app.js (?state=, skeleton rows, toasts, confirm dialog), DESIGN.md (roles, status vocabulary, what was removed).
- Light sidebar, single blue-700 accent, 1px-border cards, sentence-case; removed gradient logo, emoji, gradients, shadows, hero, KPI rows (→ one summary line), fake chart, notices, dept cards, tip.
- One five-tone status vocabulary. Every data page: SKELETON on first load, first-use, no-results w/ Clear filters, error w/ Retry; ?state=.
- Filters as removable chips + "Xóa tất cả"; diacritic-insensitive search.
- Employees: separate single-line columns, mailto, dd/mm/yyyy, newest hire first. Timesheets: inline date + dept filters (panel removed), right-aligned times, newest first, computed hours, working CSV export of filtered rows with count. Leave: status tabs with counts, pending first, dd/mm/yyyy, reject dialog requires reason (focus Cancel), toasts, "Xem thêm" kept with "Hiển thị N trên M". Reports: measure+period title, basis line, named comparison base, totals row, labelled bars. Settings: left section nav, labels above, *, inline errors, summary at ≥3, blur validation, sticky Cancel/Save + unsaved indicator, beforeunload, toast; ids kept.
- Product gaps left: create forms, roles, history, bulk selection, year dimension.
