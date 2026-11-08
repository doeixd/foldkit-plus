/**
 * A cascade declared on the link the child holds (#343): `Relation.one(Post,
 * { onDelete: 'cascade' })`, and `Entity.cascading` reading, from the row
 * deleted, every relation that takes rows with it.
 */
import { Option, Schema } from 'effect'
import { describe, expect, it } from 'vitest'
import { Entity, Relation, type OnDelete } from '../src/index.js'

const UserFields = Entity.define('User', Schema.Struct({ id: Schema.String }))
const PostFields = Entity.define('Post', Schema.Struct({ id: Schema.String }))
const LikeFields = Entity.define('Like', Schema.Struct({ id: Schema.String }))
const Feed = Entity.relate(
  { User: UserFields, Post: PostFields, Like: LikeFields },
  {
    User: { posts: Relation.many(PostFields) },
    Post: {
      author: Relation.one(UserFields),
      replyTo: Relation.one(PostFields, { optional: true, onDelete: 'cascade' }),
    },
    Like: {
      post: Relation.one(PostFields, { onDelete: 'cascade' }),
      user: Relation.one(UserFields),
    },
  },
)

describe('A cascade', () => {
  it('is declared on a one relation, and on nothing else', () => {
    expect(Feed.Like.relations.post.onDelete).toEqual(Option.some('cascade'))
    expect(Feed.Post.relations.replyTo.onDelete).toEqual(Option.some('cascade'))
    expect(Feed.Post.relations.replyTo.optional).toBe(true)
    expect(Feed.Like.relations.user.onDelete).toEqual(Option.none())
    expect(Feed.User.relations.posts.onDelete).toEqual(Option.none())
  })

  it('is read from the Entity deleted: each relation pointing at it that takes its rows', () => {
    const into = Entity.cascading(Feed.Post).map(({ relation, owner }) => [
      owner.name,
      relation.key,
    ])
    expect(into).toEqual([
      ['Post', 'replyTo'],
      ['Like', 'post'],
    ])
    // Read through any descriptor of the Entity, the one declared before `relate` included.
    expect(Entity.cascading(PostFields)).toEqual(Entity.cascading(Feed.Post))
    expect(Entity.cascading(Feed.User)).toEqual([])
    expect(Entity.cascading(Feed.Like)).toEqual([])
  })

  it('names its owner as related, so what the owner points at can be followed', () => {
    const [, like] = Entity.cascading(Feed.Post)
    expect(Entity.same(like!.owner, Feed.Like)).toBe(true)
    expect(Object.keys(like!.owner.relations)).toEqual(['post', 'user'])
  })

  it("is judged by each row's own Delete rule unless the relation says the parent's (#348)", () => {
    expect(Feed.Like.relations.post.authorizedBy).toEqual(Option.some('child'))
    const Topic = Entity.define('Post', Schema.Struct({ id: Schema.String }))
    const Thread = Entity.relate(
      { Post: Topic, Like: Entity.define('Like', Schema.Struct({ id: Schema.String })) },
      { Like: { post: Relation.one(Topic, { onDelete: 'cascade', authorizedBy: 'parent' }) } },
    )
    expect(Thread.Like.relations.post.authorizedBy).toEqual(Option.some('parent'))
    expect(Feed.Like.relations.user.authorizedBy).toEqual(Option.none())
    expect(Feed.User.relations.posts.authorizedBy).toEqual(Option.none())
  })

  it('refuses authorizedBy without a cascade for it to authorize, or one it does not know', () => {
    const loose = { authorizedBy: 'parent' } as unknown as { onDelete: 'cascade' }
    expect(() => Relation.one(UserFields, loose)).toThrow(/needs onDelete/)
    const unknown = { onDelete: 'cascade', authorizedBy: 'anyone' } as unknown as {
      onDelete: 'cascade'
    }
    expect(() => Relation.one(UserFields, unknown)).toThrow(/'child' or 'parent'/)
  })

  it('refuses an action it does not know where it is declared', () => {
    const unknown = 'setNull' as unknown as OnDelete
    expect(() => Relation.one(UserFields, { onDelete: unknown })).toThrow(/onDelete is 'cascade'/)
  })
})

describe('A restriction (#467)', () => {
  const Tag = Entity.define('Tag', Schema.Struct({ id: Schema.String }))
  const Tagging = Entity.define('Tagging', Schema.Struct({ id: Schema.String }))
  const Tags = Entity.relate(
    { Tag, Tagging },
    { Tagging: { tag: Relation.one(Tag, { onDelete: 'restrict' }) } },
  )

  it('is read from the Entity deleted, and is no cascade', () => {
    expect(Tags.Tagging.relations.tag.onDelete).toEqual(Option.some('restrict'))
    expect(Tags.Tagging.relations.tag.authorizedBy).toEqual(Option.none())
    expect(
      Entity.restricting(Tag).map(({ relation, owner }) => [owner.name, relation.key]),
    ).toEqual([['Tagging', 'tag']])
    expect(Entity.cascading(Tag)).toEqual([])
    expect(Entity.restricting(Feed.Post)).toEqual([])
  })

  it('refuses authorizedBy, which only says who lets a cascade take a row', () => {
    expect(() =>
      // @ts-expect-error the type refuses it too
      Relation.one(UserFields, { onDelete: 'restrict', authorizedBy: 'parent' }),
    ).toThrow(/needs onDelete: 'cascade'/)
  })
})
