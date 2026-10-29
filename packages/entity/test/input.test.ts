import { Schema } from 'effect'
import { describe, expect, it } from 'vitest'
import { Collation, Entity, Expr, Query, Relation, evaluate, type AnyEntity } from '../src/index.js'
import { Blog } from './blogFixture.js'

const { Post, Author } = Blog
const inputUntyped = Entity.input as (
  entity: AnyEntity,
  schema: unknown,
  mapping?: unknown,
) => unknown

describe('Entity.input', () => {
  it('maps a key that names a field to that field, with nothing to write', () => {
    const schema = Schema.Struct({ id: Schema.String, title: Schema.optional(Schema.String) })
    const rename = Entity.input(Post, schema)

    expect(rename.members).toEqual({ id: Post.fields.id, title: Post.fields.title })
    expect(rename.schema).toBe(schema)
    expect(rename.entity).toBe(Post)
  })

  it('maps the other keys to what the mapping says: a relation, a renamed field, nothing', () => {
    const publish = Entity.input(
      Post,
      Schema.Struct({
        id: Schema.String,
        live: Schema.Boolean,
        authorId: Schema.String,
        commentIds: Schema.Array(Schema.String),
        reason: Schema.String,
      }),
      {
        live: Post.fields.published,
        authorId: Relation.input(Post.relations.author),
        commentIds: Relation.input(Post.relations.comments),
        reason: Entity.unmapped,
      },
    )

    expect(publish.members.live).toBe(Post.fields.published)
    expect(publish.members.authorId).toEqual({
      _tag: 'RelationInput',
      relation: Post.relations.author,
    })
    // What a form needs for a picker: the target to choose from, and how many.
    expect(publish.members.authorId.relation.target()).toBe(Author)
    expect(publish.members.commentIds.relation.cardinality).toBe('many')
    expect(publish.members.reason).toBe(Entity.unmapped)
    expect(Object.keys(publish.members)).toEqual(['id', 'live', 'authorId', 'commentIds', 'reason'])
  })

  it('lets a mapping override a key that also names a field', () => {
    // `title` holds the author here, however unwise the name.
    const odd = Entity.input(Post, Schema.Struct({ title: Schema.String }), {
      title: Relation.input(Post.relations.author),
    })
    expect(odd.members.title._tag).toBe('RelationInput')
  })

  it('is frozen', () => {
    const rename = Entity.input(Post, Schema.Struct({ id: Schema.String }))
    expect(Object.isFrozen(rename)).toBe(true)
    expect(Object.isFrozen(rename.members)).toBe(true)
  })

  const input = Schema.Struct({ id: Schema.String, authorId: Schema.String })

  it.each([
    ['a key that names no field and has no mapping', {}, 'input key "authorId" names no field'],
    [
      'a mapping for a key the input does not have',
      { authorId: Entity.unmapped, slug: Entity.unmapped },
      '"slug" is mapped but is not a key of the input',
    ],
    [
      'a member of another Entity',
      { authorId: Author.fields.name },
      'input key "authorId" is mapped to a member of "Author"',
    ],
    [
      'a relation of another Entity',
      { authorId: Relation.input(Author.relations.posts) },
      'input key "authorId" is mapped to a member of "Author"',
    ],
    [
      'a derived member',
      { authorId: Post.derived.commentCount },
      'input key "authorId" maps to a Field, Relation.input(relation), Relation.nested(relation, input), or Entity.unmapped',
    ],
    [
      'a bare relation',
      { authorId: Post.relations.author },
      'input key "authorId" maps to a Field, Relation.input(relation), Relation.nested(relation, input), or Entity.unmapped',
    ],
  ])('rejects %s', (_, mapping, message) => {
    expect(() => inputUntyped(Post, input, mapping)).toThrow(message)
  })

  describe('what an input needs loaded, and what a loaded value fills in', () => {
    const edit = Entity.input(
      Post,
      Schema.Struct({
        id: Schema.String,
        live: Schema.Boolean,
        authorId: Schema.String,
        commentIds: Schema.Array(Schema.String),
        reason: Schema.String,
      }),
      {
        live: Post.fields.published,
        authorId: Relation.input(Post.relations.author),
        commentIds: Relation.input(Post.relations.comments),
        reason: Entity.unmapped,
      },
    )

    it('selects every member the input writes, by the member’s key, relations as refs', () => {
      const selection = Entity.selectFor(edit)

      expect(selection.entity).toBe(Post)
      expect(selection.members).toEqual({ id: true, published: true, author: true, comments: true })
      expect(
        Schema.is(selection.schema)({
          id: 'p1',
          published: true,
          author: { entity: 'Author', id: 'a1' },
          comments: [{ entity: 'Comment', id: 'c1' }],
        }),
      ).toBe(true)
    })

    it('turns a loaded value into input values: fields as they are, refs as ids', () => {
      expect(
        Entity.valuesFor(edit, {
          id: 'p1',
          published: true,
          author: { entity: 'Author', id: 'a1' },
          comments: [
            { entity: 'Comment', id: 'c1' },
            { entity: 'Comment', id: 'c2' },
          ],
        }),
      ).toEqual({ id: 'p1', live: true, authorId: 'a1', commentIds: ['c1', 'c2'] })
    })

    it('keeps a null relation null, and leaves out a key whose member was not loaded', () => {
      expect(Entity.valuesFor(edit, { author: null })).toEqual({ authorId: null })
      expect(Entity.valuesFor(edit, {})).toEqual({})
    })

    it('reads a nested Selection’s value too, taking the id of whatever it holds', () => {
      expect(Entity.valuesFor(edit, { author: { id: 'a1', name: 'Ada' } })).toEqual({
        authorId: 'a1',
      })

      // Read without its id, a relation fills nothing, not an object where an id belongs.
      expect(Entity.valuesFor(edit, { author: { name: 'Ada' } })).toEqual({})
      expect(Entity.valuesFor(edit, { comments: [{ id: 'c1' }, { body: 'x' }] })).toEqual({})
    })
  })
})

describe('Relation.nested', () => {
  const NewAuthor = Entity.input(Author, Schema.Struct({ name: Schema.String }))
  const NewComment = Entity.input(Blog.Comment, Schema.Struct({ body: Schema.String }))
  const CreatePost = Entity.input(
    Post,
    Schema.Struct({
      title: Schema.String,
      author: NewAuthor.schema,
      editor: Schema.NullOr(NewAuthor.schema),
      comments: Schema.Array(NewComment.schema),
    }),
    {
      author: Relation.nested(Post.relations.author, NewAuthor),
      editor: Relation.nested(Post.relations.editor, NewAuthor),
      comments: Relation.nested(Post.relations.comments, NewComment),
    },
  )

  it('reads a key as the target itself, written through an input of its own', () => {
    expect(CreatePost.members.author._tag).toBe('NestedInput')
    expect(CreatePost.members.author.relation).toBe(Post.relations.author)
    expect(CreatePost.members.comments.input).toBe(NewComment)
  })

  it('loads what the nested input writes of the target', () => {
    const selection = Entity.selectFor(CreatePost)
    expect(Object.keys(selection.members)).toEqual(['title', 'author', 'editor', 'comments'])
    expect(Object.keys(selection.members.author.members)).toEqual(['name'])
    expect(
      Schema.is(selection.schema)({
        title: 'Hello',
        author: { name: 'Ada' },
        editor: null,
        comments: [{ body: 'First' }],
      }),
    ).toBe(true)
  })

  it('turns a loaded value back into nested input values, one, none, and many', () => {
    expect(
      Entity.valuesFor(CreatePost, {
        title: 'Hello',
        author: { name: 'Ada', id: 'a1' },
        editor: null,
        comments: [{ body: 'First' }, { body: 'Second' }],
      }),
    ).toEqual({
      title: 'Hello',
      author: { name: 'Ada' },
      editor: null,
      comments: [{ body: 'First' }, { body: 'Second' }],
    })
  })

  it('refuses a nested input of another Entity than the relation is of', () => {
    expect(() =>
      inputUntyped(Post, Schema.Struct({ author: NewComment.schema }), {
        author: Relation.nested(Post.relations.author, NewComment),
      }),
    ).toThrow(/"author" nests an input of "Comment", but "author" is of "Author"/)
  })
})

describe('a member named by its key', () => {
  it('maps a key to the Field, or to the ids of the relation, that the name says', () => {
    const edit = Entity.input(
      Post,
      Schema.Struct({ headline: Schema.String, authorId: Schema.String }),
      { headline: 'title', authorId: 'author' },
    )
    expect(edit.members.headline).toBe(Post.fields.title)
    expect(edit.members.authorId).toEqual(Relation.input(Post.relations.author))
    // The same reading as the long form, so what follows from it is the same.
    expect(Object.keys(Entity.selectFor(edit).members)).toEqual(['title', 'author'])
  })

  it('refuses a name that is no field or relation', () => {
    expect(() =>
      inputUntyped(Post, Schema.Struct({ count: Schema.Number }), { count: 'commentCount' }),
    ).toThrow('input key "count" is mapped to "commentCount", which names no field or relation')
  })
})

describe('Entity.fields', () => {
  it('gives the schemas of the fields named, to spread into an input', () => {
    const picked = Entity.fields(Post, 'id', 'title')
    expect(picked).toEqual({ id: Post.fields.id.schema, title: Post.fields.title.schema })
    const rename = Entity.input(Post, Schema.Struct({ ...picked, note: Schema.String }), {
      note: Entity.unmapped,
    })
    expect(rename.members.title).toBe(Post.fields.title)
  })

  it('refuses a key that is not a field', () => {
    expect(() =>
      (Entity.fields as (entity: AnyEntity, key: string) => unknown)(Post, 'author'),
    ).toThrow('"author" is not a field')
  })
})

// Names `Object.prototype` holds: a lookup that is not of own keys reads them (#311).
describe('a key named as a prototype member', () => {
  const inherited = ['constructor', 'toString', 'hasOwnProperty', '__proto__'] as const

  it.each(inherited)('maps an input key %s to the field it names', key => {
    const schema = Schema.Struct({ [key]: Schema.String })
    const entity = Entity.define('Odd', schema)
    const input = inputUntyped(entity, schema) as { members: Record<string, unknown> }
    expect(Object.hasOwn(input.members, key)).toBe(true)
    expect(input.members[key]).toBe((entity.fields as Record<string, unknown>)[key])
  })

  it.each(inherited.filter(key => key !== '__proto__'))(
    'refuses an input key %s that names no field and has no mapping',
    key => {
      expect(() => inputUntyped(Post, Schema.Struct({ [key]: Schema.String }))).toThrow(
        `input key "${key}" names no field`,
      )
    },
  )

  it.each(inherited.filter(key => key !== '__proto__'))(
    'refuses a mapping of %s, which is no key of the input',
    key => {
      expect(() =>
        inputUntyped(Post, Schema.Struct({ id: Schema.String }), { [key]: Entity.unmapped }),
      ).toThrow(`"${key}" is mapped but is not a key of the input`)
    },
  )

  it.each(inherited.filter(key => key !== '__proto__'))(
    'refuses %s as a name of a member, or as a field to spread',
    key => {
      expect(() => inputUntyped(Post, Schema.Struct({ x: Schema.String }), { x: key })).toThrow(
        `is mapped to "${key}", which names no field or relation`,
      )
      expect(() =>
        (Entity.fields as (entity: AnyEntity, key: string) => unknown)(Post, key),
      ).toThrow(`"${key}" is not a field`)
    },
  )
})

describe('a member or field named as a prototype member, elsewhere', () => {
  it('refuses to select constructor from an Entity that has no such member', () => {
    expect(() =>
      (Entity.select as (entity: AnyEntity, spec: unknown) => unknown)(Post, { constructor: true }),
    ).toThrow('cannot select "constructor", it is not a member')
  })

  it('leaves a field named constructor alone when annotating another member', () => {
    const Odd = Entity.define(
      'Odd',
      Schema.Struct({ id: Schema.String, constructor: Schema.String }),
    )
    const Binary = Odd.pipe(Entity.annotateMembers({ constructor: Collation.of(Collation.binary) }))
    // TypeScript checks the literal's inherited `constructor`, a Function, against the optional key.
    // @ts-expect-error
    const annotated = Binary.pipe(Entity.annotateMembers({ id: Collation.of(Collation.binary) }))
    expect(annotated.fields.constructor.metadata).toBe(Binary.fields.constructor.metadata)
  })

  it('reads a field named constructor that a row lacks as null', () => {
    const Odd = Entity.define(
      'Odd',
      Schema.Struct({ id: Schema.String, constructor: Schema.NullOr(Schema.String) }),
    )
    const unset = Query.from(Odd).pipe(Query.where(Expr.isNull(Odd.fields.constructor)))
    expect(evaluate(unset, {}, [{ id: 'a' }, { id: 'b', constructor: 'x' }])).toEqual([{ id: 'a' }])
  })
})
