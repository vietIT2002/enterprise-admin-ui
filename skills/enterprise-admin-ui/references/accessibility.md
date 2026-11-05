# Accessibility

Read this when you build or review any screen for keyboard, screen-reader, zoom or contrast support. The target is WCAG 2.2 level AA.

## Contents
- [How to use this checklist](#how-to-use-this-checklist)
- [Keyboard and focus](#keyboard-and-focus)
- [Names, roles and tables](#names-roles-and-tables)
- [Forms](#forms)
- [Live regions and messages](#live-regions-and-messages)
- [Colour and contrast](#colour-and-contrast)
- [Targets and pointer input](#targets-and-pointer-input)
- [Reflow, zoom and text spacing](#reflow-zoom-and-text-spacing)
- [Dialogs and menus](#dialogs-and-menus)
- [Motion and time limits](#motion-and-time-limits)
- [Language](#language)
- [Testing](#testing)

## How to use this checklist

- Each item is something the finished screen does, followed by the WCAG 2.2 success criterion (SC) it satisfies: `[WCAG 2.4.11]`. All cited criteria are level A or AA; the two AAA ones are marked. Items that come from a design system carry its tag; the rest are `[inferred]`.
- **While building,** apply the section for the component you are writing. **While reviewing,** walk every section on each screen and report each miss as one finding, with the SC number as the rule (`WCAG 2.4.11`).
- The skill's defaults already cover part of the list: the `tokens.css` colour pairs, 32px controls and row-action buttons (`size-8`), 40px rows and 24px chip-remove buttons; 24px is the minimum for any target. The checks below catch what defaults cannot: names, focus order, live regions, dialogs and reflow.
- Check the failures seen most in admin UIs first: focus hidden behind sticky bars, unnamed icon buttons, status shown by colour alone, live regions mounted with their message, small targets, drag-only reordering and tables that break reflow.
- Details live in the topic references: validation in `forms.md`, messages in `feedback-states.md`, selection and sorting in `tables.md`, the shell and responsive rules in `navigation-layout.md`.

## Keyboard and focus

- **Order:** Tab follows the visual order: skip link, sidebar, header, page header, filter bar, bulk bar, table, pagination, sticky action bar. DOM order matches the layout and no element has a positive `tabindex` [WCAG 2.4.3, 1.3.2].
- **Everything works by keyboard:** sort headers, the Columns menu, row menus, inline edit (Enter edits, Esc cancels), matrix checkboxes, date pickers and file upload (a "Choose file" button beside the drop zone) [WCAG 2.1.1]. Controls that appear on row hover also appear on focus (`tables.md`).
- **Visible focus:** every focusable element shows a 2px ring in `--ring` with at least 3:1 against the surface around it [WCAG 2.4.7, 1.4.11]. The accent `#1d4ed8` reaches 6.70:1 on white. Some shadcn versions draw the ring as `ring-ring/50`; at 50% opacity it falls to 2.36:1 on white, so use the full `ring-ring`.
- **Forced colours:** a Tailwind `ring` is a box-shadow, which Windows forced-colours mode removes. Keep an outline as well: CSS `outline`, or the transparent one that Tailwind v3 `outline-none` and v4 `outline-hidden` leave behind `[inferred]`.
- **Focus not hidden:** a focused element is never fully covered by a sticky table header, bulk bar, action bar, totals row or toast [WCAG 2.4.11]. On the scroll container set `scroll-padding-top` to the height of what sticks at the top (header row 40px: `scroll-pt-10`) and `scroll-padding-bottom` to the sticky bar (`scroll-pb-20`). The bulk bar sits above the table, never floating at the bottom (`tables.md`).
- **Skip link:** the first focusable element is "Skip to main content", visible on focus, pointing at `<main id="main" tabindex="-1">` [WCAG 2.4.1].
- **Composite widgets take one Tab stop and move with arrow keys:** menus, tabs, tree navigation and the command palette list, by roving `tabindex`, or by `aria-activedescendant` when focus stays in an input (the palette, comboboxes) `[inferred]`. An editable, spreadsheet-like grid works the same way: arrows move, Enter edits, Esc leaves edit mode [SLDS]. A read-only data table stays a plain `<table>` where Tab moves through its links and buttons `[inferred]`.
- **Esc closes the topmost overlay** (menu, popover, dialog, side panel, palette) and focus returns to the control that opened it. A dialog's focus loop is no keyboard trap because Esc and Cancel leave it [WCAG 2.1.2].
- **Focus after a change:** after a row is deleted, focus moves to the next row or the page heading, never to `<body>` (`feedback-states.md`). Choosing a filter value or page size updates the results in place and leaves focus where it was [WCAG 3.2.2].
- **Shortcuts:** single-key shortcuts (`/`, `?`) fire only outside text fields and can be turned off [WCAG 2.1.4, which covers single-key shortcuts only]. Every shortcut also has a button or menu item `[inferred]`.

```html
<!doctype html>
<html lang="vi">
<head>
  <title>Orders · Acme ERP</title>
  <style>
    :focus-visible { outline: 2px solid var(--ring, #1d4ed8); outline-offset: 2px; }
    main:focus { outline: none; } /* the skip-link target, not a control */
    [hidden] { display: none !important; }
  </style>
</head>
<body>
  <a href="#main" class="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-2 focus:z-50 focus:rounded focus:bg-white focus:px-3 focus:py-2 focus:text-sm">Skip to main content</a>
  <aside class="w-60 border-r"><nav aria-label="Main">…</nav></aside>
  <header class="h-12 border-b">…</header>
  <main id="main" tabindex="-1">
    <nav aria-label="Breadcrumb">…</nav>
    <h1 class="text-xl font-semibold">Orders</h1>
  </main>
</body>
</html>
```

## Names, roles and tables

- **Icon buttons** have an `aria-label` that names the action and the object: "Edit order DH-1043", "Actions for order DH-1043", "Remove filter Status: Late". The icon inside is `aria-hidden="true"` [WCAG 4.1.2; Atlassian]. Collapsed sidebar items carry the item name in `aria-label` and `title` (`navigation-layout.md`).
- **The name starts with the visible text.** A button that shows "Edit" and adds the record in its label reads "Edit order DH-1043", so speech-input users can say what they see [WCAG 2.5.3].
- **Page structure:** landmarks `header`, `nav aria-label="Main"`, `nav aria-label="Breadcrumb"` and `main`; one `<h1>` (the page title), then `<h2>` for sections and widgets, without skipped levels [WCAG 1.3.1, 2.4.6].
- **Document title** names the page and the record, most specific first ("DH-1043 · Orders · Acme ERP"), and changes on client-side navigation [WCAG 2.4.2].
- **Tables:**
  - A data table is a `<table>` with `<th scope="col">` headers and either a `<caption>` (`sr-only` when the `<h1>` already says it) or an `aria-label`, not both [WCAG 1.3.1; SLDS, Atlassian]. Layout never uses a table.
  - The identifier cell may be `<th scope="row">`, so each cell is read with its record `[inferred]`.
  - The sorted column's `<th>` carries `aria-sort="ascending"` or `"descending"`; other headers carry none. The sort control is a `<button>` inside the `<th>` [Polaris].
  - The actions column has a visually hidden header: `<span class="sr-only">Actions</span>` (`tables.md`).
  - The header checkbox is "Select all rows on this page" and exposes its mixed state (native `indeterminate`, or `aria-checked="mixed"` on a custom checkbox); each row checkbox is "Select order DH-1043" [WCAG 4.1.2].
  - A permission matrix is a real table with row and column headers, and each checkbox is labelled "<module> – <action>" (SKILL.md).
- **Status badges carry text.** Tone colour is added meaning, never the only one; a dot without a word fails [WCAG 1.4.1]. Count badges have a text alternative ("3 unread notifications").
- **Images:** a company logo or product photo beside its visible name has `alt=""`; shown alone, it has `alt` with the name. Decorative icons are `aria-hidden="true"` [WCAG 1.1.1].
- **Charts give their numbers as text** [WCAG 1.1.1]. A static chart (plain SVG or canvas) is `role="img"` with a one-sentence `aria-label` summary (a bare `div` does not expose `aria-label`). An interactive chart (Recharts `accessibilityLayer`) has no `role="img"`, which would hide its marks; `aria-labelledby` names it after its heading, and a table toggle shows the numbers.

```html
<table class="w-full text-sm">
  <caption class="sr-only">Orders</caption>
  <thead>
    <tr class="h-10">
      <th scope="col" class="w-10 px-3"><label class="inline-flex size-6 items-center justify-center"><input type="checkbox" class="size-4" aria-label="Select all rows on this page"></label></th>
      <th scope="col" class="px-3 text-left">Order no.</th>
      <th scope="col" class="px-3 text-left" aria-sort="descending"><button class="inline-flex items-center gap-1">Date <svg aria-hidden="true">…</svg></button></th>
      <th scope="col" class="px-3 text-right"><button class="inline-flex flex-row-reverse items-center gap-1 text-right">Total (VND) <svg aria-hidden="true">…</svg></button></th>
      <th scope="col" class="px-3"><span class="sr-only">Actions</span></th>
    </tr>
  </thead>
  <tbody>
    <tr class="h-10">
      <td class="px-3"><label class="inline-flex size-6 items-center justify-center"><input type="checkbox" class="size-4" aria-label="Select order DH-1043"></label></td>
      <th scope="row" class="px-3 text-left font-normal"><a href="/orders/DH-1043">DH-1043</a></th>
      <td class="px-3 tabular-nums">04/11/2026</td>
      <td class="px-3 text-right tabular-nums">1.250.000</td>
      <td class="px-3 text-right"><button class="inline-flex size-8 items-center justify-center" aria-label="Actions for order DH-1043"><svg aria-hidden="true">…</svg></button></td>
    </tr>
  </tbody>
</table>
```

## Forms

- **Labels:** every field has a visible `<label for>` above it; a placeholder is an example value, never the label [WCAG 3.3.2; NN/g, Carbon]. Radio and checkbox groups sit in a `<fieldset>` with a `<legend>` [WCAG 1.3.1].
- **Required fields:** the `*` after the label is `aria-hidden="true"`, the input has `aria-required="true"`, and "* Required" appears once under the form title (`forms.md`) [WCAG 3.3.2].
- **Help text** under a field is linked with `aria-describedby`.
- **Errors:** an invalid field has `aria-invalid="true"` and `aria-describedby` pointing at its message (plus its help text). The message says how to fix it ("Enter an email like name@company.com") and carries an icon as well as the red colour [WCAG 3.3.1, 3.3.3, 1.4.1].
- **On submit,** focus moves to the first invalid field. With 3 or more errors, a summary at the top links to each field; its container is always rendered with `role="status"`, so the summary is announced when it appears (SKILL.md Saving, `forms.md`).
- **Autocomplete:** fields that collect the user's own data (profile, sign-in, sign-up) carry `autocomplete` tokens: `name`, `email`, `tel`, `street-address`, `username`, `current-password`, `one-time-code` [WCAG 1.3.5]. Fields about someone else, such as a customer's email in a CRM form, use `autocomplete="off"` so the browser does not insert the user's own details `[inferred]`.
- **Redundant entry:** information entered earlier in the same process is filled in or offered for selection: "Same as billing address", wizard steps that keep their values on Back, a remembered import mapping, input kept after a failed save [WCAG 3.3.7].
- **Authentication:** password, one-time-code and confirmation fields accept paste and password managers, and sign-in needs no puzzle or transcription [WCAG 3.3.8].
- **Error prevention:** submissions with legal or financial effect, or that change or delete stored data (post an invoice, approve a payment, bulk delete, import), are reversible, checked in a review step, or confirmed in a dialog [WCAG 3.3.4].

## Live regions and messages

- **The region element is always rendered and only its text changes.** A `role="status"` or `role="alert"` element mounted together with its message is often not announced (`feedback-states.md`) [WCAG 4.1.3].
- **Polite (`role="status"`)** for counts and saves: the result count after filtering ("5 orders match"), the bulk selection ("3 selected"), "Saved", "Unsaved changes", success toasts, progress milestones and bulk results ("48 updated, 2 failed") [WCAG 4.1.3; Primer, SLDS].
- **Assertive (`role="alert"`)** only for errors that block the current task: a failed save banner, a failed confirmation, a session about to expire. Field errors are not alerts; focus and `aria-describedby` deliver them.
- **Status messages do not move focus.** Focus moves only for dialogs and form errors (`feedback-states.md`).
- **One short message per event.** Progress updates the status text at milestones, not on every tick; the `role="progressbar"` has `aria-valuenow`, `aria-valuemin`, `aria-valuemax` and a label.
- **Loading regions** have `aria-busy="true"` while loading, with the skeleton blocks `aria-hidden="true"`.
- **Toasts** use `role="status"`. An Undo action in a toast also exists somewhere stable (the record's history or the trash), because a keyboard user may not reach the toast in time `[inferred]`.

The bulk bar appears and disappears, so its count is announced from a region that stays outside it, and Cancel, which unmounts with the bar, moves focus to the header checkbox:

```tsx
import type { ReactNode, RefObject } from 'react'
import { Button } from '@/components/ui/button'
import { formatNumber } from '@/lib/format'

export function BulkBar({ count, locale, onClear, headerCheckbox, actions }: {
  count: number; locale: string; onClear: () => void; actions: ReactNode
  headerCheckbox: RefObject<HTMLElement | null> // the "Select all rows on this page" checkbox
}) {
  const text = count > 0 ? `${formatNumber(count, locale)} selected` : ''
  return (
    <>
      <p role="status" className="sr-only">{text}</p>
      {count > 0 && (
        <div className="flex h-10 items-center gap-3 border-b border-border bg-accent px-3 text-sm text-accent-foreground">
          <span className="tabular-nums">{text}</span>
          {actions}
          <Button variant="ghost" size="sm" className="ml-auto"
            onClick={() => { onClear(); headerCheckbox.current?.focus() }}>Cancel</Button>
        </div>
      )}
    </>
  )
}
```

## Colour and contrast

- **Text:** 4.5:1; large text (24px and up, or 18.66px bold) 3:1 [WCAG 1.4.3]. Admin text is 12–14px, so use 4.5:1 for everything below the page title `[inferred]`.
- **Secondary text** is slate-600 `#475569` (7.58:1 on white). Slate-500 (4.76:1) appears only on white or slate-50; slate-400 (2.56:1) never carries text (SKILL.md Foundations). Placeholder examples are text and meet 4.5:1 as well.
- **Re-check tinted surfaces:** muted text on `bg-accent`, on `-subtle` backgrounds, on hover and selected rows, and in dark mode (`tokens.md`).
- **UI boundaries and focus: 3:1** for input borders, checkbox and radio borders, toggle tracks, the focus ring, the selected tab or segment, meaningful icons and chart marks [WCAG 1.4.11]. `--input` (`#8592a6`) gives 3.15:1 on white; `--border` (`#e2e8f0`, 1.23:1) is for cards and dividers only, never the edge of a control.
- **Never colour alone** [WCAG 1.4.1]:
  - badges carry text; errors carry an icon and text; selected rows also have a checked checkbox;
  - deltas carry a sign or arrow and their period; chart series have direct labels or a line style;
  - links inside running text are underlined.
- **Checking:** the audit's `text-contrast` rule measures rendered text. Measure boundaries and focus rings by hand with the browser's colour picker and the formula in `tokens.md`.

## Targets and pointer input

- **At least 24×24 CSS px** for every pointer target, or enough spacing: a 24px circle centred on the target overlaps no other target or circle [WCAG 2.5.8]. Admin hot spots:
  - row icon buttons (`size-8`), chip remove buttons (`size-6`) and checkboxes, whose hit area is a 24px label or cell;
  - pagination numbers, breadcrumb links (`min-h-6`), toast and dialog close buttons, date-picker days, permission-matrix cells; links inside a sentence are exempt.
- **Touch layouts** use 40px controls and 44px targets [Fluent, Primer].
- **Dragging always has a single-pointer alternative** [WCAG 2.5.7]:
  - column reorder → Move up / Move down in the Columns menu (`tables.md`);
  - row reorder (line items, priorities) → move buttons or a position field;
  - kanban → a Status select or a "Move to…" menu;
  - a chart's range brush → From and To date fields.
- **Pinch and multi-finger gestures** (zooming a chart or map) also have Zoom in and Zoom out buttons [WCAG 2.5.1].

## Reflow, zoom and text spacing

- **At 320 CSS px wide** (1280px at 400% zoom) the page header, forms, cards, settings and dialogs reflow to one column with no horizontal page scroll. Wide tables scroll inside their own container (`overflow-x-auto`) with the header row and first column sticky; data tables are the permitted exception [WCAG 1.4.10].
- **The table's scroll container is reachable by keyboard:** `tabindex="0"`, `role="region"` and an `aria-label` ("Orders table"), which axe checks as `scrollable-region-focusable`.
- **Short viewports:** a 1280×720 window at 400% zoom is 320×180 CSS px. Keep only the sticky action bar fixed at that height and let other sticky parts scroll `[inferred]`.
- **200% text size:** with text-only zoom, or the browser's default font size doubled, every label and value stays visible and nothing overlaps [WCAG 1.4.4]. Font sizes use `rem` (Tailwind's `text-sm` does).
- **Text spacing:** with line height 1.5×, paragraph spacing 2×, letter spacing 0.12× and word spacing 0.16× the font size, no text is clipped or overlapping [WCAG 1.4.12].
  - Text containers grow: `min-h-*` rather than a fixed height with `overflow-hidden`. Table cells with `h-10` already grow.
  - Truncation shows the full text in `title` or a tooltip (`tables.md`).
- **Longer translations:** labels and buttons wrap or grow; Vietnamese and German run up to 50% longer [Polaris].

## Dialogs and menus

- **Modal dialogs** use `role="dialog"`, or `role="alertdialog"` for a confirmation, with `aria-modal="true"`, `aria-labelledby` pointing at the title and `aria-describedby` at the consequence text [WCAG 4.1.2]. shadcn `Dialog` and `AlertDialog` (Radix) set the role, title and description from their `Title` and `Description` parts.
- **Initial focus:**
  - a confirmation focuses the least destructive action (Cancel, "Keep role"); Radix `AlertDialog` focuses `AlertDialogCancel` on open;
  - a form dialog focuses its first field (`forms.md`).
- **While open,** Tab cycles inside the dialog and the page behind is inert. Esc and the close button close it, and focus returns to the trigger. When the trigger is gone (a deleted row), focus goes to the list heading or the next row (`onCloseAutoFocus` below).
- **Buttons:** `AlertDialogCancel` comes first; `AlertDialogAction` comes last with a verb + object label ("Delete role") and `className={buttonVariants({ variant: 'destructive' })}`. Neither takes a `variant` prop. On failure the dialog stays open with its error in an always-rendered `role="alert"` element.
- **Side panels** that block the page follow the dialog rules. A panel that leaves the page usable is a labelled region with a heading and no focus trap `[inferred]`.
- **Menus:** the trigger is a button with `aria-haspopup="menu"` and `aria-expanded`; items are `role="menuitem"`. Arrows move, Enter selects, Esc closes and returns focus to the trigger. Radix `DropdownMenu` provides this.
- **Comboboxes** (lookups, the command palette): the input has `role="combobox"` with `aria-expanded` and `aria-controls`, and the highlighted option is set with `aria-activedescendant` (`navigation-layout.md`).
- **Tooltips** open on hover and on keyboard focus, close with Esc without moving the pointer, can be hovered, and stay until the pointer or focus leaves. They attach to focusable elements only and never hold the only copy of required information [WCAG 1.4.13].

```tsx
import { useRef, useState, type RefObject } from 'react'
import { Loader2 } from 'lucide-react'
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog'
import { Button, buttonVariants } from '@/components/ui/button'
import { formatNumber } from '@/lib/format'

const plural = new Intl.PluralRules('en') // the strings' language, not the number locale ('vi' has no 'one')

export function DeleteRoleDialog({ role, users, locale, onDelete, focusAfter }: {
  role: string; users: number; locale: string; onDelete: () => Promise<void>
  focusAfter: RefObject<HTMLElement | null> // the list heading (tabIndex={-1}) or the next row
}) {
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const deleted = useRef(false)
  async function confirm() {
    setBusy(true); setError('')
    try { await onDelete(); deleted.current = true; setOpen(false) }
    catch { setError("Couldn't delete the role. Check your connection and try again.") }
    finally { setBusy(false) }
  }
  return (
    <AlertDialog open={open} onOpenChange={(o) => { if (!busy) setOpen(o) }}>
      <AlertDialogTrigger asChild>
        <Button variant="outline" className="text-destructive">Delete role</Button>
      </AlertDialogTrigger>
      <AlertDialogContent onCloseAutoFocus={(e) => { if (deleted.current) { e.preventDefault(); focusAfter.current?.focus() } }}>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete role {role}?</AlertDialogTitle>
          <AlertDialogDescription>
            {formatNumber(users, locale)} {plural.select(users) === 'one' ? 'user' : 'users'} will lose these permissions.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <p role="alert" className="text-sm text-destructive">{error}</p>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={busy}>Keep role</AlertDialogCancel>
          <AlertDialogAction className={buttonVariants({ variant: 'destructive' })} disabled={busy}
            onClick={(e) => { e.preventDefault(); void confirm() }}>
            {busy && <Loader2 className="size-4 animate-spin motion-reduce:animate-none" aria-hidden="true" />}Delete role
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
```

`e.preventDefault()` keeps the dialog open while the request runs, so it can show the error. After a delete, `onCloseAutoFocus` sends focus to `focusAfter` instead of the trigger, which may be gone. In a translated UI the i18n catalogue picks the plural form.

## Motion and time limits

- **Reduced motion:** with `prefers-reduced-motion: reduce`, skeleton pulses, spinners, panel slides, chart animations and smooth scrolling stop (`motion-reduce:animate-none`, `motion-reduce:transition-none`, `motion-reduce:scroll-auto`) [WCAG 2.3.3, AAA; `feedback-states.md`].
- **Nothing blinks.** New-item markers and alert badges are static [WCAG 2.2.2].
- **Auto-updating content** that refreshes on its own for more than 5 seconds (a live dashboard, an activity feed) offers Pause, or refreshes on demand with "Updated 16:30" [WCAG 2.2.2]. New rows arrive behind a "Show 3 new orders" button instead of shifting the rows under the pointer `[inferred]`.
- **Session timeout:**
  - Warn before it expires in an `alertdialog` ("Your session ends in 2 minutes"), with focus on "Stay signed in".
  - One action extends it, and the user has at least 20 seconds to respond [WCAG 2.2.1].
  - After a timeout, signing in again returns to the same page with unsaved input kept [WCAG 2.2.5, AAA].
- **Toasts** stay 5 seconds (10 with Undo) and pause on hover and focus; errors never auto-dismiss (`feedback-states.md`) [WCAG 2.2.1].
- **Long jobs** impose no time limit on the user: they continue in the background (`feedback-states.md`).

## Language

- **Page language:** `<html lang="vi">`, or the project locale from DESIGN.md, updated when the user switches the interface language. A screen reader picks its voice from it; Vietnamese read with an English voice is unintelligible [WCAG 3.1.1].
- **Passages in another language** get their own `lang`: an English product description imported into a Vietnamese UI, an email template in English [WCAG 3.1.2]. Product names, brand names and technical terms need none.
- **Accessible names are translated** with the visible strings. In a Vietnamese UI the edit button is `aria-label="Sửa đơn hàng DH-1043"`, and the document title is translated too `[inferred]`.

## Testing

Run these on each page type, in every state (`?state=empty`, `?state=error`, `?state=loading`, an open dialog, a form with errors):

1. **Keyboard-only walk.** Tab from the address bar: the skip link comes first, then the visual order. Operate every action: sort, filter, select all matching, a row menu, a bulk action, pagination, Save, each dialog. Focus stays visible and never sits under a sticky bar; Esc closes each overlay and focus returns to its trigger.
2. **axe DevTools** (browser extension), or axe-core in Playwright as below. Fix every violation. Automated tools find only part of the problems; steps 1 and 3 find the rest.
3. **One screen-reader pass:** NVDA with Firefox or Chrome on Windows, or VoiceOver with Safari on macOS. On a list page and a form, listen for the page title, landmarks, headings, table headers read with cells, row checkbox names, the sort state, the count after filtering, the error summary, a toast, and a dialog's title and description.
4. **`scripts/audit.js`** (SKILL.md Verify) checks icon-button names (`icon-button-name`), target sizes (`target-size`), text contrast (`text-contrast`) and `hidden` attributes overridden by display classes (`hidden-overridden`). It does not check focus order, live regions, dialogs or reflow; steps 1–3 cover those.
5. **Zoom and spacing:** a 320px-wide viewport (or 400% zoom at 1280px), 200% text-only zoom, and this text-spacing stylesheet pasted into DevTools: `* { line-height: 1.5 !important; letter-spacing: 0.12em !important; word-spacing: 0.16em !important; } p { margin-bottom: 2em !important; }`.
6. **Media emulation:** DevTools → Rendering, or `page.emulateMedia({ reducedMotion: 'reduce', forcedColors: 'active' })`. Motion stops; focus, checkbox state, selected rows and badges stay visible.

```ts
import { test, expect } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'

for (const state of ['', 'empty', 'error', 'loading']) {
  test(`orders list ${state || 'default'} has no WCAG A/AA violations`, async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.goto(state ? `/orders?state=${state}` : '/orders') // relative: set use.baseURL in playwright.config
    const { violations } = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
      .analyze()
    expect(violations.map((v) => `${v.id} (${v.nodes.length})`)).toEqual([])
  })
}
```
