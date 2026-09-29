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

It holds no state and adds no Messages. Every event it installs dispatches one
of the form's own Messages (`Changed`, `Blurred`, `Submitted`).

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

## Example

`Edit` is a `Form.make` result, as in the
[`foldkit-form` README](../form/README.md#example).

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

```ts
EditForm.view(model, h, {
  options: { editorId: authors.map(author => ({ value: author.id, label: author.name })) },
  words: { submit: 'Save' },
})
```

- `FormView.define(Edit)` alone is a complete, unstyled form. `field` is only
  for changing how fields are drawn.
- `submits: false` draws the form without its submit button, for someone who
  may not submit it (a writer, where the submit publishes).
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
| `RelationOne` | `select` of `options[key]`, with a blank | `select`, `option` |
| `RelationMany` | a `role="group"` of checkboxes over `options[key]`, each in a `label` with its words | `choices`, `choiceLabel`, `choice` |
| `Nested` | a `fieldset` with a `legend`, a `div` per row holding the nested form's fields, and `button type="button"`s to add and remove a row | `group`, `legend`, `row`, `add`, `remove` |

A `RelationOne` or `RelationMany` that searches (`Input.search()`) gets an
`input type="search"` above it, in the `search` slot, labelled `Search <label>`
and naming the picker it controls with `aria-controls`. `words.search` in the
view inputs replaces the word. The blank choice of a `select` has no words
unless `words.none` gives it some ("none"). All of the view's words (`submit`,
`submitting`, `checking`, `search`, `none`, `add`, `remove`) are text, with `{label}` and `{position}` as
blanks; see [words in one place](../form/README.md#words-as-text-in-one-place).

A chosen value its choices lack stays in sight: after the choices comes
`? value`, chosen, in a `select` and in a `RelationMany`'s checkboxes. It is a
stored id whose row is gone, or one the application has not loaded yet, and
the author can see it and let it go.

### Renderers

The table above is a set of renderers found by a control's `kind`, and the
shipped ones are entries like any other. Add a kind of your own, or draw a
shipped one another way, by passing renderers beside them:

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
    // What one key's element takes: an email type, a placeholder, textarea rows.
    email: { type: 'email' },
  },
})
```

Keys with no override render through the base field view, so a new key of a
known kind needs nothing new; unknown keys in every map are type errors.
`Fields.view` is the whole form. `Fields.field(control, model, id, h)` draws
one flat key for a custom layout, or with the override it is given, in any `h`:

```ts
Fields.field(control, formModel, control.key, h, (input, draw) =>
  draw.input([draw.Id(input.id), draw.Value(String(input.field.value))]),
)
```

A override receives the control, its field, id, validity, errors, element
attrs, and the `changed`/`blurred` Messages, so a custom layout reconstructs
no form plumbing. A renderer reads the attrs that fit its element — `type` and
`placeholder` on a text input, `placeholder` and `rows` on a textarea — and
ignores the rest. Nested keys and Bundle-backed keys draw only through `view`
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
belong to no one field), `submit`, and the five slots of a nested key.

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
`Checking…`); the control names that line in `aria-describedby`. Each field's
`root` carries `data-validation`, the field's state by Foldkit's own tag
(`NotValidated`, `Validating`, `Valid` or `Invalid`), so a stylesheet can mark it
without a Style: `[data-validation='Valid'] label::after { content: ' ✓' }`. A
Style reads the same state as `input.field` through `Style.whenInput`.

The form is submitting while a submit waits for a check to pass (the form's
`submitPending`), or while the application says its own work with the value is
in flight: the view input `submitting`. The form hands the value over through
`onOut` and cannot see the request that follows, so that part is the
application's to pass. While submitting, the `form` carries `aria-busy` and
`data-submitting`, and the submit button is disabled and reads
`words.submitting` (default `Submitting…`). Where `saving` is the parent's own
record of a save in flight:

```ts
EditForm.view(model, h, {
  submitting: model.saving,
  words: { submit: 'Save', submitting: 'Saving…', checking: 'Checking…' },
})
```

The submit button is enabled while a check runs and nothing is invalid: a submit
then waits for the answer, rather than being refused. That leniency is
`form.canSubmit`, and `FormView.submodel` takes the predicate explicitly so
the choice stays visible: pass a strict one to disable through checks, or
`() => true` to never pre-disable and validate wholly at submit.

```ts
const Drawn = Edit.bundle.pipe(
  Bundle.withView(FormView.submodel(Edit, View, { canSubmit: () => true })),
)
```

### Accessibility

Each control has an `id` of `<form name>-<key>` (in a row,
`<form name>-<key>-<row id>-<key>`) and a `label for` it. It carries
`aria-busy` while a check runs, `aria-invalid`, `aria-required` when the key is
required, and `aria-describedby` naming its description, the `checking` line
while a check runs, and its error while invalid. An error is `role="alert"`.
The submit button is disabled until the form would submit, and while it is
submitting.

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
