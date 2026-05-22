# Testing Patterns for OpenTUI + Effect Atom

Patterns for testing CLI components, atoms, services, and keymaps in OpenTUI applications.

## Overview

Testing strategy:
- **Unit tests**: Individual atoms, derived computations, services
- **Integration tests**: Component rendering with atom state, keymap dispatch
- **E2E tests**: Full CLI interaction via subprocess

Test runner: Bun test (`bun test`)

## Testing Atoms

### Simple Atom State

```typescript
import { describe, test, expect } from "bun:test"
import * as Atom from "effect/unstable/reactivity/Atom"

describe("selectedIndexAtom", () => {
  test("initial value is 0", () => {
    const registry = Atom.Registry.make()
    const value = registry.get(selectedIndexAtom)
    expect(value).toBe(0)
  })

  test("can be updated", () => {
    const registry = Atom.Registry.make()
    registry.set(selectedIndexAtom, 5)
    expect(registry.get(selectedIndexAtom)).toBe(5)
  })
})
```

### Derived Atom Computation

```typescript
describe("visibleItemsAtom", () => {
  test("filters items by search text", () => {
    const registry = Atom.Registry.make()

    // Set up dependencies
    registry.set(allItemsAtom, [
      { id: "1", title: "Fix bug" },
      { id: "2", title: "Add feature" },
      { id: "3", title: "Fix typo" },
    ])
    registry.set(filterTextAtom, "Fix")

    const result = registry.get(visibleItemsAtom)
    expect(result).toHaveLength(2)
    expect(result[0].title).toBe("Fix bug")
  })

  test("returns all items when filter is empty", () => {
    const registry = Atom.Registry.make()
    registry.set(allItemsAtom, [{ id: "1", title: "Item" }])
    registry.set(filterTextAtom, "")

    expect(registry.get(visibleItemsAtom)).toHaveLength(1)
  })
})
```

## Testing Services

### Mocking Services with Layers

```typescript
import { Effect, Layer } from "effect"

// Create a mock service layer
const MockApiService = Layer.succeed(ApiService, {
  fetchItems: (view) => Effect.succeed([
    { id: "1", title: "Mock Item 1" },
    { id: "2", title: "Mock Item 2" },
  ]),
  submitReview: (input) => Effect.succeed(undefined),
})

describe("ApiService", () => {
  test("fetchItems returns items", async () => {
    const result = await Effect.gen(function* () {
      const api = yield* ApiService
      return yield* api.fetchItems({ queue: "authored" })
    }).pipe(
      Effect.provide(MockApiService),
      Effect.runPromise,
    )

    expect(result).toHaveLength(2)
  })
})
```

### Testing Service-Bound Atoms

```typescript
describe("itemsAtom with mock service", () => {
  test("fetches items based on active view", async () => {
    const testRuntime = Atom.runtime(MockApiService.pipe(
      Layer.provide(MockCacheService),
    ))

    const registry = Atom.Registry.make()
    registry.set(activeViewAtom, PullRequestView.Queue({ queue: "authored" }))

    // Evaluate the async atom
    const result = await registry.getAsync(itemsAtom)
    expect(AsyncResult.isSuccess(result)).toBe(true)
  })
})
```

## Testing Keymap Dispatch

Keymaps have pure dispatch logic that's testable without React:

```typescript
import { pureDispatch } from "@ghui/keymap"

describe("listNavKeymap", () => {
  test("j moves down", () => {
    let movedDown = false
    const ctx = {
      moveDown: () => { movedDown = true },
      moveUp: () => {},
      // ... other handlers
    }

    const handled = pureDispatch(listNavKeymap, { key: "j" }, ctx)
    expect(handled).toBe(true)
    expect(movedDown).toBe(true)
  })

  test("g g moves to top (multi-key sequence)", () => {
    let movedToTop = false
    const ctx = { moveToTop: () => { movedToTop = true }, /* ... */ }

    // First 'g' starts sequence
    const first = pureDispatch(listNavKeymap, { key: "g" }, ctx)
    expect(first).toBe("pending") // waiting for second key

    // Second 'g' completes
    const second = pureDispatch(listNavKeymap, { key: "g" }, ctx)
    expect(second).toBe(true)
    expect(movedToTop).toBe(true)
  })
})
```

## Testing Components with Atoms

```typescript
import { render } from "@testing-library/react" // or custom OpenTUI test renderer
import { RegistryContext } from "@effect/atom-react"

const renderWithAtoms = (
  ui: React.ReactElement,
  initialState?: Record<string, unknown>,
) => {
  const registry = Atom.Registry.make()

  // Set initial atom values
  if (initialState) {
    for (const [atom, value] of Object.entries(initialState)) {
      registry.set(atom, value)
    }
  }

  return render(
    <RegistryContext value={registry}>{ui}</RegistryContext>
  )
}

describe("ItemList", () => {
  test("renders items", () => {
    const items = [
      { id: "1", title: "First" },
      { id: "2", title: "Second" },
    ]

    const { container } = renderWithAtoms(
      <ItemList items={items} selectedIndex={0} contentWidth={40} />,
    )

    expect(container.textContent).toContain("First")
    expect(container.textContent).toContain("Second")
  })
})
```

## Testing Layout

```typescript
describe("SplitPane", () => {
  test("renders left and right panes", () => {
    const { container } = renderWithAtoms(
      <SplitPane
        height={20}
        leftWidth={40}
        rightWidth={40}
        left={<text>Left Content</text>}
        right={<text>Right Content</text>}
      />,
    )

    expect(container.textContent).toContain("Left Content")
    expect(container.textContent).toContain("Right Content")
  })
})
```

## E2E Testing with Subprocess

```typescript
import { spawn } from "bun"

describe("CLI E2E", () => {
  test("app starts and shows loading", async () => {
    const proc = spawn(["bun", "run", "src/index.tsx"], {
      env: { ...process.env, TERM: "xterm-256color" },
      stdout: "pipe",
      stderr: "pipe",
    })

    // Read initial output
    const reader = proc.stdout.getReader()
    const { value } = await reader.read()
    const output = new TextDecoder().decode(value)

    expect(output).toContain("Loading")

    proc.kill()
  })
})
```

## Best Practices

1. **Test atoms in isolation** — Use `Atom.Registry.make()` for fresh state per test
2. **Mock services with Layers** — Never hit real APIs in tests
3. **Test keymaps with pure dispatch** — No React/DOM needed for keymap logic
4. **Use `renderWithAtoms` helper** — Consistent atom registry setup
5. **Test derived atoms by setting dependencies** — Verify computation logic
6. **Prefer unit tests for atoms** — Fast, deterministic, easy to maintain
7. **E2E for smoke tests only** — Subprocess tests are slow; use sparingly
