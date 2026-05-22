# Input Handling in OpenTUI Applications

Patterns for handling keyboard input in OpenTUI + React applications with a data-driven keymap system.

## Overview

Input handling uses a three-layer architecture:
1. **OpenTUI layer** — `useKeyboard` captures raw terminal key events
2. **Adapter layer** — Normalizes OpenTUI events into a keymap-compatible format
3. **Keymap layer** — Data-driven, composable, scoped command dispatch

## Layer 1: Raw Keyboard Events

```typescript
import { useKeyboard } from "@opentui/react"

const MyComponent = () => {
  useKeyboard((event) => {
    // event.key: "a", "enter", "escape", "up", "down", "tab"
    // event.ctrl, event.meta, event.shift: boolean modifiers
    // event.preventDefault(): stop propagation
    if (event.ctrl && event.key === "c") {
      event.preventDefault()
      handleCopy()
    }
  })
}
```

## Layer 2: OpenTUI-to-Keymap Adapter

Bridge between OpenTUI's event system and the keymap dispatcher:

```typescript
import { useKeyboard } from "@opentui/react"
import { useRef, useMemo } from "react"
import type { KeySubscribe, ParsedStroke } from "@ghui/keymap"

export const useOpenTuiSubscribe = (): KeySubscribe => {
  const handlersRef = useRef<Set<(stroke: ParsedStroke) => boolean | void>>(new Set())

  useKeyboard((event) => {
    const stroke = normalizeOpenTuiKey(event)
    let handled = false
    for (const handler of handlersRef.current) {
      if (handler(stroke)) handled = true
    }
    if (handled) event.preventDefault()
  })

  return useMemo<KeySubscribe>(
    () => (handler) => {
      handlersRef.current.add(handler)
      return () => { handlersRef.current.delete(handler) }
    },
    [],
  )
}
```

## Layer 3: Data-Driven Keymap System

### Defining Commands

```typescript
import { context } from "@ghui/keymap"

// Create a typed keymap context
const App = context<AppContext>()

// Define commands with keys and conditions
const listNavKeymap = App(
  { id: "list.down", keys: ["j", "down"], run: (ctx) => ctx.moveDown() },
  { id: "list.up", keys: ["k", "up"], run: (ctx) => ctx.moveUp() },
  { id: "list.top", keys: ["g g"], run: (ctx) => ctx.moveToTop() },
  { id: "list.bottom", keys: ["G"], run: (ctx) => ctx.moveToBottom() },
  { id: "list.select", keys: ["enter"], run: (ctx) => ctx.selectItem() },
)
```

### Scoped Keymaps

Keymaps activate only when their scope predicate returns a truthy context:

```typescript
// Modal keymaps (exclusive — only one active at a time)
const closeModalKeymap = App(
  { id: "modal.confirm", keys: ["enter", "y"], run: (ctx) => ctx.confirmClose() },
  { id: "modal.cancel", keys: ["escape", "n"], run: (ctx) => ctx.cancelClose() },
)

const mergeModalKeymap = App(
  { id: "merge.confirm", keys: ["enter"], run: (ctx) => ctx.confirmMerge() },
  { id: "merge.cancel", keys: ["escape"], run: (ctx) => ctx.cancelMerge() },
  { id: "merge.cycle", keys: ["tab"], run: (ctx) => ctx.cycleMergeMethod() },
)
```

### Composing Keymaps with Scopes

```typescript
export const appKeymap = App(
  // Always-on global commands
  { id: "command.open", keys: ["ctrl+p", "meta+k"], run: (ctx) => ctx.openCommandPalette() },
  { id: "app.quit", keys: ["ctrl+c", "q"], run: (ctx) => ctx.quit() },
  { id: "app.refresh", keys: ["ctrl+r"], run: (ctx) => ctx.refresh() },

  // Modal layers (exclusive — checked first)
  closeModalKeymap.scope((ctx) => ctx.closeModalActive && ctx.closeModal),
  mergeModalKeymap.scope((ctx) => ctx.mergeModalActive && ctx.mergeModal),
  filterModalKeymap.scope((ctx) => ctx.filterModalActive && ctx.filterModal),

  // Full-view layers (only when no modal)
  diffViewKeymap.scope((ctx) => ctx.diffFullView && !modalActive(ctx) && ctx.diff),
  detailViewKeymap.scope((ctx) => ctx.detailFullView && !modalActive(ctx) && ctx.detail),

  // List navigation (only when no modal, no full view)
  listNavKeymap.scope((ctx) => inListMode(ctx) && ctx.listNav),
)
```

### Wiring Keymap to React

```typescript
import { useKeymap } from "@ghui/keymap/react"

const App = () => {
  const subscribe = useOpenTuiSubscribe()

  // Build context from current state
  const buildCtx = useCallback((): AppContext => ({
    closeModalActive: activeModal._tag === "Close",
    mergeModalActive: activeModal._tag === "Merge",
    diffFullView: isDiffFullView,
    detailFullView: isDetailFullView,
    // ... handlers
    moveDown: () => setSelectedIndex((i) => i + 1),
    moveUp: () => setSelectedIndex((i) => Math.max(0, i - 1)),
    openCommandPalette: () => setShowPalette(true),
  }), [activeModal, isDiffFullView, isDetailFullView, /* ... */])

  useKeymap(appKeymap, buildCtx, subscribe)
}
```

## Key Propagation Prevention

### Problem: Enter Key Fires on Next View

When navigating between views with Enter, the same keypress can propagate to the new view.

### Solution 1: preventDefault at Source

```typescript
{ id: "list.select", keys: ["enter"], run: (ctx) => {
  ctx.selectItem()
  // The keymap system handles preventDefault when run returns
}}
```

### Solution 2: Initial Frame Delay

```typescript
const DetailView = () => {
  const [ready, setReady] = useState(false)

  useEffect(() => {
    const id = requestAnimationFrame(() => setReady(true))
    return () => cancelAnimationFrame(id)
  }, [])

  // Don't process input until ready
  useKeyboard((event) => {
    if (!ready) return
    // ... handle keys
  })
}
```

### Solution 3: Focus State Control

```typescript
const [inputFocused, setInputFocused] = useState(false)

// Delay focus to avoid capturing the triggering keypress
useEffect(() => {
  const timer = setTimeout(() => setInputFocused(true), 50)
  return () => clearTimeout(timer)
}, [])
```

## Special Key Combinations

| Combo | Notation | Notes |
|-------|----------|-------|
| Ctrl+C | `ctrl+c` | Often used for quit |
| Ctrl+P | `ctrl+p` | Command palette |
| Meta+K | `meta+k` | Alternative command palette |
| Escape | `escape` | Close/cancel |
| Tab | `tab` | Cycle options |
| Shift+Tab | `shift+tab` | Reverse cycle |
| Multi-key | `g g` | Vim-style sequences |
| Count prefix | `5 j` | Vim-style repeat |

## Best Practices

1. **Use the keymap system** — Don't scatter `useKeyboard` handlers; centralize in keymaps
2. **Scope keymaps properly** — Modals should block all other keymaps
3. **Order matters** — Earlier scopes take priority; put modals first
4. **Keep handlers pure** — Keymap `run` functions should call context methods, not contain logic
5. **Always preventDefault** — When a key is handled, prevent it from reaching other handlers
6. **Test keymaps in isolation** — The pure dispatch logic is testable without React
