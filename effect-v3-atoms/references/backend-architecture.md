# Backend Architecture Reference

This file defines backend delivery order for effect-atoms tasks.
For deep Effect design guidance (error categories, testing strategy, advanced layering), use `effect-best-practice`.

## Delivery Order

1. `schema.ts` (schema classes)
2. `error.ts` (typed tagged errors)
3. `service.ts` (Context.Tag + methods)
4. `rpc-handler.ts` or `api.ts` (thin transport adapter)

## Domain and Error Contracts

```typescript
// schema.ts
export class AgentAlertConfig extends Schema.Class<AgentAlertConfig>("AgentAlertConfig")({
  failedCountThreshold: Schema.Number,
  cooldownMs: Schema.Number,
}) {}

// errors.ts
export class AgentAlertError extends Schema.TaggedError<AgentAlertError>()("AgentAlertError", {
  message: Schema.String,
}) {}
```

- Keep domain schemas safe for frontend imports.
- Keep error payloads serializable across RPC.

## Service Skeleton

```typescript
import type { ServicesReturns } from "@xstack/fx/effect";

export class AgentAlerts extends Context.Tag("agent/AgentAlerts")<
  AgentAlerts,
  {
    readonly getConfig: () => Effect.Effect<AgentAlertConfig>;
    readonly updateConfig: (patch: Partial<typeof AgentAlertConfig.Type>) => Effect.Effect<void, AgentAlertError>;
  }
>() {}

export declare namespace AgentAlerts {
  export type Methods = Context.Tag.Service<AgentAlerts>;
  export type Returns<Key extends keyof Methods> = ServicesReturns<Methods[Key]>;
}

export const AgentAlertsLive = Layer.effect(
  AgentAlerts,
  Effect.gen(function* () {
    const configRef = yield* Ref.make(AgentAlertConfig.make({ failedCountThreshold: 3, cooldownMs: 60_000 }));

    const getConfig: AgentAlerts.Methods["getConfig"] = Effect.fn("agent.alerts.getConfig")(
      function* (): AgentAlerts.Returns<"getConfig"> {
        return yield* Ref.get(configRef);
      },
    );

    const updateConfig: AgentAlerts.Methods["updateConfig"] = Effect.fn("agent.alerts.updateConfig")(
      function* (patch): AgentAlerts.Returns<"updateConfig"> {
        yield* Ref.update(configRef, (c) => AgentAlertConfig.make({ ...c, ...patch }));
      },
    );

    return { getConfig, updateConfig };
  }),
);
```

## Checklist

- Service methods are all named with `Effect.fn('...')`.
- `Methods`/`Returns` helper types exist and are used in implementation signatures.
- No browser API in backend service.
- Input schemas validate at handler boundary.
