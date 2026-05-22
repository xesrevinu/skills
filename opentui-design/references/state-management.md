# State Management with Effect Atom

Patterns for managing state in OpenTUI applications using Effect Atom and `@effect/atom-react`.

## Overview

Effect Atom provides a reactive state management system that integrates deeply with Effect's service layer. Atoms are the fundamental unit of state — they can be simple values, derived computations, or async data-fetching units with full service access.

## Core Concepts

### Simple State Atoms

```typescript
import * as Atom from "effect/unstable/reactivity/Atom"

// Primitive state
export const selectedIndexAtom = Atom.make(0)
export const filterTextAtom = Atom.make("")
export const isLoadingAtom = Atom.make(false)

// Typed state
export type ViewMode = "list" | "detail" | "diff"
export const viewModeAtom = Atom.make<ViewMode>("list")

// Object state
export const preferencesAtom = Atom.make<Record<string, boolean>>({})
```

### Derived Atoms

Derived atoms compute values from other atoms. The `get()` call registers reactive dependencies.

```typescript
// Derived from single atom
export const hasFilterAtom = Atom.make((get) => get(filterTextAtom).length > 0)

// Derived from multiple atoms
export const visibleItemsAtom = Atom.make((get) => {
  const items = get(allItemsAtom)
  const filter = get(filterTextAtom)
  if (!filter) return items
  return items.filter((item) => item.name.includes(filter))
})

// Derived with complex logic
export const paginatedItemsAtom = Atom.make((get) => {
  const items = get(visibleItemsAtom)
  const page = get(currentPageAtom)
  const pageSize = get(pageSizeAtom)
  return items.slice(page * pageSize, (page + 1) * pageSize)
})
```

### Atom.keepAlive

By default, atoms are garbage-collected when no subscribers remain. Use `Atom.keepAlive` for atoms that should persist:

```typescript
// Persists even when no component subscribes
export const cacheAtom = Atom.make<Record<string, Data>>({}).pipe(Atom.keepAlive)
export const favoritesAtom = Atom.make<string[]>([]).pipe(Atom.keepAlive)
```

## Service-Bound Atoms with Atom.runtime

`Atom.runtime` bridges Effect's service/layer system with the atom reactivity system.

### Creating a Runtime

```typescript
import * as Atom from "effect/unstable/reactivity/Atom"
import { Layer } from "effect"

export const appRuntime = Atom.runtime(
  Layer.mergeAll(
    ApiService.layerNoDeps,
    CacheService.layer,
    Clipboard.layerNoDeps,
  ).pipe(
    Layer.provide(CommandRunner.layer),
    Layer.provideMerge(Observability.layer),
  ),
)
```

### Async Data-Fetching Atoms

```typescript
export const itemsAtom = appRuntime
  .atom(
    Effect.fnUntraced(function* (get) {
      const api = yield* ApiService
      const cache = yield* CacheService
      const view = get(activeViewAtom) // reactive dependency
      const filter = get(filterAtom)   // reactive dependency

      // Check cache first
      const cached = yield* cache.get(view, filter)
      if (cached) return cached

      // Fetch from API
      const result = yield* api.fetchItems({ view, filter })
      yield* cache.set(view, filter, result)
      return result
    }),
  )
  .pipe(Atom.keepAlive)
```

When `activeViewAtom` or `filterAtom` changes, the atom re-evaluates automatically.

### Action Atoms (Callable)

Action atoms are invoked from React components to perform side effects:

```typescript
// Simple action
export const openUrlAtom = appRuntime.fn<string>()(
  (url) => BrowserOpener.use((browser) => browser.openUrl(url))
)

// Action with complex input
interface SubmitInput {
  readonly id: string
  readonly body: string
  readonly event: "APPROVE" | "REQUEST_CHANGES" | "COMMENT"
}

export const submitReviewAtom = appRuntime.fn<SubmitInput>()(
  (input) => ApiService.use((api) => api.submitReview(input))
)

// Action that reads other atoms
export const refreshCurrentAtom = appRuntime.fn<void>()(
  () =>
    Effect.gen(function* () {
      const api = yield* ApiService
      const current = yield* Atom.get(selectedItemAtom)
      if (!current) return
      yield* api.refresh(current.id)
    })
)
```

## React Integration

### Reading Atoms

```typescript
import { useAtom, useAtomValue, useAtomSet, useAtomRefresh } from "@effect/atom-react"

const MyComponent = () => {
  // Read + write
  const [view, setView] = useAtom(viewModeAtom)

  // Read-only (most common for derived/async atoms)
  const items = useAtomValue(visibleItemsAtom)

  // Write-only (for atoms you only set)
  const setFilter = useAtomSet(filterTextAtom)

  // Refresh async atom (re-trigger fetch)
  const refreshItems = useAtomRefresh(itemsAtom)

  // Invoke action atom
  const openUrl = useAtomSet(openUrlAtom, { mode: "promise" })

  return (
    <box flexDirection="column">
      <text>View: {view}</text>
      <text>Items: {items.length}</text>
    </box>
  )
}
```

### Handling AsyncResult from Async Atoms

Async atoms return `AsyncResult<A, E>`. Pattern match on the result:

```typescript
import { AsyncResult } from "effect"

const DataView = () => {
  const result = useAtomValue(itemsAtom)

  return AsyncResult.match(result, {
    onInitial: () => <text>Loading...</text>,
    onPending: () => <LoadingSpinner />,
    onFailure: (error) => <text fg="red">Error: {error.message}</text>,
    onSuccess: (data) => <ItemList items={data.items} />,
  })
}
```

## Organizing Atoms

### File Structure

```
src/
├── services/
│   ├── runtime.ts          # Atom.runtime layer composition
│   └── systemAtoms.ts      # Service-bound action atoms
├── ui/
│   ├── listSelection/
│   │   └── atoms.ts        # List selection state atoms
│   ├── filter/
│   │   └── atoms.ts        # Filter state atoms
│   ├── modals/
│   │   └── atoms.ts        # Modal state atoms
│   └── detail/
│       └── atoms.ts        # Detail pane atoms
└── workspace/
    └── atoms.ts            # Workspace-level atoms
```

### Naming Conventions

- State atoms: `{noun}Atom` — `selectedIndexAtom`, `filterTextAtom`
- Derived atoms: `{adjective}{noun}Atom` — `visibleItemsAtom`, `activeViewAtom`
- Action atoms: `{verb}{noun}Atom` — `openUrlAtom`, `submitReviewAtom`
- Boolean atoms: `is{State}Atom` — `isLoadingAtom`, `isFullViewAtom`

## RegistryContext (Root Setup)

```typescript
import { RegistryContext } from "@effect/atom-react"
import * as Atom from "effect/unstable/reactivity/Atom"

const registry = Atom.Registry.make()

const Bootstrap = () => (
  <RegistryContext value={registry}>
    <App />
  </RegistryContext>
)
```

## Custom Hooks Patterns

### useClampedIndex

```typescript
const useClampedIndex = (indexAtom: Atom.Atom<number>, maxIndex: number) => {
  const [index, setIndex] = useAtom(indexAtom)
  useEffect(() => { if (index > maxIndex) setIndex(maxIndex) }, [index, maxIndex])
  return [Math.min(index, maxIndex), setIndex] as const
}
```

### useSpinnerFrame

```typescript
const FRAMES = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"]

const useSpinnerFrame = (active: boolean, intervalMs = 80) => {
  const [frame, setFrame] = useState(0)
  useEffect(() => {
    if (!active) return
    const id = setInterval(() => setFrame((f) => (f + 1) % FRAMES.length), intervalMs)
    return () => clearInterval(id)
  }, [active, intervalMs])
  return active ? FRAMES[frame] : ""
}
```

### useScrollFollowSelected

```typescript
const useScrollFollowSelected = (
  selectedIndex: number,
  visibleHeight: number,
  scrollOffsetRef: React.MutableRefObject<number>,
) => {
  useEffect(() => {
    const offset = scrollOffsetRef.current
    if (selectedIndex < offset) scrollOffsetRef.current = selectedIndex
    else if (selectedIndex >= offset + visibleHeight)
      scrollOffsetRef.current = selectedIndex - visibleHeight + 1
  }, [selectedIndex, visibleHeight])
}
```

### useTerminalFocus

```typescript
const useTerminalFocus = (): boolean => {
  const [focused, setFocused] = useState(true)
  const renderer = useRenderer()
  useEffect(() => {
    const onFocus = () => setFocused(true)
    const onBlur = () => setFocused(false)
    renderer.on("focus", onFocus)
    renderer.on("blur", onBlur)
    return () => { renderer.off("focus", onFocus); renderer.off("blur", onBlur) }
  }, [renderer])
  return focused
}
```

## Best Practices

1. **Colocate atoms** — Keep atoms near the components that use them
2. **Use `Atom.keepAlive`** — For atoms that should survive component unmounts (caches, preferences)
3. **Prefer derived atoms** — Over computing in components; atoms memoize automatically
4. **Use `appRuntime.atom`** — For any data fetching or service interaction
5. **Use `appRuntime.fn`** — For actions/mutations that need service access
6. **Avoid large atom values** — Split into multiple atoms for fine-grained reactivity
7. **Prefer `useAtomValue`** — Most components only read; avoid unnecessary write subscriptions
8. **Use `{ mode: "promise" }` for actions** — Natural error handling with try/catch
9. **Atoms are module-level constants** — Never create atoms inside components
10. **Use `useRef` for non-reactive values** — Scroll offsets, timers, previous values
