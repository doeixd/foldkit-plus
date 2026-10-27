import { Schema } from 'effect'
import { describe, expect, it } from 'vitest'
import { Derivation, Derived, Entity, Relation } from '../src/index.js'

const Account = Entity.define('Account', Schema.Struct({ id: Schema.String }))
const PostFields = Entity.define('Post', Schema.Struct({ id: Schema.String }))
const LikeFields = Entity.define('Like', Schema.Struct({ id: Schema.String }))

const Social = Entity.relate(
  { Account, Post: PostFields, Like: LikeFields },
  {
    Post: {
      likes: Relation.many(LikeFields),
      replyTo: Relation.one(PostFields, { optional: true }),
    },
    Like: { post: Relation.one(PostFields), account: Relation.one(Account) },
  },
)

describe('Derived.count', () => {
  it('keeps the relation it counts, and is a non-negative integer', () => {
    const Post = Social.Post.pipe(
      Entity.derived({ likeCount: Derived.count(Social.Like.relations.post) }),
    )
    const derives = Post.derived.likeCount.derives
    expect(derives._tag).toBe('Count')
    expect(derives.relation).toBe(Social.Like.relations.post)
    const is = Schema.is(Post.derived.likeCount.schema)
    expect([0, 3].map(is)).toEqual([true, true])
    expect([-1, 1.5].map(is)).toEqual([false, false])
  })

  it('counts a relation from an Entity to itself', () => {
    const Post = Social.Post.pipe(
      Entity.derived({ replyCount: Derived.count(Social.Post.relations.replyTo) }),
    )
    expect(Post.derived.replyCount.derives.relation.key).toBe('replyTo')
  })

  it('says a member made by Derived.make is supplied', () => {
    const Post = Social.Post.pipe(Entity.derived({ score: Derived.make(Schema.Number) }))
    expect(Derivation.$is('Supplied')(Post.derived.score.derives)).toBe(true)
  })

  it('refuses a count of a relation pointing at another Entity', () => {
    const step = Entity.derived({ likeCount: Derived.count(Social.Like.relations.account) })
    // @ts-expect-error the relation points at Account, not Post
    expect(() => step(Social.Post)).toThrow(
      '"likeCount" counts "Like.account", which points at Account',
    )
  })

  it('refuses a count of a many relation', () => {
    // @ts-expect-error a many relation counts no rows pointing here
    const many = Derived.count(Social.Post.relations.likes)
    const step = Entity.derived({ likeCount: many })
    // @ts-expect-error refused above, the count's relation reads as pointing anywhere
    expect(() => Social.Post.pipe(step)).toThrow('"likeCount" counts "likes", a many relation')
  })
})
