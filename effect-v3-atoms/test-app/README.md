# Jobs Orchestration Test App

Minimal full-stack demo for the `effect-atoms` skill with advanced concurrency primitives.

## What It Demonstrates

- Backend service with `Queue` worker orchestration
- `Deferred` result waiting (`awaitResult`)
- `Stream` state updates for jobs and events
- Frontend pure client service (no React/DOM)
- Atoms layer bridging service streams/commands to React

## Structure

```text
test-app/
├── server/jobs/
│   ├── schema.ts
│   ├── error.ts
│   ├── service.ts
│   └── rpc-handler.ts
└── client/
    ├── jobs/
    │   ├── schema.ts
    │   ├── error.ts
    │   └── service.ts
    ├── atoms/
    │   └── jobs.ts
    └── components/
        └── JobsPanel.tsx
```

## Architecture Notes

- `server/jobs/service.ts` owns queueing, execution, and completion signaling.
- `client/jobs/service.ts` is transport/business wrapper only.
- `client/atoms/jobs.ts` uses `Stream.unwrap(...)` and command functions.
- `client/components/JobsPanel.tsx` consumes feature hooks only.
