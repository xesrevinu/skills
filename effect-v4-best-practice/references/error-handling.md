# Error Handling Patterns (v4)

Practical Effect v4 error-handling patterns for typed failures, recovery, and testing.

## Critical Rules

1. Never use `try-catch` inside `Effect.gen`; it breaks Effect error flow.
2. Use `return yield*` for terminal `Effect.fail` or `Effect.interrupt` branches.
3. Use tagged, structured error types with contextual fields.
4. Prefer `catchTag` for targeted recovery instead of broad `catch` (v4: `catchAll` → `catch`).

## Forbidden Pattern

```ts
// Wrong: try-catch in Effect.gen
Effect.gen(function* () {
  try {
    const result = yield* someEffect;
    return result;
  } catch {
    return yield* Effect.fail("error");
  }
});
```

```ts
// Correct: use Effect combinators
Effect.gen(function* () {
  const result = yield* Effect.result(someEffect);
  if (result._tag === "Failure") {
    return yield* Effect.fail("handled error");
  }
  return result.value;
});
```

## Structured Error Types

```ts
import { Schema } from "effect";

class ValidationError extends Schema.TaggedErrorClass<ValidationError>()("ValidationError", {
  field: Schema.String,
  message: Schema.String,
}) {}

class NetworkError extends Schema.TaggedErrorClass<NetworkError>()("NetworkError", {
  status: Schema.Number,
  url: Schema.String,
  cause: Schema.optional(Schema.Unknown),
}) {}
```

**v4 change**: `Data.TaggedError` → `Schema.TaggedErrorClass`.

Prefer domain-specific tags and enough context for logs, retries, and user-facing mapping.

## Error Creation

Use `Effect.try` for sync throwers:

```ts
const parseJson = (input: string) =>
  Effect.try({
    try: () => JSON.parse(input),
    catch: (cause) => new ValidationError({ field: "input", message: String(cause) }),
  });
```

Use `Effect.tryPromise` for async throwers or rejected promises:

```ts
const fetchUser = (id: string) =>
  Effect.tryPromise({
    try: () => fetch(`/api/users/${id}`),
    catch: (cause) => new NetworkError({ status: 0, url: `/api/users/${id}`, cause }),
  });
```

## Error Handling Combinators (v4)

**v4 renames**:
- `Effect.catchAll` → `Effect.catch`
- `Effect.catchAllCause` → `Effect.catchCause`
- `Effect.catchSome` → `Effect.catchFilter` (uses `Filter` module)

```ts
// v4: Effect.catch (was catchAll)
const safeOp = (input: string) =>
  operation(input).pipe(Effect.catch((error) => Effect.succeed("default")));

// v4: Effect.catchTag (unchanged)
const safeOp2 = (input: string) =>
  operation(input).pipe(Effect.catchTag("ValidationError", () => Effect.succeed("default")));

// v4: Effect.catchFilter (was catchSome)
import { Filter } from "effect";

const safeOp3 = (input: string) =>
  operation(input).pipe(
    Effect.catchFilter(
      Filter.fromPredicate((error: ValidationError) => error.field === "input"),
      (error) => Effect.succeed("default")
    )
  );
```

**New in v4**:
- `Effect.catchReason(errorTag, reasonTag, handler)` — catches a specific `reason` within a tagged error without removing the parent error from the error channel.
- `Effect.catchEager(handler)` — optimization variant of `catch` that evaluates synchronous recovery effects immediately.

## Recovery Patterns

- Retry transient errors with `Effect.retry` + `Schedule.exponential`.
- Use fallback chains with `Effect.orElse` for secondary providers.
- Keep retries selective; do not retry deterministic validation errors.

```ts
const withRetry = <A, E, R>(eff: Effect.Effect<A, E, R>, isRetryable: (e: E) => boolean) =>
  eff.pipe(
    Effect.retry(
      Schedule.exponential("100 millis").pipe(Schedule.whileInput(isRetryable), Schedule.compose(Schedule.recurs(3))),
    ),
  );
```

## Testing Patterns

Use `Effect.exit` in `it.effect()` tests to assert typed failures:

```ts
it.effect("fails with ValidationError", () =>
  Effect.gen(function* () {
    const exit = yield* Effect.exit(operation("bad-input"));
    if (exit._tag === "Failure") {
      // assert tagged error and payload fields
      return;
    }
    throw new Error("Expected failure");
  }),
);
```

## Delivery Checklist

- Errors are tagged and typed (no plain string failures in domain logic).
- No `try-catch` inside `Effect.gen` blocks.
- Terminal failure branches use `return yield*`.
- Recovery uses `catchTag`/`catchFilter` before `catch`.
- Tests assert error tags and important payload fields.
