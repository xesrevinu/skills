# EventLog Engine Patterns

## Table of Contents

1. Architecture overview
2. Event definitions
3. Journal persistence
4. Sync protocol
5. Encryption and vault
6. Daemon lifecycle
7. Platform adapters
8. Anti-patterns and checklist

## 1) Architecture Overview

EventLog follows a local-first model:

- Client writes events to local SQL journal first.
- Sync daemon pushes local entries and pulls remote changes.
- Server (often Durable Object) assigns remote sequence ordering.
- UI derives state from local journal/projected state.

Conceptual flow:

```text
EventGroup -> EventJournal(local) <-> SyncServer(remote) -> EventLogStates -> UI
```

## 2) Event Definitions

Define events with `Event.make` and include `primaryKey` for conflict grouping.

```typescript
const CreateAccount = Event.make({
  tag: "CreateAccount",
  primaryKey: (payload) => payload.id,
  payload: Schema.Struct({ id: AccountId, name: Schema.String }),
  success: Account,
  error: ValidationError,
});
```

Compose groups with shared error channels:

```typescript
export const AccountEvents = EventGroup.empty
  .add({ tag: "CreateAccount", primaryKey: (p) => p.id, payload: CreatePayload, success: Account })
  .add({ tag: "UpdateAccount", primaryKey: (p) => p.id, payload: UpdatePayload, success: Account })
  .addError(AccountNotFound);
```

## 3) Journal Persistence

Use stable, time-sortable IDs and typed entry schemas.

```typescript
export const EntryId = Schema.Uint8ArrayFromSelf.pipe(Schema.brand("EntryId"));

export class Entry extends Schema.Class<Entry>("Entry")({
  id: EntryId,
  event: Schema.String,
  primaryKey: Schema.String,
  payload: Schema.Uint8ArrayFromSelf,
}) {}
```

Recommended journal API surface:

- `entries`
- `write(entries)`
- `remoteEntries`
- `writeRemote(entries)`
- `lastRemoteSequence`

Use SQL upserts/insert-ignore patterns to avoid duplicates.

## 4) Sync Protocol

Define binary RPCs for write/sync lifecycle.

```typescript
import { Rpc, RpcGroup } from "@effect/rpc";

export class SyncServerRpcs extends RpcGroup.make(
  Rpc.make("Write", {
    payload: Schema.Struct({ data: Schema.Uint8ArrayFromSelf }),
    success: Schema.Struct({
      response: Schema.Uint8ArrayFromSelf,
      changes: Schema.Array(Schema.Uint8ArrayFromSelf),
    }),
    error: SyncServerError,
  }),
  Rpc.make("Destroy", {
    success: Schema.Void,
    error: SyncServerError,
  }),
) {}
```

`DirectMessageHandler` responsibilities:

1. decode incoming local entries
2. assign remote sequence numbers
3. resolve conflicts (usually last-write-wins by `primaryKey`)
4. return server response plus remote changes

## 5) Encryption And Vault

E2E boundary: encrypt on client, decrypt on client.

```typescript
import { Context, Effect } from "effect";

export class EventLogEncryption extends Context.Tag("@xstack/event-log/Encryption")<
  EventLogEncryption,
  {
    readonly encrypt: (data: Uint8Array) => Effect.Effect<Uint8Array>;
    readonly decrypt: (data: Uint8Array) => Effect.Effect<Uint8Array>;
  }
>() {}
```

Vault stores public material and key references only; private keys remain client-side.

## 6) Daemon Lifecycle

Run sync as a managed background fiber.

```typescript
import type { ServicesReturns } from "@xstack/fx/effect";
import { Atom, Context, Effect } from "effect";

export class EventLogDaemon extends Context.Tag("@xstack/event-log/Daemon")<
  EventLogDaemon,
  {
    readonly start: Effect.Effect<void>;
    readonly stop: Effect.Effect<void>;
    readonly status: Atom.Readable<"connected" | "disconnected" | "syncing">;
  }
>() {}
```

Expected behavior:

- reconnect with backoff
- batch local writes
- merge incoming remote entries
- expose readable connection status

## 7) Platform Adapters

Provide platform-specific SQL/socket runtime layers:

- Web main thread: delegates to worker
- Web worker: sqlite-wasm + WebSocket
- React Native: native sqlite + WebSocket
- Server/test: node sqlite implementation

Cloudflare Durable Object commonly hosts sync server runtime for persistent, ordered coordination.

## 8) Anti-Patterns And Checklist

Avoid:

- writing directly to server first
- missing `primaryKey` in event definitions
- storing plaintext with encryption enabled
- UI-thread direct sync orchestration
- manually assigning remote sequence numbers

Checklist:

- [ ] Event definitions include stable `tag` and `primaryKey`
- [ ] EventGroup uses `.add()` and `.addError()`
- [ ] Journal entries use typed IDs and encoded payloads
- [ ] Sync protocol returns remote changes deterministically
- [ ] Encryption layer is wired where required
- [ ] Daemon starts at app bootstrap and handles reconnects
