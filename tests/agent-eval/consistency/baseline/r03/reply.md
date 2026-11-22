# r03 — released skill, P2 — 420 s, 16 tool uses
- Helper script likely in a tpl/build.py in the shared scratch root (argv paths) — outside the app folder.
- Audit 100/100 on every page; fixed a failing Excel export check on timesheets and re-ran. ?state=empty|error|loading on 4 data pages pass state checks. Did not open pages in a browser.
- New shared app.css + app.js. Light sidebar, subtle blue active item; removed navy/indigo, gradients, glass, emoji, shadows, all-caps.
- Same header on every page (title, subtitle, one primary action right, #1d4ed8). Controls 32px, rows 40px single-line, tabular right-aligned numbers, one 5-tone badge scheme ("Chờ duyệt" now same blue on timesheets and leave).
- Pagination: every table has "Hiển thị x–y trên N" footer — but timesheets keeps page-size select, leave keeps "Xem thêm" (kinds NOT unified).
- Removed hero, greetings, fake chart, announcements, dept cards, tips, KPI tiles → summary line (ids kept). Dates dd/mm/yyyy.
- Employees: separate email column, empty vs no-results states. Timesheets: 10 KPI tiles → summary line, total hours computed; filter panel + page-size select kept; Excel button with count. Leave: status buttons → tabs with counts, reason column, Duyệt primary/Từ chối secondary, "Xem thêm" kept. Reports: basis line, horizontal bar chart from table rates, totals row, computed headline; department avatars removed. Settings: single column, blur validation, error summary, sticky Hủy/Lưu bar, unsaved indicator, beforeunload, success names the shift.
- Left out (no product support): reject reason, last-changed-by, handlers for Thêm/Tạo/Xuất Excel; leave year inferred.
