/**
 * `Input.bundle`: a key whose draft is a Bundle's Model. The child here is a
 * small tag editor, with its own Messages, a Command, a Subscription and a
 * Resource, so every part a stateful control can have reaches the form.
 */
import { Effect, Option, Schema, Stream } from 'effect'
import { Bundle } from 'foldkit-bundle'
import { Entity, Relation } from 'foldkit-entity'
import * as ManagedResource from 'foldkit/managedResource'
import { defineMessageUnion } from 'foldkit/message'
import * as Subscription from 'foldkit/subscription'
import { describe, expect, expectTypeOf, it } from 'vitest'
import { Form, Input } from '../src/index.js'

const TagsModel = Schema.Struct({
  tags: Schema.Array(Schema.String),
  typing: Schema.String,
})
type TagsModel = typeof TagsModel.Type

const TagsMessage = defineMessageUnion({
  Typed: { text: Schema.String },
  Committed: {},
  /** The Command's answer: the tags with the typed one added, trimmed. */
  Normalized: { tags: Schema.Array(Schema.String) },
})
type TagsMessage = typeof TagsMessage.Type

const Lookup = ManagedResource.tag<string>()('tag-lookup')

/** The editor's Model, Messages and transitions, with no listener and no resource. */
const tagsParts = {
  Model: TagsModel,
  Message: TagsMessage,
  init: () => ({
    model: { tags: [], typing: '' },
    commands: [{ name: 'tags.warm', effect: Effect.succeed(TagsMessage.Typed({ text: '' })) }],
  }),
  update: (model: TagsModel, message: TagsMessage) => {
    switch (message._tag) {
      case 'Typed':
        return { model: { ...model, typing: message.text } }
      case 'Committed':
        return {
          model: { ...model, typing: '' },
          commands: [
            {
              name: 'tags.normalize',
              effect: Effect.succeed(
                TagsMessage.Normalized({ tags: [...model.tags, model.typing.trim()] }),
              ),
            },
          ],
        }
      case 'Normalized':
        return { model: { ...model, tags: message.tags } }
    }
  },
}

/** A tag editor that listens while typing and holds a lookup while it has text. */
const TagEditor = Bundle.make({
  name: 'TagEditor',
  ...tagsParts,
  subscriptions: () =>
    Subscription.make<TagsModel, TagsMessage>()(entry => ({
      typing: entry(
        { typing: Schema.String },
        {
          modelToDependencies: model => ({ typing: model.typing }),
          dependenciesToStream: () => Stream.empty,
        },
      ),
    })),
  resources: () =>
    ManagedResource.make<TagsModel, TagsMessage>()(entry => ({
      lookup: entry(Schema.Option(Schema.String), {
        resource: Lookup,
        modelToMaybeRequirements: model =>
          model.typing === '' ? Option.none() : Option.some(model.typing),
        acquire: typing => Effect.succeed(typing),
        release: () => Effect.void,
        onAcquired: () => TagsMessage.Typed({ text: '' }),
        onReleased: () => TagsMessage.Typed({ text: '' }),
        onAcquireError: () => TagsMessage.Typed({ text: '' }),
      }),
    })),
})

/** The same editor with no listener and no resource, as a row of a nested form may hold. */
const QuietTagEditor = Bundle.make({ name: 'QuietTagEditor', ...tagsParts })

const TagsInput = Input.bundle('Tags', {
  bundle: TagEditor,
  value: model => (model.tags.length === 0 ? undefined : model.tags),
  fill: (model, tags) => ({ ...model, tags, typing: '' }),
  settled: model => ({ ...model, typing: '' }),
})

const Post = Entity.define(
  'Post',
  Schema.Struct({
    id: Schema.String,
    title: Schema.String,
    tags: Schema.Array(Schema.String).check(Schema.isMaxLength(2)),
  }),
)
const PostInput = Entity.input(
  Post,
  Schema.Struct({ title: Post.fields.title.schema, tags: Post.fields.tags.schema }),
)
const PostForm = Form.make('PostForm', PostInput, { inputs: { tags: TagsInput } })
const tags = PostForm.control('tags')
const update = (model: typeof PostForm.initial, message: typeof PostForm.Message.Type) =>
  PostForm.bundle.update(model, message, undefined)

/** Runs a Command's Effect and hands back the Message it answers with. */
const answer = (command: { readonly effect: Effect.Effect<typeof PostForm.Message.Type> }) =>
  Effect.runSync(command.effect)

describe('a key edited by a control backed by a Bundle', () => {
  it('holds the Bundle’s Model as its draft, starting from its init', () => {
    const field = tags.field(PostForm.initial)
    expect(field).toEqual({ _tag: 'NotValidated', value: { tags: [], typing: '' } })
    expectTypeOf(field.value).toEqualTypeOf<TagsModel>()
    expect(PostForm.controls.find(control => control.key === 'tags')?.control).toMatchObject({
      kind: 'Tags',
      draft: 'model',
    })
  })

  it('round-trips the Model through its schema, with the control’s draft inside', () => {
    const typed = update(PostForm.initial, tags.send(TagsMessage.Typed({ text: 'effect' }))).model
    const encoded = Schema.encodeSync(PostForm.bundle.Model)(typed)
    expect(Schema.decodeUnknownSync(PostForm.bundle.Model)(encoded)).toEqual(typed)
  })

  it('routes the Bundle’s Messages, and a Message that changes no value is not an edit', () => {
    const typed = update(PostForm.initial, tags.send(TagsMessage.Typed({ text: 'effect' })))
    expect(tags.field(typed.model).value.typing).toBe('effect')
    // The value is still nothing, so nothing was validated and nothing authored.
    expect(tags.field(typed.model)._tag).toBe('NotValidated')
    expect(PostForm.authoredChanged(PostForm.initial, typed.model)).toBe(false)
  })

  it('lifts the Bundle’s Commands, whose answers come back as the form’s Messages', () => {
    const typed = update(PostForm.initial, tags.send(TagsMessage.Typed({ text: ' effect ' }))).model
    const committed = update(typed, tags.send(TagsMessage.Committed()))
    expect(committed.commands).toHaveLength(1)
    const normalized = answer(committed.commands![0]!)
    expect(normalized).toEqual(
      PostForm.Message.Control({
        key: 'tags',
        message: TagsMessage.Normalized({ tags: ['effect'] }),
      }),
    )
    const landed = update(committed.model, normalized).model
    expect(tags.field(landed)).toEqual({
      _tag: 'Valid',
      value: { tags: ['effect'], typing: '' },
    })
    expect(PostForm.authoredChanged(committed.model, landed)).toBe(true)
  })

  it('validates the value with the key’s schema when a Message changes it', () => {
    const three = TagsMessage.Normalized({ tags: ['a', 'b', 'c'] })
    const refused = update(PostForm.initial, tags.send(three)).model
    expect(tags.field(refused)._tag).toBe('Invalid')
  })

  it('submits the value the control reads from its Model', () => {
    const titled = update(
      PostForm.initial,
      PostForm.Message.Changed({ key: 'title', value: 'Hello' }),
    ).model
    const tagged = update(titled, tags.send(TagsMessage.Normalized({ tags: ['effect'] }))).model
    expect(update(tagged, PostForm.Message.Submitted()).outMessage).toEqual({
      _tag: 'Submitted',
      value: { title: 'Hello', tags: ['effect'] },
    })
    expect(PostForm.partial(tagged)).toEqual({ title: 'Hello', tags: ['effect'] })
  })

  it('says a required key is missing when the control holds no value', () => {
    const submitted = update(PostForm.initial, PostForm.Message.Submitted()).model
    expect(tags.field(submitted)).toMatchObject({ _tag: 'Invalid', errors: ['Required'] })
  })

  it('fills the control through its own fill, keeping the rest of its Model', () => {
    const typed = update(PostForm.initial, tags.send(TagsMessage.Typed({ text: 'draft' }))).model
    const filled = PostForm.fill(typed, { tags: ['one'] }).model
    expect(tags.field(filled)).toEqual({
      _tag: 'NotValidated',
      value: { tags: ['one'], typing: '' },
    })
  })

  it('settles the control’s Model for a stored form shown again', () => {
    const typed = update(PostForm.initial, tags.send(TagsMessage.Typed({ text: 'draft' }))).model
    expect(tags.field(PostForm.settled(typed)).value.typing).toBe('')
  })

  it('resets the control to its initial Model', () => {
    const tagged = update(
      PostForm.initial,
      tags.send(TagsMessage.Normalized({ tags: ['effect'] })),
    ).model
    const reset = update(tagged, PostForm.Message.Reset()).model
    expect(tags.field(reset).value).toEqual({ tags: [], typing: '' })
  })

  it('drops a Message the Bundle does not take, and a draft sent as Changed', () => {
    const stray = update(
      PostForm.initial,
      PostForm.Message.Control({ key: 'tags', message: { _tag: 'Unknown' } }),
    ).model
    expect(stray).toBe(PostForm.initial)
    const changed = update(
      PostForm.initial,
      PostForm.Message.Changed({ key: 'tags', value: 'effect' }),
    ).model
    expect(changed).toBe(PostForm.initial)
  })

  it('carries the Bundle’s init Commands, Subscriptions and Resources as the form’s', () => {
    const init = PostForm.bundle.init(undefined)
    expect(init.commands?.map(command => command.name)).toEqual(['tags.warm'])
    expect(answer(init.commands![0]!)).toEqual(
      PostForm.Message.Control({ key: 'tags', message: TagsMessage.Typed({ text: '' }) }),
    )
    expect(Object.keys(PostForm.bundle.subscriptions?.(undefined) ?? {})).toEqual([
      'TagEditor@fields.tags/typing',
    ])
    expect(Object.keys(PostForm.bundle.resources?.(undefined) ?? {})).toEqual([
      'TagEditor@fields.tags/lookup',
    ])
  })

  it('gives a plain form no Subscriptions or Resources', () => {
    const TitleInput = Entity.input(Post, Schema.Struct({ title: Post.fields.title.schema }))
    const Plain = Form.make('Plain', TitleInput)
    expect(Plain.bundle.subscriptions).toBeUndefined()
    expect(Plain.bundle.resources).toBeUndefined()
    // A runtime running a form provides Resources only when a control has some.
    type ResourcesOf<F> = F extends { readonly resources?: (args: void) => infer R } ? R : never
    expectTypeOf<ResourcesOf<typeof PostForm.bundle>>().toEqualTypeOf<
      Readonly<Record<string, never>>
    >()
    expectTypeOf<ResourcesOf<typeof Plain.bundle>>().toEqualTypeOf<{}>()
  })

  it('refuses a check on the key, and reading it as a draft', () => {
    expect(() =>
      Form.make('Checked', PostInput, {
        inputs: { tags: TagsInput },
        checks: { tags: () => Effect.succeed('never asked') },
      }),
    ).toThrow('"tags" is edited by a control backed by a Bundle, which takes no check')
    expect(() =>
      // @ts-expect-error: `tags` holds a control's Model, which `field` does not read.
      PostForm.field(PostForm.initial, 'tags'),
    ).toThrow('"tags" holds a control\'s Model, not a draft; read it with control')
  })

  it('types the key’s draft and the Messages it may be sent', () => {
    expectTypeOf(PostForm.initial.fields.tags.value).toEqualTypeOf<TagsModel>()
    expectTypeOf(PostForm.initial.fields.title.value).toEqualTypeOf<string>()
    expectTypeOf(tags.send).parameter(0).toEqualTypeOf<TagsMessage>()
    expect(() =>
      // @ts-expect-error: `title` holds a draft, not a control's Model.
      PostForm.control('title'),
    ).toThrow('"title" is not edited by a control backed by a Bundle')
  })

  it('keeps the control’s type through a pipe step', () => {
    // The same editor, holding the title it is typing rather than its tags.
    const TypingInput = Input.bundle('Typing', {
      bundle: TagEditor,
      value: model => (model.typing === '' ? undefined : model.typing),
      fill: (model, typing) => ({ ...model, typing }),
    })
    const Plain = Form.make('Plain', PostInput, { inputs: { tags: TagsInput } })
    const Piped = Plain.pipe(Form.inputs({ title: TypingInput }))
    expectTypeOf(Piped.initial.fields.title.value).toEqualTypeOf<TagsModel>()
    expectTypeOf(Piped.initial.fields.tags.value).toEqualTypeOf<TagsModel>()
    const typed = Piped.bundle.update(
      Piped.initial,
      Piped.control('title').send(TagsMessage.Typed({ text: 'Hello' })),
      undefined,
    ).model
    expect(Piped.partial(typed)).toEqual({ title: 'Hello' })
  })
})

describe('a control inside a nested form', () => {
  it('refuses a nested form whose control has Subscriptions or Resources, which rows cannot run', () => {
    const Author = Entity.define(
      'Author',
      Schema.Struct({ id: Schema.String, tags: Schema.Array(Schema.String) }),
    )
    const Book = Entity.define('Book', Schema.Struct({ id: Schema.String }))
    const Shelf = Entity.relate({ Author, Book }, { Book: { author: Relation.one(Author) } })
    const AuthorInput = Entity.input(
      Shelf.Author,
      Schema.Struct({ tags: Shelf.Author.fields.tags.schema }),
    )
    const Listening = Form.make('Listening', AuthorInput, { inputs: { tags: TagsInput } })
    expect(() =>
      Form.make(
        'Book',
        Entity.input(Shelf.Book, Schema.Struct({ author: AuthorInput.schema }), {
          author: Relation.nested(Shelf.Book.relations.author, AuthorInput),
        }),
        { nested: { author: Listening } },
      ),
    ).toThrow('"author" nests a form with a control whose Bundle has Subscriptions or Resources')
  })

  const Author = Entity.define(
    'Author',
    Schema.Struct({ id: Schema.String, tags: Schema.Array(Schema.String) }),
  )
  const Book = Entity.define('Book', Schema.Struct({ id: Schema.String, title: Schema.String }))
  const Library = Entity.relate({ Author, Book }, { Book: { author: Relation.one(Author) } })
  const AuthorInput = Entity.input(
    Library.Author,
    Schema.Struct({ tags: Library.Author.fields.tags.schema }),
  )
  const AuthorForm = Form.make('AuthorForm', AuthorInput, {
    inputs: {
      tags: Input.bundle('Tags', {
        bundle: QuietTagEditor,
        value: model => (model.tags.length === 0 ? undefined : model.tags),
        fill: (model, tags) => ({ ...model, tags, typing: '' }),
      }),
    },
  })
  // A rule over the whole input: the title may not be one of the author's tags.
  const BookInput = Entity.input(
    Library.Book,
    Schema.Struct({ title: Library.Book.fields.title.schema, author: AuthorInput.schema }).check(
      Schema.makeFilter(book => !book.author.tags.includes(book.title) || 'title is a tag'),
    ),
    { author: Relation.nested(Library.Book.relations.author, AuthorInput) },
  )
  const BookForm = Form.make('BookForm', BookInput, { nested: { author: AuthorForm } })

  const send = (model: typeof BookForm.initial, message: typeof BookForm.Message.Type) =>
    BookForm.bundle.update(model, message, undefined).model

  it('edits the row’s control through the row, and counts it as an edit of the whole', () => {
    const [row] = BookForm.rows(BookForm.initial, 'author')
    const tag = (model: typeof BookForm.initial, tags: ReadonlyArray<string>) =>
      send(
        model,
        BookForm.row('author', row?.id ?? '').send(
          AuthorForm.control('tags').send(TagsMessage.Normalized({ tags })),
        ),
      )
    const titled = send(BookForm.initial, BookForm.Message.Changed({ key: 'title', value: 'poet' }))
    const refused = send(tag(titled, ['poet']), BookForm.Message.Submitted())
    expect(refused.errors).toEqual(['title is a tag'])

    const retagged = tag(refused, ['novelist'])
    expect(BookForm.authoredChanged(refused, retagged)).toBe(true)
    // An edit answers the last submit, so its failure of the whole no longer shows.
    expect(retagged.errors).toEqual([])
    expect(BookForm.partial(retagged).author).toEqual({ tags: ['novelist'] })
  })
})
