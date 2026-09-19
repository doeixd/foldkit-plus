# foldkit-form

A form as a Submodel: built from the input an operation accepts, holding what
the user is typing, and handing the parent a decoded value once it is valid.
Field state is Foldkit core's `foldkit/fieldValidation`; the form is a
`foldkit-bundle` Bundle. **Headless**: it describes each control and draws
nothing.

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
  (`Text`, `Multiline`, `Number`, `Toggle`, `Select` with `options`,
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
- **Edit existing values:** `RenameForm.helpers.fill({ id, title })` is an
  `Update.Step` of the parent; keys not passed keep their draft.
- **Enable the button:** `Rename.canSubmit(model.rename)`.

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
- Flat inputs only, no async validation, and messages are Effect Schema's own.

## See also

- https://github.com/doeixd/foldkit-plus/blob/main/packages/form/README.md
- https://github.com/doeixd/foldkit-plus/blob/main/packages/entity/README.md
- https://github.com/doeixd/foldkit-plus/blob/main/packages/bundle/README.md
