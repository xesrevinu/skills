---
name: effect-v4-best-practices
description: Apply Effect(v4) best practices across domain schemas, service layers, typed transport contracts, database access. Use when implementing or refactoring end-to-end Effect application architecture.
---

# Effect v4 Best Practices Skill

Authoritative workflow for Effect v4 best practices with progressive disclosure.

## Core Rules

1. Keep business logic in services; keep handlers and UI thin.
2. Keep transport schema-first and fully typed.
3. Use `Schema.TaggedErrorClass` for domain failures; avoid global `Error`.
4. Use `Schema.Class` and `.make()`; avoid `new`.
5. Use Effect schema APIs (`decodeUnknownEffect`), not sync throwers.
6. Avoid `catch` when error type is `never`.
7. Avoid `*FromSelf` schemas in domain models.
8. Prefer `ServiceMap.Service` over v3's `Context.Tag` for services.
9. Avoid barrel files (`index.ts`) in domain modules.
10. Keep raw SQL inside repos/services, never inside handlers or UI.
11. Never use `try-catch` inside `Effect.gen`; use Effect error combinators.
12. For terminal failure/interrupt branches in `Effect.gen`, use `return yield*`.

## Read This Skill Efficiently

Start here, then load only the reference file needed for the task:

- Domain modeling, schema, errors, services, layers, Option, equality, logging -> `references/core-modeling.md`
- RPC contracts and handlers -> `references/transport-rpc.md`
- SQL, SqlSchema, Kysely, backend->frontend error encoding -> `references/database-and-errors.md`
- Error construction, recovery, testing, and forbidden patterns -> `references/error-handling.md`
- Testing, delivery sequence, checklist, anti-patterns, output contract -> `references/testing-and-delivery.md`

## Default Delivery Order

1. Model entities, inputs, outputs, and explicit error types in domain modules.
2. Implement service methods with typed error channels.
3. Define RPC contracts and keep handlers as adapter-only glue.
4. Implement repository/database logic and wire layers at app roots.
5. Add tests with `it.effect()` and validate error round-trip behavior.

## Layer Map

- `domain`: schema classes, value objects, tagged errors, services, repositories
- `transport`: RPC contracts, handlers, middleware wiring
- `database`: SqlSchema/Kysely query modules and persistence mapping
- `frontend-state`: atoms, commands, form adapters
- `frontend-view`: components/pages rendering state transitions

## Key v4 Changes

### Yieldable Trait (Breaking)

Types like `Ref`, `Deferred`, `Fiber` are no longer Effect subtypes. Use explicit module functions:

```typescript
// v3: yield* ref (Ref extends Effect)
// v4: yield* Ref.get(ref)

// v3: yield* deferred
// v4: yield* Deferred.await(deferred)

// v3: yield* fiber
// v4: yield* Fiber.join(fiber)
```

`Option`, `Result`, `Config` still support `yield*` via the `Yieldable` trait. For Effect combinators, call `.asEffect()` explicitly.

### Services: `Context.Tag` → `ServiceMap.Service`

```typescript
// v3
class Logger extends Context.Tag("Logger")<Logger, { log: (msg: string) => void }>() {}

// v4
class Logger extends ServiceMap.Service<Logger, { log: (msg: string) => void }>()("Logger") {}
```

Use `ServiceMap.Service` with `make` option for effectful constructors. Define layers explicitly with `Layer.effect` or `Layer.scoped`.

### Error Handling: `catchAll*` → `catch*`

- `Effect.catchAll` → `Effect.catch`
- `Effect.catchAllCause` → `Effect.catchCause`
- `Effect.catchSome` → `Effect.catchFilter` (uses `Filter` module)

New in v4:
- `Effect.catchReason(errorTag, reasonTag, handler)` for nested error causes
- `Effect.catchEager(handler)` for synchronous recovery optimization

### Schema Changes

Major renames:
- `Schema.TaggedError` → `Schema.TaggedErrorClass`
- `Schema.decodeUnknown` → `Schema.decodeUnknownEffect`
- `Schema.decode` → `Schema.decodeEffect`
- `*FromSelf` schemas drop suffix: `BigIntFromSelf` → `BigInt`, `DateFromSelf` → `Date`, `OptionFromSelf` → `Option`
- Variadic to array: `Union(A, B)` → `Union([A, B])`, `Tuple(A, B)` → `Tuple([A, B])`
- `Record({ key, value })` → `Record(key, value)`

Filters now use `check(...)`:
- `greaterThan(5)` → `check(isGreaterThan(5))`
- `pattern(regex)` → `check(isPattern(regex))`

### Forking Renames

- `Effect.fork` → `Effect.forkChild`
- `Effect.forkDaemon` → `Effect.forkDetach`
- All fork variants accept options: `{ startImmediately?, uninterruptible? }`

### Layer Memoization

Layers are now memoized across `Effect.provide` calls by default. Use `Layer.fresh` or `Effect.provide(layer, { local: true })` to opt out.

### Generators

`Effect.gen` now requires `self` in an options object:

```typescript
// v3: Effect.gen(this, function*() { ... })
// v4: Effect.gen({ self: this }, function*() { ... })
```

### Runtime Changes

`Runtime<R>` type removed. Use `Effect.services<R>()` + `Effect.runForkWith(services)` instead of `Effect.runtime<R>()` + `Runtime.runFork(runtime)`.

### Scope

`Scope.extend` → `Scope.provide`

## Related Skills

- `eventlog-local-first` for local-first sync architecture and conflict resolution
- `cloudflare-workers` for Cloudflare runtime, Durable Objects, queues, cron
- `otel-fullstack` for browser/worker/server telemetry integration
