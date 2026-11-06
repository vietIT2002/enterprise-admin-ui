# Trees and split views

Read this when you build a hierarchy: a chart of accounts, an org chart, product categories, a bill of materials, folders, cost centres or locations. It also covers a tree or list beside a detail panel (master–detail).

## Contents
- [Semantics](#semantics)
- [Keyboard](#keyboard)
- [Rows](#rows)
- [Search, expand and persistence](#search-expand-and-persistence)
- [Split view](#split-view)
- [Changing the hierarchy](#changing-the-hierarchy)
- [Code: keyboard handler and persisted state](#code-keyboard-handler-and-persisted-state)
- [Checklist](#checklist)

## Semantics

Baseline without this skill (and with only the general rules):
- there was no Home/End;
- the selection was lost on reload because it was not in the URL;
- the expanded state was not kept;
- truncated names had no way to show the full text.

- **One column** (a name per row): `role="tree"` on the list, `role="treeitem"` on each row, and `role="group"` around children [WAI-ARIA APG Tree View].
  - Each item carries `aria-level`, `aria-setsize`, `aria-posinset`, `aria-expanded` (parents only) and `aria-selected`.
- **Several columns** (code, name, type, balance): use a `role="treegrid"` table. The first cell carries the expand control and `aria-level`, and the other cells are ordinary grid cells [WAI-ARIA APG Treegrid].
- **The expand control is part of the row.** The chevron is `aria-hidden`, and the row itself is the focus target. Clicking the chevron toggles the row; clicking the row selects it.

## Keyboard

Follow the APG tree pattern:

| Key | Action |
|---|---|
| ↓ / ↑ | Next / previous visible row |
| → | Expand a closed parent; on an open parent, move to its first child |
| ← | Collapse an open parent; on a child, move to its parent |
| Home / End | First / last visible row |
| Enter or Space | Select the row (open its details) |
| `*` | Expand all siblings of the focused row |
| Type a character | Move to the next row whose name starts with it |

- Only one row is tabbable (roving `tabindex`), and Tab leaves the tree for the detail panel.
- Focus stays visible when the tree scrolls.

## Rows

- **Single-line rows** of 32–40px. Indent 16–20px per level, with the chevron in a fixed 24px slot so names line up.
- **Codes and names in their own spans:** "111 · Cash on hand". Long names truncate with `truncate` and the full name in `title`, and the detail panel shows it in full.
- **Numbers right-aligned in `tabular-nums`,** with the currency in the column header.
  - A parent's balance is the sum of its children; compute it, never type it.
  - If a parent can also hold its own amount, show "Own" and "Total" columns.
- **Status in text:** an inactive account shows "Inactive" as a badge and muted text; a header or summary account shows "Header" when it cannot take entries.

## Search, expand and persistence

- **Search filters the tree to the matches and their ancestors,** expanded, with the matched text highlighted (`<mark>`). Clearing the search restores the previous expanded state.
  - With no matches: "No account matches “1388” · Clear search".
- **Expand all · Collapse all** buttons sit in the toolbar. On a large tree (more than about 500 rows), expand all is limited to the first two levels and says so.
- **Persist the expanded set** per user and tree in `localStorage` (or the user's settings), so a reload keeps the tree as it was. Keep the selection in the URL (`?account=1111`) and expand its ancestors on load.
- **Large trees** load children on demand: show a spinner row ("Loading…") under a parent while its children load, and an inline error with Retry if they fail.

## Split view

- **Layout:**
  - the tree on the left, 320–400px, resizable with a visible handle (`role="separator"` with `aria-valuenow`);
  - the detail panel fills the rest;
  - each side scrolls on its own inside a bounded height (`h-[calc(100dvh-var(--header-h))]`).
- **Selecting a row:**
  - updates the URL and the detail panel;
  - the tree keeps its scroll position and expanded state, and the focus stays in the tree;
  - Back goes to the previous selection.
- **The detail panel shows:**
  - the path as a breadcrumb ("Assets / Current assets / Cash / 1111 Cash in VND");
  - the code, the name, the status and the key figures (balance, period movement);
  - the actions (Edit, Add child account, Deactivate in the overflow menu);
  - related records (recent entries) as a short table with "View all".
- **No selection:** the panel says "Select an account to see its details", with the primary action ("Add account") available.
- **Below 1024px** the panel replaces the tree, with a back link to the tree that keeps its state.

## Changing the hierarchy

- **Add:** "Add child account" on a row creates under it, and the form shows the parent path read-only.
- **Move:**
  - "Move to…" opens a picker of valid parents, and drag-and-drop is optional (never drag-only);
  - moves that would create a cycle or break account rules are blocked with the reason.
- **Deactivate or delete:**
  - Blocked while the account has a balance, posted entries or active children, and the dialog says which: "Cannot deactivate 1111: balance 25.400.000 ₫ and 3 entries this period. Transfer the balance first."
  - Otherwise, confirm with the account's code and name (`permissions-audit.md`).

## Code: keyboard handler and persisted state

```ts
// Rows are the visible rows in order: { id, parentId, level, expanded?, hasChildren, name }.
export function onTreeKey(e: KeyboardEvent, rows: Row[], focusId: string, api: TreeApi) {
  const i = rows.findIndex((r) => r.id === focusId)
  const r = rows[i]
  const go = (id?: string) => { if (id) { e.preventDefault(); api.focus(id) } }
  switch (e.key) {
    case 'ArrowDown': return go(rows[i + 1]?.id)
    case 'ArrowUp': return go(rows[i - 1]?.id)
    case 'Home': return go(rows[0]?.id)
    case 'End': return go(rows[rows.length - 1]?.id)
    case 'ArrowRight': e.preventDefault(); return r.hasChildren && !r.expanded ? api.expand(r.id) : go(rows[i + 1]?.parentId === r.id ? rows[i + 1].id : undefined)
    case 'ArrowLeft': e.preventDefault(); return r.expanded ? api.collapse(r.id) : go(r.parentId)
    case 'Enter': case ' ': e.preventDefault(); return api.select(r.id)
    case '*': e.preventDefault(); return api.expandSiblings(r.id)
    default:
      if (e.key.length === 1 && /\S/.test(e.key)) {
        const next = [...rows.slice(i + 1), ...rows.slice(0, i)].find((x) => x.name.toLowerCase().startsWith(e.key.toLowerCase()))
        return go(next?.id)
      }
  }
}

const KEY = 'coa-expanded'
export const loadExpanded = () => { try { return new Set<string>(JSON.parse(localStorage.getItem(KEY) || '[]')) } catch { return new Set<string>() } }
export const saveExpanded = (s: Set<string>) => { try { localStorage.setItem(KEY, JSON.stringify([...s])) } catch {} }
```

## Checklist

- [ ] Tree or treegrid roles with level, set size, position, expanded and selected states
- [ ] Arrows, Home/End, `*` and type-ahead work; one row is tabbable
- [ ] Single-line rows; long names truncate with the full name in `title`
- [ ] Balances right-aligned; a parent equals the sum of its children
- [ ] Search shows matches with their ancestors; no-match state with Clear search
- [ ] Expanded state persists; the selection is in the URL; Expand all · Collapse all
- [ ] The split view keeps the tree's scroll and state; the detail shows the path
- [ ] Deactivate or delete is blocked with the reason while balances, entries or children exist
