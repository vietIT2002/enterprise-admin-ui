# Navigation and layout

Read this when you build the app shell (sidebar, header), a page header, breadcrumbs, a record page, settings navigation, a command palette, or the responsive behaviour of any of them.

## Contents
- [App shell](#app-shell)
- [Page header anatomy](#page-header-anatomy)
- [Breadcrumbs](#breadcrumbs)
- [Record pages](#record-pages)
- [Settings navigation](#settings-navigation)
- [Command palette and shortcuts](#command-palette-and-shortcuts)
- [Org or tenant switcher and user menu](#org-or-tenant-switcher-and-user-menu)
- [Responsive behaviour](#responsive-behaviour)
- [Code: AppShell](#code-appshell)
- [Code: PageHeader](#code-pageheader)

## App shell

Baseline without this skill: 8 of 16 reviews showed a dark navy sidebar with an indigo accent. Build the shell in neutral surfaces instead; the single accent colour stays for primary actions, links, focus and selection.

| Part | Value |
|---|---|
| Sidebar | `bg-sidebar` (light neutral), `border-r border-sidebar-border`, text `text-sidebar-foreground` |
| Width | 240px expanded, 56px collapsed (icons only, name in `aria-label` and the native `title`) `[inferred]`; Carbon uses 256px and a 48px rail [Carbon] |
| Header | 48px high, `border-b border-border`, white or `bg-background` [Carbon] |
| Items | 32px high, 14px text, 16px icon, 8px horizontal padding [Carbon item height] |
| Active item | `bg-sidebar-accent text-sidebar-accent-foreground font-medium` plus `aria-current="page"`; no accent-colour fill, no left bar in the accent |
| Group labels | 12px medium, sentence case, `text-muted-foreground`; not ALL CAPS |
| Content area | `bg-background`, page padding 24px, content max width 1440px for forms and text pages `[inferred]`; tables use the full width |

- **Structure:** module groups (Sales, Inventory, Finance, People), each a short label with its items beneath. Pin the user's 3–5 daily items at the top `[inferred]`.
- **Depth:** at most 2 levels. A third level becomes tabs on the page, or a left panel when a module has more than 5 secondary items [Carbon]. Expandable parents show a chevron and expand in place.
- **Order:** by frequency of use, then by workflow. Group names are nouns; item names are the plural objects ("Orders", "Customers"). Do not nest an item under a group of the same name.
- **Side navigation** suits multi-level, operation-heavy apps; top navigation fits only 2–7 short first-level items [Ant, Carbon]. ERP/CRM/HRM apps use the sidebar.
- **Header content:** left: collapse button and, on small screens, the logo; right: global search or the palette trigger, help, notifications, user menu [Carbon header utilities]. The header carries no page title; the page header does.
- **Do / don't.**
  - Do: `bg-sidebar` with `bg-sidebar-accent` active rows; the primary button is the only large block of accent colour on the page.
  - Don't: a navy or black sidebar with indigo active pills, or a gradient logo block. Selection and primary actions are the accent's job.
- **Dark mode** is a token switch (`.dark` sets the sidebar tokens); build the layout with tokens only and it follows.
- No promo cards, upgrade banners or illustrations in the sidebar; the footer holds help and collapse.

## Page header anatomy

Order, top to bottom [Polaris, Atlassian, Primer]:

1. **Breadcrumb** when the page has a parent.
2. **Title row:** page title on the left (20–24px, weight 600), actions on the right.
3. **Meta line** (optional): status badge, ID, audit stamp ("Last changed by … on …").
4. **Tabs or filter bar** directly under, with a bottom border.

- The title is never truncated. A list page uses the plural object type ("Orders"); a record page uses the record's name.
- **Actions:** one primary button (verb + noun: "Create order") and an overflow menu (⋯) for the rest. A list page may also show Import and Export as secondary outline buttons [Polaris]; a record page shows the primary action and the overflow menu only. At most 3 visible buttons in total `[inferred]`.
- Place the primary action at the far right of the title row, with secondary actions to its left. On a full-page form, finalizing actions live in a sticky bottom bar (`sticky bottom-0 border-t bg-card`, no shadow), Cancel then Save at the right, with one emphasized button [Fiori].
- One header per page; never inside a dialog [Polaris, Primer].
- The header is not sticky by default. A record page with long tabs may stick the title row (48px) and the tab list only.
- No greeting ("Welcome back, Hoa") and no hero. The first thing below the header is the work.

## Breadcrumbs

Baseline without this skill: the record name was missing from breadcrumbs.

- Show them whenever a page has a parent. Each crumb is the title of the page it links to [Polaris, Ant].
- **The trail ends with the record's name:** "Customers / Công ty Minh Phát", "Sales / Orders / DH-1043". The last crumb is the current page: plain text with `aria-current="page"`, not a link.
- Aim for about 3 levels; at most 5 [Polaris, Ant]. When a trail is longer, collapse the middle crumbs into "…" with a menu, keeping the first and the last two.
- Crumb text uses a human-readable identifier (name or number), never a UUID. If the record has no name, use its type and number ("Invoice INV-1043").
- Separator is `/` or a chevron icon (`aria-hidden`); the container is `<nav aria-label="Breadcrumb">` with an ordered list.
- Crumb targets are at least 24px high. Long names truncate with `max-w-[24ch] truncate` and the full text in `title`; the page title below keeps the whole name.
- A top-level list page ("Orders") has no breadcrumb, or only the module ("Sales / Orders"); do not repeat the title as a one-item trail.
- The trail shows hierarchy, not history. The browser's Back button handles history.

## Record pages

Baseline without this skill: secondary actions outside an overflow menu, initials avatars for companies, and empty sections without a next step.

1. **Record header** (below the breadcrumb): composition as in SKILL.md; up to 4 key fields as label/value pairs in one row [SLDS]. The overflow menu (⋯) is named after the record: "More actions for Công ty Minh Phát".
2. **Image rule:** see SKILL.md (avatars for people only).
3. **Sections.** For 2–4 sections of related content, use tabs (Overview, Contacts, Orders, Activity). For a short record with one main form, use titled sections on one page with an in-page anchor list at the left on wide screens [Fiori anchor bar]. A stack of identical bordered cards is not a layout.
4. **Tab behaviour:** each tab has its own URL (`?tab=orders`) `[inferred]`, count badges only for lists ("Orders 14"), and the active tab is restored on reload. Switching tabs does not discard unsaved edits without confirming.
5. **Related lists** follow `tables.md`: single-line rows, a toolbar with search and the add action, own empty state ("No contacts yet · Add contact") and own error state.
6. **Previous and next record** links sit at the right end of the breadcrumb row or title row: icon buttons `ChevronLeft`/`ChevronRight` labelled "Previous order" and "Next order", disabled with visible position text at the ends ("3 of 96") [Polaris]. The order follows the list's current filter and sort, which are carried in the URL.
7. **Edit model:** view mode by default, `Edit` as the primary action opens the form page or an edit state; do not mix view and inline edit fields on one record `[inferred]`.
8. **Activity** shows who did what with absolute timestamps; see `permissions-audit.md`.
9. A record the role cannot open shows the no-permission state; a deleted record shows "This order no longer exists" with a link back to the list.

## Settings navigation

Baseline without this skill: grouped left navigation was missing on settings pages.

- **Layout:** two columns under the app header: left navigation 240px, content at most 720px wide `[inferred]`. The left navigation groups the sections under short labels: General · Localization · Notifications · Users & roles · Billing · Integrations · Danger zone.
- **Each section is one page with one form** and its own Save button (see `forms.md`). Sections are separate URLs (`/settings/localization`), so links and Back work. A section may instead hold a set of toggles that apply instantly, each showing "Saved" beside it in a persistent `role="status"` region; one save model per section, never both [Primer].
- **Item states:** active row `bg-sidebar-accent text-sidebar-accent-foreground font-medium` with `aria-current="page"`; items 32px high.
- **Titles:** the section page has a title and one sentence of purpose in `text-muted-foreground`. Within a section, fields are grouped under titled sub-sections of 3–7 fields.
- **Search:** with more than 15 settings items, add a search box above the left navigation that jumps to a section `[inferred]`.
- **Danger zone last,** as the final item of the navigation and the last block on its page, separated by a border and a heading "Danger zone". Destructive actions there name the object and impact, and require typing the name (see `feedback-states.md`).
- **Unsaved changes** in a section block navigation to another section until the user chooses Save, Discard or Stay.
- **Localization** shows a live preview of the date, number and currency formats as the user changes them ("04/11/2026 · 1.250.000 ₫").
- On narrow screens the left navigation becomes a "Settings" select or a list page that opens each section.

## Command palette and shortcuts

- **Palette:** `Ctrl+K` on Windows and Linux, `⌘K` on macOS, opens a dialog with one input. Results group as Pages, Records, Actions. Prefix `>` limits to commands and `#` to records [GitHub]. Arrow keys move, Enter runs, Esc closes; the input has a label, the list is a `listbox` with `aria-activedescendant`.
- **`/`** focuses the page's search or filter box when no field has focus; **`?`** opens a dialog listing all shortcuts, grouped by area [Primer].
- Show the shortcut in context: in the palette results, in menu items with `<kbd>` and `aria-keyshortcuts` [Primer; NN/g teach in context].
- **A shortcut is never the only path to an action.** Each shortcut has a visible button or menu item [WCAG 2.1.4; digest]. Single-key shortcuts such as `/` and `?` only fire outside text fields and can be turned off in Settings → Keyboard.
- Avoid browser conflicts (`Ctrl+S`, `Ctrl+P`, `Ctrl+W`); on forms `Ctrl+Enter` may submit, and `Esc` closes the topmost dialog or panel.
- The header has a visible trigger for the palette (a search field-like button reading "Search or run a command" with the `Ctrl K` hint) so touch and mouse users find it.

## Org or tenant switcher and user menu

- **Tenant switcher** (the only place it is specified; other files point here): placement at the top of the sidebar, above the module groups, is `[inferred]` (the digest also suggests the global header). It is a full-width button (32–40px) with the organisation name, a chevron and, below, the role when helpful. It opens a menu with a search field when there are more than 7 organisations, the current one checked, and "Manage organizations" last `[inferred]`; Carbon reserves the far right of the header for the app switcher.
- Show the switcher only when the user can belong to several organisations. Organisation logos are allowed (they are organisations); without a logo, show the name only.
- Switching reloads the data and returns to the module's list page, because a record ID from the old tenant is invalid. Announce the change in `role="status"`.
- **User menu:** far right of the header. The trigger is a 32px avatar button with the accessible name "Account menu" (people get avatars). The menu shows name and email, then Profile, Preferences, Keyboard shortcuts, Help, and `Sign out` last, separated.
- **Notifications** and **help** are icon buttons left of the user menu, each at least 32px with a name, and a count badge that has a text alternative ("3 unread notifications").
- Impersonation and degraded-service banners sit above the header (see `permissions-audit.md`).

## Responsive behaviour

- **Desktop first.** Design at 1440px and test at 1280, 1366 and 1920 [Ant]. The sidebar is expanded at 1280px and above `[inferred]`.
- **Below 1024px** the sidebar collapses to the 56px rail; **below 768px** it becomes an overlay opened from a menu button in the header (`aria-expanded`, focus trapped while open, closes on selection and Esc); both breakpoints are `[inferred]`. Touch layouts raise controls to 40px and targets to 44px [Fluent, Primer].
- **Tables** scroll horizontally inside their own container (`overflow-x-auto`) with the header row and the first column sticky; the rest of the page does not scroll sideways. This is the exception that WCAG 1.4.10 permits for data tables.
- **Reflow at 320px:** every non-table content (page header, forms, cards, settings) reflows to one column without horizontal scrolling. Page header actions wrap under the title; the primary stays visible and secondary actions collapse into the overflow menu. DOM and tab order is secondary actions, overflow, then primary, matching the visual order left to right.
- **Forms** stay one column; two-column groups stack below 640px. Sticky action bars stay at the bottom and do not cover focused fields (WCAG 2.4.11): add `scroll-padding-bottom` equal to the bar height.
- **Text growth:** labels may be up to 50% longer in other languages; let buttons and nav items wrap or grow instead of truncating, and avoid fixed-width labels [Polaris, Fiori].
- **Zoom:** the layout works at 200% zoom with no loss; test at 1280 × 720 equivalent.

## Code: AppShell

A light neutral sidebar, 48px header and a content region. Collapse toggles between 240px and 56px.

```tsx
import { useState, type ComponentType, type ReactNode } from 'react'
import { PanelLeft } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'

export type NavGroup = {
  label: string
  items: { label: string; href: string; icon: ComponentType<{ className?: string }> }[]
}

export function AppShell({ groups, activeHref, children }: {
  groups: NavGroup[]
  activeHref: string
  children: ReactNode
}) {
  const [collapsed, setCollapsed] = useState(false)
  return (
    <div className="flex min-h-screen bg-background text-foreground">
      <aside className={cn('shrink-0 border-r border-sidebar-border bg-sidebar text-sidebar-foreground', collapsed ? 'w-14' : 'w-60')}>
        <nav aria-label="Main" className="flex flex-col gap-4 p-2">
          {groups.map((group) => (
            <div key={group.label} className="flex flex-col gap-0.5">
              {!collapsed && <p className="px-2 py-1 text-xs font-medium text-muted-foreground">{group.label}</p>}
              {group.items.map(({ label, href, icon: Icon }) => (
                <a
                  key={href}
                  href={href}
                  aria-label={collapsed ? label : undefined}
                  title={collapsed ? label : undefined}
                  aria-current={href === activeHref ? 'page' : undefined}
                  className={cn('flex h-8 items-center gap-2 rounded px-2 text-sm hover:bg-sidebar-accent', href === activeHref && 'bg-sidebar-accent font-medium text-sidebar-accent-foreground')}
                >
                  <Icon className="size-4 shrink-0" />
                  {!collapsed && <span className="truncate">{label}</span>}
                </a>
              ))}
            </div>
          ))}
        </nav>
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-12 items-center border-b border-border px-4">
          <Button variant="ghost" size="icon" aria-label="Collapse sidebar" aria-expanded={!collapsed} onClick={() => setCollapsed((c) => !c)}>
            <PanelLeft className="size-4" />
          </Button>
        </header>
        <main className="min-w-0 flex-1 p-6">{children}</main>
      </div>
    </div>
  )
}
```

## Code: PageHeader

Breadcrumb ending in the record name, title and one primary action. `variant="list"` adds secondary buttons (Import, Export); `variant="record"` shows only the primary action and the overflow menu.

```tsx
import { Fragment, type ReactNode } from 'react'
import { MoreHorizontal } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'

type Crumb = { label: string; href?: string }
type Action = { label: string; onSelect: () => void }

export function PageHeader({ variant = 'list', crumbs, title, meta, primary, secondary = [], overflow = [], recordName }: {
  variant?: 'list' | 'record' // record pages ignore `secondary`
  crumbs: Crumb[] // last crumb = current record name, no href
  title: string
  meta?: ReactNode // status badge, AuditStamp
  primary?: Action
  secondary?: Action[] // list pages only: Import, Export
  overflow?: Action[]
  recordName?: string // names the overflow menu: "More actions for <recordName>"
}) {
  return (
    <header className="mb-4 flex flex-col gap-2">
      <nav aria-label="Breadcrumb">
        <ol className="flex flex-wrap items-center gap-1 text-sm text-muted-foreground">
          {crumbs.map((c, i) => (
            <Fragment key={c.label}>
              {i > 0 && <li aria-hidden="true">/</li>}
              <li>
                {c.href ? (
                  <a href={c.href} className="inline-flex min-h-6 items-center hover:text-foreground hover:underline">{c.label}</a>
                ) : (
                  <span aria-current="page" className="text-foreground">{c.label}</span>
                )}
              </li>
            </Fragment>
          ))}
        </ol>
      </nav>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-xl font-semibold">{title}</h1>
        <div className="flex items-center gap-2">
          {variant === 'list' && secondary.map((a) => <Button key={a.label} variant="outline" onClick={a.onSelect}>{a.label}</Button>)}
          {overflow.length > 0 && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="icon" aria-label={`More actions${recordName ? ` for ${recordName}` : ''}`}>
                  <MoreHorizontal className="size-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {overflow.map((a) => <DropdownMenuItem key={a.label} onSelect={a.onSelect}>{a.label}</DropdownMenuItem>)}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
          {primary && <Button onClick={primary.onSelect}>{primary.label}</Button>}
        </div>
      </div>
      {meta && <div className="flex flex-wrap items-center gap-3 text-sm">{meta}</div>}
    </header>
  )
}
```
