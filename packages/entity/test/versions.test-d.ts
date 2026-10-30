/**
 * One Entity per identity (#332), as the types see it: a descriptor's type
 * shows the steps it came through, while its runtime value reads every
 * member of the Entity (`versions.test.ts`).
 */
import { Schema } from 'effect'
import { expectTypeOf } from 'vitest'
import { Derived, Entity, Relation, type AnyEntity } from '../src/index.js'

const PostFields = Entity.define('Post', Schema.Struct({ id: Schema.String }))
const LikeFields = Entity.define('Like', Schema.Struct({ id: Schema.String }))
const Chirp = Entity.relate(
  { Post: PostFields, Like: LikeFields },
  { Like: { post: Relation.one(PostFields) } },
)
const LikedPost = Chirp.Post.pipe(
  Entity.derived({ likeCount: Derived.count(Chirp.Like.relations.post) }),
)

expectTypeOf<keyof typeof LikedPost.derived>().toEqualTypeOf<'likeCount'>()
expectTypeOf<keyof typeof Chirp.Like.relations>().toEqualTypeOf<'post'>()

// The declared descriptor's type has no relations: read them from the one `relate` returned.
// @ts-expect-error `LikeFields` is typed as declared
void LikeFields.relations.post

// A relation's target is typed as related; a member added later is read as any Entity's.
// @ts-expect-error the related Post's type has no likeCount
void Chirp.Like.relations.post.target().derived.likeCount
const target: AnyEntity = Chirp.Like.relations.post.target()
expectTypeOf(target.derived).toEqualTypeOf<AnyEntity['derived']>()

// Adding a member a descriptor's type already shows is refused where it is written.
LikedPost.pipe(
  // @ts-expect-error likeCount is already a member
  Entity.derived({ likeCount: Derived.count(Chirp.Like.relations.post) }),
)
