# Frontend Web Service Reference

This file focuses on boundary rules for `apps/web/services/<domain>/`.
For general Effect patterns such as error taxonomy, layer composition, and testing style, use `effect-best-practice`.

## Core Contract

- Service is the frontend transport and business boundary for a feature.
- Service has no React, DOM, or browser runtime dependencies.
- Service is the only frontend layer allowed to call `RpcClient`.
- Atoms call service methods, never raw transport clients.
- Request and response types come from RPC contracts or shared schema exports, not duplicated interfaces.

## Minimal Pattern

```typescript
import type { RepoRpcGroup } from '@moo/core/rpc/schema'
import type { ServicesReturns } from '@xstack/fx/effect'

import * as Context from 'effect/Context'
import * as Effect from 'effect/Effect'
import * as Layer from 'effect/Layer'

import { RpcClient } from '../rpc/client'
import { mapServiceError, ServiceRequestError } from '../service-error'

type RepoVersionInput = Parameters<RepoRpcGroup.Methods['repos.getVersion']>[0]

export class ReposService extends Context.Tag('@moo/web/service/repos')<
  ReposService,
  {
    readonly version: (payload: RepoVersionInput) => Effect.Effect<{ readonly version: string }, ServiceRequestError>
  }
>() {}

export declare namespace ReposService {
  export type Methods = Context.Tag.Service<ReposService>
  export type Returns<Key extends keyof Methods, R = never> = ServicesReturns<Methods[Key], R>
}

export const ReposServiceLayer = Layer.effect(
  ReposService,
  Effect.gen(function* () {
    const client = yield* RpcClient

    return ReposService.of({
      version: ({ repoId }) => mapServiceError('repos', 'getVersion')(client('repos.getVersion', { repoId })),
    })
  }),
)

export const ReposServiceLive = ReposServiceLayer.pipe(Layer.provide(RpcClient.layer))
```

## When to Add Extra Service Files

- Add `schema.ts` when the service owns frontend-facing state or result shapes.
- Add `error.ts` when the service exposes typed domain or workflow failures beyond transport errors.
- Add `view-model.ts` when atoms, components, and tests share derivation logic.
- Keep helpers beside the service domain, not inside components.

## Transport Type Discipline

```typescript
import type { ProcessRpcGroup } from '@moo/core/rpc/schema'

type SpawnProcessInput = Parameters<ProcessRpcGroup.Methods['process.spawn']>[0]
type KillProcessInput = Parameters<ProcessRpcGroup.Methods['process.kill']>[0]
```

- Prefer deriving payload and response types from RPC contracts or shared schema exports.
- Keep a single source of truth for optional fields, tags, and naming.
- If the frontend needs reshaped data, derive it in service helpers instead of copying transport types into atoms.

## Error Mapping Pattern

```typescript
const runSync = Effect.fn('sync-service.runSync')(function* (payload): SyncService.Returns<'runSync'> {
  return yield* mapTransportError('sync', 'runSync')(client('sync.sync', payload))
})
```

- Use `mapServiceError` when every failure becomes a single frontend transport error.
- Use `mapTransportError` when you need to preserve typed RPC business errors and only normalize raw client failures.
- Keep error mapping inside services so atoms can work with stable frontend error types.

## Allowed vs Forbidden

### Allowed in service

```typescript
const list = Effect.fn('repos.list')(function* (): ReposService.Returns<'list'> {
  return yield* mapServiceError('repos', 'list')(client('repos.list', undefined))
})
```

### Forbidden in service

```typescript
useState(null)
document.getElementById('x')
window.setInterval(() => {})
ctx.refresh(someAtom)
```

## Delivery Checks

- `apps/web/services/**` owns all `RpcClient` usage.
- Service methods are wrapped with `Effect.fn('...')` names when they contain meaningful workflow steps.
- Service signatures expose typed error channels for expected failures.
- `*ServiceLive` provides `RpcClient.layer`.
- Shared derivation helpers live under the same service domain instead of components or atoms.
