import { Schema } from 'effect'
import { Metadata } from 'foldkit-metadata'
import { describe, expect, it } from 'vitest'
import { Derived, Entity, Relation, type AnyEntity } from '../src/index.js'

const Labels = Metadata.key<string>('labels', {
  merge: labels => [...new Set(labels)],
  summarize: label => label,
})

const Author = Entity.define('Author', Schema.Struct({ id: Schema.String, name: Schema.String }))
const PostFields = Entity.define('Post', Schema.Struct({ id: Schema.String, title: Schema.String }))
const Comment = Entity.define('Comment', Schema.Struct({ id: Schema.String })).pipe(
  Entity.relations({ post: Relation.one(() => PostFields) }),
)
const Post = PostFields.pipe(
  Entity.relations({
    author: Relation.one(() => Author, { optional: true }),
    comments: Relation.many(() => Comment),
  }),
  Entity.derived({ commentCount: Derived.make(Schema.Number) }),
)

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

  it('keeps one identity across pipe steps and a new one per define', () => {
    expect(Post.identity).toBe(PostFields.identity)
    expect(Entity.same(Post, PostFields)).toBe(true)
    // Comment.post was declared against the bare definition; it is still Post.
    expect(Entity.same(Post.relations.comments.target().relations.post.target(), Post)).toBe(true)

    const Homonym = Entity.define('Post', Schema.Struct({ id: Schema.String }))
    expect(Entity.same(Homonym, Post)).toBe(false)
  })

  it('resolves a target only when asked', () => {
    let resolved = 0
    const Lazy = Author.pipe(
      Entity.relations({
        posts: Relation.many(() => {
          resolved++
          return Post
        }),
      }),
    )
    expect(resolved).toBe(0)
    expect(Lazy.relations.posts.target()).toBe(Post)
    expect(resolved).toBe(1)
  })

  it('rejects a target that is not an Entity', () => {
    const Broken = Author.pipe(
      Entity.relations({ posts: Relation.many(() => Schema.String as unknown as AnyEntity) }),
    )
    expect(() => Broken.relations.posts.target()).toThrow(
      'Entity "Author": relation "posts" does not resolve to an Entity',
    )
  })

  it.each([
    ['a relation over a field', Entity.relations({ title: Relation.one(() => Author) }), 'field'],
    [
      'a relation declared twice',
      Entity.relations({ author: Relation.one(() => Author) }),
      'relation',
    ],
    [
      'a derived member over a relation',
      Entity.derived({ author: Derived.make(Schema.String) }),
      'relation',
    ],
    [
      'a derived member over a field',
      Entity.derived({ title: Derived.make(Schema.String) }),
      'field',
    ],
    [
      'a relation over a derived member',
      Entity.relations({ commentCount: Relation.one(() => Author) }),
      'derived',
    ],
  ])('rejects %s', (_, step, taken) => {
    // The types reject these too; the runtime check covers untyped callers.
    expect(() => (step as (entity: AnyEntity) => AnyEntity)(Post)).toThrow(
      `it is already a ${taken}`,
    )
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
    expect(Object.isFrozen(Post)).toBe(true)
    expect(Object.isFrozen(Post.members)).toBe(true)
    expect(Object.isFrozen(Post.fields.title)).toBe(true)
    expect(Entity.is(Post)).toBe(true)
    expect(Entity.is({ ...Post })).toBe(false)
    expect(Entity.is(Post.schema)).toBe(false)
  })
})
