---
version: alpha
name: "ChấmCông Pro"
description: "Attendance admin: employees, timesheets, leave approvals and monthly reports for HR."
colors:
  primary: "#1d4ed8"
  on-primary: "#ffffff"
  background: "#f8fafc"
  surface: "#ffffff"
  text: "#0f172a"
  text-muted: "#475569"
  border: "#e2e8f0"
  input-border: "#8592a6"
  success: "#15803d"
  warning: "#b45309"
  danger: "#b91c1c"
  info: "#1d4ed8"
rounded:
  control: 4px
  card: 6px
  dialog: 8px
---

## Overview

- **Product:** attendance management for a 48-person company (12 departments).
- **Users:** HR admin (Hoa) who reviews timesheets and approves leave. No other roles are defined in the code.
- **Tasks:** find an employee, check daily timesheets, approve or reject leave requests, read the monthly attendance report, set the default shift.
- **Volume:** 48 employees, about 120 timesheet rows for the period, 36 leave requests.

## Layout

Light sidebar 240px, content on slate-50, cards with a 1px border and no shadow, 40px table rows. Shared styles live in `app.css`, shared behaviour (`?state=`, skeleton, toast, confirm dialog) in `app.js`.

## Locale

- Language: vi-VN. Dates `dd/MM/yyyy`, times `HH:mm`, decimal comma (`8,0` hours, `96,2%`).
- Search ignores Vietnamese diacritics.

## Status vocabulary

| Entity | Status | Tone |
|---|---|---|
| Employee | Đang làm | success |
| Employee | Thử việc, Nghỉ phép, Nghỉ thai sản | info |
| Employee | Tạm hoãn | warning |
| Employee | Đã nghỉ | neutral |
| Timesheet | Đúng giờ | success |
| Timesheet | Đi muộn | warning |
| Timesheet | Vắng | danger |
| Timesheet | Nghỉ phép, Làm thêm | info |
| Approval / leave request | Chờ duyệt | info |
| Approval / leave request | Đã duyệt | success |
| Leave request | Từ chối | danger |
| Leave request | Đã hủy | neutral |

## Navigation

Nhân viên · Bảng chấm công · Đơn nghỉ phép · Báo cáo · Cài đặt

## Decisions log

| Date | Decision | Reason |
|---|---|---|
| 2026-11-20 | Removed hero greeting, KPI card rows, 7-day chart, notices, department cards and tips from list pages | Decorative and unsupported by data; summary is one text line |
| 2026-11-20 | Leave requests list pending first | The approver's task is to clear them |
