# Testing And Delivery Reference (v4)

## Table of Contents

1. Testing patterns
2. Delivery workflow
3. Quality checklist
4. Anti-patterns
5. Output contract

## 1) Testing Patterns

Use `@effect/vitest` and provide layers explicitly.

```typescript
import { describe, it } from "@effect/vitest";

describe("AccountService", () => {
  it.effect("finds account by id", () =>
    Effect.gen(function* () {
      const account = yield* AccountService.findById(testId);
      expect(account.name).toBe("Cash");
    }).pipe(Effect.provide(TestLayer)),
  );
});
```

Use isolated test infrastructure layers:

```typescript
const TestSqlLayer = SqliteClient.layer({ filename: ":memory:" });

const TestLayer = Layer.mergeAll(AccountRepo.layer, AccountService.layer).pipe(
  Layer.provideMerge(TestSqlLayer),
  Layer.provideMerge(MigratorLayer),
);
```

**v4 note**: Name layers with `layer` suffix (e.g. `AccountRepo.layer`) instead of v3's `Default` or `Live`. Use `layerTest`, `layerConfig` for variants.

**v4 note**: Layers are memoized across `Effect.provide` calls by default. Use `Effect.provide(layer, { local: true })` for test isolation when needed.

Integration tests should include the transport server layer and real handlers.

## 2) Delivery Workflow

Follow this strict order unless migration constraints force a different sequence:

1. Define domain schema types and explicit error variants.
2. Implement or refactor service methods and repositories.
3. Define/update RPC contracts.
4. Implement thin handlers.
5. Wire composition root layers.
6. Add frontend state (query atoms, command effects).
7. Connect frontend view rendering.
8. Add tests for success and failure paths.

Layer map:

- `domain`: entities/value objects/errors/services/repos
- `transport`: contracts/handlers/middleware
- `database`: persistence/query modules
- `frontend-state`: atoms/commands/form adapters
- `frontend-view`: components/pages

## 3) Quality Checklist (v4)

- [ ] Domain schema and typed errors updated (use `Schema.TaggedErrorClass`)
- [ ] Service signatures and error channels are explicit
- [ ] RPC payload/success/error contracts updated (use `Schema.Union([...])`)
- [ ] Handlers contain no business logic
- [ ] SQL wrapped via SqlSchema/Kysely repos
- [ ] Layer composition includes new dependencies
- [ ] Error encoding/decoding round-trip validated
- [ ] Frontend query/command split preserved
- [ ] Loading/error/success render states covered
- [ ] `it.effect()` tests added for key paths
- [ ] Services use `ServiceMap.Service` (not `Context.Tag`)
- [ ] Schema decoding uses `decodeUnknownEffect` (not `decodeUnknown`)
- [ ] Error handling uses `catch` (not `catchAll`)

## 4) Anti-Patterns (v4)

Avoid these patterns in Effect v4 application code:

- `any`, `as any`, global `Error`
- `catch` masking typed errors (especially on `never`)
- `decodeUnknownSync` or other sync throw schema APIs
- `*FromSelf` schemas in domain models (many renamed in v4)
- `new` for schema classes instead of `.make()`
- Barrel files (`index.ts`) for core domain modules
- Domain logic in transport handlers/controllers
- Raw SQL inside handlers/UI components
- `console.log` instead of `Effect.log`
- `process.env` access instead of `Config.*`
- `null`/`undefined` instead of `Option<T>`
- `Option.getOrThrow`
- unmanaged side effects without finalizers
- `yield* ref` instead of `yield* Ref.get(ref)` (v4: Ref is not an Effect)
- `yield* deferred` instead of `yield* Deferred.await(deferred)` (v4: Deferred is not an Effect)
- `yield* fiber` instead of `yield* Fiber.join(fiber)` (v4: Fiber is not an Effect)

## 5) Output Contract

When completing implementation work with this skill, report:

1. Changed layers (`domain`, `transport`, `database`, `frontend-state`, `frontend-view`)
2. Key design decisions and why each belongs in that layer
3. Risks and concrete follow-up suggestions (cache, polling, migration, concurrency)
