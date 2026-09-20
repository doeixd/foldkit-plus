import { Schema } from 'effect'
import { Entity, Relation } from 'foldkit-entity'
import { describe, expect, it } from 'vitest'
import { Form, Input, fillWords } from '../src/index.js'

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
    expect(CreatePost.controls.map(entry => [entry.key, entry.control.kind])).toEqual([
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
    expect(byKey.status?.control).toEqual(Input.select(['draft', 'live']))
    expect(byKey.authorId?.control.data).toMatchObject({ target: Blog.Author })
    expect(byKey.tagIds?.control.data).toMatchObject({ target: Blog.Tag })
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
    expect(Quick.controls[0]?.control).toEqual(Input.multiline())
  })

  it('carries a hidden key as text and reads any key through `field`', () => {
    const Edit = Form.make('Edit', Entity.input(Cms, Schema.Struct({ id: Schema.String })), {
      inputs: { id: Input.hidden() },
    })
    const { model } = Edit.bundle.helpers!.fill(Edit.bundle.init(undefined).model, { id: 'p1' })

    expect(Edit.controls[0]?.control).toMatchObject({ kind: 'Hidden', shown: false })
    expect(Edit.field(model, 'id')).toEqual({ _tag: 'NotValidated', value: 'p1' })
    expect(Edit.bundle.update(model, Edit.Message.Submitted(), undefined).outMessage).toEqual({
      _tag: 'Submitted',
      value: { id: 'p1' },
    })
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
    // Only spaces is nothing entered, not zero.
    expect(send(initial, change('rating', '  ')).model.fields.rating._tag).toBe('NotValidated')
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

  it('gives what decodes as it stands, less every key that does not yet', () => {
    const { model } = send(initial, change('title', 'Hello'), change('rating', '9'))
    const partial = CreatePost.partial(model)
    expect(partial.title).toBe('Hello')
    // Out of range, and an author not chosen: neither is part of unfinished work.
    expect('rating' in partial).toBe(false)
    expect('authorId' in partial).toBe(false)
    expect(CreatePost.engine.value(model)).toBeUndefined()
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
    // An edit answers that failure; it describes a form that has since changed.
    const edited = Range.bundle.update(
      run('5', '2').model,
      Range.Message.Changed({ key: 'high', value: '9' }),
      undefined,
    )
    expect(edited.model.errors).toEqual([])
    expect(run('2', '5').outMessage).toMatchObject({ value: { low: 2, high: 5 } })
  })
})

describe('Form messages', () => {
  const Rated = Schema.Struct({
    title: Schema.String.check(Schema.isMinLength(3, { message: 'Give it at least 3 letters' })),
    rating: Schema.Number.check(Schema.isBetween({ minimum: 1, maximum: 5 })),
  })
  const input = Entity.input(Cms, Rated)
  const errorsOf = (
    form: ReturnType<typeof Form.make<'F', typeof Cms, typeof Rated.fields, typeof input.members>>,
  ) => {
    const send = (key: 'title' | 'rating', value: string) =>
      form.bundle.update(
        form.bundle.init(undefined).model,
        form.Message.Changed({ key, value }),
        undefined,
      ).model.fields[key]
    const blurred = form.bundle.update(
      form.bundle.init(undefined).model,
      form.Message.Blurred({ key: 'title' }),
      undefined,
    ).model.fields.title
    return {
      required: blurred._tag === 'Invalid' ? blurred.errors[0] : undefined,
      rule: send('title', 'ab'),
      unparsed: send('rating', 'five'),
      range: send('rating', '9'),
    }
  }

  it('says a rule in the words written on the rule, and its own in plain English', () => {
    const said = errorsOf(Form.make('F', input))

    expect(said.required).toBe('Required')
    expect(said.rule).toMatchObject({ errors: ['Give it at least 3 letters'] })
    expect(said.unparsed).toMatchObject({ errors: ['Enter a number'] })
  })

  it('takes every word from the application, naming the field', () => {
    const said = errorsOf(
      Form.make('F', input, {
        messages: {
          required: field => `${field.label} fehlt`,
          unparsed: field => `${field.label}: bitte eine Zahl`,
          invalid: (field, message) =>
            field.key === 'rating' ? 'Zwischen 1 und 5' : `${field.label}: ${message}`,
        },
      }),
    )

    expect(said.required).toBe('Title fehlt')
    expect(said.unparsed).toMatchObject({ errors: ['rating: bitte eine Zahl'] })
    expect(said.range).toMatchObject({ errors: ['Zwischen 1 und 5'] })
    // The rule's own message still arrives, for `invalid` to keep or replace.
    expect(said.rule).toMatchObject({ errors: ['Title: Give it at least 3 letters'] })
  })

  it('rewrites a failure that spans keys', () => {
    const Range = Form.make(
      'Range',
      Entity.input(
        Cms,
        Schema.Struct({ low: Schema.Number, high: Schema.Number }).check(
          Schema.makeFilter(range => range.low <= range.high || 'low>high'),
        ),
        { low: Entity.unmapped, high: Entity.unmapped },
      ),
      {
        messages: {
          form: message => (message.includes('low>high') ? 'Von muss vor Bis liegen' : message),
        },
      },
    )
    const model = [
      Range.Message.Changed({ key: 'low', value: '5' }),
      Range.Message.Changed({ key: 'high', value: '2' }),
      Range.Message.Submitted(),
    ].reduce(
      (current, message) => Range.bundle.update(current, message, undefined).model,
      Range.bundle.init(undefined).model,
    )

    expect(model.errors).toEqual(['Von muss vor Bis liegen'])
  })
})

describe('a relation picker that searches', () => {
  const input = Entity.input(Cms, CreatePostInput, {
    authorId: Relation.input(Cms.relations.author),
    editorId: Relation.input(Cms.relations.editor),
    tagIds: Relation.input(Cms.relations.tags),
    notify: Entity.unmapped,
  })
  const Searching = Form.make('Searching', input, {
    inputs: { authorId: Input.search(), tagIds: Input.search() },
  })
  const start = Searching.initial
  const step = (model: typeof start, message: typeof Searching.Message.Type) =>
    Searching.bundle.update(model, message, undefined).model

  it('keeps the picker of the relation, and marks it as searching', () => {
    const control = (key: string) =>
      Searching.controls.find(candidate => candidate.key === key)!.control
    expect(control('authorId')).toMatchObject({ kind: 'RelationOne', searches: true })
    expect(control('tagIds')).toMatchObject({ kind: 'RelationMany', searches: true })
    expect(control('editorId')).toMatchObject({ searches: false })
  })

  it('holds what was typed, changing no draft and validating nothing', () => {
    const typed = step(start, Searching.Message.Searched({ key: 'authorId', text: 'ad' }))
    expect(Searching.search(typed, 'authorId')).toBe('ad')
    expect(Searching.search(typed, 'tagIds')).toBe('')
    expect(typed.fields).toBe(start.fields)
  })

  it('ignores a search for a key whose picker does not search', () => {
    const typed = step(start, Searching.Message.Searched({ key: 'editorId', text: 'ad' }))
    expect(typed).toBe(start)
  })

  it('starts over with the form: a fill or a reset is another search', () => {
    const typed = step(start, Searching.Message.Searched({ key: 'authorId', text: 'ad' }))
    expect(Searching.search(Searching.fill(typed, { title: 'x' }).model, 'authorId')).toBe('')
    expect(Searching.search(step(typed, Searching.Message.Reset()), 'authorId')).toBe('')
  })

  it('refuses a search on a key that is not a relation', () => {
    expect(() => Form.make('Wrong', input, { inputs: { title: Input.search() } })).toThrow(
      '"title" is not a relation, so it has no picker to search',
    )
  })
})

describe('a kind of control an application makes', () => {
  // Made with the call the shipped kinds were made with.
  const Cents = Input.kind<{ readonly currency: string }>('Cents', {
    draft: 'text',
    parse: draft => (/^\d+(\.\d{1,2})?$/.test(draft) ? Math.round(Number(draft) * 100) : undefined),
    unparsed: 'Enter an amount',
  })
  const Priced = Form.make(
    'Priced',
    Entity.input(
      Entity.define('Item', Schema.Struct({ id: Schema.String, cents: Schema.Number })),
      Schema.Struct({ cents: Schema.Number }),
    ),
    { inputs: { cents: Cents.of({ currency: 'USD' }) } },
  )
  const typed = (value: string) =>
    Priced.bundle.update(Priced.initial, Priced.Message.Changed({ key: 'cents', value }), undefined)

  it('is a control like any other: told by its kind, carrying its data', () => {
    const [{ control }] = Priced.controls as [(typeof Priced.controls)[number]]
    expect(Cents.is(control) && control.data.currency).toBe('USD')
    expect(Input.Number.is(control)).toBe(false)
    expect(control).toMatchObject({ kind: 'Cents', draft: 'text', shown: true })
  })

  it('reads its text its own way before the schema sees it, and says so when it cannot', () => {
    expect(typed('12.50').model.fields.cents).toEqual({ _tag: 'Valid', value: '12.50' })
    expect(typed('12.505').model.fields.cents).toMatchObject({
      _tag: 'Invalid',
      errors: ['Enter an amount'],
    })
    const sent = Priced.bundle.update(typed('12.50').model, Priced.Message.Submitted(), undefined)
    expect(sent.outMessage).toEqual({ _tag: 'Submitted', value: { cents: 1250 } })
  })
})

describe('words as text', () => {
  const Rated = Schema.Struct({
    title: Schema.String.check(Schema.isMinLength(3, { message: 'too short' })),
    rating: Schema.Number,
  })
  const Worded = Form.make('Worded', Entity.input(Cms, Rated, { rating: Entity.unmapped }), {
    // Text with blanks, as a translation catalogue holds it; a function still works.
    messages: {
      required: '{label} fehlt',
      unparsed: '{label}: bitte eine Zahl',
      invalid: field => `${field.key}!`,
    },
  })
  const errorsAfter = (key: 'title' | 'rating', value: string) => {
    const changed = Worded.bundle.update(
      Worded.initial,
      Worded.Message.Changed({ key, value }),
      undefined,
    ).model
    const blurred = Worded.bundle.update(changed, Worded.Message.Blurred({ key }), undefined)
    return (blurred.model.fields[key] as { readonly errors?: ReadonlyArray<string> }).errors
  }

  it('fills the blanks of words given as text', () => {
    expect(errorsAfter('title', '')).toEqual(['Title fehlt'])
    expect(errorsAfter('rating', 'five')).toEqual(['rating: bitte eine Zahl'])
    expect(errorsAfter('title', 'ab')).toEqual(['title!'])
  })

  it('leaves a blank it has no value for as it is written', () => {
    expect(fillWords('{label} / {nope}', { label: 'Title' })).toBe('Title / {nope}')
    expect(fillWords('{constructor}', {})).toBe('{constructor}')
  })
})
