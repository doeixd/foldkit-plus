/**
 * One Entity per identity (#332): what `Entity.relate`, `Entity.derived` and
 * `Entity.sets` add is the Entity's, so every descriptor of it reads it,
 * whichever step made the descriptor; metadata stays on the descriptor it was
 * annotated on.
 */
import { Schema } from 'effect'
import { Metadata } from 'foldkit-metadata'
import { describe, expect, it } from 'vitest'
import {
  Derived,
  Entity,
  Expr,
  Held,
  Query,
  Relation,
  Write,
  type AnyEntity,
} from '../src/index.js'

const Labels = Metadata.key<string>('versions/labels', {
  merge: labels => [...new Set(labels)],
  summarize: label => label,
})

/** Chirp's shape: likes point at a post and at whoever liked it. */
const social = () => {
  const UserFields = Entity.define('User', Schema.Struct({ id: Schema.String }))
  const PostFields = Entity.define(
    'Post',
    Schema.Struct({ id: Schema.String, body: Schema.String, createdAt: Schema.Number }),
  )
  const LikeFields = Entity.define('Like', Schema.Struct({ id: Schema.String }))
  const Chirp = Entity.relate(
    { User: UserFields, Post: PostFields, Like: LikeFields },
    { Like: { post: Relation.one(PostFields), user: Relation.one(UserFields) } },
  )
  return { UserFields, PostFields, LikeFields, Chirp }
}

const keys = (record: object) => Object.keys(record)

describe('one Entity per identity', () => {
  it('shows a member added after relate on the target a relation returns', () => {
    const { Chirp } = social()
    const LikedPost = Chirp.Post.pipe(
      Entity.derived({ likeCount: Derived.count(Chirp.Like.relations.post) }),
    )
    const target: AnyEntity = Chirp.Like.relations.post.target()
    expect(keys(target.derived)).toEqual(['likeCount'])
    expect(target.members.likeCount).toBe(LikedPost.derived.likeCount)
  })

  it('gives the descriptor declared before relate its relations, derived members and sets', () => {
    const { UserFields, PostFields, LikeFields, Chirp } = social()
    Chirp.Post.pipe(
      Entity.sets({ createdAt: Expr.now }, { on: 'create' }),
      Entity.derived({ likeCount: Derived.count(Chirp.Like.relations.post) }),
    )
    const like: AnyEntity = LikeFields
    const post: AnyEntity = PostFields
    expect(keys(like.relations)).toEqual(['post', 'user'])
    expect(like.relations.user!.target()).toBe(Chirp.User)
    expect(Entity.same(like.relations.user!.target(), UserFields)).toBe(true)
    expect(keys(post.derived)).toEqual(['likeCount'])
    expect(keys(post.sets)).toEqual(['createdAt'])
    expect(keys(post.members)).toEqual(['id', 'body', 'createdAt', 'likeCount'])
  })

  it('gives a query built before relate the relations its body reads', () => {
    const LikeFields = Entity.define('Like', Schema.Struct({ id: Schema.String }))
    const UserFields = Entity.define('User', Schema.Struct({ id: Schema.String }))
    const early = Query.from(LikeFields)
    const { Like } = Entity.relate(
      { Like: LikeFields, User: UserFields },
      { Like: { user: Relation.one(UserFields) } },
    )
    const query: { readonly entity: AnyEntity } = early
    expect(keys(query.entity.relations)).toEqual(['user'])
    // A body reading the link reads the id its ref key names.
    const mine = Query.from(LikeFields).pipe(
      Query.where(Expr.eq(Like.relations.user, Expr.viewer(UserFields))),
    )
    expect(Held.fromRefs(mine, { id: 'l1', user: 'User:ada' })).toEqual({ id: 'l1', user: 'ada' })
  })

  it('lets a write of the descriptor before the sets follow them', () => {
    const { PostFields, Chirp } = social()
    const Dated = Chirp.Post.pipe(Entity.sets({ createdAt: Expr.now }, { on: 'create' }))
    const BodyOnly = Schema.Struct({ id: Schema.String, body: Schema.String })
    for (const post of [PostFields, Chirp.Post, Dated]) {
      const write = Write.insert(Entity.input(post, BodyOnly), { id: 'id' })
      expect(keys(write.input.entity.sets)).toEqual(['createdAt'])
    }
  })

  it('refuses a key added through one descriptor when another adds it', () => {
    const { PostFields, Chirp } = social()
    Chirp.Post.pipe(Entity.derived({ score: Derived.make(Schema.Number) }))
    // `PostFields` is typed as declared, so only the runtime knows `score` is taken.
    expect(() => PostFields.pipe(Entity.derived({ score: Derived.make(Schema.String) }))).toThrow(
      'Entity "Post": cannot add derived member "score", it is already a derived member',
    )
    expect(() =>
      Entity.relate(
        { Post: PostFields, User: Chirp.User },
        { Post: { score: Relation.one(Chirp.User) } },
      ),
    ).toThrow('Entity "Post": cannot add relation "score", it is already a derived member')
  })

  it('takes the very spec added again as the member it added', () => {
    const { PostFields, Chirp } = social()
    const scored = Entity.derived({ score: Derived.make(Schema.Number) })
    const first = Chirp.Post.pipe(scored)
    const second = PostFields.pipe(scored)
    expect(second.derived.score).toBe(first.derived.score)
    expect(keys(second.derived)).toEqual(['score'])
    // The same derivation with another schema is another member.
    const reshaped = Entity.derived({
      score: { schema: Schema.String, derives: first.derived.score.derives },
    })
    expect(() => PostFields.pipe(reshaped)).toThrow('cannot add derived member "score"')
  })

  it('adds no relation of a relate it refuses', () => {
    const PostFields = Entity.define('Post', Schema.Struct({ id: Schema.String }))
    const UserFields = Entity.define('User', Schema.Struct({ id: Schema.String }))
    const Stranger = Entity.define('Stranger', Schema.Struct({ id: Schema.String }))
    expect(() =>
      Entity.relate(
        { Post: PostFields, User: UserFields },
        { Post: { author: Relation.one(UserFields) }, User: { friend: Relation.one(Stranger) } },
      ),
    ).toThrow('relation "friend" targets an Entity that is not being related')
    expect(keys(PostFields.relations)).toEqual([])
  })

  it('keeps metadata on the descriptor it was annotated on', () => {
    const { Chirp } = social()
    const Labelled = Chirp.Like.pipe(
      Entity.annotate(Labels.of('A like')),
      Entity.annotateMembers({ post: Labels.of('Liked post') }),
    )
    const before = Labelled.relations.post
    Chirp.Like.pipe(Entity.derived({ weight: Derived.make(Schema.Number) }))
    const counted = Chirp.Post.pipe(
      Entity.derived({ likeCount: Derived.count(Chirp.Like.relations.post) }),
    )
    expect(Labels.get(Labelled.metadata)).toEqual(['A like'])
    expect(Labels.get(Labelled.relations.post.metadata)).toEqual(['Liked post'])
    expect(Labels.get(Chirp.Like.metadata)).toEqual([])
    expect(Labels.get(Chirp.Like.relations.post.metadata)).toEqual([])
    // The annotated copy is made once, though the Entity gained a member since.
    expect(Labelled.relations.post).toBe(before)
    // Its type is the Post as related; the member is there all the same.
    const post: AnyEntity = Labelled.relations.post.target()
    expect(post.derived.likeCount).toBe(counted.derived.likeCount)
  })
})
