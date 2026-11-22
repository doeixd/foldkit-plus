/**
 * What `Laws.check` asks of metakit's checker (`pairCheck.ts`): the pairs it
 * leaves open and why, and what restores them. Each case is one reason a pair
 * is undecided, beside the Schema that decides it.
 */
import { Schema } from 'effect'
import { describe, expect, it } from 'vitest'
import { Entity, Expr, Relation, Write } from '../src/index.js'
import { Laws, type LawVerdict } from '../src/laws.js'

/** The verdict on the write's pair with `rule`, or its only pair. */
const verdictOf = (
  write: Parameters<typeof Laws.check>[0]['writes'][number],
  rule?: string,
): LawVerdict => {
  const { pairs } = Laws.check({ writes: [write] as never })
  return (rule === undefined ? pairs[0]! : pairs.find(pair => pair.invariant === rule)!).verdict
}

describe('A comparison of a number that may be NaN', () => {
  const gauge = (level: Schema.Codec<number>) => {
    const Gauge = Entity.define(
      'Gauge',
      Schema.Struct({ id: Schema.String, name: Schema.String, level }),
    ).pipe(
      Entity.transition('neverFalls', ({ before, after }) => Expr.gte(after.level, before.level), {
        message: 'A level never falls',
      }),
    )
    const Rename = Write.update(
      Entity.input(Gauge, Schema.Struct({ id: Schema.String, name: Schema.String })),
      { id: 'id' },
    )
    return verdictOf({ name: 'Rename', write: Rename })
  }

  it('is undecided over a plain Schema.Number: NaN is not at least itself', () => {
    expect(gauge(Schema.Number)).toMatchObject({ _tag: 'Undecided' })
  })

  it.each([
    ['Schema.Finite', Schema.Finite],
    ['Schema.Int', Schema.Int],
  ])('is kept over %s, by the checker', (_, level) => {
    expect(gauge(level)).toMatchObject({ _tag: 'Kept', by: 'zone', over: ['level'] })
  })
})

describe('A write over a rule the row before already breaks', () => {
  // The rule holds of every row before, so a guard of "below zero" meets none: a proof by contradiction.
  const room = (free: Schema.Codec<number>) => {
    const Room = Entity.define('Room', Schema.Struct({ id: Schema.String, free })).pipe(
      Entity.invariant('nonNegative', ({ after }) => Expr.gte(after.free, 0), { message: 'free' }),
    )
    const Refill = Write.update(
      Entity.input(Room, Schema.Struct({ id: Schema.String, free: Schema.Int })),
      { id: 'id', when: () => Expr.lt(Room.fields.free, 0) },
    )
    return verdictOf({ name: 'Refill', write: Refill })
  }

  it('is kept over integers: below zero is at most -1, which no row allowed has', () => {
    expect(room(Schema.Int)).toMatchObject({ _tag: 'Kept' })
  })

  it('is kept over doubles: below zero is at most the greatest double below it', () => {
    expect(room(Schema.Finite)).toMatchObject({ _tag: 'Kept' })
  })
})

describe('A rule or a write that reads another row', () => {
  const CustomerFields = Entity.define(
    'PairCustomer',
    Schema.Struct({ id: Schema.String, name: Schema.String }),
  )
  const { Customer, Claim } = Entity.relate(
    {
      Customer: CustomerFields,
      Claim: Entity.define(
        'PairClaim',
        Schema.Struct({ id: Schema.String, ownerName: Schema.String }),
      ),
    },
    { Claim: { customer: Relation.one(CustomerFields) } },
  )
  const Rule = Claim.pipe(
    Entity.invariant(
      'belongsToCustomer',
      ({ after }) =>
        Expr.eq(after.ownerName, Expr.path(Claim.relations.customer, Customer.fields.name)),
      { message: 'A claim names its customer' },
    ),
  )
  const input = Entity.input(Rule, Schema.Struct({ id: Schema.String, ownerName: Schema.String }))

  it('is undecided, saying so: the checker sees one row', () => {
    const write = Write.update(input, { id: 'id' })
    expect(verdictOf({ name: 'Rename', write })).toMatchObject({
      _tag: 'Undecided',
      reason: expect.stringContaining('another row than its own'),
    })
  })

  it('is undecided, saying so, where the write itself reads it', () => {
    const Named = Claim.pipe(
      Entity.invariant('named', ({ after }) => Expr.not(Expr.eq(after.ownerName, '')), {
        message: 'A claim has an owner',
      }),
    )
    const write = Write.update(
      Entity.input(Named, Schema.Struct({ id: Schema.String, ownerName: Schema.String })),
      {
        id: 'id',
        when: () =>
          Expr.eq(
            Named.fields.ownerName,
            Expr.path(Named.relations.customer, Customer.fields.name),
          ),
      },
    )
    const verdict = verdictOf({ name: 'Rename', write }, 'named')
    expect(verdict).toMatchObject({
      _tag: 'Undecided',
      reason: expect.stringContaining('reads its row and its input alone'),
    })
  })
})

describe('An equality to a literal the Schema alone decides', () => {
  // `live` is never `archived`, whatever the score: the checker is told each value of the status as a fact.
  const Doc = Entity.define(
    'PairDoc',
    Schema.Struct({
      id: Schema.String,
      status: Schema.Literals(['draft', 'live', 'archived']),
      score: Schema.Finite,
    }),
  ).pipe(
    Entity.invariant(
      'archivedKeepsTen',
      ({ after }) =>
        Expr.or(Expr.not(Expr.eq(after.status, 'archived')), Expr.gte(after.score, 10)),
      { message: 'An archived doc keeps a score of ten' },
    ),
  )

  it('keeps a write of the one literal `live`', () => {
    const Publish = Write.update(
      Entity.input(Doc, Schema.Struct({ id: Schema.String, status: Schema.Literal('live') })),
      { id: 'id' },
    )
    expect(verdictOf({ name: 'Publish', write: Publish })).toMatchObject({ _tag: 'Kept' })
  })

  it('refuses a write that archives a doc, with the smallest score', () => {
    const Archive = Write.update(
      Entity.input(Doc, Schema.Struct({ id: Schema.String, status: Schema.Literal('archived') })),
      { id: 'id' },
    )
    expect(verdictOf({ name: 'Archive', write: Archive })).toMatchObject({
      _tag: 'Refused',
      witness: { after: { status: 'archived', score: 0 } },
    })
  })
})
