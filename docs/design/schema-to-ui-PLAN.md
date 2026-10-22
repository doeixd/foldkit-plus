# Schema to UI: field recipes and CRUD workflow recipes

> **Status:** proposed, 2026-10-22. Written from
> [#188](https://github.com/doeixd/foldkit-plus/issues/188) and an audit of the
> code on the same date (§1, §11). **Nothing here is built.** Blocks marked
> *Sketch* are shapes to review, not APIs; the phase that builds each one fixes
> its real signature. Where this plan and a package README disagree, the README
> and the source win.

The issue asks for a complete schema-to-UI story: reusable field recipes, UI
renderers for every control kind, and CRUD workflow recipes. This plan keeps the
ambition and narrows the first build to what the existing design can absorb
without a second owner for anything.

## 1. What the audit found

| Package | What it is | Shape today |
| --- | --- | --- |
| `foldkit-form` | A form as a Bundle: controls, drafts, per-key validation, checks, nested rows | 1750 lines + `input.ts` 371; kinds `Text, Multiline, Hidden, Number, Toggle, Select, RelationOne, RelationMany, Nested`, plus `Input.kind` and `Input.bundle` |
| `foldkit-mixins-form` | Draws a form as plain accessible HTML through Slots | renderers per kind; one layout; `foldkit-mixins-form/ui` covers **Text and Multiline only** |
| `foldkit-crud` | Headless editor, list, detail, remover over form + Remote + Entity | `{detail, remover, list, editorView, options, actives, editor}` |
| `foldkit-mixins-crud` | `ListView`, `DetailView`, `RowListView`, display renderers | no editor, drawer, dialog or confirm view |
| `foldkit-primitives` | **Headless substrate, no components** | `Overlay`, `DismissLayer`, `FocusScope`, `Placing`, `ListNavigation`, `Typeahead`, `GridNavigation`, `InputMask`, virtualisation |
| `foldkit-mixins-ui` | Slot contracts and adapters over upstream `@foldkit/ui` | 92 namespaces |

The DOM components are upstream, adapted by `foldkit-mixins-ui`. `@foldkit/ui`
0.169.0 exports `anchor, animation, button, calendar, checkbox, combobox,
datePicker, dialog, disclosure, dragAndDrop, fieldset, fileDrop, hoverIntent,
input, listbox, menu, meter, nav, popover, progress, radioGroup, select,
slider, switch, tabs, textarea, toast, tooltip, virtualList`; `mixins-ui` adds
`NumberField`, `OtpField`, `PasswordInput`, `TagsInput`, `InputCopy`,
`CheckboxGroup`, `Slider`, `Rating`, `ColorPicker`, `ImageCropper`,
`SignaturePad`, `CascadeSelect`, `Command`, `Table`, `Chart`, `TreeView`,
`Steps`, `Sheet`, `Drawer`, `FloatingPanel`, `Tour`, `Questionnaire`, and
`Patterns` (a11y contracts for about forty widgets).

### 1.1 Where the issue needs correcting

1. **"`foldkit-primitives` / `foldkit-mixins-ui` integrations" is the wrong
   address for controls.** `primitives` draws nothing. A field recipe reaches
   the DOM through `mixins-form` (plain) or `mixins-form/ui` → `mixins-ui` →
   `@foldkit/ui`.
2. **The catalog is not missing components; it is missing form kinds,
   renderers and displays.** Password, tags, file drop, number field, OTP,
   slider, rating, colour, signature, cropping, cascade select, calendar,
   date picker, combobox and listbox all exist. None of them is a
   `foldkit-form` control.
3. **The a11y substrate for the hard widgets exists.** `ListNavigation`,
   `Typeahead`, `RovingTabindex`, `GridNavigation`, `LiveAnnounce`, `Overlay`
   and `FocusScope` are what a combobox and a calendar are built from; the
   combobox adapter itself is upstream.
4. **Uploads are half built already.** `foldkit-media` owns
   `POST /_media/upload`, admission policy, stores, facts and variants, and a
   browser `Inspector` that reads facts before upload. The missing half is a
   client control with progress, cancel and retry.
5. **Inline editing is partly built.** `foldkit-data-grid` edits a cell as text
   plus a schema, and `GridCrud.columns/rows/status` bridge a `Crud.list` into
   a grid.
6. **`/ui` coverage is exactly as the issue says**: Text and Multiline only;
   every other kind throws `UI form field does not draw "<kind>"`.

What Proposal C asks for that already exists: `FieldSlots` publishes `root`,
`label`, `description`, `error`, `checking`, `control`, `group` and `affix`, and
`FormSlots` publishes `root`, `errors`, `submit` and the five slots of a nested
key. So labels, help text, affixes, group and control wrappers do not need
building — what is missing is an error summary with links, a form-level actions
row, and the design-system *components* (a `Label`, `HelpText`, `ErrorText`
split) that `mixins-ui` does not have, because `descriptionOf` folds a field's
first error or checking line into one description string. That function also
writes `Checking…` as a literal (`packages/mixins-ui/src/field.ts`), which the
form's words cannot translate.

### 1.2 The constraints that decide the design

1. **A draft is `string | boolean | string[]`** (`packages/form/src/input.ts:20`).
   A partial number is text on purpose (`"4."` is a real draft).
2. **Filling a text control is `String(value)`** (`packages/form/src/index.ts`,
   `draftOf`). `Control.parse` is one-way. Nothing can yet say how a stored
   value should *look* when it is loaded into a control.
3. **Every `Changed` validates immediately** (`index.ts:1360`); `Blurred`
   validates only a key still `NotValidated`. `touched` exists for
   `Input.following`, not for error display, and a field's `invalid` is
   `FieldValidation.isInvalid(field)`.
4. **Controls live in the form's plan, not its Model.** Model fields are
   drafts, rows, searches, touched, errors, submitPending, subject. So a
   recipe may hold functions and `Intl` formatters: nothing about it is
   stored or serialized.
5. **A Bundle control is constrained**: no OutMessage, no `check`, and a
   nested form refuses a control with Subscriptions or Resources
   (`skills/foldkit-plus/references/form.md`, Gotchas). Rich text needed its
   own Bundle variant to satisfy this.
6. **A relation picker is a search box plus a `select`**, explicitly not a
   combobox, and it does not page inside itself
   (`packages/mixins-form/README.md`, Limits).
7. **`Display` already has a formatter hook** (`Display.text(format)`,
   `Display.number(format)`) and its kinds are Entity metadata. Read-only
   presentation does not need form internals.

## 2. Scope

**In.** Eight phases of package work, 0 to 7 (§6): the one form contract change
that unblocks formatted values, `/ui` renderer coverage for every shipped kind,
a date/time pack and a text-shaped pack, a money/number pack, CRUD
presentation, the CRUD screen composition, a file control over `foldkit-media`,
an async relation renderer, and the gallery and docs that prove them.

**Out.**

- Generating an app from an Entity. An Entity still never implies a mutation or
  a permission.
- A second form runtime, a second mutation path, or a second cache.
- A global mutable recipe registry (§3, principle 2).
- Guessing money, password, phone, date or PII semantics from a field name.
- Storing card numbers. A payment recipe, if it ever exists, is
  provider-hosted tokenisation.
- A timezone-aware instant type in this plan. §6 Phase 2 ships civil dates and
  local date-times with an explicit stored form; zone-invariant instants are a
  separate question (§10 Q5).
- A gallery as a product. The gallery is a test fixture that happens to be
  readable.

## 3. Principles

1. **A recipe owns text ↔ value parity; the application's schema still decides
   what is valid and what is stored.** A recipe never validates, never
   authorizes, and never invents a stored representation.
2. **Recipes are values, not a registry.** `Input.resolve` is called with no
   application context, and adding one would put invisible state in the
   middle of form construction with two ways to say one thing. A recipe is a
   value you attach with the mechanisms that already exist: `Input.of` on a
   member, an entry in `Form.make`'s `inputs`, a renderer in `FormView.define`.
3. **Prefer a native input; make the rich control an opt-in renderer.** A
   `Bundle`-backed key draws the Bundle's own view, and `bundleRenderer` strips
   `Name` from the state it passes on (`packages/mixins-form/src/index.ts`), so
   such a key posts nothing with scripts off. A calendar or combobox as the
   *default* would quietly cost the no-script path; `input type=date` posts,
   and a calendar popover enhances it.
4. **One owner per concern, and presentation holds no state.** A view takes
   values and Messages; it never owns a draft, a save, or a permission
   decision.
5. **Fail loudly at definition time.** A kind with no renderer already throws,
   naming the key. A merged pack with two recipes for one kind must throw at
   merge, not silently take the last.
6. **A recipe that cannot pass the conformance suite is not shipped.**

## 4. Contracts

### 4.1 What a recipe is

A recipe is a value with two halves, split across subpaths so the semantic half
never imports the DOM (§8):

```ts
// Sketch. Semantics: no DOM, no view types.
interface FieldRecipe<Data> {
  readonly kind: string
  readonly control: Control<Data>   // carries its own `data`
  readonly display: Display
  readonly words?: RecipeWords
}

// `FieldRecipes.money(data): FieldRecipe<MoneyData>` — the data is fixed when
// the recipe is made, so the control and the display cannot disagree.
```

Renderers are a second value, typed structurally the way
`packages/cms/src/kinds.ts` already types `controlRenderers` and
`displayRenderers` — so a recipe package need not depend on `mixins-form` to
describe what it draws:

```ts
// Sketch.
const renderers: <Message>() => Readonly<
  Record<string, (context: FieldContext<Message>) => Html<Message>>
>
```

Used the way the existing API already works:

```ts
// Sketch.
const Money = FieldRecipes.money({ currency: 'USD', unit: 'minor' })

Entity.annotateMembers({ price: Input.of(Money.control) })
Entity.annotateMembers({ price: Display.of(Money.display) })

const ProductForm = Form.make('Product', ProductInput, {
  inputs: { price: Money.control },
})
const View = FormView.define(ProductForm, {
  renderers: RecipeViews.renderers<Message>(), // `foldkit-form-recipes/html`
})
```

No new form step, no new precedence level. `FieldRecipes.merge(...)` exists only
to combine renderer tables and to refuse two recipes claiming one kind.

### 4.2 `Control.format`: the one change to `foldkit-form`

```ts
// Sketch.
readonly format?: (value: unknown, data: Data) => string
```

Semantics:

- Used by `draftOf` for `text` drafts, when the form is filled with a value.
  Nothing else calls it; a keystroke never reformats its own draft.
- Optional. Without it, a text draft shows `String(value)`, as today, so this
  is backward compatible.
- A `format` that throws fails the fill, naming the key. Phase 0 wraps the call
  in the form's existing `attempt`; today `fill` calls `draftOf` unguarded.
- `undefined` and `null` stay the empty draft; `Option.none()` too.

Rejected:

- **A renderer that rewrites the value while drawing.** `CmsDateTime` does
  this today (`localText` in `packages/cms/src/kinds.ts`): the draft stays an
  ISO string, the renderer converts per render, and the recipe only works
  inside that one renderer. A control must be reusable in any view.
- **`Input.bundle` for every formatted kind.** It is the right tool for a
  stateful editor, and the wrong one for money: no `check`, no nesting with
  resources, and no `name` in a plain form post.
- **A `format` on `Display` only.** Display formats a table cell; a form needs
  the same decision for the control's text.

### 4.3 Multi-choice literals

A key typed `Schema.Array(Schema.Literals([...]))` has no control today:
`fromSchema` looks at `SchemaShape.present(schema.ast)`, which yields the array
node itself, so `Form.make` throws. Add:

- `Input.choices(options)` with draft `'list'`, `parse` by option identity, and
  an `unparsed` word.
- `fromSchema` resolving an array of literals to `Choices`, which is as
  unambiguous as the single-literal case it already resolves.
- A plain renderer in the `choices` slot (checkbox group), which
  `foldkit-mixins-form` already has for `RelationMany`; reuse its markup rather
  than a second group.

### 4.4 The `/ui` renderer table

`foldkit-mixins-form/ui` today is a `field()` override that handles Text and
Multiline and throws otherwise. Replace the control half with a table that
covers every shipped kind — `Text`, `Multiline`, `Number`, `Toggle`, `Select`,
`RelationOne`, `RelationMany`, `Choices` — and keep `field()` as the layout
entry, built on the table. Unsupported kinds keep throwing by name.

Why a table: today a form chooses UI drawing per key and only for two kinds,
so a design-system form still falls back to plain HTML for everything else. A
renderer table composes with `FormView.define` directly, and a recipe pack can
ship one table for both paths.

### 4.5 CRUD presentation

Three stateless views in `foldkit-mixins-crud`:

- `EditorView.forMessages<Message>().define(placedEditor)` with a
  `presentation: 'page' | 'drawer' | 'dialog'` choice, the form's view inside,
  and slots for the frame, title, body, actions and error summary.
- `ConfirmView` for a remover: asked, deleting, failed, with the entity's name
  and the words the app passes.
- `Toolbar` for a list: search, filters, sort and actions as slots, with the
  state and Messages supplied by the app.

A view or a dialog owns no lifecycle: saving is `Crud.editor`'s, deleting is
`Crud.remover`'s, and dismissing is the app's Message. Focus enters on open and
returns to the opener — a browser test, not a unit test.

### 4.6 `Crud.screen`: composition, not a new owner

```ts
// Sketch.
const Posts = Crud.screen('Posts', {
  list: PostList,      // a Crud.list result
  editor: PostEditor,  // a Crud.editor result
  remover: Remover,    // a Crud.remover result
})
```

It composes pieces that already exist; it does not build a form, a mutation or
a query. It owns exactly four things:

| It owns | Not its job |
| --- | --- |
| A Model slice `{ editor, remover }` and its Schema | The page's other fields (search text, filters, sort) |
| Messages `Opened({id})`, `Created()`, `Closed()`, `AskedToRemove({id})` | Routes, and which id a URL names |
| Helpers `blank`, `open`, `close`, `ask`, over the pieces | Whether this principal may write (that is `foldkit-guard`) |
| `after(step)` for both syncs, and `active` for wiring | The query's input, the page layout, focus and scroll |

The underlying `Crud.editor`/`.remover`/`.list` handles stay public and stay
usable on their own. The screen is a shorthand for the wiring the entity
example hand-writes today; it is not the only way to build a CRUD page, and the
checks `packages/crud/README.md` lists continue to apply to the pieces it
places.

The screen's own config keys are Phase 5's design work. What it must not do is
fixed here: no hidden query, no second cache, no second permission check.

### 4.7 Conformance

`foldkit-form-recipes/conformance` exports cases as data a test runner
iterates, in the manner of `foldkit-entity/conformance` — not an assertion
library:

```ts
// Sketch.
interface RecipeCase {
  readonly what: string
  readonly recipe: FieldRecipe<unknown>
  readonly given: ReadonlyArray<unknown>      // values to fill with
  readonly typed: ReadonlyArray<string>       // drafts typed, in order
  readonly expect: {
    readonly drafts: ReadonlyArray<string>
    readonly value: 'some' | 'none'
    readonly unparsed: boolean
  }
}
```

A recipe package's tests iterate the cases against its own recipes; a
third-party recipe can import the same cases. This is what makes "complete"
checkable rather than aspirational (§7).

## 5. The catalog, by phase

| Phase | Recipes | Why it is more than a kind |
| --- | --- | --- |
| 2 | `date`, `dateTime` | a stored form, a local text form, and a format that survives a fill |
| 2 | `email`, `url`, `tel`, `slug`, `password` | element attrs (`type`, `autocomplete`, `inputmode`), masking rules, and a display |
| 3 | `money`, `decimal`, `percent` | locale parsing, minor units, zero-decimal currencies |
| 6 | `image`, `file` | a Bundle control (progress, cancel, retry) over `foldkit-media`'s upload |
| 6 | relation search | a combobox renderer over `Crud.options` and a list's `more` |

Deliberately not in the first catalog: location, signature (a component exists,
a legal requirement does not), barcode, payment, tax id, cron, semver, tree
selectors, permission matrices. Each needs a design question answered before it
needs a kind.

## 6. Phases

Each phase ships on its own, with the gates the repository runs
(`format:check`, `typecheck`, `test`, `demo`, and `e2e` where an example has a
server), a mutation spec for the new behaviour, and a browser test where the
claim is about focus or layout.

### Phase 0 — the form contract (S)

**Build.** `Control.format` (§4.2). `Input.choices` and array-of-literal
resolution (§4.3).

**Why first.** Every formatted recipe depends on it, and it is additive: no
existing form changes behaviour.

**Acceptance.**

- Filling a control whose `format` renders `12.34` puts `12.34` in the draft;
  a control without one still shows `String(value)`.
- `Schema.Array(Schema.Literals(['a', 'b']))` resolves to `Choices` instead of
  throwing at `Form.make`.
- `Input.choices` accepts `['a', 'b']`, refuses `'c'` as unparsed, and submits
  the literals themselves.

**Kills.** `format` replaced by an identity function; `Choices.parse` replaced
by `() => options[0]`. Each must turn its test red.

### Phase 1 — renderers for every kind (M)

**Build.** The `/ui` renderer table (§4.4); a `Choices` renderer on both
paths; `field()` rebuilt on the table; a `summary` slot in `FormSlots` whose
content lists each invalid key as a link to its control's id, so it focuses the
field natively and works without scripts.

**Why second.** Until every kind can be drawn through `/ui`, a UI-backed recipe
cannot be shown, and the gap hides behind a throw at render time. The summary
is the form-level counterpart to the per-field error the view already draws.

**Acceptance.**

- One test draws the same form through `FormView.define(form)` and through the
  UI table and asserts the same Messages for the same interaction.
- Every kind's control carries `name`, `id`, `aria-invalid`,
  `aria-describedby` as its label and error require, through both paths.
- A browser test toggles the UI checkbox with Space and changes the UI select
  with arrows, asserting the form's `Changed` payloads.
- After `ValidatedAll`, the summary lists every invalid key, and its link
  focuses that control — browser test, including the no-script anchor.
- The checking line and the submit label read the form's `words` on both paths,
  so neither path fixes `Checking…` in an untranslatable literal.

**Kills.** A renderer dropped from the table (must throw by name, not draw a
text box); `aria-describedby` removed; a summary link pointing at the wrong id.

### Phase 2 — dates, times, and the text-shaped pack (M)

**Build.** `FieldRecipes.date` (a `CalendarDate` ↔ `YYYY-MM-DD`), and
`FieldRecipes.dateTime` with an explicit stored form: `'local'` (naive
`YYYY-MM-DDTHH:mm`, what a `datetime-local` writes) or `'instant'` (ISO with an
offset). Default renderers are `input type=date` and `type=datetime-local`;
`/ui` renderers use `Calendar`/`DatePicker` inside a `Popover`. Alongside them,
the recipes whose only job is element attrs and a display: `email`, `url`,
`tel`, `slug` (over `Input.following`), `password`. `FieldRecipes.merge` lands
here, refusing two recipes for one kind.

**Why a phase.** The current workaround is a renderer that rewrites the value
(`localText`), and it is the clearest proof that `format` is missing. Dates also
force the empty/partial draft rules (`2026-1` while typing) that every later
recipe reuses, while the text-shaped pack proves the recipe value without any
new mechanics.

**Acceptance.**

- A stored ISO instant fills as local text in `'instant'` mode; a naive text in
  `'local'` mode round-trips unchanged.
- An empty draft is `Option.none()` / absent per the key's schema, and a
  required date is invalid while empty, not while partially typed.
- `YYYY-MM-DD` from the native input round-trips through `CalendarDate`; the
  calendar renderer produces the same value.
- `CmsDateTime` and `localText` are deleted, and the CMS test that covered
  them now uses the recipe.
- `email` draws `type=email` and turns off capitalization and spellcheck;
  `tel` sets `inputmode=tel`; `password` draws a reveal toggle with the right
  `autocomplete`. A password key's docs say it must not be autosaved: the form
  cannot keep a key out of `partial()`, so the rule belongs to the application.

**Kills.** `format` returning `String(value)`; the local/instant distinction
collapsed; `date` parsing month-first; a duplicate kind accepted by `merge`.

### Phase 3 — money and numbers (M)

**Build.** `money({ currency, unit, locale })`, `decimal({ scale, locale })`,
`percent({ unit, locale })`. Parse is conservative and locale-aware; `format`
uses `Intl.NumberFormat` in the same locale. A `money` value is an integer in
minor units when `unit: 'minor'`, a decimal string when `'decimal'`; the
application's schema decides which, and a mismatch fails validation rather than
silently rounding.

**Why a phase.** It is the recipe with the most ways to be quietly wrong:
floating point, zero-decimal currencies, group separators, and a `"."` that is
already a fine draft.

**Acceptance.**

- `format(parse(text))` is the identity on the recipe's domain, for `en-US`,
  `de-DE` and `ja-JP` (JPY, zero decimals).
- `"1.234,56"` parses in `de-DE` and `"12,3"` is either `12.3` or unparsed by
  the stated rule; it is never `123`.
- `'-'` and `''` are drafts, not errors, until submit.
- A negative amount and a ten-digit amount keep their exact minor units.
- A filled control shows `$1,234.56`, not `123456`.

**Kills.** `format` replaced by `String(value)`; minor-unit scaling removed;
the locale parameter ignored.

### Phase 4 — CRUD presentation (M)

**Build.** `EditorView` (page, drawer, dialog), `ConfirmView`, `Toolbar` in
`foldkit-mixins-crud` (§4.5).

**Why before the screen.** The screen is worth little without a way to draw an
editor and a delete confirmation, and these views are useful on their own to
the applications that already compose `Crud.editor` by hand.

**Acceptance.**

- The dialog focuses its first control on open, traps Tab, closes on Escape
  through the app's Message, and returns focus to the element that opened it —
  browser tests.
- Each editor status draws a distinct state, and `SaveFailed` shows the error
  without closing.
- `ConfirmView` shows the entity's name and cannot confirm without one.
- `renderToString` of the page presentation contains the form's `name`s.

**Kills.** Focus restoration removed; a status arm dropped; the confirm
button enabled with no target.

### Phase 5 — the screen composition (L)

**Build.** `Crud.screen` (§4.6), and `examples/entity` rewritten on it.

**Why last of the semantics.** It composes the pieces; building it sooner would
freeze an API around the parts that Phase 2 to 4 still change.

**Acceptance.**

- `examples/entity` keeps its behaviour and its tests, with the screen handling
  the Model slice, Messages, helpers, wiring and syncs.
- The example's app file shrinks, and the plan records the before and after
  line counts (this is the plan's own productivity measurement, and the honest
  one: one real page, not a synthetic benchmark).
- Opening a row, creating blank, saving, failing a save, and deleting still
  work; the list's query input stays the application's.
- A page built from `Crud.editor` by hand still compiles and passes, so the
  screen is a shorthand, not a replacement.

**Kills.** `after` skipping the remover's sync; `active` dropping the editor;
`close` clearing the wrong slice.

### Phase 6 — files and asynchronous relations (L)

**Build.** `FieldRecipes.file` and `.image` as `Bundle` controls over
`foldkit-media`'s upload: `mixins-ui.FileDrop` for the drop zone, upload
progress in the control's Model, cancel and retry, and the application's
`UploadPolicy` unchanged. An asynchronous relation renderer that replaces the
`select` with a `Combobox` fed by `Crud.options` and a list's `more`.

**Why here.** Both need the Bundle control path, and a Bundle-backed key cannot
change the form's supported nesting (no resources, no checks). Shipping them
earlier would have implied those limits were temporary.

**Acceptance.**

- A file that fails admission keeps the app's error, offers retry, and never
  becomes a value.
- Progress is visible and cancellable, and a cancelled upload leaves the draft
  empty.
- The relation renderer shows the chosen row's label when search results no
  longer contain it, and asks for `more` when the list is near its end.
- Both document, in the README, that they cannot be nested.

**Kills.** cancel ignored; a failed upload set as a value; `more` never
requested.

### Phase 7 — gallery, docs, benchmark (M)

**Build.** `examples/fields`: one page per recipe showing the schema, the
derived control, the draft, the value, and the renderer options, rendered
server-side. A `Form` section in the skill reference for recipes. A measured
comparison against a hand-built TanStack Form + Query page, only if it has
something to measure: lines, files, type errors, focusable failures, and bundle
size, with the method committed beside the numbers.

**Acceptance.** The gallery is built by `pnpm build` and rendered by
`pnpm demo`; every recipe in the catalog appears; each recipe's docs name its
stored form and its failure modes.

## 7. Definition of done for one recipe

A recipe is complete when all of these hold, and each is a test rather than a
claim:

1. **Round trip.** `parse(format(value))` equals `value` on the recipe's
   domain, or the exception is stated and tested.
2. **Partial drafts.** Every partial a person can type is either a draft or an
   explicit `unparsed` message; none throws, none silently becomes a number.
3. **Empty and optional.** Absent, `null`, `Option.none()` and the empty draft
   agree with the key's schema, and `required` matches.
4. **No reformat on change.** Typing never rewrites the draft, so the caret and
   an IME composition survive.
5. **Accessible.** Through both renderers: label, `aria-describedby`,
   `aria-invalid`, `aria-required`, the checking line, and a keyboard path.
6. **Posts without scripts** where the control is a native input; where it
   cannot (a Bundle control), the README says so.
7. **Server markup.** The rendered HTML from `renderToString` carries what a
   no-script post needs.
8. **Localized by parameter, never by global.** Locale and currency are
   `data`, and the same form can hold two currencies.
9. **Read-only form.** A `display` renders the same value for a list or detail
   without importing form internals.
10. **Tested at three tiers.** Unit and property tests for parse/format, a
    Scene test for the view, a browser test for focus or pointer behaviour.

## 8. Packages and entry points

| Package | Entry | Depends on (new) | Ships |
| --- | --- | --- | --- |
| `foldkit-form` | `.` | — | `format`, `Input.choices`, array-of-literal resolution |
| `foldkit-mixins-form` | `.` | — | `Choices` renderer, the `summary` slot |
| `foldkit-mixins-form` | `./ui` | — | the renderer table for every kind |
| `foldkit-crud` | `.` | — | `Crud.screen` |
| `foldkit-mixins-crud` | `.` | — | `EditorView`, `ConfirmView`, `Toolbar` |
| **`foldkit-form-recipes`** (new) | `.` | `foldkit-form`, `foldkit-crud` | `FieldRecipes`, the kinds, displays and words |
| | `./html` | `foldkit-mixins-form` | `RecipeViews.renderers<Message>()` |
| | `./ui` | `foldkit-mixins-ui`, `foldkit-mixins-form/ui` | `RecipeUi.renderers<Message>()` |
| | `./conformance` | `foldkit-form` | the recipe cases |

Why one new package rather than entries in three existing ones: the semantic
half must not import the DOM, the UI half must not be pulled in by an app that
wants plain HTML, and the recipes are published documentation a third party
extends. Three subpaths express that; three packages would spread one catalog
across three version numbers.

`foldkit-plus` re-exports it by subpath, as it does for `foldkit-plus/remote`.

## 9. Risks

1. **`format` changes a fill's text.** It is additive and the only existing
   user of the workaround is `CmsDateTime`, which Phase 2 replaces; still, the
   changelog must say that a value whose control defines `format` now fills
   differently.
2. **Money has no single right representation.** Minor units lose nothing;
   decimal strings survive a database `numeric`. The recipe takes the choice,
   the schema enforces it, and a mismatch must fail loudly rather than round.
3. **A calendar renders what a native input already does.** Phase 2 ships the
   native default first and the calendar second, so a regression in the
   enhancement cannot take the no-script path with it.
4. **The screen recipe can become a second way to compose a page.** It stays a
   composition of public pieces, with the hand-written path in the README and
   in the entity example's own tests.
5. **A file control can invent a second upload path.** It must call
   `foldkit-media`, never `fetch` a bucket itself, and the server's
   `UploadPolicy` stays the authority.
6. **The benchmark can become an unmaintained claim.** It ships only with the
   comparison page and the method; otherwise it does not ship.
7. **A new package is a release cost**: version, matrix, skill reference,
   changelog. Budget it in the release notes of the phase that creates it.
8. **Locale parsing is a bug farm.** The rule is conservative: accept the
   locale's own separators and a plain `.`; refuse ambiguity rather than guess.

## 10. Open questions

1. **Where does an app-wide default live?** Today: nowhere. The audit argues
   for a value (`Entity.annotateMembers`, `inputs`, `renderers`), not a global.
   Revisit only if a real application shows the per-entity call is too much
   ceremony.
2. **Schema annotation, Entity metadata, or form input?** Precedence already
   exists: form `inputs` > member `Input.of` > relation > schema shape. A
   recipe attaches at the same three places; nothing new.
3. **Which stateful controls are allowed to be `Input.bundle`?** Only those
   that need a Model of their own and can live with no `check`, no OutMessage,
   and no nesting with resources. Phase 6 states this in the README rather
   than discovering it in an issue.
4. **Native or custom dates and files?** Native default, custom opt-in (§3,
   principle 3). The custom one is always a renderer swap, never a different
   value type.
5. **Do we need an instant type?** Not in this plan. `dateTime` stores either
   naive local text or an ISO instant with an offset, and the recipe does not
   arithmetic across a zone. A zone-aware value is its own design; it should
   start from `foldkit/calendar`'s deliberate civil-date stance.
6. **Does `Display` reuse the form's formatter?** It already can: a recipe
   returns both, constructed from the same data. `Display.show` is the one
   entry point for a table or detail.
7. **Can a registry be tree-shakeable and deterministic?** A value is; a
   module-level registry is not deterministic across two applications in one
   page. That is the argument of §3, principle 2.
8. **What is the smallest slice worth shipping?** Phases 0, 1, and the `date`
   and `dateTime` halves of 2: a form can then draw every kind through a
   design system and load a stored date correctly, which is the first thing a
   real CRUD page needs.

## 11. How this was checked

- Read in full: `skills/foldkit-plus/references/form.md`, `crud.md`;
  `packages/form/src/input.ts`; `packages/mixins-form/README.md`;
  `packages/cms/src/kinds.ts`; `packages/richtext-dom/src/input.ts`;
  `packages/crud/src/display.ts`; `packages/data-grid/src/crud.ts`; the
  relevant parts of `packages/form/src/index.ts` (fill, `draftOf`, `Changed`,
  `Input.resolve`), `packages/mixins-ui/src/index.ts`, `packages/media`.
- Inventoried by reading each module: `packages/primitives/src` and
  `packages/mixins-ui/src` (a subagent read them module by module; the
  namespace list, the `/ui` bridge and the upstream export map were then
  confirmed directly).
- Absences were searched over `packages/*/src`, `examples/*/src` and
  `@foldkit/ui@0.169.0`'s export map: no `TimePicker`, no date range control,
  no async combobox, no client upload, no `Intl.NumberFormat` for a field
  value, no error summary or form actions, no literal multi-choice kind.
- Not checked: every one of the 92 `mixins-ui` namespaces line by line; the
  upstream components' own behaviour under this repository's SSR and no-script
  paths (Phase 1 and 4 test it, rather than assume it).
