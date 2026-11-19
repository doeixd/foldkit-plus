# foldkit-form

Every web form repeats the same plumbing by hand: storing unfinished text or
checkbox drafts separately from decoded numbers and IDs, deciding whether to
validate on input, blur, or submit, tracking whether the user changed anything
since loading, and guarding against double submits or stale async checks.

`foldkit-form` builds a form's state, validation, and control metadata directly
from the Effect `Schema.Struct` your submit handler already accepts. You pass an
operation's input schema (`Entity.input` or `Form.input`), and you get back a
[`foldkit-bundle`](../bundle/README.md) Bundle whose Model holds one
`foldkit/fieldValidation` field per key, plus typed `controls` for your view.
It is headless; [`foldkit-mixins-form`](../mixins-form/README.md) renders those
controls with accessible styling, or you can render `controls` yourself.

See a live form editing entities in [`examples/entity`](../../examples/entity)
and at [foldkit-chirp-demo.pages.dev](https://foldkit-chirp-demo.pages.dev/).

## What the form owns and what your app owns

| Fact | Owner |
| --- | --- |
| Valid input shape and constraints | Your input `Schema.Struct` |
| Meaning of each key (field or relation ID) | [`Entity.input`](../entity/README.md#reading-an-operations-input) |
| Drafts, validation state, and dirty tracking | `foldkit-form`, inside the parent Model |
| What happens on submit | Your parent `update` (mutation, sync op, or local state) |
| In-flight save state and server errors | Whoever runs the save (`foldkit-crud` or your app) |
| Options for a relation picker | Your application's query |

## How drafts become decoded values

A **draft** is what the control holds while the user is typing — raw text such
as `"4."` for a number, or `""` for an unchosen relation — which stays separate
from the typed submission value.

`Form.make` inspects your input schema and builds:

1. **`controls` and `controlsByKey`:** each field's kind, label, description,
   required flag, and Entity metadata for your view.
2. **`bundle`:** a Foldkit Bundle whose `update` handles `Changed`, `Blurred`,
   `Toggled`, `Submitted`, `Reset`, `Validated`, and `ValidatedAll`. On a valid
   `Submitted`, the bundle emits `{ _tag: 'Submitted', value }` with the decoded
   input.

## Install

```sh
pnpm add effect foldkit foldkit-bundle foldkit-entity foldkit-form
```

## A first form

This defines a `Post` entity with a required `title`, builds a `Rename` form,
and runs two edits through its `update` — first triggering a validation error,
then producing a decoded submission value:

```ts
import { Schema } from 'effect'
import { Entity } from 'foldkit-entity'
import { Form } from 'foldkit-form'

const Post = Entity.define(
  'Post',
  Schema.Struct({
    id: Schema.String,
    title: Schema.String.check(Schema.isMinLength(1, { message: 'Enter a title' })).annotate({ title: 'Title' }),
  }),
)
const RenameInput = Schema.Struct({ id: Schema.String, title: Post.fields.title.schema })
const Rename = Form.make('Rename', Entity.input(Post, RenameInput))

// 1. Typing an empty title fails the field check immediately.
const empty = Rename.bundle.update(
  Rename.initial,
  Rename.Message.Changed({ key: 'title', value: '' }),
  undefined,
)
Rename.field(empty.model, 'title') // { _tag: 'Invalid', value: '', errors: ['Enter a title'] }

// 2. Fixing the title and submitting decodes a typed RenameInput.
const typed = Rename.bundle.update(empty.model, Rename.Message.Changed({ key: 'title', value: 'Hello' }), undefined)
const submitted = Rename.bundle.update(typed.model, Rename.Message.Submitted(), undefined)
submitted.outMessage // { _tag: 'Submitted', value: { id: '', title: 'Hello' } }
```

### Placing the form in a page

Compose `Rename.bundle` into your page with `Bundle.withChild`. `onOut` is
required so submitted values are always handled:

```ts
import { Bundle } from 'foldkit-bundle'

const Page = Bundle.compose({ saved: Schema.Array(RenameInput) }).pipe(
  Bundle.withChild('rename', Rename.bundle, {
    onOut: submitted => model => ({
      model: { ...model, saved: [...model.saved, submitted.value] },
    }),
  }),
)
const RenameForm = Page.children.rename

const { placements } = Page
const update = placements.update(model => ({ model }))
let model = placements.initial({ saved: [] }).model
model = update(model, Page.Message.GotRenameMessage({
  message: Rename.Message.Changed({ key: 'title', value: 'Hello' }),
})).model
model = update(model, Page.Message.GotRenameMessage({
  message: Rename.Message.Submitted(),
})).model
// model.saved now holds [{ id: '', title: 'Hello' }]
```

- For forms without an Entity (search, login, sign-up), pass `Form.input(schema)`:
  `Form.make('Search', Form.input(SearchInput))`.
- `Rename.Message` provides `Changed({ key, value })`, `Blurred({ key })`,
  `Submitted()`, `Reset()`, `Validated({ key })`, `ValidatedAll()`,
  `Toggled({ key })` / `Toggled({ key, choice })` (applied to the current draft
  on click), `FollowedIssue({ id })`, and `AskedForMore({ key })`.
- `Rename.controls` and `Rename.controlsByKey` describe each field for views;
  `Rename.field(model.rename, key)` and `model.rename.fields.title` read a
  field's `Field<Draft>` validation state.
- When editing an existing row, call `RenameForm.helpers.fill(row)` first so
  `id` and existing values populate before submit.

## Controls

A control is pure data: a `kind`, the `draft` kept in the Model, and kind
metadata.

| Kind | Draft | Chosen when |
| --- | --- | --- |
| `Text`, `Multiline` | `string` | Schema is a string (`Multiline` when opted in) |
| `Hidden` | `string` | Opted in for non-visible keys such as `id` |
| `Number` | `string` | Schema is a number |
| `Toggle` | `boolean` | Schema is a boolean |
| `Select` | `string` | Union of string/number literals; submits the chosen literal |
| `Choices` | `string[]` | Array of string/number literals; submits chosen literals |
| `RelationOne` | `string` (`""` when empty) | Key is `Relation.input` of a `one` relation |
| `RelationMany` | `string[]` | Key is `Relation.input` of a `many` relation |

Control resolution runs from most explicit to least explicit:

1. `inputs` passed to `Form.make` (for this form only).
2. `Input.of(control)` metadata on the Entity member (everywhere that member is
   used).
3. The relation mapped by the key.
4. The shape of the key's schema.

Unknown schemas throw with the key name when `Form.make` runs.

```ts
import { Form, Input } from 'foldkit-form'

const Cms = Post.pipe(Entity.annotateMembers({ title: Input.of(Input.multiline()) }))

Form.make('Rename', Entity.input(Cms, RenameInput), { inputs: { id: Input.text() } })
```

Keys holding an ID without an Entity relation can request a picker via
`Input.relationOne(Author)` or `Input.relationMany(Tag)`. Unbounded literal arrays
like `Schema.Array(Schema.Number)` take options via `Input.choices([1, 2])`.
`Select` and `Choices` store drafts as strings and reject collisions where two
values format identically (such as `'1'` and `1`).

### Your own kind of control

Custom kinds such as prices or date pickers are built with `Input.kind`:

<!-- docs-check standalone
import { Schema } from 'effect'
import { Bundle } from 'foldkit-bundle'
import { Entity, Relation } from 'foldkit-entity'
import { Form, Input } from 'foldkit-form'
import { defineMessageUnion } from 'foldkit/message'

const ColorModel = Schema.Struct({
  open: Schema.Boolean,
  hex: Schema.String,
  recent: Schema.Array(Schema.String),
})
const ColorMessage = defineMessageUnion({ Opened: {}, Chose: { hex: Schema.String } })
const ColorPicker = Bundle.make({
  name: 'ColorPicker',
  Model: ColorModel,
  Message: ColorMessage,
  init: () => ({ model: { open: false, hex: '#000000', recent: [] } }),
  update: (model: typeof ColorModel.Type, message: typeof ColorMessage.Type) =>
    message._tag === 'Opened'
      ? { model: { ...model, open: true } }
      : { model: { ...model, hex: message.hex } },
})
const Writer = Entity.define('Writer', Schema.Struct({ id: Schema.String, name: Schema.String }))
const Article = Entity.define(
  'Article',
  Schema.Struct({
    id: Schema.String,
    title: Schema.String,
    slug: Schema.String,
    cents: Schema.Number,
    color: Schema.String,
  }),
)
const Blog = Entity.relate({ Writer, Article }, { Article: { author: Relation.one(Writer) } })
const input = Entity.input(
  Blog.Article,
  Schema.Struct({
    title: Schema.String,
    slug: Schema.String,
    cents: Schema.Number,
    color: Schema.String,
    authorId: Schema.String,
  }),
  { authorId: Relation.input(Blog.Article.relations.author) },
)
const slugify = (text: string): string => text.toLowerCase()
-->

```ts
const Cents = Input.kind<{ readonly currency: string }>('Cents', {
  draft: 'text', // what the Model holds while it is edited
  // The value the schema is given, when that is not the text itself.
  parse: draft => (/^\d+(\.\d{1,2})?$/.test(draft) ? Math.round(Number(draft) * 100) : undefined),
  // The text a value is shown as when the form is filled with it, the inverse
  // of `parse`. Without it, a filled value shows as `String(value)`.
  format: (value, data) => (Number(value) / 100).toFixed(2),
  unparsed: 'Enter an amount',
})

const Price = Form.make('Price', input, { inputs: { cents: Cents.of({ currency: 'USD' }) } })

const { control } = Price.controlsByKey.cents
Cents.is(control) && control.data.currency // 'USD'
```

- `draft` is `'text'`, `'flag'`, or `'list'`.
- `parse` converts `'text'` drafts before schema validation (`parseList` does
  the same for `'list'` drafts); returning `undefined` reports `unparsed`.
  Whitespace-only text counts as empty rather than unparsed.
- `format` turns a stored value back into `'text'` during `fill` (leaving live
  typing untouched); throwing inside `format` fails the `fill`, naming the key.
- Hooks unreachable for the chosen `draft` type fail at compile time.
- `shown: false` hides the control from rendered field lists (like `Hidden`),
  and custom kinds render through [`foldkit-mixins-form`](../mixins-form/README.md#renderers).

### A control with a Model of its own

Rich controls — a color picker with an open popover, a page builder with
selection and undo, or a rich-text editor — wrap an ordinary
[Bundle](../bundle/README.md) with `Input.bundle`:

```ts
const ColorInput = Input.bundle('ColorPicker', {
  bundle: ColorPicker, // Model { open, hex, recent }, its own Messages, a Command, a Subscription
  value: model => model.hex, // what the key validates and submits
  fill: (model, hex) => ({ ...model, hex }), // a value the form was given, written into the Model
  settled: model => ({ ...model, open: false }), // a stored form shown again: nothing in flight
})

const PostForm = Form.make('PostForm', input, { inputs: { color: ColorInput } })
const color = PostForm.control('color')

color.field(PostForm.initial) // { _tag, value: { open, hex, recent } }: validation state, the Model as value
color.send(ColorMessage.Opened()) // the form's Message carrying one of the picker's own
```

- **Messaging and edits:** control Messages travel through `Control` via
  `color.send`. Only Messages that change `value(model)` trigger validation,
  clear submit marks, and flip `authoredChanged`; UI-only changes such as
  opening a popover keep validation and dirty state clean.
- **Effects and lifecycle:** Commands, Subscriptions, and Managed Resources lift
  into the parent form keyed by the control (`ColorPicker@fields.color/…`).
  `fill`, `partial`, `settled`, submit, and `Reset` delegate through `value`,
  `fill`, and `settled`.
- **In-flight control work (`busy`):** pass `busy: model => model.sending` when
  a control runs uploads or lookups. Submitting while busy waits (`Validating`)
  until `busy` clears, then validates and submits. Controls with `busy` also
  require `settled` so restored models settle cleanly.
- **Empty values and types:** returning `undefined` or `null` from `value`
  triggers `Required` on required keys. `model.fields.color.value` is typed as
  the picker's Model, and `color.send` accepts only the picker's Messages.
- **Constraints:** control Bundles omit `OutMessage` and command service
  requirements, validate via schema rather than `check`, and omit Subscriptions
  and Resources inside nested row forms.

### A key that follows another

Use `Input.following` when one field derives from another until edited manually
(such as a URL slug following a title):

```ts
const SlugForm = Form.make('SlugForm', input, {
  inputs: { slug: Input.following('title', slugify) },
})

SlugForm.isFollowing(SlugForm.initial, 'slug') // false once the author has written it
SlugForm.partial(SlugForm.initial) // what decodes as it stands, by key: for saving unfinished work
SlugForm.settled(SlugForm.initial) // a stored Model, shown again with no check or submit in flight
SlugForm.Message.Refused({ key: 'slug', error: 'That address is taken', value: 'hello' }) // a server's word on the value sent
```

- Until the user edits the dependent key, edits to the source key rewrite and
  validate it automatically (suppressing premature errors while empty until
  submit).
- Editing the dependent key detaches it; clearing it back to empty resumes
  following.
- Calling `fill` with a non-empty value for the dependent key keeps it detached
  (preserving published slugs).
- Cycles and references to non-text keys throw when `Form.make` runs.

### A picker that searches

Add `Input.search()` to hold search text for large relation pickers without
modifying the selected ID or running validation:

```ts
const EditPost = Form.make('EditPost', input, { inputs: { authorId: Input.search() } })

const searched = EditPost.Message.Searched({ key: 'authorId', text: 'ad' })
const { model } = EditPost.bundle.update(EditPost.initial, searched, undefined)
EditPost.search(model, 'authorId') // 'ad'
```

Your application feeds `Form.search(model, key)` into the query listing picker
choices. `fill` and `Reset` clear the search text. Applying `Input.search()` to
a non-relation key throws.

### Labels

Labels and descriptions come from Effect Schema's `annotate({ title, description })`
(checking the input key's schema first, then the Entity field's) or `Form.label('Author', 'Who wrote it')`
on relations, falling back to the key name.

## Validation

Every key validates against **the input's own schema for that key**, allowing an
operation to be stricter than the underlying Entity.

### When fields validate

- **`Changed`:** validates the edited key immediately.
- **`Blurred`:** leaves untouched fields unjudged until submit so tabbing past a
  required field stays quiet, while clearing and blurring a previously edited
  field shows its error.
- **`Validated({ key })`:** validates one key on demand (useful for showing
  errors on a freshly `fill`ed record).
- **`ValidatedAll`:** validates every key (including loaded row invariants)
  without setting `attempted` or submitting, for pages submitting multiple
  forms together.
- **No-op updates:** validations that leave state unchanged return the same
  Model reference to skip redundant redraws.

### Empty values, numbers, and submits

- **Empty drafts (`""` or `[]`):** resolved in order against what the schema
  accepts — omitted key (`optionalKey`/`optional`), `Option.none()`, `null`, or
  the empty value itself. A key is `required` when none of those decode. Plain
  `Schema.String` accepts `""`; add `Schema.isMinLength(1)` to require text.
- **Option keys:** `Schema.OptionFromNullOr(Schema.String)` renders as a text
  control, validates the inner schema, submits `Option.some`/`Option.none`, and
  fills from `Option`.
- **Numbers:** unparseable text reads `"Enter a number"`; whitespace-only text
  counts as empty rather than zero.
- **Submit (`Submitted`):** validates every key and sets `model.attempted`.
  Cross-field schema errors land in `model.errors` until the next edit;
  `attempted` clears on `Reset` or `fill`.

### Entity invariants and editing an existing row

- **State invariants on submit:** `Submitted` evaluates the Entity's
  `Entity.invariant` rules over the decoded input (`Entity.judgeInput`), placing
  failures in `model.marks` beside named `path` keys (or `model.errors` when
  unpathed). Any edit clears `marks` so fixing either side of a rule clears the
  error. `Message.Refused` sets a mark while the key still holds the refused
  value.
- **Judging against an existing row (`form.over`):** edit forms often set a
  subset of fields on an existing row. Pass the loaded, encoded row via
  `form.over(model, Entity.rowFrom(entity, loaded))` (selecting extra fields
  with `Entity.selectFor(input, { also: Entity.judgedBy(input) })`). Invariants
  then judge the merged row (including `before.status` transition rules) on
  every edit once all participating form keys have been touched (`model.reached`).
  `foldkit-crud` wires this automatically.
- **Custom primitive operators:** pass `{ operators }` to `Form.make` when
  invariants use operators outside `Operators.kernel` (nested forms inherit the
  parent table by default).

### Checking whether a form can submit

| Query | True when |
| --- | --- |
| `form.isValid(model)` | Every key and row passes; async checks idle |
| `form.canSubmit(model)` | Invalid errors clear; async checks may still run |
| `form.value(model)` | `Some(input)` when all valid; otherwise `None` |

Read `form.isValid` and `form.value` when submitting manually; bind a Save
button's enabled state to `form.canSubmit`.

Field state uses `foldkit/fieldValidation`'s `Field` (`NotValidated`,
`Validating`, `Valid`, `Invalid` with `errors`). See
[Errors and failures](../../docs/errors.md#forms) for how form validation meets
server refusals.

### Checks: rules only something else can answer

Async checks (such as checking whether a slug is taken on the server) return an
Effect yielding an error string or `undefined`:

<!-- docs-check standalone
import { Effect, Schema } from 'effect'
import { Entity } from 'foldkit-entity'
import { Form } from 'foldkit-form'

const Post = Entity.define(
  'Post',
  Schema.Struct({ id: Schema.String, title: Schema.String, slug: Schema.String }),
)
const PostInput = Schema.Struct({ id: Schema.String, slug: Schema.String })
const RenameInput = Schema.Struct({ id: Schema.String, title: Post.fields.title.schema })
declare const isSlugTaken: (slug: string, except: string | undefined) => Effect.Effect<boolean>
declare const isAddressFree: (slug: string) => Effect.Effect<string | undefined>
-->

```ts
import { Effect } from 'effect'

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

- **Runs after schema validation:** checks only see decoded values (numbers, not
  raw strings). Keys read `Validating` while running and `Valid` when passing.
- **Adding service requirements (`Form.checks`):** when a check needs a service
  such as `RemoteClient`, attach it with the `Form.checks` pipe step so
  TypeScript infers the Bundle's service requirements (`R`):

  ```ts
  const CheckedForm = Form.make('PostForm', Entity.input(Post, PostInput), {
    debounce: 0,
  }).pipe(Form.checks({ slug: isAddressFree }))
  ```

- **Stale results and waiting submits:** edits re-run checks after `debounce`,
  discarding results for outdated drafts, `values`, or `subject`. Submitting
  while a check runs holds `submitPending` and emits `{ _tag: 'Submitted', value }`
  once checks pass (pass `submitWaits: false` to refuse submits while checks run
  instead).
- **Testing and `context.subject`:** checks run through `PostForm.Check`
  (resolve in stories via `Command.resolve(PostForm.Check, PostForm.Message.Checked({ key, draft, error }))`).
  When editing an existing record whose `id` sits outside the form input, send
  `Message.About({ subject: { id } })` once on open to populate `context.subject`.

### Messages

Attach custom field error messages directly on Effect Schema checks:

```ts
Schema.String.check(Schema.isMinLength(3, { message: 'Give it at least 3 letters' }))
```

Customize the form's built-in messages with `messages`:

```ts
const Localized = Form.make('Rename', Entity.input(Post, RenameInput), {
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
| `required(field)` | Empty draft on a required key | `Required` |
| `unparsed(field)` | Draft text fails control parsing | Kind's `unparsed` (`Enter a number`) |
| `invalid(field, message)` | Key schema rejects the draft | `message` |
| `form(message)` | Cross-key input schema fails | `message` |

`field` carries the key, its label, and its control.

### Words as text, in one place

Every message entry also accepts a template string (`'{label} is required'`,
with `{label}`, `{key}`, and `{message}` placeholders), which keeps words
serializable in view inputs and lets you share one catalogue across packages:

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
```

Pass the same `words` object to `Form.make`, `placed.view`, and `PostTable`;
`fillWords(template, values)` performs the substitution.

## Pipe steps

Every option is also an immutable pipe step (`Form.inputs`, `Form.checks`,
`Form.messages`, `Form.nested`, `Form.debounce`) that adds to an existing form:

<!-- docs-check standalone
import { Effect, Schema } from 'effect'
import { Entity } from 'foldkit-entity'
import { Form, Input } from 'foldkit-form'

const NewAuthor = Entity.input(
  Entity.define(
    'Writer',
    Schema.Struct({ id: Schema.String, name: Schema.String, bio: Schema.String }),
  ),
  Schema.Struct({ name: Schema.String, bio: Schema.String }),
)
const isNameTaken = (name: string): Effect.Effect<string | undefined> => Effect.succeed(undefined)
-->

```ts
const AuthorForm = Form.make('Author', NewAuthor) // as a library might hand it over

const Finished = AuthorForm.pipe(
  Form.inputs({ bio: Input.multiline() }),
  Form.checks({ name: name => isNameTaken(name) }),
  Form.messages({ required: field => `${field.label} fehlt` }),
)
```

Keys are typechecked against the form, and `Form.checks` merges service
requirements into the resulting Bundle.

## Nested input

A key mapped with [`Relation.nested`](../entity/README.md#an-input-that-holds-the-target-itself)
holds child rows, each managed as a Model of the nested form:

<!-- docs-check standalone
import { Schema } from 'effect'
import { Entity, Relation } from 'foldkit-entity'
import { Form, Input } from 'foldkit-form'

const Comment = Entity.define('Comment', Schema.Struct({ id: Schema.String, body: Schema.String }))
const Blog = Entity.relate(
  {
    Comment,
    Post: Entity.define('BlogPost', Schema.Struct({ id: Schema.String, title: Schema.String })),
  },
  { Post: { comments: Relation.many(Comment) } },
)
-->

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
| Required `one` relation | One row from the start; stays present |
| Optional `one` relation | Zero or one row; empty submits `null`/`undefined` |
| `many` relation | Zero or more rows |

- Pass `nested: { comments: CommentForm }` with a form built from the same
  target input (omitting it generates a default form inheriting `messages` and
  `debounce`).
- `PostForm.row('comments', id)` constructs typed Messages (`Changed`,
  `Blurred`, `Searched`, `RowAdded`, `send(msg)`) targeting `model.rows`; stale
  row IDs are ignored and row IDs are unique across the form's lifetime.
- Nested controls have kind `Nested` (`Input.Nested.is(control)`), holding
  `{ cardinality, optional, form }`.
- `Submitted` validates every row, waits on row async checks, surfaces list-level
  errors (such as `Schema.isMaxLength(5)`) in `model.errors`, and `fill`
  populates nested rows recursively.

## A form over a variant Entity

For an Entity created with `Entity.defineVariants`, include `_tag` as a case
picker and declare case-specific fields with `Schema.optionalKey`:

```ts
const Domain = Entity.defineVariants('Domain', {
  Available: { id: Schema.String, name: Schema.String, price: Schema.Finite },
  Unconfirmed: { id: Schema.String, name: Schema.String },
})
const Listing = Form.make(
  'Listing',
  Entity.input(
    Domain,
    Schema.Struct({
      _tag: Domain.fields._tag.schema,
      name: Schema.String,
      price: Schema.optionalKey(Schema.Finite),
    }),
  ),
)

Listing.chosen(Listing.initial) // Option.none(): no case chosen yet
Listing.shows(Listing.initial, 'price') // false until Available is chosen
```

- `_tag` becomes a choice control of case names.
- `Listing.shows(model, key)` tells your view which fields belong to the chosen
  case; `Submitted` validates and emits only the active case's fields (keeping
  other drafts intact if the user switches cases back).
- Case-specific fields must be marked `optionalKey` on the input struct so other
  cases decode cleanly.

## Editing existing values

`fill` populates drafts from loaded values while keeping drafts for keys omitted
from the patch:

<!-- docs-check standalone
import { Schema } from 'effect'
import { Bundle } from 'foldkit-bundle'
import { Entity } from 'foldkit-entity'
import { Form } from 'foldkit-form'

const Post = Entity.define(
  'Post',
  Schema.Struct({ id: Schema.String, title: Schema.String }),
)
const RenameInput = Schema.Struct({ id: Schema.String, title: Post.fields.title.schema })
const Rename = Form.make('Rename', Entity.input(Post, RenameInput))
const Page = Bundle.compose({ saved: Schema.Array(RenameInput) }).pipe(
  Bundle.withChild('rename', Rename.bundle, {
    onOut: submitted => model => ({
      model: { ...model, saved: [...model.saved, submitted.value] },
    }),
  }),
)
const RenameForm = Page.children.rename
declare const scheduleAutosave: () => void
-->

```ts
const load = RenameForm.helpers.fill({ id: 'p1', title: 'Hello' }) // an Update.Step of the page
```

Derive both the load Selection and the fill shape from `Rename.input`:

```ts
const Current = Entity.selectFor(Rename.input) // a Selection of `id` and `title`

declare const loaded: typeof Current.schema.Type
const prefill = RenameForm.helpers.fill(Entity.valuesFor(Rename.input, loaded))
```

Relations load as refs and convert back into IDs for pickers (see
[`foldkit-entity`](../entity/README.md#showing-what-is-there)).
[`foldkit-crud`](../crud/README.md) automates loading, filling, saving, and
save status tracking.

## Did an edit change anything?

`authoredChanged(before, after)` reports whether a transition changed authored
drafts or rows:

```ts
const message = Rename.Message.Changed({ key: 'title', value: 'Hello' })
const next = Rename.bundle.update(Rename.initial, message, undefined)
if (Rename.authoredChanged(Rename.initial, next.model)) scheduleAutosave()
```

It compares authored state across both Models directly, so blurs, refused
inputs, search text, `subject`, and row bookkeeping return `false`, letting
packages like [`foldkit-cms`](../cms/README.md) trigger autosave reliably.

## Limits

- **Headless:** draw forms with [`foldkit-mixins-form`](../mixins-form/README.md)
  or your own renderer over `controls`, and fetch relation picker options via a
  query (or [`foldkit-crud`](../crud/README.md)).
- **Draft type safety:** `Changed` accepts any draft value; drafts of the wrong
  type for a key are ignored rather than stored.
- **Struct values and row order:** struct fields edit via `Relation.nested` or
  `Input.bundle`; nested rows keep insertion order without built-in reordering.
- **Bundle-backed controls:** omit `OutMessage`, command services, and `check`
  options; inside nested rows, omit Subscriptions and Resources.

## Next

- Render forms with accessible slots and styles: [`foldkit-mixins-form`](../mixins-form/README.md)
- Wire a form to load, save, and delete Remote records: [`foldkit-crud`](../crud/README.md)
- Understand how form errors and server refusals fit together: [Errors and failures](../../docs/errors.md#forms)
