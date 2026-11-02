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

  it('refuses an action it does not know where it is declared', () => {
    const unknown = 'setNull' as unknown as OnDelete
    expect(() => Relation.one(UserFields, { onDelete: unknown })).toThrow(/onDelete is 'cascade'/)
  })
})
