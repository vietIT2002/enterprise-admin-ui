# Forms

Read this when you build a create/edit form, a settings section, a line-item editor or any screen where the user changes data and saves it.

## Contents
- [Layout](#layout)
- [Validation timing](#validation-timing)
- [Save model](#save-model)
- [Sticky action bar and unsaved changes](#sticky-action-bar-and-unsaved-changes)
- [Server errors](#server-errors)
- [Read vs edit mode](#read-vs-edit-mode)
- [Line-item editor](#line-item-editor)
- [Lookups](#lookups)
- [Container choice](#container-choice)
- [Code: form with error summary and leave guard](#code-form-with-error-summary-and-leave-guard)

## Layout

- One column in titled sections (`<h2>` 16px semibold, `border-b border-border`), one field per row [Carbon, Primer].
  - The only exception is two short fields that read as one value: City · Postal code, First name · Last name.
  - Never put three in a row, and never lay a section out on a `grid-cols-2` or 12-column grid: the eye zigzags and fields get skipped.
  - Without the skill, onboarding forms paired unrelated fields (Preferred name · Date of birth) and put three per row.
- Labels sit above the field in `text-sm font-medium` (14px, the size of shadcn `<Label>`), always visible, 1–3 words, sentence case, no colon. A placeholder is an example value ("name@company.com"), never the label [NN/g, Carbon].
- Mark required fields with `*` after the label (`<span aria-hidden="true">*</span>`) and say "* Required" once under the form title. Side labels are acceptable only in dense read-only views [NN/g, Fiori] `[inferred]`.
- Size each field to its content: postal code `w-28`, date `w-40`, phone `w-56`, name or email full column width (`max-w-xl`). Equal-width fields everywhere hide which input is short [Carbon].
- Use the input type that matches the value: `type="email"`, `type="tel"`, `type="url"`, `type="date"` (or the project's date picker). `inputmode` alone does not give autofill or the right mobile keyboard everywhere.
- Inputs are 32px high (`h-8`), 40px on touch. Space: 24px between fields on a page, 16px in panels, 32px before the action bar [Carbon].
- Help text goes under the field in `text-sm text-muted-foreground`, linked with `aria-describedby`. Use it for format and consequence ("Used on invoices"), not for repeating the label.
- Vietnamese and German run up to 50% longer than English [Polaris], so wrap labels instead of cutting them [Fiori].
- Every control, checkbox and radio has a hit area of at least 24×24px [WCAG 2.5.8].

## Validation timing

Baseline without this skill: 0 of 2 reviewed forms had a blur-plus-submit flow with an error summary and focus management.

1. **Before the first blur** no errors show; a field the user is still typing in is not flagged.
2. **On blur:** validate that field, including a required field left empty, and show its message under it. In react-hook-form this is `mode: 'onTouched'` [Primer, NN/g].
3. **Once a field is invalid,** re-check on every keystroke so the message disappears the moment the value is fixed. `onTouched` does this by itself; with other libraries set the re-validate mode to `onChange`.
4. **On submit** validate every field, even untouched ones.
5. **Three or more errors:** show a summary at the top of the form, above the title of the first section: "3 fields need attention" and a list of links, one per field, each focusing its input. Fewer than three: no summary. In both cases focus moves to the first invalid field. The summary is never the only signal; each field also shows its own message [Primer, NN/g].
6. Wire every invalid field with `aria-invalid="true"` and `aria-describedby` pointing at its message (and its help text). The message is a plain `<p id=…>`; a screen reader reads it when the field gets focus.
7. Write messages as a fix, not a verdict: "Enter an email like name@company.com", not "Invalid input". Name the field in the summary entries ("Email: Enter an email…") because the link text is read out of context.
8. Error colour is `text-destructive` on the message and `border-destructive` on the input, plus a 16px alert icon so colour is never the only signal [WCAG 1.4.1].
9. Cross-field rules (end date after start date, discount at most subtotal) are checked on submit and on blur of the second field; the message goes under the field the user must change.

## Save model

Baseline without this skill: Save was disabled until the form was valid in the reviewed forms. Users cannot tell why a disabled button is disabled.

- **Explicit save is the default.** One Save button per form, one edit mode at a time, one save model per form: never mix an autosaving toggle with a Save button in the same section [Primer].
- **Save is never disabled before submit.** An empty or invalid form can still be submitted; the validation then explains what is wrong [Primer, Atlassian].
- **While the request runs** Save is disabled, shows a 16px spinner and the label stays ("Save"); the rest of the form stays editable only if the server tolerates it, otherwise set `fieldset disabled` [Carbon, Primer].
- **Autosave only for toggles and segmented controls** that take effect alone (notifications on/off). Each shows "Saved" beside it for 2 seconds, in a `role="status"` region. A failed autosave reverts the control and shows the error beside it.
- **Save draft for long forms.** A form with three or more sections gets "Save draft" (secondary) between Cancel and Save. A draft is stored with Draft status and skips required-field checks; Save runs every check. Show "Draft saved 15:58" beside the buttons, and list drafts in the index with a Draft badge so they can be resumed `[inferred]`.
- Button order in a full-page form: in the sticky bottom bar, Cancel (secondary) then Save (primary) at the right. Dialogs and side panels use the same order, Save at the far right [Carbon].
- Button labels are verbs with the object: "Save invoice", "Create customer". Plain "Save" is fine in a settings section.
- After a successful save of a new record, go to its detail page. After editing, return to where the user came from with a toast naming the record ("Invoice INV-1043 saved").

## Sticky action bar and unsaved changes

- Every full-page form and editable matrix keeps Save and Cancel in a bar fixed to the bottom of the content area, right-aligned: `sticky bottom-0 flex justify-end gap-3 border-t border-border bg-card px-6 py-3`. No shadow; the top border separates it.
- Make sure the sticky bar never covers the focused field: add `scroll-pb-20` to the scroll container [WCAG 2.4.11].
- `sticky` sticks inside the nearest ancestor with `overflow` set. If `<main class="overflow-y-auto">` grows with its content (a `min-h-screen` shell), the document scrolls instead and the bar never sticks. Either let the document scroll, with no `overflow` on the shell, as in the app shell code in `navigation-layout.md`, or make the shell `h-screen` so `<main>` is the element that scrolls.
- **Unsaved-changes indicator:** when the form is dirty (`isDirty`), show "Unsaved changes" in the bar beside Cancel and Save (not pushed to the far left), in `text-sm text-muted-foreground` with a 6px dot `bg-warning`. Render its live region (`role="status"`) always and change only its content. It disappears after a successful save. Permission matrices and settings sections use the same indicator.
- **Navigation guard** has two parts, both required:
  1. `beforeunload` for reload, tab close and address-bar navigation. The browser shows its own text; set `e.preventDefault(); e.returnValue = ''` only while dirty and remove the listener when clean.
  2. An in-app guard for router links, breadcrumbs and the sidebar. React Router: `useBlocker(isDirty)`. Next.js App Router has no blocker; intercept clicks on your `Link` wrapper and on `popstate` `[inferred]`.
- The in-app guard opens an `AlertDialog`. Title: "You have unsaved changes. Leave without saving?" `AlertDialogCancel` **Stay** comes first and Radix focuses it on open; `AlertDialogAction` **Leave page** comes last with `className={buttonVariants({ variant: 'destructive' })}` [NN/g]. Neither button takes a `variant` prop.
- Cancel on a dirty form uses the same dialog. Cancel on a clean form leaves at once.
- Do not warn after a successful save. Reset the form's default values to the saved values so `isDirty` becomes false.

## Server errors

- Map each error the server returns to its field (`setError('email', { type: 'server', message })`), then focus the first one and apply the same summary rule as client errors.
- Keep everything the user typed. Never clear or reload the form after a failure [Primer].
- Errors that belong to no field ("Another user changed this invoice", "Service unavailable") go in one banner at the top of the form: `bg-danger-subtle text-danger-subtle-foreground`, what failed + what to do + Retry when retrying helps. Its `role="alert"` element is always rendered and only its text changes, so each new error is announced. One banner at a time; it persists until the user retries or edits.
- A save that throws (network error, timeout) lands in the same banner: catch it and call `setError('root.server', { message })`.
- Conflicts (409): say who changed the record and when, offer "Reload record" and keep the user's input visible so it can be copied.
- Duplicate-value errors name the existing record with a link: "Tax code already used by Công ty Minh Phát".
- Timeouts: keep input, show the banner, re-enable Save. Do not retry a save automatically.

## Read vs edit mode

- A record's detail page shows values as text in a read mode. Editing is an explicit action: an **Edit** button in the record header opens the edit page (or edits the section in place) [Fiori, Primer].
- Edit mode has Save and Cancel; read mode has neither. One edit mode at a time: opening a second section asks to save or discard the first.
- Section-level editing: each titled section has its own Edit button and its own Save; do not make the whole page editable for one field change.
- The edit form keeps the same section titles and order as the read view so the user finds fields where they left them.
- Read-only values that look like inputs confuse users; render them as plain text with a muted label. Fields the user cannot change in edit mode show the value and a one-line reason ("Set by the approval workflow") instead of a disabled input.

## Line-item editor

For invoices, orders, quotes. It is a table, so `tables.md` rules apply (single-line rows, aligned numbers); this section adds the editing behaviour.

- Columns: Item (lookup) · Description · Qty · Unit price (VND) · Tax rate · Amount (VND) · remove button. Qty, price, tax and amount are numeric: `text-right tabular-nums` on both header and input.
- Row: inputs at 32px inside 40px rows. The Amount cell is computed text, not an input.
- **Add row:** a ghost button "Add line" under the table. It appends a row and focuses its first input. Tab from the last cell of the last row also adds a row `[inferred]`.
- **Remove row:** an icon button, 24×24px minimum, `aria-label="Remove line 3"`. Removing the only row clears it instead. Removing a filled row shows an Undo toast rather than a confirm dialog.
- **Keyboard:** Tab moves cell to cell, Enter in a cell moves to the same column of the next row (adding one at the end), Esc cancels a lookup popup. Arrow keys inside a number input change nothing; never rely on them for navigation.
- Numeric inputs use `inputMode="decimal"`, accept the project locale's separators, and format on blur through `@/lib/format`: `formatNumber` for quantities, `formatAmount` for prices in a column whose header names the currency. Reject negatives for quantity.
- **Totals:** subtotal, tax (grouped by rate when rates differ) and total sit below the table in a right block (`ml-auto w-72`), labels left, figures right with `tabular-nums`, total in `font-semibold` with a top border. They are computed from the rows on every change, never typed [Polaris].
- Rounding happens once per line and the total is the sum of rounded lines, so the screen matches the printed invoice. Currency totals carry the ISO code when currencies are mixed (`currencyDisplay: 'code'`: "1.250.000 VND · 54,20 USD").
- Validate each row on blur and report rows together in the summary ("Line 2: Enter a quantity"). A form with no lines cannot be submitted: message "Add at least one line".
- Use one save model: the lines save with the document, not row by row.

## Lookups

- A related record (customer, product, employee, account) is chosen in an async combobox (shadcn `Popover` + `Command`, or `Combobox`), not a native `<select>`, once the list has more than about 20 entries.
- Search on type with a 250ms debounce and a minimum of 1 character; request 10 results. Show a loading row ("Searching…") inside the list with `aria-busy`.
- Each option shows the record's name plus one disambiguating detail (code, city, tax code). Matching text is not highlighted with colour alone.
- Empty result: "No customers match 'minh'" with a **Create "minh"** action as the last item in the list. Choosing it opens a small dialog or side panel for the new record and, on save, selects it in the field without losing the outer form's input [Fiori] `[inferred]`.
- Keep a "Recent" group at the top when the field is empty.
- Combobox keyboard: Down opens, Enter selects, Esc closes and returns focus to the input. A selected value can be cleared with an accessible "Clear" button.
- Required lookups show the same `*` and error handling as other fields; the error goes on the combobox button with `aria-invalid`.

## Container choice

| Input count and context | Container |
|---|---|
| 5 inputs or fewer, one short task (rename, add note, change status) | Dialog, size `sm`/`md` |
| More than 5 inputs on a task repeated many times (add contact, log call, quick order) | Side panel from the right, 480px |
| Complex input: several sections, line items, attachments, more than one screen | Full page with a breadcrumb and sticky action bar |

- No tabs or accordions inside a dialog, and a dialog never opens another dialog [Carbon]. A "Create new" lookup from inside a panel opens a nested panel only on a full page; inside a dialog it switches the dialog's content.
- Dialogs and panels use the same validation rules; Save sits at the far right, focus starts on the first field, Esc asks before discarding a dirty form.
- Wizards are for flows with real order dependency (import, onboarding): 3–5 named steps, completed steps clickable [Ant, Carbon].

## Code: form with error summary and leave guard

`ErrorSummary` is generic and exported, so every form passes its own `errors` and `[name, label]` pairs (`react-shadcn.md` calls it the same way). Save it as `components/error-summary.tsx`. Its `role="status"` container is always rendered; the summary inside appears at 3 or more errors.

```tsx
import { get, type FieldError, type FieldErrors, type FieldValues, type Path } from 'react-hook-form'

export function ErrorSummary<T extends FieldValues>({ errors, fields, onJump }: {
  errors: FieldErrors<T>
  fields: readonly (readonly [Path<T>, string])[] // [name, visible label], in form order
  onJump: (name: Path<T>) => void // usually the form's setFocus
}) {
  const items = fields.flatMap(([name, label]) => {
    const message = get<FieldErrors<T>, FieldError | undefined>(errors, name)?.message // works for nested names too
    return message ? [{ name, label, message }] : []
  })
  return (
    <div role="status">{items.length >= 3 && (
      <div className="rounded-md border border-border bg-danger-subtle p-4 text-danger-subtle-foreground">
        <p className="font-medium">{items.length} fields need attention</p>
        <ul className="mt-2 list-disc pl-5">{items.map(({ name, label, message }) => (
          <li key={name}><a href={`#${name}`} className="inline-flex min-h-6 items-center underline"
            onClick={(e) => { e.preventDefault(); onJump(name) }}>{label}: {message}</a></li>))}</ul>
      </div>)}</div>)
}
```

react-hook-form with zod. `mode: 'onTouched'` validates on blur and then on every keystroke; Save is disabled only while `isSubmitting`; the dirty indicator and `beforeunload` guard share `isDirty`; a save that throws keeps the input and fills the always-rendered `role="alert"` banner. Add the in-app blocker from your router next to the `useEffect`.

```tsx
import { useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { AlertCircle, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ErrorSummary } from '@/components/error-summary'

const schema = z.object({
  name: z.string().min(1, 'Enter the customer name'),
  email: z.string().email('Enter an email like name@company.com'),
  taxCode: z.string().regex(/^\d{10}(-\d{3})?$/, 'Enter 10 or 13 digits'),
})
type Values = z.infer<typeof schema>
const fields = [['name', 'Name'], ['email', 'Email'], ['taxCode', 'Tax code']] as const

export function CustomerForm({ onSave }: { onSave: (v: Values) => Promise<void> }) {
  const { register, handleSubmit, setFocus, setError, reset, formState: { errors, isDirty, isSubmitting } } =
    useForm<Values>({ resolver: zodResolver(schema), mode: 'onTouched', defaultValues: { name: '', email: '', taxCode: '' } })
  useEffect(() => {
    if (!isDirty) return
    const guard = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = '' }
    window.addEventListener('beforeunload', guard)
    return () => window.removeEventListener('beforeunload', guard)
  }, [isDirty])
  // Field errors from the server: setError(name, { type: 'server', message }), then setFocus on the first one.
  const submit = handleSubmit(async (v) => {
    try { await onSave(v); reset(v) }
    catch { setError('root.server', { message: "Couldn't save the customer. Your changes are kept; try again." }) }
  })
  return (
    <form onSubmit={submit} noValidate className="space-y-6">
      <p className="text-sm text-muted-foreground">* Required</p>
      <div role="alert">{errors.root?.server && (
        <p className="rounded-md bg-danger-subtle p-3 text-sm text-danger-subtle-foreground">{errors.root.server.message}</p>)}</div>
      <ErrorSummary errors={errors} fields={fields} onJump={setFocus} />
      {fields.map(([k, label]) => (
        <div key={k} className="max-w-xl space-y-1">
          <Label htmlFor={k}>{label} <span aria-hidden="true">*</span></Label>
          <Input id={k} className="h-8" aria-required="true" aria-invalid={!!errors[k]} aria-describedby={errors[k] ? `${k}-error` : undefined} {...register(k)} />
          {errors[k] && <p id={`${k}-error`} className="flex items-center gap-1 text-sm text-destructive"><AlertCircle className="size-4" aria-hidden="true" />{errors[k]?.message}</p>}
        </div>))}
      <div className="sticky bottom-0 flex items-center justify-end gap-3 border-t border-border bg-card py-3">
        <span role="status" className="text-sm text-muted-foreground">{isDirty && (<><span aria-hidden="true" className="mr-1.5 inline-block size-1.5 rounded-full bg-warning" />Unsaved changes</>)}</span>
        <Button type="button" variant="outline">Cancel</Button>
        <Button type="submit" disabled={isSubmitting}>{isSubmitting && <Loader2 className="size-4 animate-spin motion-reduce:animate-none" aria-hidden="true" />}Save</Button>
      </div>
    </form>)
}
```

Replace the `Cancel` button with the shared leave dialog from the section above so a dirty cancel asks "You have unsaved changes. Leave without saving?" with **Stay** (`AlertDialogCancel`, focused on open) and **Leave page** (`AlertDialogAction`, destructive classes).
