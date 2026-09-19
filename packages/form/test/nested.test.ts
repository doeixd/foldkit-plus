import { Effect, Schema } from 'effect'
import { Entity, Relation } from 'foldkit-entity'
import { describe, expect, expectTypeOf, it } from 'vitest'
import { Form, Input } from '../src/index.js'

const Author = Entity.define('Author', Schema.Struct({ id: Schema.String, name: Schema.String }))
const Comment = Entity.define('Comment', Schema.Struct({ id: Schema.String, body: Schema.String }))
const Post = Entity.define('Post', Schema.Struct({ id: Schema.String, title: Schema.String }))
const Blog = Entity.relate(
  { Author, Comment, Post },
  {
    Post: {
      author: Relation.one(Author),
      editor: Relation.one(Author, { optional: true }),
      comments: Relation.many(Comment),
    },
  },
)

const NewAuthor = Entity.input(
  Blog.Author,
  Schema.Struct({ name: Schema.String.check(Schema.isMinLength(2)) }),
)
const Filled = Schema.String.check(Schema.isMinLength(1))
const NewComment = Entity.input(Blog.Comment, Schema.Struct({ body: Filled }))
const CreatePostInput = Schema.Struct({
  title: Filled,
  author: NewAuthor.schema,
  editor: Schema.NullOr(NewAuthor.schema),
  comments: Schema.Array(NewComment.schema).check(Schema.isMaxLength(2)),
})
const CreatePost = Entity.input(Blog.Post, CreatePostInput, {
  author: Relation.nested(Blog.Post.relations.author, NewAuthor),
  editor: Relation.nested(Blog.Post.relations.editor, NewAuthor),
  comments: Relation.nested(Blog.Post.relations.comments, NewComment),
})

const Loaded = Entity.selectFor(CreatePost)

// The form that edits an author alone: names are taken outside it, so it asks.
const AuthorForm = Form.make('PostForm.author', NewAuthor, {
  debounce: 0,
  checks: { name: name => Effect.succeed(name === 'Root' ? 'Root is taken' : undefined) },
})

// A post's form nests that same form. `comments` is given none, so it gets a plain one.
const PostForm = Form.make('PostForm', CreatePost, { debounce: 0, nested: { author: AuthorForm } })
const { Message } = PostForm
type Model = typeof PostForm.initial
type Message = typeof PostForm.Message.Type

const authorForm = PostForm.controls[1]!.control
const commentForm = PostForm.controls[3]!.control
if (!Input.Nested.is(authorForm) || !Input.Nested.is(commentForm)) throw new Error('not nested')

const step = (model: Model, message: Message) => PostForm.bundle.update(model, message, undefined)
/** What the runtime does: run the Commands and feed their Messages back. */
const settle = async (
  model: Model,
  message: Message,
): Promise<{ readonly model: Model; readonly out: unknown }> => {
  const next = step(model, message)
  let current = { model: next.model, out: next.outMessage as unknown }
  for (const command of next.commands ?? []) {
    const answered = await settle(current.model, await Effect.runPromise(command.effect))
    current = { model: answered.model, out: answered.out ?? current.out }
  }
  return current
}
const inRow = (key: string, row: string, inner: unknown): Message =>
  Message.Nested({ key, row, message: inner })
// A row addressed: the nested form's own constructors, giving this form's Message.
const named = (row: string, value: string): Message =>
  PostForm.row('author', row).Changed({ key: 'name', value })
const said = (row: string, value: string): Message =>
  PostForm.row('comments', row).send(
    commentForm.data.form.Message.Changed({ key: 'body', value } as never),
  )

describe('a form with nested keys', () => {
  it('starts a one that must be there with its row, and every other nested key with none', () => {
    expect(PostForm.initial.rows.author.map(row => row.id)).toEqual(['r0'])
    expect(PostForm.initial.rows.editor).toEqual([])
    expect(PostForm.initial.rows.comments).toEqual([])
    expect(Object.keys(PostForm.initial.fields)).toEqual(['title'])
    expectTypeOf(PostForm.initial.rows.author[0]!.model.fields.name.value).toEqualTypeOf<string>()
  })

  it('describes a nested key as a control holding the nested form', () => {
    expect(PostForm.controls.map(control => [control.key, control.control.kind])).toEqual([
      ['title', 'Text'],
      ['author', 'Nested'],
      ['editor', 'Nested'],
      ['comments', 'Nested'],
    ])
    expect(authorForm.data).toMatchObject({ cardinality: 'one', optional: false })
    expect(PostForm.controls[2]!.control.data).toMatchObject({ cardinality: 'one', optional: true })
    expect(commentForm.data).toMatchObject({ cardinality: 'many', optional: true })
    expect(authorForm.data.form.controls.map(control => control.key)).toEqual(['name'])
  })

  it('edits a row through the nested form, and validates it by that form’s schema', () => {
    const short = step(PostForm.initial, named('r0', 'A')).model
    expect(short.rows.author[0]!.model.fields.name._tag).toBe('Invalid')
    // A Message for a row that is not there, or not one of the nested form, is dropped.
    expect(step(short, named('r9', 'Ada')).model).toBe(short)
    expect(step(short, inRow('author', 'r0', { _tag: 'Nope' })).model).toBe(short)
  })

  it('adds and removes rows, within what the relation allows', () => {
    const add = (model: Model, key: string) => step(model, Message.RowAdded({ key })).model
    const two = add(add(PostForm.initial, 'comments'), 'comments')
    expect(two.rows.comments.map(row => row.id)).toEqual(['r1', 'r2'])

    const one = step(two, Message.RowRemoved({ key: 'comments', row: 'r1' })).model
    expect(one.rows.comments.map(row => row.id)).toEqual(['r2'])
    // An id is never reused, so a Message in flight cannot land in another row.
    expect(add(one, 'comments').rows.comments.map(row => row.id)).toEqual(['r2', 'r3'])

    // A one takes one row; a one that must be there keeps it.
    expect(add(PostForm.initial, 'author').rows.author).toHaveLength(1)
    expect(
      step(PostForm.initial, Message.RowRemoved({ key: 'author', row: 'r0' })).model.rows.author,
    ).toHaveLength(1)
    const withEditor = add(PostForm.initial, 'editor')
    expect(add(withEditor, 'editor').rows.editor).toHaveLength(1)
  })

  it('submits the nested values: one, none, and many', async () => {
    let model = step(PostForm.initial, Message.Changed({ key: 'title', value: 'Hello' })).model
    model = (await settle(model, named('r0', 'Ada'))).model
    model = step(model, Message.RowAdded({ key: 'comments' })).model
    model = step(model, said('r1', 'First')).model

    expect((await settle(model, Message.Submitted())).out).toEqual({
      _tag: 'Submitted',
      value: {
        title: 'Hello',
        author: { name: 'Ada' },
        editor: null,
        comments: [{ body: 'First' }],
      },
    })
  })

  it('shows every failure on submit, in the rows too, and sends nothing', async () => {
    const withComment = step(PostForm.initial, Message.RowAdded({ key: 'comments' })).model
    const sent = await settle(withComment, Message.Submitted())

    expect(sent.out).toBeUndefined()
    expect(sent.model.fields.title._tag).toBe('Invalid')
    expect(sent.model.rows.author[0]!.model.fields.name._tag).toBe('Invalid')
    expect(sent.model.rows.comments[0]!.model.fields.body._tag).toBe('Invalid')
    expect(PostForm.canSubmit(sent.model)).toBe(false)
  })

  it('waits for a check in a row, and sends when it passes', async () => {
    const titled = step(PostForm.initial, Message.Changed({ key: 'title', value: 'Hello' })).model
    const asking = step(titled, named('r0', 'Ada'))
    expect(asking.model.rows.author[0]!.model.fields.name._tag).toBe('Validating')
    expect(asking.commands?.map(command => command.name)).toEqual(['PostForm.author.check'])

    const waiting = step(asking.model, Message.Submitted())
    expect(waiting.outMessage).toBeUndefined()
    expect(waiting.model.submitPending).toBe(true)

    const answer = await Effect.runPromise(asking.commands![0]!.effect)
    expect(step(waiting.model, answer).outMessage).toMatchObject({
      value: { author: { name: 'Ada' } },
    })
  })

  it('sends nothing when the check in a row fails, and an edit in a row cancels the wait', async () => {
    const titled = step(PostForm.initial, Message.Changed({ key: 'title', value: 'Hello' })).model
    const asking = step(titled, named('r0', 'Root'))
    const waiting = step(asking.model, Message.Submitted()).model
    const failed = step(waiting, await Effect.runPromise(asking.commands![0]!.effect))
    expect(failed.outMessage).toBeUndefined()
    expect(failed.model.submitPending).toBe(false)
    expect(failed.model.rows.author[0]!.model.fields.name).toMatchObject({
      _tag: 'Invalid',
      errors: ['Root is taken'],
    })

    expect(step(waiting, named('r0', 'Roo')).model.submitPending).toBe(false)
  })

  it('holds a rule on the rows as a failure of the whole', async () => {
    let model = step(PostForm.initial, Message.Changed({ key: 'title', value: 'Hello' })).model
    model = (await settle(model, named('r0', 'Ada'))).model
    for (const row of ['r1', 'r2', 'r3']) {
      model = step(model, Message.RowAdded({ key: 'comments' })).model
      model = step(model, said(row, 'Hi')).model
    }
    const sent = await settle(model, Message.Submitted())
    expect(sent.out).toBeUndefined()
    expect(sent.model.errors).toHaveLength(1)
  })

  it('fills rows from values, as an edit form does', () => {
    const filled = PostForm.fill(PostForm.initial, {
      title: 'Hello',
      author: { name: 'Ada' },
      editor: { name: 'Grace' },
      comments: [{ body: 'First' }, { body: 'Second' }],
    }).model

    expect(filled.rows.author[0]!.model.fields.name.value).toBe('Ada')
    expect(filled.rows.editor[0]!.model.fields.name.value).toBe('Grace')
    expect(filled.rows.comments.map(row => row.model.fields.body.value)).toEqual([
      'First',
      'Second',
    ])
    // Ids carry on from the rows the form already had.
    expect(new Set(Object.values(filled.rows).flatMap(rows => rows.map(row => row.id))).size).toBe(
      4,
    )
    expect(PostForm.fill(filled, { editor: null }).model.rows.editor).toEqual([])
  })

  it('shows what Entity.selectFor loads, and submits it back unchanged', async () => {
    // What an edit screen does: load the input's Selection, turn it into values, fill.
    const loaded: typeof Loaded.schema.Type = {
      title: 'Hello',
      author: { name: 'Ada' },
      editor: null,
      comments: [{ body: 'First' }],
    }
    const filled = PostForm.fill(PostForm.initial, Entity.valuesFor(CreatePost, loaded)).model

    expect((await settle(filled, Message.Submitted())).out).toEqual({
      _tag: 'Submitted',
      value: loaded,
    })
  })

  it('decodes and encodes its Model, rows and all', () => {
    const model = step(PostForm.initial, Message.RowAdded({ key: 'comments' })).model
    const codec = PostForm.bundle.Model
    const encoded = Schema.encodeSync(codec)(model)
    expect(Schema.decodeUnknownSync(codec)(encoded)).toEqual(model)
  })

  it('treats a submit inside a row as a submit of the form', () => {
    const sent = step(PostForm.initial, inRow('author', 'r0', { _tag: 'Submitted' }))
    expect(sent.model.fields.title._tag).toBe('Invalid')
  })

  it('nests the form it is given, and hands it back typed', () => {
    expect(PostForm.nested.author).toBe(AuthorForm)
    expect(authorForm.data.form).toBe(AuthorForm)
    // The handle's constructors are the author form's, so its keys are checked.
    expectTypeOf(PostForm.row('author', 'r0').Changed)
      .parameter(0)
      .toHaveProperty('key')
      .toEqualTypeOf<'name'>()
    expect(PostForm.row('author', 'r0').Blurred({ key: 'name' })).toEqual(
      Message.Nested({
        key: 'author',
        row: 'r0',
        message: AuthorForm.Message.Blurred({ key: 'name' }),
      }),
    )
  })

  it('refuses a form of another input than the key nests', () => {
    const Other = Form.make(
      'Other',
      Entity.input(Blog.Author, Schema.Struct({ name: Schema.String })),
    )
    expect(() => Form.make('Wrong', CreatePost, { nested: { author: Other as never } })).toThrow(
      '"author" is given a form of another input than the one it nests',
    )
  })
})
