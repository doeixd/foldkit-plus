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
FormView.submodel(form, view)      a Submodel view taking { options, submitLabel }
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

Then, where the parent draws the placement:

```ts
EditForm.view(model, h, {
  options: { editorId: authors.map(author => ({ value: author.id, label: author.name })) },
  submitLabel: 'Save',
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

A number is a text input because its draft is text: `"4."` is a fine thing to
have typed, and `type="number"` would refuse to report it.

Around each control, `FieldSlots` also publishes `root`, `label`, `description`,
and `error`. `FormSlots` publishes `root` (the `form`), `errors` (failures that
belong to no one field), and `submit`.

### Accessibility

Each control has an `id` of `<form name>-<key>` and a `label for` it. It carries
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
- A `select` for a relation suits tens of choices, not thousands. There is no
  search or paging.
- The Bundle gains a view through `Bundle.withView`, so place the drawn Bundle,
  not `form.bundle`.
