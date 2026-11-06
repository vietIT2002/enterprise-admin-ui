# Boards (Kanban)

Read this when you build a board that shows records in columns by stage: service desk tickets, work orders, recruiting pipelines, sales deals, content workflows.

## Contents
- [Layout and scrolling](#layout-and-scrolling)
- [Columns](#columns)
- [Cards](#cards)
- [Moving cards](#moving-cards)
- [Details, filters and other views](#details-filters-and-other-views)
- [Code: board shell and move menu](#code-board-shell-and-move-menu)
- [Checklist](#checklist)

## Layout and scrolling

Baseline without this skill (and with only the general rules):
- columns had `overflow-y-auto` but no height, so they never scrolled;
- the work-in-progress limit was missing;
- moving to Resolved asked for nothing and could not be undone;
- details opened in a modal over the board;
- there was no list view.

- **The board fills the viewport under the page header.** The page header and toolbar stay put, and the board region gets the rest: `h-[calc(100dvh-var(--header-h))]` with `flex` columns.
- **Columns scroll on their own:** `overflow-y-auto` on a column body inside that bounded height. A column inside a page that scrolls cannot keep its header in view (audit `sticky-inert`).
- **The board scrolls sideways** when columns do not fit (`overflow-x-auto` on the board region). Columns are 280–320px wide; never shrink cards to fit.
- **The column header sticks** to the top of its column (`sticky top-0 bg-slate-50`), and the page header never scrolls away.

## Columns

- **Header:** status name, count and limit: "In progress 5 / 6".
  - Over the limit, the count turns to the warning tone with the text "Over limit".
  - The count reflects the active filters ("3 of 9" when filtered).
- **Order:** columns follow the workflow, left to right. Done and Closed come last and may be collapsed to a narrow strip with a count.
- **Empty column:** a short line inside the column ("No tickets in review") with no illustration; the column keeps its full height as a drop target.
- **Within a column:** sort by priority then due date, or by the manual order if the team ranks cards. The order is stated in the column menu.

## Cards

A card is one record, at most 5 lines:
1. The **code**, small and muted ("IT-1043"), and the **priority as a text label** with its tone ("High"). Colour only supports the word.
2. The **title**, up to two lines, truncated with the full title in `title` and in the details.
3. **Meta:**
   - the assignee's name (with an avatar for a person);
   - the due date, or the age for tickets without one ("Due 12/11", "Opened 3 days ago").
4. **Overdue or ageing:** the badge "Overdue 2 days" or "No update 5 days" in the danger or warning tone, with text.

Cards have a 1px border and no shadow; they lift only while being dragged. A card is a link or button to its details, with an accessible name that starts with the code and title.

## Moving cards

- **Never drag-only** [WCAG 2.5.7]. Every card has a "Move to…" menu, from its kebab button or the keyboard, listing the other columns.
  - The details panel has the same status select.
  - With the keyboard: focus a card, press Space to pick it up, use the arrow keys to choose a column, press Space to drop and Escape to cancel. Announce each step in a `role="status"` region: "Picked up IT-1043. In progress, position 2 of 5." [WAI-ARIA drag and drop practice]
- **Drag and drop:** the drop target shows a placeholder slot. After the drop, announce the result: "IT-1043 moved to Resolved."
- **Transitions that need input** open a small dialog before the move completes, for example Resolved needs a resolution note and Rejected needs a reason. Cancel puts the card back.
- **Undo:** every move shows a toast, "IT-1043 moved to Resolved · Undo", for 5 seconds. Undo returns the card to its column and position (`feedback-states.md`).
- **Rules:**
  - Blocked moves say why, for example "Only the assignee can close this ticket".
  - A WIP limit warns but does not block, unless DESIGN.md says it does.

## Details, filters and other views

- **Details** open in a side panel (a Sheet from the right, 480–560px). The board stays visible and keeps its scroll position and filters.
  - The URL carries the open card (`?ticket=IT-1043`), so Back closes it and the link can be shared.
  - A modal over the whole board is the wrong container here (`forms.md`, Container choice).
- **Filters:**
  - a search (code or title), assignee, priority and type, shown as chips with Clear all (`filters-search.md`);
  - "Assigned to me" as a quick toggle.
- **List view:** a switch (Board · List) in the toolbar shows the same filtered records as a table with Status as a column.
  - Use it for bulk actions, export and screen readers.
  - Keep the view in the URL.
- **States:**
  - Loading draws the column headers with skeleton cards.
  - An error replaces the board with an inline error and Retry.
  - A filter with no matches shows one no-results message across the board with Clear filters.

## Code: board shell and move menu

```tsx
<div className="flex h-[calc(100dvh-7rem)] flex-col">        {/* below the app header and page header */}
  <BoardToolbar />                                            {/* search, filter chips, Board · List */}
  <div className="flex min-h-0 flex-1 gap-3 overflow-x-auto pb-2" role="region" aria-label="Ticket board">
    {columns.map((col) => (
      <section key={col.id} aria-labelledby={`col-${col.id}`} className="flex w-[300px] shrink-0 flex-col rounded-md border border-border bg-slate-50">
        <h2 id={`col-${col.id}`} className="sticky top-0 flex items-center justify-between px-3 py-2 text-sm font-medium">
          {col.label} <span className="tabular-nums text-muted-foreground">{col.count}{col.limit ? ` / ${col.limit}` : ''}</span>
        </h2>
        <ol className="min-h-0 flex-1 space-y-2 overflow-y-auto px-2 pb-2">{/* cards */}</ol>
      </section>
    ))}
  </div>
</div>
```

```tsx
<DropdownMenu>
  <DropdownMenuTrigger asChild><Button variant="ghost" size="icon-sm" aria-label={`Actions for ${t.code}`}><MoreHorizontal /></Button></DropdownMenuTrigger>
  <DropdownMenuContent align="end">
    <DropdownMenuSub>
      <DropdownMenuSubTrigger>Move to…</DropdownMenuSubTrigger>
      <DropdownMenuSubContent>
        {columns.filter((c) => c.id !== t.status).map((c) => <DropdownMenuItem key={c.id} onSelect={() => requestMove(t, c.id)}>{c.label}</DropdownMenuItem>)}
      </DropdownMenuSubContent>
    </DropdownMenuSub>
  </DropdownMenuContent>
</DropdownMenu>
```

`requestMove` opens the transition dialog when the target needs input, then moves, announces the move and shows the Undo toast.

## Checklist

- [ ] The board has a bounded height; columns scroll on their own with sticky headers; the board scrolls sideways
- [ ] Column headers show the count and the WIP limit ("5 / 6") with "Over limit" as text
- [ ] Cards show the code, title, priority as text, assignee and due date or age; overdue is labelled
- [ ] Every card can move without dragging; moves are announced and can be undone
- [ ] Transitions that need input ask for it before moving
- [ ] Details open in a side panel kept in the URL; the board keeps its position and filters
- [ ] Filters as chips, and a Board · List switch
