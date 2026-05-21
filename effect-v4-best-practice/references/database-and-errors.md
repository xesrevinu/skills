# Database And Error Propagation Reference (v4)

## Table of Contents

1. SQL query patterns
2. SqlSchema wrappers
3. Kysely integration
4. Repository boundaries
5. Backend to frontend error flow

## 1) SQL Query Patterns

Use `@effect/sql` tagged templates when Kysely or repo helpers are genuinely awkward. Default to typed repo or Kysely access for normal CRUD.

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
- Treat raw SQL as the exception path, not the default path.

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

Use `@xstack/db` + `@xstack/sql-kysely` as the default repository path for most backend queries.

```typescript
import * as Kysely from "@xstack/sql-kysely/sqlite";

const db = Kysely.make<TablesEncoded>();
const accountRepo = yield * Kysely.repo(Account);

const all = yield * accountRepo.select(db.selectFrom("accounts").selectAll());
const one = yield * accountRepo.select(db.selectFrom("accounts").where("id", "=", id).selectAll()).single;
```

Use Kysely where joins/CTEs/conditional query construction get complex.

Prefer this order:

1. Model tables with Effect Schema and `@xstack/db`.
2. Build queries in Kysely.
3. Decode and enforce cardinality at the repo boundary.
4. Fall back to raw SQL only when the type-safe path is materially worse.

If a field is stored as JSON text in SQLite, model that explicitly instead of hand-stringifying it in repositories.

```typescript
settings: Schema.Record(Schema.String, Schema.Unknown).pipe(
  Database.ColumnConfig({ description: "JSON settings blob" }),
  Database.JsonFromString,
)
```

## 4) Repository Boundaries (v4)

Expose persistence as typed repository methods; keep SQL private.

```typescript
import type { ServicesReturns } from "@xstack/fx/effect";
import { Effect, Layer, ServiceMap } from "effect";

export class AccountRepo extends ServiceMap.Service<
  AccountRepo,
  {
    readonly findById: (id: AccountId) => Effect.Effect<Account>;
  }
>()("AccountRepo") {}

export declare namespace AccountRepo {
  export type Methods = ServiceMap.Service.Shape<AccountRepo>;
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

    return ServiceMap.make(AccountRepo, { findById });
  }),
);
```

**v4 changes**:
- `Context.Tag` → `ServiceMap.Service`
- `Context.Tag.Service<T>` → `ServiceMap.Service.Shape<T>`
- `AccountRepo.of(...)` → `ServiceMap.make(AccountRepo, ...)`

Rules:

- Services call repositories.
- Handlers call services.
- Views/atoms do not call SQL.
- Runtime SQLite on Bun should use `@effect/sql-sqlite-bun`, not `better-sqlite3`.
- If Prisma is used, keep it as schema/migration tooling; do not route application queries through Prisma client.
- If your query effect will execute outside the layer that constructed `yield* Model.repo`, either keep `SqlClient.SqlClient` in the caller environment or re-provide the captured `repo.sql` before returning the effect.

Example:

```typescript
const repo = yield * Account.repo;
const provideRepoSql = Effect.provideService(SqlClient.SqlClient, repo.sql);

const findById = (id: AccountId) =>
  repo
    .select(db.selectFrom(Account.table).selectAll().where("id", "=", id).limit(1))
    .first
    .pipe(provideRepoSql);
```

For SQLite migration workflows, remember that a running dev server may keep the database file open and cause `database is locked`. Stop long-lived processes before `migrate dev`, `migrate deploy`, or `migrate reset`, and prefer surfacing the locking PID early.

## 5) Backend To Frontend Error Flow (v4)

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

1. Throw/raise `Schema.TaggedErrorClass` in domain/service code.
2. Encode `Cause` on server (`@xstack/errors/encoder`).
3. Decode on client (`@xstack/errors/decoder`).
4. Branch on `_tag` in UI state/rendering.

Annotate API-facing errors with status metadata:

```typescript
export class AccountNotFound extends Schema.TaggedErrorClass<AccountNotFound>()(
  "AccountNotFound",
  { accountId: AccountId, message: Schema.String },
  HttpApiSchema.annotations({ status: 404 }),
) {}
```

**v4 change**: `Schema.TaggedError` → `Schema.TaggedErrorClass`.

Do not leak raw infra internals in client-visible messages.
