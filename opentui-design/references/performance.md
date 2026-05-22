# Performance Optimization in OpenTUI

Best practices for optimizing performance in OpenTUI + React + Effect Atom applications.

## Overview

Terminal UI performance is critical — users expect instant response to keystrokes. Key areas: atom granularity, render minimization, list virtualization, and async operation management.

## Atom Granularity

### Split Large Atoms

```typescript
// Bad: one big atom causes all subscribers to re-render
export const appStateAtom = Atom.make({
  selectedIndex: 0,
  filter: "",
  view: "list",
  items: [],
})

// Good: separate atoms for independent concerns
export const selectedIndexAtom = Atom.make(0)
export const filterTextAtom = Atom.make("")
export const viewModeAtom = Atom.make<ViewMode>("list")
export const itemsAtom = appRuntime.atom(/* ... */)
```

### Use Derived Atoms for Computed Values

```typescript
// Derived atoms memoize automatically — only recompute when deps change
export const visibleItemsAtom = Atom.make((get) => {
  const items = get(itemsAtom)
  const filter = get(filterTextAtom)
  if (!filter) return items
  return items.filter((item) => item.title.toLowerCase().includes(filter.toLowerCase()))
})

// Components subscribing to visibleItemsAtom only re-render when the
// filtered result actually changes, not on every keystroke if the
// filter produces the same result
```

## Render Minimization

### Subscribe Only to What You Need

```typescript
// Bad: subscribes to both read and write, re-renders on any change
const [items, setItems] = useAtom(itemsAtom)

// Good: read-only subscription
const items = useAtomValue(itemsAtom)

// Good: write-only, no re-render subscription
const setFilter = useAtomSet(filterTextAtom)
```

### Memoize Expensive Components

```typescript
import { memo } from "react"

// Only re-renders when props actually change
export const ItemRow = memo(({ item, width, isSelected }: ItemRowProps) => (
  <box flexDirection="row">
    <text fg={isSelected ? "cyan" : "white"}>
      {fitCell(item.title, width)}
    </text>
  </box>
))
```

### Avoid Inline Object/Array Creation in JSX

```typescript
// Bad: new object every render, breaks memo
<ItemRow style={{ color: "red" }} />

// Good: stable reference
const redStyle = { color: "red" }
<ItemRow style={redStyle} />
```

## List Virtualization

For long lists, only render visible items:

```typescript
const VirtualizedList = ({
  items,
  selectedIndex,
  visibleHeight,
  renderItem,
}: {
  items: readonly Item[]
  selectedIndex: number
  visibleHeight: number
  renderItem: (item: Item, index: number, isSelected: boolean) => React.ReactNode
}) => {
  const scrollOffset = useRef(0)

  // Adjust scroll to keep selected item visible
  if (selectedIndex < scrollOffset.current) {
    scrollOffset.current = selectedIndex
  } else if (selectedIndex >= scrollOffset.current + visibleHeight) {
    scrollOffset.current = selectedIndex - visibleHeight + 1
  }

  const visibleItems = items.slice(
    scrollOffset.current,
    scrollOffset.current + visibleHeight,
  )

  return (
    <box flexDirection="column" height={visibleHeight}>
      {visibleItems.map((item, i) => {
        const realIndex = scrollOffset.current + i
        return renderItem(item, realIndex, realIndex === selectedIndex)
      })}
    </box>
  )
}
```

## Async Operation Management

### Debounce Filter Input

```typescript
const useDebounced = <T,>(value: T, delayMs: number): T => {
  const [debounced, setDebounced] = useState(value)

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs)
    return () => clearTimeout(timer)
  }, [value, delayMs])

  return debounced
}

// Usage: only trigger fetch after user stops typing
const FilteredList = () => {
  const [rawFilter, setRawFilter] = useAtom(filterTextAtom)
  const debouncedFilter = useDebounced(rawFilter, 150)
  // debouncedFilter drives the data-fetching atom
}
```

### Idle Refresh

Refresh data in the background when the user is idle:

```typescript
const useIdleRefresh = (refreshFn: () => void, intervalMs: number) => {
  const lastActivityRef = useRef(Date.now())

  useKeyboard(() => {
    lastActivityRef.current = Date.now()
  })

  useEffect(() => {
    const id = setInterval(() => {
      const idle = Date.now() - lastActivityRef.current > intervalMs
      if (idle) refreshFn()
    }, intervalMs)
    return () => clearInterval(id)
  }, [refreshFn, intervalMs])
}
```

### Cache with Atom.keepAlive

```typescript
// Cache persists across component lifecycle
export const itemsCacheAtom = Atom.make<Record<string, Item[]>>({}).pipe(Atom.keepAlive)

// Data atom checks cache before fetching
export const itemsAtom = appRuntime.atom(
  Effect.fnUntraced(function* (get) {
    const api = yield* ApiService
    const view = get(activeViewAtom)
    const cache = get(itemsCacheAtom)
    const cacheKey = viewToCacheKey(view)

    if (cache[cacheKey]) return cache[cacheKey]

    const result = yield* api.fetchItems(view)
    // Update cache atom (side effect via Atom.set)
    yield* Atom.set(itemsCacheAtom, { ...cache, [cacheKey]: result })
    return result
  }),
).pipe(Atom.keepAlive)
```

## Memory Management

### Clean Up Timers and Subscriptions

```typescript
useEffect(() => {
  const interval = setInterval(tick, 80)
  return () => clearInterval(interval)
}, [])
```

### Avoid Closures Over Stale State

```typescript
// Bad: stale closure
useEffect(() => {
  const handler = () => console.log(count) // captures initial count
  window.addEventListener("resize", handler)
  return () => window.removeEventListener("resize", handler)
}, []) // missing count dependency

// Good: use ref for latest value
const countRef = useRef(count)
countRef.current = count

useEffect(() => {
  const handler = () => console.log(countRef.current)
  window.addEventListener("resize", handler)
  return () => window.removeEventListener("resize", handler)
}, [])
```

## Best Practices Summary

1. **Split atoms** — One concern per atom for fine-grained reactivity
2. **Derived atoms over in-component computation** — Atoms memoize automatically
3. **`useAtomValue` over `useAtom`** — Avoid write subscriptions when not needed
4. **`memo` for list items** — Prevent re-rendering unchanged rows
5. **Virtualize long lists** — Only render visible items
6. **Debounce user input** — Don't trigger fetches on every keystroke
7. **`Atom.keepAlive` for caches** — Avoid re-fetching on remount
8. **Clean up effects** — Always return cleanup from `useEffect`
