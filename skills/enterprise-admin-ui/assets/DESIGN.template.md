---
version: alpha
name: "Replace with the product name"
description: "Replace with one sentence: what the product does and for whom."
colors:
  primary: "#1d4ed8"
  on-primary: "#ffffff"
  background: "#ffffff"
  surface: "#ffffff"
  surface-subtle: "#f8fafc"
  text: "#0f172a"
  text-muted: "#475569"
  border: "#e2e8f0"
  input-border: "#8592a6"
  success: "#15803d"
  warning: "#b45309"
  danger: "#b91c1c"
  info: "#1d4ed8"
typography:
  body:
    fontFamily: "system-ui, 'Segoe UI', -apple-system, Roboto, Arial, sans-serif"
    fontSize: 14px
    fontWeight: 400
    lineHeight: 20px
  caption:
    fontFamily: "system-ui, 'Segoe UI', -apple-system, Roboto, Arial, sans-serif"
    fontSize: 12px
    fontWeight: 500
    lineHeight: 16px
  section-title:
    fontFamily: "system-ui, 'Segoe UI', -apple-system, Roboto, Arial, sans-serif"
    fontSize: 16px
    fontWeight: 600
    lineHeight: 24px
  page-title:
    fontFamily: "system-ui, 'Segoe UI', -apple-system, Roboto, Arial, sans-serif"
    fontSize: 20px
    fontWeight: 600
    lineHeight: 28px
  kpi-value:
    fontFamily: "system-ui, 'Segoe UI', -apple-system, Roboto, Arial, sans-serif"
    fontSize: 24px
    fontWeight: 600
    lineHeight: 32px
    fontFeature: "tnum"
rounded:
  control: 4px
  card: 6px
  dialog: 8px
spacing:
  xs: 4px
  sm: 8px
  md: 12px
  lg: 16px
  xl: 24px
  xxl: 32px
components:
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.on-primary}"
    rounded: "{rounded.control}"
    height: 32px
  input:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.text}"
    rounded: "{rounded.control}"
    height: 32px
  card:
    backgroundColor: "{colors.surface}"
    rounded: "{rounded.card}"
    padding: 16px
  table-row:
    height: 40px
  table-row-compact:
    height: 32px
---

## Overview

Replace this paragraph:
- **Product:** what it manages (orders, employees, invoices…).
- **Users and roles:** who uses it every day, e.g. Sales staff, Sales manager, Accountant, Admin.
- **Tasks:** the 3–5 tasks they come to do.
- **Volume:** typical record counts (e.g. "2,000 orders a month").

Design intent: familiar, dense, calm. Every screen helps someone find records, change them safely and see what needs attention.

## Colors

Neutral surfaces with one accent (`primary`) for primary buttons, links, focus and selection. Secondary text uses `text-muted` (≥4.5:1 on white). Status colours are used only for status (see Status vocabulary).

## Typography

System UI stack. 14px body and table text, 12px captions, 16px section titles, 20px page titles, 24px KPI values with tabular figures. Sentence case everywhere.

## Layout

Light sidebar 240px (56px collapsed), 48px top bar, content max width 1440px. Spacing on a 4px base. Density: default (40px rows), compact (32px rows) for power users.

## Elevation & Depth

Cards and panels use a 1px border and no shadow. Only menus, popovers, dialogs and toasts cast a shadow.

## Shapes

4px controls, 6px cards, 8px dialogs; fully rounded only for status badges and chips.

## Components

Build on the project's component library (shadcn/ui unless stated otherwise) and the tokens in `tokens.css`. One icon set (lucide).

## Do's and Don'ts

- Do keep list pages table-first; summary numbers live in tab counts or one text line.
- Do design first-use, no-results, loading and error states for every data region.
- Do keep Save enabled until submit and warn about unsaved changes.
- Don't use ALL-CAPS labels, coloured sidebars or a different colour for every status.

## Locale

- Language: vi-VN (replace)
- Currency: VND, format `1.250.000 ₫` (`Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' })`)
- Dates: `dd/MM/yyyy`, times `HH:mm`, time zone `Asia/Ho_Chi_Minh`
- Search ignores Vietnamese diacritics

## Status vocabulary

| Entity | Status | Tone |
|---|---|---|
| Order | Draft | neutral |
| Order | Pending confirmation | info |
| Order | Completed | success |
| Order | Overdue | danger |
| Order | Cancelled | danger |

Tones: neutral, info, success, warning, danger. Every status shows its text label.

## Navigation

| Group | Modules |
|---|---|
| Sales | Orders, Quotes, Customers |
| Inventory | Products, Stock, Shipments |
| Finance | Invoices, Payments, Reports |
| Settings | Company, Users & roles |

## Decisions log

| Date | Decision | Reason |
|---|---|---|
| YYYY-MM-DD | Example: compact density on the Orders list | Staff process 200+ orders a day |
