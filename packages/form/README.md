# foldkit-form

A form as a Foldkit Submodel: built from the input an operation accepts, holding
what the user is typing, and handing the parent a decoded value when it is
valid. It adds no state system. Field state is Foldkit core's
`fieldValidation`, and the form is a [`foldkit-bundle`](../bundle/README.md)
Bundle the parent places like any other.

> **Status:** headless. It owns the Model, Messages, validation, and a
> description of each control, and draws nothing.
> [`foldkit-mixins-form`](../mixins-form/README.md) draws it through Mixins
> slots; or draw from `controls` yourself.

## What it owns

| Fact | Owner |
| --- | --- |
| What may be submitted, and when it is valid | the input `Schema.Struct` |
| What each input key means (a field, a relation's id) | [`Entity.input`](../entity/README.md#reading-an-operations-input) |
| The draft in each control, and whether it has been checked | `foldkit-form`, in the parent's Model |
| What happens to a submitted value | the parent: a Remote mutation, a Sync operation, a plain `update` |
| Whether a submit is in flight, and its failure | whoever performs it; not the form |
| The options of a relation picker | the application; the form only names the target Entity |

## Mental model

```text
Schema.Struct (the operation's input)
        +
Entity.input (what each key means)
        |
        v
   Form.make ──► controls: key · control · label · required      (draw these)
        |
        v
     Bundle
   Model: one fieldValidation Field per key, holding the draft
   Changed / Blurred ──► validate the draft against the key's schema
   Submitted ──► every key valid, input decoded ──► out Message { value }
```

A **draft** is what the control holds, which is not the value it submits. A
number being typed is text (`"4."` is a fine thing to have typed), an unchosen
relation is `""`. The draft becomes a value only when it is checked.

## Install

```sh
pnpm add effect foldkit foldkit-bundle foldkit-entity foldkit-form
```

## Example

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

// Place it: a Model field and a Message variant of the page.
const Slot = Bundle.declare(Rename.bundle, 'rename')
const Model = Schema.Struct({ ...Slot.fields, saved: Schema.Array(RenameInput) })
const Message = defineMessageUnion({ ...Slot.cases })

const Page = Bundle.parent({ Model, Message })
const RenameForm = Page.at(Slot, {
  // `submitted.value` is a decoded RenameInput. What it means is the page's.
  onOut: submitted => model => ({
    model: { ...model, saved: [...model.saved, submitted.value] },
  }),
})
```

- `Form.make` takes the name and an `Entity.input`. It resolves a control per
  key and throws if it cannot, so a form that is made is a form that can be
  drawn.
- `Rename.bundle` is an ordinary Bundle. `onOut` is required, so a submit is
  never dropped by omission.
- `Rename.Message` builds the form's Messages for your view to dispatch:
  `Changed({ key, value })`, `Blurred({ key })`, `Submitted()`, `Reset()`.
- `Rename.controls` lists the keys in the input's order, each with its
  `control`, `label`, `description`, `required`, and the Entity `member`.
- `Rename.field(model.rename, key)` reads one key's state as `Field<Draft>`, for
  a view that walks `controls`; `model.rename.fields.title` is the same value
  typed to its key.

## Controls

A control is data: the kind of editing, with nothing about how it is drawn.

| Control | Draft | Chosen when |
| --- | --- | --- |
| `Text`, `Multiline` | `string` | the schema is a string (`Multiline` only when asked for) |
| `Hidden` | `string` | only when asked for: a key the form carries and does not show, such as the id being edited |
| `Number` | `string` | the schema is a number |
| `Toggle` | `boolean` | the schema is a boolean |
| `Select` | `string` | the schema is a union of string literals; carries `options` |
| `RelationOne` | `string` (an id, `""` for none) | the key is `Relation.input` of a `one` |
| `RelationMany` | `string[]` | the key is `Relation.input` of a `many` |

The resolver goes from the most to the least explicit source:

1. `inputs` given to `Form.make`, for this form only.
2. `Input.of(control)` metadata on the Entity member, for that member everywhere.
3. The relation the key writes.
4. The shape of the key's schema.

If none of them says, `Form.make` throws and names the key. It does not guess.

```ts
import { Form, Input } from 'foldkit-form'

const Cms = Post.pipe(Entity.annotateMembers({ title: Input.of(Input.multiline()) }))

Form.make('Rename', Entity.input(Cms, RenameInput), { inputs: { id: Input.text() } })
```

### Labels

A label is the schema's own `title` annotation, and the description its
`description`, first on the input key's schema and then on the Entity field's.
Those annotations already reach JSON Schema, so an agent tool and a form read
the same words. A relation has no schema to annotate, so it takes
`Form.label('Author', 'Who wrote it')` as Entity metadata. With neither, the
label is the key.

## Validation

Each key is checked against **the input's own schema for that key**, not the
Entity's: the operation decides what is valid, and may be stricter.

- **An edit** (`Changed`) checks the new draft at once.
- **Leaving a control** (`Blurred`) checks the draft as it stands, which is how
  a required key left empty comes to say so.
- **Empty** means `""` or `[]`. What an empty draft submits is whatever the
  schema admits for it, tried in order: leaving the key out, `null`, then the
  empty value itself. A key is `required` exactly when none is admitted, so
  `Schema.optional`, `Schema.NullOr`, and an array need no flag from you. A
  plain `Schema.String` admits `""`; add `Schema.isMinLength(1)` to require it.
- **A number** that does not parse reads `Enter a number`; one that parses is
  checked by the schema. Only spaces is nothing entered, not zero.
- **Submit** checks every key, so every failure shows. When all pass, the whole
  input is decoded; a rule that spans keys fails there and lands in
  `model.errors`, since it belongs to no one control. The next edit clears
  them.

Field state is `foldkit/fieldValidation`'s `Field`: `NotValidated`, `Valid`,
`Invalid` with its `errors`. Read it with that module's `match`, `isInvalid`,
and the rest.

### Messages

Say a rule in its own words on the rule, where Effect Schema already takes
them:

```ts
Schema.String.check(Schema.isMinLength(3, { message: 'Give it at least 3 letters' }))
```

The form has three things to say for itself, and `messages` words them, or
rewrites what Schema says by default, which is also how a form is translated:

```ts
const Rename = Form.make('Rename', Entity.input(Post, RenameInput), {
  messages: {
    required: field => `${field.label} is missing`,
    notANumber: field => `${field.label} must be a number`,
    invalid: (field, message) => `${field.label}: ${message}`,
    form: message => message,
  },
})
```

| Message | Said when | Default |
| --- | --- | --- |
| `required(field)` | an empty draft the schema does not admit | `Required` |
| `notANumber(field)` | a `Number` control whose draft is not a number | `Enter a number` |
| `invalid(field, message)` | the key's schema rejects the draft; `message` is the check's own, or Schema's | `message` |
| `form(message)` | the input as a whole fails: a rule that spans keys | `message` |

`field` is the key, its label, and its control.

## Editing existing values

`fill` shows values as drafts, for an edit form. Keys you do not pass keep their
draft.

```ts
const load = RenameForm.helpers.fill({ id: 'p1', title: 'Hello' }) // an Update.Step of the page
```

What to load, and how a loaded value becomes input values, both follow from the
form's input, which the form keeps as `Rename.input`:

```ts
const Current = Entity.selectFor(Rename.input) // a Selection of `id` and `title`

declare const loaded: typeof Current.schema.Type
const prefill = RenameForm.helpers.fill(Entity.valuesFor(Rename.input, loaded))
```

A relation is loaded as a ref and read back as the id the form holds. See
[`foldkit-entity`](../entity/README.md#showing-what-is-there).
[`foldkit-admin`](../admin/README.md) does this, the save, and its status for you.

## Limits

- Headless: no view here (see `foldkit-mixins-form`), and no relation picker data. `RelationOne` and
  `RelationMany` carry the target Entity; listing its options is a query the
  application makes.
- One `Changed` Message carries any draft, so a view can dispatch a draft of the
  wrong kind for a key. The form ignores it rather than storing it.
- No asynchronous validation; `Validating` is never entered.
- Flat inputs only: a key whose value is itself a struct or a list of structs
  has no control.
