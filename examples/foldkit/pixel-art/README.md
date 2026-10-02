# Pixel Art

PixelForge, a pixel editor: paint with a brush, flood-fill, erase, mirror
strokes horizontally and vertically, pick from five palette themes of sixteen
colors, change the grid size (8, 16, 24 or 32; a painted canvas asks first),
undo and redo by button, keyboard or by clicking a step's thumbnail, and
export a PNG. The canvas survives a reload. It ports Foldkit's
[`examples/pixel-art`](https://github.com/foldkit/foldkit/tree/main/examples/pixel-art)
to Foldkit Plus.

## Who owns what

The Model owns the canvas and its history; `foldkit-primitives`' `History`
supplies the undo steps as pure functions over one field, and localStorage
only remembers the present grid:

```text
mousedown / mouseenter on a cell ─> Message -> update ─> History.push (a stroke is one group) -> Model.history
keydown on document (Ctrl+Z, B, F, E) ─┘          History.undo / redo / goTo ─┘       │
                                                                                      ├─> view (lazy rows) -> Slots <- Style
                                                          CanvasMirror subscription <─┘-> localStorage
localStorage -> flags (CanvasMirror.restore) -> init (Mirror.bootstrap, grid size from the grid)
```

A brush or eraser stroke pushes every cell it paints under one group, so the
whole stroke undoes as one step, where upstream got the same effect by
pushing only on the press.

## Run it

```bash
pnpm --filter foldkit-example-foldkit-pixel-art dev
```

| Concern | Owner | Where |
| --- | --- | --- |
| Tool, color, mirror mode, grid size, hover, the dialogs' state | the Model, plain Foldkit | `src/model.ts`, `src/update.ts` |
| The grid on screen, the undo and redo steps, a stroke as one step, the 50-step limit | `foldkit-primitives/state` `History` (`push` with a `group`, `close`, `undo`, `redo`, and `goTo` for a thumbnail), over `Model.history` | `src/update.ts`, `// HISTORY` |
| Painting, erasing, flood fill, mirroring | upstream's pure `grid.ts`, less its `pushHistory` | `src/grid.ts` |
| The palettes | upstream's `palette.ts`, unchanged | `src/palette.ts` |
| Remembering the canvas, theme and color across reloads | `foldkit-mirror` (`Mirror.kv` over `App.model.history.present` and two fields), read into Flags | `src/mirror.ts`, `src/main.ts` |
| The field references the mirror is declared over | `foldkit-surface` (`Surface.application`) | `src/mirror.ts` |
| Keyboard shortcuts, the end of a stroke | plain Foldkit Subscriptions, as upstream | `src/subscription.ts` |
| PNG export | the `ExportPng` Command, as upstream | `src/command.ts` |
| Radio groups, switches, listbox, dialogs, buttons | `@foldkit/ui`, folded with `Update.foldChild` as upstream | `src/update.ts`, `src/view/` |
| Their look: `Recipes.Button`, `Recipes.Dialog`, and styles over `RadioGroupSlots`, `SwitchSlots` | `foldkit-mixins-ui` | `src/style.ts` |
| Page, toolbar, canvas and history Slots, theme, layout | `foldkit-mixins` | `src/style.ts` |
| Drawing only the rows a change touched, and a panel only when what it reads changed | `foldkit-mixins` `slots.row.lazy` and `SlotView.parts` | `src/view/canvas.ts`, `src/view/view.ts` |

### What is not used, and why

- **`History` as a placed bundle (`history({ name, value })`).** A press
  paints and records in one transition, so `update` calls the pure steps; a
  bundle would need a second Message per stroke cell.
- **`foldkit-primitives/interaction`.** `Targets` reports a press on `click`,
  after the button is released, and painting starts on `mousedown`;
  `PointerDrag` and `Move` drag one item or report deltas. None owns
  press-and-sweep painting, so each cell keeps upstream's `OnMouseDown` and
  `OnMouseEnter`, and the document's `mouseup` ends the stroke.
- **`Mirror.fold` and a restore Message.** Reading the store into Flags, as
  upstream did, and bootstrapping the keys in `init` draws the saved canvas
  in the first frame.
- **`foldkit-durable`, `foldkit-sync`.** The canvas is one device's draft,
  last-write-wins, as upstream's is.
- **`foldkit-bundle`, `foldkit-remote`, `foldkit-agent`, `foldkit-form`.**
  Nothing is placed twice, read from a server, exposed to an agent, or typed
  into a form.

## Differences from upstream

- **Saving.** `SaveCanvas` and `CompletedSaveCanvas` are gone: the mirror
  writes after every change, a stroke as it paints rather than once on
  release. The store holds the mirror's versioned document under upstream's
  key, `pixel-art-canvas`, with the grid, the theme and the color, each only
  when it differs from the default. The grid size is read back from the grid
  instead of being stored beside it. A document upstream's app left reads as
  unreadable and the canvas starts empty. Resizing an empty canvas is now
  remembered too; upstream saved no resize it did not confirm.
- **History.** `Model.grid`, `undoStack` and `redoStack` are
  `Model.history.present`, `past` and `future`, the future with the next redo
  first, so `ClickedRedoStep`'s `stepIndex` counts from the next redo. An
  undo in the middle of a stroke (Ctrl+Z with the button held) makes the
  cells painted after it a step of their own, which clears the redo steps;
  upstream painted them without a step and kept the redo steps.
- **Branching on the tool** goes through `Match` rather than `if`, in
  `update` and the canvas preview.
- **Styling** is `foldkit-mixins` instead of Tailwind and `clsx`: each
  pixel's and swatch's color is a custom property (`--pixel-color`,
  `--swatch-color`) that the cell's rule reads, and a history entry's state is
  `data-entry`. Disabled buttons fade to 40% without also turning their text gray.
- **The benchmark.** `main.bench.ts` is `bench/main.bench.ts`, run by the
  root `pnpm bench`. `comparison.bench.test.ts` is not ported: it times
  `update` against a React reducer in `comparisons/pixel-art-react`, which
  this repository does not have.
- The favicon and social meta tags point at upstream's site and are left out.

## Tests

From the repository root: `npx vitest run examples/foldkit/pixel-art`, and
`npx tsc -b examples/foldkit/pixel-art` to type-check them.

- `test/story.test.ts` and `test/scene.test.ts` are upstream's, with the
  import paths changed, the `SaveCanvas` steps removed, and the grid and its
  stacks read from `history`.
- `test/history.test.ts`: a press after a stroke whose release never arrived
  starts a step of its own, as upstream's does, the 50-step limit, jumping back and forward through the thumbnails,
  a missing step changing nothing, and a stroke leaving every value the
  history panel reads unchanged, so the panel is not drawn per cell.
- `test/mirror.test.ts`: a written canvas loads back, sized by its grid;
  only the present grid is kept; an untouched canvas stores nothing; nothing
  stored, a broken or upstream document, or a malformed grid starts empty.
- `test/view.test.ts` draws every view inert, the Submodels' contents with
  a stand-in for what the component hands them: every element in a Slot,
  only custom properties inline, every token defined; the canvas colors and
  each tool's preview; the history's order, marks and thumbnails; the
  swatches; the error dialog's red title.
- `test/runtime.test.ts` runs the real runtime in jsdom: a stroke undone with
  Ctrl+Z, B, F and E choosing the tool, a canvas kept across a reload, every
  class with its CSS, and a stroke drawing only the rows it paints.
