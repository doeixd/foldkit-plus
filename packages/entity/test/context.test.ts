/**
 * The write's context as terms of `Expr`: who asks (`Expr.viewer`) and what
 * time it is (`Expr.now`), read by the reference interpreter from the context
 * a run is given. ops-2-context-terms-DESIGN.
 */
import { Option, Schema } from 'effect'
import { describe, expect, it } from 'vitest'
import {
  ContextMissingError,
  Entity,
  Expr,
  Query,
  Write,
  decided,
  evaluate,
  evaluateEach,
  type ExprContext,
} from '../src/index.js'

const User = Entity.define('User', Schema.Struct({ id: Schema.String }))
const Team = Entity.define('Team', Schema.Struct({ id: Schema.String }))
const Post = Entity.define(
  'Post',
  Schema.Struct({
    id: Schema.String,
    authorId: Schema.String,
    publishAt: Schema.Number,
    stamp: Schema.Number,
  }),
)

const rows = [
  { id: 'p1', authorId: 'ada', publishAt: 100, stamp: 0 },
  { id: 'p2', authorId: 'bo', publishAt: 300, stamp: 0 },
  { id: 'p3', authorId: 'ada', publishAt: 500, stamp: 0 },
]

const mine = Query.from(Post).pipe(Query.where(Expr.eq(Post.fields.authorId, Expr.viewer(User))))
const published = Query.from(Post).pipe(Query.where(Expr.lte(Post.fields.publishAt, Expr.now)))

const as = (viewer: Option.Option<{ entity: string; id: string }>, now = Option.none<number>()) =>
  ({ viewer, now }) satisfies ExprContext
const ids = (found: ReadonlyArray<Readonly<Record<string, unknown>>>) => found.map(row => row.id)

describe('Expr.viewer', () => {
  it("is the viewer's id, when they are a row of its Entity", () => {
    const ada = as(Option.some({ entity: 'User', id: 'ada' }))
    const bo = as(Option.some({ entity: 'User', id: 'bo' }))
    expect(ids(evaluate(mine, {}, rows, { context: ada }))).toEqual(['p1', 'p3'])
    expect(ids(evaluate(mine, {}, rows, { context: bo }))).toEqual(['p2'])
  })

  it('holds of no row for a visitor, or a viewer of another Entity', () => {
    expect(evaluate(mine, {}, rows, { context: as(Option.none()) })).toEqual([])
    const team = as(Option.some({ entity: 'Team', id: 'ada' }))
    expect(evaluate(mine, {}, rows, { context: team })).toEqual([])
  })

  it('reads as the term it is', () => {
    expect(Expr.show(Expr.viewer(Team))).toBe('viewer Team')
    expect(Query.dependencies(mine).operations).toContain('viewer')
    expect(Expr.viewer(User).target()).toBe(User)
  })
})

describe('Expr.now', () => {
  it('is the time the run is given', () => {
    const at = (now: number) => as(Option.none(), Option.some(now))
    expect(ids(evaluate(published, {}, rows, { context: at(300) }))).toEqual(['p1', 'p2'])
    expect(ids(evaluate(published, {}, rows, { context: at(99) }))).toEqual([])
  })

  it('is refused where the side has no reading of the time, which is no null', () => {
    expect(() => evaluate(published, {}, rows, { context: as(Option.none()) })).toThrow(
      'reads now, but its context has no reading of the time',
    )
  })
})

describe('a run given no context', () => {
  it('refuses a body that reads it, as the run, not row by row', () => {
    expect(() => evaluate(published, {}, rows)).toThrow(ContextMissingError)
    expect(() => evaluateEach(mine, {}, rows)).toThrow(
      'reads viewer User, but was given no context',
    )
  })

  it('is not decided from the input alone, and is with the context', () => {
    const askedByAda = Expr.eq(Expr.viewer(User), 'ada')
    expect(decided(askedByAda, {})).toEqual(Option.none())
    expect(decided(Expr.isNull(Expr.now), {})).toEqual(Option.none())
    const ada = as(Option.some({ entity: 'User', id: 'ada' }))
    expect(decided(askedByAda, {}, undefined, ada)).toEqual(Option.some(true))
    expect(decided(askedByAda, {}, undefined, as(Option.none()))).toEqual(Option.some('unknown'))
  })
})

describe('an assignment', () => {
  const Restamp = Entity.input(Post, Schema.Struct({ id: Schema.String }))
  it('refuses to compute from the context, which Entity.stamps declares', () => {
    expect(() => Write.update(Restamp, { id: 'id', compute: { stamp: () => Expr.now } })).toThrow(
      'computes "stamp" from the write\'s context (Expr.now)',
    )
  })
})
