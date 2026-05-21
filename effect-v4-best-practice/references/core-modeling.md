# Core Modeling Reference (v4)

## Table of Contents

1. TypeScript module conventions
2. Schema modeling patterns
3. Error modeling
4. Service patterns
5. Layer patterns
6. Equality, Option, and observability

## 1) TypeScript Module Conventions

Use this baseline in Effect codebases:

```json
{
  "compilerOptions": {
    "moduleResolution": "bundler",
    "rewriteRelativeImportExtensions": true,
    "verbatimModuleSyntax": true
  }
}
```

- Write `.ts` imports in source; emit rewrites to `.js`.
- Keep modules flat and explicit.
- Do not use barrel files (`index.ts`).

Prefer:

```typescript
import { Account } from "./account.ts";
import { AccountError } from "./account-error.ts";
```

Avoid:

```typescript
import { Account, AccountError } from "./index.ts";
```

## 2) Schema Modeling Patterns

### Prefer `Schema.Class` for domain entities

```typescript
import { Schema } from "effect";

export class Account extends Schema.Class<Account>("Account")({
  id: AccountId,
  code: Schema.NonEmptyTrimmedString,
  name: Schema.NonEmptyTrimmedString,
  type: Schema.Literals(["Asset", "Liability", "Equity", "Revenue", "Expense"]),
  normalBalance: Schema.Literals(["Debit", "Credit"]),
  isActive: Schema.Boolean,
}) {}
```

**v4 change**: `Schema.Literal` with multiple values becomes `Schema.Literals([...])`.

### Use `.make()` everywhere

```typescript
const account = Account.make(input);
const trusted = Account.make(row, { disableValidation: true });
```

Never instantiate schema classes with `new`.

### Use branded IDs

```typescript
export const AccountId = Schema.NonEmptyTrimmedString.pipe(Schema.brand("AccountId"));
export type AccountId = typeof AccountId.Type;
```

### Keep domain models wire-safe

- Avoid `*FromSelf` variants (v4 note: many `*FromSelf` schemas have been renamed to drop the suffix).
- Prefer JSON-serializable schemas for transport boundaries.

Prefer:

```typescript
parentId: Schema.Option(AccountId);
```

Avoid:

```typescript
// v3: Schema.OptionFromSelf
// v4: Schema.Option (for wire-safe encoding)
parentId: Schema.Option(AccountId); // correct
```

### Use Effectful schema decoding

Prefer:

```typescript
const decoded = Schema.decodeUnknownEffect(Account)(input);
```

**v4 change**: `Schema.decodeUnknown` → `Schema.decodeUnknownEffect`.

Avoid synchronous throwing APIs such as `decodeUnknownSync`.

## 3) Error Modeling

### Use `Schema.TaggedErrorClass` with explicit tags

```typescript
export class AccountNotFound extends Schema.TaggedErrorClass<AccountNotFound>()("AccountNotFound", {
  accountId: AccountId,
}) {}
```

**v4 change**: `Schema.TaggedError` → `Schema.TaggedErrorClass`.

### Keep errors specific

- Model one business failure reason per error type.
- Avoid generic catch-all tags like `NotFoundError` for multiple entities.

### Handle known failures with `catchTag`

```typescript
const effect = loadAccount(id).pipe(Effect.catchTag("AccountNotFound", () => fallbackAccount));
```

Avoid broad `catch` (v4: `catchAll` → `catch`) when the error channel is `never`.

## 4) Service Patterns

### Prefer `ServiceMap.Service` for services (v4)

```typescript
import type { ServicesReturns } from "@xstack/fx/effect";

import { Effect, Layer, ServiceMap } from "effect";

export class UserService extends ServiceMap.Service<
  UserService,
  {
    readonly findById: (id: UserId) => Effect.Effect<User>;
  }
>()("UserService") {}

export declare namespace UserService {
  export type Methods = ServiceMap.Service.Shape<UserService>;
  export type Returns<key extends keyof Methods> = ServicesReturns<Methods[key]>;
}

export const makeUserService = Layer.effect(
  UserService,
  Effect.gen(function* () {
    const repo = yield* UserRepo;

    const findById: UserService.Methods["findById"] = Effect.fn("UserService.findById")(
      function* (id): UserService.Returns<"findById"> {
        return yield* repo.findById(id);
      },
    );

    return ServiceMap.make(UserService, { findById });
  }),
);
```

**v4 changes**:

- `Context.Tag` → `ServiceMap.Service`
- Argument order: `ServiceMap.Service<Self, Shape>()("id")` (type params first, then id)
- `Context.Tag.Service<T>` → `ServiceMap.Service.Shape<T>`
- `UserService.of(...)` → `ServiceMap.make(UserService, ...)`

Rules:

- Put business logic in services, not handlers.
- Wrap service methods with `Effect.fn` for naming/tracing.
- Expose `Methods` and `Returns` in a namespace for typed handlers.
- Use `Layer.effect` / `Layer.scoped` for construction.

### Using `ServiceMap.Service` with `make` option

For effectful constructors, use the `make` option and define layers explicitly:

```typescript
class Logger extends ServiceMap.Service<Logger>()("Logger", {
  make: Effect.gen(function* () {
    const config = yield* Config;
    return { log: (msg: string) => Effect.log(`[${config.prefix}] ${msg}`) };
  }),
}) {
  static readonly layer = Layer.effect(this, this.make).pipe(Layer.provide(Config.layer));
}
```

**v4 note**: No auto-generated `.Default` layer. Define layers explicitly and name them `layer` (or `layerTest`, `layerConfig` for variants).

## 5) Layer Patterns

### `Layer.effect` for effectful construction without cleanup

```typescript
const make = Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;
  return { ping: sql`SELECT 1` };
});

export const HealthRepoLayer = Layer.effect(HealthRepo, make);
```

**v4 note**: Layers are memoized across `Effect.provide` calls by default. Use `Layer.fresh` or `Effect.provide(layer, { local: true })` to opt out.

### `Layer.scoped` for resources with finalizers

```typescript
const make = Effect.gen(function* () {
  const queue = yield* PubSub.unbounded<Message>();
  yield* Effect.forkScoped(stream.pipe(Stream.runForEach((m) => PubSub.publish(queue, m))));
  return { subscribe: PubSub.subscribe(queue) };
});

export const MessageBusLayer = Layer.scoped(MessageBus, make);
```

Prefer composition at app roots with `Layer.mergeAll(...)` and explicit dependencies.

## 6) Equality, Option, and Observability

### Equality

- Rely on Schema-derived Equal/Hash.
- Do not manually implement `Equal.symbol` or `Hash.symbol`.
- Use `Chunk` instead of `Array` where structural equality matters.
- **v4 note**: `Equal.equals` performs deep structural comparison on objects by default, so `Schema.Data` is no longer needed.

### Option

- Model optional domain values with `Option<T>`, not `null`/`undefined`.
- Use `Option.match` or `Option.getOrElse`.
- Avoid `Option.getOrThrow`.

### Observability and Config

- Use `Effect.log` for structured logs.
- Use `Config.*` for env/config parsing and validation.
- Avoid `console.log` and direct `process.env` reads in business logic.
