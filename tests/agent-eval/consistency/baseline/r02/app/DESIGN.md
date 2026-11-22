---
version: alpha
name: "ChấmCông Pro"
description: "Attendance and leave management for a ~50-person company: staff records, daily timesheets, leave approval and monthly reports."
colors:
  primary: "#1d4ed8"
  on-primary: "#ffffff"
  background: "#ffffff"
  surface-subtle: "#f8fafc"
  text: "#0f172a"
  text-muted: "#475569"
  border: "#e2e8f0"
  input-border: "#8592a6"
---

## Overview

- **Product:** employees, daily attendance records, leave requests, monthly attendance reports, shift settings.
- **Users and roles:** HR admin (Hoa) who reviews timesheets, approves or rejects leave and runs reports. No other roles exist in the product yet.
- **Tasks:** find an employee; review and approve timesheets; approve or reject leave requests; read the monthly report; set the company shift.
- **Volume:** 48 employees, 12 departments, ~120 timesheet rows per fortnight, ~36 leave requests.

Familiar, dense, calm. Light neutral sidebar, one blue accent, 40px single-line rows, no KPI rows on list pages (summary text line instead), no emoji or decorative icons.

## Implementation

Shared tokens and components live in `admin.css`, shared helpers (formatting, status tones, toasts, `?state=` handling) in `admin.js`. Pages are static HTML with mock data.

## Locale

- Language: vi-VN. Dates `dd/MM/yyyy`, times `HH:mm`, decimals with a comma (`96,4%`), thousands with a dot. Time zone Asia/Ho_Chi_Minh.
- Search ignores Vietnamese diacritics.
- Leave source data has no year: Oct-Dec = 2026, Jan = 2027.

## Status vocabulary

| Entity | Status | Tone |
|---|---|---|
| Employee | Đang làm | success |
| Employee | Thử việc | info |
| Employee | Nghỉ phép, Nghỉ thai sản | info |
| Employee | Tạm hoãn | warning |
| Employee | Đã nghỉ | neutral |
| Timesheet | Đúng giờ | success |
| Timesheet | Đi muộn | warning |
| Timesheet | Vắng | danger |
| Timesheet | Nghỉ phép, Làm thêm | info |
| Timesheet approval, Leave | Chờ duyệt | info |
| Timesheet approval, Leave | Đã duyệt | success |
| Leave | Từ chối | danger |
| Leave | Đã hủy | neutral |

## Ordering

Employees: newest joined first. Timesheets: newest date first. Leave requests: Chờ duyệt first (soonest start date), then newest.

## Navigation

| Group | Modules |
|---|---|
| Nhân sự | Nhân viên |
| Chấm công | Bảng chấm công, Đơn nghỉ phép |
| Phân tích | Báo cáo |
| Hệ thống | Cài đặt |

## Not built (product has no support yet)

Add/create employee and leave forms, timesheet approval actions, role model, change history ("last changed by").
