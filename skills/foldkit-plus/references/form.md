# foldkit-form

A form as a Submodel: built from the input an operation accepts, holding what
the user is typing, and handing the parent a decoded value once it is valid.
Field state is Foldkit core's `foldkit/fieldValidation`; the form is a
`foldkit-bundle` Bundle. **Headless**: it describes each control and draws
nothing; `foldkit-mixins-form` draws it (see [Drawing it](#drawing-it)).

## Ownership

| Fact | Owner |
| --- | --- |
| What may be submitted, and when it is valid | the input `Schema.Struct` |
| What each input key means | `Entity.input` (see [entity.md](entity.md)) |
| The draft in each control and its validation state | `foldkit-form`, in the parent's Model |
| What a submitted value does (Remote mutation, Sync op, `update`) | the parent, in `onOut` |
| Whether a submit is in flight, and its failure | whoever performs it; not the form |
| A relation picker's options | the application; the form names the target Entity |

## Mental model

```text
Schema.Struct + Entity.input ──► Form.make ──► controls (draw these)
                                          └──► bundle
   Changed / Blurred ──► validate the draft against the key's own input schema
   Submitted ──► every key valid, whole input decoded ──► out Message { value }
```

A draft is what the control holds: a number being typed is text, an unchosen
relation is `""`. It becomes a value only when checked.

## Minimal example

```ts
import { Schema } from 'effect'
import { Bundle } from 'foldkit-bundle'
import { Entity } from 'foldkit-entity'
import { Form } from 'foldkit-form'
import { defineMessageUnion } from 'foldkit/message'

const Post = Entity.define(
  'Post',
  Schema.Struct({
    id: Schema.String,
    title: Schema.String.check(Schema.isMinLength(1)).annotate({ title: 'Title' }),
  }),
)

// The operation's input, declared once. Give the same value to the operation.
const RenameInput = Schema.Struct({ id: Schema.String, title: Post.fields.title.schema })

const Rename = Form.make('Rename', Entity.input(Post, RenameInput))

const Slot = Bundle.declare(Rename.bundle, 'rename')
const Model = Schema.Struct({ ...Slot.fields, saved: Schema.Array(RenameInput) })
const Message = defineMessageUnion({ ...Slot.cases })

const Page = Bundle.parent({ Model, Message })
const RenameForm = Page.at(Slot, {
  onOut: submitted => model => ({
    model: { ...model, saved: [...model.saved, submitted.value] },
  }),
})
```

## Common tasks

- **Dispatch from a view:** `Rename.Message.Changed({ key, value })`,
  `Blurred({ key })`, `Submitted()`, `Reset()`, wrapped in the placement's
  Message (`Message.GotRenameMessage({ message })`).
- **Draw it:** `Rename.controls` is the keys in order, each with `control`
  (`Text`, `Multiline`, `Hidden`, `Number`, `Toggle`, `Select` with `options`,
  `RelationOne` / `RelationMany` with `target`), `label`, `description`,
  `required`, and the Entity `member`. Read a key's state from
  `model.rename.fields[key]` with `foldkit/fieldValidation` (`match`,
  `isInvalid`); cross-key failures are in `model.rename.errors`.
- **Choose a control:** `Form.make(name, input, { inputs: { body: Input.multiline() } })`
  for this form; `Entity.annotateMembers({ body: Input.of(Input.multiline()) })`
  for the member everywhere. Otherwise: the relation the key writes, then the
  schema's shape. No match throws at `Form.make`, naming the key.
- **Label:** `Schema.String.annotate({ title, description })` on the input key or
  the Entity field. A relation takes `Form.label('Author')` as Entity metadata.
- **Ask something outside the form** (is this slug taken?): `checks: { slug: (slug, { values }) => Effect }`
  answering an error message or `undefined`. It runs after the key's schema passes
  and gets the decoded value; the key reads `Validating` meanwhile; a stale answer
  is dropped; `debounce` (default 300ms) rests a key before asking. A submit during
  a check sets `submitPending` and goes out when the last check passes. The check's
  requirements become the Bundle's.
- **Word or translate it:** put a rule's words on the rule
  (`Schema.isMinLength(3, { message: '…' })`); give `Form.make` a `messages`
  option for the form's own (`required`, `notANumber`), a rewrite of Schema's
  (`invalid(field, message)`), and cross-key failures (`form(message)`).
- **Carry a key without showing it** (the id being edited):
  `inputs: { id: Input.hidden() }`, then set it with `fill`.
- **Read any key's state while walking `controls`:** `Rename.field(model.rename, key)`
  gives `Field<Draft>`; `model.rename.fields.title` is the same value typed to its key.
- **Edit existing values:** `RenameForm.helpers.fill({ id, title })` is an
  `Update.Step` of the parent; keys not passed keep their draft. With Remote:
  load `Data.get(Entity.selectFor(Rename.input), id)`, then
  `fill(Entity.valuesFor(Rename.input, loaded))`.
- **Enable the button:** `Rename.canSubmit(model.rename)`.

## Drawing it

`foldkit-mixins-form` draws the form as plain, accessible HTML with every element
a `foldkit-mixins` Slot. It holds no state and dispatches only the form's own
Messages. `Rename` is the form from the minimal example.

```ts
import { Bundle } from 'foldkit-bundle'
import { Style } from 'foldkit-mixins'
import { FieldSlots, FormSlots, FormView, type FieldInput } from 'foldkit-mixins-form'

const Field = FormView.field(Rename).pipe(
  Style.attach(
    Style.forSlots(FieldSlots)({
      root: Style.class('field'),
      text: Style.whenInput<FieldInput>(input => input.invalid, Style.class('is-invalid')),
    }),
  ),
)
const View = FormView.define(Rename, { field: Field }).pipe(
  Style.attach(Style.forSlots(FormSlots)({ root: Style.class('form') })),
)

// Place this Bundle instead of `Rename.bundle`.
const Drawn = Rename.bundle.pipe(Bundle.withView(FormView.submodel(Rename, View)))
```

Render the placement with `placed.view(model, h, { options, submitLabel })`.
`options` is keyed by the form's keys and supplies each relation picker's
choices (`{ value, label }`); loading them is the application's query.
`FormView.define(Rename)` alone is a complete unstyled form. `FieldSlots`: `root`,
`label`, `description`, `error`, and one per control kind (`text`, `multiline`,
`number`, `toggle`, `select`, `choices`, `choice`). `FormSlots`: `root`, `errors`,
`submit`. The view owns `id`, `label for`, `aria-invalid`, `aria-required`,
`aria-describedby`, and `role="alert"` on errors; a Behavior that supplies one of
those throws a two-owners conflict at render.

## Gotchas

- A key is validated against **the input's schema for that key**, not the
  Entity's. The operation may be stricter.
- `required` is derived: a key is required exactly when its schema admits
  nothing for an empty draft (tried: key left out, `null`, the empty value). A
  plain `Schema.String` admits `""`; add `Schema.isMinLength(1)`.
- The form has no "submitting" state. Track the operation where it runs.
- `onOut` is required when placing; omitting it is a type error.
- A `Changed` with a draft of the wrong kind for the key (a string for a toggle)
  is ignored, not stored.
- Flat inputs only.

## See also

- https://github.com/doeixd/foldkit-plus/blob/main/packages/form/README.md
- https://github.com/doeixd/foldkit-plus/blob/main/packages/mixins-form/README.md
- https://github.com/doeixd/foldkit-plus/blob/main/packages/entity/README.md
- https://github.com/doeixd/foldkit-plus/blob/main/packages/bundle/README.md
