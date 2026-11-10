# Northwind Distribution - Customers

Product: Northwind Distribution, an order desk for a regional wholesale distributor.
Roles: order clerk (edits customers), warehouse lead (reads), finance (reads).
Locale: en-US; dates MM/DD/YYYY.
Accent: blue-700 (`#1d4ed8`).

## Status vocabulary

| Status | Tone |
|---|---|
| Active | success |
| On hold | warning |

## Conventions

- Rows: 52px (`h-[52px]`); Customer cell shows name with the email below it as a link; keep.
- The edit form arranges related short fields in pairs on two columns from the `md` breakpoint (Phone and Email, City and Postal code), in task order; below `md` it is one column.
