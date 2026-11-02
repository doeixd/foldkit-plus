/**
 * `Judge.pins`: what a conjunction fixes by field (#409), which tells a
 * holder that a list holds every row an exists may count.
 */
import { Option, Schema } from 'effect'
import { describe, expect, it } from 'vitest'
import { Entity, Expr, Judge, Relation, type Predicate } from '../src/index.js'

const UserFields = Entity.define('User', Schema.Struct({ id: Schema.String }))
const FollowFields = Entity.define(
  'Follow',
  Schema.Struct({ id: Schema.String, note: Schema.String, muted: Schema.Boolean }),
)
const { Follow } = Entity.relate(
  { User: UserFields, Follow: FollowFields },
  { Follow: { follower: Relation.one(UserFields), followee: Relation.one(UserFields) } },
)

const account = Expr.input('account', Schema.String)
const follower = Follow.relations.follower
const me = { viewer: Option.some({ entity: 'User', id: 'me' }), now: Option.none() }

const pinned = (
  predicates: ReadonlyArray<Predicate>,
  context?: typeof me,
): { readonly pins: Record<string, unknown>; readonly whole: boolean } => {
  const { pins, whole } = Judge.pins(predicates, { input: { account: 'me' }, context })
  return { pins: Object.fromEntries(pins), whole }
}

describe('Judge.pins', () => {
  it.each<[string, ReadonlyArray<Predicate>, Record<string, unknown>, boolean]>([
    ['nothing', [], {}, true],
    ['a link to an input', [Expr.eq(follower, account)], { follower: 'me' }, true],
    [
      'an input to a field',
      [Expr.eq(account, Expr.field(Follow.fields.note))],
      { note: 'me' },
      true,
    ],
    ['a field to a literal', [Expr.eq(Follow.fields.muted, false)], { muted: false }, true],
    [
      'two fields',
      [Expr.eq(follower, account), Expr.eq(Follow.fields.note, 'hi')],
      { follower: 'me', note: 'hi' },
      true,
    ],
    [
      'one field twice alike',
      [Expr.eq(follower, account), Expr.eq(follower, 'me')],
      { follower: 'me' },
      true,
    ],
    [
      'one field twice apart',
      [Expr.eq(follower, account), Expr.eq(follower, 'ada')],
      { follower: 'ada' },
      false,
    ],
    [
      'a field and a search',
      [Expr.eq(follower, account), Expr.contains(Follow.fields.note, 'hi')],
      { follower: 'me' },
      false,
    ],
    [
      'a field to a missing input',
      [Expr.eq(Follow.fields.note, Expr.input('gone', Schema.String))],
      {},
      false,
    ],
    [
      'a link to the viewer, with no context',
      [Expr.eq(follower, Expr.viewer(UserFields))],
      {},
      false,
    ],
  ])('fixes %s', (_, predicates, pins, whole) => {
    expect(pinned(predicates)).toEqual({ pins, whole })
  })

  it('fixes a link to the viewer the context names', () => {
    expect(pinned([Expr.eq(follower, Expr.viewer(UserFields))], me)).toEqual({
      pins: { follower: 'me' },
      whole: true,
    })
  })
})
