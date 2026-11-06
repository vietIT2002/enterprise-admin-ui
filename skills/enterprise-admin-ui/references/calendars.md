# Calendars and schedules

Read this when you build a calendar or schedule view: team leave, shifts, bookings, maintenance plans or pay dates by day, week or month.

## Contents
- [Layout](#layout)
- [Entries](#entries)
- [Coverage and capacity](#coverage-and-capacity)
- [Details and actions](#details-and-actions)
- [Keyboard and screen readers](#keyboard-and-screen-readers)
- [Code: week start, working days, spanning bars](#code-week-start-working-days-spanning-bars)
- [Checklist](#checklist)

## Layout

Baseline without this skill (and with only the general rules):
- today was marked by colour alone;
- the leave type was a coloured dot;
- a five-day leave appeared as five separate chips;
- weeks started on Sunday in a Vietnamese app;
- there was no list view and no keyboard navigation in the grid.

1. **Toolbar**, left to right:
   - Today, then previous and next icon buttons labelled "Previous month" and "Next month";
   - the visible range as text in an `<h2>` ("November 2026", "3–9 November 2026");
   - the view switch (Month · Week · List) as a segmented control;
   - the filters (team, person, type) and the primary action ("Request leave").
   All of them live in the URL (`?view=month&date=2026-11&team=finance`).
2. **First day of the week** follows the locale. vi-VN, en-GB and most of Europe start on Monday; en-US starts on Sunday. Weekday headers use the locale's short names ("T2 … CN" or "Mon … Sun").
3. **Today:**
   - a filled circle on the date plus the visible word "Today" (or "Hôm nay") in the cell or toolbar;
   - `aria-current="date"` on that cell.
4. **Weekends and public holidays:**
   - a muted background (slate-50);
   - holidays also carry their name ("Quốc khánh");
   - a legend under the grid lists the patterns: Today, Weekend, Public holiday, Pending.
5. **List view:** the same entries as a table grouped by day (Date · Person · Type · Days · Status). It is the alternative for small screens and for screen-reader users, and the view to export.

## Entries

- **Text first.** Every entry shows the person and the type in text: "Lan · Annual leave". A coloured stripe or dot may support the type but never replaces it [WCAG 1.4.1].
- **Pending versus approved:**
  - pending entries have a dashed border and the word "Pending" (or a clock icon with the accessible name "Pending approval");
  - approved entries are solid;
  - rejected or cancelled entries are hidden unless a filter shows them.
- **Multi-day entries are one bar.** A leave from Wed to Mon draws one bar per week row, from its first to its last visible day, with square ends where it continues into the next row. The days it spans hold space for it, so other entries line up under it.
- **Half days** show "AM" or "PM" in the bar and take half the cell height in week view.
- **Overflow:**
  - a cell shows up to 3 entries, then "+N more";
  - "+N more" is a button that opens a popover listing every entry of that day;
  - never clip entries silently.
- **Sizes.** A month grid packs small text into small cells, so it fails size and contrast checks first:
  - entry bars and the "+N more" button are at least 24px tall, with 12px text [WCAG 2.5.8];
  - day numbers of the previous and next month are muted but readable, slate-500 on white (4.5:1), not slate-300 or slate-400;
  - a week row grows to fit: the date line plus 3 entries of 24px is about 120px.

## Coverage and capacity

- **Count who is off.** Each day cell in month view, and each column header in week view, shows the count against the team size when it matters: "3 of 8 off".
- **Flag the limit.** When the count passes the team's limit (set in DESIGN.md or the team settings), the cell shows a warning badge with text, "Over limit · 4 of 8 off", and a pending request that would cause it says so before approval.
- **Week view as a schedule:**
  - one row per person, one column per day;
  - entries as bars across their days;
  - a footer row with the daily count.
  It answers "can I approve this?" faster than the month grid.

## Details and actions

Opening an entry (click, Enter or Space) opens a side panel or popover with:
- the person, the type and the status badge;
- absolute dates: "Mon 10/11/2026 – Fri 14/11/2026";
- the length in **working days**, which excludes weekends and public holidays: "5 working days". Calendar days are a different number;
- the reason, the attachments, and who approved and when (`permissions-audit.md`);
- for a pending request and a manager, Approve (primary) and Reject. Reject asks for a reason.
- Any action updates the grid in place and announces the result ("Leave approved for Lan, 10–14 Nov") in a `role="status"` region.

## Keyboard and screen readers

- **Month grid:** a `role="grid"` table follows the date-grid pattern [WAI-ARIA APG].
  - One cell is tabbable at a time (roving `tabindex`).
  - Arrow keys move by day and week, Home/End go to the start or end of the week, and Page Up/Page Down change the month.
  - Enter opens the day.
- **Entries:**
  - An entry is a `<button>` whose accessible name includes the date range and status: "Lan, annual leave, 10 to 14 November, pending".
  - Tab moves through the entries of the focused day.
- **Changing range** moves focus to the range heading and announces it ("December 2026").
- **The list view** is plain table navigation, so it is the simplest accessible route. Link to it from the toolbar.

## Code: week start, working days, spanning bars

```ts
// First day of the week for a locale: 1 = Monday … 7 = Sunday. Intl.Locale weekInfo where supported, else a short table.
export function firstDayOfWeek(locale: string): number {
  const info = (new Intl.Locale(locale) as any).getWeekInfo?.() ?? (new Intl.Locale(locale) as any).weekInfo
  if (info?.firstDay) return info.firstDay
  return /^(en-US|en-CA|ja|ko|zh-TW|pt-BR|he|ar-SA)/.test(locale) ? 7 : 1
}

// Working days between two ISO dates inclusive, excluding weekends and public holidays.
export function workingDays(start: string, end: string, holidays: Set<string>, weekend = [6, 0]): number {
  let n = 0
  for (let d = new Date(start + 'T00:00:00'); d <= new Date(end + 'T00:00:00'); d.setDate(d.getDate() + 1)) {
    // Local date parts: toISOString() is UTC and gives the previous day east of Greenwich.
    const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    if (!weekend.includes(d.getDay()) && !holidays.has(iso)) n++
  }
  return n
}

// Split an entry into one bar per visible week row: [{ row, startCol, span, continuesLeft, continuesRight }].
export function weekSegments(start: Date, end: Date, gridStart: Date) {
  const day = 86400000
  const s = Math.max(0, Math.round((+start - +gridStart) / day))
  const e = Math.round((+end - +gridStart) / day)
  const segs = []
  for (let i = s; i <= e; i = (Math.floor(i / 7) + 1) * 7) {
    const row = Math.floor(i / 7)
    const last = Math.min(e, row * 7 + 6)
    segs.push({ row, startCol: i % 7, span: last - i + 1, continuesLeft: i > s || +start < +gridStart, continuesRight: last < e })
  }
  return segs
}
```

Place bars in a lane per row, the first free lane across all their days, so an entry keeps one height across the days it spans.

When the day cells and the bars share one CSS grid (cells spanning every grid row, bars in the lanes below the date line), give the bars `relative z-10`. A day cell with `relative` or any other position paints over unpositioned siblings whatever the DOM order, and its background then hides every bar. Open the screenshot and check that each bar and "+N more" is visible.

## Checklist

- [ ] Toolbar: Today, previous/next with names, the range as text, Month · Week · List, filters, all in the URL
- [ ] Weeks start on the locale's first day; today is marked with text and `aria-current="date"`
- [ ] Weekends and holidays are distinguishable with a legend and holiday names
- [ ] Entries show person and type in text; pending is dashed with the word "Pending"
- [ ] Multi-day entries are one bar per week row, visible above the day cells; "+N more" opens every entry of the day
- [ ] Entries and "+N more" are at least 24px tall with 12px text; other months' day numbers are slate-500
- [ ] Daily counts ("3 of 8 off") and an over-limit warning with text
- [ ] Details show absolute dates and working days; approve and reject update in place and announce
- [ ] The grid is keyboard operable (roving tabindex, arrows, Page Up/Down), and a list view exists
