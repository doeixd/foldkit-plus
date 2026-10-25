/**
 * A write as a value: `Write.update` over an operation's input, what it may
 * write, and the row and values one invocation writes, as the store holds them.
 */
import { Option, Schema, SchemaGetter } from 'effect'
import { describe, expect, it } from 'vitest'
import { Entity, Expr, Relation, Write, evaluate, type Predicate } from '../src/index.js'

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
      increments: {},
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
      increments: {},
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

describe('A write over keys that may be absent', () => {
  const Partial = Entity.input(
    Blog.Post,
    Schema.Struct({
      id: Schema.String,
      title: Schema.optional(Schema.String),
      revision: Schema.OptionFromNullOr(Schema.Number),
    }),
  )
  const write = Write.update(Partial, { id: 'id' })

  it('writes what an Option holds, and nothing for one that holds nothing or a key left out', () => {
    expect(Write.bind(write, { id: 'p1', revision: Option.some(3) }).values).toEqual({
      revision: 3,
    })
    expect(Write.bind(write, { id: 'p1', title: 'T', revision: Option.none() }).values).toEqual({
      title: 'T',
    })
  })

  it('refuses an id that may be absent: a declared write names its row', () => {
    const Either = Entity.input(
      Blog.Post,
      Schema.Struct({ id: Schema.OptionFromNullOr(Schema.String), title: Schema.String }),
    )
    expect(() => Write.update(Either, { id: 'id' })).toThrow(
      'id "id" may be absent, and a declared write names its row',
    )
    const Maybe = Entity.input(
      Blog.Post,
      Schema.Struct({ id: Schema.optional(Schema.String), title: Schema.String }),
    )
    expect(() => Write.insert(Maybe, { id: 'id' })).toThrow('may be absent')
  })
})

describe('Write.insert and Write.delete', () => {
  it('inserts every key mapped to a member, under the id the client chose', () => {
    const insert = Write.insert(EditPost, { id: 'id' })
    expect(insert._tag).toBe('Insert')
    expect(insert.sets.map(set => set.key)).toEqual(['title', 'due', 'revision'])
  })

  it('deletes by id, with a revision it may expect, and sets nothing', () => {
    const Remove = Entity.input(
      Blog.Post,
      Schema.Struct({ id: Schema.String, revision: Schema.Number }),
    )
    const remove = Write.delete(Remove, { id: 'id', expect: 'revision' })
    expect(remove._tag).toBe('Delete')
    expect(remove.sets).toEqual([])
    expect(remove.expect?.key).toBe('revision')
  })

  it('refuses a delete with a key mapped to a member, which it would not write', () => {
    expect(() => Write.delete(EditPost, { id: 'id' })).toThrow(
      'a delete sets nothing, but "title" is mapped',
    )
  })

  it('refuses an insert that sets nothing', () => {
    expect(() =>
      Write.insert(Entity.input(Blog.Post, Schema.Struct({ id: Schema.String })), { id: 'id' }),
    ).toThrow('sets no field')
  })
})

describe('A write with a precondition', () => {
  const Retitle = Entity.input(
    Post,
    Schema.Struct({ id: Schema.String, title: Schema.String, from: Schema.String }),
    { from: Entity.unmapped },
  )

  it('holds it as a query over its Entity, reading the input by its keys', () => {
    const write = Write.update(Retitle, {
      id: 'id',
      when: ({ input }) => Expr.eq(Post.fields.title, input.from),
    })
    const body = Option.getOrThrow(write.when)
    expect(body.entity).toBe(Post)
    expect(evaluate(body, { from: 'Draft' }, [{ id: 'p1', title: 'Draft' }])).toHaveLength(1)
    expect(evaluate(body, { from: 'Draft' }, [{ id: 'p1', title: 'Final' }])).toHaveLength(0)
    expect(Write.update(Retitle, { id: 'id' }).when).toEqual(Option.none())
  })

  it('refuses one over another Entity, though its type does not say whose it is', () => {
    const elsewhere: Predicate = Expr.eq(Author.fields.name, 'Ada')
    expect(() =>
      Write.delete(Entity.input(Post, Schema.Struct({ id: Schema.String })), {
        id: 'id',
        when: () => elsewhere,
      }),
    ).toThrow('Author')
  })
})

describe('A write that increments a field', () => {
  const Item = Entity.define(
    'Item',
    Schema.Struct({
      id: Schema.String,
      stock: Schema.Number,
      sold: Schema.Number,
      // A number in code, text in the store: the store cannot add to it.
      price: Schema.NumberFromString,
      weight: Schema.NullOr(Schema.Number),
      name: Schema.String,
      revision: Schema.Number,
    }),
  )
  const Restock = Entity.input(
    Item,
    Schema.Struct({
      id: Schema.String,
      revision: Schema.Number,
      quantity: Schema.Number,
      name: Schema.String,
      label: Schema.String,
    }),
    { quantity: Entity.unmapped, label: Entity.unmapped },
  )
  const restock = Write.update(Restock, {
    id: 'id',
    expect: 'revision',
    increment: { stock: 'quantity' },
  })

  it('binds each amount apart from the values, encoded, for the server to add', () => {
    const value = { id: 'i1', revision: 3, quantity: -2, name: 'Bolt', label: 'x' }
    expect(Write.bind(restock, value)).toMatchObject({
      values: { name: 'Bolt' },
      increments: { stock: -2 },
    })
    // `keys` names input keys: the amount's.
    expect(Write.bind(restock, value, ['name']).increments).toEqual({})
    expect(Write.bind(restock, value, ['quantity']).increments).toEqual({ stock: -2 })
  })

  it('writes the field it increments, and reads it with the revision and what `when` reads', () => {
    const guarded = Write.update(Restock, {
      id: 'id',
      expect: 'revision',
      increment: { stock: 'quantity' },
      when: () => Expr.gte(Item.fields.sold, 0),
    })
    expect(Write.writes(guarded).map(field => field.key)).toEqual(['name', 'stock'])
    expect(
      Write.reads(guarded)
        .map(field => field.key)
        .sort(),
    ).toEqual(['revision', 'sold', 'stock'])
  })

  it.each([
    [
      'a field it does not have',
      { id: 'id', expect: 'revision', increment: { volume: 'quantity' } },
      'not a field',
    ],
    [
      'the id',
      { id: 'id', expect: 'revision', increment: { id: 'quantity' } },
      'increments the id',
    ],
    [
      'the revision it expects',
      { id: 'id', expect: 'revision', increment: { revision: 'quantity' } },
      'the revision it expects',
    ],
    [
      'a field stored as text',
      { id: 'id', expect: 'revision', increment: { price: 'quantity' } },
      'not stored as a number',
    ],
    [
      'a nullable field',
      { id: 'id', expect: 'revision', increment: { weight: 'quantity' } },
      'not stored as a number',
    ],
    [
      'an amount mapped to a member',
      { id: 'id', expect: 'revision', increment: { stock: 'name' } },
      'must be unmapped',
    ],
    [
      'an amount that is not a number',
      { id: 'id', expect: 'revision', increment: { stock: 'label' } },
      'not a number',
    ],
  ])('refuses %s', (_, options, message) => {
    expect(() => Write.update(Restock, options as never)).toThrow(message)
  })

  it('may expect no revision: whether a retry is safe is for the server, which knows its writer', () => {
    expect(
      Write.update(Restock, { id: 'id', increment: { stock: 'quantity' } }).increments,
    ).toHaveLength(1)
  })

  it('refuses a field a key also sets', () => {
    const SetsStock = Entity.input(
      Item,
      Schema.Struct({
        id: Schema.String,
        revision: Schema.Number,
        stock: Schema.Number,
        by: Schema.Number,
      }),
      { by: Entity.unmapped },
    )
    expect(() =>
      Write.update(SetsStock, { id: 'id', expect: 'revision', increment: { stock: 'by' } }),
    ).toThrow('which a key also sets')
  })

  it('adds nothing for an optional amount the input leaves out', () => {
    const Maybe = Entity.input(
      Item,
      Schema.Struct({
        id: Schema.String,
        revision: Schema.Number,
        by: Schema.optionalKey(Schema.Number),
      }),
      { by: Entity.unmapped },
    )
    const bump = Write.update(Maybe, { id: 'id', expect: 'revision', increment: { stock: 'by' } })
    expect(Write.bind(bump, { id: 'i1', revision: 1 }).increments).toEqual({})
    expect(Write.bind(bump, { id: 'i1', revision: 1, by: 2 }).increments).toEqual({ stock: 2 })
  })

  it('counts as something to set', () => {
    const Bump = Entity.input(
      Item,
      Schema.Struct({ id: Schema.String, revision: Schema.Number, by: Schema.Number }),
      { by: Entity.unmapped },
    )
    expect(
      Write.update(Bump, { id: 'id', expect: 'revision', increment: { stock: 'by' } }).increments,
    ).toHaveLength(1)
  })
})
