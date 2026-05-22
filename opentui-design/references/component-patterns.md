# Component Patterns in OpenTUI + React

Patterns for structuring React components in OpenTUI terminal applications.

## Component Categories

### 1. Surface Components (Top-Level Views)

Surface components represent full workspace views. They receive layout dimensions and orchestrate sub-components.

```tsx
export interface RepoWorkspaceProps {
  readonly isWideLayout: boolean
  readonly wideBodyHeight: number
  readonly leftContentWidth: number
  readonly rightContentWidth: number
}

export const RepoWorkspace = ({
  isWideLayout,
  wideBodyHeight,
  leftContentWidth,
  rightContentWidth,
}: RepoWorkspaceProps) => {
  const repos = useAtomValue(repositoriesAtom)
  const [selectedIndex, setSelectedIndex] = useAtom(selectedRepoIndexAtom)

  return (
    <box flexDirection="column" flexGrow={1}>
      <scrollbox height={wideBodyHeight} focusable={false}>
        <RepoList
          repos={repos}
          selectedIndex={selectedIndex}
          contentWidth={leftContentWidth}
        />
      </scrollbox>
    </box>
  )
}
```

### 2. List Components

List components render scrollable, selectable item lists.

```tsx
export interface ItemListProps {
  readonly items: readonly Item[]
  readonly selectedIndex: number
  readonly contentWidth: number
  readonly onSelect?: (index: number) => void
}

export const ItemList = ({ items, selectedIndex, contentWidth, onSelect }: ItemListProps) => {
  return (
    <box flexDirection="column">
      {items.map((item, index) => (
        <SelectableRow
          key={item.id}
          isSelected={index === selectedIndex}
          onMouseDown={() => onSelect?.(index)}
        >
          <ItemRow item={item} width={contentWidth} />
        </SelectableRow>
      ))}
    </box>
  )
}
```

### 3. Primitive Components

Small, reusable building blocks for text rendering and layout.

```tsx
// Single-line text with truncation
export const PlainLine = ({ text, width, fg }: { text: string; width: number; fg?: string }) => (
  <text wrapMode="none" truncate fg={fg}>
    {fitCell(text, width)}
  </text>
)

// Horizontal divider
export const Divider = ({ width, char = "─" }: { width: number; char?: string }) => (
  <text fg="gray">{char.repeat(width)}</text>
)

// Vertical separator with junction characters
export const SeparatorColumn = ({ height, junctionRows }: { height: number; junctionRows?: number[] }) => (
  <box width={1} height={height} flexDirection="column">
    {Array.from({ length: height }, (_, i) => (
      <text key={i} fg="gray">{junctionRows?.includes(i) ? "┼" : "│"}</text>
    ))}
  </box>
)

// Footer hint bar
export const HintRow = ({ hints }: { hints: Array<{ key: string; label: string }> }) => (
  <box flexDirection="row" gap={2}>
    {hints.map((h) => (
      <text key={h.key}>
        <span fg="cyan" attributes={TextAttributes.BOLD}>{h.key}</span>
        <span fg="gray"> {h.label}</span>
      </text>
    ))}
  </box>
)
```

### 4. Modal Components

Modal components overlay the main UI and capture input focus.

```tsx
export interface ConfirmModalProps {
  readonly title: string
  readonly message: string
  readonly onConfirm: () => void
  readonly onCancel: () => void
}

export const ConfirmModal = ({ title, message, onConfirm, onCancel }: ConfirmModalProps) => {
  return (
    <box
      flexDirection="column"
      borderStyle="round"
      borderColor="cyan"
      paddingX={2}
      paddingY={1}
    >
      <text fg="white" attributes={TextAttributes.BOLD}>{title}</text>
      <text fg="gray">{message}</text>
      <box flexDirection="row" gap={2} marginTop={1}>
        <text fg="green">[Enter] Confirm</text>
        <text fg="red">[Esc] Cancel</text>
      </box>
    </box>
  )
}
```

## Composition Patterns

### Split Pane Layout

```tsx
export const SplitPane = ({
  height,
  leftWidth,
  rightWidth,
  left,
  right,
}: {
  height: number
  leftWidth: number
  rightWidth: number
  left: React.ReactNode
  right: React.ReactNode
}) => (
  <box flexGrow={1} flexDirection="row">
    <box width={leftWidth} height={height} flexDirection="column">
      {left}
    </box>
    <SeparatorColumn height={height} />
    <box width={rightWidth} height={height} flexDirection="column">
      {right}
    </box>
  </box>
)
```

### Conditional Rendering Based on Atom State

```tsx
const App = () => {
  const viewMode = useAtomValue(viewModeAtom)
  const activeModal = useAtomValue(activeModalAtom)

  return (
    <box flexDirection="column" width={width} height={height}>
      {viewMode === "list" && <ListView />}
      {viewMode === "detail" && <DetailView />}
      {viewMode === "diff" && <DiffView />}

      {/* Modal overlay */}
      {activeModal._tag !== "None" && <ModalLayer modal={activeModal} />}
    </box>
  )
}
```

### Workspace Tabs

```tsx
export const WorkspaceTabs = ({
  surfaces,
  activeSurface,
  onSelect,
}: {
  surfaces: readonly WorkspaceSurface[]
  activeSurface: WorkspaceSurface
  onSelect: (surface: WorkspaceSurface) => void
}) => (
  <box flexDirection="row" gap={1}>
    {surfaces.map((surface) => (
      <box
        key={surface}
        onMouseDown={() => onSelect(surface)}
        paddingX={1}
      >
        <text
          fg={surface === activeSurface ? "cyan" : "gray"}
          attributes={surface === activeSurface ? TextAttributes.BOLD : 0}
        >
          {surfaceLabel(surface)}
        </text>
      </box>
    ))}
  </box>
)
```

## Responsive Layout

### Terminal Dimensions and Breakpoints

```typescript
import { useTerminalDimensions } from "@opentui/react"

const useLayout = () => {
  const { width, height } = useTerminalDimensions()
  return {
    isWide: width >= 120,
    isNarrow: width < 80,
    bodyHeight: height - 2, // minus header + footer
    leftWidth: width >= 120 ? Math.floor(width * 0.4) : width,
    rightWidth: width >= 120 ? width - Math.floor(width * 0.4) - 1 : 0,
  }
}
```

### Text Truncation Utilities

```typescript
import stringWidth from "string-width"

export const fitCell = (text: string, width: number): string => {
  const actual = stringWidth(text)
  if (actual <= width) return text + " ".repeat(width - actual)
  return truncateToWidth(text, width - 1) + "…"
}

export const trimCell = (text: string, width: number): string => {
  if (stringWidth(text) <= width) return text
  return truncateToWidth(text, width - 1) + "…"
}

export const centerCell = (text: string, width: number): string => {
  const actual = stringWidth(text)
  if (actual >= width) return trimCell(text, width)
  const pad = Math.floor((width - actual) / 2)
  return " ".repeat(pad) + text + " ".repeat(width - actual - pad)
}
```

### Scrollable Content

```tsx
<scrollbox height={bodyHeight} focusable={false} flexGrow={0}>
  <box flexDirection="column" paddingLeft={1}>
    {items.map((item, i) => (
      <ItemRow key={item.id} item={item} isSelected={i === selectedIndex} />
    ))}
  </box>
</scrollbox>
```

**Important**: Always set explicit `height` on `<scrollbox>`.

### Centering Content

```tsx
<box width={width} height={height} justifyContent="center" alignItems="center">
  <text>{spinnerFrame} Loading...</text>
</box>
```

### Adaptive Footer

```tsx
const Footer = ({ width }: { width: number }) => {
  const hints = width >= 100
    ? [{ key: "j/k", label: "navigate" }, { key: "enter", label: "select" }, { key: "q", label: "quit" }]
    : [{ key: "j/k", label: "nav" }, { key: "↵", label: "sel" }, { key: "q", label: "quit" }]

  return (
    <box height={1} width={width} flexDirection="row" gap={2}>
      {hints.map((h) => (
        <text key={h.key}><span fg="cyan">{h.key}</span><span fg="gray"> {h.label}</span></text>
      ))}
    </box>
  )
}
```

## Best Practices

1. **Props interfaces with `readonly`** — Always use `readonly` for prop fields
2. **Explicit prop types** — Define interfaces for all component props
3. **Atoms for shared state** — Use atoms instead of prop drilling
4. **Lowercase JSX** — `<box>`, `<text>`, `<span>`, `<scrollbox>` (not capitalized)
5. **Functional components only** — No class components
6. **Always use `useTerminalDimensions`** — Never hardcode sizes
7. **Set explicit heights on scrollbox** — Required for proper scrolling
8. **Use `flexGrow`** — Let content fill available space
9. **Truncate text** — Use `fitCell`/`trimCell` with `string-width`
10. **Responsive breakpoints** — Adapt layout at 80/120 column thresholds
11. **Single-pane fallback** — Narrow terminals show one pane at a time
