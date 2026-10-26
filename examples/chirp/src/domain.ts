/** The domain, declared once: what client and server both interpret. */
import { Schema } from 'effect'
import { Derived, Entity, Relation } from 'foldkit-entity'

// #region entity
export const UserFields = Entity.define(
  'User',
  Schema.Struct({
    id: Schema.String,
    handle: Schema.String,
    name: Schema.String,
  }),
)

export const PostFields = Entity.define(
  'Post',
  Schema.Struct({
    id: Schema.String,
    authorId: Schema.String,
    body: Schema.String.check(Schema.isMaxLength(280)),
    createdAt: Schema.Number,
  }),
).pipe(Entity.derived({ likeCount: Derived.make(Schema.Number) }))
// #endregion

// #region relate
export const Chirp = Entity.relate(
  { User: UserFields, Post: PostFields },
  {
    Post: {
      author: Relation.one(UserFields),
      likedBy: Relation.many(UserFields),
    },
    User: { posts: Relation.many(PostFields) },
  },
)
// #endregion
