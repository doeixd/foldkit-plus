import { Schema } from 'effect'
import { Entity, Relation } from 'foldkit-entity'
import { describe, expect, it } from 'vitest'
import { Form, Input } from '../src/index.js'

const Author = Entity.define('Author', Schema.Struct({ id: Schema.String, name: Schema.String }))
const Tag = Entity.define('Tag', Schema.Struct({ id: Schema.String, name: Schema.String }))
const Post = Entity.define(
  'Post',
  Schema.Struct({
    id: Schema.String,
    title: Schema.String.check(Schema.isMinLength(3)).annotate({
      title: 'Title',
      description: 'Shown in the feed',
    }),
    body: Schema.String,
    status: Schema.Literals(['draft', 'live']),
    rating: Schema.Number,
    featured: Schema.Boolean,
  }),
)
const Blog = Entity.relate(
  { Author, Tag, Post },
  {
    Post: {
      author: Relation.one(Author),
      editor: Relation.one(Author, { optional: true }),
      tags: Relation.many(Tag),
    },
  },
)
const Cms = Blog.Post.pipe(
  Entity.annotateMembers({
    body: Input.of(Input.multiline()),
    author: Form.label('Author', 'Who wrote it'),
  }),
)

const CreatePostInput = Schema.Struct({
  title: Cms.fields.title.schema,
  body: Schema.optional(Schema.String),
  status: Schema.Literals(['draft', 'live']),
  rating: Schema.NullOr(Schema.Number.check(Schema.isBetween({ minimum: 1, maximum: 5 }))),
  featured: Schema.Boolean,
  authorId: Schema.String.check(Schema.isMinLength(1)),
  editorId: Schema.NullOr(Schema.String),
  tagIds: Schema.Array(Schema.String),
  notify: Schema.Boolean,
})

const CreatePost = Form.make(
  'CreatePost',
  Entity.input(Cms, CreatePostInput, {
    authorId: Relation.input(Cms.relations.author),
    editorId: Relation.input(Cms.relations.editor),
    tagIds: Relation.input(Cms.relations.tags),
    notify: Entity.unmapped,
  }),
)

const { Message } = CreatePost
type Model = ReturnType<typeof CreatePost.bundle.init>['model']
const initial = CreatePost.bundle.init(undefined).model
const send = (model: Model, ...messages: ReadonlyArray<typeof Message.Type>) =>
  messages.reduce(
    (state, message) => {
      const next = CreatePost.bundle.update(state.model, message, undefined)
      return { model: next.model, out: next.outMessage ?? state.out }
    },
    { model, out: undefined as { readonly value: unknown } | undefined },
  )
const change = (
  key: (typeof CreatePost.controls)[number]['key'],
  value: string | boolean | string[],
) => Message.Changed({ key, value })

const filled = [
  change('title', 'Hello'),
  change('status', 'draft'),
  change('authorId', 'a1'),
] as const

describe('Form.make controls', () => {
  it('resolves a control per key: metadata, then the relation, then the schema', () => {
    expect(CreatePost.controls.map(entry => [entry.key, entry.control._tag])).toEqual([
      ['title', 'Text'],
      ['body', 'Multiline'],
      ['status', 'Select'],
      ['rating', 'Number'],
      ['featured', 'Toggle'],
      ['authorId', 'RelationOne'],
      ['editorId', 'RelationOne'],
      ['tagIds', 'RelationMany'],
      ['notify', 'Toggle'],
    ])
    const byKey = Object.fromEntries(CreatePost.controls.map(entry => [entry.key, entry]))
    expect(byKey.status?.control).toEqual({ _tag: 'Select', options: ['draft', 'live'] })
    expect(byKey.authorId?.control).toMatchObject({ target: Blog.Author })
    expect(byKey.tagIds?.control).toMatchObject({ target: Blog.Tag })
  })

  it('labels from the schema annotation, then Form.label, then the key', () => {
    const byKey = Object.fromEntries(CreatePost.controls.map(entry => [entry.key, entry]))
    expect(byKey.title).toMatchObject({ label: 'Title', description: 'Shown in the feed' })
    expect(byKey.authorId).toMatchObject({ label: 'Author', description: 'Who wrote it' })
    expect(byKey.notify).toMatchObject({ label: 'notify', description: undefined })
  })

  it('marks a key required exactly when its schema admits nothing for an empty draft', () => {
    const required = CreatePost.controls.filter(entry => entry.required).map(entry => entry.key)
    // `tagIds` admits [], `body` undefined, `rating` and `editorId` null; a toggle is never empty.
    expect(required).toEqual(['title', 'status', 'authorId'])
  })

  it('takes a control for this form only, over the resolver', () => {
    const Quick = Form.make('Quick', Entity.input(Cms, Schema.Struct({ title: Schema.String })), {
      inputs: { title: Input.multiline() },
    })
    expect(Quick.controls[0]?.control).toEqual({ _tag: 'Multiline' })
  })

  it.each([
    [
      'a key whose schema suggests no control',
      () =>
        Form.make(
          'Odd',
          Entity.input(Cms, Schema.Struct({ when: Schema.Date }), { when: Entity.unmapped }),
        ),
      'Form "Odd": no control for "when"; name one under "inputs"',
    ],
    [
      'a control whose draft the schema can never accept',
      () =>
        Form.make('Odd', Entity.input(Cms, Schema.Struct({ title: Schema.String })), {
          inputs: { title: Input.toggle() },
        }),
      'Form "Odd": "title" is edited as Toggle, but its schema accepts no such value',
    ],
  ])('rejects %s', (_, make, message) => {
    expect(make).toThrow(message)
  })
})

describe('Form update', () => {
  it('starts with every key not validated and its empty draft', () => {
    expect(initial.errors).toEqual([])
    expect(initial.fields.title).toEqual({ _tag: 'NotValidated', value: '' })
    expect(initial.fields.featured).toEqual({ _tag: 'NotValidated', value: false })
    expect(initial.fields.tagIds).toEqual({ _tag: 'NotValidated', value: [] })
  })

  it('validates an edit against the input’s own schema', () => {
    const { model } = send(initial, change('title', 'Hi'), change('rating', '9'))
    expect(model.fields.title).toMatchObject({ _tag: 'Invalid', value: 'Hi' })
    expect(model.fields.rating).toMatchObject({ _tag: 'Invalid', value: '9' })
    expect(send(model, change('title', 'Hello')).model.fields.title).toEqual({
      _tag: 'Valid',
      value: 'Hello',
    })
  })

  it('keeps a number as the text being typed, and says when it is not one', () => {
    const { model } = send(initial, change('rating', '4.'), change('rating', 'four'))
    expect(model.fields.rating).toEqual({
      _tag: 'Invalid',
      value: 'four',
      errors: ['Enter a number'],
    })
    expect(send(initial, change('rating', '4.')).model.fields.rating._tag).toBe('Valid')
  })

  it('reports a required key on blur, and leaves an optional one alone', () => {
    const { model } = send(
      initial,
      Message.Blurred({ key: 'title' }),
      Message.Blurred({ key: 'body' }),
    )
    expect(model.fields.title).toEqual({ _tag: 'Invalid', value: '', errors: ['Required'] })
    expect(model.fields.body).toEqual({ _tag: 'NotValidated', value: '' })
  })

  it('ignores a draft of another kind than the key’s control holds', () => {
    expect(send(initial, change('featured', 'yes')).model).toBe(initial)
    expect(send(initial, change('title', true)).model).toBe(initial)
  })

  it('does not submit while a key is unacceptable, and shows every failure', () => {
    const { model, out } = send(initial, Message.Submitted())
    expect(out).toBeUndefined()
    expect(CreatePost.canSubmit(initial)).toBe(false)
    const invalid = Object.entries(model.fields).flatMap(([key, field]) =>
      field._tag === 'Invalid' ? [key] : [],
    )
    expect(invalid).toEqual(['title', 'status', 'authorId'])
  })

  it('submits the decoded input: numbers parsed, nothing as the schema admits it', () => {
    const { out, model } = send(initial, ...filled, Message.Submitted())
    expect(out).toEqual({
      _tag: 'Submitted',
      value: {
        title: 'Hello',
        status: 'draft',
        rating: null,
        featured: false,
        authorId: 'a1',
        editorId: null,
        tagIds: [],
        notify: false,
      },
    })
    expect(model.errors).toEqual([])
    expect(Schema.is(CreatePostInput)(out?.value)).toBe(true)

    const full = send(
      initial,
      ...filled,
      change('body', 'Text'),
      change('rating', '4'),
      change('featured', true),
      change('tagIds', ['t1', 't2']),
      Message.Submitted(),
    )
    expect(full.out?.value).toMatchObject({
      body: 'Text',
      rating: 4,
      featured: true,
      tagIds: ['t1', 't2'],
    })
  })

  it('resets to the initial Model', () => {
    expect(send(initial, ...filled, Message.Reset()).model).toEqual(initial)
  })

  it('fills existing values as drafts, leaving the other keys as they are', () => {
    const typed = send(initial, change('body', 'Draft text')).model
    const { model } = CreatePost.bundle.helpers!.fill(typed, {
      title: 'Existing',
      rating: 3,
      editorId: null,
      tagIds: ['t1'],
    })
    expect(model.fields.title).toEqual({ _tag: 'NotValidated', value: 'Existing' })
    expect(model.fields.rating).toEqual({ _tag: 'NotValidated', value: '3' })
    expect(model.fields.editorId).toEqual({ _tag: 'NotValidated', value: '' })
    expect(model.fields.tagIds).toEqual({ _tag: 'NotValidated', value: ['t1'] })
    expect(model.fields.body).toEqual(typed.fields.body)
  })

  it('reports a rule that spans keys as a form error, not a field’s', () => {
    const Range = Form.make(
      'Range',
      Entity.input(
        Cms,
        Schema.Struct({ low: Schema.Number, high: Schema.Number }).check(
          Schema.makeFilter(range => range.low <= range.high || 'low must not exceed high'),
        ),
        { low: Entity.unmapped, high: Entity.unmapped },
      ),
    )
    const start = Range.bundle.init(undefined).model
    const run = (low: string, high: string) =>
      [
        Range.Message.Changed({ key: 'low', value: low }),
        Range.Message.Changed({ key: 'high', value: high }),
        Range.Message.Submitted(),
      ].reduce((state, message) => Range.bundle.update(state.model, message, undefined), {
        model: start,
      } as ReturnType<typeof Range.bundle.update>)

    expect(run('5', '2').outMessage).toBeUndefined()
    expect(run('5', '2').model.errors[0]).toContain('low must not exceed high')
    expect(run('2', '5').outMessage).toMatchObject({ value: { low: 2, high: 5 } })
  })
})
