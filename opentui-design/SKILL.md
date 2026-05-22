---
name: opentui-design
description: "Toolkit for CLI applications with OpenTUI, React, Effect v4, and Effect Atom. Use when building CLI screens/components, implementing state with atoms, debugging input handling, implementing screen navigation, or optimizing CLI performance."
---

# OpenTUI Design Skill

## Tech Stack

- `@opentui/core` + `@opentui/react` — terminal renderer + React bindings
- `effect/unstable/reactivity/Atom` + `@effect/atom-react` — reactive state with service integration
- Effect v4 `Context.Service` + `Layer` — dependency injection
- Bun + TypeScript + ESM

## References

| File | Covers |
|------|--------|
| `design-language.md` | Visual design principles, color architecture, typography hierarchy, layout rules, box-drawing, interaction feedback, modal design |
| `state-management.md` | Atom.make, Atom.runtime, derived atoms, action atoms, React hooks (useAtom, useAtomValue, useAtomSet, useAtomRefresh), custom hooks |
| `component-patterns.md` | Component categories, layout primitives, responsive breakpoints, split pane, text truncation |
| `input-handling.md` | Three-layer keyboard architecture, keymap system, scoped composition, key propagation |
| `navigation.md` | Workspace surfaces, views (tagged enum), full-view modes, modal system |
| `performance.md` | Atom granularity, render minimization, list virtualization, debounce, caching |
| `gotchas.md` | Common pitfalls: mouse trade-offs, Atom.keepAlive, focus, box sizing, string width |
| `testing.md` | Atom unit tests, service mocking with Layers, keymap pure dispatch, component tests |

## Key Reminders

**Design**
- Warm minimalism — amber/gold accents on deep slate, not cold blue-gray
- Every character cell earns its place — density through color hierarchy, not whitespace
- Colors are semantic: green=pass, red=fail, amber=pending, muted=secondary
- Typography hierarchy via color+weight only: accent+bold > text+bold > text > muted > separator
- Box-drawing junctions must align precisely (`├┤┬┴┼`) — misalignment looks amateur
- Three-tier selection: transparent → hover (38% blend) → selected (full bg)

**Architecture**
- JSX primitives are **lowercase**: `<box>`, `<text>`, `<span>`, `<scrollbox>`
- State lives in **atoms**, not component state — atoms are module-level constants
- Services accessed via `Atom.runtime(Layer)` → `appRuntime.atom()` / `appRuntime.fn()`
- Input uses **three-layer** architecture: OpenTUI → adapter → data-driven keymap
- Navigation: workspace surfaces (tabs) + view atoms (data filter) + modal tagged enum
- Mouse: `useMouse: false` for OS copy; `true` for clicks/scroll — cannot have both
- Always use `string-width` for text measurement in terminal layouts
