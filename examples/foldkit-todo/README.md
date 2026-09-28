# Todo

A todo list: add, tick off, edit (click the text), delete, filter by All,
Active or Completed, mark all, and clear the completed ones. The list survives
a reload through localStorage, and the page title counts the active todos. It
ports Foldkit's
[todo example](https://github.com/foldkit/foldkit/tree/main/examples/todo) to
Foldkit Plus.

## Who owns the list

The Model owns the list; localStorage only remembers it. Upstream returned a
`SaveTodos` Command from every branch of `update` that changed `todos`, and
read the store into Flags before `init`. Here `update` only changes the
Model, and a `foldkit-mirror` key-value mirror writes the store whenever the
list changes:

```text
click -> Message -> update (modifyFields) -> Model.todos -> TodosMirror subscription -> localStorage
localStorage -> flags (TodosMirror.restore) -> init (TodosMirror.reduce) -> Model.todos
```

The store is still read into Flags, as upstream read it, so the first frame
already shows the stored list. A stored document the page cannot read (not
JSON, another version, a malformed todo) loads as an empty list, as upstream's
did. Writing is last-write-wins with no log: two tabs do not merge their
lists, as upstream's did not.

## Run it

```bash
pnpm --filter foldkit-example-foldkit-todo dev
```

From the repository root, `npx vitest run examples/foldkit-todo` runs the
tests and `npx tsc -b examples/foldkit-todo` type-checks them.

## What owns what

| Concern | Owner | Where |
| --- | --- | --- |
| The todos, the new-todo text, the filter, the edit in progress | the Model, changed only by `update` | `src/main.ts` |
| Remembering the list across reloads | `foldkit-mirror` (`Mirror.kv` over `App.model.todos`) | `src/main.ts`, `// MIRROR`, `// SUBSCRIPTION`, `// FLAG` |
| The field reference the mirror is declared over | `foldkit-surface` (`Surface.application`) | `src/main.ts`, `// MIRROR` |
| A new todo's id and timestamp | the `GenerateTodo` Command, as upstream | `src/main.ts`, `// COMMAND` |
| The accessible input, checkbox and buttons | `@foldkit/ui` Input, Checkbox, Button | `src/main.ts` |
| Their look: `Recipes.Input`, `Recipes.Checkbox`, `Recipes.Button` | `foldkit-mixins-ui` | `src/style.ts` |
| The page's Slots, theme, layout and type | `foldkit-mixins` | `src/style.ts`, installed by `src/entry.ts` |

## What is not used, and why

- **`foldkit-entity` / `foldkit-crud`.** A todo is four fields held in one
  local array. There is no server, relation or edit screen for Entity or Crud
  to own; Crud joins Remote and a form, and neither exists here.
- **`foldkit-sync`.** The list lives on one device and is last-write-wins, as
  upstream's is. Sync is for edits that must survive offline and converge
  across devices.
- **`Mirror.fold` and a restore Message.** The mirror's documented cold-load
  path runs `restore` as a Command after `init`. Running the same Effect as
  the Flags keeps upstream's order (read, then `init`), so the first frame is
  never the empty state, and no `MirrorRestored` variant joins the union.
- **`foldkit-bundle`, `foldkit-agent`, `foldkit-remote`.** Nothing is placed
  twice, exposed to an agent, or read from a server.

## Differences from upstream

- `SaveTodos`, `SucceededSaveTodos` and `FailedSaveTodos` are gone: the
  mirror writes, and absorbs and logs a failed write. Upstream's
  `FailedSaveTodos` did nothing either, so the page behaves the same.
- The store holds the mirror's versioned document under the same key,
  `todos` (`{"version":1,"keys":{"todos":"[…]"}}`), not a bare array. A bare
  array left by upstream's app on the same origin reads as unreadable and is
  removed; an empty list removes the key rather than storing `[]`.
- The delete button also shows when it has keyboard focus; upstream's stays
  invisible while focused.
- Styling is `foldkit-mixins` instead of Tailwind; the checkbox's tick is the
  recipe's drawn check rather than a `✓` character.

## Tests

- `test/story.test.ts` and `test/scene.test.ts` are upstream's, with the
  import path changed and the `SaveTodos` steps removed; upstream's "keeps
  in-memory changes when saving fails" scene moved to the runtime test, since
  saving is no longer a Command a scene can fail.
- `test/view.test.ts` draws the view inert: the title, every element in a Slot
  (empty, listing, editing, filtered to nothing), the selected filter's
  accent, the struck-through completed todo, and every token in the stylesheet.
- `test/mirror.test.ts`: a written list loads back into the first Model, and
  nothing stored or an unreadable document loads as no todos.
- `test/runtime.test.ts` runs the real runtime in jsdom: a todo added before a
  reload is there after it, written at once, and a store that refuses every
  write leaves the page working.
