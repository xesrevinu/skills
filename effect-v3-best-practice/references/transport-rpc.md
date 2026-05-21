# Transport RPC Reference

## Table of Contents

1. Contract definition
2. Handler implementation
3. Group composition
4. Thin-handler checklist

## 1) Contract Definition

Use `@effect/rpc` as the primary transport.

```typescript
import type { RpcGroupHandlesReturns, RpcGroupMethods } from "@xstack/fx/rpc";
import * as Rpc from "@effect/rpc/Rpc";
import * as RpcGroup from "@effect/rpc/RpcGroup";

export class AccountRpcGroup extends RpcGroup.make(
  Rpc.make("list", {
    success: Schema.Struct({ accounts: Schema.Array(Account) }),
  }),
  Rpc.make("getById", {
    success: Account,
    error: AccountNotFound,
  }).setPayload(Schema.Struct({ id: AccountId })),
  Rpc.make("create", {
    payload: CreateAccountInput,
    success: Account,
    error: Schema.Union(ValidationError, PersistenceError),
  }),
).prefix("accounts.") {}

export declare namespace AccountRpcGroup {
  export type Methods = RpcGroupMethods<typeof AccountRpcGroup>;
  export type Returns<key extends keyof Methods, R = never> = RpcGroupHandlesReturns<Methods[key], R>;
}
```

Guidelines:

- Define payload/success/error in contract types, not handlers.
- Use a stable namespace prefix (`accounts.`, `users.`, ...).
- Keep method tags durable; treat renames as migration events.

## 2) Handler Implementation

Handlers adapt transport to services. Keep them small.

```typescript
import { Effect } from "effect";

import { AccountRpcGroup } from "../rpc/schema";
import { AccountService } from "./account-service";

export const AccountRpcHandlers = AccountRpcGroup.toLayer(
  Effect.gen(function* () {
    const accountService = yield* AccountService;

    const list: AccountRpcGroup.Methods["accounts.list"] = Effect.fn("accounts.list")(
      function* (): AccountRpcGroup.Returns<"accounts.list"> {
        const accounts = yield* accountService.findAll();
        return { accounts };
      },
    );

    const getById: AccountRpcGroup.Methods["accounts.getById"] = Effect.fn("accounts.getById")(function* ({
      id,
    }): AccountRpcGroup.Returns<"accounts.getById"> {
      return yield* accountService.findById(id);
    });

    const create: AccountRpcGroup.Methods["accounts.create"] = Effect.fn("accounts.create")(
      function* (input): AccountRpcGroup.Returns<"accounts.create"> {
        return yield* accountService.create(input);
      },
    );

    return AccountRpcGroup.of({
      "accounts.list": list,
      "accounts.getById": getById,
      "accounts.create": create,
    });
  }),
);
```

Notes:

- Use `Group.Methods` / `Group.Returns` from the group namespace.
- Pass `Scope.Scope` as `R` when handlers register finalizers.
- Use `Effect.orDie` only when service errors are not part of the RPC contract.

## 3) Group Composition

Compose all contracts and handler layers at the app root.

```typescript
export const AllRpcGroup = AccountRpcGroup.merge(UserRpcGroup, OrderRpcGroup);

export const RpcServerHandlers = Layer.mergeAll(AccountRpcHandlers, UserRpcHandlers, OrderRpcHandlers);

const RpcLayer = RpcServer.layer(AllRpcGroup).pipe(Layer.provide(RpcServerHandlers), Layer.provide(ServiceLive));
```

## 4) Thin-Handler Checklist

For each handler:

- Parse/validate transport payload with schema-defined contract.
- Call exactly one service entry point where possible.
- Map response shape only when required by contract.
- Keep domain branching, SQL, and policy rules in service layer.
- Keep handler error channel typed and explicit.
