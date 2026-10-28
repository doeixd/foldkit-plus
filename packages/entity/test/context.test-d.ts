/** The context terms compare as the value they read: the viewer's id as text, the time as a number. */
import { Schema } from 'effect'
import { Entity, Expr, Query } from '../src/index.js'

const User = Entity.define('User', Schema.Struct({ id: Schema.String }))
const Post = Entity.define(
  'Post',
  Schema.Struct({ id: Schema.String, authorId: Schema.String, publishAt: Schema.Number }),
)

// Another Entity's viewer is no field of Post, so the query reads Post alone.
Query.from(Post).pipe(
  Query.where(Expr.eq(Post.fields.authorId, Expr.viewer(User))),
  Query.where(Expr.lte(Post.fields.publishAt, Expr.now)),
)

// @ts-expect-error the viewer is an id, not a number
Expr.eq(Post.fields.publishAt, Expr.viewer(User))
// @ts-expect-error the time is a number, not text
Expr.eq(Post.fields.authorId, Expr.now)
