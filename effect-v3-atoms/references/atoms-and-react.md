# Atoms and React Integration Reference

This file covers atom and UI integration rules for the current `apps/web` pattern.
For generic Effect primitives and error modeling details, see `effect-best-practice`.

## Layer Boundary

- Atoms are the bridge between web services and React components.
- Atoms may use browser APIs such as `document`, `URL`, `File`, and timers when needed.
- Atoms do not call `RpcClient` directly.
- Components consume feature APIs and should avoid service or workflow logic.

## Feature Skeleton

```typescript
import { Atom, Result, defineFeature } from '@xstack/atom-react'
import * as Effect from 'effect/Effect'

import { ReposService, ReposServiceLive } from '../services/repos/repos-service'

export const reposFeature = defineFeature({
  tags: { ReposService },
  provide: ReposServiceLive,
  make: (runtime) => {
    const configAtom = runtime
      .atom(
        Effect.gen(function* () {
          const reposService = yield* ReposService
          return yield* reposService.list()
        }),
      )
      .pipe(Atom.keepAlive)

    const reposAtom = Atom.make((get) => Result.map(get(configAtom), (config) => config.repos)).pipe(Atom.keepAlive)

    const refreshFn = runtime.fn(
      Effect.fn('repos.refresh')(function* (_: void, ctx: Atom.FnContext) {
        ctx.refresh(configAtom)
      }),
    )

    return { configAtom, reposAtom, refreshFn }
  },
})
```

## Atom Composition Rules

- Use `runtime.atom(...)` for effectful loaders and long-lived side effects.
- Use `Atom.make(...)` for pure derived state.
- Add `Atom.keepAlive` to cached loaders, selections, and derived atoms that multiple views rely on.
- Keep shared workflow derivations in service-side `view-model.ts` helpers instead of large component bodies.

## Families and Keyed State

```typescript
const diffFileAtomFamily = runtime.family({
  key: (request: DiffFileAtomRequest) => Data.struct(request),
  make: (request) =>
    runtime.atom(
      Effect.gen(function* () {
        const diffService = yield* DiffService
        return yield* diffService.fileDiff(request)
      }),
    ),
})
```

- Use `runtime.family(...)` for request-scoped atoms and polling handles.
- Choose stable keys from ids or `Data.struct(...)`.
- Keep family request types near the feature unless they are reused broadly.

## Command Rules

- Use `runtime.fn(Effect.fn('name')(function* (...) { ... }))` for commands.
- Include `ctx: Atom.FnContext` when writes affect read atoms or local state.
- Use `ctx.set(...)` for local state transitions and `ctx.refresh(...)` for dependent query atoms.
- Guard commands with derived availability atoms when actions should be blocked.

## Polling and Cleanup Rule

```typescript
const processListPollingAtom = runtime.atom(
  Effect.fn(function* (ctx) {
    const runtime_ = yield* Effect.runtime<never>()
    const runFork = Runtime.runFork(runtime_)
    const interval = setInterval(() => {
      runFork(Effect.sync(() => ctx.refresh(processListAtom)))
    }, 1000)

    yield* Effect.addFinalizer(() =>
      Effect.sync(() => {
        clearInterval(interval)
      }),
    )

    return true
  }),
)
```

- Timers and subscriptions belong in atoms, not services.
- Always register finalizers for intervals, listeners, and other long-lived side effects.
- Prefer refreshing existing loader atoms over duplicating fetch logic inside the polling atom.

## Browser API Rule

```typescript
const exportDbFn = runtime.fn(
  Effect.fn('db.export')(function* (_: void) {
    const blob = yield* someService.export()
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = 'db.sqlite'
    anchor.click()
  }),
)
```

- Keep browser interaction in atoms or components.
- Services should return data objects such as DTOs, `Blob`, or `Uint8Array`, not DOM results.

## React Consumption

```typescript
function ReposPanel() {
  const repos = reposFeature.useHooks()
  const items = repos.reposAtom.useValue()

  return (
    <button onClick={() => repos.refreshFn.promise()}>
      Refresh {Result.isSuccess(items) ? items.value.length : 0}
    </button>
  )
}
```

- Use `feature.useHooks()` for the feature instance.
- Use `atom.useValue()` for state reads.
- Use `fn.promise()` for command dispatch; match on result or `Exit` only when the UI needs explicit success or failure handling.

## Final Checks

- No `RpcClient` usage in atoms.
- Writes refresh relevant read atoms.
- Polling or subscription atoms clean up with finalizers.
- Long-lived shared atoms use `Atom.keepAlive` deliberately.
- Browser APIs appear only in atoms or components, not services.
