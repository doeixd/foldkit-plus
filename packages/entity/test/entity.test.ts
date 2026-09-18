import { Schema } from 'effect'
import { Metadata } from 'foldkit-metadata'
import { describe, expect, it } from 'vitest'
import { Derived, Entity, Relation, type AnyEntity } from '../src/index.js'

const Labels = Metadata.key<string>('labels', {
  merge: labels => [...new Set(labels)],
  summarize: label => label,
})

const Author = Entity.define('Author', Schema.Struct({ id: Schema.String, name: Schema.String }))
const Comment = Entity.define('Comment', Schema.Struct({ id: Schema.String }))
const PostFields = Entity.define(
  'Post',
  Schema.Struct({ id: Schema.String, title: Schema.String }),
).pipe(Entity.derived({ commentCount: Derived.make(Schema.Number) }))

// Post comes before Comment and points at it, so targets must resolve late.
const Blog = Entity.relate(
  { Author, Post: PostFields, Comment },
  {
    Post: {
      author: Relation.one(Author, { optional: true }),
      comments: Relation.many(Comment),
    },
    Comment: { post: Relation.one(PostFields) },
  },
)
const { Post } = Blog

const relateUntyped = Entity.relate as (entities: unknown, relations: unknown) => unknown

describe('Entity', () => {
  it('generates a Field per schema property and leaves the schema alone', () => {
    expect(Object.keys(Post.fields)).toEqual(['id', 'title'])
    expect(Post.fields.title).toMatchObject({ _tag: 'Field', key: 'title', owner: Post.identity })
    expect(Post.fields.title.schema).toBe(PostFields.schema.fields.title)
    expect(Post.schema).toBe(PostFields.schema)
    expect(Object.keys(Post.schema.fields)).toEqual(['id', 'title'])
  })

  it('binds relations and derived members to their owner and key', () => {
    expect(Post.relations.author).toMatchObject({
      _tag: 'Relation',
      key: 'author',
      owner: Post.identity,
      cardinality: 'one',
      optional: true,
    })
    expect(Post.relations.comments).toMatchObject({ cardinality: 'many', optional: false })
    expect(Post.derived.commentCount).toMatchObject({ _tag: 'Derived', key: 'commentCount' })
    expect(Post.derived.commentCount.schema).toBe(Schema.Number)
  })

  it('exposes every member under one namespace, tagged by kind', () => {
    const kinds = Object.fromEntries(
      Object.values(Post.members).map(member => [member.key, member._tag]),
    )
    expect(kinds).toEqual({
      id: 'Field',
      title: 'Field',
      author: 'Relation',
      comments: 'Relation',
      commentCount: 'Derived',
    })
  })

  it('keeps one identity across pipe steps and relate, and a new one per define', () => {
    expect(Post.identity).toBe(PostFields.identity)
    expect(Entity.same(Post, PostFields)).toBe(true)

    const Homonym = Entity.define('Post', Schema.Struct({ id: Schema.String }))
    expect(Entity.same(Homonym, Post)).toBe(false)
  })

  it('resolves a target to the related Entity, through a cycle', () => {
    expect(Post.relations.author.target()).toBe(Blog.Author)
    expect(Post.relations.comments.target()).toBe(Blog.Comment)
    // Not the bare definition the relation was declared against.
    expect(Blog.Comment.relations.post.target()).toBe(Post)
    expect(Object.keys(Blog.Author.relations)).toEqual([])
  })

  it.each([
    ['a relation over a field', { Post: { title: Relation.one(Author) } }, 'already a field'],
    [
      'a relation over a derived member',
      { Post: { commentCount: Relation.one(Author) } },
      'already a derived member',
    ],
    [
      'a target outside the related set',
      { Post: { comments: Relation.many(Comment) } },
      'relation "comments" targets an Entity that is not being related',
    ],
    [
      'a target that is not an Entity',
      { Post: { author: Relation.one(Schema.String as unknown as AnyEntity) } },
      'relation "author" targets an Entity that is not being related',
    ],
    [
      'an owner outside the related set',
      { Comment: { author: Relation.one(Author) } },
      'relations given for "Comment", which is not being related',
    ],
  ])('rejects %s', (_, relations, message) => {
    // The types reject most of these too; the runtime check covers untyped callers.
    expect(() => relateUntyped({ Author, Post: PostFields }, relations)).toThrow(message)
  })

  it('rejects one Entity under two keys, and a value that is not an Entity', () => {
    expect(() => relateUntyped({ Post: PostFields, Article: PostFields }, {})).toThrow(
      '"Post" and "Article" are the same Entity',
    )
    expect(() => relateUntyped({ Post: PostFields.schema }, {})).toThrow('"Post" is not an Entity')
  })

  it('rejects a derived member over an existing member', () => {
    const step = Entity.derived({ author: Derived.make(Schema.String) })
    expect(() => (step as (entity: AnyEntity) => AnyEntity)(Post)).toThrow('already a relation')
  })

  it('attaches metadata to the Entity and to members without touching the original', () => {
    const Cms = Post.pipe(
      Entity.annotate(Labels.of('Post')),
      Entity.annotateMembers({ title: Labels.of('Title'), author: Labels.of('Byline') }),
      Entity.annotateMembers({ title: Labels.of('Title', 'Heading') }),
    )

    expect(Labels.get(Cms.metadata)).toEqual(['Post'])
    expect(Labels.get(Cms.fields.title.metadata)).toEqual(['Title', 'Heading'])
    expect(Labels.get(Cms.relations.author.metadata)).toEqual(['Byline'])
    expect(Labels.get(Cms.members.title.metadata)).toEqual(['Title', 'Heading'])
    expect(Labels.get(Cms.fields.id.metadata)).toEqual([])
    expect(Entity.same(Cms, Post)).toBe(true)
    expect(Labels.get(Post.fields.title.metadata)).toEqual([])
  })

  it('rejects metadata for a key that is not a member', () => {
    const step = Entity.annotateMembers({ subtitle: Labels.of('x') } as never)
    expect(() => step(Post)).toThrow('cannot annotate "subtitle", it is not a member')
  })

  it('is frozen, and recognises only Entities', () => {
    expect(Object.isFrozen(Blog)).toBe(true)
    expect(Object.isFrozen(Post)).toBe(true)
    expect(Object.isFrozen(Post.members)).toBe(true)
    expect(Object.isFrozen(Post.relations.author)).toBe(true)
    expect(Entity.is(Post)).toBe(true)
    expect(Entity.is({ ...Post })).toBe(false)
    expect(Entity.is(Post.schema)).toBe(false)
  })
})
