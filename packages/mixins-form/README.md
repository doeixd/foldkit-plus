# foldkit-mixins-form

Writing form markup by hand for every schema field—wiring `<label for>`, `aria-invalid`, `aria-describedby`, `role="alert"` error summaries, nested array controls, and pending submit states—is repetitive and easy to get subtly wrong.

`foldkit-mixins-form` renders any [`foldkit-form`](../form/README.md) declaration into accessible HTML with every element published as a [`foldkit-mixins`](../mixins/README.md) Slot. The form controls drafts, validation, and Messages; this package renders the markup and accessibility attributes; your `Style` and `Behavior` attachments customize how fields look and behave. See forms running live in [the Chirp demo](https://foldkit-chirp-demo.pages.dev/).

## Install

```sh
pnpm add effect foldkit foldkit-bundle foldkit-form foldkit-mixins foldkit-mixins-form
```

## A first form view

Define an Entity-backed form and attach a view to its Bundle with `FormView.submodel` and `FormView.define`:

```ts
import { Schema } from 'effect'
import { Bundle } from 'foldkit-bundle'
import { Entity } from 'foldkit-entity'
import { Form as FormKit } from 'foldkit-form'
import { FormView } from 'foldkit-mixins-form'

const Post = Entity.define(
  'Post',
  Schema.Struct({
    id: Schema.String,
    title: Schema.String.check(Schema.isMinLength(1)).annotate({ title: 'Title' }),
  }),
)
const Edit = FormKit.make('Edit', Entity.input(Post, Schema.Struct({ title: Post.fields.title.schema })))

const Drawn = Edit.bundle.pipe(
  Bundle.withView(FormView.submodel(Edit, FormView.define(Edit))),
)
```

`Drawn` is a complete Bundle you place in a parent Model with your `onOut` handler. Rendering it draws a `<form>` containing a labelled `<input id="Edit-title" type="text">` and an accessible submit button (`aria-disabled` while invalid); typing and submitting route Messages (`Changed`, `Blurred`, `Submitted`, and siblings) back to the form's reducer, and submitting a valid form emits the decoded value to `onOut`.

Two Slot contracts separate form-level and field-level styling:

- **`FormSlots`** wraps the whole form (`root`, `errors`, `failure`, `summary`, `submit`, and nested row controls).
- **`FieldSlots`** wraps each individual field (`root`, `label`, `description`, `checking`, `error`, and control slots) and receives that field's `FieldInput` (such as `input.invalid`) so Styles can react to field validity.

All view state stays in `foldkit-form` and your parent Model. For styling through `foldkit-mixins-ui` components instead of plain HTML controls, use the optional `foldkit-mixins-form/ui` subpath.

<!-- docs-check standalone
import { Option, Schema } from 'effect'
import { Bundle } from 'foldkit-bundle'
import { Entity, Relation } from 'foldkit-entity'
import { Form as FormKit, Input } from 'foldkit-form'
import type { HtmlBuilder } from 'foldkit/html'
import { defineMessageUnion } from 'foldkit/message'
import { Style } from 'foldkit-mixins'
import { FieldSlots, FormSlots, FormView } from 'foldkit-mixins-form'

const Author = Entity.define('Author', Schema.Struct({ id: Schema.String, name: Schema.String }))
const Tag = Entity.define('Tag', Schema.Struct({ id: Schema.String, name: Schema.String }))
const Post = Entity.define(
  'Post',
  Schema.Struct({
    id: Schema.String,
    title: Schema.String.check(Schema.isMinLength(1)).annotate({ title: 'Title' }),
    body: Schema.String,
    status: Schema.Literals(['draft', 'live']),
    featured: Schema.Boolean,
  }),
)
const Blog = Entity.relate(
  { Author, Tag, Post },
  { Post: { editor: Relation.one(Author, { optional: true }), tags: Relation.many(Tag) } },
)
const Edit = FormKit.make(
  'Edit',
  Entity.input(
    Blog.Post,
    Schema.Struct({
      id: Schema.String,
      title: Blog.Post.fields.title.schema,
      body: Schema.optional(Schema.String),
      status: Schema.Literals(['draft', 'live']),
      featured: Schema.Boolean,
      editorId: Schema.NullOr(Schema.String),
      tagIds: Schema.Array(Schema.String),
    }),
    {
      editorId: Relation.input(Blog.Post.relations.editor),
      tagIds: Relation.input(Blog.Post.relations.tags),
    },
  ),
  { inputs: { id: Input.hidden() } },
)
const Drawn = Edit.bundle.pipe(Bundle.withView(FormView.submodel(Edit, FormView.define(Edit))))
const EditForm = Bundle.declare(Drawn, 'form')
const Model = Schema.Struct({ ...EditForm.fields })
type Model = typeof Model.Type
const Message = defineMessageUnion({ ...EditForm.cases })
type Message = typeof Message.Type
declare const model: Model
declare const h: HtmlBuilder<Message>
declare const authors: ReadonlyArray<{ readonly id: string; readonly name: string }>
-->

## Apply theme recipes to fields and forms

`foldkit-mixins-form/recipes` ships token-driven Styles matching `foldkit-mixins-ui` (install `foldkit-mixins-ui` as a peer to use `/recipes` or `/ui`):

```ts
import { Field, Form } from 'foldkit-mixins-form/recipes'

const Looked = FormView.define(Edit, {
  field: FormView.field(Edit).pipe(Style.attach(Style.forSlots(FieldSlots)(Field({})))),
}).pipe(Style.attach(Style.forSlots(FormSlots)(Form({}))))
```

`Field({})` arranges each label above its control with errors in error ink, sizing inputs to match `foldkit-mixins-ui` fields. `Form({})` stacks fields in a column with the validation summary and a primary submit button. Extend recipes with `.extend(...)` rather than forking them.

## Render controls with `foldkit-mixins-ui`

Install `foldkit-mixins-ui` and `@foldkit/ui`, then pass `UiForm.renderers(styles?)` from `foldkit-mixins-form/ui` to swap plain HTML controls for `foldkit-mixins-ui` widgets:

```ts
import * as UiForm from 'foldkit-mixins-form/ui'
import { InputSlots, Recipes, SelectSlots } from 'foldkit-mixins-ui'

const UiView = FormView.define(Edit, {
  renderers: UiForm.renderers({
    input: Style.forSlots(InputSlots)(Recipes.Input()),
    select: Style.forSlots(SelectSlots)(Recipes.Select()),
  }),
})
```

Each key in `renderers` (`input`, `textarea`, `select`, `checkbox`, `checkboxGroup`) is optional. The form keeps ownership of labels, descriptions, `checking` indicators, error alerts, IDs, and ARIA attributes while swapping the inner control element. Note that `Text`, `Number`, `Multiline`, and select styles move from `FieldSlots` onto the UI component Slots, and `Toggle`/`Choices`/`RelationMany` render `role="checkbox"` buttons paired with hidden inputs for progressive enhancement.

## Customize field layouts with UI inputs

`UiForm.field({ toMessage, inputStyle, textareaStyle?, draw?, words? })` builds a per-key `FormView.fields` override for `Text` and `Multiline` controls while preserving labels, required state, descriptions, and validation alerts. Passing `draw` hands your layout function `{ label, control, description, field }` and `h`; omitting `draw` stacks them inside a `FieldSlots` root. Unsupported control kinds throw immediately, so keep non-text fields on the default renderer. Submit buttons in custom layouts use `Button.view` from `foldkit-mixins-ui` while `foldkit-mixins-form` keeps submit handling and `aria-disabled` state.

## Style custom Slots and pass picker options

Attach your own classes directly to `FieldSlots` and `FormSlots` using `Style.whenInput`, then pass `options` and `words` when drawing the placed Bundle (`EditForm` from `Bundle.declare(Drawn, 'form')`):

```ts
import type { FieldInput } from 'foldkit-mixins-form'

const CustomField = FormView.field(Edit).pipe(
  Style.attach(
    Style.forSlots(FieldSlots)({
      root: Style.class('field'),
      text: Style.whenInput<FieldInput>(input => input.invalid, Style.class('is-invalid')),
    }),
  ),
)

const CustomView = FormView.define(Edit, { field: CustomField }).pipe(
  Style.attach(Style.forSlots(FormSlots)({ root: Style.class('form') })),
)
```

Where the parent view draws the placed form (`model` and `h` are the parent's
view arguments, `authors` the loaded picker data):

```ts sketch
EditForm.view(model, h, {
  options: { editorId: authors.map(author => ({ value: author.id, label: author.name })) },
  words: { submit: 'Save' },
})
```

Additional view options:

- **`submits: false`** omits the submit button (useful when a role may edit drafts without submitting).
- **`locked: ['ownerId']`** renders those keys disabled (and includes hidden inputs so non-JS form posts keep their values; the server must still authorize writes). Bundle-backed controls inside a locked key render inside a disabled `<fieldset>`.
- **`options`** supplies `{ value, label }` choices for `RelationOne` and `RelationMany` pickers loaded by your application.
- **`Hidden`** controls render no DOM element.

## Controls, slots, and custom renderers

| Control | Element | Slot |
| --- | --- | --- |
| `Text` | `input type="text"` | `text` |
| `Multiline` | `textarea` | `multiline` |
| `Number` | `input type="text" inputmode="decimal"` | `number` |
| `Toggle` | `input type="checkbox"` | `toggle` |
| `Select` | `select` of control options with blank option | `select`, `option` |
| `Choices` | `role="group"` of checkboxes | `choices`, `choiceLabel`, `choice` |
| `RelationOne` | `select` of `options[key]` with blank option | `select`, `option` |
| `RelationMany` | `role="group"` of checkboxes over `options[key]` | `choices`, `choiceLabel`, `choice` |
| `Nested` | `fieldset` + `legend`, row divs, add/remove buttons | `group`, `legend`, `row`, `add`, `remove` |

Pickers configured with `Input.search()` add an `input type="search"` in the `search` slot (`aria-controls` pointing at the picker), and pickers listed in `more: { authorId: true }` (from `Crud.options`) add a button in `more` dispatching `AskedForMore({ key })`. Stored values missing from loaded `options` appear at the end as `? value` so users can inspect or clear stale IDs. Override button and summary copy through `words` (see [words in one place](../form/README.md#words-as-text-in-one-place)).

### Renderers

Add custom control kinds or override built-in controls through `renderers`:

<!-- docs-check standalone
import { Schema } from 'effect'
import { Entity } from 'foldkit-entity'
import { Form, Input } from 'foldkit-form'
import { Style, SlotView } from 'foldkit-mixins'
import { FieldSlots, FormView, type Renderer } from 'foldkit-mixins-form'

const Cents = Input.kind<{ readonly currency: string }>('Cents', { draft: 'text' })
const Priced = Entity.define(
  'Priced',
  Schema.Struct({ id: Schema.String, cents: Schema.Number, code: Schema.String, total: Schema.String, email: Schema.String }),
)
const PriceForm = Form.make(
  'Price',
  Entity.input(
    Priced,
    Schema.Struct({ cents: Schema.Number, code: Schema.String, total: Schema.String, email: Schema.String }),
  ),
  { inputs: { cents: Cents.of({ currency: 'USD' }) } },
)
declare const myCombobox: Renderer<{ readonly _tag: string }>
-->
```ts
FormView.define(PriceForm, {
  renderers: {
    Cents: ({ draft, change, blurred, state, h }) =>
      h.input([...state, h.Value(String(draft)), h.OnInput(change), h.OnBlur(blurred)]),
    RelationOne: myCombobox,
  },
})
```

Each renderer receives `state` (the control's `id` and ARIA attributes), `draft`, `change`, `blurred`, and `input.following` (for [`Input.following`](../form/README.md#a-key-that-follows-another) regenerate buttons). Controls backed by [`Input.bundle`](../form/README.md#a-control-with-a-model-of-its-own) render their own Bundle view inside the `control` slot unless a custom renderer handles that kind (pass extra inputs via `{ controls: { key: inputs } }`). Missing renderers throw with the kind and key name.

### Per-key overrides and custom layouts

Use `FormView.fields` to override individual field renderers, attach per-key `FieldSlots` styles, or set HTML input attributes (`type`, `placeholder`, `rows`, `autocomplete`, `inputMode`):

```ts
const Fields = FormView.fields(PriceForm, {
  overrides: {
    code: (input, h) => h.input([h.Id(input.id), h.Value(String(input.field.value))]),
  },
  styles: {
    total: Style.forSlots(FieldSlots)({ root: Style.class('total') }),
  },
  attrs: {
    email: { type: 'email', autocomplete: 'email' },
  },
})
```

Call `Fields.field(control, formModel, id, h)` to render a single flat key inside a bespoke layout:

<!-- docs-check
const control = PriceForm.controls[0]!
const formModel = PriceForm.initial
const h = SlotView.inertBuilder<typeof PriceForm.Message.Type>()
-->
```ts
Fields.field(control, formModel, control.key, h, (input, draw) =>
  draw.input([draw.Id(input.id), draw.Value(String(input.field.value))]),
)
```

`Number` controls render `input type="text" inputmode="decimal"` because partial drafts like `"4."` are rejected by native `<input type="number">`.

### Validation summaries, pending checks, and submit states

When a multi-control form is submitted with errors, an alert summary (`FormSlots.summary`, `summaryTitle`, `issues`, `issue`, `issueLink`) appears above the submit button linking to each invalid control (`#id`), removing redundant `role="alert"` from inline field errors. Single-control forms show only the inline field alert.

Async checks (`Validating`) set `aria-busy` on the control and render the `checking` status line; each field root also carries `data-validation` (`NotValidated`, `Validating`, `Valid`, `Invalid`) for CSS selectors.

While waiting on checks (`submitPending`) or an in-flight write (`submitting` read from Remote's mutation ledger or `failure` for server errors), the form sets `aria-busy` and `data-submitting`, and the submit button swaps to `words.submitting` with `aria-disabled="true"`—never native `disabled`, so Enter inside any field still reaches `update` cleanly even on the same frame as an autofill or paste.

<!-- docs-check standalone
import { Schema } from 'effect'
import { Entity } from 'foldkit-entity'
import { Form as FormKit } from 'foldkit-form'
import { FormView } from 'foldkit-mixins-form'

const Post = Entity.define('Post', Schema.Struct({ id: Schema.String, title: Schema.String }))
const Edit = FormKit.make('Edit', Entity.input(Post, Schema.Struct({ title: Post.fields.title.schema })))
const View = FormView.define(Edit)
-->
```ts
import { Bundle } from 'foldkit-bundle'

const NeverPreDisabled = Edit.bundle.pipe(
  Bundle.withView(FormView.submodel(Edit, View, { canSubmit: () => true })),
)
```

## Accessibility guarantees

Controls receive deterministic IDs (`<form>-<key>` or `<form>-<key>-<row>-<key>`), matching `<label for>`, `aria-busy`, `aria-invalid`, `aria-required`, and `aria-describedby` pointing to description, checking, and error elements. `FieldSlots` declares `AriaInvalid` and `AriaDescribedby` so conflicting attribute attachments are caught at render time.

## Limits

- **Fixed field order:** `FormView.define` renders fields in input declaration order (`label`, `control`, `description`, `checking`, `error`); use `Fields.field` over `form.controls` for custom layouts.
- **Picker paging:** Relation pickers render loaded rows as `<select>` or checkboxes with client filtering (`Input.search()`) or a `more` button rather than a virtualized combobox.
- **Render the wrapped Bundle:** Place the Bundle returned by `Bundle.withView(...)` rather than `form.bundle`.

## Next

- Define forms, validation, and nested inputs: [`foldkit-form`](../form/README.md#a-first-form)
- Style Slots with Mixins recipes and Behaviors: [`foldkit-mixins`](../mixins/README.md)
- Render CRUD tables, editors, and delete confirmations: [`foldkit-mixins-crud`](../mixins-crud/README.md)
