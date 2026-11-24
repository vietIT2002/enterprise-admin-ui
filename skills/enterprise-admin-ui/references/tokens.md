# Design tokens

Read this when you apply `assets/tokens.css` in a project (shadcn, Tailwind v3 or v4, plain CSS), change the accent, switch density, or check colour contrast.

## Contents
- [What tokens.css defines](#what-tokenscss-defines)
- [Using it](#using-it)
- [Density modes](#density-modes)
- [Changing the accent](#changing-the-accent)
- [Contrast rules](#contrast-rules)
- [Mapping to existing design systems](#mapping-to-existing-design-systems)
- [Code: Tailwind v3/CDN config and v4 imports](#code-tailwind-v3cdn-config-and-v4-imports)
- [Single HTML file (Tailwind Play CDN)](#single-html-file-tailwind-play-cdn)

## What tokens.css defines

One file, three parts. The variable names follow shadcn/ui, so the file can replace the colour block of a shadcn `globals.css`.

| Group | Variables | Notes |
|---|---|---|
| Type and shape | `--font-sans`, `--radius` (6px) | The system UI stack; 14px body text comes from the components |
| Density | `--control-height` (32px), `--row-height` (40px), `--row-height-compact` (32px) | See [Density modes](#density-modes) |
| Surfaces and text | `--background`, `--foreground`, `--card`, `--popover` (+ `-foreground`), `--secondary`, `--muted`, `--muted-foreground`, `--accent` | White and slate-50 surfaces; no tinted page backgrounds |
| Actions | `--primary`, `--primary-foreground`, `--destructive`, `--ring` | One accent (blue `#1d4ed8`) for primary buttons, links, focus and selection |
| Lines | `--border` (`#e2e8f0`), `--input` (`#8592a6`) | Input borders are darker than card borders on purpose (see Contrast rules) |
| Status, solid | `--success`, `--warning`, `--info` (+ `-foreground`), `--destructive` | Backgrounds with white text: buttons, solid badges, progress fills |
| Status, subtle | `--neutral-subtle`, `--info-subtle`, `--success-subtle`, `--warning-subtle`, `--danger-subtle`, each with `-foreground` | Badges and inline messages: tinted background plus readable text |
| Charts | `--chart-1` to `--chart-5` | `--chart-1` focus colour, `--chart-5` grey for context |
| Sidebar | `--sidebar`, `--sidebar-foreground`, `--sidebar-primary`, `--sidebar-accent`, `--sidebar-border`, `--sidebar-ring` | Light neutral sidebar (slate-50) with a subtle active background |

The `:root` block is the light theme; the `.dark` block redefines the same names for the dark theme. An `@theme inline` block at the end maps the variables to Tailwind v4 colour utilities (`bg-card`, `text-muted-foreground`, `bg-success-subtle` …) and sets the radius scale.

Cards are border-only: `border border-border bg-card`, no `shadow-*`. Shadows belong to menus, popovers, dialogs and toasts.

## Using it

**shadcn/ui.** Open `globals.css`, delete the `:root` and `.dark` colour blocks the CLI generated, and paste the same blocks from `tokens.css`. Keep the `@theme inline` block from `tokens.css` as well; it replaces shadcn's.

**Tailwind v4.** Put the import after Tailwind's own:

```css
@import "tailwindcss";
@import "./tokens.css";
@custom-variant dark (&:is(.dark *));
```

`@custom-variant` makes `dark:` utilities follow the `.dark` class (the way shadcn does it); without it Tailwind v4 uses the OS setting and ignores the class.

**Tailwind v3 or Play CDN.** The `@theme` block is ignored. Load `tokens.css` as a normal stylesheet (in a single HTML file, inline it: see [Single HTML file](#single-html-file-tailwind-play-cdn)) and map the variables in `tailwind.config` (snippet below).

**Plain CSS.** Load `tokens.css` and use the variables: `background: var(--card); border: 1px solid var(--border); color: var(--muted-foreground);`. Toggle the theme by adding `class="dark"` to `<html>`.

Things to know:
- The font stack lives in `--font-sans`. Map it in the Tailwind v3 config or in v4's `@theme` with the literal stack, so `font-sans` resolves to the same fonts.
- The `@theme inline` radius lines are literal values capped at 8px (`--radius-sm: 4px` … `--radius-4xl: 8px`). They replace shadcn's radius scale, which is derived from `--radius`; changing `--radius` alone does not move `rounded-*` [inferred].
- Radius targets: 4px controls, 6px cards, 8px dialogs; fully rounded only for badges and chips. Carbon uses 0, Fluent 4px, Atlassian 6/8/12px, Primer and Ant 6px [digest §8].

## Density modes

- Default rows are 40px (`--row-height`); compact rows are 32px (`--row-height-compact`) with the same 14px text. Controls are 32px (`--control-height`), 40px for touch [Carbon, Ant; digest §8].
- Switch density with one class on the table or app root and read the variables:

```css
.density-compact { --row-height: var(--row-height-compact); }
```

```tsx
<TableRow style={{ height: 'var(--row-height)' }} />
```

- Remember the choice per user. Header row, toolbar, bulk bar and pagination follow the same variable so the table reads as one block [Carbon]. See `references/tables.md`.

## Changing the accent

1. Pick the new colour in `DESIGN.md` (`colors.primary`), checking white text on it reaches 4.5:1.
2. In `tokens.css` update `--primary`, `--ring` and `--sidebar-primary` together in `:root`, and their lighter dark-theme values in `.dark` (`--primary`, `--ring`, `--sidebar-primary`, plus `--accent` and `--accent-foreground` if the tint changes). `--info` and `--chart-1` follow the accent when the product uses blue for "info".
3. Re-check every changed pair with the formula under [Contrast rules](#contrast-rules): 4.5:1 for text, 3:1 for boundaries and focus. Keep DESIGN.md in step by hand.

A different accent changes buttons, links, focus and selection. The sidebar stays light and neutral; a coloured sidebar surface comes back as the navy-and-indigo template look.

## Contrast rules

Baseline without this skill: in 68% of generated pages muted text fell below 4.5:1 (slate-400 on white, slate-500 on tinted or dark surfaces).

- **Muted text.** Light theme `--muted-foreground` is `#475569` (slate-600): 7.6:1 on white and `--card`, 7.2:1 on `--muted`, 6.9:1 on `--secondary` [WCAG ratios computed with the formula below; inferred]. Slate-500 is acceptable only on white or slate-50; slate-400 and lighter never carry text. Dark theme `#a5b4c8` gives 8.5:1 on `--background` and 6.9:1 on `--muted` [inferred].
- **Solid status colours are backgrounds.** `--success`, `--warning`, `--info` and `--destructive` are tuned for a solid fill with white (foreground) text. As text or icons on the dark page background they reach only about 3.6:1, below 4.5:1. For status text or icons on page surfaces use the `-subtle-foreground` tokens on their `-subtle` backgrounds: `bg-success-subtle text-success-subtle-foreground` (6.8:1 in light, 12.3:1 in dark) [inferred].
- **Subtle badge pairs.** Always use a `-subtle` background with its own `-subtle-foreground`; do not mix pairs, and keep the text label in the badge [Carbon: status needs a text label].
- **Input borders.** `--input` is `#8592a6`, about 3.15:1 on white, which meets the 3:1 needed to see the edge of a field [WCAG 1.4.11]. `--border` (`#e2e8f0`) is for cards and dividers, not for inputs.
- **Focus ring.** `--ring` equals the accent; keep a 2px ring visible on every focusable element.
- **Re-check on tinted surfaces.** Muted text on `--accent`, on `-subtle` backgrounds, in dark mode and on hover rows needs its own 4.5:1 check.

How to check: use the WCAG formula. Relative luminance `L = 0.2126 R + 0.7152 G + 0.0722 B` with each channel `c/255` linearised (`c ≤ 0.03928 ? c/12.92 : ((c+0.055)/1.055)^2.4`); the ratio is `(L1 + 0.05) / (L2 + 0.05)` with the lighter colour first. The WebAIM contrast checker applies the same formula.

## Mapping to existing design systems

When the project already uses a design system, keep its tokens and map these roles onto them [mapping inferred; token names from each system's docs].

| Role here | Ant Design token | MUI palette key | Carbon token |
|---|---|---|---|
| `--primary` | `colorPrimary` | `primary.main` | `interactive` |
| `--foreground` | `colorText` | `text.primary` | `text-primary` |
| `--muted-foreground` | `colorTextSecondary` | `text.secondary` | `text-secondary` |
| `--background` | `colorBgLayout` | `background.default` | `background` |
| `--card` | `colorBgContainer` | `background.paper` | `layer-01` |
| `--border` | `colorBorderSecondary` | `divider` | `border-subtle-01` |
| `--input` | `colorBorder` | `grey[500]` on the outlined input | `border-strong-01` |
| `--success` / `--warning` | `colorSuccess` / `colorWarning` | `success.main` / `warning.main` | `support-success` / `support-warning` |
| `--destructive` | `colorError` | `error.main` | `support-error` |
| `--info` | `colorInfo` | `info.main` | `support-info` |
| `--ring` | `colorPrimary` (focus outline) | `primary.main` | `focus` |
| `--radius` | `borderRadius` (6) | `shape.borderRadius` (6) | none (0px) |
| `--control-height` | `controlHeight` (32) | `size="small"` | `size="md"` / `sm` |

Check the muted-text pairing in the existing theme with the contrast rules above before you reuse it.

## Code: Tailwind v3/CDN config and v4 imports

Tailwind v3 and the Play CDN (`tailwind.config`; load `tokens.css` as a stylesheet):

```js
tailwind.config = {
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        background: 'var(--background)', foreground: 'var(--foreground)',
        card: { DEFAULT: 'var(--card)', foreground: 'var(--card-foreground)' },
        popover: { DEFAULT: 'var(--popover)', foreground: 'var(--popover-foreground)' },
        primary: { DEFAULT: 'var(--primary)', foreground: 'var(--primary-foreground)' },
        secondary: { DEFAULT: 'var(--secondary)', foreground: 'var(--secondary-foreground)' },
        muted: { DEFAULT: 'var(--muted)', foreground: 'var(--muted-foreground)' },
        accent: { DEFAULT: 'var(--accent)', foreground: 'var(--accent-foreground)' },
        destructive: { DEFAULT: 'var(--destructive)', foreground: 'var(--destructive-foreground)' },
        success: { DEFAULT: 'var(--success)', foreground: 'var(--success-foreground)', subtle: 'var(--success-subtle)', 'subtle-foreground': 'var(--success-subtle-foreground)' },
        warning: { DEFAULT: 'var(--warning)', foreground: 'var(--warning-foreground)', subtle: 'var(--warning-subtle)', 'subtle-foreground': 'var(--warning-subtle-foreground)' },
        info: { DEFAULT: 'var(--info)', foreground: 'var(--info-foreground)', subtle: 'var(--info-subtle)', 'subtle-foreground': 'var(--info-subtle-foreground)' },
        danger: { subtle: 'var(--danger-subtle)', 'subtle-foreground': 'var(--danger-subtle-foreground)' },
        neutral: { subtle: 'var(--neutral-subtle)', 'subtle-foreground': 'var(--neutral-subtle-foreground)' },
        sidebar: { DEFAULT: 'var(--sidebar)', foreground: 'var(--sidebar-foreground)', primary: 'var(--sidebar-primary)', 'primary-foreground': 'var(--sidebar-primary-foreground)', accent: 'var(--sidebar-accent)', 'accent-foreground': 'var(--sidebar-accent-foreground)', border: 'var(--sidebar-border)', ring: 'var(--sidebar-ring)' },
        border: 'var(--border)', input: 'var(--input)', ring: 'var(--ring)',
        chart: { 1: 'var(--chart-1)', 2: 'var(--chart-2)', 3: 'var(--chart-3)', 4: 'var(--chart-4)', 5: 'var(--chart-5)' },
      },
      borderRadius: { sm: '4px', DEFAULT: '4px', md: '6px', lg: '6px', xl: '8px', '2xl': '8px' },
      fontFamily: { sans: ['system-ui', '"Segoe UI"', '-apple-system', '"SF Pro Text"', 'Roboto', '"Helvetica Neue"', 'Arial', 'sans-serif'] },
    },
  },
}
```

Opacity modifiers such as `bg-primary/90` do not work on `var()` hex colours in v3; use a plain class or a hover colour token instead. `rounded` is 4px (controls); use `rounded-md` for cards.

Tailwind v4 (`globals.css`):

```css
@import "tailwindcss";
@import "./tokens.css";
@custom-variant dark (&:is(.dark *));
```

### Single HTML file (Tailwind Play CDN)

A standalone file cannot load `tokens.css`, so inline everything in this order:

```html
<script src="https://cdn.tailwindcss.com"></script>
<script>tailwind.config = { /* the v3 config above */ }</script>
<style>
  :root { /* the :root block from tokens.css */ }
  [hidden] { display: none !important; } /* the hidden attribute beats flex/grid utilities */
</style>
```

Or skip the tokens and use the plain Tailwind palette classes named in SKILL.md Foundations (`text-slate-600`, `bg-blue-700`). Token class names (`bg-card`, `bg-sidebar`, `text-muted-foreground`) generate nothing without the config.
