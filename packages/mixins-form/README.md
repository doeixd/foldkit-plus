# foldkit-mixins-form

Draws a [`foldkit-form`](../form/README.md) form as plain, accessible HTML, with
every element published as a [`foldkit-mixins`](../mixins/README.md) Slot. The
form decides what is edited and whether it is valid; this package decides which
elements show it; your Style and Behavior attachments decide how it looks and
what else it does.

## What it owns

| Fact | Owner |
| --- | --- |
| The keys, their controls, drafts, and validity | `foldkit-form` |
| Which element draws each control, and its accessibility wiring | `foldkit-mixins-form` |
| Classes, inline style, extra attributes and events | your `Style` / `Behavior` attachments |
| The options of a relation picker, the submit button's words | the application, as view inputs |

The optional `foldkit-mixins-form/ui` entry draws every control through
`foldkit-mixins-ui`'s components. The main entry keeps the plain-HTML path and
does not import that integration.

It holds no state and adds no Messages. Every event it installs dispatches one
of the form's own Messages: `Changed`, `Toggled` (a press on a flag or a choice,
applied to the draft as it lands), `Blurred`, `Searched`, `Submitted`, the row
Messages, `FollowedIssue` and `AskedForMore`.

## Mental model

```text
Form.make(...)                     the form: controls + bundle (no view)
      |
FormView.field(form)               one field, as a SlotView over FieldSlots
      |   .pipe(Style.attach(...))
FormView.define(form, { field })   the whole form, as a SlotView over FormSlots
      |   .pipe(Style.attach(...))
FormView.submodel(form, view)      a Submodel view taking { options, words }
      |
form.bundle.pipe(Bundle.withView(...))   the same Bundle, now drawable
      |
placed.view(model, h, { options })
```

There are two slot contracts because a form is one thing and its fields are
many: `FieldSlots` is resolved once per field, with that field as its input, so
a Style can depend on `input.invalid` or `input.control`.

## Install

```sh
pnpm add effect foldkit foldkit-bundle foldkit-form foldkit-mixins foldkit-mixins-form
```

## Start without customization

Given `Edit`, a `Form.make` result from the
[Form example](../form/README.md#example), the default rendering path is:

<!-- docs-check standalone
import { Schema } from 'effect'
import { Entity, Relation } from 'foldkit-entity'
import { Form as FormKit, Input } from 'foldkit-form'

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
-->

```ts
import { Bundle } from 'foldkit-bundle'
import { FormView } from 'foldkit-mixins-form'

const Drawn = Edit.bundle.pipe(
  Bundle.withView(FormView.submodel(Edit, FormView.define(Edit))),
)
```

Declare and place `Drawn` using the normal Bundle API, with the form's `onOut`
handler. Rendering that placement shows the controls; typing routes the form's
Messages to its reducer; submitting a valid form sends its decoded value to
`onOut`. No request is made unless that handler returns one.

The next example replaces this unstyled `Drawn` with field and form styles.

## A look for the field and the form

The views draw unstyled Slots. `foldkit-mixins-form/recipes` gives both a look
over the theme's tokens, as `foldkit-mixins-ui`'s `Recipes` do for its
components (it needs `foldkit-mixins-ui` installed, as `/ui` does):

```ts
import { Style } from 'foldkit-mixins'
import { FieldSlots, FormSlots, FormView } from 'foldkit-mixins-form'
import { Field, Form } from 'foldkit-mixins-form/recipes'

const Looked = FormView.define(Edit, {
  field: FormView.field(Edit).pipe(Style.attach(Style.forSlots(FieldSlots)(Field({})))),
}).pipe(Style.attach(Style.forSlots(FormSlots)(Form({}))))
```

- `Field({})` puts the label over the control and what the field says under it,
  in a grid: a control with no width of its own stretches, a checkbox keeps its
  box. Text, number, a select and a picker's search box take
  `foldkit-mixins-ui`'s field looks, so a form drawn with `UiForm.renderers`
  below looks the same. A failure reads in the error's ink.
- `Form({})` sets the fields in a column, the list of fields to fix in the
  error's colours, and the submit as the primary button, as wide as its words.

Adjust one with `.extend`, never a fork, as `foldkit-mixins-crud/recipes` are.

## A form drawn through `foldkit-mixins-ui`

Install `foldkit-mixins-ui` and its `@foldkit/ui` peer to use the optional
`foldkit-mixins-form/ui` entry. Import it as `UiForm`.

`UiForm.renderers(styles?)` is a renderer for every kind `foldkit-form` ships,
given to the whole-form view like any other renderers:

```ts
import { Style } from 'foldkit-mixins'
import { FormView } from 'foldkit-mixins-form'
import * as UiForm from 'foldkit-mixins-form/ui'
import { InputSlots, Recipes, SelectSlots } from 'foldkit-mixins-ui'

const UiView = FormView.define(Edit, {
  renderers: UiForm.renderers({
    input: Style.forSlots(InputSlots)(Recipes.Input()),
    select: Style.forSlots(SelectSlots)(Recipes.Select()),
  }),
})
```

Each style is optional and names its component: `input` (Text and Number),
`textarea`, `select` (Select and RelationOne), `checkbox` (Toggle) and
`checkboxGroup` (Choices and RelationMany). A table with no styles still draws a
complete form, unstyled.

What the table changes is the control, not the field. The label, description,
checking line and error stay the form view's, and each control keeps the plain
one's name, id, `aria-invalid`, `aria-required` and `aria-describedby`, so the
same interaction sends the same Messages either way. Text, Number, Multiline and
the selects are the plain elements under the component's Slot; a `FieldSlots`
style for `text`, `number`, `multiline` or `select` no longer reaches them, since
an element keeps one Slot's class. Toggle, Choices and RelationMany are the
Checkbox's `role="checkbox"` buttons, which Space presses and their label names;
a button posts nothing, so each checked one holds a hidden input with the key's
name, and a form posted without scripts still carries the value it was drawn
with; unlike the plain checkboxes, those buttons cannot be changed until a script
runs.

## UI-backed fields with a custom layout

`UiForm.field({ toMessage, inputStyle, textareaStyle?, draw?, words? })` returns a
`FormView.fields` override for Text and Multiline keys. `toMessage` wraps the
form's Changed/Blurred Messages in the caller's Message universe (use an
identity function for a whole-form view). Styles target `InputSlots` and
`TextareaSlots`; their input is the field's validation state.

The override preserves field names, labels, required state, descriptions,
checking status and errors. `draw` receives `label`, `control`, `description`
and `field` plus the caller's HTML builder, so layout and validation marks can
remain application-owned. Without `draw`, it stacks the parts in a FieldSlots
root. Unsupported control kinds throw; keep them on the default renderer or
provide another override.

Use the override with `Fields.field` for a custom layout or the per-key
`overrides` table for `Fields.view`. Submit buttons in a custom layout use
`Button.view` from `foldkit-mixins-ui`; the form still owns submission and the
parent owns any request. The generated view retains its submit button, drawn
`aria-disabled` while the form cannot submit (see below).

The [waitlist](../../examples/foldkit/form/src/main.ts) and
[login](../../examples/foldkit/auth/src/page/loggedOut/page/login.ts) are real
custom-layout adopters. The [UI integration tests](test/ui.test.ts) demonstrate
the generated view with UI field overrides through a Submodel and a
`FormView.submodel(..., { canSubmit: form.isValid })` marking.

## Example

`Edit` is a `Form.make` result, as in the
[`foldkit-form` README](../form/README.md#example).

<!-- docs-check standalone
import { Schema } from 'effect'
import { Entity, Relation } from 'foldkit-entity'
import { Form as FormKit, Input } from 'foldkit-form'

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
-->

```ts
import { Bundle } from 'foldkit-bundle'
import { Style } from 'foldkit-mixins'
import { FieldSlots, FormSlots, FormView, type FieldInput } from 'foldkit-mixins-form'

const Field = FormView.field(Edit).pipe(
  Style.attach(
    Style.forSlots(FieldSlots)({
      root: Style.class('field'),
      text: Style.whenInput<FieldInput>(input => input.invalid, Style.class('is-invalid')),
    }),
  ),
)

const View = FormView.define(Edit, { field: Field }).pipe(
  Style.attach(Style.forSlots(FormSlots)({ root: Style.class('form') })),
)

// The form's own Bundle, given a view. Place this one instead of `Edit.bundle`.
const Drawn = Edit.bundle.pipe(Bundle.withView(FormView.submodel(Edit, View)))
```

In the following integration fragment, `EditForm` is the placement of `Drawn`,
`model` and `h` are the parent view arguments, and `authors` is the loaded picker
data. Where the parent draws the placement:

```ts sketch
EditForm.view(model, h, {
  options: { editorId: authors.map(author => ({ value: author.id, label: author.name })) },
  words: { submit: 'Save' },
})
```

- `FormView.define(Edit)` alone is a complete, unstyled form. `field` is only
  for changing how fields are drawn.
- `submits: false` draws the form without its submit button, for someone who
  may not submit it (a writer, where the submit publishes).
- `locked: ['ownerId']` draws those keys `disabled`: shown, not editable, for
  a key the person may not set (`foldkit-guard`'s `May.canSet` says which).
  It is a hint; the server checks the write. A key in a nested row is not
  locked by it. A Bundle-backed key drawn by its Bundle's view has that view
  inside a disabled fieldset, which disables the buttons and inputs in it;
  anything else it draws that takes a press or a drop, it does not stop.
  A disabled control is left out of a form post, so a locked key's value is
  also drawn as a hidden input: a form posted with scripts off still sends it.
- `options` is keyed by the form's keys and is where a relation picker's choices
  come from. The form names the target Entity; listing it is a query you make,
  so the choices are yours to load, filter, and label.
- A `Hidden` control is not drawn.

## What is drawn

| Control | Element | Slot |
| --- | --- | --- |
| `Text` | `input type="text"` | `text` |
| `Multiline` | `textarea` | `multiline` |
| `Number` | `input type="text" inputmode="decimal"` | `number` |
| `Toggle` | `input type="checkbox"` | `toggle` |
| `Select` | `select` of the control's own options, with a blank while nothing is chosen | `select`, `option` |
| `Choices` | a `role="group"` of checkboxes over the control's own options | `choices`, `choiceLabel`, `choice` |
| `RelationOne` | `select` of `options[key]`, with a blank | `select`, `option` |
| `RelationMany` | a `role="group"` of checkboxes over `options[key]`, each in a `label` with its words | `choices`, `choiceLabel`, `choice` |
| `Nested` | a `fieldset` with a `legend`, a `div` per row holding the nested form's fields, and `button type="button"`s to add and remove a row | `group`, `legend`, `row`, `add`, `remove` |

A `RelationOne` or `RelationMany` that searches (`Input.search()`) gets an
`input type="search"` above it, in the `search` slot, labelled `Search <label>`
and naming the picker it controls with `aria-controls`. `words.search` in the
view inputs replaces the word. The blank choice of a `select` has no words
unless `words.none` gives it some ("none"). A picker of the form itself that
the view inputs' `more` names (`more: { authorId: true }`, which
`foldkit-crud`'s `Crud.options` gives as `pickers.more(model)`; another key is
a type error, and a form with no picker takes no `more`) gets a
`button type="button"` under it, in the `more` slot, worded by `words.more`
(default `Show more`) and naming the picker with `aria-controls`; a press sends
the form's `AskedForMore({ key })`, for the page that owns the list to answer.
All of the view's words (`submit`,
`submitting`, `resubmit`, `checking`, `search`, `none`, `add`, `remove`, `more`, `summary`,
`issue`, `inRow`) are text: `add` fills `{label}`, `remove` `{label}` and `{position}`,
`issue` `{label}` and `{error}`, and `inRow` `{row}` and `{label}`; the others are said as written. See [words in one place](../form/README.md#words-as-text-in-one-place).

A chosen value its choices lack stays in sight: after the choices comes
`? value`, chosen, in a `select` and in a `RelationMany`'s checkboxes. It is a
stored id whose row is gone, or one the application has not loaded yet, and
the author can see it and let it go.

### Renderers

The table above is a set of renderers found by a control's `kind`, and the
shipped ones are entries like any other. Add a kind of your own, or draw a
shipped one another way, by passing renderers beside them:

<!-- docs-check standalone
import { Schema } from 'effect'
import { Entity } from 'foldkit-entity'
import { Form, Input } from 'foldkit-form'
import { Style, SlotView } from 'foldkit-mixins'
import { FieldSlots, FormView, type Renderer } from 'foldkit-mixins-form'

const Cents = Input.kind<{ readonly currency: string }>('Cents', { draft: 'text' })
const Priced = Entity.define(
  'Priced',
  Schema.Struct({
    id: Schema.String,
    cents: Schema.Number,
    code: Schema.String,
    total: Schema.String,
    email: Schema.String,
  }),
)
const PriceForm = Form.make(
  'Price',
  Entity.input(
    Priced,
    Schema.Struct({
      cents: Schema.Number,
      code: Schema.String,
      total: Schema.String,
      email: Schema.String,
    }),
  ),
  { inputs: { cents: Cents.of({ currency: 'USD' }) } },
)
declare const myCombobox: Renderer<{ readonly _tag: string }>
-->

```ts
FormView.define(PriceForm, {
  renderers: {
    Cents: ({ control, draft, change, blurred, state, h }) =>
      h.input([...state, h.Value(String(draft)), h.OnInput(change), h.OnBlur(blurred)]),
    RelationOne: myCombobox, // replaces the shipped select
  },
})
```

A renderer is told `input.following`: whether the key is still written from the
key it follows ([`Input.following`](../form/README.md#a-key-that-follows-another)).
A renderer that wants a "regenerate" button shows it when that is `false` and
sends the key an empty draft.

A renderer draws the control only; the label, description, error, and a search
box are the field's. `state` is the control's `id` and its accessibility
attributes, to put on the element that holds the value. A control whose kind has
no renderer throws when it is drawn, naming the kind and the key.
`FormView.field(form, { renderers })` takes them too, for a field view you style.

### Per-key overrides: `fields`

`FormView.fields` is `define` with per-key overrides, and one flat key's
control for a layout the caller owns:

```ts
import { Style } from 'foldkit-mixins'
import { FieldSlots } from 'foldkit-mixins-form'

const Fields = FormView.fields(PriceForm, {
  overrides: {
    // Drawn through the whole-form view, in the form's own universe.
    code: (input, h) => h.input([h.Id(input.id), h.Value(String(input.field.value))]),
  },
  styles: {
    // A style around one key's base field view.
    total: Style.forSlots(FieldSlots)({ root: Style.class('total') }),
  },
  attrs: {
    // What one key's element takes: an email type, a placeholder, textarea rows,
    // and what a phone's keyboard and autofill offer.
    email: { type: 'email', autocomplete: 'email' },
  },
})
```

Keys with no override render through the base field view, so a new key of a
known kind needs nothing new; unknown keys in every map are type errors.
`Fields.view` is the whole form. `Fields.field(control, model, id, h)` draws
one flat key for a custom layout, or with the override it is given, in any `h`:

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

A override receives the control, its field, id, validity, errors, element
attrs, and the `changed`/`blurred`/`toggled` Messages, so a custom layout reconstructs
no form plumbing. A renderer reads the attrs that fit its element — `type` and
`placeholder` on a text input, `placeholder` and `rows` on a textarea, and on
both, and a number, `autocomplete`, `inputMode`, `enterKeyHint`,
`autocapitalize` and `spellcheck` — and ignores the rest. An `email`, `tel` or
`url` type turns capitalizing and spellchecking off unless the attrs say
otherwise, and a number's keypad is `decimal` unless `inputMode` names another
(`numeric` for whole numbers; `text` where a minus is needed, which iOS's
decimal pad lacks). Nested keys and Bundle-backed keys draw only through `view`
(or a override); `field` without one refuses them, naming the key.

A number is a text input because its draft is text: `"4."` is a fine thing to
have typed, and `type="number"` would refuse to report it.

A control backed by a Bundle ([`Input.bundle`](../form/README.md#a-control-with-a-model-of-its-own))
is drawn with the Bundle's own view when no renderer names its kind, inside the
field's `control` slot, which carries the control's id and accessibility state.
A renderer for its kind receives `bundle`: the Bundle's Model, and `send`, which
turns one of the Bundle's Messages into the form's (wrapped for its row inside a
nested form). Such a key has no draft, so `draft` and `input.field.value` are
`''`; its validation state is `input.field`'s. A Bundle with no view needs a
renderer.

Around each control, `FieldSlots` also publishes `root`, `label`, `description`,
`checking`, `error`, `control` (around a Bundle's own view), and `group` and `affix`, for a
renderer that draws text beside its control (a prefix, a unit) with the two
together. `FormSlots` publishes `root` (the `form`), `errors` (failures that
belong to no one field), `failure` (why the submitted write did not land), `summary`, `summaryTitle`, `issues`, `issue` and
`issueLink` (the fields to fix, below),
`submit`, and the five slots of a nested key.

After a submit, while any field is invalid, a form of more than one control
(a nested key counts as more) draws the fields to fix above its submit button,
beside `errors`. It is the alert for those failures, so the errors beside the
fields drop their own `role="alert"` while it is drawn; a form of one control
draws none, its error beside the field being the summary. It holds
`words.summary` (default `Check these fields:`), then a link to each invalid
field in the order the fields are drawn, rows' too, each
worded by `words.issue` (default `{label}: {error}`); a field of a row is named
with its row by `words.inRow` (default `{row}, {label}`: `comments 2, body`),
so two rows' links differ; a row inside a row is named through both
(`shelves 1, books 2, title`). It sits low in the form,
so a field turning invalid never moves the fields above it. A link's `href` is the control's
`#id`, so with scripts off it goes there; with them on, a press focuses the
control itself (a choice group's first box) and goes nowhere, since an
application takes a link press as a navigation. The press sends the form's
`FollowedIssue({ id })`, which changes nothing.

A Bundle's own view that takes inputs gets them from the view input
`controls`, by key: `placed.view(model, h, { controls: { document: inputs } })`.
The entry is the application's, typed where it is made, such as the page
Builder's `BuilderView.inputs({ data })`; a key given none draws its view
without inputs.

A nested row's fields are drawn through the same field view, so a styled `field`
styles them too. A row that must be there has no remove button, and a `one`
loses its add button once it has its row. View inputs for nested keys:
`nestedOptions` names a picker inside a row by path (`'author.countryId'`, the
same for every row), and `words.add` / `words.remove` word the buttons (defaults
`Add <label>`, `Remove <label> <position>`).

### A check running, and a submit in flight

A form's own check ([`checks`](../form/README.md)) leaves its key `Validating`
until it answers. Meanwhile the control carries `aria-busy`, and under it a line
in the `checking` slot, `role="status"`, says so (`words.checking`, default
`Checking…`); the control names that line in `aria-describedby`. A Bundle
control's own work (an upload) marks it `aria-busy` with no such line: the
control says what it is doing itself. Each field's
`root` carries `data-validation`, the field's state by Foldkit's own tag
(`NotValidated`, `Validating`, `Valid` or `Invalid`), so a stylesheet can mark it
without a Style: `[data-validation='Valid'] label::after { content: ' ✓' }`. A
Style reads the same state as `input.field` through `Style.whenInput`.

The form is submitting while a submit waits for a check to pass (the form's
`submitPending`), or while the write its value started is in flight: the view
input `submitting`. The form hands the value over through `onOut` and cannot
see the request that follows. Where that request is a Remote mutation, its
request id in Remote's ledger says whether it is answered, so `submitting` is
read from there, never kept as a second flag: `foldkit-crud`'s editor passes it
itself (with a placement's `viewInputs`), and a page that mutates in its own
`onOut` keeps the request id and passes `Data.mutation(model, requestId)._tag
=== 'Pending'`. While submitting, the `form` carries `aria-busy` and
`data-submitting`, and the submit button reads `words.submitting` (default
`Submitting…`) and is `aria-disabled="true"`, not `disabled`: it keeps the
focus a press gave it, and a press meanwhile reaches a submit that waits or a
write in flight, which ignores it. Busy ends when the write is
answered: a list refreshed after it shows that through its own `Refreshing`.

A write that landed may leave the form unable to submit: a create's form
starts again blank. Its button reads `aria-disabled`, as it does whenever the
form cannot submit, so it keeps the focus a press gave it, and a press shows
what the blank form lacks. The view input `saved`, which once chose between
`disabled` and `aria-disabled`, has no effect any more and is deprecated.

When the write did not land, the view input `failure` (`{ error, retry }`) says
why, in the `failure` slot (`role="alert"`, above the submit button): a refusal
that names none of the form's keys (a refusal that names one shows on that
field, through the form's `Refused`), or a failure. With `retry` the submit
button reads `words.resubmit` (default `Try again`), for a page whose next
submit sends the same write again; the editor's does, through Remote's retry.
Where `writing` is the request id the page kept:

```ts sketch
EditForm.view(model, h, {
  submitting: Option.exists(model.writing, id => Data.mutation(model, id)._tag === 'Pending'),
  words: { submit: 'Save', submitting: 'Saving…', resubmit: 'Save again' },
})
```

A submit made while a check runs waits for the answer by default, rather than
being refused, and the button stays unmarked meanwhile. That leniency is the
form's, in `update`; `form.canSubmit` reads it. A page that wants a submit
refused until every check answers makes the form with `submitWaits: false`
(`Form.make(…, { submitWaits: false })`): `update` then hands out nothing while
a check runs, and `form.canSubmit`, which `FormView.submodel` reads by default,
is false until the answers land, so the button reads `aria-disabled` to match.
A checked key never checked yet (a form filled from an existing record) is
such a check: the first submit starts it and is refused, and the reader
submits again after the answer.
`FormView.submodel`'s `canSubmit` option only chooses when the button is marked
(`() => true` never marks it, and validates wholly at submit); it cannot make
a submit be refused or accepted, so the drawn frame is never what decides.

The generated button is never natively `disabled`: it reads `aria-disabled`
while the form cannot submit or is submitting, so Enter in a field always
submits through it and the browser has no say. Natively disabled, it dropped
an Enter sent in the same frame as the edit that made the form valid (a paste
or an autofill and Enter), before the frame that enabled it, with no word. The
decision is `update`'s, from the Model: `Submitted` validates every key, so a
submit the form cannot take marks each missing key invalid and shows why (the
fields to fix, the errors), hands out nothing, and one the Model can take
goes through. A press of the button does the same. The button looks disabled
through the `disabled` treatment of the recipes, which reads
`[aria-disabled="true"]`, and a screen reader hears it disabled. A style of
your own on the `submit` Slot must match `[aria-disabled="true"]` as well as
`:disabled`, and keep it out of its hover and press rules. Moving focus
to the first missing key is the page's, as the waitlist's `FocusField` does:
without it a repeated refused press changes nothing a person can perceive once
the errors are shown. A
custom submit drawn with `Button.view` is likewise only `aria-disabled`, so a
strict page also refuses a `Submitted` in
`update` while a check runs: the
[waitlist](../../examples/foldkit/form/src/main.ts) does, and its browser
test presses Enter and the button during a check.

<!-- docs-check standalone
import { Schema } from 'effect'
import { Entity, Relation } from 'foldkit-entity'
import { Form as FormKit, Input } from 'foldkit-form'

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
import { FormView } from 'foldkit-mixins-form'

const View = FormView.define(Edit)
-->

```ts
import { Bundle } from 'foldkit-bundle'

const NeverPreDisabled = Edit.bundle.pipe(
  Bundle.withView(FormView.submodel(Edit, View, { canSubmit: () => true })),
)
```

### Accessibility

Each control has an `id` of `<form name>-<key>` (in a row,
`<form name>-<key>-<row id>-<key>`) and a `label for` it. It carries
`aria-busy` while a check runs, `aria-invalid`, `aria-required` when the key is
required, and `aria-describedby` naming its description, the `checking` line
while a check runs, and its error while invalid. An error is `role="alert"`.
The submit button is `aria-disabled` (never `disabled`) until the form would submit
and while it is submitting, so it keeps its focus and Enter always reaches `update`.

Those attributes belong to the view: an attachment that also supplies one is an
attribute conflict, reported when the view renders. The slots declare
`AriaInvalid` and `AriaDescribedby` so a Behavior can require them.

## Limits

- One layout: label, control, description, the checking line, error, in that
  order, and fields in the input's order. For another arrangement, draw from `form.controls`
  yourself; this package is the default, not the only way.
- A relation picker is a `select`, or checkboxes for a `many`. With
  `Input.search()` it searches, but it is not a combobox: the choices are the
  rows the query found, with no paging inside the picker.
- The Bundle gains a view through `Bundle.withView`, so place the drawn Bundle,
  not `form.bundle`.
