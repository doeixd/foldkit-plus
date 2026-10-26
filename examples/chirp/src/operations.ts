/** What the client reads and asks of the server: what a post shows, two lists, two writes. */
import { Schema } from 'effect'
import { Entity, Expr, Order, Write, type Selected } from 'foldkit-entity'
import { Mutation, Query } from 'foldkit-remote'
import { Chirp, PostFields } from './domain.js'
import { Post } from './guard.js'

// #region select
export const TimelinePost = Entity.select(Post, {
  id: true,
  body: true,
  likeCount: true,
  may: true,
  author: Entity.select(Chirp.User, { name: true, handle: true }),
})

export type Row = Selected<typeof TimelinePost>
// #endregion

/** A profile's header: who the person is. */
export const Person = Entity.select(Chirp.User, { name: true, handle: true })

// #region query
export const Timeline = Query.define('Timeline', {}, () =>
  Query.from(Post).pipe(Query.orderBy(Order.desc(Post.fields.createdAt))),
)
// #endregion

/** One person's posts, the newest first. */
export const ByAuthor = Query.define('ByAuthor', { authorId: Schema.String }, ({ input }) =>
  Query.from(Post).pipe(
    Query.where(Expr.eq(Post.fields.authorId, input.authorId)),
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

export const EditPost = Mutation.write(
  'EditPost',
  Write.update(Entity.input(Post, EditInput), { id: 'id' }),
)
