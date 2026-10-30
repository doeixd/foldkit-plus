/** What the client reads and asks of the server: what a post shows, two lists, five writes. */
import { Schema } from 'effect'
import { Entity, Expr, Order, Write, type Selected } from 'foldkit-entity'
import { Mutation, Query } from 'foldkit-remote'
import { Chirper, PostFields } from './domain.js'
import { Like, Post } from './guard.js'

// #region select
export const TimelinePost = Entity.select(Post, {
  id: true,
  body: true,
  likeCount: true,
  createdAt: true,
  may: true,
  liked: true,
  author: Entity.select(Chirper, { name: true, handle: true }),
})

export type Row = Selected<typeof TimelinePost>
// #endregion

/** A profile's header: who the person is, and how much they have posted. */
export const UserCard = Entity.select(Chirper, { name: true, handle: true, postCount: true })

// #region query
export const Timeline = Query.define('Timeline', {}, () =>
  Query.from(Post).pipe(Query.orderBy(Order.desc(Post.fields.createdAt))),
)
// #endregion

/** One person's posts, the newest first. */
export const ByAuthor = Query.define('ByAuthor', { authorId: Schema.String }, ({ input }) =>
  Query.from(Post).pipe(
    Query.where(Expr.eq(Post.relations.author, input.authorId)),
    Query.orderBy(Order.desc(Post.fields.createdAt)),
  ),
)

/** A post's text, worded as the form asks for it. */
const body = PostFields.fields.body.schema.annotate({ title: "What's happening?" })

// #region mutation
export const NewPost = Schema.Struct({ ...Entity.fields(PostFields, 'id'), body })

export const PostChirp = Mutation.write(
  'PostChirp',
  Write.insert(Entity.input(Post, NewPost), { id: 'id' }),
)
// #endregion

export const EditInput = Schema.Struct({
  ...Entity.fields(PostFields, 'id'),
  body: PostFields.fields.body.schema.annotate({ title: 'Your chirp' }),
})

// #region like
/** One person's like of one post has one id, so liking twice is one like. */
export const likeOf = (postId: string, userId: string): string => `${postId}~${userId}`

/**
 * A like: a row pointing at the post, and at you, whom the server sets. The
 * page shows it on the post at once (its count, and `liked`), and the
 * server's answer reads the post.
 */
export const LikePost = Mutation.write(
  'LikePost',
  Write.insert(
    Entity.input(Like, Schema.Struct({ id: Schema.String, postId: Schema.String }), {
      postId: 'post',
    }),
    { id: 'id' },
  ),
)

/** A like taken back, by the id the post's `liked` holds. */
export const Unlike = Mutation.write(
  'Unlike',
  Write.delete(Entity.input(Like, Schema.Struct({ id: Schema.String })), { id: 'id' }),
)
// #endregion

export const EditPost = Mutation.write(
  'EditPost',
  Write.update(Entity.input(Post, EditInput), { id: 'id' }),
)

/**
 * A chirp taken down, by its author alone (`guard.ts`). The page drops it
 * from every list and its author's count at once; the server deletes its
 * likes with it (`on delete cascade`).
 */
export const DeletePost = Mutation.write(
  'DeletePost',
  Write.delete(Entity.input(Post, Schema.Struct({ id: Schema.String })), { id: 'id' }),
)
