# Child update capabilities for the interaction primitives (#495)

Status: built 2026-11-10. The owner chose the function form of
`helpers` (decision 2) and adopting the rule for Bundle parents (decision 3).

## The problem

A scaffolded Foldkit app lints with `@foldkit/oxlint-plugin`'s recommended
rules. One of them, `no-child-message-construction-in-root` (read in 0.15.4's
source), reports any call `X.Message.Variant(...)` whose `X` is imported from
a module other than the caller's own root Message module. It exempts one case:
a view whose `HtmlBuilder<M>` (or `Submodel.defineView`) speaks that same
child Message, that is, the child drawing itself. Its advice is to "expose a
child update capability that applies this fact, then invoke it with
`Update.foldChild`, `foldChildAt` or `foldChildStep`".

`foldkit-primitives/interaction` exports no such capability. A parent that
drives a primitive builds the primitive's Messages itself, in two shapes:

- **In `update`.** `examples/tree/src/app.ts` runs
  `Selection.bundle.update(model.selection, Selection.Message.Activated({ id }), selArgs)`
  when the current row is committed, and writes the result back by hand
  (dropping its Commands).
- **In a parent view.** `examples/tree/src/view.ts` and `foldkit-mixins-builder`
  (`index.ts:1305`, `1322`) draw a row's expander and send
  `Nav.wrapper.make(TreeNavigation.Message.Opened({ id }))`. This is the form
  Bundle's README teaches for composition.

Searching every package and example for a primitive's Message built outside
`foldkit-primitives` finds 22 call sites:
- `Selection.Activated`: 11.
- `TreeNavigation` `Opened`, `Closed` and `Focused`: 6.
- `DismissLayer.PressedEscape`: 2.
- `RovingTabindex.Focused`: 1.

Most are demo harnesses (`demo.ts`) that send input events to drive an app
headlessly. They simulate a person on purpose and are not what the rule is
for. The application code is the tree example's update and view, and
`mixins-builder`'s tree rows.

## What a parent may legitimately apply

Most primitive Messages are input the primitive's own Behavior reports: a
press, a key, a pointer, a timer. A parent never has those facts to apply.
The facts a parent does decide are few:

| Primitive | Capability | Today's Message |
| --- | --- | --- |
| `Selection` | `activate(id)`, `replace(ids)`, `clear()` | `Activated`, `Replaced`, `Cleared` |
| `TreeNavigation` | `focus(id)`, `open(id)`, `close(id)`, `toggle(id)` | `Focused`, `Opened`, `Closed` |
| `RovingTabindex`, `ListNavigation`, `GridNavigation` | `focus(id)` | `Focused` |
| `LiveAnnounce` | `announce(text, politeness?)` | `Announced` |
| `Typeahead` | `clear()` | `Cleared` |

`DismissLayer`, `Press` and `LongPress` get none: every Message they have is an
input event. Nor does `LiveAnnounce.Cleared`, which its own timer sends with a
generation. `toggle` is the one capability that is not a single Message.
Today the parent reads `isOpen` and picks `Opened` or `Closed`, a decision
that belongs to the child.

## Decisions

### 1. A capability is a Bundle helper

A Bundle already has the concept. A helper is `(model, ...input) => Return`,
declared beside `update`. A placement exposes it as
`placed.helpers.name(...input)`, an `Update.Step` folded with `foldChildStep`.
crud, cms, form and the chirp and cloudflare examples already drive their
children this way. Each primitive gains the helpers in the table, defined
through its own `update`, so a helper and the Message it replaces cannot drift
apart. No second mechanism is added.

### 2. A helper can read its placement's args

`Selection.activate` needs `mode` and `allowEmpty`, which live in the
placement's args. Today `placed.ts` calls `helper(model, ...input)` and passes
no args, although the README says the args are "retained for … helpers". The
proposal is a second form for `helpers`: a function of the args that returns
the record.

```ts
helpers: args => ({
  activate: (model: Model, id: string) => update(model, Message.Activated({ id }), args),
})
```

The placement calls that function with the args it already holds (static or
derived from a seed) and returns the same `placed.helpers` shape. The record
form is unchanged, so no existing helper breaks. `withHelpers`, collections,
`compose` and `lazy` take both forms.

### 3. A parent view sends its own Message

The tree's expander sends `ToggledRow({ id })`, and the parent's `update` folds
`Nav.helpers.toggle(id)`. This is upstream's pattern for its own components
(a parent sends `ClickedOpenDialog`, its update calls `Dialog.open`). It makes
the parent say what happened in its own terms. A Bundle wrapper still routes
the child's own Messages and draws the child's own view. The Bundle README's
composition section shows the helper form and says when a parent view should
not build a child's Message.

`follow`, which replays a waiting ask as the owner's Messages
(`toMessages`), keeps its form. Those Messages are the owner's answer to its
own ask, built at the one boundary that knows both. The README names it as
the exception.

### 4. The examples move, and the scaffold lints them

The tree example, `mixins-builder` and the widget views move onto the helpers.
Demo harnesses keep sending input events. Once the application code passes,
the scaffold job in `scripts/published-setup.mjs` lints the copied examples
with their `demo.ts` files ignored. That completes #229's examples-as-apps
check, if no other recommended rule fails them. That is measured in the
build, not assumed.

## Considered

- **Message builders in the child module** (`TreeNavigation.toggled(model, args, id)`
  returning a Message). These pass the lint, because construction happens in
  the child's module, but they keep the parent sending the child's facts. They
  satisfy the letter of the rule while missing its point.
- **Args as helper input** (`Sel.helpers.activate(id, selArgs)`). This keeps
  two copies of the placement's args, which disagree once the args come from
  a seed. It also makes the caller rebuild a value the library owns, which
  AGENTS.md warns against.
- **Args as a helper's second parameter** (`(model, args, ...input)`). This
  breaks every existing helper, in crud, cms, form and the examples, for no
  gain over the function form.
- **Standalone functions beside the helpers** (`Selection.activate(model, id, args)`).
  These would be a second way to apply the same fact. A parent without
  Bundle placement reaches the same code through the helper record:
  `Bundle.helpersOf(Selection.bundle, args).activate(model, id)`, which reads
  either form of helpers.

## Checks the build must have

- Each helper equals its Message through `update`: a table test over every
  capability, plus a mutation that changes one helper's Message.
- `toggle` opens a shut row and shuts an open one, with the open state read
  from the child's Model.
- Function-form helpers see a seed-derived placement's args, not stale ones:
  two placements with different args, and a mutation that passes `{}`.
- The record form still type-checks and behaves as before (the existing
  crud, cms and form tests).
- The scaffold job lints the copied examples with demos ignored, and fails
  on a reintroduced `wrapper.make(TreeNavigation.Message.Opened(...))` in
  the tree's view (checked by hand in a scaffold).

## Measured: the examples under the scaffold's lint

With the helpers in place, the seven examples the scaffold job copies were
linted with a scaffold's own `.oxlintrc.json` (`@foldkit/oxlint-plugin`
0.15.4's recommended rules and the scaffold's TypeScript rules), `demo.ts`
ignored. 20 errors remain, and only 3 are this rule's:

| Rule | Errors | Where |
| --- | --- | --- |
| `typescript/consistent-type-assertions` | 6 | `fields` |
| `sort-imports` | 5 | `tree`, `drawer`, `fields` |
| `typescript/no-explicit-any` | 3 | `fields` |
| `foldkit/no-child-message-construction-in-root` | 3 | `tree`, `drawer` |
| `foldkit/no-switch-on-message-tag` | 1 | `form` |
| `foldkit/no-module-level-mutable-state` | 1 | `todo` |
| `foldkit/no-hand-rolled-command-struct` | 1 | `form` |

The three left of this rule were each view sending its own application's
Message, `App.Message.ToggledRow(...)`: the rule takes a Message module for
the root only by its file name (`index`, `main`, `message` or `schema`), and
those examples kept `Message` in `app.ts`. The rest were upstream's style.
A pass over the examples then cleared all 20:

- `tree` and `drawer` keep their Message, and the declarations it spreads,
  in `message.ts`, upstream's layout.
- `fields` types each recipe by its own value (`entry(...)`), erasing only
  the finished reading; a page draws through a generic `drawn`, and the key
  a slug follows is typed into by decoding its `Changed` through the form's
  Message Schema.
- `form`'s picker matches its Message and defines its Command; `todo` keeps
  its id counter in the Model.

Effect's lint pass, which the scaffold's `lint` script also runs, found one
more (`decodeUnknownSync` on an input already typed, in `fields`). The
scaffold job now lints the copies, their `demo.ts` files skipped.

## `LiveAnnounce.say`, removed after

`LiveAnnounce.say(declared)` built the wrapped `Announced` for a parent, with
a cast to the parent's Message. `foldkit-builder` used it in its announcing
Command and in the clipboard copy's. Both now go through the announcer's
`announce` helper: an announcement made in `update` folds it at once, and the
copy's Command answers with the Builder's own `Copied({ said })`, whose arm
folds it. With no user left, `say` was removed.
