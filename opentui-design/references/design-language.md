# TUI Design Language

Design principles and visual vocabulary for professional terminal UI applications.

## Design Philosophy

1. **Warm minimalism** — Avoid cold blue-gray. Use amber/gold accents on deep slate for a distinctive, comfortable reading experience.
2. **Every cell earns its place** — No decorative whitespace. Density is managed through color hierarchy, not padding.
3. **Semantic color** — Colors always mean something. Never decorative.
4. **Graceful degradation** — Loading shows spinners with context, empty states show centered messages, errors use error color. Degrade layout when space is tight.
5. **Box-drawing precision** — Junction characters (`├┤┬┴`) placed exactly where internal dividers meet outer borders.
6. **Computed derived colors** — Use `mixHex()` for hover states, blended accents. Never hardcode every shade.
7. **Typography through color and weight** — No font sizes in TUI. Hierarchy via: bold+accent (titles) > bold+text (emphasis) > text (body) > muted (secondary) > separator (disabled/chrome).

## Color Architecture

### Semantic Token System

Define colors by **purpose**, not by hue:

```typescript
interface ColorPalette {
  background: string       // app canvas
  modalBackground: string  // elevated surface (overlays)
  text: string             // primary content
  muted: string            // secondary/deemphasized
  separator: string        // borders, dividers
  accent: string           // primary interactive/highlight
  link: string             // clickable URLs
  inlineCode: string       // code spans in prose
  error: string            // destructive/failure
  selectedBg: string       // focused row background
  selectedText: string     // focused row foreground
  count: string            // numeric badges, IDs

  status: {
    draft: string          // amber/yellow
    approved: string       // soft green
    changes: string        // red/coral
    review: string         // blue
    passing: string        // green (CI)
    pending: string        // amber (CI)
    failing: string        // red (CI)
  }
}
```

### Derived Colors via Mixing

```typescript
// Hover: 38% blend toward selection
const rowHoverBg = mixHex(colors.modalBackground, colors.selectedBg, 0.38)

// Subtle accent blend for secondary elements
const tabCountColor = mixHex(colors.separator, colors.accent, 0.45)

// Diff backgrounds: 22% tint over terminal background
const diffAddBg = mixHex(colors.background, green, 0.22)
const diffDelBg = mixHex(colors.background, red, 0.22)
```

### Three-Tier Selection States

| State | Background | Text |
|-------|-----------|------|
| Default | transparent | `colors.text` |
| Hovered | `mixHex(modal, selected, 0.38)` | `colors.text` |
| Selected | `colors.selectedBg` | `colors.selectedText` |

## Typography & Text Hierarchy

### Hierarchy Levels (no font sizes — only color + weight)

| Level | Color | Bold | Use |
|-------|-------|------|-----|
| Title | `accent` | ✓ | Modal titles, section headers |
| Emphasis | `text` | ✓ | Selected item labels, active tab |
| Body | `text` | — | Primary content |
| Secondary | `muted` | — | Dates, authors, descriptions |
| Chrome | `separator` | — | Disabled items, borders |
| Interactive | `link` | — | URLs, clickable references |
| Numeric | `count` | — | PR numbers, badge counts |

### Text Rendering Rules

- Always `wrapMode="none" truncate` on single-line text
- Use `fitCell(text, width)` to pad/truncate to exact column width
- Ellipsis `…` for overflow (never cut mid-character)
- Use `string-width` for measurement (CJK, emoji aware)
- Inline formatting: backtick → `inlineCode`, `**bold**` → bold, `[text](url)` → link+underline

## Layout & Spacing

### Spacing Rules

- **Row height**: 1 character = 1 row. This is the atomic unit.
- **Content inset**: 1 character from pane edges (left and right)
- **Section gap**: 1 empty row between logical sections
- **No fractional spacing**: Everything is integer character cells
- **No decorative padding**: If a space doesn't aid readability, remove it

### Standard App Layout

```
┌─────────────────────────────────────────────┐
│ Tab1 │ Tab2 │ Tab3              (1 row)      │
├─────────────────────────────────────────────┤
│ List Pane    │ Detail Pane      (body rows)  │
│              │                               │
│              │                               │
├─────────────────────────────────────────────┤
│ j/k nav  enter select  q quit   (1 row)     │
└─────────────────────────────────────────────┘
```

- Header: 1 row (tabs)
- Body: `height - 2` (fills remaining)
- Footer: 1 row (hints)
- Separator: 1-char `│` column between panes

### Responsive Breakpoints

| Width | Layout |
|-------|--------|
| ≥120 | Split pane (40% list / 60% detail) |
| 80–119 | Split pane (narrower detail) |
| <80 | Single pane (list only, detail on enter) |

## Box-Drawing & Borders

### Character Vocabulary

```
Corners:  ┌ ┐ └ ┘
Sides:    │ (vertical)  ─ (horizontal)
Junctions: ├ ┤ ┬ ┴ ┼
Round:    ╭ ╮ ╰ ╯ (optional, for softer modals)
```

### Junction Precision

When an internal divider meets an outer border, use the correct junction:
```
┌──────┬──────┐    ← ┬ where column separator meets top border
│ Left │Right │
├──────┼──────┤    ← ├ ┤ ┼ where horizontal divider meets sides/columns
│      │      │
└──────┴──────┘    ← ┴ where column separator meets bottom border
```

This is a **hard rule** — misaligned junctions look amateur.

## Interaction Feedback

### Selection Indicators

| Context | Selected | Unselected |
|---------|----------|------------|
| List row | `▸` (accent) | ` ` (space) |
| Filter item | `›` (accent) | ` ` (space) |
| Checkbox | `[x]` | `[ ]` |

### Status Icons

| State | Icon | Color |
|-------|------|-------|
| Passing/Approved | `✓` | `status.passing` |
| Failing/Rejected | `✗` | `status.failing` |
| In-progress | `●` | `status.pending` |
| Queued | `○` | `muted` |
| Unknown | `·` | `muted` |
| Draft | `◌` | `status.draft` |
| Review pending | `◐` | `status.review` |
| Merged | `✓` | `status.approved` |
| Closed | `×` | `error` |

### Spinner

Braille-dot animation at 12 FPS:
```
⠋ ⠙ ⠹ ⠸ ⠼ ⠴ ⠦ ⠧ ⠇ ⠏
```

Always pair with context text: `⠋ Loading pull requests...`

### Flash Notices

- Display duration: 2500ms
- Auto-dismiss with debounce (new notice cancels previous timer)
- Render in accent or muted depending on severity

## Information Density

### Metadata Line Pattern

```
#123 by author  2d ago         5 comments
╰─count  ╰─muted  ╰─muted    ╰─right-aligned, muted
```

- Left: identity (number, author) in `count` color
- Middle: temporal info in `muted`
- Right: counts/stats, right-aligned in `muted`
- Connectors ("by", "ago") in `muted`

### Label Chips

```
 bugfix  feature  docs
```
- Background: label's own color (from API or hashed from name)
- Foreground: computed via luminance (dark text on light bg, light on dark)
- 1-space gap between chips
- Wrap to next line when exceeding width

### Diff Stats

```
3 files  +42  -17
╰─muted  ╰─green  ╰─red
```
- Omit zero values (don't show `+0`)
- Space-separated, no decorative characters

## Modal Design

### Modal Frame

```
┌─ Title ──────────────────── count ─┐
│ subtitle/description               │
├────────────────────────────────────┤
│                                    │
│ body content                       │
│                                    │
├────────────────────────────────────┤
│ enter confirm  esc cancel          │
└────────────────────────────────────┘
```

- Title: accent + bold, left-aligned
- Count/status: right-aligned in muted
- Background: `colors.modalBackground` (elevated from app background)
- Border: `separator` color

### Search Modal (Command Palette / Filter)

```
┌─ Commands ─┬─ search query█ ── 12 ─┐
├────────────┴───────────────────────┤
│   APP                              │
│ ▸ Open command palette   ctrl+p    │
│   Refresh                ctrl+r    │
│   VIEW                             │
│   Switch to issues       3         │
├────────────────────────────────────┤
│ enter select  esc close            │
└────────────────────────────────────┘
```

- Search input with block cursor (`bg=muted` on cursor position)
- Section headers: uppercase, muted, indented
- Selected row: `▸` indicator + bold + `selectedBg`
- Shortcut column: right-aligned, fixed width (16 chars)
- Match highlighting: accent + bold on matched characters

## Loading & Empty States

### Loading

- Full-screen: centered logo (block characters) + spinner + hint text
- Inline: spinner + context message (`⠋ Loading details...`)
- Degrade gracefully: if space < logo height, show only spinner + hint

### Empty

- Centered message in `muted`: "No pull requests" / "No matching command"
- Never show a blank screen — always communicate state

### Error

- Message in `error` color
- Keep it brief: one line if possible
- Offer recovery hint in footer: `r retry  esc back`

## Footer Hints

```
j/k navigate  enter select  / filter  q quit
╰─cyan key    ╰─gray label
```

- Key: `accent` or `cyan` + bold
- Label: `muted`
- Separator: 2-space gap between hint groups
- Adaptive: show fewer hints on narrow terminals
- Context-sensitive: change hints based on active view/modal
