/** What the client may ask of the server: one list and two declared writes. */
import { Schema } from 'effect'
import { Entity, Order, Write } from 'foldkit-entity'
import { Mutation, Query } from 'foldkit-remote'
import { PostFields } from './domain.js'
import { Post } from './guard.js'

// #region query
export const Timeline = Query.define('Timeline', {}, () =>
  Query.from(Post).pipe(Query.orderBy(Order.desc(Post.fields.createdAt))),
)
// #endregion

// #region mutation
export const NewPost = Schema.Struct(Entity.fields(PostFields, 'id', 'authorId', 'body'))

export const PostChirp = Mutation.write(
  'PostChirp',
  Write.insert(Entity.input(Post, NewPost), { id: 'id' }),
)
// #endregion

export const EditInput = Schema.Struct(Entity.fields(PostFields, 'id', 'body'))

export const EditPost = Mutation.write(
  'EditPost',
  Write.update(Entity.input(Post, EditInput), { id: 'id' }),
)
