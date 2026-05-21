# Database And Error Propagation Reference

## Table of Contents

1. SQL query patterns
2. SqlSchema wrappers
3. Kysely integration
4. Repository boundaries
5. Backend to frontend error flow

## 1) SQL Query Patterns

Use `@effect/sql` tagged templates for most queries.

```typescript
const sql = yield * SqlClient.SqlClient;

sql`SELECT * FROM accounts WHERE id = ${id}`;

sql`SELECT * FROM accounts WHERE ${sql.and([sql`org_id = ${orgId}`, sql`is_active = ${true}`])}`;

sql`INSERT INTO accounts ${sql.insert({ name, code, type })}`;

sql`INSERT INTO accounts ${sql.insert(rows)}
  ON CONFLICT(id) DO UPDATE SET name = excluded.name`;

sql`CREATE TABLE IF NOT EXISTS accounts (...)`.withoutTransform;
```

Guidelines:

- Keep DDL with `.withoutTransform`.
- Keep SQL construction near persistence code, not in handlers/views.
- Keep query parameterization via template interpolation.

## 2) SqlSchema Wrappers

Prefer `SqlSchema` helpers for typed request/response boundaries.

```typescript
import * as SqlSchema from "@effect/sql/SqlSchema";

const findAllAccounts = SqlSchema.findAll({
  Request: Schema.Struct({ orgId: OrgId }),
  Result: Account,
  execute: ({ orgId }) => sql`SELECT * FROM accounts WHERE org_id = ${orgId}`,
});

const findAccountById = SqlSchema.findOne({
  Request: Schema.Struct({ id: AccountId }),
  Result: Account,
  execute: ({ id }) => sql`SELECT * FROM accounts WHERE id = ${id}`,
});

const insertAccount = SqlSchema.single({
  Request: AccountInsert,
  Result: Account,
  execute: (input) => sql`INSERT INTO accounts ${sql.insert(input)} RETURNING *`,
});

const deleteAccount = SqlSchema.void({
  Request: Schema.Struct({ id: AccountId }),
  execute: ({ id }) => sql`DELETE FROM accounts WHERE id = ${id}`,
});
```

Pick wrapper by expected cardinality:

- `findAll` -> `Effect<ReadonlyArray<A>, E, R>`
- `findOne` -> `Effect<Option<A>, E, R>`
- `single` -> `Effect<A, E, R>`
- `void` -> `Effect<void, E, R>`

## 3) Kysely Integration

Use `@xstack/sql-kysely` for complex type-safe builders.

```typescript
import * as Kysely from "@xstack/sql-kysely/sqlite";

const db = Kysely.make<TablesEncoded>();
const accountRepo = yield * Kysely.repo(Account);

const all = yield * accountRepo.select(db.selectFrom("accounts").selectAll());
const one = yield * accountRepo.select(db.selectFrom("accounts").where("id", "=", id).selectAll()).single;
```

Use Kysely where joins/CTEs/conditional query construction get complex.

## 4) Repository Boundaries

Expose persistence as typed repository methods; keep SQL private.

```typescript
import type { ServicesReturns } from "@xstack/fx/effect";

export class AccountRepo extends Context.Tag("AccountRepo")<
  AccountRepo,
  {
    readonly findById: (id: AccountId) => Effect.Effect<Account>;
  }
>() {}

export declare namespace AccountRepo {
  export type Methods = Context.Tag.Service<AccountRepo>;
  export type Returns<key extends keyof Methods> = ServicesReturns<Methods[key]>;
}

export const makeAccountRepo = Layer.effect(
  AccountRepo,
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient;

    const findByIdQuery = SqlSchema.findOne({
      Request: Schema.Struct({ id: AccountId }),
      Result: Account,
      execute: ({ id }) => sql`SELECT * FROM accounts WHERE id = ${id}`,
    });

    const findById: AccountRepo.Methods["findById"] = Effect.fn("AccountRepo.findById")(
      function* (id): AccountRepo.Returns<"findById"> {
        return yield* findByIdQuery({ id });
      },
    );

    return AccountRepo.of({ findById });
  }),
);
```

Rules:

- Services call repositories.
- Handlers call services.
- Views/atoms do not call SQL.

## 5) Backend To Frontend Error Flow

Use normalized `StandardError` over the wire.

```typescript
type StandardError = {
  _tag: string;
  message: string;
  status?: number;
  stack?: string;
  issues?: ReadonlyArray<{ _tag: string; message: string; path: ReadonlyArray<string> }>;
  cause?: { message: string; stack?: string };
};
```

Flow:

1. Throw/raise `Schema.TaggedError` in domain/service code.
2. Encode `Cause` on server (`@xstack/errors/encoder`).
3. Decode on client (`@xstack/errors/decoder`).
4. Branch on `_tag` in UI state/rendering.

Annotate API-facing errors with status metadata:

```typescript
export class AccountNotFound extends Schema.TaggedError<AccountNotFound>()(
  "AccountNotFound",
  { accountId: AccountId, message: Schema.String },
  HttpApiSchema.annotations({ status: 404 }),
) {}
```

Do not leak raw infra internals in client-visible messages.
