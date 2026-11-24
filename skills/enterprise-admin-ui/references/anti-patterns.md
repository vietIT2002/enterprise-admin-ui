# Anti-patterns

Read this when a screen looks generic or AI-built, before you hand a screen over, and when you review existing screens.

## Contents
- [How to use](#how-to-use)
- [Entries](#entries)
  - Header and dashboard: [greeting-header](#greeting-header) · [kpi-strip-above-table](#kpi-strip-above-table) · [kpi-icon-tiles](#kpi-icon-tiles) · [delta-pill-without-period](#delta-pill-without-period) · [pie-donut-gauge](#pie-donut-gauge) · [decorative-chart](#decorative-chart)
  - Images and surfaces: [initials-avatar-non-person](#initials-avatar-non-person) · [gradient](#gradient) · [glass](#glass) · [card-shadow](#card-shadow) · [card-in-card](#card-in-card) · [hover-lift](#hover-lift) · [oversized-radius](#oversized-radius)
  - Text, icons and colour: [tracked-uppercase-labels](#tracked-uppercase-labels) · [emoji-icon](#emoji-icon) · [rainbow-status](#rainbow-status)
  - App shell: [navy-sidebar-indigo-accent](#navy-sidebar-indigo-accent) · [sidebar-promo-card](#sidebar-promo-card)
  - Tables and forms: [stacked-table-rows](#stacked-table-rows) · [placeholder-label](#placeholder-label) · [save-disabled-before-submit](#save-disabled-before-submit)
  - States and markup: [demo-state-switcher](#demo-state-switcher) · [hidden-overridden](#hidden-overridden)
- [Reviewing an AI-built screen](#reviewing-an-ai-built-screen)

## How to use

- Each heading is the tell's name. Use it as the rule in a review finding.
- Each entry has four lines:
  - **Looks like:** the markup or classes that give the tell away.
  - **Why it reads as a template:** what the user loses.
  - **Build instead:** the replacement, with the token classes of `assets/tokens.css` (`bg-card`, `border-border`, `text-muted-foreground` …) or the Tailwind palette classes SKILL.md names.
  - **Detect:** an audit rule from `scripts/audit.js` (run in a browser, see SKILL.md Verify), an `rg` command for the source, or both.
- In each `rg` command, replace `src` with the screen's source folder or file. Most single-line patterns also work with `grep -rnE`; `rg -U` patterns span lines.
- A pattern finds candidates. Open each hit and confirm it before you report it: a shadow on a menu or dialog, or initials for an employee, is correct.

## Entries

### greeting-header
- **Looks like:** `<h1>Good morning, Hoa 👋</h1>` or "Welcome back" with a subtitle ("Here's what's happening today"), often in a hero band (`rounded-2xl bg-gradient-to-r p-8`).
- **Why it reads as a template:** A dashboard serves one task at a glance [NN/g]; the greeting fills the first viewport with words nobody acts on and pushes the work down [inferred].
- **Build instead:** One header row, `flex items-center justify-between`: `<h1 class="text-xl font-semibold">Dashboard</h1>`, the date-range control and "Updated 16:30"; the work starts right below [SKILL.md Dashboard recipe].
- **Detect:** `rg -n -i 'good (morning|afternoon|evening)|welcome back|xin chào|chào mừng' src`; on a list page, audit `table-above-fold`.

### kpi-strip-above-table
- **Looks like:** a `grid grid-cols-4 gap-4` row of stat cards ("Total orders", "Revenue") between the page header and the list's table.
- **Why it reads as a template:** It pushes the table, the reason for the page, below the first viewport and repeats counts the status tabs already carry [SKILL.md List recipe].
- **Build instead:** Counts in the status tabs ("All 96 · Pending 3 · Shipping 6") or one line above the table: `<p class="text-sm text-muted-foreground tabular-nums">96 orders · 596.722.000 ₫</p>`. KPI tiles belong on the dashboard.
- **Detect:** audit `table-above-fold`: an error with `pageType: 'list'`, a warning when no page type is given, and not checked on other page types.

### kpi-icon-tiles
- **Looks like:** each KPI tile leads with a tinted icon square, a different hue per tile: `<div class="rounded-lg bg-blue-100 p-3"><ShoppingCart class="text-blue-600" /></div>`.
- **Why it reads as a template:** The label already says what the number is; four extra hues pull the eye from the values, and semantic colours are never decorative [Fluent].
- **Build instead:** A tile `rounded-md border border-border bg-card p-4` holding the label, the value (`text-2xl font-semibold tabular-nums`) and the delta line, as in `references/dashboards-charts.md` KpiTile.
- **Detect:** `rg -n 'bg-[a-z]+-(50|100)[^"]*(p-[23]|size-1[02]|w-1[02])\b|(p-[23]|size-1[02]|w-1[02])\b[^"]*bg-[a-z]+-(50|100)|bg-primary/10' src`, then keep the hits inside KPI tiles.

### delta-pill-without-period
- **Looks like:** `<span class="rounded-full bg-green-100 px-2 text-green-700">↑ 12%</span>` beside the value with no comparison period; green or red carries the direction.
- **Why it reads as a template:** "+12%" does not say what it is compared with, and colour alone cannot carry direction [Carbon, NN/g].
- **Build instead:** A text line under the value, `<p class="text-xs text-muted-foreground tabular-nums">+12% vs yesterday</p>`, formatted by `formatNumber(change, locale, { style: 'percent', signDisplay: 'exceptZero', maximumFractionDigits: 1 })` from `@/lib/format` (`change` is a ratio: 0.12 prints "+12%"); a status badge appears only when a threshold is crossed.
- **Detect:** `rg -n 'TrendingUp|TrendingDown|ArrowUpRight|ArrowDownRight|[↑↓▲▼+\x{2212}-] ?[0-9]+([.,][0-9]+)? ?%' src | rg -v 'vs |so với'`.

### pie-donut-gauge
- **Looks like:** `<PieChart>` or `<Pie innerRadius={60}>`, Chart.js `type: 'doughnut'`, a `conic-gradient` ring, or a semicircle gauge for one percentage.
- **Why it reads as a template:** Angles and arcs are hard to compare; NN/g advises against pies, gauges, 3D and treemaps [NN/g].
- **Build instead:** Sorted bars to compare categories, a line for a trend, one stacked bar with direct labels for part-to-whole, a bullet chart against a target (`references/dashboards-charts.md`).
- **Detect:** `rg -n -i '<Pie\b|PieChart|RadialBar|doughnut|donut|gauge|conic-gradient' src`.

### decorative-chart
- **Looks like:** an area chart or sparkline with hidden or unlabelled axes (`<YAxis hide />`), a gradient fill (`<linearGradient>` with `fill="url(#…)"`), a legend in place of labels, several bright hues.
- **Why it reads as a template:** Without axis labels and units nobody can read a value off the chart, so it is decoration [inferred].
- **Build instead:** `XAxis` and `YAxis` with `label` and units ("Orders per day"), the focus series in `--chart-1` and the rest in `--chart-5`, direct labels, and a text alternative: a static SVG or canvas chart is `role="img"` with a one-sentence `aria-label` ("Orders rose from 120 to 164 over 7 days"); an interactive Recharts chart with `accessibilityLayer` has no `role="img"`, takes its name from its heading through `aria-labelledby` and offers a table toggle (`references/accessibility.md`).
- **Detect:** `rg -n '<(XAxis|YAxis)\b' src | rg -v 'label='` (axes written on one line without a label); `rg -n 'linearGradient' src` (gradient fills).

### initials-avatar-non-person
- **Looks like:** `<div class="flex size-8 items-center justify-center rounded-full bg-indigo-100">MP</div>` beside a company, order or product.
- **Why it reads as a template:** An avatar says "this is a person"; initials for "Công ty Minh Phát" fill space and mislead [SKILL.md Record detail].
- **Build instead:** The company's logo beside its name when it has one, otherwise the name alone; avatars stay for employees, users and contacts. A logo beside its visible name has an empty `alt` (`<img class="size-6 rounded" alt="">`); a logo shown alone has `alt` with the name.
- **Detect:** `rg -n 'AvatarFallback|[Ii]nitials|>(Đ|[A-Z]){2}</(div|span)>' src`, then keep the hits that stand for a non-person.

### gradient
- **Looks like:** `bg-gradient-to-r from-indigo-500 to-purple-600` on headers, logo blocks, buttons or tiles; gradient text (`bg-clip-text text-transparent`).
- **Why it reads as a template:** Brand colour belongs on actions and selection, never on large surfaces [Fluent].
- **Build instead:** Flat `bg-background` and `bg-card` surfaces; the single accent, `bg-primary text-primary-foreground`, on the one primary button.
- **Detect:** audit `no-gradient`; `rg -n 'bg-gradient-|bg-(linear|radial|conic)-|(linear|radial)-gradient\(' src`.

### glass
- **Looks like:** `bg-white/70 backdrop-blur-md` on the header, sidebar, cards or dialogs.
- **Why it reads as a template:** A frosted surface changes its text contrast with whatever scrolls beneath it and adds depth that data screens do not need [inferred].
- **Build instead:** Opaque surfaces with a 1px border, `border border-border bg-card`; a sticky header is `sticky top-0 border-b border-border bg-background`.
- **Detect:** audit `no-backdrop-blur`; `rg -n 'backdrop-blur|backdrop-filter' src`.

### card-shadow
- **Looks like:** `shadow-sm` to `shadow-lg` on every card, KPI tile and table container (shadcn `Card` ships with `shadow-sm`).
- **Why it reads as a template:** A shadow says "this floats above the page"; on page content it adds noise and leaves menus and dialogs nothing to stand out with [inferred; SKILL.md Surfaces].
- **Build instead:** `rounded-md border border-border bg-card` and no shadow; shadows go on menus, popovers, dialogs and toasts.
- **Detect:** audit `surface-shadow`; `rg -n '(^|[^-:a-z0-9])shadow(-(sm|md|lg|xl|2xl))?([^-a-z0-9/]|$)' src` (this also finds the default in `components/ui/card.tsx`).

### card-in-card
- **Looks like:** a bordered card around a page section that holds more bordered cards (`<Card><CardContent><Card>`), or a table in a card in a card.
- **Why it reads as a template:** Each frame adds a border and padding without adding meaning; a stack of identical bordered boxes is not a layout (`references/navigation-layout.md`) [inferred].
- **Build instead:** One bordered surface per region; inside it, group content under headings with `divide-y divide-border` or `border-t border-border`.
- **Detect:** `rg -U -n '(<Card\b|[ "]border[ "])[^>]*>\s*(<[^>]+>\s*)?(<Card\b|<div[^>]*[ "]border[ "])' src` (a card or bordered box whose first or second child is another one).

### hover-lift
- **Looks like:** `transition-all hover:-translate-y-1 hover:shadow-lg` (or `hover:scale-105`) on cards, tiles and rows.
- **Why it reads as a template:** Moving surfaces suit a storefront; in a work tool, tiles and rows jump under the pointer while the user reads them [inferred].
- **Build instead:** A clickable tile or row changes only its background, `hover:bg-muted`, plus `focus-visible:ring-2 focus-visible:ring-ring` for keyboard users.
- **Detect:** `rg -n 'hover:(-?translate-|scale-|shadow-(md|lg|xl|2xl))' src`.

### oversized-radius
- **Looks like:** `rounded-xl` to `rounded-3xl` on cards, inputs and dialogs; pill-shaped (`rounded-full`) buttons and inputs.
- **Why it reads as a template:** Large radii are a consumer and marketing look; the design systems surveyed use 0–8px on controls and cards [Carbon, Fluent, Primer, Atlassian].
- **Build instead:** 4px on controls (`rounded`), 6px on cards (`rounded-md`), 8px on dialogs; `rounded-full` only on badges and chips.
- **Detect:** audit `radius-scale`; `rg -n 'rounded(-[a-z]{1,2})?-(xl|2xl|3xl)|border-radius: ?([1-9][0-9]+)px' src`. With `assets/tokens.css` on Tailwind v4 these classes are capped at 8px, so the audit decides.

### tracked-uppercase-labels
- **Looks like:** `text-xs font-semibold uppercase tracking-wider text-gray-500` on table headers, KPI labels, nav group labels and buttons.
- **Why it reads as a template:** All caps reads slower and the extra tracking widens every header [inferred]; the design systems use sentence case [Fluent, Atlassian].
- **Build instead:** Sentence case with normal tracking at the sizes of SKILL.md's Font row: table headers `text-sm font-medium`, nav group labels 12px `text-muted-foreground`.
- **Detect:** audit `uppercase-text`; `rg -n '(^|[^-:a-z])uppercase([^-a-z]|$)|tracking-(wide|wider|widest)|text-transform: ?uppercase' src`.

### emoji-icon
- **Looks like:** "📦 Orders" in the sidebar, "🚀 Upgrade" on a button, "✅ Paid" in a badge, emoji in headings and empty states.
- **Why it reads as a template:** Emoji look different on each OS, ignore the text colour and are read out by name ("package Orders") [inferred]; one icon set keeps the screen consistent [Fluent].
- **Build instead:** lucide icons at 16px (`size-4`) with `aria-hidden="true"`, beside a text label.
- **Detect:** audit `emoji-icon`; `rg -n '[\x{1F300}-\x{1FAFF}\x{2600}-\x{27BF}]' src` (`rg` only: `grep -E` has no code-point ranges).

### rainbow-status
- **Looks like:** one hue per status: Pending yellow, Processing purple, Shipped blue, Delivered green, Cancelled red, Refunded pink (`bg-purple-100 text-purple-700` …).
- **Why it reads as a template:** Nobody learns six colours, and colour ends up meaning "which status" instead of "how urgent"; keep at most 5–6 statuses in view [Carbon].
- **Build instead:** Five tones (neutral, info, success, warning, danger) from the one `StatusBadge` in `references/permissions-audit.md`, each entity status mapped to a tone in DESIGN.md. Its tone map spells out every full class string (`bg-success-subtle text-success-subtle-foreground` …) so Tailwind finds them; never build a class name from the tone at runtime.
- **Detect:** `rg -o -N --no-filename 'bg-[a-z]+-(50|100)\b' src | sort -u` prints more than five tints; check which of them colour status badges.

### navy-sidebar-indigo-accent
- **Looks like:** `<aside class="w-64 bg-slate-900 text-slate-300">` with active items in `rounded-lg bg-indigo-600 text-white`, often under a gradient logo block.
- **Why it reads as a template:** It is the stock admin-template shell: the dark block competes with the content and the accent spreads past actions; brand colour belongs on actions and selection, never on large surfaces [Fluent].
- **Build instead:** `border-r border-sidebar-border bg-sidebar text-sidebar-foreground`; the active item `bg-sidebar-accent text-sidebar-accent-foreground font-medium` with `aria-current="page"` (`references/navigation-layout.md`).
- **Detect:** `rg -n '<(aside|nav|Sidebar)\b[^>]*bg-(slate|gray|zinc|neutral|stone|indigo|blue)-(800|900|950)|indigo-[5-7]00' src`.

### sidebar-promo-card
- **Looks like:** an "Upgrade to Pro" card, a storage meter or an illustration at the bottom of the sidebar, often on a gradient.
- **Why it reads as a template:** It takes navigation space to sell to people who already use the product at work [inferred].
- **Build instead:** The sidebar footer holds Help and the collapse button; plan and billing live in Settings → Billing.
- **Detect:** `rg -n -i 'upgrade|go pro|pro plan|nâng cấp' src`, then keep the hits inside the sidebar.

### stacked-table-rows
- **Looks like:** the first cell stacks name, email and phone (`<div class="font-medium">…</div><div class="text-xs text-gray-500">…</div>`), so rows grow to 56–72px.
- **Why it reads as a template:** Users scan down columns; stacked values cannot be sorted or compared and double the 40px row [Carbon].
- **Build instead:** One line per row (`h-10` text cells); the secondary value gets its own column ("Phone", "City") or moves to the detail page.
- **Detect:** audit `table-row-two-line` and `table-row-height`; `rg -U -n '<(td|TableCell)\b[^>]*>\s*<(div|p)\b[^>]*>[^<]*</(div|p)>\s*<(div|p|span)\b' src`.

### placeholder-label
- **Looks like:** `<input placeholder="Customer name">` with no `<label>`, or a floating label that lives in the placeholder.
- **Why it reads as a template:** The hint disappears when the user types or the browser autofills, and placeholder grey is faint; placeholders are never labels [NN/g, Carbon; WCAG 3.3.2].
- **Build instead:** A visible label above each field, `<label for="customer" class="text-sm font-medium">Customer</label>`; a placeholder holds an example value ("name@company.com").
- **Detect:** `rg -n '<(input|Input|textarea|Textarea)\b[^>]*placeholder=' src | rg -v ' id='` (fields no `<label for>` can point at); check the other placeholder fields for a matching `<label for>` or `htmlFor`. shadcn `<FormControl><Input placeholder=… /></FormControl>` is a false positive: `FormControl` passes the field the id that `FormLabel` points at, so skip hits inside a `FormItem` that has a `FormLabel`.

### save-disabled-before-submit
- **Looks like:** `<Button type="submit" disabled={!isValid}>`, `disabled={!isDirty}`, `save.disabled = !form.checkValidity()`.
- **Why it reads as a template:** A disabled button cannot say what is missing, so the user is stuck [Primer, Atlassian].
- **Build instead:** `disabled={isSubmitting}` only; on submit, validate every field, show each message, add the summary at 3 or more errors and move focus to the first invalid field (`references/forms.md`).
- **Detect:** `rg -n 'disabled=\{[^}]*(isValid|isDirty)|disabled ?= ?![^;]*(checkValidity|[Vv]alid)' src`.

### demo-state-switcher
- **Looks like:** a visible row of buttons or a select ("Data · Empty · Loading · Error") at the top of the page to preview states.
- **Why it reads as a template:** It ships a test control to users and takes space in the first viewport [SKILL.md States].
- **Build instead:** Read `new URLSearchParams(location.search).get('state')` and render `empty`, `error` or `loading`; with no parameter, a skeleton that resolves to data within about 500 ms (SKILL.md States, mock data).
- **Detect:** `rg -n -i '(demo|preview|mock)[-_ ]?state|state[-_ ]?(switch|toggle|picker|selector)|>(Empty|Loading|Error)</button>' src`.

### hidden-overridden
- **Looks like:** `<div id="bulk-bar" hidden class="flex items-center gap-3">`: the `flex` utility beats the `hidden` attribute, so closed dialogs, bulk bars and empty states show on load.
- **Why it reads as a template:** The page shows several states at once, such as an empty state over data or a bulk bar with nothing selected, and reads as unfinished [inferred].
- **Build instead:** `[hidden] { display: none !important; }` in the page's `<style>` (SKILL.md Foundations), or toggle the `hidden` class in place of the attribute.
- **Detect:** audit `hidden-overridden`; `rg -n '<[a-zA-Z][^>]*\shidden(\s|>|=)[^>]*[ "](flex|grid|block|inline-flex)[ "]|<[a-zA-Z][^>]*[ "](flex|grid|block|inline-flex)[ "][^>]*\shidden(\s|>|=)' src`.

## Reviewing an AI-built screen

1. **Audit.** Run `node <this skill's folder>/scripts/audit-cli.mjs <url or file.html> --type list` (or the screen's type), or in a browser at 1440×900 inject `scripts/audit.js` and run `enterpriseAdminAudit({ pageType: 'list' })`. Map every violation to its source line by searching for the reported element's classes or text.
2. **Recipe and states.** Walk the SKILL.md page recipe for the screen type and the manual checklist. Reach each state through `?state=empty`, `?state=error`, `?state=loading` and a filter that matches nothing; submit the form empty. Each miss is a finding.
3. **Tells.** Run every Detect command above over the screen's source, confirm each hit in context, and look at the first-viewport screenshot for tells no pattern catches (card-in-card, decorative-chart, sidebar-promo-card).
4. **Rank.** Put each finding in one of five levels, most severe first:
   - `data`: lost or wrong data (saving, destructive actions; `save-disabled-before-submit`);
   - `states`: missing states (`hidden-overridden`);
   - `a11y`: contrast, names, targets, field types and links (`text-contrast`, `icon-button-name`, `target-size`, `placeholder-label`, `input-type`, `contact-link`);
   - `layout`: density and alignment (`table-row-height`, `table-row-two-line`, `stacked-table-rows`, `numeric-align`, `tabular-nums`, `font-size-base`, `type-scale`, `table-above-fold`, `kpi-strip-above-table`, `single-primary-action`, `sticky-inert`, `label-beside-field`);
   - `tells`: template tells (every other entry and audit rule).
5. **Report.** Write one finding per line, grouped by level: `path:line — <rule> — <fix>`, where the rule is an audit rule, an entry heading here or a SKILL.md section. For example: `app/orders/page.tsx:12 — kpi-strip-above-table — move the four counts into the status tabs ("All 96 · Pending 3")`. End with the count per level: `data 1 · states 2 · a11y 3 · layout 4 · tells 2`. Change code when the user asks for fixes.
