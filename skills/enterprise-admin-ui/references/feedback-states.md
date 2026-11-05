# Feedback and states

Read this when you design the empty, loading, error and progress states of a data region, choose between a toast, inline message, banner or dialog, write a delete confirmation, or build an import or bulk job.

## Contents
- [State matrix per data region](#state-matrix-per-data-region)
- [Loading thresholds](#loading-thresholds)
- [Toast, inline, banner or dialog](#toast-inline-banner-or-dialog)
- [Destructive confirmation](#destructive-confirmation)
- [Long jobs](#long-jobs)
- [Bulk partial failure](#bulk-partial-failure)
- [Accessibility](#accessibility)
- [Code: EmptyState and TableSkeleton](#code-emptystate-and-tableskeleton)

## State matrix per data region

A data region is anything that loads data on its own: a table, a related list on a detail page, a dashboard widget, a chart, an activity feed, a select with remote options. RED: states were missing on 4 of 8 briefs, and 0 of 2 reviewed dashboards had per-widget loading or empty states (F3). Design every row of this matrix for every region, and use the region's own entity in the copy.

| State | Cause | Show | Example copy |
|---|---|---|---|
| First use | The entity has no records at all | One sentence on what belongs here + the primary action | "No orders yet. Orders from every channel appear here." · `Create order` |
| No results | Records exist, filters or search hide them | Say what was searched + `Clear filters`; no create button as the main action | "No orders match these filters." · `Clear filters` |
| Loading | First request in flight | Skeleton in the final layout (see thresholds) | no text; `aria-busy` |
| Error | Request failed | What failed + `Retry`; keep data that is still valid, dimmed | "Couldn't load orders. Check your connection and try again." · `Retry` |
| Partial failure | Some parts loaded, some did not | Show what loaded; mark the failed part in place with its own Retry | "Revenue couldn't be loaded." · `Retry` (other widgets stay) |
| Degraded / offline | A dependency is down or the browser is offline | Keep navigation and cached data; one banner names the effect; hide figures you cannot compute instead of showing 0 [Primer] | "Showing data from 15:40. Live updates are paused." |
| No permission | The role cannot see the region | Say why and who can grant access | "You don't have access to payroll. Ask an administrator for the HR role." |

- First use and no results are different states with different words and actions. A table that shows "No data" for both fails the user in one of them [Carbon, Ant; RED F2].
- Keep the region's frame (table header, card title, tab) visible in every state, and put the message in the body so the user keeps the column context [Ant].
- Empty states are 1 sentence, a primary action and at most one secondary link to documentation. No illustration larger than 64px; this is an app, not a marketing page.
- Related lists on a detail page have their own empty state with the next step: "No contacts yet · Add contact".
- The empty state of a dashboard widget says what the widget measures and why it is empty: "No late shipments in the last 7 days" is a good result, so it gets the success tone (`bg-success-subtle text-success-subtle-foreground`), not an apology.
- An error never shows a raw status code or stack trace. Offer "Copy details" or a reference ID for support when the server provides one.
- The first load uses a skeleton. A refetch (new sort, page or filter) keeps the old rows at `opacity-60` with `aria-busy="true"` rather than flashing a skeleton [NN/g].
- Hide counts you cannot know; never show "0" for an unavailable figure [Primer].

## Loading thresholds

| Wait | Show |
|---|---|
| Under 1 s | No spinner or progress indicator; a region's first-load skeleton still renders because it holds the layout. Show an indicator only after 1 s |
| 1–10 s | Skeleton blocks in the final layout for page and region loads. A spinner (16px) only inside a button or a small card [NN/g, Primer] |
| Over 10 s | Progress with counts or percent, plus background continuation (see [Long jobs](#long-jobs)) [NN/g, Primer] |

- Skeleton rows match the real rows: same height (40px), same column widths, 8–10 rows for a table. A skeleton in a different layout makes the page jump when data arrives [NN/g].
- Skeleton blocks are `bg-muted` with a gentle pulse (`animate-pulse`); respect `prefers-reduced-motion` with `motion-reduce:animate-none`.
- A button that starts a request disables itself, shows the spinner and keeps its label ("Save"), so the width does not change.
- Give a request that can run beyond 2 seconds a Cancel when cancelling is safe [Ant].
- Never block the whole screen with a full-page spinner or overlay. Navigation stays usable [Primer].
- Time out after 30 seconds for reads and show the error state with Retry.

## Toast, inline, banner or dialog

| Use | For | Do not use for |
|---|---|---|
| Toast | A short success confirmation naming the record: "Invoice INV-1043 saved" | Errors, warnings, anything needing a decision or a second reading |
| Inline message | Errors and warnings tied to a field, row or region; they stay until fixed | Success messages that need no follow-up |
| Banner | A page-level condition: degraded service, a failed save with no field, an expired session | A message about one field |
| Dialog | A decision the user must make now: confirm a destructive action, leave unsaved work | Information, success, errors that need no choice |

- Toasts: success only, one at a time, auto-dismiss after 5 seconds (10 seconds when they carry an action such as Undo), placed top-right, dismissible with a button, pausing on hover and focus [Polaris, Carbon; Fiori limits toasts to short successes]. Durations vary by system (3–10 s) [Ant, Polaris]; use 5 s.
- Critical messages never auto-dismiss [all systems]. An error toast that vanishes is the failure RED saw (persistent inline errors passed 1 of 2).
- Errors are inline and persistent: next to the field, in the failed row, or in the region's error state, until the user fixes the cause or retries.
- One banner at a time, at the top of the content, above the table on a list, not sticky, with a close button only for informational ones [Carbon, Ant]. If several apply, show the most severe and link "2 more issues".
- Banner anatomy: icon + one sentence of what happened + one action. Tone classes: info `bg-info-subtle text-info-subtle-foreground`, warning `bg-warning-subtle text-warning-subtle-foreground`, error `bg-danger-subtle text-danger-subtle-foreground`.
- Dialogs only for decisions. Each has a title that states the decision, a body with consequences, and verb buttons. No dialog opens from a dialog [Carbon].
- Do not announce the same event twice: a saved form shows the toast, not the toast and a banner.

## Destructive confirmation

RED: bulk deletes confirmed with a count (2/2), but deleting a role did not say who is affected (0/2) (F9).

1. Confirm only actions that are serious or hard to undo. Deleting a draft line item needs no dialog; deleting an invoice, role or customer does [NN/g, Carbon].
2. **Name the object and the impact count** in the title or first sentence: "Delete role Sales staff? 12 users will lose these permissions." "Delete 3 invoices? 1 is already paid and can't be restored." If the impact is unknown to the client, fetch it before opening the dialog.
3. **Verb buttons**, not Yes/No/OK: `Delete role` and `Keep role`, `Archive customer` and `Cancel`. Build the dialog as a shadcn `AlertDialog`: `AlertDialogCancel` first, then `AlertDialogAction className={buttonVariants({ variant: 'destructive' })}` last, with the verb + object label. Neither button takes a `variant` prop.
4. **Focus starts on Cancel** (or the safe button) and never on the destructive one; Radix focuses `AlertDialogCancel` on open, so Enter does not delete [Carbon, NN/g]. Esc and the close button cancel.
5. **Typed name for severe actions** only: deleting a workspace, a company, all data of a tenant, or anything in the Danger zone. The destructive button enables when the typed text matches the name exactly; show the name to copy.
6. **Prefer undo for reversible actions**: archive, move to trash, remove a line, unassign. Perform the action at once and show a toast "Customer archived" with `Undo` for 10 seconds. No dialog [NN/g].
7. **Block with a reason when the action cannot be done:** "Can't delete warehouse Hà Nội: 38 products still hold stock." Offer the next step (View products), not just a refusal.
8. After confirming, the button shows a spinner while the request runs; on failure the dialog stays open with an inline error. Radix closes the dialog on `AlertDialogAction` click, so an async confirm uses `onClick={(e) => { e.preventDefault(); void confirm() }}` and closes it on success.
9. After success, a toast names what was done; focus moves to the heading of the page or the next row, never to `<body>`.

## Long jobs

Imports, exports, bulk updates, recalculations and report generation can run for minutes. RED: 0 of 2 reviewed import pages had progress, background continuation or a result summary (F3).

1. **Start:** the confirm button starts the job and the dialog or page turns into a progress view. The user is told what happens next: "Importing 1.200 rows. You can leave this page." A job started from a selection clears it (`bulk-import-export.md`).
2. **Progress:** a determinate bar with counts that say what is being processed: "Importing 340 of 1.200" and the percent. Update at least every 2 seconds `[inferred]`. When the total is unknown, show indeterminate progress and the count so far ("340 rows processed") [NN/g, Primer].
3. **Cancel** is available while the job can still stop, with a confirmation that states what is kept: "Stop import? 340 rows are already imported."
4. **Continue in the background:** a "Run in background" button closes the view; the job shows in a persistent place (a "Jobs" indicator in the header or the import list with a status badge). The user can navigate freely [Primer, NN/g].
5. **Completion notification:** when a background job ends, keep an entry in the jobs list or notifications, and tell the user by the result:
   - full success: a success toast with a link, "Import finished: 1.200 created · View results";
   - any failure: never a toast. A persistent notification, or a banner when the user is on the job's page, that stays until opened: "Import finished: 1.100 created · 50 updated · 50 failed · View results".
6. **Result summary** is a page or panel, not only a toast: three counts **created / updated / failed** (and skipped when relevant), each as a labelled figure, e.g. "1.100 created · 50 updated · 50 failed". Failures are never folded into a success message.
7. **Failed rows:** a table of the failed rows with the row number, the field and a plain reason ("Row 18: Email is not valid"), and a **Download failed rows** button that exports a CSV in the original template format plus an Error column, so the user can fix and re-import [RED F3].
8. A finished job keeps its summary for at least 30 days at a stable URL `[inferred]`.
9. The page title and tab show the state ("Importing 34%…") so a user on another tab can see it `[inferred]`.

Pre-run preview: show per-row errors and the error count before the job starts ("1.200 rows · 14 with errors") and let the user either fix the file or continue with valid rows only.

## Bulk partial failure

- After a bulk action on N selected items, report all three numbers: "48 updated, 2 failed". Never "Done" when anything failed.
- The message is a persistent banner at the top of the content, above the table, not a toast: `role="status"`, warning tone, with the link "View failed (2)".
- The failed items open as a list with the reason for each ("DH-1043: Order is already shipped") and a per-item or bulk **Retry**. After a run in one request, the selection becomes the failed rows on the current page, so one click retries them (`selectIds` in `bulk-import-export.md`).
- For more than 10 seconds of work, show the progress described in [Long jobs](#long-jobs) first ("Updating 3 of 50"), and end with this summary.
- If all items failed, use the error tone and say why once, then list the items. If all succeeded, a success toast is enough: "50 orders updated".
- Do: "48 updated, 2 failed · View failed". Don't: a green toast "Bulk update complete" with a silent failure count.

## Accessibility

- Messages that appear without a focus move are announced: toasts, saved confirmations, result counts, progress milestones and banners use `role="status"` (polite live region). Use `role="alert"` only for errors that block the user's current task [WCAG 4.1.3; SLDS].
- The live region element must exist in the DOM before its text changes. Render the container always and change its content, instead of mounting it together with the message.
- A loading region has `aria-busy="true"` while loading and `false` when done. Announce a skeleton group once, not per block: put `aria-busy` on the group and keep the blocks `aria-hidden="true"` [Primer].
- Progress bars use `role="progressbar"` with `aria-valuenow`, `aria-valuemin`, `aria-valuemax` and a label ("Import progress"); update the status text, not every tick, for screen readers.
- Move focus only for dialogs and for form errors. Opening a dialog focuses its safe button or first field; closing returns focus to the trigger.
- Toasts must not cover focused controls and must stay long enough to read: pause the timer on hover and keyboard focus [WCAG 2.4.11, 2.2.1].
- Colour is never the only signal: banners, badges and inline errors carry an icon and text [WCAG 1.4.1].
- Respect `prefers-reduced-motion` for skeleton pulses and progress animation.

## Code: EmptyState and TableSkeleton

`EmptyState` takes a `variant` so first use and no results cannot be mixed up; `TableSkeleton` keeps the table header and renders rows at the final height. The table's always-rendered result-count region (`role="status"`, see `filters-search.md`) announces the empty state, so `EmptyState` carries no live role of its own.

```tsx
import type { ReactNode } from 'react'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { TableBody, TableCell, TableRow } from '@/components/ui/table'

type EmptyStateProps =
  | { variant: 'first-use'; entity: string; description: string; actionLabel: string; onAction: () => void }
  | { variant: 'no-results'; entity: string; onClear: () => void }

export function EmptyState(props: EmptyStateProps) {
  const first = props.variant === 'first-use'
  return (
    <div className="flex flex-col items-center gap-3 px-6 py-12 text-center">
      <p className="text-base font-medium text-foreground">
        {first ? `No ${props.entity} yet` : `No ${props.entity} match these filters`}
      </p>
      {first && <p className="max-w-sm text-sm text-muted-foreground">{props.description}</p>}
      {props.variant === 'first-use' ? (
        <Button onClick={props.onAction}>{props.actionLabel}</Button>
      ) : (
        <Button variant="outline" onClick={props.onClear}>Clear filters</Button>
      )}
    </div>
  )
}

export function TableSkeleton({ columns, rows = 8 }: { columns: ReactNode[]; rows?: number }) {
  return (
    <TableBody aria-busy="true">
      {Array.from({ length: rows }, (_, r) => (
        <TableRow key={r} className="h-10 hover:bg-transparent" aria-hidden="true">
          {columns.map((_, c) => (
            <TableCell key={c} className="py-0">
              <Skeleton className="h-4 w-full motion-reduce:animate-none" />
            </TableCell>
          ))}
        </TableRow>
      ))}
    </TableBody>
  )
}

// Usage inside the table body: show the message in one cell that spans all columns.
// <TableRow><TableCell colSpan={cols}><EmptyState variant="no-results" entity="orders" onClear={clear} /></TableCell></TableRow>
```
