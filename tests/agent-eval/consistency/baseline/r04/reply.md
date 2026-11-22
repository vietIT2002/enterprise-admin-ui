# r04 — released skill, P2 — 397 s, 13 tool uses
- Wrote helper build script OUTSIDE the app folder (a build.py in the shared scratch root) — violates "work only inside".
- Ran audit-cli --states --checks: 100/100 on 4 list/report pages; some checks `?` (no control); did not click through in a browser; --require not used.
- New app.css (light neutral sidebar, blue-700 single accent, 1px borders no shadow, 40px rows, sentence-case headers, 5-tone badges) and app.js (shared status→tone map, skeleton/empty/error rows, toast role=status, Retry).
- All five pages rewritten around one shell: sidebar, breadcrumb, h1+subtitle, actions right.
- Removed: gradient hero + greetings, emoji, icon tiles, KPI cards with invented deltas → summary text line (ids kept), fake chart, notices, dept cards, tip box, uppercase headers, navy/indigo shell, zebra, glass, English "Good morning"/"Oct 26".
- Dates dd/mm/yyyy everywhere (assumed year 2026/2027).
- Three list pages: same filter bar with "Xóa bộ lọc", "Hiển thị x–y trên N" in a live region, same pager style. (Pagination kinds? — check grader.)
- Employees: separate email column (mailto). Timesheets: filter panel → always-visible inline filter bar (.filter-toggle removed). Leave: Duyệt/Từ chối + toast; no reject reason (workflow unchanged).
- ?state=empty|error|loading on lists+report. Reports: totals row, bars from table. Settings: one column, labels above, required *, error summary w/ focus, sticky Hủy/Lưu bar, unsaved indicator, beforeunload, "Đã lưu".
