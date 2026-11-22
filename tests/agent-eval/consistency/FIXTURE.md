# Fixture: AI-made attendance admin

Five self-contained HTML pages in `fixture/`, no network, fixed data (Vietnamese names, `vi-VN` dates), the same navy-and-indigo sidebar on every page. Pages are paired by filename; page types are fixed: `employees`, `timesheets`, `leave-requests` are `list`, `reports` is `report`, `settings` is `settings`. `KNOWN_NAME` is `Nguyễn Văn An` on the three list pages (typed in the search box it narrows the rows); `reports` and `settings` have no search.

## Rows

| Page | Rows | Search |
|---|---|---|
| employees | 48 | yes |
| timesheets | 120 | yes |
| leave-requests | 36 | yes |
| reports | 12 | no |
| settings | form, 5 labelled fields plus 6 day checkboxes, no table | no |

## Variants (tokens the grader reuses)

| Page | pagination | filterBar | pageHeader | dateFormat | tableRow (bucket of 4px, font) | emptyState |
|---|---|---|---|---|---|---|
| employees | `numbered` + `range-text`, below | `search-left+select` | `h1-28px+action-right`, no breadcrumb | `dd/mm/yyyy` | 72, 14px | `text-only` |
| timesheets | `prev-next` + `page-size-select`, no range text, below | `search-right+panel-button` | `h1-24px+action-below`, no breadcrumb | `iso` | 32, 12px | `icon-text` |
| leave-requests | `load-more` | `search-left+chips` | `breadcrumb+h1-32px+action-right` | `month-name` ("Nov 3") | 60, 15px | `illustration+button` |
| reports | none (12 rows) | `select` (no search) | `breadcrumb+h1-26px+none` | no date cells | 48, 13px | n/a |
| settings | n/a | n/a | `h1-22px+none`, no breadcrumb | n/a | n/a | n/a |

## Status badges (same text, different colour across pages)

| Page | Statuses and background |
|---|---|
| employees | Đang làm green `#dcfce7`, Thử việc blue `#dbeafe`, **Nghỉ phép purple `#f3e8ff`**, Nghỉ thai sản pink, Tạm hoãn orange, Đã nghỉ grey |
| timesheets | Đúng giờ green, Đi muộn orange, Vắng red, **Nghỉ phép blue `#bfdbfe`**, Làm thêm purple, **Chờ duyệt yellow `#fef08a`**, **Đã duyệt teal `#99f6e4`** |
| leave-requests | **Chờ duyệt orange `#fed7aa`**, **Đã duyệt green `#bbf7d0`**, Từ chối red, Đã hủy grey |

Shared pairs: `Nghỉ phép` (employees purple, timesheets blue); `Chờ duyệt` (timesheets yellow, leave-requests orange); `Đã duyệt` (timesheets teal, leave-requests green). `reports` and `settings` have no badges.

## Tells

Counted tells: audit rules `no-gradient`, `no-backdrop-blur`, `surface-shadow`, `uppercase-text`, `emoji-icon`; `table-above-fold` (list pages; KPI strip and charts push the table below 900px); detectors `greeting-header`, `rainbow-status` (5+ badge hues), `initials-avatar-non-person`. The shared sidebar adds `no-gradient` (logo block), `emoji-icon` (nav) and `navy-sidebar-indigo-accent` to every page.

| Page | Counted tells | Other tells (screenshots only) |
|---|---|---|
| employees | no-gradient, no-backdrop-blur, surface-shadow, uppercase-text, emoji-icon, table-above-fold, greeting-header, rainbow-status | kpi-strip-above-table, kpi-icon-tiles, oversized-radius, stacked-table-rows, navy-sidebar-indigo-accent |
| timesheets | no-gradient, surface-shadow, uppercase-text, emoji-icon, table-above-fold, rainbow-status | kpi-strip-above-table (two strips), kpi-icon-tiles, oversized-radius, navy-sidebar-indigo-accent |
| leave-requests | no-gradient, no-backdrop-blur, surface-shadow, uppercase-text, emoji-icon, table-above-fold, greeting-header, initials-avatar-non-person | kpi-strip-above-table, kpi-icon-tiles, card-in-card, oversized-radius, stacked-table-rows, navy-sidebar-indigo-accent |
| reports | no-gradient, surface-shadow, uppercase-text, emoji-icon, initials-avatar-non-person | kpi-strip-above-table, kpi-icon-tiles, card-in-card, oversized-radius, navy-sidebar-indigo-accent |
| settings | no-gradient, surface-shadow, uppercase-text, emoji-icon | card-in-card, tracked-uppercase-labels, oversized-radius, navy-sidebar-indigo-accent |

`no-backdrop-blur` is also on timesheets' filter panel only when it is open; `timesheets` carries it in the CSS but not on first load, so it is not counted there.

## Behaviour

- employees: search, department and status selects, numbered pages (10 per page).
- timesheets: search, "Bộ lọc" opens a panel (from, to, department; Áp dụng), page size 10/20/50 and Trước/Sau.
- leave-requests: search, status chips, "Xem thêm" loads 12 more, Duyệt/Từ chối change a status, the empty state's button clears the filter.
- reports: month and year selects redraw the 12 rows.
- settings: validates (end after start, grace 0–60 minutes, one day at least, name) and stores the result in `window.savedSettings`.
