/** An invariant reads each `one` relation as the id it points at (#345); a `many` it cannot. */
import { Schema } from 'effect'
import { expectTypeOf } from 'vitest'
import { Entity, Expr, Relation, type NextExpr } from '../src/index.js'

const PersonFields = Entity.define('Person', Schema.Struct({ id: Schema.String }))
const FollowFields = Entity.define(
  'Follow',
  Schema.Struct({ id: Schema.String, at: Schema.Number }),
)
const Social = Entity.relate(
  { Person: PersonFields, Follow: FollowFields },
  {
    Person: { follows: Relation.many(FollowFields) },
    Follow: {
      follower: Relation.one(PersonFields),
      followee: Relation.one(PersonFields),
      via: Relation.one(PersonFields, { optional: true }),
    },
  },
)

Entity.invariant<typeof Social.Follow>(
  'notSelf',
  ({ after }) => {
    expectTypeOf(after.follower).toExtend<NextExpr<string>>()
    expectTypeOf(after.via).toExtend<NextExpr<string | null>>()
    return Expr.not(Expr.eq(after.follower, after.followee))
  },
  { message: 'x', path: ['followee'] },
)

// A relation's id is text: compared with a number, it is refused where written.
Entity.invariant<typeof Social.Follow>(
  'mixed',
  // @ts-expect-error a link is text, not a number
  ({ after }) => Expr.eq(after.follower, after.at),
  { message: 'x' },
)

Entity.invariant<typeof Social.Person>(
  'many',
  // @ts-expect-error a many relation holds no one value, so `after` has none of it
  ({ after }) => Expr.isNotNull(after.follows),
  { message: 'x' },
)

Entity.invariant<typeof Social.Person>('pathMany', ({ after }) => Expr.isNotNull(after.id), {
  message: 'x',
  // @ts-expect-error a path names a field or a one relation, never a many
  path: ['follows'],
})

// Before `relate`, an Entity has no relations, and so no link to read.
Entity.invariant<typeof FollowFields>(
  'early',
  // @ts-expect-error not related yet
  ({ after }) => Expr.isNotNull(after.follower),
  { message: 'x' },
)

expectTypeOf(Expr.next(Social.Follow.relations.via)).toExtend<NextExpr<string | null>>()
// @ts-expect-error Expr.next takes a field or a one relation
Expr.next(Social.Person.relations.follows)
