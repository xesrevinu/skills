---
name: effect-v3-best-practices
description: Apply Effect(v3) best practices across domain schemas, service layers, typed transport contracts, database access, Use when implementing or refactoring end-to-end Effect application architecture.
---

# Effect Best Practices Skill

Authoritative workflow for Effect best practices with progressive disclosure.5

## Core Rules

1. Keep business logic in services; keep handlers and UI thin.
2. Keep transport schema-first and fully typed.
3. Use `Schema.TaggedError` for domain failures; avoid global `Error`.
4. Use `Schema.Class` and `.make()`; avoid `new`.
5. Use Effect schema APIs (`decodeUnknown`), not sync throwers.
6. Avoid `catchAll` when error type is `never`.
7. Avoid `*FromSelf` schemas in domain models.
8. Prefer `Context.Tag` over `Effect.Service` for services.
9. Avoid barrel files (`index.ts`) in domain modules.
10. Keep raw SQL inside repos/services, never inside handlers or UI.
11. Never use `try-catch` inside `Effect.gen`; use Effect error combinators.
12. For terminal failure/interrupt branches in `Effect.gen`, use `return yield*`.

## Read This Skill Efficiently

Start here, then load only the reference file needed for the task:

- Domain modeling, schema, errors, services, layers, Option, equality, logging -> `references/core-modeling.md`
- RPC contracts and handlers -> `references/transport-rpc.md`
- SQL, SqlSchema, Kysely, backend->frontend error encoding -> `references/database-and-errors.md`
- Error construction, recovery, testing, and forbidden patterns -> `references/error-handling.md`
- Testing, delivery sequence, checklist, anti-patterns, output contract -> `references/testing-and-delivery.md`

## Default Delivery Order

1. Model entities, inputs, outputs, and explicit error types in domain modules.
2. Implement service methods with typed error channels.
3. Define RPC contracts and keep handlers as adapter-only glue.
4. Implement repository/database logic and wire layers at app roots.
5. Add tests with `it.effect()` and validate error round-trip behavior.

## Layer Map

- `domain`: schema classes, value objects, tagged errors, services, repositories
- `transport`: RPC contracts, handlers, middleware wiring
- `database`: SqlSchema/Kysely query modules and persistence mapping
- `frontend-state`: atoms, commands, form adapters
- `frontend-view`: components/pages rendering state transitions

## Related Skills

- `eventlog-local-first` for local-first sync architecture and conflict resolution
- `cloudflare-workers` for Cloudflare runtime, Durable Objects, queues, cron
- `otel-fullstack` for browser/worker/server telemetry integration
