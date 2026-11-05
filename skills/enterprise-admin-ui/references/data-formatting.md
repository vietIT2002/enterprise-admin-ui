# Data formatting

Read this when a screen shows numbers, money, percentages, dates, times, empty values or people's names, or when you set up the project's locale.

## Contents
- [Principles](#principles)
- [Numbers](#numbers)
- [Money](#money)
- [Percentages and changes](#percentages-and-changes)
- [Dates and times](#dates-and-times)
- [Time zones](#time-zones)
- [Relative time](#relative-time)
- [Empty and unknown values](#empty-and-unknown-values)
- [Text, names and search](#text-names-and-search)
- [vi-VN profile](#vi-vn-profile)
- [Code: formatters](#code-formatters)

Every output below was produced by running Node 24 (`Intl` and the formatters in [Code: formatters](#code-formatters)); U+00A0 is shown as a normal space.

## Principles

1. **The locale comes from the project.** `lib/locale.ts` exports `LOCALE` and `TIME_ZONE`, copied from the DESIGN.md `## Locale` section (see [Code: formatters](#code-formatters)). Components take `locale` and `timeZone` as required props and pages pass `LOCALE` and `TIME_ZONE`; no component reads the browser language or has a default locale. When the app lets each user pick a locale, replace the constants with the user's setting.
2. **Store raw values, format on display.** Numbers stay numbers, money is an amount plus an ISO currency code, instants are UTC ISO 8601 strings (`2026-11-04T08:58:00Z`) and calendar dates are `YYYY-MM-DD`. Sorting, filtering and exports work on the raw values [inferred].
3. **Format through `Intl`, from one module.** `lib/format.ts` holds every formatter. Components import from `@/lib/format`; they never call `new Intl.*` themselves or build separators, decimals or date parts by hand [Polaris, Fiori].
4. **One value, one look.** A figure reads the same in the list, the detail page, the form, the KPI tile and the toast.
5. **Text carries the meaning.** Sign, direction and status are in the text; colour may add to them and is never the only signal [Carbon, NN/g].
6. **Compare with the formatter, not a typed string.** `Intl` puts a no-break space (U+00A0) before `₫`, which keeps the symbol on the number's line, and vi-VN uses a hyphen-minus (U+002D) as the minus sign. Tests compare against the formatter's output.

## Numbers

- `formatNumber(value, locale)` wraps `Intl.NumberFormat(locale)`. vi-VN prints `1.234,5` (decimal comma, thousands dot) and `1.284`.
- Numeric cells and their headers are right-aligned with `tabular-nums` [Polaris, Primer, Ant]. This holds in lists, related lists, line items and summary tables (see `tables.md`).
- The unit lives in the column header and the cells hold the number alone: "Qty (pcs)", "Weight (kg)", "Amount (VND)" [Polaris].
- A column keeps one number of decimals: `{ minimumFractionDigits: 2, maximumFractionDigits: 2 }` prints `12,50`, `3,00`, `0,25` [Polaris].
- Negative values: `Intl` puts the minus first, `-250.000` [Polaris]. The text keeps the meaning: a refund row reads "Refund -250.000 ₫" or has a Type column saying "Refund". Red text may be added; the sign and the word stay [Carbon, NN/g].
- Sizes and measures use `style: 'unit'`: `formatNumber(1.2, locale, { style: 'unit', unit: 'megabyte', maximumFractionDigits: 1 })` prints `1,2 MB`.
- Identifiers are text: order numbers, phone numbers, tax codes, postal codes and bank accounts stay left-aligned strings [Fiori]. Through a number formatter, tax code `0312345678` becomes `312.345.678` and loses its leading zero.
- Counts inside sentences use the same formatter: "Select all 1.284 matching" in vi-VN.

## Money

- The currency comes from the record (the invoice's `currency` field), not from the UI language. The locale sets separators and symbol position; the currency sets the symbol and the decimals [Polaris, Fiori].
- `formatMoney(value, currency, locale, opts?)` lets `Intl` apply each currency's decimals: VND has 0, USD has 2. `opts` are merged into `{ style: 'currency', currency }`. `formatMoney(1250000.4, 'VND', 'vi-VN')` prints `1.250.000 ₫`.

  | Value | Currency | Locale | `formatMoney` output |
  |---|---|---|---|
  | 1250000 | VND | vi-VN | `1.250.000 ₫` |
  | 1250 | USD | en-US | `$1,250.00` |
  | 1250 | USD | vi-VN | `1.250,00 US$` |
  | 1250000 | VND | en-US | `₫1,250,000` |

- **One currency per table:** the header names it ("Total (VND)") and the cells hold the number alone, through `formatAmount(value, currency, locale)`. It takes the currency's decimals from `Intl` and prints no symbol: `1.250.000` for VND, `54,20` for USD.
- **Mixed currencies:** each cell carries its own currency, and totals add only like currencies. Each total shows its ISO code: `formatMoney(total, currency, locale, { currencyDisplay: 'code' })` prints `1.250.000 VND · 54,20 USD` (see `tables.md`, Totals row) [Polaris]. Without the option the same totals read `1.250.000 ₫ · 54,20 US$`.
- **Totals** are computed from raw amounts, in integer minor units or a decimal type, and formatted once at the end [inferred].
- **Full values by default** [Fiori]. Tables, forms, KPI tiles, tooltips and toasts show the full amount; exports carry the raw number.
- **KPI tiles show the full value:** `596.722.000 ₫`. When a value such as `12.450.000.000 ₫` does not fit, the tile drops one type size (`text-2xl` to `text-xl`) and still shows every digit, as `KpiTile` in `dashboards-charts.md` does [inferred].
- **Compact notation** (`notation: 'compact'`) is for chart axes only, whose label names the unit ("Revenue (VND)"). `formatNumber(value, locale, { notation: 'compact' })` prints `1,2 N`, `1,5 Tr` and `12 T` in vi-VN (see `dashboards-charts.md`).

## Percentages and changes

- `style: 'percent'` takes a ratio: `formatNumber(0.036, locale, { style: 'percent', maximumFractionDigits: 1 })` prints `3,6%`. Passing `3.6` prints `360%`.
- Changes use `signDisplay: 'exceptZero'`, so the formatter prints the sign: `+3,6%`, `-2,1%`, and `0%` with no sign. Count changes work the same way: `+12`, `-3`.
- Every change names its comparison period in words: "+3,6% vs yesterday", "-3 vs last week". A bare `+3,6%` does not say what it is compared with (Dashboard recipe in SKILL.md; `dashboards-charts.md`).
- The sign is in the text. An arrow icon (`ArrowUp`, `ArrowDown`, `aria-hidden="true"`) may sit before it, and colour may be added as well [Carbon, NN/g]. Whether up is good depends on the metric, so the delta text stays neutral; a status badge with text marks a crossed threshold (see `dashboards-charts.md`).
- A change in a rate is stated in points: on-time rate `95,2%`, "+0,8 pts vs last week" [inferred].
- A column, or a row of tiles, keeps the same decimals; percentages usually take `maximumFractionDigits: 1` [Polaris; the 1 is inferred].

## Dates and times

- Show absolute dates by default. For vi-VN, `formatDate` prints `04/11/2026` (dd/MM/yyyy) and `formatDateTime` prints `04/11/2026 15:58` (24-hour, `hourCycle: 'h23'`). Accounting and audit columns show absolute values only [inferred].
- `formatDateTime` formats the date and the time separately and joins them, because one vi-VN formatter with both parts prints `15:58 04/11/2026`, time first. `AuditStamp` in `permissions-audit.md` calls it.
- The locale sets order and separators. The same instant in Asia/Ho_Chi_Minh:

  | Locale | `formatDateTime` output |
  |---|---|
  | vi-VN | `04/11/2026 15:58` |
  | en-GB | `04/11/2026 15:58` |
  | de-DE | `04.11.2026 15:58` |
  | en-US | `11/04/2026 15:58` |

- Wrap the text in `<time dateTime="2026-11-04T08:58:00Z">`, so the machine value travels with it.
- Date and date-time cells use `tabular-nums`. Sort by the timestamp, never by the formatted text (see `tables.md`).
- A range shows both ends with an en dash: `04/11/2026 – 10/11/2026` (see `dashboards-charts.md`).

## Time zones

- Store instants in UTC and display them in the user's time zone; when the user has none, use the tenant's zone from DESIGN.md `## Locale` [inferred].
- Use IANA names (`Asia/Ho_Chi_Minh`), not fixed offsets. Asia/Ho_Chi_Minh is UTC+7 all year with no daylight saving: 15 January and 15 July both print `GMT+7`. Zones such as Europe/Berlin change offset during the year, and the IANA name follows that.
- The instant `2026-11-04T08:58:00Z` is `04/11/2026 15:58` in Asia/Ho_Chi_Minh and `04/11/2026 08:58` in UTC.
- When users or records span zones, show the zone: `formatDateTime(iso, locale, timeZone, true)` prints `04/11/2026 15:58 (GMT+7)`, and `04/11/2026 09:58 (GMT+1)` for a user in Europe/Berlin [inferred].
- Day boundaries follow the display zone. `2026-11-04T20:30:00Z` is `05/11/2026 03:30` in Asia/Ho_Chi_Minh, so "Today" filters, daily totals and chart buckets are computed in that zone, on the server too [inferred].
- Date-only values (due date, birth date, posting date) are calendar days, not instants. Store them as `2026-11-04` and keep them unshifted: `new Date('2026-11-04')` formatted for a user in America/Los_Angeles prints `03/11/2026`. `formatDate` recognises the `YYYY-MM-DD` form and formats it in UTC, so it prints `04/11/2026` in every zone.

## Relative time

- Use relative time only for events within about 7 days, and always together with the absolute value [inferred; Ant switches to absolute after 24 hours, Primer after 30 days].
- Format it with `formatRelative(iso, locale, now)`, which wraps `Intl.RelativeTimeFormat(locale, { numeric: 'auto' })`, says "now" under a minute and then counts minutes, hours or days: vi-VN prints `bây giờ`, `2 phút trước`, `2 giờ trước`, `Hôm qua`, `3 ngày trước`.
- The absolute value is always visible text, and the relative value may follow it: "04/11/2026 15:58 · 2 giờ trước" (Record detail recipe in SKILL.md; `permissions-audit.md`). This holds everywhere a time appears: activity feeds, history tabs, "Last changed" stamps, notification lists and comment headers. Where space is tight, drop the relative part, never the absolute one [inferred].
- Wrap both in one `<time>` whose `dateTime` holds the ISO value: `<time dateTime={iso} className="tabular-nums">{formatDateTime(iso, locale, timeZone)} · {formatRelative(iso, locale)}</time>`.
- Events older than about 7 days show the absolute value alone, and accounting and audit columns always do [inferred].
- Re-render relative text every minute so "2 phút trước" does not go stale [inferred].

## Empty and unknown values

Ant shows "--" and Fiori leaves amounts blank [Ant, Fiori]. This skill uses one mark for the whole app [inferred]:

| The value is | Show |
|---|---|
| Not set (null, empty string, never entered) | `—` from `formatEmpty()`, with the accessible name "Not set" |
| Zero | `0`, or `0 ₫` for money; zero is a real value |
| Not loaded because a request failed | The region's error state with Retry (see `feedback-states.md`). A count that could not load is hidden rather than shown as 0 [Primer] |
| Hidden from this role | The field is left out, or masked as in `permissions-audit.md` ("•••• 4821") |

- A value that is not set shows `—` in tables, detail fields, KPI tiles and read-only form fields. It never shows as "N/A", "null", "undefined", `0` or a blank cell.
- In a numeric column `—` stays right-aligned with the numbers.
- In a history field diff, a blank old or new value reads "(empty)", as `permissions-audit.md` specifies: "(empty) → 80.000.000 ₫".
- Formatters take a value that exists. The cell checks for `null` first and renders `EmptyValue`, saved as `components/empty-value.tsx` so every screen imports it from `@/components/empty-value`:

```tsx
// components/empty-value.tsx
import { formatEmpty } from '@/lib/format'

export function EmptyValue() {
  return (
    <>
      <span aria-hidden="true" className="text-muted-foreground">{formatEmpty()}</span>
      <span className="sr-only">Not set</span>
    </>
  )
}
```

```tsx
import { EmptyValue } from '@/components/empty-value'
import { formatAmount } from '@/lib/format'

// A cell in a single-currency column; the header says "Total (VND)".
export function AmountCell({ value, currency, locale }: { value: number | null; currency: string; locale: string }) {
  return (
    <td className="h-10 px-3 text-right tabular-nums">
      {value == null ? <EmptyValue /> : formatAmount(value, currency, locale)}
    </td>
  )
}
```

## Text, names and search

- **Wrap first.** Names, IDs and labels wrap rather than cut [Fiori]. Long free text (notes, addresses) may be truncated, and then the full text is in `title` or a tooltip (see `tables.md`, Truncation).
- **Room for other languages.** Translated text runs up to 50% longer than English, and short labels up to 300%; Vietnamese and German labels are typical cases. Size columns and buttons for the longest language [Polaris].
- **Whole sentences.** Write each message as one template with placeholders ("Delete role {name}? {count} users will lose these permissions.") so translators can reorder words; joining fragments breaks in other languages [Polaris].
- **Names.** Store a person's full name as written, family name first for Vietnamese ("Trần Minh Quân"), and let users choose the name order where it matters [Polaris].
- **Sorting.** Compare with the locale's collation: `a.localeCompare(b, locale)`, or one `Intl.Collator(locale)` reused for long lists. Code-point order puts Đ and accented capitals after Z:

  | Sort (vi-VN) | Result |
  |---|---|
  | `names.sort()` | Bùi An, Dương Minh, Nguyễn Lan, Ánh Dương, Đặng Thu Hà, Đỗ Hà |
  | `localeCompare(b, locale)` | Ánh Dương, Bùi An, Dương Minh, Đặng Thu Hà, Đỗ Hà, Nguyễn Lan |

- **Search ignores case and diacritics.** Fold both the query and the text with `foldVi` from `@/lib/format`: `normalize('NFD')`, strip the combining marks U+0300–U+036F, map `đ` to `d` and `Đ` to `D` (they do not decompose: NFD alone turns `Đức` into `Đuc`), then lower-case. "duc" then finds "Nguyễn Văn Đức", and "đức" finds "Nguyen Van Duc". `filters-search.md` and `bulk-import-export.md` call the same `foldVi`; no other file defines a folding function. The server folds the same way (PostgreSQL `unaccent` plus `lower`) [inferred].

```ts
import { foldVi } from '@/lib/format'

// "duc" finds "Nguyễn Văn Đức"; "ĐÀ NẴNG" folds to "da nang".
export const matches = (text: string, query: string) => foldVi(text).includes(foldVi(query.trim()))
```

- **Line height.** Vietnamese stacks marks above and below letters (Ễ, Ộ), so text keeps a line-height of at least 1.4. `text-sm` is 14/20 (1.43) [Fluent, Atlassian]. Tailwind's `text-xs` is 12/16 (1.33); 12px Vietnamese text inside `truncate` or a fixed height gets `leading-5` so its marks are not clipped [inferred].
- **Font coverage.** The system UI stack covers Vietnamese. A web font needs its `vietnamese` subset (`next/font/google`: `subsets: ['latin', 'vietnamese']`); without it the browser falls back glyph by glyph and mixes typefaces inside one word [inferred].

## vi-VN profile

The defaults for a Vietnamese project. DESIGN.md `## Locale` records them.

| Item | Value |
|---|---|
| Locale | `vi-VN`; `<html lang="vi">`; `LOCALE = 'vi-VN'` in `lib/locale.ts` |
| Numbers | Decimal comma, thousands dot: `1.234,5` |
| Money | VND, 0 decimals, symbol after the number: `1.250.000 ₫`; `1.250.000` in a "Total (VND)" column |
| Percent and change | `95,2%`; `+3,6% vs yesterday` |
| Compact (chart axes only) | `1,2 N`, `1,5 Tr`, `12 T` |
| Date | `04/11/2026` (dd/MM/yyyy) |
| Date-time | `04/11/2026 15:58` (24-hour) |
| Time zone | `Asia/Ho_Chi_Minh`, UTC+7, no daylight saving; `TIME_ZONE` in `lib/locale.ts` |
| Relative time | After the absolute value: `04/11/2026 15:58 · 2 giờ trước`, `Hôm qua` |
| Phone | `0903 123 456` (mobile, 4-3-3 groups), left-aligned text; store `+84903123456` [inferred] |
| Tax code (MST) | 10 digits (`0312345678`), or 13 for a branch, written `0312345678-001`; validate with `/^\d{10}(-\d{3})?$/` |
| Sorting | `a.localeCompare(b, 'vi')` |
| Search | `foldVi`: case- and diacritic-insensitive; `đ` matches `d` |

## Code: formatters

Two small modules. `lib/locale.ts` holds the project's locale, copied from DESIGN.md `## Locale`:

```ts
// lib/locale.ts: pages import these and pass them to components as `locale` and `timeZone` props.
export const LOCALE = 'vi-VN'
export const TIME_ZONE = 'Asia/Ho_Chi_Minh'
```

`lib/format.ts` holds every formatter, so screens import from `@/lib/format`. The `Intl` objects are cached per locale and options, so calling a formatter in every table cell stays cheap.

```ts
// lib/format.ts: every number, amount, date and search fold on screen goes through these.
const cache = new Map<string, unknown>()
function memo<T>(kind: string, locale: string, opts: object, make: () => T): T {
  const key = `${kind}|${locale}|${JSON.stringify(opts)}`
  if (!cache.has(key)) cache.set(key, make())
  return cache.get(key) as T
}
const nf = (locale: string, opts: Intl.NumberFormatOptions = {}) => memo('n', locale, opts, () => new Intl.NumberFormat(locale, opts))
const df = (locale: string, opts: Intl.DateTimeFormatOptions) => memo('d', locale, opts, () => new Intl.DateTimeFormat(locale, opts))
const rtf = (locale: string) => memo('r', locale, {}, () => new Intl.RelativeTimeFormat(locale, { numeric: 'auto' }))

const DATE: Intl.DateTimeFormatOptions = { day: '2-digit', month: '2-digit', year: 'numeric' }
const TIME: Intl.DateTimeFormatOptions = { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }
const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/

export function formatNumber(value: number, locale: string, opts?: Intl.NumberFormatOptions) {
  return nf(locale, opts).format(value)
}

// Currency comes from the record; Intl applies its decimals (VND 0, USD 2). opts: e.g. { currencyDisplay: 'code' }.
export function formatMoney(value: number, currency: string, locale: string, opts?: Intl.NumberFormatOptions) {
  return nf(locale, { style: 'currency', currency, ...opts }).format(value)
}

// A single-currency column whose header names the currency ("Total (VND)"): its decimals, no symbol.
export function formatAmount(value: number, currency: string, locale: string) {
  const d = nf(locale, { style: 'currency', currency }).resolvedOptions().maximumFractionDigits
  return nf(locale, { minimumFractionDigits: d, maximumFractionDigits: d }).format(value)
}

// "2026-11-04" is a calendar day (due date): format it in UTC so no zone moves it.
export function formatDate(iso: string, locale: string, timeZone: string) {
  const zone = DATE_ONLY.test(iso) ? 'UTC' : timeZone
  return df(locale, { ...DATE, timeZone: zone }).format(new Date(iso))
}

// Date and time are formatted apart and joined: one vi-VN formatter puts the time first.
export function formatDateTime(iso: string, locale: string, timeZone: string, showZone = false) {
  const d = new Date(iso)
  const text = `${df(locale, { ...DATE, timeZone }).format(d)} ${df(locale, { ...TIME, timeZone }).format(d)}`
  if (!showZone) return text
  const parts = df(locale, { timeZone, timeZoneName: 'shortOffset' }).formatToParts(d)
  return `${text} (${parts.find((p) => p.type === 'timeZoneName')?.value})`
}

// Follows the absolute value, never replaces it: "04/11/2026 15:58 · 2 giờ trước".
export function formatRelative(iso: string, locale: string, now = new Date()) {
  const s = (new Date(iso).getTime() - now.getTime()) / 1000
  const a = Math.abs(s)
  const [n, unit]: [number, Intl.RelativeTimeFormatUnit] =
    a < 60 ? [0, 'second'] : a < 3600 ? [s / 60, 'minute'] : a < 86400 ? [s / 3600, 'hour'] : [s / 86400, 'day']
  return rtf(locale).format(Math.round(n), unit)
}

// The one empty mark; render it through EmptyValue so it has the accessible name "Not set".
export const formatEmpty = () => '—'

// Search folding, used by every file that matches text: "Nguyễn Văn Đức" → "nguyen van duc".
export const foldVi = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D').toLowerCase()
```

Usage: a page imports `LOCALE` and `TIME_ZONE` from `@/lib/locale` and passes them down (`<OrdersTable locale={LOCALE} timeZone={TIME_ZONE} />`). Cells call `formatAmount(row.total, 'VND', locale)`, `formatMoney(row.total, row.currency, locale)` or `formatDateTime(row.changedAt, locale, timeZone)`.
