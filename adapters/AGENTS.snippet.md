<!-- Paste into AGENTS.md or CLAUDE.md. Generated from skills/enterprise-admin-ui/SKILL.md. Do not edit by hand. -->

## Management screens (enterprise-admin-ui)

For admin panels, back-office, ERP, CRM, HRM, accounting, inventory and B2B SaaS screens behind a login, load the `enterprise-admin-ui` skill and follow its page recipes. Where the skill is not installed, build with these defaults.

Every screen ships with:

- **States:** every list and section that shows data has an empty state with its next action, a skeleton while loading, and an inline error with Retry, reachable through `?state=` (States).
- **One primary action** in the header, for the main task: "Renew contract" on a contract, "Create order" on orders.
- **Confirmation** for delete, terminate and cancel. The dialog names the record and the consequence, and focus starts on Cancel.
- **Single-line rows:** name and code go in separate columns, never stacked in one cell.
- **Dates that matter** show the absolute date and the time left in words ("Expires 28/02/2027 · in 56 days"). Overdue and due-soon items come first.
- **Forms:** labels above fields, an error summary that moves focus to the first invalid field, a sticky Save/Cancel bar and an unsaved-changes warning. Uploads state the accepted types and size limit.
- **Announcements:** success toasts name the record, and status and error messages use `role="status"` or `role="alert"`.

Foundations:

- **Font:** System UI stack; weights 400/500/600. 14px (`text-sm`): body, table cells, field labels (`text-sm font-medium`), help text and error messages. 12px (`text-xs`): captions, badges, nav group labels, timestamps under a title. 20–24px: page title
- **Text colour:** Body `#0f172a`. Secondary text `#475569` (slate-600) or darker; slate-500 only on white or slate-50; slate-400 and lighter never carry text. Re-check 4.5:1 on tinted and dark surfaces. White text sits only on 700-shade fills (blue-600 and red-600 also pass), not on -500 fills or on green, emerald, amber, teal or sky-600. Badge text uses the 700–800 shade on the 50 background, or the `-subtle` token pair.
- **Case:** Sentence case for titles, labels, table headers, tabs and buttons
- **Spacing:** 4px base: 4, 8, 12, 16, 24, 32
- **Controls:** 32px high (40px for touch)
- **Radius:** 4px controls, 6px cards, 8px dialogs; fully rounded only for badges and chips
- **Surfaces:** Page and cards white or slate-50; cards have a 1px border and no shadow; shadows belong to menus, popovers, dialogs and toasts
- **Shell:** Light neutral sidebar with a subtle active background; the single accent colour marks primary buttons, links, focus and selection: DESIGN.md's accent, or `#1d4ed8` (blue-700) when DESIGN.md has none
- **Status:** One vocabulary for the whole app, five tones, always with text: neutral (Draft, Archived), info (Pending, In progress), success (Completed, Paid), warning (Due soon, Needs attention), danger (Failed, Rejected, Overdue). Map every entity status to a tone in DESIGN.md.
- **Icons:** One icon set (lucide with shadcn), 16px

Replace these template tells:

- ALL-CAPS tracked labels and table headers (`uppercase tracking-wide`) → Sentence case, normal tracking, sizes from Font above
- Dark navy sidebar with an indigo accent → Light neutral sidebar; accent only on primary actions and selection
- A different colour for every status → The five-tone status vocabulary

Before you finish a screen, confirm:

- Every list and related list has first-use, no-results, loading and error states
- Form fields sit one per row, except a pair that reads as one value
- Save stays enabled until submit; the error summary and unsaved-changes warning exist
- Filters show as chips with Clear all; the bulk bar offers "Select all N matching"
- Destructive actions name the object and the impact
- Records show who changed them and when
- Unavailable actions say why
- Dashboard deltas state their period; attention items link to filtered lists
