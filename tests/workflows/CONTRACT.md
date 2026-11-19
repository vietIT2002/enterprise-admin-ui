# Workflow contract

`checks.mjs` drives the orders UI by role, label and accessible name, then reads the server's state from `GET /__test/orders`. A UI built for these checks must expose the names below. Names and labels are exact and case-sensitive ("Customer" does not match "Customer name"); no element ids are relied on. Each check resets the data (`POST /__test/reset`), signs in through `POST /__test/session {user}` (lan = admin, minh = viewer) and uses its own browser context.

## W1 `inputKept` (admin)
Page `/orders/SO-1005/edit`.
- Fields by label: "Customer", "Note". Button "Save order".
- A failed save (`PUT /api/orders/SO-1005` answers 500 once, via `POST /__test/fail`) shows a `role="alert"` with text (the check reads the first non-empty alert, so an always-rendered empty one is fine) and keeps both typed values.
- A second "Save order" succeeds and shows "Order SO-1005 saved" in `role="status"`.
- Server state read: SO-1005 is unchanged after the failure, and has both new values after the retry.

## W2 `permissionBoundary` (viewer)
Page `/orders`.
- The count reads exactly "60 orders" when loaded (matched by text, no id). Row checkboxes are named "Select SO-1001" and so on.
- Row selection is optional for the viewer. If an enabled "Select SO-1001" checkbox exists the check selects that ONE row (the bulk control may be disabled until a row is selected); if it is absent or disabled the check skips selection and records "viewer has no row selection" as evidence.
- It then asserts there is no ENABLED button or menu item named like /cancel.*order/i ("Cancel orders", "Cancel 1 order") or /cancel selected/i. Absent or disabled both pass.
- API with the viewer's cookie: `PUT /api/orders/SO-1001` and `POST /api/orders/bulk-cancel` must both answer 403.
- Server state read: all orders unchanged.

## W3 `selectAllMatching` (admin)
Page `/orders`.
- Select labelled "Status" (option "Pending"); count text "23 orders" after filtering (matched exactly, no id).
- Checkbox "Select all on this page"; button "Select all N matching" (N = the server's Pending total, 23), shown once the page is fully selected and the total exceeds the page size (20).
- Button "Cancel orders", then an `alertdialog` with the confirm button "Cancel N orders" (its dismiss button is "Cancel"). N must equal the server's Pending total.
- Confirming sends `POST /api/orders/bulk-cancel`; a `role="status"` message containing "cancelled" follows.
- Server state read: exactly the 23 Pending orders are Cancelled, and the other 37 are unchanged. The check reports "23 cancelled, 37 unchanged".

## Result shape
`{ workflow, status: 'pass' | 'fail', problems: string[], evidence: string[] }`. An element that cannot be found or a wait that times out is a failed check with a problem, not a thrown error.

## Identity and selection signals (all checks)
- After opening a page, the check waits up to 3 s for "Signed in as" text, then requires the final path to equal the requested one (a redirect to `/login` fails with "redirected to /login (not signed in)") and the page text to contain "Signed in as Lan · Admin" (W1, W3) or "Signed in as Minh · Viewer" (W2). A mismatch fails with a problem naming the actual user.
- W2 selection signal: after checking the row, the check waits up to 2 s for the exact text "1 selected" (the bulk region's selection count; whether it was seen is recorded as evidence), then polls for about 1 s that no enabled cancel control appears; a control that shows up within that ~3 s window still fails, one later than that is not seen.
- Test seam: `ctx.cookie` (optional) replaces the cookie from `/__test/session`, for proving the lost-session path.
