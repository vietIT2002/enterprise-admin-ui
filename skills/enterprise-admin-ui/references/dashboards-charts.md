# Dashboards and charts

Read this when you build a dashboard, a KPI tile, a chart or a "needs attention" list.

## Contents
- [Operational vs analytical dashboards](#operational-vs-analytical-dashboards)
- [Header](#header)
- [KPI tile anatomy](#kpi-tile-anatomy)
- [Choosing a chart](#choosing-a-chart)
- [Needs attention list](#needs-attention-list)
- [Widget states](#widget-states)
- [Number formatting](#number-formatting)
- [Code: KpiTile and NeedsAttention](#code-kpitile-and-needsattention)
- [Charts with shadcn (Recharts)](#charts-with-shadcn-recharts)

## Operational vs analytical dashboards

- A dashboard serves one task: the critical information at a glance, on one screen [NN/g]. Decide which of the two kinds you are building before you pick widgets.
- **Operational** (warehouse, support desk, dispatch) shows what is happening now and what needs action. Lead with the attention list and 4–6 live KPI tiles, refresh on a timer and show "Updated 16:30". Charts are small (today vs yesterday, queue by hour) [NN/g].
- **Analytical** (sales, finance, HR trends) shows change over a chosen period. Lead with the date range and a trend chart; the tiles summarise the same period and data refreshes on demand [inferred].
- Mixing both on one page produces a wall of widgets. Put the secondary kind behind a tab or on its own page [inferred].

## Header

Left to right: page title (20–24px) · date-range control · "Updated 16:30" with a refresh button at the far right. The header has no greeting and no hero banner [inferred].

- The date-range control offers presets (Today, Last 7 days, Last 30 days, This month, Custom) and shows the resolved dates through `formatDate(day, locale, timeZone)` ("04/11/2026 – 10/11/2026"). The choice applies to every widget and lives in the URL (`?from=…&to=…`) so a shared link shows the same numbers [inferred].
- "Updated" shows the time of the last successful fetch in the user's time zone. After a failed refresh it keeps the old time and adds an inline "Refresh failed · Retry" [inferred].

## KPI tile anatomy

A tile has, top to bottom [inferred, with Atlassian's metric type sizes]:

1. **Label**: 12px medium, `text-muted-foreground`, sentence case ("Late shipments").
2. **Value**: 24px semibold, `tabular-nums`, the full value through `formatNumber` or `formatMoney` from `@/lib/format`: `596.722.000 ₫`. When it does not fit, the tile drops one type size (20px) and never abbreviates (see [Number formatting](#number-formatting)). Metric type runs 28/24/16px semibold (600) for hero/standard/dense tiles [Atlassian].
3. **Signed delta with its comparison period**: "+12% vs yesterday", "-3 vs last week". The formatter prints the + or - (`signDisplay: 'exceptZero'`) and the text names the period; a bare "+12%" does not say what it is compared with. Direction is never carried by colour alone [Carbon, NN/g]. Whether up is good depends on the metric, so the delta text stays neutral; add a status badge with text only when a threshold is crossed.
4. **Target** (optional): one line "Target 95%" or a thin bullet bar with a labelled target mark.

Rules:
- 4–6 tiles per dashboard; more turns the top of the page into noise [inferred].
- Tiles carry no decorative icons or coloured icon squares; the label already says what the number is.
- A tile with a drill-down is one link to the filtered list, and the whole tile is the target (80px or more high, far above the 24px minimum).
- Cards use a 1px border and no shadow: `border border-border bg-card`.

## Choosing a chart

| Purpose | Chart |
|---|---|
| Comparison between categories | Sorted bars (horizontal when labels are long) |
| Trend over time | Line |
| Part-to-whole | Stacked or 100% stacked bar |
| Distribution | Histogram |
| Against a target | Bullet chart |

Sorted bars, lines and bullet charts come from [NN/g].

Baseline without this skill: the generated dashboards used a pie and a donut and left axes unlabeled. Build this instead:
- Use no pie, donut, gauge, 3D or treemap [NN/g]. The part-to-whole a donut would show becomes one stacked bar with direct labels.
- Every axis has a label and a unit ("Orders per day", "Revenue (VND millions)"). Prefer direct labels at the end of a line or bar over a legend [inferred].
- One hue plus grey: draw the series that matters in `--chart-1` and the rest in `--chart-5`. Status colours (`--success`, `--warning`, `--destructive`) mark status only; semantic colours are never decorative [Fluent].
- With several series, tell them apart by label or line style as well as hue, so the chart survives greyscale [inferred].
- Give the numbers as text too [inferred]:
  - A static chart (plain SVG or canvas) gets `role="img"` and an `aria-label` with a one-sentence summary: "Orders rose from 120 to 164 over 7 days".
  - An interactive chart (Recharts with `accessibilityLayer`) gets no `role="img"`, which would hide its points from assistive technology. Its section is labelled by the chart's heading through `aria-labelledby`, and a "Show table" toggle gives the numbers (`OrdersChart` below).
- Bars start at zero. A line may use a tight range, and the axis shows it [inferred].

## Needs attention list

Baseline without this skill: items such as "7 late shipments" were plain text that linked nowhere.

- Each item is a row with a count, a plain-language label and a link to the pre-filtered list: "7 late shipments" → `/shipments?status=late`. The count in the row equals the row total on the target page.
- Order by urgency, then count. Show at most 5 and add "View all" beyond that [inferred].
- A status badge with text may sit beside the count: `bg-danger-subtle text-danger-subtle-foreground` for overdue, `bg-warning-subtle text-warning-subtle-foreground` for due soon.
- Zero items is a result, not an empty box: "Nothing needs attention" plus the check time.
- Keep a persistent live region on the list: render it empty on mount and write "3 items need attention" into it on each refresh. A region that mounts together with its text is often not announced [inferred].

## Widget states

Baseline without this skill: the generated dashboards had no loading, empty or error state per widget. Each widget handles all of them on its own, so one failing query does not blank the page.

| State | Show |
|---|---|
| Loading | Skeleton in the final layout: a label bar and a value bar for a tile, grey bars for a chart. A spinner only inside a small card [NN/g] |
| Empty | One sentence on why and the next step: "No shipments in this range" + Change date range |
| Error | What failed and a Retry button inside the widget; the other widgets keep their data |
| Stale | Keep the last values and show "Updated 16:12 · Retry" [inferred] |

Fix the widget's height while loading so the layout does not jump [inferred]. Past 10 seconds, show text with progress instead of a skeleton [NN/g].

## Number formatting

- Format through `@/lib/format` (`data-formatting.md`); components never call `new Intl.*`. Each component takes `locale` as a required prop, and `timeZone` as well when it shows dates; pages pass `LOCALE` and `TIME_ZONE` from `@/lib/locale`.
- Tiles, tooltips and tables show the full value with the locale's grouping: `596.722.000 ₫` [Fiori: full numbers by default]. A tile whose value does not fit drops one type size (`text-2xl` to `text-xl`) instead of abbreviating; `KpiTile` below switches past 13 characters, so `12.450.000.000 ₫` (16) still shows every digit [inferred].
- Compact notation (`notation: 'compact'`) is for chart axes only: `formatNumber(value, locale, { notation: 'compact' })` prints `1,2 N`, `1,5 Tr` and `12 T` in vi-VN, and the axis label names the unit ("Revenue (VND)").
- Percentages use `style: 'percent'`; deltas use `signDisplay: 'exceptZero'` so the formatter prints the sign itself: `+12%`, `-2,1%`, `0%`.
- Axis and tooltip dates go through `formatDate(day, locale, timeZone)`. The server cuts the buckets into calendar days in the display zone and sends them as `YYYY-MM-DD`, which `formatDate` never shifts (see `data-formatting.md`, Time zones).
- Tiles and tooltips use `tabular-nums`.

## Code: KpiTile and NeedsAttention

```tsx
import { Link } from 'react-router-dom' // uses `to`; Next.js next/link uses `href` instead
import { Skeleton } from '@/components/ui/skeleton'
import { formatMoney, formatNumber } from '@/lib/format'

const tones = { danger: 'bg-danger-subtle text-danger-subtle-foreground', warning: 'bg-warning-subtle text-warning-subtle-foreground' }
const box = 'rounded-md border border-border bg-card'

// `delta` is a ratio (0.12 prints +12%); pass `currency` for amounts. Pages pass `locale={LOCALE}` from '@/lib/locale'.
export function KpiTile({ label, value, currency, delta, period, href, loading, locale }: {
  label: string; value: number; currency?: string; delta: number; period: string; href: string; loading?: boolean; locale: string
}) {
  if (loading) return <div className={`${box} h-24 p-4`}><Skeleton className="h-3 w-24" /><Skeleton className="mt-3 h-6 w-16" /></div>
  const full = currency ? formatMoney(value, currency, locale) : formatNumber(value, locale)
  const size = full.length > 13 ? 'text-xl' : 'text-2xl' // always the full value; a long one drops one type size
  return (
    <Link to={href} className={`${box} block min-h-24 p-4 hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring`}>
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <p className={`mt-1 font-semibold tabular-nums ${size}`}>{full}</p>
      <p className="text-xs text-muted-foreground tabular-nums">
        {formatNumber(delta, locale, { style: 'percent', signDisplay: 'exceptZero', maximumFractionDigits: 1 })} {period}
      </p>
    </Link>
  )
}

type Item = { label: string; count: number; href: string; tone: keyof typeof tones; badge: string }

export function NeedsAttention({ items, error, onRetry, announcement, locale }: {
  items?: Item[]; error?: boolean; onRetry: () => void; announcement: string; locale: string
}) {
  return (
    <section aria-labelledby="attn" className={box}>
      <h2 id="attn" className="border-b border-border px-4 py-3 text-base font-semibold">Needs attention</h2>
      <p role="status" className="sr-only">{announcement}</p>
      {error ? <p className="p-4 text-sm">Could not load this list. <button className="h-8 underline" onClick={onRetry}>Retry</button></p>
        : !items ? <div className="space-y-2 p-4"><Skeleton className="h-6 w-full" /><Skeleton className="h-6 w-full" /></div>
        : items.length === 0 ? <p className="p-4 text-sm text-muted-foreground">Nothing needs attention.</p>
        : <ul>{items.map((i) => (
            <li key={i.href} className="border-b border-border last:border-0">
              <Link to={i.href} className="flex h-10 items-center gap-3 px-4 text-sm hover:bg-muted">
                <span className="min-w-8 text-right font-semibold tabular-nums">{formatNumber(i.count, locale)}</span>
                <span className="flex-1">{i.label}</span>
                <span className={`rounded-full px-2 text-xs leading-5 font-medium ${tones[i.tone]}`}>{i.badge}</span>
              </Link>
            </li>))}</ul>}
    </section>
  )
}
// items={[{ label: 'late shipments', count: 7, href: '/shipments?status=late', tone: 'danger', badge: 'Overdue' }]}
```

The tone map holds full class strings because Tailwind's scanner does not find class names assembled at run time. Set `announcement` to text like "3 items need attention" after each refresh; the `role="status"` element stays mounted.

## Charts with shadcn (Recharts)

shadcn's `chart` component wraps Recharts and reads series colours from a config object, which can point at the tokens:

- Install with `npx shadcn@latest add chart`. Define `const config = { orders: { label: 'Orders', color: 'var(--chart-1)' } }` and pass it to `ChartContainer`; the series then uses `var(--color-orders)`.
- `--chart-1` is the focus series and `--chart-5` (grey) the context; take `--chart-2` to `--chart-4` only for a chart that truly has several series. The `.dark` block in `tokens.css` swaps all five for lighter values.
- Give `ChartContainer` a fixed height (`className="h-64 w-full"`) and set `label` on `XAxis` and `YAxis` with units. Format the ticks with `tickFormatter`, and pass `labelFormatter` and `formatter` to `ChartTooltipContent`: its default prints the value with `toLocaleString()`, in the browser's locale rather than the project's.
- Add `accessibilityLayer` to the chart so keyboard users can step through points. Label the chart by its heading and offer the table toggle, as below.
- Render the chart once data arrives and show the skeleton from [Widget states](#widget-states) before that.

```tsx
import { useId, useState } from 'react'
import { CartesianGrid, Line, LineChart, XAxis, YAxis } from 'recharts'
import { Button } from '@/components/ui/button'
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from '@/components/ui/chart'
import { formatDate, formatNumber } from '@/lib/format'

const config = { orders: { label: 'Orders', color: 'var(--chart-1)' } } satisfies ChartConfig
type Point = { day: string; orders: number } // day: "2026-11-04", bucketed in the display zone by the server

export function OrdersChart({ data, locale, timeZone }: { data: Point[]; locale: string; timeZone: string }) {
  const id = useId()
  const [asTable, setAsTable] = useState(false)
  const day = (d: string) => formatDate(d, locale, timeZone)
  const count = (v: number) => formatNumber(v, locale)
  return (
    <section aria-labelledby={id} className="rounded-md border border-border bg-card p-4">
      <div className="flex items-center justify-between">
        <h2 id={id} className="text-base font-semibold">Orders per day</h2>
        <Button variant="outline" size="sm" onClick={() => setAsTable(!asTable)}>{asTable ? 'Show chart' : 'Show table'}</Button>
      </div>
      {asTable ? (
        <table aria-labelledby={id} className="mt-3 w-full text-sm">
          <thead><tr><th className="h-10 px-3 text-left font-medium">Date</th><th className="h-10 px-3 text-right font-medium">Orders</th></tr></thead>
          <tbody>{data.map((p) => (
            <tr key={p.day} className="border-t border-border">
              <td className="h-10 px-3 tabular-nums">{day(p.day)}</td>
              <td className="h-10 px-3 text-right tabular-nums">{count(p.orders)}</td>
            </tr>))}</tbody>
        </table>
      ) : (
        <ChartContainer config={config} className="mt-3 h-64 w-full">
          <LineChart accessibilityLayer data={data} margin={{ left: 8, bottom: 16 }}>
            <CartesianGrid vertical={false} />
            <XAxis dataKey="day" tickFormatter={day} label={{ value: 'Date', position: 'insideBottom', offset: -12 }} />
            <YAxis tickFormatter={(v: number) => formatNumber(v, locale, { notation: 'compact' })} label={{ value: 'Orders', angle: -90, position: 'insideLeft' }} />
            <ChartTooltip content={<ChartTooltipContent labelFormatter={day} formatter={(v) => <span className="tabular-nums">Orders {count(Number(v))}</span>} />} />
            <Line dataKey="orders" stroke="var(--color-orders)" strokeWidth={2} dot={false} />
          </LineChart>
        </ChartContainer>
      )}
    </section>
  )
}
```

The heading names the chart for both views; the button keeps focus when it switches between them.
