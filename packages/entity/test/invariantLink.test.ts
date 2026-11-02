/**
 * An invariant over `one` relations (#345): a follow points at two people,
 * and may not point at one person twice. The relations are operands, the id
 * each points at, as they are in a query or a guard.
 */
import { Option, Schema } from 'effect'
import { describe, expect, it } from 'vitest'
import { Entity, Expr, Relation } from '../src/index.js'

const PersonFields = Entity.define('Person', Schema.Struct({ id: Schema.String }))
const FollowFields = Entity.define('Follow', Schema.Struct({ id: Schema.String }))
const Social = Entity.relate(
  { Person: PersonFields, Follow: FollowFields },
  {
    Follow: {
      follower: Relation.one(PersonFields),
      followee: Relation.one(PersonFields),
      // Optional, so the row may point nowhere: a null compared is no answer.
      via: Relation.one(PersonFields, { optional: true }),
    },
  },
)

export const notSelf = Entity.invariant<typeof Social.Follow>(
  'notSelf',
  ({ after }) => Expr.not(Expr.eq(after.follower, after.followee)),
  { message: 'You cannot follow yourself', path: ['followee'] },
)
// Attached when first read, so a declaration refused fails a test, not the file.
let attached: typeof Social.Follow | undefined
const follow = () => (attached ??= Social.Follow.pipe(notSelf))

describe('An invariant over one relations', () => {
  it('reads each as the id it points at', () => {
    const [held] = Entity.invariants(follow())
    expect(held).toMatchObject({ after: ['follower', 'followee'], before: [], path: ['followee'] })
    expect(
      Entity.judge(follow(), { after: { id: 'f1', follower: 'ada', followee: 'bo' } }),
    ).toEqual({
      _tag: 'Valid',
    })
    expect(
      Entity.judge(follow(), { after: { id: 'f1', follower: 'ada', followee: 'ada' } }),
    ).toEqual({
      _tag: 'Invalid',
      failures: [held],
    })
  })

  it('is undecided over a row that lacks a relation it reads', () => {
    expect(Entity.judge(follow(), { after: { id: 'f1', follower: 'ada' } })).toEqual({
      _tag: 'Undecided',
      fields: ['followee'],
      operators: [],
    })
  })

  it('judges a form input by the ids its relation keys hold', () => {
    const FollowInput = Entity.input(
      follow(),
      Schema.Struct({ followerId: Schema.String, followeeId: Schema.String }),
      { followerId: 'follower', followeeId: 'followee' },
    )
    expect(Entity.judgeInput(FollowInput, { followerId: 'ada', followeeId: 'ada' })._tag).toBe(
      'Invalid',
    )
    expect(Entity.judgeInput(FollowInput, { followerId: 'ada', followeeId: 'bo' })._tag).toBe(
      'Valid',
    )
  })

  it('reads an optional relation pointing nowhere as null, which no comparison holds of', () => {
    const Routed = Entity.define('Routed', Schema.Struct({ id: Schema.String }))
    const { Routed: Linked } = Entity.relate(
      { Routed, Person: PersonFields },
      { Routed: { by: Relation.one(PersonFields, { optional: true }) } },
    )
    const Each = Linked.pipe(
      Entity.invariant('routed', ({ after }) => Expr.isNotNull(after.by), { message: 'Route it' }),
    )
    const input = Entity.input(Each, Schema.Struct({ by: Schema.NullOr(Schema.String) }), {
      by: 'by',
    })
    expect(Entity.judgeInput(input, { by: null })._tag).toBe('Invalid')
    expect(Entity.judgeInput(input, { by: 'ada' })._tag).toBe('Valid')
  })

  it('reads an optional relation input given nothing as undecided, not as null', () => {
    const Routed = Entity.define('Routed', Schema.Struct({ id: Schema.String }))
    const { Routed: Linked } = Entity.relate(
      { Routed, Person: PersonFields },
      { Routed: { by: Relation.one(PersonFields, { optional: true }) } },
    )
    const Each = Linked.pipe(
      Entity.invariant('routed', ({ after }) => Expr.isNotNull(after.by), { message: 'Route it' }),
    )
    const input = Entity.input(Each, Schema.Struct({ by: Schema.Option(Schema.String) }), {
      by: 'by',
    })
    expect(Entity.judgeInput(input, { by: Option.none() })).toEqual({
      _tag: 'Undecided',
      fields: ['by'],
      operators: [],
    })
    expect(Entity.judgeInput(input, { by: Option.some('ada') })._tag).toBe('Valid')
  })

  it('compares a relation before and after: a transition over where a row points', () => {
    const Kept = Social.Follow.pipe(
      Entity.invariant(
        'keepsFollower',
        ({ before, after }) => Expr.eq(after.follower, before.follower),
        {
          message: 'A follow keeps its follower',
        },
      ),
    )
    const before = { id: 'f1', follower: 'ada', followee: 'bo' }
    expect(Entity.judge(Kept, { before, after: { ...before, followee: 'cy' } })._tag).toBe('Valid')
    expect(Entity.judge(Kept, { before, after: { ...before, follower: 'cy' } })._tag).toBe(
      'Invalid',
    )
  })

  it('names a relation in its path, and refuses one that is neither field nor one relation', () => {
    expect(() =>
      Social.Follow.pipe(
        Entity.invariant('bad', ({ after }) => Expr.isNotNull(after.via), {
          message: 'x',
          // @ts-expect-error a key that is no member
          path: ['nobody'],
        }),
      ),
    ).toThrow(/"nobody", neither a field nor a one relation/)
  })
})
