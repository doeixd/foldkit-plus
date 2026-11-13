# UI SDK work: review findings

An audit of the `ui-sdk-work` branch as it stood at `c28ab2629` (2026-11-13),
covering issues #531 and #551 to #558, the plan in
`docs/ui-sdk-implementation-plan.md` (branch `ui-sdk-implementation-plan`), the
matrix in `docs/ui-sdk-core-review.md` (branch `ui-sdk-core-review`) and the
ledger in `docs/ui-sdk-audit-ledger.md`. Each finding has a status, updated as
it is fixed.

## Checks at the audited commit

| Check | Result |
| --- | --- |
| `format:check`, `paths:check`, `mutate:check`, `typecheck:force` | pass |
| `tags:check` | fails: four string-tag comparisons at `packages/mixins/src/assembly.ts:133` |
| Unit tests for mixins, primitives, agent, mixins-ui, widgets | 4,484 pass |
| The branch's 10 new browser test files | 42 pass |
| Mutation runs, e2e, Jev review | not run by the audit |

## Defects

Confirmed by a probe:

- **F1. `Assembly.describe` counts a behavior that is not attached.** A
  behavior listed in `behaviors` but absent from the view's mixins still
  satisfies a pattern obligation, so `patternDiagnostics` is empty for a widget
  that lacks the provider.
- **F2. `Assembly.describe` misses conflicts between same-named contributors.**
  `conflictsOf` dedupes owners by name; the resolver conflicts by event. Two
  `Behaviors.Keyboard` on one slot, both named `Keyboard`, report no conflict
  and the resolver then throws.
- **F3. `tags:check` fails** on `assembly.ts:133`, which CI runs.

Read from the code:

- **F4. `Selection.Replaced` throws inside `update`** in single mode with more
  than one distinct id (`selection.ts`). A reducer that throws on a Message
  crashes the runtime. It is the only `throw` in the interaction primitives.
- **F5. `Agent.Ui.discover` dies on a bad query.** A query with neither id nor
  label, which an agent can send, is an `Effect.die`. `invoke` throws
  synchronously for a catalog not built with `Ui.catalog`, though the type
  accepts any `{ parts }`.
- **F6. `Agent.Ui` parts name capabilities and fields as plain strings.** A
  typo makes a part undiscoverable, which reads the same as "unavailable"
  (#251's rule: type a member name by the binding's keys).
- **F7. `MessageScroller` can stop following with no scroll.** The wheel and
  key handler has no guard for a wheel inside a nested scrollable, Ctrl+wheel,
  a key another handler prevented, or ArrowUp/Home in a focused field inside
  the log. The reader stays at the end and new messages no longer follow.
  Upstream has the same weakness.
- **F8. `Leaving`'s `release` walks the whole subtree** (`querySelectorAll('*')`)
  for every attribute record.

## Design

- **D1. Obligations are read by nothing shipped.** `Patterns.Listbox` and
  `Patterns.Checkbox` gained obligations, but no catalog gate passes a support
  list and no shipped widget declares one.
- **D2. `A11y.validate` with a support list and `A11y.bound` are two ways to
  do one thing.** The `a11y:unnamed-delegation` diagnostic is unreachable
  through `A11y.delegated`, which throws on an empty provider. `native` and
  `delegated` take the slot as a `string` nothing checks.
- **D3. `Agent.Ui` does not touch the UI.** It is a hand-written alias table
  over capability names. The label is tied to no rendered control and it is
  unconnected to `Assembly`'s `links`.
- **D4. `Leaving` has no shipped consumer.** `FocusScope` and `HideOutside`
  now read its DOM marker, but `Overlay.modal` does not attach it. A
  Command-driven alternative was not weighed; the Mount is kept because it
  alone can move focus before `inert` is drawn.
- **D5. The leaving fixture lets one row exit at a time**: one `Presence`
  slice serves the whole list.
- **D6. Fixtures are not in the demo.** The three `ui-sdk-*.ts` files sit in
  `examples/widgets/src`, only tests import them, and they are named after
  another product.
- **D7. `Behaviors.Keyboard` is always named `Keyboard`**, so two of them
  cannot be told apart in a diagnostic.

## Process

- **P1. The #558 ledger defers what the plan said to build.** `AGENTS.md` and
  the plan say not to defer for lack of a consumer. Rows end "deferred until a
  consumer fails without it": windowed-list `keep` and find-in-page,
  file-manager ranges, `GridNavigation` paging, tree check strategies, lasso,
  spatial focus, an input-based inline edit, cross-tab themes, a pinch read as
  a keyboard.
- **P2. Dispositions are source reading.** "Verified overlap" was given
  without the browser scenarios the review said were needed.
- **P3. The two highest-priority items were barely started.** The rendered
  conformance scenarios (listbox, tree, dialog, tabs) got a listbox slice.
  Overlay nesting and lifecycle were not audited. Matrix rows with no entry:
  move/resize/gestures, popup and layers, presence and motion, announcements
  and shortcuts, undo, agent interfaces, styles, widget catalog.
- **P4. Changelog gaps.** No entry for the `Selection.Replaced` change, the
  resolver refusing a child `OnMount` (#531), or `InputSlots` gaining
  `KeyDown`.
- **P5. Issue hygiene.** #531 and #551 to #558 have no comments and no ticked
  boxes. The ledger links a matrix that exists only on another branch.
- **P6. Small slop.** A cast and a raw `_tag` comparison in
  `packages/agent/test/parts.test.ts`; unit tests that pin attribute-name
  constants; `data-fk-*` beside the existing `data-foldkit-plus-*` prefix.

## Status

| Finding | Status |
| --- | --- |
| F1 to F8, D1 to D7, P1 to P6 | open |
