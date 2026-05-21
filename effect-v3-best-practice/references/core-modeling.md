# Core Modeling Reference

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
import { Account } from "./account";
import { AccountError } from "./account-error";
```

Avoid:

```typescript
import { Account, AccountError } from "./index";
```

## 2) Schema Modeling Patterns

### Prefer `Schema.Class` for domain entities

```typescript
import { Schema } from "effect";

export class Account extends Schema.Class<Account>("Account")({
  id: AccountId,
  code: Schema.NonEmptyTrimmedString,
  name: Schema.NonEmptyTrimmedString,
  type: Schema.Literal("Asset", "Liability", "Equity", "Revenue", "Expense"),
  normalBalance: Schema.Literal("Debit", "Credit"),
  isActive: Schema.Boolean,
}) {}
```

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

- Avoid `OptionFromSelf`, `EitherFromSelf`, and other `*FromSelf` variants.
- Prefer JSON-serializable schemas for transport boundaries.

Prefer:

```typescript
parentId: Schema.Option(AccountId);
```

Avoid:

```typescript
parentId: Schema.OptionFromSelf(AccountId);
```

### Use Effectful schema decoding

Prefer:

```typescript
const decoded = Schema.decodeUnknown(Account)(input);
```

Avoid synchronous throwing APIs such as `decodeUnknownSync`.

## 3) Error Modeling

### Use `Schema.TaggedError` with explicit tags

```typescript
export class AccountNotFound extends Schema.TaggedError<AccountNotFound>()("AccountNotFound", {
  accountId: AccountId,
}) {}
```

### Keep errors specific

- Model one business failure reason per error type.
- Avoid generic catch-all tags like `NotFoundError` for multiple entities.

### Handle known failures with `catchTag`

```typescript
const effect = loadAccount(id).pipe(Effect.catchTag("AccountNotFound", () => fallbackAccount));
```

Avoid broad `catchAll` when the error channel is `never`.

## 4) Service Patterns

### Prefer `Context.Tag` for services

```typescript
import type { ServicesReturns } from "@xstack/fx/effect";

import { Context, Effect, Layer } from "effect";

export class UserService extends Context.Tag("UserService")<
  UserService,
  {
    readonly findById: (id: UserId) => Effect.Effect<User>;
  }
>() {}

export declare namespace UserService {
  export type Methods = Context.Tag.Service<UserService>;
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

    return UserService.of({ findById });
  }),
);
```

Rules:

- Put business logic in services, not handlers.
- Wrap service methods with `Effect.fn` for naming/tracing.
- Expose `Methods` and `Returns` in a namespace for typed handlers.
- Use `Layer.effect` / `Layer.scoped` for construction.

## 5) Layer Patterns

### `Layer.effect` for effectful construction without cleanup

```typescript
const make = Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;
  return { ping: sql`SELECT 1` };
});

export const HealthRepoLive = Layer.effect(HealthRepo, make);
```

### `Layer.scoped` for resources with finalizers

```typescript
const make = Effect.gen(function* () {
  const queue = yield* PubSub.unbounded<Message>();
  yield* Effect.forkScoped(stream.pipe(Stream.runForEach((m) => PubSub.publish(queue, m))));
  return { subscribe: PubSub.subscribe(queue) };
});

export const MessageBusLive = Layer.scoped(MessageBus, make);
```

Prefer composition at app roots with `Layer.mergeAll(...)` and explicit dependencies.

## 6) Equality, Option, and Observability

### Equality

- Rely on Schema-derived Equal/Hash.
- Do not manually implement `Equal.symbol` or `Hash.symbol`.
- Use `Chunk` instead of `Array` where structural equality matters.

### Option

- Model optional domain values with `Option<T>`, not `null`/`undefined`.
- Use `Option.match` or `Option.getOrElse`.
- Avoid `Option.getOrThrow`.

### Observability and Config

- Use `Effect.log` for structured logs.
- Use `Config.*` for env/config parsing and validation.
- Avoid `console.log` and direct `process.env` reads in business logic.
