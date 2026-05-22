# OpenTUI Gotchas

Common issues and workarounds when building OpenTUI + React + Effect Atom applications.

## 1. Mouse Trade-offs

**Core issue**: Terminal can either capture mouse (clicks + scroll) OR allow OS text selection. Not both.

| Config | Clicks | Scroll | OS Copy |
|--------|--------|--------|---------|
| `useMouse: true` (default) | ✓ | ✓ | ✗ |
| `useMouse: false` | ✗ | ✗ | ✓ |

```typescript
const renderer = await createCliRenderer({ useMouse: false })
```

**When mouse is enabled**, use event props on `<box>`:
```tsx
<box onMouseDown={() => onSelect(item)} onMouseOver={() => setHovered(true)}>
  <text fg={hovered ? "cyan" : "white"}>{item.title}</text>
</box>
```

**For copy without mouse**, use a clipboard action atom:
```typescript
export const copyAtom = appRuntime.fn<string>()(
  (text) => Clipboard.use((cb) => cb.write(text))
)
```

**`useSelectionHandler` is unreliable** — do not use it. Use keyboard-triggered clipboard instead.

**Recommendation**: Default to `useMouse: false` unless click interaction is essential. Always provide keyboard shortcuts for everything.

## 2. Key Event Propagation Between Views

**Problem**: Pressing Enter to navigate fires the same key on the destination view.

**Cause**: The key event propagates within the same frame.

**Solution**: Combine multiple approaches:
```typescript
// 1. preventDefault at source (in keymap run handler)
// 2. Frame delay at destination
const [ready, setReady] = useState(false)
useEffect(() => {
  const id = requestAnimationFrame(() => setReady(true))
  return () => cancelAnimationFrame(id)
}, [])
```

## 3. Atom Subscriptions Causing Unnecessary Re-renders

**Problem**: Component re-renders when unrelated atom state changes.

**Cause**: Using `useAtom` when you only need to read or only need to write.

**Solution**:
```typescript
// Wrong: subscribes to both read and write
const [value, setValue] = useAtom(myAtom)

// Right: subscribe only to what you need
const value = useAtomValue(myAtom)     // read-only
const setValue = useAtomSet(myAtom)     // write-only
```

## 4. Async Atom Not Refreshing

**Problem**: Data doesn't update after a mutation.

**Cause**: Async atoms only re-evaluate when their `get()` dependencies change.

**Solution**: Use `useAtomRefresh` or change a dependency atom:
```typescript
const refresh = useAtomRefresh(dataAtom)

// After mutation
await submitAction(input)
refresh() // Force re-evaluation
```

## 5. String Width Issues

**Problem**: Layout breaks with CJK characters, emojis, or ANSI escape codes.

**Cause**: These characters have different visual widths than their byte length.

**Solution**: Use `string-width` for measuring display width:
```typescript
import stringWidth from "string-width"

const fitCell = (text: string, width: number): string => {
  const actualWidth = stringWidth(text)
  if (actualWidth <= width) return text + " ".repeat(width - actualWidth)
  // Truncate with ellipsis
  return truncateToWidth(text, width - 1) + "…"
}
```

## 6. Atom.keepAlive Misuse

**Problem**: Atoms lose state when navigating between surfaces.

**Cause**: Without `keepAlive`, atoms are garbage-collected when no component subscribes.

**Solution**: Add `Atom.keepAlive` to atoms that should persist:
```typescript
// Will lose state when component unmounts
export const dataAtom = appRuntime.atom(/* ... */)

// Persists across component lifecycle
export const dataAtom = appRuntime.atom(/* ... */).pipe(Atom.keepAlive)
```

**When to use**: Caches, user preferences, data that's expensive to re-fetch.
**When NOT to use**: Ephemeral UI state (modal content, scroll position of unmounted views).

## 7. Focus Management in Modals

**Problem**: Keyboard input goes to the wrong component when a modal opens.

**Cause**: Multiple `useKeyboard` handlers are active simultaneously.

**Solution**: Use keymap scoping to ensure only the modal's keymap is active:
```typescript
// Modal keymap is checked first — blocks everything below
mergeModalKeymap.scope((ctx) => ctx.activeModal._tag === "Merge" && ctx.mergeCtx),
// List nav only active when no modal
listNavKeymap.scope((ctx) => ctx.activeModal._tag === "None" && ctx.listCtx),
```

## 8. Box Sizing and Flexbox

**Problem**: Components overflow or don't fill available space.

**Cause**: Missing `flexGrow`, incorrect `width`/`height` constraints.

**Key rules**:
- `flexGrow={1}` — fill remaining space
- `flexGrow={0}` — use only natural size
- Always set explicit `height` on `<scrollbox>`
- `flexDirection="column"` for vertical stacking (default)
- `flexDirection="row"` for horizontal layout

```tsx
<box flexDirection="column" height={totalHeight}>
  <box height={1}><Header /></box>           {/* Fixed 1 row */}
  <box flexGrow={1}><Content /></box>         {/* Fill remaining */}
  <box height={1}><Footer /></box>            {/* Fixed 1 row */}
</box>
```

## 9. Terminal Resize Handling

**Problem**: Layout doesn't adapt when terminal is resized.

**Solution**: Use `useTerminalDimensions` — it's reactive and triggers re-render:
```typescript
const { width, height } = useTerminalDimensions()
// Component re-renders automatically on resize
```

## 10. ASCII-Only Icons

**Problem**: Unicode icons render incorrectly in some terminals.

**Solution**: Prefer ASCII-safe alternatives:
```
✓ → [x]    ✗ → [ ]    → → >    ← → <
● → *      ○ → o      ▶ → >    ◀ → <
```

Or use box-drawing characters which are widely supported:
```
─ │ ┌ ┐ └ ┘ ├ ┤ ┬ ┴ ┼
```

## 11. Effect Service Access Outside Atoms

**Problem**: Need to call a service from a React event handler, not from an atom.

**Cause**: Services are only available inside `appRuntime.atom()` or `appRuntime.fn()`.

**Solution**: Create an action atom and invoke it:
```typescript
// Define as action atom
export const copyToClipboardAtom = appRuntime.fn<string>()(
  (text) => Clipboard.use((cb) => cb.write(text))
)

// Use in component
const copyToClipboard = useAtomSet(copyToClipboardAtom, { mode: "promise" })
await copyToClipboard(selectedText)
```

## 12. Color Support Detection

**Problem**: Colors look wrong in different terminal emulators.

**Solution**: Check color support and provide fallbacks:
```typescript
import { supportsColor } from "supports-color"

const colors = supportsColor.stdout?.has256
  ? { accent: "#61afef", muted: "#5c6370" }
  : { accent: "cyan", muted: "gray" }
```
