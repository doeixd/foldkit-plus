import { Option, Schema } from 'effect'
import { describe, expect, it } from 'vitest'
import { Derivation, Derived, Entity, Relation } from '../src/index.js'

const Account = Entity.define('Account', Schema.Struct({ id: Schema.String }))

/** A domain of its own: a member one test adds is a member of its Entity for every later reader. */
const social = () => {
  const PostFields = Entity.define('Post', Schema.Struct({ id: Schema.String }))
  const LikeFields = Entity.define('Like', Schema.Struct({ id: Schema.String }))
  return Entity.relate(
    { Account, Post: PostFields, Like: LikeFields },
    {
      Post: {
        likes: Relation.many(LikeFields),
        replyTo: Relation.one(PostFields, { optional: true }),
      },
      Like: { post: Relation.one(PostFields), account: Relation.one(Account) },
    },
  )
}

const Social = social()

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
    const Social = social()
    const Post = Social.Post.pipe(
      Entity.derived({ replyCount: Derived.count(Social.Post.relations.replyTo) }),
    )
    expect(Post.derived.replyCount.derives.relation.key).toBe('replyTo')
  })

  it('says a member made by Derived.make is supplied', () => {
    const Social = social()
    const Post = Social.Post.pipe(Entity.derived({ score: Derived.make(Schema.Number) }))
    expect(Derivation.$is('Supplied')(Post.derived.score.derives)).toBe(true)
  })

  it('refuses a count of a relation pointing at another Entity', () => {
    const Social = social()
    const step = Entity.derived({ likeCount: Derived.count(Social.Like.relations.account) })
    // @ts-expect-error the relation points at Account, not Post
    expect(() => step(Social.Post)).toThrow(
      '"likeCount" counts "Like.account", which points at Account',
    )
  })

  it('refuses a count of a many relation', () => {
    const Social = social()
    // @ts-expect-error a many relation counts no rows pointing here
    const many = Derived.count(Social.Post.relations.likes)
    const step = Entity.derived({ likeCount: many })
    // @ts-expect-error refused above, the count's relation reads as pointing anywhere
    expect(() => Social.Post.pipe(step)).toThrow('"likeCount" counts "likes", a many relation')
  })
})

describe('Derived.exists', () => {
  const liked = Derived.exists(Social.Like.relations.post, {
    viewer: Social.Like.relations.account,
  })

  it('keeps the relation it reads and its viewer, and is a row id or none', () => {
    const Post = Social.Post.pipe(Entity.derived({ liked }))
    const derives = Post.derived.liked.derives
    expect(derives._tag).toBe('Exists')
    expect(derives.relation).toBe(Social.Like.relations.post)
    expect(derives.viewer).toBe(Social.Like.relations.account)
    const decode = Schema.decodeUnknownSync(Post.derived.liked.schema)
    expect(decode('l1')).toEqual(Option.some('l1'))
    expect(decode(null)).toEqual(Option.none())
  })

  it('refuses an exists over a relation pointing at another Entity', () => {
    const step = Entity.derived({ liked })
    // @ts-expect-error the relation points at Post, not Account
    expect(() => step(Account)).toThrow('"liked" reads "Like.post", which points at Post')
  })

  it("refuses a viewer that is another Entity's relation", () => {
    const Social = social()
    const exists = Derived.exists(Social.Like.relations.post, {
      // @ts-expect-error the viewer must be a relation of Like, as the read relation is
      viewer: Social.Post.relations.replyTo,
    })
    expect(() => Social.Post.pipe(Entity.derived({ liked: exists }))).toThrow(
      `"liked"'s viewer "Post.replyTo" must be another one relation of Like`,
    )
  })

  it('refuses a viewer that is the read relation itself', () => {
    const Social = social()
    const exists = Derived.exists(Social.Like.relations.post, {
      viewer: Social.Like.relations.post,
    })
    expect(() => Social.Post.pipe(Entity.derived({ liked: exists }))).toThrow(
      `"liked"'s viewer "Like.post" must be another one relation of Like`,
    )
  })
})
