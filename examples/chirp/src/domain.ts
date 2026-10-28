/** The domain, declared once: what client and server both interpret. */
import { Schema } from 'effect'
import { Derived, Entity, Relation, Stamp } from 'foldkit-entity'

// #region entity
export const UserFields = Entity.define(
  'User',
  Schema.Struct({
    id: Schema.String,
    // A pattern of ASCII alone, so its lengths are the database's too (its CHECK).
    handle: Schema.String.check(
      Schema.isPattern(/^[a-z0-9_]+$/),
      Schema.isMinLength(3),
      Schema.isMaxLength(15),
    ),
    name: Schema.String,
  }),
)

export const PostFields = Entity.define(
  'Post',
  Schema.Struct({
    id: Schema.String,
    authorId: Schema.String,
    // Characters as people count them (code points), which is what SQL counts too.
    body: Schema.String.check(Schema.isMaxCodePoints(280)),
    createdAt: Schema.Number,
  }),
)

/** One person's like of one post, keyed by the pair: see `likeOf` in `operations.ts`. */
export const LikeFields = Entity.define(
  'Like',
  Schema.Struct({ id: Schema.String, userId: Schema.String }),
)
// #endregion

// #region relate
export const Chirp = Entity.relate(
  { User: UserFields, Post: PostFields, Like: LikeFields },
  {
    Post: { author: Relation.one(UserFields) },
    User: { posts: Relation.many(PostFields) },
    Like: { post: Relation.one(PostFields), user: Relation.one(UserFields) },
  },
)
// #endregion

// #region count
/** A person, with how many posts name them as author: the server counts, the page shows. */
export const Chirper = Chirp.User.pipe(
  Entity.derived({ postCount: Derived.count(Chirp.Post.relations.author) }),
)

/**
 * A post, with how many like it and whether you do: `liked` is your Like's
 * id, or none. The server reads both for whoever asks; the page predicts both
 * while a like is pending. Who wrote it, and when, are the server's to say:
 * no write's input sets them, and the page predicts them for a new chirp.
 */
export const LikedPost = Chirp.Post.pipe(
  Entity.stamps({ authorId: Stamp.viewer, author: Stamp.viewer, createdAt: Stamp.clock }),
  Entity.derived({
    likeCount: Derived.count(Chirp.Like.relations.post),
    liked: Derived.exists(Chirp.Like.relations.post, { viewer: Chirp.Like.relations.user }),
  }),
)

/** A like is whoever made it: its person, as the field the guards read and as the link. */
export const Liking = Chirp.Like.pipe(Entity.stamps({ userId: Stamp.viewer, user: Stamp.viewer }))
// #endregion
