# Review Checklist

Use this checklist before final delivery.

## 1) Layer Boundaries

- Backend still follows `schema.ts`, `errors.ts`, `service.ts`, and `rpc-handler.ts` when the feature changes server behavior.
- Frontend transport and workflow logic lives in `apps/web/services/<domain>/`.
- Atoms only orchestrate state, commands, browser APIs, and calls to web services.
- Components only consume atoms or features.

## 2) Transport Contracts

- Request and response types come from shared schema or RPC contracts.
- No duplicate handwritten payload interfaces in atoms or components.
- Contract changes should break the service compile step rather than drift silently in UI code.

## 3) Error Discipline

- Domain and service errors stay typed.
- Services use `mapServiceError` or `mapTransportError` intentionally.
- RPC handlers preserve expected typed errors.
- No `Effect.orDie` for business or domain failure paths.

## 4) Atom Correctness

- Writes that affect reads call `ctx.refresh(...)` for impacted atoms.
- Local UI state transitions use `ctx.set(...)` predictably.
- Long-lived or shared loader atoms use `Atom.keepAlive` where appropriate.
- Families use stable keys.

## 5) Side-Effect Hygiene

- Timers, subscriptions, and browser APIs live in atoms or components, never services.
- Polling atoms register finalizers and clear intervals or listeners.
- Refresh loops reuse existing loader atoms instead of duplicating transport calls.

## 6) State Transition Integrity

- Transitions update derived fields consistently, such as timestamps, counters, and selection state.
- Reverting status clears fields that are no longer valid.
- Invalidated selections are sanitized after refreshes.

## 7) Quick Spot Checks

- Search for direct RPC in atoms (`RpcClient`, raw rpc calls) and remove it.
- Search for React or browser APIs in `apps/web/services/**` and move them out.
- Verify one end-to-end path (backend -> web service -> atoms -> component).

## 8) Skill Context Budget

- Run `python3 /Users/kee/.agents/skills/skill-creator/scripts/audit_skills.py /Users/kee/.agents/skills`.
- Ensure no token budget warning for `effect-atoms`.
- If needed, tune budgets with env vars:
  - `SKILL_MD_TOKEN_BUDGET` (default: `2500`)
  - `SKILL_TOTAL_DOC_TOKEN_BUDGET` (default: `8000`)
