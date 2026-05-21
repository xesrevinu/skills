---
name: effect-v3-atoms
description: Complete Effect(v3) architecture from backend/domain layers to `apps/web/services` + `apps/web/atoms` + React. Use when implementing or refactoring features to follow the current service-first atom pattern.
---

# Effect-Atoms Full-Stack Architecture Skill

Authoritative workflow for Effect-based full-stack development with progressive disclosure.

Scope note: this skill is for full-stack layering and boundary rules. Reuse `effect-best-practice` for generic Effect modeling/testing patterns instead of duplicating them here.

## Core Rules

1. **Backend first when needed**: If the feature changes server contracts or models, implement backend domain/service/API before frontend wiring.
2. **Web service first on frontend**: In the current frontend pattern, put transport and business logic in `apps/web/services/<domain>/` before touching atoms.
3. **Pure service boundary**: Web services have no React or DOM dependencies.
4. **Clear separation**: Transport and data shaping live in services, UI orchestration lives in atoms, rendering lives in components.
5. **Type safety**: Use `Methods` and `Returns` helpers for services.
6. **Observability**: Use `Effect.fn('name')` for traced service and command methods.
7. **Explicit refresh**: Use `ctx.refresh(atom)` after writes that change read models.
8. **Keep long-lived state alive**: Use `Atom.keepAlive` for cached loaders, selections, and shared derived atoms.
9. **Families for keyed state**: Use `runtime.family` with stable keys (`Data.struct`, ids, etc.) for request-scoped atoms.
10. **Browser APIs stay in atoms**: Keep DOM, URL, File, timers, and other browser runtime APIs out of services.
11. **No direct RPC in atoms**: Atoms call web services only; `RpcClient` stays in `apps/web/services/**`.
12. **No handwritten transport payloads**: Derive request and response types from RPC contracts or shared schemas.
13. **Shared derivation helpers live beside services**: Put `schema.ts`, `error.ts`, and `view-model.ts` in the service domain when atoms and components share logic.
14. **Compose layers at the feature boundary**: Prefer `provide: SomeServiceLive`; use `Layer.mergeAll(...)` only when a feature truly depends on multiple services.
15. **No `orDie` in expected failures**: Preserve typed error channels in handlers for business and domain errors.
16. **State transition correctness**: When status changes, update or clear derived fields explicitly.

## Read This Skill Efficiently

Start here, then load only the reference file needed for the task:

- Backend domain, service, RPC or HTTP patterns -> `references/backend-architecture.md`
- Frontend web services, transport mapping, shared helpers -> `references/frontend-service.md`
- Atoms, defineFeature, families, polling, React integration -> `references/atoms-and-react.md`
- Final self-check before delivery -> `references/review-checklist.md`

## Default Delivery Order

### Phase 1: Backend (apps/server/<domain>/)

1. Define domain models with `Schema.Class` (`schema.ts`)
2. Define typed errors with `Schema.TaggedError` (`errors.ts`)
3. Implement service with `Context.Tag` and `Effect.fn` (`service.ts`)
4. Define RPC or HTTP handlers (`rpc-handler.ts` or `api.ts`)

### Phase 2: Frontend Web Services (apps/web/services/<domain>/)

5. Derive request and response aliases from RPC contracts or shared models
6. Define service-local schemas, errors, and helpers (`schema.ts`, `error.ts`, `view-model.ts`) when needed
7. Implement `Context.Tag` service in `<domain>-service.ts`
8. Export `<Domain>ServiceLive` by providing `RpcClient.layer`

### Phase 3: Atoms Connection (apps/web/atoms/)

9. Create feature wrapper with `defineFeature` (`<domain>.ts`)
10. Wire `tags` and `provide` to one or more web services
11. Create loader and derived atoms with `runtime.atom()` and `Atom.make(...)`
12. Create commands with `runtime.fn()` and `ctx.refresh(...)` or `ctx.set(...)`
13. Handle browser APIs, intervals, and cleanup with atom finalizers when needed

### Phase 4: React Components

14. Consume features via `feature.useHooks()`
15. Subscribe to state with `atom.useValue()`
16. Call commands with `fn.promise()`

## Quality Gate Before Delivery

1. Verify atoms do not import or call `RpcClient` directly.
2. Verify web service payload types come from schemas or contracts, not duplicated interfaces.
3. Verify services map transport failures with shared helpers such as `mapServiceError` or `mapTransportError` when applicable.
4. Verify RPC handlers keep typed errors for expected failures (no `orDie` shortcut).
5. Verify write commands refresh affected read atoms.
6. Verify timers and polling atoms register finalizers and do not leak intervals.
7. Verify status transitions update related derived fields such as timestamps and counters.

## Layer Map

- **Backend domain**: `Schema.Class` entities, `Schema.TaggedError` errors, `Context.Tag` services
- **Backend transport**: RPC contracts, HTTP endpoints, middleware
- **Frontend web service**: `apps/web/services/**` `Context.Tag` services, RPC mapping, service-local schemas and helpers
- **Frontend atoms**: `apps/web/atoms/**` `defineFeature` wrappers, reactive state, browser APIs, timers
- **Frontend view**: React components consuming features via hooks

## File Structure

### Backend (apps/server/<domain>/)

```text
<domain>/
|-- schema.ts                  # Schema.Class domain models
|-- errors.ts                  # Schema.TaggedError errors
|-- service.ts                 # Context.Tag service with Effect.fn methods
|-- repo.ts (optional)         # Database access
`-- rpc-handler.ts or api.ts   # RPC or HTTP handlers
```

### Frontend (apps/web/)

```text
services/
`-- <domain>/
    |-- <domain>-service.ts      # Context.Tag service + Layer.effect + Live layer
    |-- schema.ts (optional)     # Service-local view/data shaping helpers
    |-- error.ts (optional)      # Domain or service errors exposed upward
    `-- view-model.ts (optional) # Shared derivations used by atoms, components, tests

atoms/
`-- <domain>.ts                  # defineFeature wrapper + atom and fn wiring
```

## Related Skills

- `effect-best-practices` for domain/service/transport layering and error handling
