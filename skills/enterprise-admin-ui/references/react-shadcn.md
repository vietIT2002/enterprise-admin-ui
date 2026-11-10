# React and shadcn/ui

Read this when the project uses React with shadcn/ui. It wires shadcn Sidebar, TanStack Table v8, TanStack Query v5, nuqs, react-hook-form v7 with zod, and sonner to the skill's rules.

## Contents
- [Setup](#setup)
- [App shell with shadcn Sidebar](#app-shell-with-shadcn-sidebar)
- [DataTable with TanStack Table](#datatable-with-tanstack-table)
- [Table state in the URL](#table-state-in-the-url)
- [Loading, empty and error with TanStack Query](#loading-empty-and-error-with-tanstack-query)
- [Forms, leave guard and confirmations](#forms-leave-guard-and-confirmations)
- [Checklist](#checklist)

## Setup

```bash
npx shadcn@latest init
npx shadcn@latest add table button checkbox dropdown-menu dialog alert-dialog form input select badge sidebar skeleton sonner tooltip
npm i @tanstack/react-table @tanstack/react-query nuqs
```

- Lucide icons stay 16px (`size-4`). `form` brings react-hook-form, @hookform/resolvers and zod; newer shadcn docs steer forms to `Field` with react-hook-form's `Controller`, and the `Form`/`FormField` approach used below remains one option. In `globals.css`, replace the `:root` and `.dark` colour blocks with those of `assets/tokens.css` and use its `@theme inline` block (`tokens.md`).
- Edit the generated components once: `button.tsx` and `input.tsx` change `h-9` to `h-8` (controls are 32px [SKILL.md Foundations]); every `components/ui` file changes `ring-ring/50` to `ring-ring` (50% falls to 2.36:1) and `outline-none` to `outline-hidden`, which keeps a transparent outline for forced colours (`accessibility.md`). Icon buttons use `size="icon-sm"`, selects `<SelectTrigger size="sm">`. `table.tsx` gives its `overflow-x-auto` container `tabIndex={0} role="region" aria-label={props['aria-label']}`, so keyboard users can scroll it [WCAG 2.1.1]; `form.tsx` puts `<AlertCircle className="size-4" aria-hidden="true" />` before the `FormMessage` text (`flex items-center gap-1`) [WCAG 1.4.1]; `sidebar.tsx` says "Toggle sidebar" in the `SidebarTrigger` text and the `SidebarRail` `aria-label` and `title`.
- Wrap the app in `QueryClientProvider` and `NuqsAdapter` (`nuqs/adapters/next/app` or `nuqs/adapters/react-router/v7`), and mount one `<Toaster position="top-right" duration={5000} visibleToasts={1} closeButton />` (`feedback-states.md`). With React Router, use a data router (`createBrowserRouter`), which `useBlocker` requires.
- **Next.js App Router.** Read the installed `next` version and `next.config.*` first. On Next 16, Cache Components is on only with `cacheComponents: true`, which `create-next-app` sets from 16.4; Next 17 plans to turn it on everywhere. With it on, `next build` fails when a page awaits `params`, `searchParams`, `cookies()` or `headers()` with no `<Suspense>` above it; with it off, the page becomes dynamic and builds. Valid fixes: a client component that reads `useSearchParams()` / `useParams()` (`?state=`, filters, the record id) under `<Suspense>`; an async child that awaits the props under `<Suspense>`; a `loading.tsx` in the segment; `generateStaticParams` for `params` (docs, not in the build check). For a new page, keep `page.tsx` synchronous with `<Suspense fallback={<PageSkeleton />}>` around the reader. A client component that calls `useSearchParams()` with no `<Suspense>` in a prerendered route fails `next build` in both modes (flag on: "outside of `<Suspense>`"; flag off: "should be wrapped in a suspense boundary"). Keep a server page that already builds, and do not rewrite it. `tsc` and `eslint` pass either way, so run `next build` before calling the page done. Checked 2026-11 against next 16.4.6 (this skill repo's `tests/next-build` fixture): https://nextjs.org/docs/app/api-reference/config/next-config-js/cacheComponents, https://nextjs.org/docs/messages/blocking-route, https://nextjs.org/blog/next-16-4 (the `create-next-app` and Next 17 claims).
- Format every value through `@/lib/format` (`data-formatting.md`). Components take required `locale` and `timeZone` props, and pages pass `LOCALE` and `TIME_ZONE` from `@/lib/locale`, copied from DESIGN.md `## Locale`; when the locale is per user, pages pass the user's setting instead.

## App shell with shadcn Sidebar

- `SidebarProvider` keeps the open state (a cookie; Ctrl/⌘+B toggles). Its `style` sets the 240px / 56px widths of `navigation-layout.md` (shadcn ships 16rem / 3rem). `<Sidebar collapsible="icon">` collapses to icons and becomes a sheet below 768px; `tooltip={label}` shows only while collapsed, and the label `<span>` stays the accessible name.
- Landmarks (`accessibility.md`): "Skip to main content" is the first focusable element, the groups sit in `<nav aria-label="Main">`, and `SidebarInset` (a `<main>`) gets `id="main" tabIndex={-1}`. One `SidebarGroup` per module; `SidebarGroupLabel` ships `text-sidebar-foreground/70`, so set `text-muted-foreground`. `isActive` only sets `data-active`, so put `aria-current="page"` on the router `Link` yourself. The 28px `SidebarTrigger` gets `className="size-8"`.

```tsx
import type { ComponentType, CSSProperties, ReactNode } from 'react'
import { Link } from 'react-router'
import { Sidebar, SidebarContent, SidebarGroup, SidebarGroupContent, SidebarGroupLabel, SidebarInset, SidebarMenu,
  SidebarMenuButton, SidebarMenuItem, SidebarProvider, SidebarRail, SidebarTrigger } from '@/components/ui/sidebar'
export type NavGroup = { label: string; items: { label: string; href: string; icon: ComponentType }[] }
const widths = { '--sidebar-width': '15rem', '--sidebar-width-icon': '3.5rem' } as CSSProperties
const skip = 'sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-2 focus:z-50 focus:rounded-md focus:bg-background focus:px-3 focus:py-2 focus:text-sm'
export function AppShell({ groups, pathname, children }: { groups: NavGroup[]; pathname: string; children: ReactNode }) {
  const active = (href: string) => pathname === href || pathname.startsWith(`${href}/`)
  return (<SidebarProvider style={widths}><a href="#main" className={skip}>Skip to main content</a>
    <Sidebar collapsible="icon"><SidebarContent><nav aria-label="Main" className="flex flex-col gap-2">{groups.map((g) => (
      <SidebarGroup key={g.label}><SidebarGroupLabel className="text-muted-foreground">{g.label}</SidebarGroupLabel>
        <SidebarGroupContent><SidebarMenu>{g.items.map(({ label, href, icon: Icon }) => (
          <SidebarMenuItem key={href}><SidebarMenuButton asChild isActive={active(href)} tooltip={label}>
            <Link to={href} aria-current={active(href) ? 'page' : undefined}><Icon /><span>{label}</span></Link>
          </SidebarMenuButton></SidebarMenuItem>))}</SidebarMenu></SidebarGroupContent>
      </SidebarGroup>))}</nav></SidebarContent><SidebarRail /></Sidebar>
    <SidebarInset id="main" tabIndex={-1}><header className="flex h-12 items-center border-b border-border px-4"><SidebarTrigger className="size-8" /></header>
      <div className="min-w-0 flex-1 p-6">{children}</div></SidebarInset>
  </SidebarProvider>)
}
```

## DataTable with TanStack Table

- **Columns.** Column ids are the API's sort keys (`sort=-created_at`), so accessor keys follow the API fields. Number columns set `meta: { align: 'right' }`, read by header and cell; declare `ColumnMeta<TData extends RowData, TValue>` with exactly the library's type parameters, or TypeScript rejects the merge. Single-currency amounts use `formatAmount`, dates a `<time>` in `tabular-nums`, statuses `StatusBadge` with a per-entity tone map (`permissions-audit.md`), missing values `EmptyValue` (`data-formatting.md`). Checkboxes get a 24×24px hit area from an `after:` inset [WCAG 2.5.8].
- **Server work.** `manualSorting`, `manualPagination` and `manualFiltering` leave the work to the server; `rowCount` passes the total. `sortDescFirst: false` makes the first click ascending and `enableSortingRemoval` (default) returns the third to the default sort [Primer]; `created_at` sets `sortDescFirst: true` so its cycle starts newest first.
- **Selection and bulk bar** (`tables.md`, `bulk-import-export.md`). `getRowId` keys `RowSelectionState` by record ID. Any page, size, sort, filter or search change clears the selection; unticking a row ends "all matching" and keeps the rest; with `allMatching` the request sends the filter, not IDs. The bar replaces the toolbar with the parts of `BulkBar` in `accessibility.md`: the count in `tabular-nums`, "Select all N matching" (then "Clear selection"), the `actions` slot, and Cancel, which clears the selection and focuses the header checkbox through a ref; a `role="status"` outside the bar announces the count. Here `actions` is a function: after a bulk run it calls `selectIds(failedIds)`, keeping the failed rows of this page selected, and starting a background job calls `clear()`.
- **Menus.** The Columns menu has a `DropdownMenuCheckboxItem` per hideable column (`onSelect` prevented so it stays open) and reads "Columns (1 hidden)"; reordering needs `columnOrder` state and Move up / Move down items (`tables.md`). Each row has one ⋯ menu named "Actions for order DH-1043", disabled while rows are selected, destructive item last. Links are the router's `Link` (through `asChild` in shadcn parts), so the leave guard sees them.

```tsx
import type { Ref } from 'react'
import { Link } from 'react-router'
import type { ColumnDef, RowData } from '@tanstack/react-table'
import { MoreHorizontal } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { EmptyValue } from '@/components/empty-value'
import { StatusBadge, type StatusTone } from '@/components/status-badge'
import { formatAmount, formatDate, formatDateTime } from '@/lib/format'
declare module '@tanstack/react-table' { interface ColumnMeta<TData extends RowData, TValue> { align?: 'left' | 'right' } }
export type Order = { id: string; number: string; customer: string; status: string; created_at: string; total: number; updated_at: string | null }
const orderStatus: Record<string, StatusTone> = { Pending: 'info', Shipping: 'info', Delivered: 'success', Late: 'danger', Cancelled: 'neutral' } // DESIGN.md
const hit = 'relative after:absolute after:-inset-1', when = (iso: string, text: string) => <time dateTime={iso} className="tabular-nums">{text}</time>
export const orderColumns = (locale: string, timeZone: string, headerCheckbox: Ref<HTMLButtonElement>): ColumnDef<Order>[] => [
  { id: 'select', enableSorting: false, enableHiding: false,
    header: ({ table }) => <Checkbox ref={headerCheckbox} className={hit} aria-label="Select all rows on this page" onCheckedChange={(v) => table.toggleAllPageRowsSelected(!!v)}
      checked={table.getIsAllPageRowsSelected() || (table.getIsSomePageRowsSelected() && 'indeterminate')} />,
    cell: ({ row }) => <Checkbox className={hit} aria-label={`Select order ${row.original.number}`} checked={row.getIsSelected()} onCheckedChange={(v) => row.toggleSelected(!!v)} /> },
  { accessorKey: 'number', header: 'Order no.', enableHiding: false, cell: ({ row }) => <Link to={`/orders/${row.original.id}`} className="text-primary hover:underline">{row.original.number}</Link> },
  { accessorKey: 'customer', header: 'Customer' },
  { accessorKey: 'status', header: 'Status', enableSorting: false, cell: ({ getValue }) => { const s = getValue<string>(); return <StatusBadge tone={orderStatus[s]}>{s}</StatusBadge> } },
  { accessorKey: 'created_at', header: 'Created', sortDescFirst: true, cell: ({ getValue }) => when(getValue<string>(), formatDate(getValue<string>(), locale, timeZone)) },
  { accessorKey: 'total', header: 'Total (VND)', meta: { align: 'right' }, cell: ({ getValue }) => formatAmount(getValue<number>(), 'VND', locale) },
  { accessorKey: 'updated_at', header: 'Last changed', cell: ({ getValue }) => { const v = getValue<string | null>(); return v ? when(v, formatDateTime(v, locale, timeZone)) : <EmptyValue /> } },
  { id: 'actions', enableSorting: false, enableHiding: false, meta: { align: 'right' }, header: () => <span className="sr-only">Actions</span>,
    cell: ({ row, table }) => <DropdownMenu><DropdownMenuTrigger asChild><Button variant="ghost" size="icon-sm" aria-label={`Actions for order ${row.original.number}`}
      disabled={table.getSelectedRowModel().rows.length > 0}><MoreHorizontal /></Button></DropdownMenuTrigger>
      <DropdownMenuContent align="end"><DropdownMenuItem asChild><Link to={`/orders/${row.original.id}/edit`}>Edit</Link></DropdownMenuItem>
        <DropdownMenuSeparator /><DropdownMenuItem variant="destructive">Cancel order</DropdownMenuItem></DropdownMenuContent></DropdownMenu> },
]
```

```tsx
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { flexRender, functionalUpdate, getCoreRowModel, useReactTable, type RowSelectionState, type VisibilityState } from '@tanstack/react-table'
import { ArrowDown, ArrowUp } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { DropdownMenu, DropdownMenuCheckboxItem, DropdownMenuContent, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { cn } from '@/lib/utils'
import { formatNumber } from '@/lib/format'
import { orderColumns, type Order } from './columns'
import { fromSorting, toSorting, useOrderFilters, useOrderParams } from './order-params'
const align = (a?: string) => (a === 'right' ? 'text-right tabular-nums' : 'text-left'), ariaSort = { asc: 'ascending', desc: 'descending' } as const
export type BulkSelection = { ids: string[]; allMatching: boolean; selectIds: (ids: string[]) => void; clear: () => void }
type Props = { data: Order[]; rowCount: number; locale: string; timeZone: string; busy: boolean; stateBody?: (cols: number) => ReactNode
  actions?: (s: BulkSelection) => ReactNode; children?: ReactNode }
export function OrdersTable({ data, rowCount, locale, timeZone, busy, stateBody, actions, children }: Props) {
  const [params, setParams] = useOrderParams(), headerCheckbox = useRef<HTMLButtonElement>(null)
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({}), [allMatching, setAllMatching] = useState(false)
  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>({ updated_at: false })
  useEffect(() => { setRowSelection({}); setAllMatching(false) }, [JSON.stringify(params)]) // page, size, sort, filter or search changed
  const columns = useMemo(() => orderColumns(locale, timeZone, headerCheckbox), [locale, timeZone]), sorting = toSorting(params.sort)
  const table = useReactTable({ data, columns, rowCount, getRowId: (r) => r.id, getCoreRowModel: getCoreRowModel(),
    manualSorting: true, manualPagination: true, manualFiltering: true, sortDescFirst: false, enableMultiSort: false,
    state: { sorting, rowSelection, columnVisibility }, onColumnVisibilityChange: setColumnVisibility,
    onSortingChange: (u) => setParams({ sort: fromSorting(functionalUpdate(u, sorting)), page: null }),
    onRowSelectionChange: (u) => { setAllMatching(false); setRowSelection(u) } }) // unticking a row ends "all matching"
  const ids = table.getSelectedRowModel().rows.map((r) => r.id), n = allMatching ? rowCount : ids.length, fmt = (v: number) => formatNumber(v, locale)
  const text = n === 0 ? '' : allMatching ? `All ${fmt(n)} matching selected` : `${fmt(n)} selected`
  const clear = () => { table.resetRowSelection(); headerCheckbox.current?.focus() } // the bar unmounts
  const selectIds = (failed: string[]) => { setAllMatching(false); setRowSelection(Object.fromEntries(failed.filter((id) => data.some((r) => r.id === id)).map((id) => [id, true]))) }
  const hideable = table.getAllLeafColumns().filter((c) => c.getCanHide()), hidden = hideable.filter((c) => !c.getIsVisible()).length
  return (
    <div className="rounded-md border border-border bg-card"><p role="status" className="sr-only">{text}</p>
      {n > 0 ? <div className="flex h-10 items-center gap-3 border-b border-border bg-accent px-3 text-sm text-accent-foreground">
        <span className="tabular-nums">{text}</span>
        {(allMatching || (table.getIsAllPageRowsSelected() && rowCount > data.length)) && <Button variant="link" size="sm" // one element, so focus stays
          onClick={allMatching ? clear : () => setAllMatching(true)}>{allMatching ? 'Clear selection' : `Select all ${fmt(rowCount)} matching`}</Button>}
        {actions?.({ ids, allMatching, selectIds, clear })}<Button variant="ghost" size="sm" className="ml-auto" onClick={clear}>Cancel</Button></div>
      : <div className="flex h-10 items-center justify-end border-b border-border px-3"><DropdownMenu>
          <DropdownMenuTrigger asChild><Button variant="outline" size="sm">Columns{hidden > 0 && ` (${hidden} hidden)`}</Button></DropdownMenuTrigger>
          <DropdownMenuContent align="end">{hideable.map((c) => <DropdownMenuCheckboxItem key={c.id} checked={c.getIsVisible()}
            onCheckedChange={(v) => c.toggleVisibility(!!v)} onSelect={(e) => e.preventDefault()}>{String(c.columnDef.header)}</DropdownMenuCheckboxItem>)}</DropdownMenuContent>
        </DropdownMenu></div>}
      <Table aria-label="Orders" aria-busy={busy} className={cn(busy && 'opacity-60')}>
        <TableHeader>{table.getHeaderGroups().map((hg) => <TableRow key={hg.id}>{hg.headers.map((h) => {
          const a = h.column.columnDef.meta?.align, s = h.column.getIsSorted(), label = flexRender(h.column.columnDef.header, h.getContext())
          const Icon = s === 'asc' ? ArrowUp : ArrowDown; return <TableHead key={h.id} aria-sort={s ? ariaSort[s] : undefined} className={cn('h-10 px-3', align(a))}>{h.column.getCanSort()
            ? <button type="button" onClick={h.column.getToggleSortingHandler()} className={cn('inline-flex min-h-6 items-center gap-1', a === 'right' && 'flex-row-reverse text-right')}>
                {label}{s && <Icon className="size-4" aria-hidden="true" />}</button> : label}</TableHead> })}</TableRow>)}</TableHeader>
        {stateBody ? stateBody(table.getVisibleLeafColumns().length) : <TableBody>{table.getRowModel().rows.map((row) => (
          <TableRow key={row.id} data-state={row.getIsSelected() && 'selected'} className="h-10">{row.getVisibleCells().map((c) => (
            <TableCell key={c.id} className={cn('px-3 py-1', align(c.column.columnDef.meta?.align))}>{flexRender(c.column.columnDef.cell, c.getContext())}</TableCell>))}</TableRow>))}</TableBody>}
      </Table>{children}
    </div>)
}
export function OrdersPagination({ rowCount, locale }: { rowCount: number; locale: string }) {
  const { params: { page, size }, setPage, setSize } = useOrderFilters(), fmt = (v: number) => formatNumber(v, locale)
  return (<div className="flex h-10 items-center gap-2 border-t border-border px-3 text-sm">
    <span className="mr-auto tabular-nums">{fmt((page - 1) * size + 1)}–{fmt(Math.min(page * size, rowCount))} of {fmt(rowCount)}</span>
    <Select value={String(size)} onValueChange={(v) => setSize(Number(v))}><SelectTrigger size="sm" aria-label="Rows per page"><SelectValue /></SelectTrigger>
      <SelectContent>{[25, 50, 100].map((s) => <SelectItem key={s} value={String(s)}>{fmt(s)} per page</SelectItem>)}</SelectContent></Select>
    <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>Previous</Button>
    <Button variant="outline" size="sm" disabled={page * size >= rowCount} onClick={() => setPage(page + 1)}>Next</Button></div>)
}
```

## Table state in the URL

- Page, size, sort, filters and search live in the URL (`filters-search.md`) through nuqs `useQueryStates`; Next `useSearchParams` with `router.replace` works too (`useListParams` in `filters-search.md`). nuqs v2 drops values equal to their default, `null` removes a key, and `parseAsInteger` falls back to the default for a non-numeric page. Repeated keys (`?status=late&status=shipping`) need `parseAsNativeArrayOf` (nuqs 2.7+); `parseAsArrayOf` writes one comma-separated value.
- A filter, search or size change also sets `page: null`, which is page 1. Typing and filters replace the history entry; page changes push one so Back works. `OrdersPagination` above calls `setPage` and `setSize`.

```tsx
import { parseAsInteger, parseAsNativeArrayOf, parseAsString, useQueryStates } from 'nuqs'
import type { SortingState } from '@tanstack/react-table'
export const orderParams = { page: parseAsInteger.withDefault(1), size: parseAsInteger.withDefault(50), sort: parseAsString.withDefault('-created_at'),
  q: parseAsString.withDefault(''), status: parseAsNativeArrayOf(parseAsString) } // status defaults to []
export const useOrderParams = () => useQueryStates(orderParams, { history: 'replace' })
export const toSorting = (sort: string): SortingState => [{ id: sort.replace(/^-/, ''), desc: sort.startsWith('-') }]
export const fromSorting = (s: SortingState) => (s[0] ? `${s[0].desc ? '-' : ''}${s[0].id}` : null) // null: default sort
export function useOrderFilters() {
  const [params, setParams] = useOrderParams()
  return { params, filtered: params.q !== '' || params.status.length > 0,
    setSearch: (q: string) => setParams({ q: q || null, page: null }), // call 300ms after typing stops
    setStatus: (status: string[]) => setParams({ status, page: null }), setSize: (size: number) => setParams({ size, page: null }),
    setPage: (page: number) => setParams({ page }, { history: 'push' }),
    clearAll: () => setParams({ q: null, status: null, page: null }) } // keeps sort and size
}
```

## Loading, empty and error with TanStack Query

- `isPending` renders skeleton rows; `isError` without data renders what failed and Retry (`refetch`); a total of 0 is first use without filters and no results with them (`filters-search.md`). The header stays and the message spans the body (`tables.md`); `EmptyState` and `TableSkeleton` are the `feedback-states.md` components.
- In Query v5, `placeholderData: keepPreviousData` shows the previous rows only while the new page, sort or filter is pending, dimmed through `isPlaceholderData`; if that fetch fails, `data` is gone and the full error state shows. A failed background refetch keeps `data`: the rows stay dimmed under an error line with Retry. The summary line is the always-rendered `role="status"` in `tabular-nums`, so counts and errors are announced. Its plural follows the language of the copy, not the number locale: `Intl.PluralRules('vi-VN')` always answers `other`.

```tsx
import type { ReactNode } from 'react'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { Button } from '@/components/ui/button'
import { TableBody, TableCell, TableRow } from '@/components/ui/table'
import { EmptyState, TableSkeleton } from '@/components/data-states'
import { formatMoney, formatNumber } from '@/lib/format'
import { OrdersPagination, OrdersTable } from './orders-table'
import { useOrderFilters } from './order-params'
import { fetchOrders } from './api' // resolves { rows, total, sum, currency }
const copyPlural = new Intl.PluralRules('en') // the copy is English; with i18n, use its plural messages instead
const Message = ({ cols, children }: { cols: number; children: ReactNode }) => <TableBody><TableRow className="hover:bg-transparent"><TableCell colSpan={cols}>{children}</TableCell></TableRow></TableBody>
export function OrdersList({ locale, timeZone, onCreate }: { locale: string; timeZone: string; onCreate: () => void }) {
  const { params, filtered, clearAll } = useOrderFilters()
  const { data, isPending, isError, isPlaceholderData, refetch } = useQuery({ queryKey: ['orders', params], queryFn: () => fetchOrders(params), placeholderData: keepPreviousData })
  const retry = <Button variant="outline" size="sm" onClick={() => refetch()}>Retry</Button>
  const stateBody = isPending ? (cols: number) => <TableSkeleton columns={Array.from({ length: cols }, () => null)} />
    : isError && !data ? (cols: number) => <Message cols={cols}><div className="flex items-center gap-3 py-6 text-sm">Couldn't load orders. Check your connection and try again.{retry}</div></Message>
    : data?.total === 0 ? (cols: number) => <Message cols={cols}>{filtered ? <EmptyState variant="no-results" entity="orders" onClear={clearAll} />
        : <EmptyState variant="first-use" entity="orders" description="Orders from every channel appear here." actionLabel="Create order" onAction={onCreate} />}</Message>
    : undefined
  const count = (n: number) => `${formatNumber(n, locale)} ${copyPlural.select(n) === 'one' ? 'order' : 'orders'}`
  const summary = isError ? (data ? "Couldn't refresh orders. The rows below may be out of date." : "Couldn't load orders.")
    : !data || (data.total === 0 && !filtered) ? '' : data.total === 0 ? 'No orders match' : `${count(data.total)} · ${formatMoney(data.sum, data.currency, locale)}`
  return (<section className="space-y-2">
    <div className="flex min-h-8 items-center gap-3"><p role="status" className="text-sm tabular-nums text-muted-foreground">{summary}</p>{isError && data && retry}</div>
    <OrdersTable data={data?.rows ?? []} rowCount={data?.total ?? 0} locale={locale} timeZone={timeZone} busy={isPlaceholderData || (isError && !!data)} stateBody={stateBody}>
      {!!data?.total && <OrdersPagination rowCount={data.total} locale={locale} />}</OrdersTable>
  </section>)
}
```

## Forms, leave guard and confirmations

- `useForm({ resolver: zodResolver(schema), mode: 'onTouched' })` validates a field on blur, then on each keystroke until it is fixed; submit validates every field (`forms.md`). `FormControl` wires `id`, `aria-invalid` and `aria-describedby`. Only `isSubmitting` disables Save. "* Required" appears once, above the fields.
- Three or more errors show `ErrorSummary` (`forms.md`). Focus goes to the first invalid field, not to the summary [SKILL.md Saving]: `shouldFocusError` (on by default) does it for client errors, `setFocus` for server errors. Server errors map to fields with `setError(name, { type: 'server', message })`; an error with no field, or a request that fails outright, goes to `root.server` and one banner. The user's input stays.
- `isDirty` drives `beforeunload` (reload, tab close, typed URL), the router guard and "Unsaved changes"; `reset(values)` after a save clears it. React Router's `useBlocker(isDirty)` works only under a data router and sees only router navigation, so in-app links use its `Link`. Next.js App Router has no blocker: intercept your `Link` wrapper and `popstate` (`forms.md`) `[inferred]`. Cancel only navigates; a dirty form gets the dialog from the blocker. The footer is `sticky bottom-0 border-t bg-card`, no shadow, with "Unsaved changes" in an always-rendered `role="status"` beside Cancel then Save; `scroll-pb-20` on the scroll container keeps it off the focused field [WCAG 2.4.11].
- **Destructive confirmation**, the leave dialog included: `AlertDialogCancel` comes first and Radix focuses it on open, so Enter never deletes; `AlertDialogAction className={buttonVariants({ variant: 'destructive' })}` comes last with a verb + object label. Neither takes a `variant` prop. The title names the object and the impact ("Delete role Sales staff?" · "12 users will lose these permissions."), the buttons read `Keep role` and `Delete role` (`feedback-states.md`), and danger-zone actions also require typing the name. For a request, `onClick={(e) => { e.preventDefault(); void confirm() }}` keeps the dialog open with a spinner, closes it on success and shows a failure inside it in an always-rendered `role="alert"`.
- **Toasts** confirm full success and name the record: `toast.success('Invoice INV-1043 saved')`. A bulk run or job with failures gets the persistent banner instead (`bulk-import-export.md`). Reversible actions skip the dialog and offer Undo: `toast('Customer archived', { action: { label: 'Undo', onClick: undo }, duration: 10_000 })`. Errors stay inline.

```tsx
import { useEffect } from 'react'
import { useBlocker } from 'react-router' // throws outside a data router (createBrowserRouter)
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { toast } from 'sonner'
import { Loader2 } from 'lucide-react'
import { Button, buttonVariants } from '@/components/ui/button'
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog'
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import { ErrorSummary } from '@/components/error-summary' // forms.md
const schema = z.object({ customer: z.string().min(1, 'Enter the customer name'), email: z.string().email('Enter an email like name@company.com'),
  taxCode: z.string().regex(/^\d{10}(-\d{3})?$/, 'Enter 10 digits, or 13 for a branch') })
type Values = z.infer<typeof schema>
type SaveResult = { ok: boolean; fieldErrors?: Partial<Record<keyof Values, string>>; message?: string }
const fields = [['customer', 'Customer'], ['email', 'Billing email'], ['taxCode', 'Tax code']] as const
type Props = { invoice: string; defaults: Values; save: (v: Values) => Promise<SaveResult>; onCancel: () => void }
export function InvoiceForm({ invoice, defaults, save, onCancel }: Props) {
  const form = useForm<Values>({ resolver: zodResolver(schema), mode: 'onTouched', defaultValues: defaults })
  const { errors, isDirty, isSubmitting } = form.formState, leaveDialog = useLeaveGuard(isDirty)
  const onSubmit = form.handleSubmit(async (values) => {
    const res = await save(values).catch((): SaveResult => ({ ok: false, message: "Couldn't save the invoice. Check your connection and try again." }))
    if (res.ok) { form.reset(values); toast.success(`Invoice ${invoice} saved`); return }
    const failed = fields.map(([name]) => name).filter((name) => res.fieldErrors?.[name])
    failed.forEach((name) => form.setError(name, { type: 'server', message: res.fieldErrors?.[name] }))
    if (failed[0]) form.setFocus(failed[0]) // the first invalid field, in form order
    if (res.message) form.setError('root.server', { message: res.message })
  })
  return (<Form {...form}><form onSubmit={onSubmit} noValidate className="space-y-6">
    <div role="alert">{errors.root?.server && <p className="rounded-md bg-danger-subtle p-3 text-sm text-danger-subtle-foreground">{errors.root.server.message}</p>}</div>
    <ErrorSummary errors={errors} fields={fields} onJump={form.setFocus} />
    <p className="text-sm text-muted-foreground">* Required</p>
    {fields.map(([name, label]) => <FormField key={name} control={form.control} name={name} render={({ field }) => (
      <FormItem className="max-w-xl"><FormLabel>{label} <span aria-hidden="true">*</span></FormLabel>
        <FormControl><Input aria-required="true" {...field} /></FormControl><FormMessage /></FormItem>)} />)}
    <FormFooter isDirty={isDirty} isSubmitting={isSubmitting} onCancel={onCancel} />
  </form>{leaveDialog}</Form>)
}
export function useLeaveGuard(isDirty: boolean) { // shared by every form; give it its own file
  const blocker = useBlocker(isDirty)
  useEffect(() => { if (!isDirty) return
    const onUnload = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = '' }
    window.addEventListener('beforeunload', onUnload); return () => window.removeEventListener('beforeunload', onUnload) }, [isDirty])
  return (<AlertDialog open={blocker.state === 'blocked'} onOpenChange={(open) => { if (!open) blocker.reset?.() }}>
    <AlertDialogContent><AlertDialogHeader><AlertDialogTitle>You have unsaved changes. Leave without saving?</AlertDialogTitle>
      <AlertDialogDescription>Your edits on this page will be lost.</AlertDialogDescription></AlertDialogHeader>
      <AlertDialogFooter><AlertDialogCancel>Stay</AlertDialogCancel>
        <AlertDialogAction className={buttonVariants({ variant: 'destructive' })} onClick={() => blocker.proceed?.()}>Leave page</AlertDialogAction></AlertDialogFooter>
    </AlertDialogContent></AlertDialog>)
}
function FormFooter({ isDirty, isSubmitting, onCancel }: { isDirty: boolean; isSubmitting: boolean; onCancel: () => void }) {
  return (<div className="sticky bottom-0 flex items-center justify-end gap-3 border-t border-border bg-card px-6 py-3">
    <span role="status" className="text-sm text-muted-foreground">{isDirty && <><span aria-hidden="true" className="mr-1.5 inline-block size-1.5 rounded-full bg-warning" />Unsaved changes</>}</span>
    <Button type="button" variant="outline" onClick={onCancel}>Cancel</Button>
    <Button type="submit" disabled={isSubmitting}>{isSubmitting && <Loader2 className="animate-spin motion-reduce:animate-none" aria-hidden="true" />}Save</Button></div>)
}
```

## Checklist

- [ ] `tokens.css` replaces the shadcn colour block, controls are 32px with a full-strength focus ring, and the shell has a skip link, `<nav aria-label="Main">` and `aria-current="page"` on the active link [SKILL.md Foundations]
- [ ] Number columns set `meta.align: 'right'` (`text-right tabular-nums` on header and cell); every value goes through `@/lib/format` with the `locale` prop [SKILL.md Tables]
- [ ] Sorting, paging and filtering are manual; page, size, sort, filters and search live in the URL, and changing any of them clears the selection; the bulk bar offers "Select all N matching" and its Cancel returns focus to the three-state header checkbox [SKILL.md List, Tables]
- [ ] Every data region has skeleton, first-use, no-results and error-with-Retry states; a refetch dims the rows [SKILL.md States]
- [ ] Forms use `mode: 'onTouched'`, map server errors with `setError`, show the summary at 3+ errors and keep Save enabled until submit; `isDirty` drives "Unsaved changes", `beforeunload` and the router guard [SKILL.md Saving]
- [ ] Destructive dialogs put Cancel first and the destructive action last, naming the object and impact; success toasts name the record; live regions (result count, selection count, unsaved changes, errors) are always rendered and only their text changes [SKILL.md Saving; feedback-states.md Accessibility]
