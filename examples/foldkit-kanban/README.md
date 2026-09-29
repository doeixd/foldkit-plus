# Kanban

A board of three columns of cards. Drag a card with the pointer to reorder it
or move it to another column. From the keyboard, Space or Enter picks a
focused card up, the arrows move it within its column, Tab and Shift+Tab move
it between columns, Space or Enter drops it, and Escape puts it back. Screen
readers hear each keyboard move and every drop or cancel. Each column can add
a card, and the board survives a reload through localStorage. It ports Foldkit's
[`examples/kanban`](https://github.com/foldkit/foldkit/tree/main/examples/kanban)
to Foldkit Plus, with upstream's Model, Messages, `update` and domain modules,
less the Command that saved the board.

## Who owns what

The Model owns the columns. `@foldkit/ui`'s DragAndDrop owns the drag, as a
Submodel in `model.dragAndDrop`: it reports a finished drag to `update` as a
`Reordered` OutMessage, and `update` moves the card. localStorage only
remembers the columns:

```text
pointer / keys -> DragAndDrop (Submodel) -> Reordered -> update (Column.reorder) -> Model.columns
Model.columns -> BoardMirror subscription -> localStorage
localStorage -> flags (BoardMirror.restore) -> init (Mirror.bootstrap) -> Model.columns
```

Upstream returned a `SaveBoard` Command from each branch that changed the
columns. Here `update` only changes the Model, and a `foldkit-mirror`
key-value mirror writes the store whenever the columns change. The store is
still read into Flags, as upstream read it, and `init` bootstraps the stored
keys into the first Model, so the first frame shows the saved
board. Writing is last-write-wins: two tabs do not merge their boards, as
upstream's did not.

## Run it

```bash
pnpm --filter foldkit-example-foldkit-kanban dev
```

From the repository root, `npx vitest run examples/foldkit-kanban` runs the
tests and `npx tsc -b examples/foldkit-kanban` type-checks them.

## What owns what

| Concern | Owner | Where |
| --- | --- | --- |
| The columns and cards, the add-card form, the announcement | the Model, changed only by `update` | `src/model.ts`, `src/update.ts` |
| Card order by fractional keys, moving a card between columns | upstream's pure domain modules, unchanged | `src/domain/`, `src/constant.ts` |
| Pointer and keyboard dragging, drop placement, the ghost, auto-scroll, focus after a move | `@foldkit/ui` DragAndDrop, as upstream | `src/update.ts`, `src/subscription.ts`, `src/view/` |
| Remembering the columns across reloads | `foldkit-mirror` (`Mirror.kv` over `App.model.columns`) | `src/mirror.ts`, `src/subscription.ts`, `src/main.ts` `// FLAGS` |
| The field reference the mirror is declared over | `foldkit-surface` (`Surface.application`) | `src/mirror.ts` |
| A new card's id, focusing the title field | Commands, as upstream | `src/command.ts` |
| The accessible buttons and title field | `@foldkit/ui` Button and Input | `src/view/column.ts` |
| Their look: `Recipes.Button`, `Recipes.Input` | `foldkit-mixins-ui` | `src/style.ts` |
| The board's Slots, theme and layout; a carried card and a drop target as `data-state` with `Style.states` | `foldkit-mixins` | `src/style.ts`, `src/view/` |

## What is not used, and why

- **`foldkit-primitives/interaction` `PointerDrag`** reports which marked item
  the pointer is over, and whether before, inside or after it. It has no
  keyboard way to drag ("give the keyboard its own way"), no ghost, and no
  auto-scroll. Using it would mean writing again what DragAndDrop already
  does here: the insertion index within a column, keyboard pick-up and moves
  between columns, focus after each move, and the ARIA roles. `Move`,
  `Targets` and the keyboard-navigation Behaviors cover parts of the same
  thing. None of them owns a sortable list across containers. DragAndDrop
  does, so it stays.
- **`LiveAnnounce`** would own the live-region text, but it waits a debounce
  before reading and clears the text after a delay, through two extra
  Messages and two timers. Upstream derives the announcement in the same
  transition as the drag step it describes, and keeps it until the next one.
  Plain Model text keeps that behaviour.
- **`foldkit-bundle`**: per-card and per-column state here is derived from
  the one drag state, not kept per key. Nothing is placed twice.
- **`foldkit-sync`, `foldkit-remote`, `foldkit-agent`**: the board lives on
  one device and is last-write-wins. Nothing is read from a server or exposed
  to an agent.

## Differences from upstream

- `SaveBoard` and `CompletedSaveBoard` are gone: the mirror writes, and
  absorbs a failed write, as upstream's `SaveBoard` did.
- The store holds the mirror's versioned document under the same key,
  `kanban-board` (`{"version":1,"keys":{"columns":"[…]"}}`), not upstream's
  `{"columns":[…]}`. A board saved by upstream's app on the same origin reads
  as unreadable and gives the sample board. A board equal to the sample board
  is not stored.
- A DragAndDrop step that leaves the drag unchanged (an auto-scroll frame,
  sent on every animation frame of a pointer drag) returns the Model it was
  given. Upstream wrote the child back into a new Model each time, so the
  whole board was redrawn every frame.
- The card style for a pointer-carried card is not kept. That card is never
  drawn in a list (the ghost carries it), so upstream's classes for it never
  showed.
- A pointer drop lands where the last pointer move found it, as in
  DragAndDrop itself. Nothing else changes the columns during a drag, so the
  stored place is still right when the pointer is released.
- Styling is `foldkit-mixins` instead of Tailwind.

## Tests

- `test/story.test.ts` and `test/scene.test.ts` are upstream's, with the
  import paths changed and the `SaveBoard` steps removed.
- `test/update.test.ts`: each announcement (pick up, move to another column,
  move within one, drop, cancel), and a DragAndDrop no-op keeping the Model's
  identity.
- `test/view.test.ts` draws the board inert: every element in a Slot at rest,
  while adding a card, and during a pointer and a keyboard drag; the pointer
  drag's placeholder and ghost; the keyboard drag's preview; the `data-state`
  styles; and every token in the stylesheet.
- `test/mirror.test.ts`: a written board loads back into the first Model.
  Nothing stored, a document that is not JSON, upstream's saved board, or a
  malformed card each give the sample board.
- `test/runtime.test.ts` runs the real runtime in jsdom. A card moved to
  another column with the keyboard keeps focus through the move, is written
  at once, and is still there after a reload. Escape puts a picked-up card
  back.
