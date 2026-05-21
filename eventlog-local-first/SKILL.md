---
name: eventlog-local-first
description: Implement and maintain the EventLog local-first sync engine with event groups, offline journal persistence, E2E-encrypted replication, daemon lifecycle, and conflict resolution. Use when building or debugging local-first sync behavior.
---

# EventLog / Local-First Skill

Patterns for EventLog local-first sync with progressive disclosure.

## Core Rules

1. Write locally first, then replicate; never bypass the local journal.
2. Define each event with a stable `tag` and conflict `primaryKey`.
3. Keep payloads schema-validated and encoded for durable storage.
4. Let server assign remote sequence numbers; clients do not own ordering.
5. Keep E2E encryption boundaries strict: server never sees plaintext.
6. Run sync in daemon/background fibers, not on UI request paths.

## Read This Skill Efficiently

Load only what the task needs:

- Architecture, event schema, journal, sync protocol -> `references/engine-patterns.md`
- Encryption, vault, daemon, and platform adapters -> `references/engine-patterns.md`
- Failure modes, anti-patterns, and readiness checklist -> `references/engine-patterns.md`

## Default Delivery Order

1. Define events and EventGroup contracts (payload, success, error, primary key).
2. Implement journal persistence and remote-sequence aware sync writes.
3. Implement sync transport handlers and conflict resolution strategy.
4. Wire encryption and key management layers.
5. Start daemon lifecycle at app bootstrap and track status in state.

## Related Skills

- `cloudflare-workers` for DO runtime, queue, cron, and worker composition
- `effect-best-practices` for domain/service/transport layering
- `otel-fullstack` for telemetry across client/worker/server sync paths
