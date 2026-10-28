/**
 * A `one` relation as an operand: the id it points at, so a rule compares the
 * link itself (`Expr.eq(Like.relations.user, Expr.viewer(User))`) and no twin
 * field over the same column is needed. operations-phase3-DESIGN.
 */
import { Option, Schema } from 'effect'
import { describe, expect, it } from 'vitest'
import {
  Entity,
  Expr,
  Held,
  Judge,
  Order,
  Query,
  Relation,
  evaluate,
  type ExprContext,
} from '../src/index.js'

const Fields = {
  User: Entity.define('User', Schema.Struct({ id: Schema.String, handle: Schema.String })),
  Post: Entity.define('Post', Schema.Struct({ id: Schema.String, body: Schema.String })),
  Like: Entity.define('Like', Schema.Struct({ id: Schema.String })),
}
const { User, Post, Like } = Entity.relate(Fields, {
  Post: {
    author: Relation.one(Fields.User),
    editor: Relation.one(Fields.User, { optional: true }),
  },
  User: { posts: Relation.many(Fields.Post) },
  Like: { user: Relation.one(Fields.User), post: Relation.one(Fields.Post) },
})

// A row holds a `one` relation under its key, as the id it points at.
const likes = [
  { id: 'l1', user: 'ada', post: 'p1' },
  { id: 'l2', user: 'bo', post: 'p1' },
]
const viewing = (id: string): ExprContext => ({
  viewer: Option.some({ entity: 'User', id }),
  now: Option.none(),
})
const ids = (found: ReadonlyArray<Readonly<Record<string, unknown>>>) => found.map(row => row.id)

const mine = Query.from(Like).pipe(Query.where(Expr.eq(Like.relations.user, Expr.viewer(User))))

describe('a link as an operand', () => {
  it('is the id it points at', () => {
    expect(ids(evaluate(mine, {}, likes, { context: viewing('ada') }))).toEqual(['l1'])
    expect(ids(evaluate(mine, {}, likes, { context: viewing('bo') }))).toEqual(['l2'])
    const byInput = Query.from(Like).pipe(
      Query.where(Expr.eq(Like.relations.post, Expr.input('post', Schema.String))),
    )
    expect(ids(evaluate(byInput, { post: 'p1' }, likes))).toEqual(['l1', 'l2'])
    expect(ids(evaluate(byInput, { post: 'p2' }, likes))).toEqual([])
  })

  it('is null where an optional link points nowhere', () => {
    const posts = [
      { id: 'p1', body: '', author: 'ada', editor: null },
      { id: 'p2', body: '', author: 'ada', editor: 'bo' },
    ]
    const unedited = Query.from(Post).pipe(Query.where(Expr.isNull(Post.relations.editor)))
    expect(ids(evaluate(unedited, {}, posts))).toEqual(['p1'])
  })

  it('is unknown to a holder that lacks it, and judged where it holds it', () => {
    const world = (row: Readonly<Record<string, unknown>>) =>
      Held.rows([{ entity: Like, rows: [row] }]).row(Like, row.id)
    const asked = (row: Readonly<Record<string, unknown>>) =>
      Judge.query(mine, {}, Option.getOrThrow(world(row)), { context: viewing('ada') })
    expect(asked({ id: 'l1', user: 'ada' })).toEqual({ _tag: 'Known', truth: true })
    expect(asked({ id: 'l2', user: 'bo' })).toEqual({ _tag: 'Known', truth: false })
    expect(asked({ id: 'l3' })._tag).toBe('Unknown')
  })

  it('is read as a member of its row', () => {
    const read = Query.dependencies(mine)
    expect(read.fields.map(field => `${field.entity}.${field.key}`)).toEqual(['Like.user'])
    expect(read.predicate.map(field => field.key)).toEqual(['user'])
    expect(Expr.show(Expr.eq(Like.relations.user, 'ada'))).toBe('Like.user = "ada"')
  })

  it('is refused for a many relation, which holds no one value', () => {
    // @ts-expect-error a many relation is no operand
    expect(() => Expr.isNull(User.relations.posts)).toThrow(
      'User.posts is a many relation, which holds no one value',
    )
  })

  it('orders no list, which a client could not place a row in', () => {
    // @ts-expect-error a link orders nothing
    expect(() => Order.asc(Post.relations.author)).toThrow(
      'a list orders by its own fields, not by where a relation points',
    )
  })

  it('is owned by its Entity, so a query over another refuses it', () => {
    expect(() =>
      // @ts-expect-error the link is a Like's
      Query.from(Post).pipe(Query.where(Expr.eq(Like.relations.user, 'ada'))),
    ).toThrow('reads Like.user, but the query is from Post')
  })
})
