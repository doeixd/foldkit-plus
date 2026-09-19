import { Schema } from 'effect'
import { describe, expect, it } from 'vitest'
import { Entity, Relation, type AnyEntity } from '../src/index.js'
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
