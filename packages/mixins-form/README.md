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
| `Select` | `select` of the control's own options, with a blank while nothing is chosen | `select` |
| `RelationOne` | `select` of `options[key]`, with a blank | `select` |
| `RelationMany` | a `role="group"` of checkboxes over `options[key]` | `choices`, `choice` |
| `Nested` | a `fieldset` with a `legend`, a `div` per row holding the nested form's fields, and `button type="button"`s to add and remove a row | `group`, `legend`, `row`, `add`, `remove` |

A `RelationOne` or `RelationMany` that searches (`Input.search()`) gets an
`input type="search"` above it, in the `search` slot, labelled `Search <label>`
and naming the picker it controls with `aria-controls`. `words.search` in the
view inputs replaces the word. All of the view's words (`submit`, `search`,
`add`, `remove`) are text, with `{label}` and `{position}` as blanks; see
[words in one place](../form/README.md#words-as-text-in-one-place).

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
`error`, and `control` (around a Bundle's own view). `FormSlots` publishes `root` (the `form`), `errors` (failures that
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

### Accessibility

Each control has an `id` of `<form name>-<key>` (in a row,
`<form name>-<key>-<row id>-<key>`) and a `label for` it. It carries
`aria-busy` while a check runs, `aria-invalid`, `aria-required` when the key is required, and `aria-describedby`
naming its description and, while invalid, its error. An error is `role="alert"`.
The submit button is disabled until the form would submit.

Those attributes belong to the view: an attachment that also supplies one is an
attribute conflict, reported when the view renders. The slots declare
`AriaInvalid` and `AriaDescribedby` so a Behavior can require them.

## Limits

- One layout: label, control, description, error, in that order, and fields in
  the input's order. For another arrangement, draw from `form.controls`
  yourself; this package is the default, not the only way.
- A relation picker is a `select`, or checkboxes for a `many`. With
  `Input.search()` it searches, but it is not a combobox: the choices are the
  rows the query found, with no paging inside the picker.
- The Bundle gains a view through `Bundle.withView`, so place the drawn Bundle,
  not `form.bundle`.
