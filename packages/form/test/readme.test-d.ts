// The README's snippets, compiled. Keep the two in step.
import { Effect, Schema } from 'effect'
import { Bundle } from 'foldkit-bundle'
import { Entity, Relation } from 'foldkit-entity'
import { defineMessageUnion } from 'foldkit/message'
import type * as Update from 'foldkit/update'
import { expectTypeOf } from 'vitest'
import { Form, Input } from '../src/index.js'

const Post = Entity.define(
  'Post',
  Schema.Struct({
    id: Schema.String,
    title: Schema.String.check(Schema.isMinLength(1)).annotate({ title: 'Title' }),
  }),
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
const { Model, Message } = Page
const RenameForm = Page.children.rename

expectTypeOf(Rename.controls[0]!.key).toEqualTypeOf<'id' | 'title'>()
Rename.Message.Changed({ key: 'title', value: 'Hello' })
// @ts-expect-error "slug" is not a key of the form
Rename.Message.Changed({ key: 'slug', value: 'Hello' })

const Cms = Post.pipe(Entity.annotateMembers({ title: Input.of(Input.multiline()) }))
Form.make('Rename', Entity.input(Cms, RenameInput), { inputs: { id: Input.text() } })
// @ts-expect-error "slug" is not a key of the input
Form.make('Rename', Entity.input(Cms, RenameInput), { inputs: { slug: Input.text() } })

const load = RenameForm.helpers.fill({ id: 'p1', title: 'Hello' })
expectTypeOf(load).toExtend<Update.Step<typeof Model.Type, typeof Message.Type>>()

const Current = Entity.selectFor(Rename.input)
declare const loaded: typeof Current.schema.Type
const prefill = RenameForm.helpers.fill(Entity.valuesFor(Rename.input, loaded))
expectTypeOf(prefill).toExtend<Update.Step<typeof Model.Type, typeof Message.Type>>()
expectTypeOf<typeof Current.schema.Type>().toEqualTypeOf<{
  readonly id: string
  readonly title: string
}>()

{
  const Rename = Form.make('Rename', Entity.input(Post, RenameInput), {
    messages: {
      required: field => `${field.label} is missing`,
      unparsed: field => `${field.label} must be a number`,
      invalid: (field, message) => `${field.label}: ${message}`,
      form: message => message,
    },
  })
  void Rename
}

{
  const PostInput = Schema.Struct({ id: Schema.String, slug: Schema.String })
  const isSlugTaken = (_slug: string, _except: string | undefined): Effect.Effect<boolean> =>
    Effect.succeed(false)
  const PostForm = Form.make('PostForm', Entity.input(Entity.define('P', PostInput), PostInput), {
    checks: {
      // The decoded value, and whatever else in the form decodes right now.
      slug: (slug, { values }) =>
        isSlugTaken(slug, values.id).pipe(
          Effect.map(taken => (taken ? `"${slug}" is taken` : undefined)),
        ),
    },
    debounce: '300 millis',
  })
  void PostForm
}

{
  const Comment = Entity.define(
    'Comment',
    Schema.Struct({ id: Schema.String, body: Schema.String }),
  )
  const Blog = Entity.relate(
    {
      Comment,
      Post: Entity.define('BlogPost', Schema.Struct({ id: Schema.String, title: Schema.String })),
    },
    { Post: { comments: Relation.many(Comment) } },
  )
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
  expectTypeOf(
    PostForm.rows(PostForm.initial, 'comments')[0]!.model.fields.body.value,
  ).toEqualTypeOf<string>()
}

{
  const NewAuthor = Entity.input(
    Entity.define(
      'Writer',
      Schema.Struct({ id: Schema.String, name: Schema.String, bio: Schema.String }),
    ),
    Schema.Struct({ name: Schema.String, bio: Schema.String }),
  )
  const isNameTaken = (_: string): Effect.Effect<string | undefined> => Effect.succeed(undefined)
  const AuthorForm = Form.make('Author', NewAuthor) // as a library might hand it over

  const Finished = AuthorForm.pipe(
    Form.inputs({ bio: Input.multiline() }),
    Form.checks({ name: name => isNameTaken(name) }),
    Form.messages({ required: field => `${field.label} fehlt` }),
  )
  void Finished
}

{
  const input = Entity.input(
    Entity.define('Addressed', Schema.Struct({ id: Schema.String, title: Schema.String })),
    Schema.Struct({ title: Schema.String, slug: Schema.String }),
    { slug: Entity.unmapped },
  )
  const slugify = (text: string): string => text.toLowerCase()
  const PostForm = Form.make('PostForm', input, {
    inputs: { slug: Input.following('title', slugify) },
  })

  PostForm.isFollowing(PostForm.initial, 'slug') // false once the author has written it
}

{
  const { placements } = Page
  const update = placements.update(model => ({ model }))
  let model = placements.initial({ saved: [] }).model
  model = update(
    model,
    Page.Message.GotRenameMessage({
      message: Rename.Message.Changed({ key: 'title', value: 'Hello' }),
    }),
  ).model
  model = update(
    model,
    Page.Message.GotRenameMessage({
      message: Rename.Message.Submitted(),
    }),
  ).model
  // model.saved contains the decoded input, with title "Hello" and id "".
}

// A control with a Model of its own
{
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
  const Colored = Entity.define(
    'Colored',
    Schema.Struct({ id: Schema.String, title: Schema.String, color: Schema.String }),
  )
  const input = Entity.input(
    Colored,
    Schema.Struct({ title: Colored.fields.title.schema, color: Colored.fields.color.schema }),
  )

  const ColorInput = Input.bundle('ColorPicker', {
    bundle: ColorPicker,
    value: model => model.hex,
    fill: (model, hex) => ({ ...model, hex }),
    settled: model => ({ ...model, open: false }),
  })

  const PostForm = Form.make('PostForm', input, { inputs: { color: ColorInput } })
  const color = PostForm.control('color')

  expectTypeOf(color.field(PostForm.initial).value).toEqualTypeOf<typeof ColorModel.Type>()
  color.send(ColorMessage.Opened())
  // @ts-expect-error the picker takes only its own Messages
  color.send(PostForm.Message.Submitted())
  // @ts-expect-error `color` holds the picker's Model, not a draft
  PostForm.field(PostForm.initial, 'color')
}
