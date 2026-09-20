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

A control is data: a `kind` (a name), the `draft` the Model holds while it is
edited, and whatever `data` its kind needs, with nothing about how it is drawn.
There is one primitive, and every kind is a value of it, the ones below
included.

| Kind | Draft | Chosen when |
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

### Your own kind of control

The kinds above are made with `Input.kind`, and so is a date picker, a rich text
editor, or a price:

```ts
const Cents = Input.kind<{ readonly currency: string }>('Cents', {
  draft: 'text', // what the Model holds while it is edited
  // The value the schema is given, when that is not the text itself.
  parse: draft => (/^\d+(\.\d{1,2})?$/.test(draft) ? Math.round(Number(draft) * 100) : undefined),
  unparsed: 'Enter an amount',
})

Form.make('Price', input, { inputs: { cents: Cents.of({ currency: 'USD' }) } })

Cents.is(control) && control.data.currency // 'USD'
```

- `draft` is `'text'`, `'flag'` (a boolean) or `'list'` (ids).
- `parse` reads text as something else before the key's schema sees it, as
  `Number` does; `undefined` means it does not read, and `unparsed` is what to
  say. Text that is only spaces is nothing entered, not a failure to parse.
- `shown: false` makes a kind that is carried and not drawn, as `Hidden` is.
- Nothing else in the form treats a shipped kind differently. A view draws your
  kind once it has a renderer for it; see
  [`foldkit-mixins-form`](../mixins-form/README.md#renderers).

### A key that follows another

A slug is its title until the author decides otherwise. `Input.following` keeps
the key's own control and writes its draft from another key:

```ts
const PostForm = Form.make('PostForm', input, {
  inputs: { slug: Input.following('title', slugify) },
})

PostForm.isFollowing(model, 'slug') // false once the author has written it
```

- While the author has not written the key, each edit of the key it follows
  rewrites it, through the function given, and it is validated and checked as if
  typed. With nothing to follow yet it shows no failure; a submit still does.
- **Once they write it, it is theirs**, and the key it followed moves on without
  it. Emptying it hands it back, which is how a view offers "regenerate".
- **A form filled with a value for it does not follow.** An address that is
  already published must not move because its title was edited. Filled with
  nothing for it, it follows.
- A key may follow a key that follows. A key that follows itself, through any
  chain, or that follows something that is not another text key of the form, is
  refused when the form is made.

### A picker that searches

A relation usually has too many targets to list. `Input.search()` keeps the
key's picker and gives it a search:

```ts
const EditPost = Form.make('EditPost', input, { inputs: { authorId: Input.search() } })

EditPost.Message.Searched({ key: 'authorId', text: 'ad' })
EditPost.search(model, 'authorId') // 'ad'
```

The form holds what was typed and does nothing else with it: it changes no
draft and validates nothing. The application reads it as the input of the query
that lists the choices, so finding an author is an ordinary query. A fill or a
reset starts the search over. `Input.search()` on a key that is not a relation
throws.

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

Field state is `foldkit/fieldValidation`'s `Field`: `NotValidated`, `Validating`
(a check is running), `Valid`, `Invalid` with its `errors`. Read it with that module's `match`, `isInvalid`,
and the rest.

### Checks: rules only something else can answer

Whether a slug is taken is not in the schema. A check is an Effect the form is
given; it answers with what is wrong, or nothing:

```ts
const PostForm = Form.make('PostForm', Entity.input(Post, PostInput), {
  checks: {
    // The decoded value, and whatever else in the form decodes right now.
    slug: (slug, { values }) =>
      isSlugTaken(slug, values.id).pipe(
        Effect.map(taken => (taken ? `"${slug}" is taken` : undefined)),
      ),
  },
  debounce: '300 millis',
})
```

- A check runs **after** the key's own schema passes, never instead of it, so it
  receives a decoded value: a number, not the text that was typed.
- While it runs the key reads `Validating`, which is Foldkit core's own state for
  this. `Valid` on a checked key means the check passed.
- The form does not know what answers. The check's requirements (`R`) become the
  Bundle's, so a check that needs `RemoteClient` makes the placement need it.
- Each edit asks again after `debounce`, and an answer for a draft the key no
  longer holds is dropped.
- **A submit waits.** Submitted while a check runs, the form sets `submitPending`
  and sends the value when the last check passes, or nothing if one fails. An
  edit in between cancels the wait. A filled form (`fill` validates nothing) is
  checked on submit the same way.
- `context.values` holds the other keys that currently decode, which is how an
  edit form lets a post keep its own slug.

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
    unparsed: field => `${field.label} must be a number`,
    invalid: (field, message) => `${field.label}: ${message}`,
    form: message => message,
  },
})
```

| Message | Said when | Default |
| --- | --- | --- |
| `required(field)` | an empty draft the schema does not admit | `Required` |
| `unparsed(field)` | text its control cannot read, such as a `Number` that is not one | the kind's own words (`Enter a number`) |
| `invalid(field, message)` | the key's schema rejects the draft; `message` is the check's own, or Schema's | `message` |
| `form(message)` | the input as a whole fails: a rule that spans keys | `message` |

`field` is the key, its label, and its control.

### Words as text, in one place

Each of these may be text with blanks instead of a function: `'{label} is required'`
(`{label}`, `{key}`, and `{message}` where there is one). Text can be kept in a
translation catalogue, and it can go where a function cannot: Foldkit admits no
function nested in a placed view's inputs. The drawn packages' words are text
too, and the three shapes share no key, so an application writes its words once:

```ts
import type { FormMessages } from 'foldkit-form'
import type { ViewWords } from 'foldkit-mixins-crud'
import type { FormViewWords } from 'foldkit-mixins-form'

export const words = {
  required: '{label} is required', // foldkit-form
  submit: 'Save', // foldkit-mixins-form
  add: 'Another {label}',
  yes: 'Live', // foldkit-mixins-crud
  empty: 'No posts yet.',
} satisfies FormMessages & FormViewWords & ViewWords

Form.make('EditPost', input, { messages: words })
placed.view(model, h, { options, words })
PostTable({ page, words }, h)
```

`fillWords(template, values)` is the blank-filling they all use.

## Pipe steps

Every option is also a pipe step that gives a new form, made from the same input
with that option added to:

```ts
const AuthorForm = Form.make('Author', NewAuthor) // as a library might hand it over

const Finished = AuthorForm.pipe(
  Form.inputs({ bio: Input.multiline() }),
  Form.checks({ name: name => isNameTaken(name) }),
  Form.messages({ required: field => `${field.label} fehlt` }),
)
```

`Form.inputs`, `Form.checks`, `Form.messages`, `Form.nested` and `Form.debounce`.
Each adds to what the form already has, so a form can be made in one place and
finished in another. A step's keys are checked against the form it is piped
into, and `Form.checks` adds what its checks need to what the form needs. The
first form is left as it was.

## Nested input

A key mapped with [`Relation.nested`](../entity/README.md#an-input-that-holds-the-target-itself)
holds the relation's target, not an id. **A nested form is a form**: the key
holds rows, each a Model of the form built from the nested input.

```ts
const NewComment = Entity.input(Blog.Comment, Schema.Struct({ body: Schema.String }))
const CreatePost = Entity.input(
  Blog.Post,
  Schema.Struct({ title: Schema.String, comments: Schema.Array(NewComment.schema) }),
  { comments: Relation.nested(Blog.Post.relations.comments, NewComment) },
)

// The form that edits a comment alone is the form a post's form nests.
const CommentForm = Form.make('Comment', NewComment, { inputs: { body: Input.multiline() } })
const PostForm = Form.make('PostForm', CreatePost, { nested: { comments: CommentForm } })

PostForm.row('comments', 'r0').Changed({ key: 'body', value: 'First' }) // a Message of PostForm
PostForm.nested.comments // CommentForm

PostForm.Message.RowAdded({ key: 'comments' })
PostForm.Message.RowRemoved({ key: 'comments', row: 'r0' })
PostForm.rows(PostForm.initial, 'comments') // [{ id, model }], each a Model of the nested form
```

| The key is | Rows |
| --- | --- |
| a `one` whose schema must be there | exactly one, from the start; it cannot be removed |
| a `one` that admits `null` or `undefined` | none or one; none submits that nothing |
| a `many` | any number, starting with none |

- **The nested form is one you make and pass** (`nested: { comments: CommentForm }`),
  from the same input `Relation.nested` was given. The form that edits a comment
  alone is the form a post nests, with its controls, checks and words. A nested
  key given none gets a plain form of its input, with this form's `messages` and
  `debounce`. A form of another input throws.
- **A row is addressed with types.** `PostForm.row('comments', id)` has the nested
  form's own constructors (`Changed`, `Blurred`, `Searched`, `RowAdded`, ...), each
  giving `PostForm`'s Message, and `send(message)` for one already made, which is
  how a row inside a row is reached. `PostForm.nested.comments` is the form
  itself. Underneath it is `Message.Nested({ key, row, message })`. A Message for a row that is gone, or
  that is not one of the nested form, is dropped. A row's id is never reused.
- A nested key's control is of kind `Nested`, with `data` `{ cardinality, optional, form }`
  (narrow it with `Input.Nested.is(control)`);
  `form` is the nested form, with its own `controls`, `field`, and `rows`. Nested
  keys are in `model.rows`, not `model.fields`.
- A submit validates every row too and shows every failure; it waits for a check
  running in a row as it does for its own. A rule on the list itself
  (`Schema.isMaxLength(5)`) is a failure of the whole, in `errors`.
- `fill` fills rows from values, and nesting goes as deep as the inputs do.

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
[`foldkit-crud`](../crud/README.md) does this, the save, and its status for you.

## Limits

- Headless: no view here (see `foldkit-mixins-form`), and no relation picker data. `RelationOne` and
  `RelationMany` carry the target Entity; listing its options is a query the
  application makes.
- One `Changed` Message carries any draft, so a view can dispatch a draft of the
  wrong kind for a key. The form ignores it rather than storing it.
- A key whose value is a struct is editable only as a nested input of a
  relation's target; a free-standing struct has no control. Rows keep the order
  they were added in; there is no reordering.
