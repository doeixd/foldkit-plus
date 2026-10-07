# File tree (`foldkit-example-tree`)

A file explorer proving the capability algebra composes: one
`TreeNavigation` placement (arrows, open/close, focus) plus one `Selection`
placement (single-select click) over a shared `Behaviors.Collection`
description — no bespoke tree state machine.

## What it proves

- **One writer per attribute.** `TreeNavigation.behavior` owns keys, focus,
  and the tree ARIA; `Selection.behavior` owns click-to-select and
  `aria-selected`. `Collection.behavior` stays out on purpose: its `id` and
  `aria-disabled` bundles would collide with the navigation's, and the
  resolver refuses the second owner. The descriptor
  (`Behaviors.Collection.of`) is shared; the bundles are not.
- **Placements route; the app decides.** `Bundle.declare` +
  `Parent.assemble` wire both bundles; the app's own `update` adds one rule
  (`CommittedCurrent` selects the focused row — manual selection, the
  WAI-ARIA tree pattern's explicit branch).
- **Keyboard map:** Down/Up move, Right opens (or steps in), Left closes (or
  steps out), Home/End jump, Enter/Space commit the focused row, chevrons
  toggle branches, disabled rows are stepped over and take no click.

## Run it

```bash
pnpm --filter foldkit-example-tree demo   # text trace: closed, open, selected
pnpm --filter foldkit-example-tree typecheck
npx vitest run examples/tree
```

## Files

- `src/app.ts` — static nodes, Model/Message, placements, `update`.
- `src/view.ts` — `TreeSlots`, the three behaviors, the `Tree` SlotView.
- `src/demo.ts` — the headless trace `main.ts` prints.
