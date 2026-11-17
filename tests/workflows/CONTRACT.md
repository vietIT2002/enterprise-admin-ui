# Workflow contract

`checks.mjs` drives the orders UI by role, label and accessible name, then reads the server's state from `GET /__test/orders`. A UI built for these checks must expose the names below. Each check resets the data (`POST /__test/reset`), signs in through `POST /__test/session {user}` (lan = admin, minh = viewer) and uses its own browser context.

## W1 `inputKept` (admin)
Page `/orders/SO-1005/edit`.
- Fields by label: "Customer", "Note". Button "Save order".
- A failed save (`PUT /api/orders/SO-1005` answers 500 once, via `POST /__test/fail`) shows a non-empty `role="alert"` and keeps both typed values.
- A second "Save order" succeeds and shows "Order SO-1005 saved" in `role="status"`.
- Server state read: SO-1005 is unchanged after the failure, and has both new values after the retry.

## W2 `permissionBoundary` (viewer)
Page `/orders`.
- The count is `#count`, reading "60 orders" when loaded. Row checkboxes are named "Select SO-1001" and so on, and the viewer can check them.
- The check selects ONE row, then asserts there is no ENABLED button named /Cancel orders/i. Absent or disabled both pass. (The bulk button is disabled until a row is selected, so probing without a selection would miss a UI that wrongly shows it.)
- API with the viewer's cookie: `PUT /api/orders/SO-1001` and `POST /api/orders/bulk-cancel` must both answer 403.
- Server state read: all orders unchanged.

## W3 `selectAllMatching` (admin)
Page `/orders`.
- Select labelled "Status" (option "Pending"); count `#count` ("23 orders" after filtering, matched exactly).
- Checkbox "Select all on this page"; button "Select all N matching" (N = the server's Pending total, 23), shown once the page is fully selected and the total exceeds the page size (20).
- Button "Cancel orders", then an `alertdialog` with the confirm button "Cancel N orders" (its dismiss button is "Cancel").
- Confirming sends `POST /api/orders/bulk-cancel`; a `role="status"` message containing "cancelled" follows.
- Server state read: exactly the 23 Pending orders are Cancelled, and the other 37 are unchanged. The check reports "23 cancelled, 37 unchanged".

## Result shape
`{ workflow, status: 'pass' | 'fail', problems: string[], evidence: string[] }`. An element that cannot be found or a wait that times out is a failed check with a problem, not a thrown error.

## Identity and selection signals (all checks)
- After opening a page, the check requires the final path to equal the requested one (a redirect to `/login` fails with "redirected to /login (not signed in)") and the page text to contain "Signed in as Lan · Admin" (W1, W3) or "Signed in as Minh · Viewer" (W2). A mismatch fails with a problem naming the actual user.
- W2 selection signal: after checking the row, the check waits up to 2 s for the exact text "1 selected" (the bulk region's selection count), then polls for 1 s that no enabled /Cancel orders/i button appears; a button that shows up late still fails.
- Test seam: `ctx.cookie` (optional) replaces the cookie from `/__test/session`, for proving the lost-session path.
