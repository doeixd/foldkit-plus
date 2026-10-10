/**
 * A write as a value: `Write.update` over an operation's input, what it may
 * write, and the row and values one invocation writes, as the store holds them.
 */
import { Option, Schema, SchemaGetter } from 'effect'
import { describe, expect, it } from 'vitest'
import { Entity, Relation, Write } from '../src/index.js'

/** A date the store keeps as ISO text: what bind must encode to. */
const Day = Schema.Date.pipe(
  Schema.encodeTo(Schema.String, {
    decode: SchemaGetter.transform((iso: string) => new Date(iso)),
    encode: SchemaGetter.transform((at: Date) => at.toISOString()),
  }),
)

const Author = Entity.define('Author', Schema.Struct({ id: Schema.String, name: Schema.String }))
const Post = Entity.define(
  'Post',
  Schema.Struct({
    id: Schema.String,
    title: Schema.String,
    due: Day,
    revision: Schema.Number,
  }),
)
const Blog = Entity.relate(
  { Author, Post },
  {
    Post: {
      author: Relation.one(Author),
      editor: Relation.one(Author, { optional: true }),
      readers: Relation.many(Author),
    },
  },
)

const EditPost = Entity.input(
  Blog.Post,
  Schema.Struct({
    id: Schema.String,
    title: Schema.String,
    due: Day,
    revision: Schema.Number,
    note: Schema.String,
  }),
  { note: Entity.unmapped },
)

describe('Write.update', () => {
  it('sets every key mapped to a field, but the id, the revision and what is unmapped', () => {
    const write = Write.update(EditPost, { id: 'id', expect: 'revision' })
    expect(write.sets.map(set => set.key)).toEqual(['title', 'due'])
    expect(Write.writes(write).map(field => field.key)).toEqual(['title', 'due'])
    expect(write.id.key).toBe('id')
    expect(write.expect?.key).toBe('revision')
    expect(write.expect?.field.key).toBe('revision')
  })

  it('sets the revision too when it is not what the write expects', () => {
    const write = Write.update(EditPost, { id: 'id' })
    expect(write.sets.map(set => set.key)).toEqual(['title', 'due', 'revision'])
  })

  it('is frozen, so a declared write cannot gain a field', () => {
    const write = Write.update(EditPost, { id: 'id' })
    expect(Object.isFrozen(write)).toBe(true)
    expect(Object.isFrozen(write.sets)).toBe(true)
  })

  it.each([
    [
      'an id that is not the row’s id',
      () => Write.update(EditPost, { id: 'title' }),
      'mapped to "title", not to "id"',
    ],
    [
      'an id the input does not have',
      // @ts-expect-error not a key of the input
      () => Write.update(EditPost, { id: 'missing' }),
      'not a key of the input',
    ],
    [
      'an expected revision that is the id',
      () => Write.update(EditPost, { id: 'id', expect: 'id' }),
      'expect cannot be the id',
    ],
    [
      'an expected revision on an unmapped key',
      () => Write.update(EditPost, { id: 'id', expect: 'note' }),
      'not mapped to a field',
    ],
    [
      'a many relation key',
      () =>
        Write.update(
          Entity.input(
            Blog.Post,
            Schema.Struct({ id: Schema.String, readerIds: Schema.Array(Schema.String) }),
            { readerIds: Relation.input(Blog.Post.relations.readers) },
          ),
          { id: 'id' },
        ),
      'is a many relation',
    ],
    [
      'a nested key',
      () =>
        Write.update(
          Entity.input(
            Blog.Post,
            Schema.Struct({ id: Schema.String, author: Schema.Struct({ name: Schema.String }) }),
            {
              author: Relation.nested(
                Blog.Post.relations.author,
                Entity.input(Blog.Author, Schema.Struct({ name: Schema.String })),
              ),
            },
          ),
          { id: 'id' },
        ),
      'writes a nested row',
    ],
    [
      'nothing to set',
      () =>
        Write.update(Entity.input(Blog.Post, Schema.Struct({ id: Schema.String })), { id: 'id' }),
      'sets no field',
    ],
  ])('refuses %s where it is written', (_, made, message) => {
    expect(made).toThrow(message)
  })
})

describe('Write.bind', () => {
  const write = Write.update(EditPost, { id: 'id', expect: 'revision' })
  const value = {
    id: 'p1',
    title: 'Compilers',
    due: new Date('2026-03-01T00:00:00.000Z'),
    revision: 4,
    note: 'why',
  }

  it('names the row and its new values as the store holds them', () => {
    expect(Write.bind(write, value)).toEqual({
      entity: 'Post',
      id: 'p1',
      values: { title: 'Compilers', due: '2026-03-01T00:00:00.000Z' },
      links: {},
    })
  })

  it('says the revision the row was read at, encoded, when the write expects one', () => {
    expect(Write.expected(write, value)).toEqual(Option.some({ field: 'revision', revision: 4 }))
    expect(Write.expected(Write.update(EditPost, { id: 'id' }), value)).toEqual(Option.none())
  })

  it('writes only the keys asked for, when asked for some', () => {
    expect(Write.bind(write, value, ['title', 'note']).values).toEqual({ title: 'Compilers' })
    expect(Write.bind(write, value, []).values).toEqual({})
  })
})

describe('A write that points a one relation', () => {
  const Reassign = Write.update(
    Entity.input(
      Blog.Post,
      Schema.Struct({
        id: Schema.String,
        authorId: Schema.String,
        editorId: Schema.NullOr(Schema.String),
      }),
      {
        authorId: Relation.input(Blog.Post.relations.author),
        editorId: Relation.input(Blog.Post.relations.editor),
      },
    ),
    { id: 'id' },
  )

  it('points the relation, and counts it among what it writes', () => {
    expect(Reassign.links.map(link => [link.key, link.relation.key])).toEqual([
      ['authorId', 'author'],
      ['editorId', 'editor'],
    ])
    expect(Write.writes(Reassign).map(member => member.key)).toEqual(['author', 'editor'])
  })

  it('binds it to the row it points at, or to none for nothing', () => {
    expect(Write.bind(Reassign, { id: 'p1', authorId: 'a1', editorId: null })).toEqual({
      entity: 'Post',
      id: 'p1',
      values: {},
      links: {
        author: Option.some({ entity: 'Author', id: 'a1' }),
        editor: Option.none(),
      },
    })
  })

  it('binds only the relations asked for, when asked for some', () => {
    expect(
      Object.keys(
        Write.bind(Reassign, { id: 'p1', authorId: 'a1', editorId: null }, ['editorId']).links,
      ),
    ).toEqual(['editor'])
  })
})
