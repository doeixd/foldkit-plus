# Schema to UI: field recipes and CRUD workflow recipes

> **Status:** Phases 0 (2026-10-22), 1 to 5 (2026-10-26) built; Phases 6 and 7
> proposed. Written from
> [#188](https://github.com/doeixd/foldkit-plus/issues/188) and an audit of the
> code on 2026-10-22 (§1, §11). §1.3 to §1.8 record what building Phases 0 to 5
> changed in the plan. Blocks marked *Sketch* are shapes to review, not APIs; the phase that
> builds each one fixes its real signature. Where this plan and a package README
> disagree, the README and the source win.

| Phase | Ships | Evidence |
| --- | --- | --- |
| 0 | `Control.format`, `Control.parseList`, `Input.Choices`, array-of-literal resolution, and the plain `Choices` renderer | `packages/form/test/format.test.ts`, `packages/form/test/choices.test.ts`, `packages/mixins-form/test/choices.test.ts`; 9 mutations, all killed |
| 1 | `UiForm.renderers` for every shipped kind, the form's `summary` of fields to fix, `FollowedIssue`, `UiForm.field`'s `words` | `packages/mixins-form/test/uiRenderers.test.ts`, `uiRenderers.browser.test.ts`, `summary.test.ts`, `summary.browser.test.ts`, `ui.test.ts`; 23 mutations, all killed |
| 2 | `foldkit-form-recipes`: `date`, `dateTime` (`local`, or `instant` in a named zone), `email`, `url`, `tel`, `password`, `slug`; `./html` and `./ui` renderers; the CMS on them | `packages/form-recipes/test/*.test.ts`; 22 mutations, all killed |
| 3 | `money` (minor units or decimal text), `decimal`, `percent` (a share or points) | `packages/form-recipes/test/money.test.ts`; 11 mutations, all killed |
| 4 | `EditorView`, `ConfirmView`, `Toolbar` in `foldkit-mixins-crud` | `packages/mixins-crud/test/editor.test.ts`, `editorDialog.browser.test.ts`; 6 mutations, all killed |
| 5 | `Crud.screen`: a screen's four Messages and their `update`; `examples/entity` on it and on Phase 4's views | `packages/crud/test/screen.test.ts`, `screen.test-d.ts`; 6 mutations, all killed |
| 6 | `foldkit-media/browser`'s `upload`; `foldkit-form-recipes/image`; a picker's `more` through `AskedForMore`, `Crud.options`' `more`/`ask` and `Crud.screen`'s `pickers` | `packages/media/test/upload.browser.test.ts`, `packages/form-recipes/test/image.test.ts`, `image.browser.test.ts`, `packages/crud/test/list.test.ts`, `screen.test.ts`, `packages/mixins-form/test/runtime.test.ts`, `examples/entity/test/page.test.ts`; 23 mutations, all killed |
| 7 | `examples/fields`: every recipe through a real form, as a trace (`pnpm demo`) and a server-rendered page each (`pnpm build`); no benchmark (§1.10) | `examples/fields/test/demo.test.ts`, `pages.test.ts`; 3 mutations, all killed |

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

### 1.3 What building Phase 0 changed in this plan

Phase 0 shipped on 2026-10-22 (§6). Building it settled five things this plan had
left as prose.

1. **A hook its draft can never reach is refused by the types.** `parse` and
   `format` are a text draft's, `parseList` a list draft's. `Input.kind`'s spec is
   a union discriminated on `draft`, and each member forbids the others' hooks
   (`parseList?: never` on the text member, say), so `{ draft: 'list', format }`
   does not compile. The runtime throw this plan first described is gone: the test
   that asserted it became three `@ts-expect-error` cases in
   `packages/form/test/input.test-d.ts`. A type is the earliest definition time
   there is; a runtime check would only have covered callers who cast past it.
2. **A phase that adds a kind ships its plain renderer in the same phase.** Phase 0
   adds `Choices`, and without a renderer in `foldkit-mixins-form` the first person
   to take the new inference path meets `no renderer for "Choices"` at render — a
   kind that is advertised and undrawable. The `/ui` renderer may lag a phase; the
   plain one may not.
3. **`format` is a pair with `parse`, and its failure names the form and the key.**
   It runs on `fill` only, never on an edit, so a caret and a composition are never
   disturbed. A value it cannot show fails the fill as
   `Form "X": "key" cannot show that value: …`. That cannot be caught at
   definition time, because it depends on the value.
4. **A filled key is not in the value until it is checked.** `Form.engine.value`
   reads keys that are acceptable, and a required key filled but never validated is
   not acceptable yet. Every acceptance test that reads a filled value validates
   first (`Message.ValidatedAll()`), and the conformance runner (§4.7) does too.
5. **A mutation that breaks a module at import is `invalid`, not `killed`.** The
   runner compares the collected test set, so a test of a *resolver* builds its
   form inside the test: a mutation that stops the resolution then fails an
   assertion instead of emptying the file. The first version of Phase 0's
   resolution mutation was reported invalid for exactly this reason.

Probed rather than assumed, before the resolver was written: `Schema.Array(X)` is
an `Arrays` node with `elements: []` and `rest: [X]` (a `Tuple` is the reverse,
`elements` set and `rest: []`; a `NonEmptyArray` sets both), and an array admits
`[]`. So `rest.length === 1` is the right test for "an array of one thing", and a
`Choices` key is required only when its own schema refuses the empty one.

### 1.4 What building Phase 1 changed in this plan

Phase 1 shipped on 2026-10-26 (§6). Five things came out differently from §4.4
and §6.

1. **The table is the plain renderers under other Slots, not the components'
   views.** `Input.view` writes its own `aria-describedby` (one id), where a
   field names its description, checking line and error; drawing through it
   would have made the two paths differ in what they announce. So Text, Number,
   Multiline and the selects are the plain renderers given `InputSlots`,
   `TextareaSlots` and `SelectSlots` builders in place of FieldSlots', which is
   what makes "the same Messages on both paths" true by construction. An element
   keeps one Slot's class, so a FieldSlots style for those controls no longer
   reaches them; the field around them keeps its own.
2. **Choices and RelationMany use `CheckboxGroupSlots`, not `CheckboxGroup.view`.**
   The view draws a `fieldset` and `legend` of its own, which would name the group
   twice under the field's label. Like Toggle, its boxes are the Checkbox's
   `role="checkbox"` buttons, which post nothing: each checked one holds a hidden
   input named by the key, so a post without scripts carries it.
3. **The summary sits above the submit button and is no live region.** Drawn at
   the top, a field turning invalid on blur would push every field below it
   while the person tabs; each field's error already announces itself.
4. **A link in an application is a navigation.** Foldkit takes every link press
   in a `makeApplication` as a URL request, so an `href="#id"` alone would not
   focus anything once scripts run. The link keeps the `href` for a post without
   scripts, and a press uses `OnClick`'s `focusSelector` (in the press, so a
   phone's keyboard opens) with the default prevented. `OnClick` needs a
   Message, so `foldkit-form` has `FollowedIssue({ id })`, which changes nothing.
5. **A choice that must hold one threw at `Form.make`.** §4.3 said a
   `NonEmptyArray` of literals resolves to a required Choices key; the wiring
   check tried `[]` and an id, and such a schema takes neither. It now also tries
   one of the control's own options.

### 1.5 What building Phase 2 changed in this plan

Phase 2 shipped on 2026-10-26 (§6) as a new package, `foldkit-form-recipes`.

1. **An instant is read in a named zone.** Converting an instant to the text a
   `datetime-local` shows needs a zone, and §7 says locale-like things are
   parameters, never globals: `dateTime({ stored: 'instant', zone })` takes an IANA
   name and refuses an unknown one when it is made. A time the clocks skip is
   refused (a browser's `new Date` silently moves it an hour), and one they repeat
   reads as the earlier. §10.5 still holds: there is no zone-aware value type, and
   no arithmetic across zones. `CmsDateTime` read the browser's zone on every draw,
   which also made a server render disagree with the browser's.
2. **A recipe is `{ control, display }`; `pack` and `merge` are not built.** §4.1's
   sketch put `kind`, `words` and `render` on the recipe and a `pack` over named
   keys. `kind` repeats `control.kind`, and a renderer cannot sit on a value the
   DOM-free entry holds, so renderers are one table per entry (`./html`, `./ui`)
   keyed by kind. With one table per entry nothing yet merges two, so `merge` and
   `pack` wait for an application that needs them.
3. **`slug`'s control is a `ControlChange`.** It follows another key, which only a
   form's `inputs` can say, so `FieldRecipe` is generic in its control and `slug`'s
   cannot go through `Input.of`.
4. **A password has no reveal toggle.** Whether its text shows is state, and a
   renderer has nowhere to keep it; `foldkit-mixins-ui`'s `PasswordInput` keeps it
   in the application. Likewise the `/ui` calendar in a popover (an open month, a
   focused day) waits for a control backed by a Bundle (Phase 6); `./ui` draws the
   native inputs under the Input Slot meanwhile.
5. **The CMS's controls moved rather than being wrapped.** `Cms.slug`,
   `Cms.dateTime`, `Cms.slugify`, `Cms.Input` and `Cms.controlRenderers` are
   removed, so there is one way to make a slug.

### 1.6 What building Phase 3 changed in this plan

1. **A partial amount is an error as it is typed.** §6 asked for `'-'` to be a
   draft, not an error, until submit. The form checks a key on every change, for
   every kind (a required text key emptied reads `Required` at once), so `'-'`
   reads `Enter an amount` as soon as it is typed. It is never a number, and the
   form never throws on it; when errors show is the form's policy (#188's
   "configurable policy for blur/change/submit validation"), which no recipe should
   change on its own.
2. **Grouping is accepted only as the locale writes it.** `12,3` and `12.3` are
   refused unless the locale's decimal separator makes them a decimal, which is
   §6's "never `123`". Rather than a separator heuristic, a grouped draft must be
   exactly what `Intl.NumberFormat` writes for its digits, so `en-IN`'s grouping
   is right as well.
3. **No floating point anywhere an amount passes.** Digits are read as text, minor
   units through `BigInt`, and a value is formatted from a decimal string, which
   `Intl.NumberFormat` formats exactly. A minor amount past
   `Number.MAX_SAFE_INTEGER` is refused; `unit: 'decimal'` holds any size.
4. **`decimal`'s value is a number and `percent` has a unit.** `percent` stores
   the share (`0.125`) or the points (`12.5`), both shown `12.5%`; a stored
   number with more decimals than the scale fails the fill rather than being
   rounded into it.

### 1.7 What building Phase 4 changed in this plan

1. **The views take their state, not a placed editor.** §4.5 had
   `EditorView.define(placedEditor)`. Each view is instead given what it draws:
   `status` (`Editor.status(model)`), the form already drawn by its own view, and
   the save error. A placed handle would have bound the view to `Crud.editor`'s
   generics for one call each, and a hand-composed editor could not use it.
2. **There is no `presentation`.** A Dialog's and a Drawer's open state is a Model
   the application holds (`@foldkit/ui`'s), so a view that drew one would own a
   second copy of it. The application draws the `EditorView` inside the Dialog or
   Drawer it places. The browser test does that with a real Dialog: focus enters
   on open, stays through Tab, Escape closes through the application's Message,
   and focus returns to the opener. Each is the Dialog's, so §6's "focus
   restoration removed" kill has no line here to mutate; the test is what shows
   the editor does not break it.
3. **`ConfirmView` takes the thing's `name` as an `Option`.** It is what a person
   recognises (a title), which the remover does not know; with none the confirm
   button is disabled.

### 1.8 What building Phase 5 changed in this plan

1. **The screen is Messages and an `update`, not a Model slice.** §4.6 had the
   screen own `{ editor, remover }` and return a placed handle with `active` and
   `after`. A Bundle composed with `Bundle.compose` cannot itself be placed as a
   child, so owning the slice meant writing the children's routing (their
   Messages, Commands, Subscriptions and Resources) a second time, or generating
   the page's field names through template-literal types inside Bundle's own
   pipe steps. `Crud.screen(name, { id })` instead names the four Messages for
   `Bundle.withMessages` and wraps `update`; the page keeps its two `withChild`,
   two `configure`, two `at` and its `active`.
2. **The measurement, on `examples/entity`.** `app.ts` went from 242 lines to
   240: three Message cases and three `update` cases left, a declaration and its
   comment came in, and the `after` wrap became the screen's. `view.ts` went from
   114 to 117 drawing its editor and delete question through `EditorView` and
   `ConfirmView`, and now says every editor state: `Conflict` and `Moved` said
   nothing before, and a failed save was a status line rather than an alert. (The
   commit that made that change says the old view drew five states' lines; it
   drew six.) The shorthand's value is that the
   four cases are stated once and named after the screen, not that the page is
   shorter; §6's "the example's app file shrinks" is met, by two lines.
3. **No remover sync to compose.** A remover has no sync of its own (its state is
   the mutation's), so §6's "`after` skipping the remover's sync" has no line to
   mutate; "`close` clearing the wrong slice" is the `ClosedPost` routing mutation.

### 1.9 What building Phase 6 changed in this plan

1. **No upload client existed.** `foldkit-media` had the route and no browser
   side, so Phase 6 begins with `foldkit-media/browser`'s `upload(file, { url?,
   headers? })`: a `Stream` of `Progressed` and one `Uploaded`, failing with
   `UploadFailed` whose `reason` names the route's refusal. It is an
   `XMLHttpRequest`, since `fetch` reports no upload progress, and interrupting
   the stream aborts it. Chromium reports no upload progress for a request CDP
   holds, so its progress is tested against the dev server, and its answers
   through CDP.
2. **`image` only, in an entry of its own.** The route takes images alone, so
   there is no `file` recipe until a route takes other files. `image` is
   `foldkit-form-recipes/image`, not `FieldRecipes.image`, because it brings
   `foldkit-media`, `@foldkit/ui` and `foldkit-mixins-ui` with it. Its control
   is a Bundle whose upload is a Subscription keyed by the send's attempt
   number: Cancel ends it, and so aborts the request, and a cancelled send's
   late events are ignored. Words and styles are the recipe's options, since a
   form draws a Bundle control with no view inputs unless `controls` gives
   some. The drop zone's `id` is required: two keys sharing a default would
   share ids.
3. **The picker stays a `select`, and asks with a button.** A `Combobox` holds
   its open state and highlight in the application's Model, which a renderer
   has nowhere to keep; a picker that searches already has its search box. What
   was missing was the list's next page. A list's `more` changes the page's
   Model, which a form cannot reach, so the press is the form's no-op
   `AskedForMore({ key })` (as `FollowedIssue` is), and `Crud.screen`, given
   `Crud.options`' pickers, reads it out of the page's Message through the
   editor placement's link and answers with `pickers.ask`. `pickers.more(model)`
   says which pickers to offer it, from the page read's `hasNext`. A picker in
   a nested row is not offered more: `Crud.options` keys only the form's own.
4. **Measured on `examples/entity`.** Its author list now shows one author a
   page, so the page test opens a post whose editor is on the second page:
   she is named first, the picker offers more, a press brings her into the
   list, and the button goes.

### 1.10 What building Phase 7 changed in this plan

1. **The gallery reads, it does not restate.** Each entry is a schema, a
   stored value, a draft to type and one refused; the gallery fills a real
   one-key form and reports what it made of each, so a recipe whose behaviour
   moved changes the trace and fails its test. Only the call and the failures
   are hand-written. A page per recipe is rendered on the server with the plain
   renderers and no script, by the example's `build`, which `pnpm build` runs.
2. **No benchmark.** §6 asks for one against a hand-built TanStack Form + Query
   page only if it has something to measure, and there is no such page here
   (`examples/tanstack` is an interpreter). Writing one to compare against
   would be the synthetic benchmark §1.8 set aside; the honest measurement
   remains `examples/entity`'s before and after.

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

A recipe is one value with three projections, and the first two carry no DOM:

```ts
// Sketch. Semantics: no DOM, no view types.
interface FieldRecipe<Data> {
  readonly kind: string
  readonly control: Control<Data>   // carries its own `data`
  readonly display: Display
  readonly words?: RecipeWords
  /**
   * The plain renderer, beside the control and the display. Absent only for a
   * kind whose drawing is always the application's (a rich-text editor).
   */
  readonly render?: <Message>(context: FieldContext<Message>) => Html<Message>
}
```

A renderer is typed structurally the way `packages/cms/src/kinds.ts` already
types `controlRenderers` and `displayRenderers`, so the semantic entry point of a
recipe package need not depend on `mixins-form` to describe what it draws.

A **pack** is a value over named keys, so an application says each thing once and
cannot attach a control without its display:

```ts
// Sketch.
const Product = FieldRecipes.pack({
  price: FieldRecipes.money({ currency: 'USD', unit: 'minor' }),
  publishedAt: FieldRecipes.dateTime({ stored: 'instant' }),
  tags: FieldRecipes.choices(['new', 'sale']),
})

Entity.annotateMembers(Product.members)                 // Input.of and Display.of per key
const ProductForm = Form.make('Product', ProductInput, { inputs: Product.inputs })
const View = FormView.define(ProductForm, { renderers: Product.renderers<Message>() })
const Table = ListView.forMessages<Message>().define(ProductList, {
  renderers: Product.displayRenderers<Message>(),
})
```

`pack` is a convenience over the three mechanisms that already exist — `Input.of`,
`Form.make`'s `inputs`, `FormView`'s renderers — and not a fourth place a control
can come from: `FieldRecipes.money(...)` alone is still a value attached by hand.
`members` and `inputs` are keyed by the pack's names, so a key the form does not
have is a type error; the two renderer tables are keyed by kind, so a recipe the
form does not use costs nothing. A pack asked for its renderers refuses when one
of its recipes has none — naming the recipe — rather than drawing nothing for it.

`FieldRecipes.merge(...)` combines two packs' renderer tables and refuses two
recipes claiming one kind.

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
- A `format` that throws fails the fill, naming the form and the key. Phase 0
  wraps the call where `fill` reads each value, so the message reads
  `Form "X": "key" cannot show that value: …`.
- `undefined` and `null` stay the empty draft; `Option.none()` too.
- **It is a pair with `parse`.** `parse(format(value))` is `value` on the
  recipe's domain, which the conformance suite tests (§4.7); a recipe whose two
  directions disagree is not shippable.
- **Only a text draft has one.** `Input.kind`'s spec is discriminated on `draft`,
  so `{ draft: 'list', format }` is a type error, not a hook that is silently
  never called (§1.3).

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

### 4.3 Multi-choice literals — built in Phase 0

A key typed `Schema.Array(Schema.Literals([...]))` had no control:
`fromSchema` reads `SchemaShape.present(schema.ast)`, which yields the array node
itself, so `Form.make` threw. Phase 0 added:

- **`Input.choices(options)`** with draft `'list'`, an option read by its own
  text (so a numeric option is stored as the number it is), and an `unparsed`
  word for a value that is not one of them.
- **`fromSchema` resolving an array of literals to `Choices`**, as unambiguous as
  the single-literal case it already resolved. It reads `Arrays.rest` and
  requires exactly one item (a `Tuple` has none, so it still throws); the item is
  one literal or a union of them, and every member must be a string or a number.
- **A plain renderer**, a group of checkboxes in the `choices` slot, each named
  by its key so a form post carries them. It shares one helper with
  `RelationMany`, which already drew that group: one group, two option sources.

Semantics worth stating, because they are not obvious:

- **Never required when the schema admits `[]`.** An array does, so an empty
  choice is a valid value. An array that refuses it — `Schema.NonEmptyArray`, or
  an `Array` with a length check — resolves to the same kind and is required by
  its own schema at submit.
- **The options are the control's own**, so a draft can only hold a value that is
  offered — a stored draft that predates an option change is shown as `? value`
  (the group's existing behaviour) and can be let go.
- **`Array<Literal>` is not `Array<String>`.** Text says nothing about its values,
  so it still throws at `Form.make`, naming the key: the resolver infers only what
  the schema spells out.

### 4.4 The `/ui` renderer table

`foldkit-mixins-form/ui` today is a `field()` override that handles Text and
Multiline and throws otherwise. Replace the control half with a table that covers
every shipped kind, and keep `field()` as the layout entry, built on the table.
Unsupported kinds keep throwing by name.

The mechanism is not the same for every kind, and the table says which:

| Kind | Drawn through | Why |
| --- | --- | --- |
| `Text`, `Number` | `mixins-ui`'s `Input.view` | a number's draft is text, so it stays a text input with `inputMode` — not `NumberField`, whose value is a `number` and would refuse `"4."` |
| `Multiline` | `Textarea.view` | as today |
| `Toggle` | `Checkbox`'s slots, resolved with `SlotView.buildersFor` | the field's control is a checkbox; `Switch` is a setting's affordance, not a form field's |
| `Select`, `RelationOne` | `Select`'s slots, resolved the same way | a native `<select>`, which is what upstream's adapter is |
| `Choices`, `RelationMany` | `CheckboxGroup.view` | one group for both option sources, as the plain path draws it |

`ui.ts` already resolves `FieldSlots` with `SlotView.buildersFor`, so the
slot-bundle mechanism is the one that file already uses, and every adapter's style
is optional: a table with no styles is still a complete, unstyled form.

Every kind keeps what the plain path promises: the key as `name`, the control's
`id`, `aria-invalid`, `aria-describedby` naming the description, the checking line
and the error. The checking line's words come from the form's `words`:
`mixins-ui`'s `descriptionOf` writes `Checking…` as a literal today
(`packages/mixins-ui/src/field.ts`), and the table must not inherit that.

### 4.5 CRUD presentation

Three stateless views in `foldkit-mixins-crud`, each given state and Messages and
owning neither:

- **`EditorView.forMessages<Message>().define(placedEditor)`** — inputs
  `{ status, model, options, locked, words, presentation, onClose }`; it draws the
  form's view in the body, a title from the entity and the words, the save error,
  and an actions row. `presentation` is `'page' | 'drawer' | 'dialog'`, and the
  last two render inside the Dialog or Drawer that already exists, so focus and
  dismissal are those components' rules and not a third implementation. Slots:
  `root`, `frame`, `title`, `body`, `actions`, `error`.
- **`ConfirmView.forMessages<Message>().define(placedRemover)`** — inputs
  `{ status, target, words, onConfirm, onCancel }`; slots `root`, `body`,
  `actions`. It draws the target's name and cannot confirm without one.
- **`Toolbar.forMessages<Message>().define()`** — inputs
  `{ search, filters, sort, actions }`, each optional and each a slot the
  application fills with its own controls; slots `root`, `search`, `filters`,
  `sort`, `actions`. It reads no query state: filtering and sorting stay the
  query's input, in the application's Model.

A view owns no lifecycle: saving is `Crud.editor`'s, deleting is
`Crud.remover`'s, dismissing is the application's Message. Focus enters on open
and returns to the opener — a browser test, not a unit test.

### 4.6 `Crud.screen`: composition, not a new owner

```ts
// Sketch.
const Posts = Crud.screen('Posts', {
  list: PostList,        // a Crud.list result: its columns, choices and query
  editor: PostEditor,    // a Crud.editor result
  remover: Remover,      // a Crud.remover result
})

const Placed = Posts.at({
  data: Data,
  model: App.model.posts,           // the screen's own Model slice
  input: model => Option.some({ search: model.search }), // the query's input
})
```

`at` returns `{ active, update, after, helpers, editor, remover }`: `helpers` is
`{ blank, open, close, ask }`, `after` composes both syncs, and `editor` and
`remover` are the placed handles their views take. `list` may be omitted for a
create-only screen (then no list state is read and the application wires its own
pickers); `remover` may be omitted for a screen that cannot delete.

It composes pieces that already exist; it does not build a form, a mutation or a
query. It owns exactly four things:

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

The screen's own config keys beyond the sketch above are Phase 5's design work.
What it must not do is fixed here: no hidden query, no second cache, no second
permission check.

### 4.7 Conformance

`foldkit-form-recipes/conformance` exports the observations *and* the runner, so
a third-party recipe does not re-implement the loop:

```ts
// Sketch.
interface RecipeAction {
  readonly fill?: ReadonlyArray<unknown>  // values to fill with, in order
  readonly type?: ReadonlyArray<string>   // drafts typed, in order
}

interface RecipeObservation {
  readonly drafts: ReadonlyArray<string>
  readonly value: 'some' | 'none'
  readonly unparsed: boolean
  readonly required: boolean
}

RecipeConformance.probe(recipe, schema, action): RecipeObservation
RecipeConformance.cases: ReadonlyArray<{
  readonly what: string
  readonly recipe: FieldRecipe<unknown>
  readonly action: RecipeAction
  readonly expect: Partial<RecipeObservation>
}>
```

`probe` builds a `Form.make` over the recipe and the schema, runs the actions,
validates (`Message.ValidatedAll()` — a filled key is not in the value until it is
checked, §1.3), and reads four things: the drafts, whether the value is `Some`,
whether the key reads unparsed, and whether the key is required. One place reads
them the same way for every recipe, which is what makes "complete" checkable
rather than aspirational (§7). The shipped `cases` are the table a recipe's own
test iterates; the runner is what lets a third party add a recipe and be held to
the same bar.

## 5. The catalog, by phase

| Phase | Recipes | Plain renderer | Why it is more than a kind |
| --- | --- | --- | --- |
| 2 | `date`, `dateTime` | `input type=date`, `type=datetime-local` | a stored form, a local text form, and a format that survives a fill |
| 2 | `email`, `url`, `tel`, `slug`, `password` | `input` with the type, `autocomplete` and `inputmode` the recipe implies | element attrs, masking rules, and a display |
| 3 | `money`, `decimal`, `percent` | `input` with `inputmode` | locale parsing, minor units, zero-decimal currencies |
| 6 | `image`, `file` | `FileDrop` and a progress line | a Bundle control (progress, cancel, retry) over `foldkit-media`'s upload |
| 6 | relation search | `Combobox` over the rows found | paging inside the picker, through `Crud.options` and a list's `more` |

A phase that adds a kind ships its plain renderer in the same phase (§1.3); the
`/ui` renderer may follow in Phase 1's table or later.

Deliberately not in the first catalog: location, signature (a component exists,
a legal requirement does not), barcode, payment, tax id, cron, semver, tree
selectors, permission matrices. Each needs a design question answered before it
needs a kind.

## 6. Phases

Each phase ships on its own, with the gates the repository runs
(`format:check`, `typecheck`, `test`, `demo`, and `e2e` where an example has a
server), a mutation spec for the new behaviour, and a browser test where the
claim is about focus or layout.

### Phase 0 — the form contract (S) — **built 2026-10-22**

**Built.** `Control.format` and `Control.parseList`; an `Input.kind` spec
discriminated on `draft`, so a hook its draft can never reach is a type error
rather than a runtime throw; `Input.Choices` and array-of-literal resolution; and
the plain `Choices` renderer, sharing one group helper with `RelationMany`.

**Evidence.** `packages/form/test/format.test.ts`, `packages/form/test/choices.test.ts`,
`packages/mixins-form/test/choices.test.ts`, three `@ts-expect-error` cases in
`packages/form/test/input.test-d.ts`, and nine mutations across two specs, all
killed. §1.3 records what building it changed in this plan.

**Why first.** Every formatted recipe depends on it, and it is additive: no
existing form changes behaviour.

**Acceptance, as written before the build.**

- Filling a control whose `format` renders `12.34` puts `12.34` in the draft;
  a control without one still shows `String(value)`.
- `Schema.Array(Schema.Literals(['a', 'b']))` resolves to `Choices` instead of
  throwing at `Form.make`.
- `Input.choices` accepts `['a', 'b']`, refuses `'c'` as unparsed, and submits
  the literals themselves.

**Kills.** `format` replaced by an identity function; `parseList` skipped;
`Choices.parse` replaced by `() => options[0]`; the array resolution disabled;
the group drawn with no options, unnamed, or nothing checked.

### Phase 1 — renderers for every kind (M) — **built 2026-10-26**

**Built.** `UiForm.renderers(styles?)`, typed by every shipped kind; the
`summary`, `summaryTitle`, `issues`, `issue` and `issueLink` slots with
`words.summary` and `words.issue`; `foldkit-form`'s `FollowedIssue`; and
`UiForm.field`'s `words`. §1.4 says where it departs from the text below,
which is kept as it was planned.

**Build.** The `/ui` renderer table (§4.4), including the `/ui` drawing of
`Choices` (the plain one shipped in Phase 0); `field()` rebuilt on the table; a
`summary` slot in `FormSlots` whose content lists each invalid key as a link to
its control's id, so it focuses the field natively and works without scripts.

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

### Phase 2 — dates, times, and the text-shaped pack (M) — **built 2026-10-26**

**Built.** `foldkit-form-recipes` with `date`, `dateTime`, `email`, `url`, `tel`,
`password`, `slug` and `slugify`; its `./html` and `./ui` renderers; the CMS and
its example on them. §1.5 says where it departs from the text below, which is
kept as it was planned.

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

### Phase 3 — money and numbers (M) — **built 2026-10-26**

**Built.** `money`, `decimal` and `percent` in `foldkit-form-recipes`, with their
displays and `inputmode` renderers. §1.6 says where it departs from the text
below.

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

### Phase 4 — CRUD presentation (M) — **built 2026-10-26**

**Built.** `EditorView`, `ConfirmView` and `Toolbar` in `foldkit-mixins-crud`.
§1.7 says where it departs from the text below.

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

### Phase 5 — the screen composition (L) — **built 2026-10-26**

**Built.** `Crud.screen`, and `examples/entity` on it and on Phase 4's views.
§1.8 says where it departs from the text below, and what it measured.

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
| `foldkit-form` | `.` | — | **built**: `Control.format`, `Control.parseList`, `Input.Choices`, array-of-literal resolution |
| `foldkit-mixins-form` | `.` | — | **built**: the `Choices` renderer; Phase 1: the `summary` slot |
| `foldkit-mixins-form` | `./ui` | — | the renderer table for every kind |
| `foldkit-crud` | `.` | — | `Crud.screen` |
| `foldkit-mixins-crud` | `.` | — | `EditorView`, `ConfirmView`, `Toolbar` |
| **`foldkit-form-recipes`** (new) | `.` | `foldkit-form`, `foldkit-crud` | `FieldRecipes` and `pack`, the kinds, displays and words |
| | `./html` | `foldkit-mixins-form` | the plain renderers a pack projects |
| | `./ui` | `foldkit-mixins-ui`, `foldkit-mixins-form/ui` | the UI renderers a pack projects |
| | `./conformance` | `foldkit-form` | `RecipeConformance.probe` and the cases |

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
9. **A kind can ship advertised and undrawable.** Phase 0 met this: `Choices`
   resolved from a schema and had no renderer, so the first user of the new
   inference path got a render-time throw. A phase that adds a kind ships its
   plain renderer in the same phase (§1.3).
10. **The hook refusal is only as good as the types.** A discriminated spec
    catches every typed caller; a cast walks past it. A runtime check would have
    covered only the cast — the narrower case — so the type is the better place,
    and the `@ts-expect-error` cases in `packages/form/test/input.test-d.ts` are
    load-bearing: without them, a widening of the spec would pass unnoticed
    (§1.3).

## 10. Open questions

1. **Where does an app-wide default live?** Today: nowhere. The audit argues
   for a value (`Entity.annotateMembers`, `inputs`, `renderers`), not a global.
   Revisit only if a real application shows the per-entity call is too much
   ceremony.
2. **Schema annotation, Entity metadata, or form input?** Precedence already
   exists: form `inputs` > member `Input.of` > relation > schema shape. Phase 0
   added one more shape the last step reads (an array of literals) and changed
   nothing else about it: a recipe attaches at those three places, and no
   registry is needed.
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
8. **What is the smallest slice worth shipping?** Answered, and half shipped:
   Phase 0 is built (§1.3), and what remains of the smallest slice is Phase 1
   plus the `date` and `dateTime` halves of Phase 2 — a form that draws every
   kind through a design system and loads a stored date correctly, which is the
   first thing a real CRUD page needs.

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
- Phase 0 (2026-10-22): the AST shapes above were probed against the installed
  Effect before the resolver was written, and its two mutation specs ran under
  `pnpm mutate` with nine mutations, all killed. Its first attempt at the
  resolver's mutation was reported `invalid` rather than killed, because the
  test built its form at module scope — the reason §1.3 records that a resolver
  test must build its form inside the test.
