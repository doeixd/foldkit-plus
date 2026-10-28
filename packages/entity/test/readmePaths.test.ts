/** The README's paths and `Judge` snippets, run: what they say they answer. */
import { Option, Schema } from 'effect'
import { expect, it } from 'vitest'
import { Entity, Expr, Held, Judge, Order, Query, Relation, evaluate } from '../src/index.js'

const UserFields = Entity.define(
  'User',
  Schema.Struct({ id: Schema.String, handle: Schema.String }),
)
const PostFields = Entity.define('Post', Schema.Struct({ id: Schema.String, body: Schema.String }))
const FollowFields = Entity.define(
  'Follow',
  Schema.Struct({ id: Schema.String, followerId: Schema.String }),
)
const { Post, User, Follow } = Entity.relate(
  { Post: PostFields, User: UserFields, Follow: FollowFields },
  { Post: { author: Relation.one(UserFields) }, Follow: { followee: Relation.one(UserFields) } },
)

// Posts by a handle: a field of the row `author` points at.
const ByHandle = Query.from(Post).pipe(
  Query.where(
    Expr.eq(
      Expr.path(Post.relations.author, User.fields.handle),
      Expr.input('handle', Schema.String),
    ),
  ),
  Query.orderBy(Order.asc(Post.fields.id)),
)

// Posts whose author the reader follows: some Follow points at the author, and is theirs.
const Home = Query.from(Post).pipe(
  Query.where(
    Expr.path(
      Post.relations.author,
      Expr.exists(
        Follow.relations.followee,
        Expr.eq(Follow.fields.followerId, Expr.input('me', Schema.String)),
      ),
    ),
  ),
  Query.orderBy(Order.asc(Post.fields.id)),
)

// Posts by whoever asks: where `author` points.
const Mine = Query.from(Post).pipe(Query.where(Expr.eq(Post.relations.author, Expr.viewer(User))))

it("lists the posts whose author link is the viewer's id", () => {
  const posts = [
    { id: 'p1', body: 'hi', author: 'u1' },
    { id: 'p2', body: 'yo', author: 'u2' },
  ]
  const context = { viewer: Option.some({ entity: 'User', id: 'u2' }), now: Option.none() }
  expect(evaluate(Mine, {}, posts, { context }).map(row => row.id)).toEqual(['p2'])
})

it('judges a post whose author is not held as unknown, and one whose author is as SQL would', () => {
  const holder = Held.rows([
    {
      entity: Post,
      rows: [
        { id: 'p1', body: 'hi', author: 'u1' },
        { id: 'p2', body: 'yo', author: 'u2' },
      ],
    },
    // Ada is held; u2 is not, and the client knows it may lack users.
    { entity: User, rows: [{ id: 'u1', handle: 'ada' }], complete: false },
  ])
  const p1 = Option.getOrThrow(holder.row(Post, 'p1'))
  const p2 = Option.getOrThrow(holder.row(Post, 'p2'))
  expect(Judge.query(ByHandle, { handle: 'ada' }, p1)).toEqual({ _tag: 'Known', truth: true })
  expect(Judge.query(ByHandle, { handle: 'ada' }, p2)).toEqual({
    _tag: 'Unknown',
    reason: 'User u2 is not held',
  })
})

it('places a post in the home feed when the follows that decide it are held', () => {
  const holder = Held.rows([
    { entity: Post, rows: [{ id: 'p1', body: 'hi', author: 'u1' }] },
    { entity: User, rows: [{ id: 'u1', handle: 'ada' }] },
    // Not every follow is held: a held one of mine decides, none held does not.
    {
      entity: Follow,
      rows: [{ id: 'f1', followerId: 'me', followee: 'u1' }],
      complete: false,
    },
  ])
  const p1 = Option.getOrThrow(holder.row(Post, 'p1'))
  expect(Judge.query(Home, { me: 'me' }, p1)).toEqual({ _tag: 'Known', truth: true })
  expect(Judge.query(Home, { me: 'someone' }, p1)._tag).toBe('Unknown')
})
