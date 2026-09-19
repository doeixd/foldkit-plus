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

const Slot = Bundle.declare(Rename.bundle, 'rename')
const Model = Schema.Struct({ ...Slot.fields, saved: Schema.Array(RenameInput) })
const Message = defineMessageUnion({ ...Slot.cases })

const Page = Bundle.parent({ Model, Message })
const RenameForm = Page.at(Slot, {
  onOut: submitted => model => ({
    model: { ...model, saved: [...model.saved, submitted.value] },
  }),
})

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
