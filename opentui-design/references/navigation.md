# Multi-Screen Navigation in OpenTUI

Patterns for implementing workspace surfaces, view transitions, and modal management in OpenTUI + React + Effect Atom applications.

## Overview

Navigation in OpenTUI apps uses a layered approach:
- **Workspace Surfaces** — Top-level tabs (e.g., repos, pull requests, issues)
- **Views** — Sub-states within a surface (e.g., queue filtered by type)
- **Full-View Modes** — Expanded detail/diff panes that take over the layout
- **Modals** — Overlay dialogs that capture input focus

## Workspace Surfaces

### Defining Surfaces

```typescript
export const workspaceSurfaces = ["repos", "pullRequests", "issues"] as const
export type WorkspaceSurface = (typeof workspaceSurfaces)[number]

// Active surface atom
export const workspaceSurfaceAtom = Atom.make<WorkspaceSurface>("pullRequests")
```

### Surface Rendering

```tsx
const App = () => {
  const surface = useAtomValue(workspaceSurfaceAtom)
  const { width, height } = useTerminalDimensions()

  return (
    <box width={width} height={height} flexDirection="column">
      <WorkspaceTabs activeSurface={surface} />

      {surface === "repos" && <RepoWorkspace {...layoutProps} />}
      {surface === "pullRequests" && <PullRequestWorkspace {...layoutProps} />}
      {surface === "issues" && <IssuesWorkspace {...layoutProps} />}

      <FooterHints surface={surface} />
    </box>
  )
}
```

### Surface Navigation via Keymap

```typescript
const surfaceKeymap = App(
  { id: "surface.repos", keys: ["1"], run: (ctx) => ctx.setSurface("repos") },
  { id: "surface.prs", keys: ["2"], run: (ctx) => ctx.setSurface("pullRequests") },
  { id: "surface.issues", keys: ["3"], run: (ctx) => ctx.setSurface("issues") },
  { id: "surface.next", keys: ["tab"], run: (ctx) => ctx.nextSurface() },
  { id: "surface.prev", keys: ["shift+tab"], run: (ctx) => ctx.prevSurface() },
)
```

## Views (Sub-States)

Views represent different data filters within a surface.

```typescript
// View type with tagged enum
export type PullRequestView = Data.TaggedEnum<{
  Queue: { queue: "authored" | "review" | "assigned" | "mentioned"; repo?: string }
  Repository: { owner: string; name: string }
}>

export const activeViewAtom = Atom.make<PullRequestView>(
  PullRequestView.Queue({ queue: "authored" })
)
```

### Reactive Data Fetching on View Change

```typescript
// This atom re-evaluates whenever activeViewAtom changes
export const pullRequestsAtom = appRuntime
  .atom(
    Effect.fnUntraced(function* (get) {
      const api = yield* ApiService
      const view = get(activeViewAtom) // reactive dependency
      return yield* api.fetchPullRequests(view)
    }),
  )
  .pipe(Atom.keepAlive)
```

## Full-View Modes

Full-view modes expand a pane to take over the entire layout.

```typescript
// Boolean atoms for full-view states
export const detailFullViewAtom = Atom.make(false)
export const diffFullViewAtom = Atom.make(false)
export const commentsViewActiveAtom = Atom.make(false)
```

### Rendering with Full-View Priority

```tsx
const PullRequestWorkspace = ({ width, height }: LayoutProps) => {
  const isDetailFull = useAtomValue(detailFullViewAtom)
  const isDiffFull = useAtomValue(diffFullViewAtom)

  if (isDiffFull) {
    return <DiffPane width={width} height={height} />
  }

  if (isDetailFull) {
    return <DetailPane width={width} height={height} />
  }

  // Default: split pane layout
  return (
    <SplitPane
      height={height}
      leftWidth={Math.floor(width * 0.4)}
      rightWidth={width - Math.floor(width * 0.4) - 1}
      left={<PullRequestList />}
      right={<DetailPane />}
    />
  )
}
```

### Keymap Scoping for Full-View

```typescript
// Diff view keys only active when diff is full-screen and no modal
diffViewKeymap.scope((ctx) => ctx.diffFullView && !modalActive(ctx) && ctx.diff),

// Detail view keys only active when detail is full-screen and no modal
detailViewKeymap.scope((ctx) => ctx.detailFullView && !modalActive(ctx) && ctx.detail),
```

## Modal System

### Modal State with Tagged Enum

```typescript
import { Data } from "effect"

export type Modal = Data.TaggedEnum<{
  None: {}
  Close: { itemId: string; itemTitle: string }
  Merge: { prId: string; methods: string[]; selectedMethod: number }
  Label: { itemId: string; labels: Label[]; selected: Set<string> }
  Comment: { itemId: string; body: string }
  Filter: { query: string; results: FilterResult[] }
  Confirm: { title: string; message: string; onConfirm: () => void }
}>

export const Modal = Data.taggedEnum<Modal>()
export const activeModalAtom = Atom.make<Modal>(Modal.None())
```

### Opening and Closing Modals

```typescript
// Open a modal
const openMergeModal = () => {
  setActiveModal(Modal.Merge({
    prId: selectedPr.id,
    methods: ["merge", "squash", "rebase"],
    selectedMethod: 0,
  }))
}

// Close modal (reset to None)
const closeModal = () => setActiveModal(Modal.None())
```

### Modal Rendering

```tsx
const ModalLayer = ({ modal }: { modal: Modal }) => {
  switch (modal._tag) {
    case "None": return null
    case "Close": return <CloseModal {...modal} />
    case "Merge": return <MergeModal {...modal} />
    case "Label": return <LabelModal {...modal} />
    case "Filter": return <FilterModal {...modal} />
    case "Confirm": return <ConfirmModal {...modal} />
    default: return null
  }
}
```

### Modal Keymap Scoping

Modals capture all input — their keymaps are checked first:

```typescript
export const appKeymap = App(
  // Global (always active)
  { id: "command.open", keys: ["ctrl+p"], run: (ctx) => ctx.openCommandPalette() },

  // Modals (exclusive — first match wins)
  closeModalKeymap.scope((ctx) => ctx.activeModal._tag === "Close" && ctx.closeCtx),
  mergeModalKeymap.scope((ctx) => ctx.activeModal._tag === "Merge" && ctx.mergeCtx),
  labelModalKeymap.scope((ctx) => ctx.activeModal._tag === "Label" && ctx.labelCtx),

  // Everything below is blocked when a modal is active
  listNavKeymap.scope((ctx) => ctx.activeModal._tag === "None" && ctx.listCtx),
)
```

## Best Practices

1. **Single source of truth** — One atom per navigation dimension (surface, view, modal)
2. **Tagged enums for modals** — Type-safe, exhaustive matching, carries state
3. **Keymap scoping for exclusivity** — Modals block all other keymaps
4. **Reactive data fetching** — Atoms that depend on view atoms auto-refresh on navigation
5. **Full-view as boolean atoms** — Simple toggle, easy to scope keymaps against
6. **Preserve state on navigation** — Use `Atom.keepAlive` for data that should survive surface switches
