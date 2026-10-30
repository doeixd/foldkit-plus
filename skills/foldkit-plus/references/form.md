# foldkit-form

Checked against `foldkit-form` 0.8.1, `foldkit-mixins-form` 0.10.0 and `foldkit-form-recipes` 0.1.1.

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
   Changed ──► validate the draft against the key's own input schema
   Submitted ──► every key valid, whole input decoded, the row's invariants hold ──► out Message { value }
```

A draft is what the control holds: a number being typed is text, an unchosen
relation is `""`. It becomes a value only when checked. An invariant calling a
primitive operator is judged by `Form.make(name, input, { operators })`
(`Operators.kernel` by default); one the table lacks is left to the server.

## Minimal example

```ts
import { Schema } from 'effect'
import { Bundle } from 'foldkit-bundle'
import { Entity } from 'foldkit-entity'
import { Form } from 'foldkit-form'
import { defineMessageUnion } from 'foldkit/message'
import { modifyFields } from 'foldkit/struct'

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
// A form that writes no Entity: Form.make('Search', Form.input(SearchInput)).

const Slot = Bundle.declare(Rename.bundle, 'rename')
const Model = Schema.Struct({ ...Slot.fields, saved: Schema.Array(RenameInput) })
const Message = defineMessageUnion({ ...Slot.cases })

const Page = Bundle.parent({ Model, Message })
const RenameForm = Page.at(Slot, {
  onOut: submitted => model => ({
    model: modifyFields(model, { saved: saved => [...saved, submitted.value] }),
  }),
})
```

## Common tasks

- **Dispatch from a view:** `Rename.Message.Changed({ key, value })`,
  `Toggled({ key, choice? })` (a press on a flag or one choice, applied to the draft
  as it lands, so presses faster than a frame all count),
  `Blurred({ key })`, `Submitted()`, `Reset()`, `ValidatedAll()`, wrapped in the placement's
  Message (`Message.GotRenameMessage({ message })`).
- **When a failure shows:** an edit validates its key at once; a blur validates
  nothing, so tabbing through a field never says `Required`; a submit validates
  every key and sets `model.attempted` (`form.attempted(model)`; `Reset` and
  `fill` clear it), after which `FormView` draws its list of fields to fix.
  `Validated({ key })` checks one key on request (a stored value
  shown by `fill`, which validates nothing).
- **Posting without scripts:** `foldkit-mixins-form` names every control by
  its key (`name=<key>`; a relation picker's checkboxes also carry `value`), so
  a plain form post carries the drafts.
- **Draw it:** `Rename.controls` is the keys in order, each with `control`
  (`Text`, `Multiline`, `Hidden`, `Number`, `Toggle`, `Select` with `options` (string or number
  literals; the value is the option itself), `Choices` with `options` (any number
  of them), `RelationOne` / `RelationMany` with `target`), `label`, `description`,
  `required`, and the Entity `member`; `Rename.controlsByKey.title` is one by
  key, for a view that places each field itself. Read a key's state with
  `Rename.field(model.rename, key)` and `foldkit/fieldValidation` (`match`,
  `isInvalid`); cross-key failures are in `model.rename.errors`.
- **Choose a control:** `Form.make(name, input, { inputs: { body: Input.multiline() } })`
  for this form; `Entity.annotateMembers({ body: Input.of(Input.multiline()) })`
  for the member everywhere. Otherwise: the relation the key writes, then the
  schema's shape. No match throws at `Form.make`, naming the key.
  A key holding ids that is not a relation: `Input.relationOne(Author)`,
  `Input.relationMany(Tag)`. An array of literals is a choice of any number of
  them; a set the schema cannot spell takes `Input.choices([1, 2])`.
- **Label:** `Schema.String.annotate({ title, description })` on the input key or
  the Entity field. A relation takes `Form.label('Author')` as Entity metadata.
- **Ask something outside the form** (is this slug taken?): `checks: { slug: (slug, { values }) => Effect }`
  answering an error message or `undefined`. It runs after the key's schema passes
  and gets the decoded value; the key reads `Validating` meanwhile; a stale answer
  is dropped; `debounce` (default 300ms) rests a key before asking. A submit during
  a check sets `submitPending` and goes out when the last check passes. The check's
  requirements become the Bundle's — but a check that needs something must be added
  with the `Form.checks` step (`form.pipe(Form.checks({ slug: ask }))`), not in
  `Form.make`'s options, where `R` infers as `never` and the check is refused.
  The ask is the Command `form.Check`; a test resolves it with
  `Command.resolve(form.Check, form.Message.Checked({ key, draft, error }))`. The
  Command's own answer also carries the `values` and `subject` it read; one about
  values or a subject the form no longer holds is asked again, and a waiting submit
  waits for that.
  `{ values }` is what else decodes; `{ subject }`
  is what the form edits but its values do not carry (a post's row id), set once with
  `Message.About({ subject: { id } })` and read with `form.subject(model)` — `{}` while
  the form creates. It survives `fill` and `Reset`.
- **A relation with too many targets to list:** `inputs: { authorId: Input.search() }`.
  The form holds the typed text (`Message.Searched({ key, text })`,
  `form.search(model, key)`); read it as the input of the query that lists the
  choices. `foldkit-mixins-form` draws the search box.
- **A control of your own** (date, rich text, money): controls are one primitive,
  `{ kind, draft, shown, searches, data, parse?, parseList?, format? }`, and the
  shipped kinds are made the way yours is:
  `const Cents = Input.kind<{ currency: string }>('Cents', { draft: 'text', parse, format, unparsed })`,
  then `inputs: { cents: Cents.of({ currency: 'USD' }) }` and `Cents.is(control)`.
  `parse` reads a text draft as a value, `parseList` reads a list draft the same
  way, and `format` is the other direction: the text a value is shown as when the
  form is filled with it, so a stored `1234` reads as `'12.34'`. Without it a
  filled value shows as `String(value)`. `format` is never called while someone
  types, so a caret and a composition are not disturbed. A hook a draft can never
  reach is a type error: `parse` and `format` are a text draft's, `parseList` a
  list draft's.
  Draw it with `FormView.define(form, { renderers: { Cents: ctx => ... } })`; the
  same table replaces a shipped renderer.
- **A control with a Model of its own** (a color picker with a popover, a page
  builder, a rich-text editor): `Input.bundle('ColorPicker', { bundle, value, fill, settled?, busy? })`
  (`busy`: work the value waits on, such as an upload; a submit waits for it, as for a check, in a row too; `busy` needs `settled`)
  over an ordinary Bundle. The key's draft is the Bundle's Model
  (`model.fields.color.value`, typed); `form.control('color').send(message)`
  wraps one of its Messages as the form's `Control`; its Commands,
  Subscriptions and Resources become the form's. A Message is an edit (validated,
  autosaved by CMS) only when it changes `value(model)`. `FormView` draws it with
  the Bundle's view unless a renderer names its kind; a renderer gets
  `bundle: { model, send }`.
- **Finish a form made elsewhere:** every option is a pipe step giving a new form:
  `AuthorForm.pipe(Form.inputs({ bio: Input.multiline() }), Form.checks({...}), Form.messages({...}))`;
  also `Form.nested` and `Form.debounce`. Keys are checked against the piped form.
- **One bag of words:** a form's `messages`, the drawn form's `words`, and the
  drawn list's `words` are text with blanks (`'{label} is required'`,
  `'Add {label}'`) and share no key, so `const words = {...} satisfies FormMessages & FormViewWords & ViewWords`
  serves all three. Never put a function in a placed view's inputs below the top
  level: Foldkit throws.
- **A key written from another until the author writes it** (a slug from a title):
  `inputs: { slug: Input.following('title', slugify) }`. Emptying it hands it back;
  a form filled with a value for it does not follow; `form.isFollowing(model, key)`.
- **Word or translate it:** put a rule's words on the rule
  (`Schema.isMinLength(3, { message: '…' })`); give `Form.make` a `messages`
  option for the form's own (`required`, `unparsed`), a rewrite of Schema's
  (`invalid(field, message)`), and cross-key failures (`form(message)`).
- **Carry a key without showing it** (the id being edited):
  `inputs: { id: Input.hidden() }`, then set it with `fill`.
- **Read a key as a view shows it:** `Rename.field(model.rename, key)` gives
  `Field<Draft>` with its marks applied; `model.rename.fields.title` is the key's own
  validation, typed to its key, without the marks.
- **Edit existing values:** `RenameForm.helpers.fill({ id, title })` is an
  `Update.Step` of the parent; keys not passed keep their draft. With Remote:
  load `Data.get(Entity.selectFor(Rename.input), id)`, then
  `fill(Entity.valuesFor(Rename.input, loaded))`.
- **Enable the button:** `Rename.canSubmit(model.rename)` (true while a check
  runs; the submit waits). **Valid right now:** `Rename.isValid(model.rename)`.
  **Read what a submit would send:** `Rename.value(model.rename)` is the decoded
  input as `Some` when every key and row is valid as it stands, `None` otherwise
  — what a parent that submits several forms reads per form.
  **Show every error without submitting** (a page that submits several forms
  itself): `Message.ValidatedAll()`.
- **Optional keys:** `Schema.optionalKey` / `Schema.optional` left empty are
  valid and absent from the value; a key typed `Option` (`OptionFromNullOr`) is
  edited as the value it holds and submits `Option.some` / `Option.none()`.
- **Put a server's error on a key** (a unique index, a rule only a server knows):
  `Message.Refused({ key, error, value })`, `value` being the key's value in the
  submit refused. While the key still holds it, it reads invalid with that reason
  (a mark in `model.marks`, shown by `form.field`), and a submit stops until the
  next edit of any key clears it; a key changed meanwhile drops the Message.
  Invariant failures are marks the same way. `Checked` will not do: it only
  answers a check the form itself started.
- **Show a stored Model again:** `form.settled(model)`; a check that was running
  when it was stored never answers, so its key reads `NotValidated`.
- **Save unfinished work:** `form.partial(model)` is the value less every key that
  is not valid yet; `form.value` is all or nothing.

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

Render the placement with `placed.view(model, h, { options, words: { submit: 'Save' } })`.
`options` is keyed by the form's keys and supplies each relation picker's
choices (`{ value, label }`); loading them is the application's query.
`locked: ['ownerId']` draws those keys `disabled` (a key the person may not set; a hint,
the server still checks). `FormView.define(Rename)` alone is a complete unstyled form. `words.none` words the
blank choice of a picker; a chosen value the choices lack is shown as `? value`. `FieldSlots`: `root`,
`label`, `description`, `error`, `checking`, and one per control kind (`text`, `multiline`,
`number`, `toggle`, `select` with its `option`s, `choices`, `choiceLabel`, `choice`), plus `control`, `search`, `more` (the
"Show more" button under a picker the view's `more` input names), and
`group`/`affix` for a renderer's control with text beside it. `FormSlots`: `root`, `errors`,
`summary` (with `summaryTitle`, `issues`, `issue`, `issueLink`), `submit`, and for nested
rows `group`, `legend`, `row`, `add`, `remove`. After a submit (`form.attempted`), while any
field is invalid, `summary` lists each one above the submit button as a link to its control
(`href="#id"`; a press focuses the control and sends `FollowedIssue({ id })`, which changes
nothing), worded by `words.summary` (`Check these fields:`) and `words.issue`
(`{label}: {error}`), a row's field named with its row by `words.inRow` (`{row}, {label}`).
A form of one control draws no list. The view owns `id`, `label for`, `aria-invalid`,
`aria-required`, `aria-describedby`, and `role="alert"`: on the list while it shows, else on
each field's error; a Behavior that supplies one of those throws a two-owners conflict at render.

While a key's check runs, its field draws a `checking` line (`role="status"`,
words `words.checking`) and its `root` carries `data-validation` with the
field's state. Pass `submitting: <your in-flight flag>` in the view inputs; the
form also counts a submit waiting on a check. While submitting, the `form` is
`aria-busy` with `data-submitting`, and the button is disabled and reads
`words.submitting`.

The views ship unstyled; `foldkit-mixins-form/recipes` (beside `foldkit-mixins-ui`)
has a look for each: `Style.forSlots(FieldSlots)(Field({}))` (label over control,
the field's lines under it, mixins-ui's field looks on its controls, a failure in
the error's ink) and `Style.forSlots(FormSlots)(Form({}))` (fields in a column, the
submit as the primary button, as wide as its words). Adjust with `.extend`.

To draw every field through `foldkit-mixins-ui`'s components, the optional
`foldkit-mixins-form/ui` entry exports `renderers(styles?)`, a renderer for every
shipped kind: `FormView.define(Rename, { renderers: UiForm.renderers({ input,
textarea, select, checkbox, checkboxGroup }) })`, each style optional and for that
component's Slots (`Recipes.Input()` and the like). The field around each control,
its name, id, accessibility state and Messages are the plain path's; Toggle and the
choice kinds are `role="checkbox"` buttons that post through hidden inputs. A
FieldSlots style for a control the table draws (`text`, `select`, …) no longer
reaches it; the label, description, checking line and error keep theirs.

For one key in a custom layout, the same entry exports
`field({ toMessage, inputStyle, textareaStyle?, draw?, words? })`, a
`FormView.fields` override for Text/Multiline; its checking line reads `words.checking`. Install `foldkit-mixins-ui` and `@foldkit/ui`;
styles target their Input/Textarea Slots and read the field's state. It preserves
Changed/Blurred dispatch, name, required state, hints, checking and errors.
`draw` receives label/control/description nodes and `field` for a custom layout;
other control kinds need the default renderer or a separate override. Custom
submit buttons use `Button.view`; this integration does not replace the generated
view's native button. Real adopters:
https://github.com/doeixd/foldkit-plus/blob/main/examples/foldkit/form/src/main.ts
and https://github.com/doeixd/foldkit-plus/blob/main/examples/foldkit/auth/src/page/loggedOut/page/login.ts.

## Recipes: dates, times, amounts, text-shaped keys and an image

`foldkit-form-recipes` holds the controls whose parsing is easy to get wrong. A
recipe is `{ control, display }`, made from one set of options: `control` goes in
a form's `inputs` (or `Input.of`), `display` in `Display.of`.

```ts
import { Schema } from 'effect'
import { Form } from 'foldkit-form'
import { FieldRecipes } from 'foldkit-form-recipes'
import { renderers } from 'foldkit-form-recipes/html'
import { FormView } from 'foldkit-mixins-form'
import { CalendarDate } from 'foldkit/calendar'

const due = FieldRecipes.date() // a CalendarDate key, edited as YYYY-MM-DD
const startsAt = FieldRecipes.dateTime({ stored: 'instant', zone: 'Europe/London' })
const MeetingInput = Schema.Struct({ due: CalendarDate, startsAt: Schema.String })
const Meeting = Form.make('Meeting', Form.input(MeetingInput), {
  inputs: { due: due.control, startsAt: startsAt.control },
})
const View = FormView.define(Meeting, { renderers: renderers() }) // date and datetime-local inputs
```

- `date()`: value `CalendarDate` (`Calendar.CalendarDate` or
  `CalendarDateFromIsoString`); anything but `YYYY-MM-DD` reads `Enter a date`.
- `dateTime({ stored: 'local' })`: the value is the wall-clock text, kept as typed.
  `{ stored: 'instant', zone }`: an ISO instant, shown and read in the IANA
  `zone` (a parameter, never the runtime's); a time the clocks skip is refused, a
  repeated one reads as the earlier unless written with its offset
  (`2026-11-01T01:30-05:00`, how a filled later one is shown, as text), and an
  unknown zone throws at definition. A fill throws for an instant no draft holds
  unchanged: finer than a millisecond, or naming a date that does not exist.
- A fill with a value of the wrong form throws, naming the key. `locale` changes
  only what a display says.
- `email()`, `url({ protocols? })` (https/http by default), `tel()`,
  `password({ purpose: 'current' | 'new' })` and `slug(from, { prefix? })` keep
  what was typed; their renderers set the input type, `autocomplete` and keyboard.
  A slug's control is a `ControlChange` (form `inputs` only); a password has no
  reveal toggle and is hidden in a list.
- `money({ currency, unit: 'minor' | 'decimal', locale?, negative? })`,
  `decimal({ scale })`, `percent({ unit: 'fraction' | 'points' })`: read and shown in
  the locale, exact (minor units are integers, `'decimal'` is text), in its own
  currency or percent format (`de-AT`, `fr-CH`, rtl locales round-trip); grouping
  other than the locale's, extra decimals, an unasked-for minus and a value a
  double would round are refused. A bad scale or a malformed currency code throws when
  the recipe is made.
- Kinds are named `'FieldRecipes.Date'`, `'FieldRecipes.Money'`, …, so an
  application's own `Date` kind does not meet a recipe's renderer; the kinds
  themselves are `FieldRecipes.Kinds.Date` and so on (`FieldRecipes.Kinds.Date.is(control)`).
- `foldkit-form-recipes/ui`'s `renderers({ input? })` draws the same inputs under
  `foldkit-mixins-ui`'s Input Slot, beside `UiForm.renderers(...)`.
- `foldkit-form-recipes/image`'s `image({ id, url?, headers?, words?, styles? })` is a
  key holding the `HashedAsset` the upload route keeps. Its control is a Bundle:
  `Empty -> Sending -> Kept`, Cancel back to `Empty` (aborting the request), a
  refusal `Refused` with Try again; only `Kept` is a value. It is `busy` while it
  sends, so a submit waits for it. The page's session cookie answers the
  route's `UploadPolicy`: never a deployment secret in `headers`. As a Bundle
  control it takes no `check` and cannot sit in a nested row.
- Every recipe through a real form, as a trace and a page each:
  https://github.com/doeixd/foldkit-plus/blob/main/examples/fields/README.md

## Nested input

A key mapped with `Relation.nested(relation, input)` holds rows of a form built
from the nested input: exactly one (a required `one`), none or one (a `one`
admitting `null`/`undefined`), or any number (a `many`).

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

- The nested form is a form you make from the nested input and pass under
  `nested`; it is reused as is. Rows live in `model.rows[key]`, not `model.fields`.
  Address one with `form.row(key, rowId).Changed({ key, value })` (the nested form's
  constructors, giving the parent's Message); `form.nested[key]` is the form.
- Submit validates and waits for checks in every row; the value carries the
  nested values. `fill` fills rows. `foldkit-mixins-form` draws rows with add and
  remove buttons; pickers inside rows take `nestedOptions: { 'key.childKey': [...] }`.
- A Bundle control's view that takes inputs gets them from the form view's
  `controls`, by key (a row key by its path):
  `placed.view(model, h, { controls: { document: BuilderView.inputs({ data }) } })`.

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
- A struct-valued key is editable as a nested input (`Relation.nested`) or
  through `Input.bundle`.
- `Input.bundle`'s Bundle has no OutMessage and needs no services; its key takes
  no `check`; `form.field` refuses its key (use `form.control(key).field`); a
  nested form whose control has Subscriptions or Resources is refused.

## See also

- https://github.com/doeixd/foldkit-plus/blob/main/packages/form/README.md
- https://github.com/doeixd/foldkit-plus/blob/main/packages/mixins-form/README.md
- https://github.com/doeixd/foldkit-plus/blob/main/packages/form-recipes/README.md
- https://github.com/doeixd/foldkit-plus/blob/main/examples/fields/README.md (every recipe through a real form)
- https://github.com/doeixd/foldkit-plus/blob/main/packages/entity/README.md
- https://github.com/doeixd/foldkit-plus/blob/main/packages/bundle/README.md
