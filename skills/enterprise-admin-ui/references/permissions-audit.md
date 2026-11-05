# Permissions, approvals and audit

Read this when a screen depends on the user's role, has an approval flow, shows a role or permission matrix, must show who changed a record, or needs status badges.

## Contents
- [Hide, disable or explain](#hide-disable-or-explain)
- [Approver-only actions](#approver-only-actions)
- [Field-level permissions](#field-level-permissions)
- [Roles and permission matrix](#roles-and-permission-matrix)
- [Audit trail](#audit-trail)
- [Approval workflows](#approval-workflows)
- [Impersonation banner](#impersonation-banner)
- [Status vocabulary](#status-vocabulary)
- [Code: StatusBadge](#code-statusbadge)
- [Code: AuditStamp](#code-auditstamp)

## Hide, disable or explain

Baseline without this skill: permission screens passed 36% of the checklist, and approver-only actions with a reason passed 1 of 2 reviews. Pick one of three treatments per control.

| Situation | Treatment | Example |
|---|---|---|
| The role can never use it (no module access, no such action in the role) | Hide the control, the menu item and the link [Fiori] | A Sales clerk sees no "Payroll" in the sidebar |
| Temporarily unavailable and the fix is obvious | Disable and put the reason as visible text next to or under the control | "Select at least one invoice to approve" under a disabled `Approve` |
| Temporarily unavailable and the reason is not obvious | Keep the control enabled; when used, explain what is missing and who can fix it [Fiori] | `Post journal` opens "This period is closed. Ask a Finance manager to reopen it." |
| Someone else must act first | Replace the action with a status line (see below) | "Waiting for Trần Minh Quân (Finance manager)" |

- The reason is text in the page, not a tooltip. Tooltips do not appear on touch, on keyboard focus of a disabled button, or for screen readers that skip disabled controls [Atlassian advises against tooltips on disabled buttons; WCAG 1.4.13].
- Link the reason to the control with `aria-describedby` so assistive tech reads it with the button.
- The server enforces every permission. Hiding is for clarity, and a direct URL to a forbidden page shows a "You don't have access to X. Ask an administrator for the Y role." state, not a blank page or a redirect to login (see `feedback-states.md`).
- A disabled control keeps `text-muted-foreground` for its label and stays at least 4.5:1 for the reason text; the reason is body text, never a faded caption.

## Approver-only actions

- The current approver sees `Approve` (primary) and `Reject` (`variant="outline"`, with `text-destructive` for Reject), next to each other at the top of the record or in its sticky action bar.
- `Reject` opens an `AlertDialog` with a required reason field (min 1 character; show the counter only for long limits). The dialog title names the record: "Reject purchase request PR-2041?". `AlertDialogCancel` (`Cancel`) comes first and Radix focuses it on open; `AlertDialogAction` (`Reject request`) comes last with `className={buttonVariants({ variant: 'destructive' })}`. The action's `onClick` calls `e.preventDefault()` first, so an empty reason keeps the dialog open with its message under the field, and a valid one keeps it open until the request succeeds.
- Everyone else sees, in the same place, one line of text: "Waiting for Trần Minh Quân (Finance manager)". Name the person and the role; when a group can approve, name the group and list up to 3 members: "Waiting for any of Finance managers (3)".
- The requester sees `Withdraw request` while the status is Submitted or In approval, plus the line above.
- After a decision the action area is replaced by the outcome: "Approved by Trần Minh Quân on 04/11/2026 15:58" or "Rejected by … — Reason: …".
- An approver cannot approve their own request when the policy says so; show "You requested this, so another approver must decide" `[inferred]`.

## Field-level permissions

- A field the role can see but not edit renders as read-only display: label above, value as plain text (`text-foreground`), not a greyed input. Disabled inputs read as broken and fail contrast [Fiori edit/display split; `[inferred]`].
- In edit mode, put a small lock icon (16px, `aria-hidden`) and the text "Only Finance can edit" in `text-muted-foreground` under the value when the reason helps.
- A field the role may not even see is hidden, and the layout closes up. Mask partial data in the value itself: "•••• 4821", with a `Reveal` button when the role may reveal it and an audit entry is written for each reveal.
- Bulk edit, import and API paths apply the same field rules; the import preview lists the columns the role cannot set and skips them with a message.

## Roles and permission matrix

Baseline without this skill: the matrix brief had no explicit save with a dirty indicator (0/2), delete without the affected users (0/2) and matrix accessible names at 1/2.

**Structure.** A role page has a header (role name, description, user count "12 users"), the matrix, and a sticky bar.

1. **Real table semantics.** `<table>` with `<th scope="col">` for each action (View, Create, Edit, Delete, Approve, Export) and `<th scope="row">` for each module. Use a visible caption or `aria-label`, not both. Never lay the matrix out with divs [SLDS, Atlassian].
2. **Checkbox names.** Every checkbox has an accessible name "<module> – <action>": "Invoices – Approve". With the row and column headers this reads correctly in table mode and out of it.
3. **Toggles.** A row toggle sets all actions of a module ("Invoices – all actions"), a column toggle sets one action for all modules ("Approve – all modules"). Each shows checked, unchecked or indeterminate (`aria-checked="mixed"`) from its children. Groups of modules (Sales, Finance, HR) get a group row that works the same way.
4. **Dependencies** `[inferred]`. Checking Edit also checks View; unchecking View clears the others. Say so in text beside the row on change ("Edit needs View, so View is on"), in a `role="status"` region.
5. **Density.** Rows are 40px `[inferred]`; keep the module column and the header row sticky for matrices wider or taller than the viewport `[inferred]`. Targets stay at least 24×24px.
6. **Locked system roles.** A built-in role (Owner, Administrator) shows its checkboxes checked and disabled, with a line at the top: "Owner is a system role. Its permissions are fixed so the account always has an administrator." Offer `Duplicate role` as the way forward.
7. **Explicit save.** Changes are held locally. While there are differences from the saved version, the sticky bar `[inferred]` shows "Unsaved changes" with the count ("5 changes") beside `Cancel` and `Save` (primary, rightmost), as in every form's sticky bar. Warn on navigating away (`beforeunload` plus in-app routing). Keep one save model per form: no save-on-click inside a matrix [Primer].
8. **Review before saving high-impact changes.** When a change widens access to money or personal data, the Save dialog lists the diff: "Invoices – Approve: off → on" `[inferred]`.
9. **Delete a role** names the role and the impact: "Delete role Sales staff? 12 users will lose these permissions." If users are assigned, require choosing a replacement role or confirm they will have none. Link the number to the filtered user list. The dialog is an `AlertDialog`: `AlertDialogCancel` (`Keep role`) comes first and Radix focuses it on open; `AlertDialogAction` (`Delete role`) comes last with `className={buttonVariants({ variant: 'destructive' })}` and `onClick={(e) => { e.preventDefault(); void confirm() }}`, so the dialog stays open while the request runs, closes on success and shows the error on failure (see `feedback-states.md`).
10. **Role list.** Columns: Role (name), Description, Users (right-aligned count, linked), Type (System or Custom badge, neutral tone), Last changed (see [Audit trail](#audit-trail)). Row actions in an overflow menu named after the role.
11. **Assigning roles to a user** shows the effective permissions as a read-only summary beneath the selector: "Includes: approve invoices, export reports".

## Audit trail

Baseline without this skill: "last changed by / audit history" failed 0 of 2. The digest found no system that specifies audit UI, so everything here is `[inferred]` from the checklist and common practice.

1. **Stamp on every record, role and settings page**, directly under the title or at the foot of the form: "Last changed by Lê Hoa on 04/11/2026 15:58". The user name is a link to the user; the stamp links to the History tab or page.
2. **Absolute timestamps** in audit surfaces, format `dd/MM/yyyy HH:mm` for the project locale via `formatDateTime` from `@/lib/format` (`data-formatting.md`), in the user's time zone. Relative time ("2 hours ago") may follow the absolute value in `text-muted-foreground`, never replace it [Ant, Primer; `[inferred]` for audit].
3. **History tab** on every record page, newest first, grouped by event:

   | Column | Content |
   |---|---|
   | When | `04/11/2026 15:58` |
   | Who | Name (link), or "System" / "Import job 218" for automated changes |
   | What | "Updated 2 fields", "Status changed", "Created", "Deleted attachment" |
   | Detail | Expand to field diffs |

4. **Field diffs** show label, old value, arrow, new value: "Credit limit: 50.000.000 ₫ → 80.000.000 ₫". Use "(empty)" for blank old or new values. Numbers keep right alignment and tabular figures in diff tables. Mask sensitive fields ("changed") instead of printing them.
5. **Filters**: user (select with search), date range (from and to, absolute dates), and event type. Show applied filters as chips with "Clear all", as in `filters-search.md`. Keep them in the URL.
6. **Export** the filtered history as CSV; records of work must be portable [NN/g].
7. History is read-only and cannot be deleted from the UI. Retention is stated at the foot: "History is kept for 7 years." (use the real policy).
8. Empty history is not possible for an existing record (it has a "Created" entry); a filtered history with no matches uses the no-results state.
9. Lists get a "Last changed" column with the absolute date; the user name goes in its own column or on the detail page, because rows stay single-line.

## Approval workflows

Baseline without this skill: approval step details and Approve/Reject-with-reason passed 2 of 2; attachments with type, size, preview and download failed (0/2).

1. **Steps** form a vertical list on the record page (a timeline), one block per step. Each shows: step name and approver (name + role), the decision (Approved, Rejected, Waiting, Skipped) as a status badge, the timestamp `dd/MM/yyyy HH:mm` once decided, and the comment. A rejected step always shows the reason.
2. **Current step** is marked with the info tone and the text "Current step"; future steps are neutral ("Not started"). Parallel approvers within a step each have their own line.
3. **State machine** `[inferred]` (the digest specifies no approval states). Show only these, with the tone from the table below, and allow only the transitions listed:

   | From | To | Who |
   |---|---|---|
   | Draft | Submitted | Requester submits |
   | Submitted | In approval | System, when the first step opens |
   | Submitted, In approval | Withdrawn | Requester withdraws (terminal) |
   | In approval | Approved | Last required approver |
   | In approval | Rejected | Any approver, with reason |
   | Rejected | Draft | Requester edits and resubmits |

   Terminal states (Approved, Withdrawn) have no actions except `Duplicate`. There is no "Cancelled" state; a withdrawn request is the cancelled one.
4. **Editing during approval.** A request in approval is read-only except for the withdraw action; a changed amount restarts the flow, and the dialog says so: "Changing the amount sends this request back to step 1." [inferred]
5. **Delegation and reassignment** are audit events: "Trần Minh Quân delegated to Lê Hoa until 10/11/2026".
6. **Attachments** are a small table or list: file name (link), type ("PDF"), size ("1,2 MB" via `formatNumber(1.2, locale, { style: 'unit', unit: 'megabyte', maximumFractionDigits: 1 })`), uploaded by and when, and two actions, `Preview` and `Download`, both with the file name in their accessible name ("Download hop-dong-minh-phat.pdf"). Files that cannot be previewed (zip, unknown) hide `Preview`. A failed preview shows an inline error with `Download` as the way out. Show the upload progress and a per-file error with Retry.
7. **Comments** on the request are part of the same timeline, with author and absolute time. Mentions notify but do not approve.

## Impersonation banner

- **Impersonation** ("view as" or support login) shows a persistent banner at the very top of every page, above the header, with the warning tone: "Viewing as Lê Hoa (Sales staff). You can act on their behalf. All actions are recorded under both names." and `Exit` at the right. The banner is not dismissible and does not scroll away `[inferred]`. Use `role="status"` rendered once; the text changes with the session.
- Actions taken while impersonating are written to the audit trail as "Admin Nguyễn An as Lê Hoa".
- Sensitive actions (change password, MFA, payments) are disabled while impersonating, with the visible reason text.
- The tenant switcher is specified in `navigation-layout.md` only.
- The tenant name appears in the page title (`<title>`) so users with several tabs open can tell them apart `[inferred]`.

## Status vocabulary

Baseline without this skill: rainbow status palettes appeared in 4 of 16 reviews and a shared status vocabulary passed 1 of 2. Fix one vocabulary for the whole app and write it in DESIGN.md.

**Five tones.** Every status maps to one:

| Tone | Meaning | Token classes | Icon (lucide) |
|---|---|---|---|
| Neutral | No action expected, inactive, planned | `bg-neutral-subtle text-neutral-subtle-foreground` | `Circle` |
| Info | In progress, waiting, pending | `bg-info-subtle text-info-subtle-foreground` | `Clock` |
| Success | Done, healthy, paid | `bg-success-subtle text-success-subtle-foreground` | `CircleCheck` |
| Warning | Needs attention soon | `bg-warning-subtle text-warning-subtle-foreground` | `TriangleAlert` |
| Danger | Failed, blocked, overdue | `bg-danger-subtle text-danger-subtle-foreground` | `CircleX` |

**Mapping examples** (extend per entity; one status = one tone everywhere it appears):

| Entity | Neutral | Info | Success | Warning | Danger |
|---|---|---|---|---|---|
| Order | Draft, Archived | Confirmed, Packing, Shipping | Delivered, Completed | Partially shipped, Backordered | Cancelled, Returned |
| Invoice | Draft, Void | Sent, Partially paid | Paid | Due soon | Overdue, Rejected |
| Request | Draft, Withdrawn | Submitted, In approval | Approved |  | Rejected |

- `[inferred]` The mapping is the skill's choice. Carbon's colour meanings (red error, yellow warning, green success, blue in progress, grey draft) are the base; purple, orange and teal are not used [Carbon].
- **Badge anatomy:** pill (`rounded-full`), `h-6` (24px), `px-2`, 12px medium text with `leading-5` so Vietnamese marks are not clipped by the fixed height and `truncate`, a 16px icon or 8px dot at the left, then the label in sentence case. The text is the status name itself ("In approval"), at most 200px wide, truncated only with the full name in the title attribute [Atlassian].
- **Colour is never the only signal.** Each badge carries text, and the shape or icon differs per tone, at 3:1 contrast against its background [Carbon, WCAG 1.4.1]. Row highlight colour is never used as the status [Atlassian].
- **No per-status rainbow.** If a workflow has 9 statuses, group them into the five tones; do not add a colour. Show at most 5–6 distinct statuses in one view [Carbon]; when more exist, filter or group them.
- A badge is not interactive. Filters use chips or tabs with counts; do not make the badge a button.
- Counts use a different element: a neutral count next to a tab label, not a status badge.
- Signed amounts take their sign from the formatter: `formatMoney(value, currency, locale, { signDisplay: 'exceptZero' })` prints `+250.000 ₫` and `-250.000 ₫`. Their text colour stays neutral; colour is added only when the sign is itself the status, and magnitude is never shown by colour alone [Carbon, NN/g].

## Code: StatusBadge

One component, one tone map. Pass the entity status through a per-entity map in the feature code so the tone stays out of JSX.

```tsx
import { Circle, CircleCheck, CircleX, Clock, TriangleAlert, type LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'

export type StatusTone = 'neutral' | 'info' | 'success' | 'warning' | 'danger'

const tones: Record<StatusTone, { classes: string; Icon: LucideIcon }> = {
  neutral: { classes: 'bg-neutral-subtle text-neutral-subtle-foreground', Icon: Circle },
  info: { classes: 'bg-info-subtle text-info-subtle-foreground', Icon: Clock },
  success: { classes: 'bg-success-subtle text-success-subtle-foreground', Icon: CircleCheck },
  warning: { classes: 'bg-warning-subtle text-warning-subtle-foreground', Icon: TriangleAlert },
  danger: { classes: 'bg-danger-subtle text-danger-subtle-foreground', Icon: CircleX },
}

// One vocabulary for the app; keep it in sync with DESIGN.md.
export const invoiceStatus: Record<string, StatusTone> = {
  Draft: 'neutral',
  Sent: 'info',
  'Partially paid': 'info',
  Paid: 'success',
  'Due soon': 'warning',
  Overdue: 'danger',
}

export function StatusBadge({ tone, children, className }: {
  tone: StatusTone
  children: string
  className?: string
}) {
  const { classes, Icon } = tones[tone]
  return (
    <span
      className={cn(
        'inline-flex h-6 max-w-[200px] items-center gap-1 rounded-full px-2 text-xs leading-5 font-medium',
        classes,
        className,
      )}
    >
      <Icon className="size-4 shrink-0" aria-hidden="true" />
      <span className="truncate" title={children}>{children}</span>
    </span>
  )
}

// <StatusBadge tone={invoiceStatus[row.status]}>{row.status}</StatusBadge>
```

## Code: AuditStamp

Absolute `dd/MM/yyyy HH:mm` through `formatDateTime` from `@/lib/format` (`data-formatting.md`), which formats the date and the time apart and joins them, so vi-VN does not put the time first. `locale` and `timeZone` are required props: pages pass `LOCALE` and `TIME_ZONE` from `@/lib/locale`, and when the locale is a per-user setting they pass the user's setting instead.

```tsx
import { formatDateTime } from '@/lib/format'
import { cn } from '@/lib/utils'

type AuditStampProps = {
  changedBy: { name: string; href: string }
  changedAt: string // ISO 8601
  historyHref: string
  locale: string
  timeZone: string // IANA name
  className?: string
}

export function AuditStamp({ changedBy, changedAt, historyHref, locale, timeZone, className }: AuditStampProps) {
  return (
    <p className={cn('text-sm text-muted-foreground', className)}>
      Last changed by{' '}
      <a href={changedBy.href} className="font-medium text-foreground underline-offset-2 hover:underline">
        {changedBy.name}
      </a>{' '}
      on <time dateTime={changedAt}>{formatDateTime(changedAt, locale, timeZone)}</time>
      {' · '}
      <a
        href={historyHref}
        className="inline-flex min-h-6 items-center text-primary underline-offset-2 hover:underline"
      >
        View history
      </a>
    </p>
  )
}

// import { LOCALE, TIME_ZONE } from '@/lib/locale'
// <AuditStamp changedBy={{ name: 'Lê Hoa', href: '/users/42' }} changedAt="2026-11-04T08:58:00Z"
//   historyHref="?tab=history" locale={LOCALE} timeZone={TIME_ZONE} />
// vi-VN, Asia/Ho_Chi_Minh: "Last changed by Lê Hoa on 04/11/2026 15:58 · View history"
```
