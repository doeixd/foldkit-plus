# Proposals from the demo round

Each demo agent in the showcase round (one per `examples/*` folder) sends the
coordinator a proposal when it finds something the project itself should
change: a package defect, a missing or awkward API, a docs error. The
coordinator approves, declines or defers it. This file is the record.

Status words:

- **Landed**: built, tested and committed (the commit is named).
- **Building**: approved, an agent is on it.
- **Queued**: approved, not started.
- **Plan**: accepted as real, deferred as design work to
  [`ui-followup-PLAN.md`](./ui-followup-PLAN.md).
- **Open**: needs a decision from the maintainer.

Last updated 2026-11-15.

## Defects found in packages

| # | From | What was wrong | Package | Status |
|---|------|----------------|---------|--------|
| D1 | todo-app | A `Style.media`/`pseudo`/`nest` rule silently loses to a `Style.inline` of the same property in one composition, so responsive overrides did nothing (shipped in the todo app's phone layout). Fix: a definition-time diagnostic. | `foldkit-mixins` | Building |
| D2 | widgets | `Sheet.close` on a closed sheet, and `Dialog.update` on a dismissal while closed, returned an equal copy of the Model, so Foldkit rendered. Upstream's Dialog rebuilds the Model; guarded in our wrapper. `Dialog.close` is new. | `foldkit-mixins-ui` | Landed `c8df36ba6`, `a493b96d2` |
| D3 | widgets | `Table` lost focus when a sort moved the focused row. Fix: a `control` slot names a part, so an application's `FocusRecovery` keeps focus (opt-in: a stateless view cannot run the recovery itself). | `foldkit-mixins-ui` | Landed `01755f470` |
| D4 | widgets/authoring | `Press.events` dropped every event on an `aria-disabled` element, the release included, so a stepper that disabled itself while held left `Repeat` stuck. Enter and Space had the same hole. | `foldkit-primitives` | Landed `3b39c9ea3` |
| D5 | widgets/authoring | The interaction README said a held `Repeat` press survives the pointer leaving; it ends. Behaviour pinned (leaving ends the hold, returning does not resume) and docs corrected. | `foldkit-primitives` | Landed `56f63050d` |
| D6 | data-grid | A header filter form closed itself about 100 ms after a mouse click. Cause: Foldkit's Vite plugin brands a node by the function that returned it and replaces a node whose brand changed; the funnel was returned from two arrows. Only workspace builds are branded, so the browser tests never saw it. | `foldkit-mixins-data-grid` | Landed `5b2a13ebd` |
| D7 | data-grid | Header filter and column-menu buttons are 24px targets on a coarse pointer. | `foldkit-mixins-data-grid` | Building (data-grid demo agent) |
| D8 | pages | `redecorate` in `richtext-dom` restored the DOM selection without the `ownsSelection()` guard, so any decoration refresh pulled focus back into the editor from whatever button the user had moved to. | `foldkit-richtext-dom` | Building (pages demo agent) |
| D9 | authoring guide | `Conformance.listbox`'s doc comment said `enter` runs "first, and again whenever an activation has closed the options"; it runs only when no option is drawn. Comment corrected. | `foldkit-mixins` | Landed `cf84dc70d` |
| D10 | widgets | A `File` kept in a Model or Message makes Foldkit's dev-tools relay reject with `SchemaError: Expected JSON value` under `vite dev` (not reproduced in isolation; the relay only runs under `import.meta.hot`). README note written. | `foldkit-mixins-ui` docs; upstream Foldkit | Landed `22c8c0b75` (note). **Open**: file upstream? |

## API additions and changes

| # | From | Proposal | Package | Status |
|---|------|----------|---------|--------|
| A1 | cms | List rows carry `data-row-key`, so focus can return to the row a record was opened from. | `foldkit-mixins-crud` | Landed `83907c5e0` |
| A2 | pages | `formattingToolbar`: the standard rich text bar as one roving tab stop. | `foldkit-mixins-richtext` | Landed `09b9111b9` |
| A3 | cms | `richTextInput` takes a codec (`value`, `fill`, `blank`), so a form key can hold Markdown text while the editor holds a Document. | `foldkit-richtext-dom` | Landed `406f96ad0`, `c5edee4e7` |
| A4 | widgets | A non-throwing check for a key-route clash (`Option` of the diagnostic). | `foldkit-mixins` | Building |
| A5 | data-grid | The read-only lock icon in a grid header gets a visible `title` from `words.readOnly`. | `foldkit-mixins-data-grid` | Landed `2981f2866` |
| A6 | data-grid | Copy reports its size (`Out.Copied`); `Grid.rangeSize`; a `reveal` helper; `Grid.hasFilters`, `Grid.filterCount`. | `foldkit-data-grid`, `foldkit-mixins-data-grid` | Landed `2981f2866` |
| A7 | widgets | `FileInput.cases` to spread the widget's own Messages into an application's union. | `foldkit-mixins-ui` | Landed `0ba42a55a` |
| A8 | widgets | `Table` sort keys typed through to `onSort`; `Table.defineColumns` for hoisted columns. | `foldkit-mixins-ui` | Landed `21331cecd` |
| A9 | widgets | `FocusRecovery`: a fallback naming an undeclared part is a type error; `parts` may name a widget's own `recoveryPart` without inventing a Slot. | `foldkit-primitives` | Building |
| A10 | widgets/authoring | `Repeat.behavior` takes the `SlotView.over` binder with inference, a `disabled` option, and supplies `activation`. | `foldkit-primitives` | Landed `92da18aa4` |
| A11 | widgets/authoring | `Selection` helpers `select` (replace and anchor) and `range`. | `foldkit-primitives` | Landed `7df47c587` |
| A12 | widgets/authoring | `Pressed` carries `modifiers` (shift, ctrl, meta, alt) in place of `shiftKey`. **Breaking.** | `foldkit-primitives` | Landed `4d3d7cd81` |
| A13 | widgets/authoring | `GridNavigation.behavior` takes application key `routes`. | `foldkit-primitives` | Landed `adaf67191` |
| A14 | design-system | A runtime-only Themes entry (apply, choose, changes, boot script) importable without the style compiler, and knob metadata as data. | `foldkit-mixins` | Building |
| A15 | richtext-playground | `formattingToolbar`: application entries in the Insert menu, and application controls inside the bar's one tab stop. | `foldkit-mixins-richtext` | Building |
| A16 | cms | `Cms.bySlug` (and sibling read-side functions) typed by what they read (`ContentReader`), so a public site does not import the content type's form and with it the editor. | `foldkit-cms` | Building (cms demo agent) |
| A17 | widgets | SpatialNavigation README: it needs `Capability.Focusable` on the item, and what the wrong capability does. | `foldkit-primitives` docs | Building |

## Dependencies approved for examples

| # | From | Change | Status |
|---|------|--------|--------|
| X1 | data-grid | `examples/data-grid` depends on `foldkit-mixins-ui` (toolbar widgets, lazily loaded). | Landed `7444b309b` |
| X2 | cms | `examples/cms` depends on `foldkit-mixins-richtext` (to adopt `formattingToolbar`). | Building |
| X3 | data-grid | `examples/data-grid` depends on `foldkit-primitives` (`formatHotkey` in the lazy toolbar chunk). | Queued (after X2's lockfile commit) |
| X4 | registry | Edit one sentence in `examples/site/src/demos.ts` to match the registry's renamed offline control. | Building |

## Deferred to the follow-up plan

Accepted as real; each needs a design decision before code.

| # | From | Gap |
|---|------|-----|
| P1 | widgets | A Slot capability a Behavior refuses should be a type error at `Behavior.attach`, not a throw at module load. |
| P2 | widgets | A placement's `onOut` cannot call its own helpers without annotations (TS7022); pass the helpers in. |
| P3 | widgets | A fold helper for a child `update` that cannot drop the child's commands and keeps no-op identity (check `Update.foldChild` first). |
| P4 | todo-app | Sync: a status Message option on `Sync.mount`; an offline or pause switch on the socket transport; per-operation pending state. |
| P5 | data-grid | `Bundle.declare` should accept a lazy bundle; an application Message union lacks `matchOrElse` for routing its own Messages. |
| P6 | authoring guide | `helpers.hideAll(ids)` for keyed Presence; less boilerplate for per-key Presence; a shared `Collection` memo; a Navigation supplier when application routes share the list's container. |
| P7 | authoring guide | `docs-check` skips untracked files and builds unrelated test files, so another change's red test fails an unrelated document. |
| P8 | data-grid package | Sweep the view packages for D6's shape (a focused control returned from different arrows by state), and run browser tests with Foldkit's view-identity plugin on. |
| P9 | widgets/authoring | Press modifiers do not replace a grid's hand-written row-click handler: `Pressed` has no row id. Needs a per-row press design. |
| P10 | widgets | `Table`: the checkbox control as a named recovery part. |
| P11 | richtext | A ready `markdownCodec({ mint })` in `foldkit-richtext-markdown` (needs the editor's blank document exported). |
| P12 | widgets (report) | Smaller rough edges: `Menu` row `icon` is `Html`, not data; `SegmentedMultiple` has no `id`, so `multiple: false` type-checks; SpatialNavigation's item mark is private; `OnInput` carries no time for `History`; the 8-field `Pressed` payload is re-declared by applications; `SwipeActions.Released` needs the row width; `Repeat` has fixed timing; a `Table` markup cell cannot be named by its row; a Scene test cannot resolve a `FocusRecovery` Mount. |

## Declined

| # | From | Proposal | Why |
|---|------|----------|-----|
| N1 | richtext-playground | Make `Command.define`'s no-argument form consistent with its argument form. | Foldkit's own API, not this project's. |

## Adoption still owed in examples

Workarounds left in place with an `ADOPT` comment until the package change landed:

- `examples/authoring`: the stepper's `aria-disabled` dodge and old `Repeat` call (D4, A10 landed); the grid's `Ranged` call (A11 landed); the grid's `RowClicks` Mount (stays until P9).
- `examples/widgets`: the key-clash `try`/`catch` (A4); the invented `dismiss` Slot for focus recovery (A9); the file-input e2e's one ignored page error (D10).
- `examples/design-system`: a local theme Command and Subscription and a generated knob table (A14).
- `examples/richtext-playground`: the separate Image button and "Document" group (A15).
- `examples/pages`: `formattingToolbar` adoption in progress (A2, D8).
- `examples/cms`: the Markdown input (A3), row focus (A1), the toolbar (A2, X2), the site and studio split (A16).
