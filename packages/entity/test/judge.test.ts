import { Option, Schema } from 'effect'
import { describe, expect, it } from 'vitest'
import {
  Collation,
  Entity,
  Expr,
  Held,
  Judge,
  Operators,
  Query,
  QueryEvaluateError,
  RowsMissingError,
  evaluate,
  truthOver,
  type PredicateVerdict,
} from '../src/index.js'
import { Verdict } from '@doeixd/metakit'
import {
  Relational,
  heldWorlds,
  relationalCases,
  relationalContext,
  type RelationalCase,
  type HeldWorld,
} from '../src/conformance/index.js'

/** Each held row of the case's Entity, with what `Judge.query` makes of it. */
const judged = (c: RelationalCase, world: HeldWorld) => {
  const holder = Held.rows(world.tables)
  return holder.rows(c.body.entity).map(row => {
    const id = Held.match(row.field('id'), { onHeld: String, onUnheld: () => '?' })
    return {
      id,
      judgement: Judge.query(c.body, c.input, row, {
        context: relationalContext(c),
        rows: holder,
      }),
    }
  })
}

const [everything, ...partial] = heldWorlds

describe('Judge over everything the reader may see', () => {
  it.each(relationalCases)('answers every row, as SQL does: $what', c => {
    const answers = judged(c, everything!)
    expect(answers.every(({ judgement }) => !Verdict.isUnknown(judgement))).toBe(true)
    const kept = answers.filter(({ judgement }) => Verdict.isTrue(judgement))
    expect(kept.map(({ id }) => id)).toEqual(c.expected)
  })
})

describe('Judge over less: unknown, or what SQL answers', () => {
  const pairs = partial.flatMap(world =>
    relationalCases.map(c => ({ c, world, name: `${world.what}: ${c.what}` })),
  )
  it.each(pairs)('$name', ({ c, world }) => {
    for (const { id, judgement } of judged(c, world)) {
      Verdict.match(judgement, {
        True: () => expect([id, true]).toEqual([id, c.expected.includes(id)]),
        False: () => expect([id, false]).toEqual([id, c.expected.includes(id)]),
        Unknown: () => undefined,
      })
    }
  })

  it('leaves something unknown in every partial world, so the check above checks', () => {
    for (const world of partial) {
      const unknowns = relationalCases.flatMap(c =>
        judged(c, world).filter(({ judgement }) => Verdict.isUnknown(judgement)),
      )
      expect([world.what, unknowns.length > 0]).toEqual([world.what, true])
    }
  })

  it('still knows some rows in every partial world, so it does not just give up', () => {
    for (const world of partial) {
      const knowns = relationalCases.flatMap(c =>
        judged(c, world).filter(({ judgement }) => !Verdict.isUnknown(judgement)),
      )
      expect([world.what, knowns.length > 0]).toEqual([world.what, true])
    }
  })
})

const Thing = Entity.define(
  'Thing',
  Schema.Struct({ id: Schema.String, label: Schema.NullOr(Schema.String), rank: Schema.Number }),
)
const Counted = Entity.define('Counted', Schema.Struct({ id: Schema.String, rank: Schema.Int }))
const one = (values: Readonly<Record<string, unknown>>, hidden: ReadonlyArray<string> = []) =>
  Option.getOrThrow(
    Held.rows([{ entity: Thing, rows: [{ id: 'x', ...values }], hidden }]).row(Thing, 'x'),
  )
const given = Expr.input('given', Schema.Number)
const truth = (verdict: PredicateVerdict): unknown =>
  Verdict.match<'null', unknown>(verdict, {
    True: () => true,
    // SQL's null is a `False` whose witness says so.
    False: ({ witness }) => (Option.isSome(witness) ? 'unknown' : false),
    Unknown: () => 'unheld',
  })

describe('Judge, operator by operator', () => {
  const label = Thing.fields.label
  const unheld = one({ rank: 1 })
  const hidden = one({ label: 'a', rank: 1 }, ['label'])
  const nul = one({ label: null, rank: 1 })

  it.each([
    { what: 'eq', predicate: Expr.eq(label, 'a') },
    { what: 'isNull', predicate: Expr.isNull(label) },
    { what: 'isNotNull', predicate: Expr.isNotNull(label) },
    { what: 'contains', predicate: Expr.contains(label, 'a') },
    { what: 'in', predicate: Expr.in(label, ['a']) },
    { what: 'compare', predicate: Expr.lt(label, 'b', { collation: Collation.binary }) },
    { what: 'not', predicate: Expr.not(Expr.eq(label, 'a')) },
    {
      what: 'a defined operator',
      predicate: Expr.operator('test.labelled', {
        input: [Schema.NullOr(Schema.String)],
        output: Schema.Boolean,
        definedAs: value => Expr.isNotNull(value),
      })(label),
    },
  ])('$what of a field not held, or hidden, is unknown', ({ predicate }) => {
    expect(truth(Judge.predicate(predicate, unheld))).toBe('unheld')
    expect(truth(Judge.predicate(predicate, hidden))).toBe('unheld')
  })

  it.each([
    { what: 'eq', predicate: Expr.eq(Counted.fields.rank, given) },
    { what: 'compare', predicate: Expr.lt(Counted.fields.rank, given) },
  ])(
    '$what of a null beside an unheld integer is null, as SQL is whatever the other holds',
    ({ predicate }) => {
      const noRank = Option.getOrThrow(
        Held.rows([{ entity: Counted, rows: [{ id: 'x' }] }]).row(Counted, 'x'),
      )
      expect(truth(Judge.predicate(predicate, noRank, { input: { given: null } }))).toBe('unknown')
      expect(truth(Judge.predicate(predicate, noRank, { input: { given: 1 } }))).toBe('unheld')
    },
  )

  it.each([
    { what: 'eq', predicate: Expr.eq(Thing.fields.rank, given) },
    { what: 'compare', predicate: Expr.lt(Thing.fields.rank, given) },
  ])(
    '$what of a null beside an unheld plain number is unknown: the number may be NaN, which refuses before null',
    ({ predicate }) => {
      const noRank = one({ label: 'a' })
      expect(truth(Judge.predicate(predicate, noRank, { input: { given: null } }))).toBe('unheld')
    },
  )

  it('a held null compares as SQL compares it', () => {
    expect(truth(Judge.predicate(Expr.eq(label, 'a'), nul))).toBe('unknown')
    expect(truth(Judge.predicate(Expr.isNull(label), nul))).toBe(true)
  })

  it('and is false by a false operand beside an unheld one, and unknown by a null one', () => {
    const falseAnd = Expr.and(Expr.eq(Thing.fields.rank, 2), Expr.eq(label, 'a'))
    expect(truth(Judge.predicate(falseAnd, unheld))).toBe(false)
    const nullAnd = Expr.and(
      Expr.eq(Thing.fields.rank, Expr.input('r', Schema.Number)),
      Expr.eq(label, 'a'),
    )
    expect(truth(Judge.predicate(nullAnd, unheld, { input: { r: null } }))).toBe('unheld')
  })

  it('or is true by a true operand beside an unheld one', () => {
    const trueOr = Expr.or(Expr.eq(Thing.fields.rank, 1), Expr.eq(label, 'a'))
    expect(truth(Judge.predicate(trueOr, unheld))).toBe(true)
    const falseOr = Expr.or(Expr.eq(Thing.fields.rank, 2), Expr.eq(label, 'a'))
    expect(truth(Judge.predicate(falseOr, unheld))).toBe('unheld')
  })

  it('a primitive operator given a null beside an unheld argument is unknown: its implementation may refuse', () => {
    const both = Expr.operator('test.both', {
      input: [Schema.NullOr(Schema.String), Schema.NullOr(Schema.String)],
      output: Schema.Boolean,
    })
    const operators = Operators.merge(
      Operators.kernel,
      Operators.memory(Operators.implement(both, () => true)),
    )
    const row = Option.getOrThrow(
      Held.rows([{ entity: Thing, rows: [{ id: 'x' }] }]).row(Thing, 'x'),
    )
    const judged = Judge.predicate(
      both(label, Expr.input('given', Schema.NullOr(Schema.String))),
      row,
      {
        input: { given: null },
        operators,
      },
    )
    expect(truth(judged)).toBe('unheld')
  })

  it('an operator the holder does not run is unknown, where evaluate refuses it', () => {
    const serverOnly = Expr.operator('test.serverOnly', {
      input: [Schema.NullOr(Schema.String)],
      output: Schema.Boolean,
    })
    expect(
      Verdict.isUnknown(Judge.predicate(serverOnly(label), one({ label: 'a', rank: 1 }))),
    ).toBe(true)
    expect(() => truthOver(serverOnly(label), { label: 'a' })).toThrow(QueryEvaluateError)
  })

  it('a filter only the server runs makes a row the body admits unknown, and leaves one it refuses out', () => {
    const body = Query.from(Thing).pipe(Query.where(Expr.eq(Thing.fields.rank, 1)))
    const admitted = one({ label: 'a', rank: 1 })
    const refused = one({ label: 'a', rank: 2 })
    expect(
      Verdict.isUnknown(Judge.query(body, {}, admitted, { serverOnly: 'its Read rule' })),
    ).toBe(true)
    expect(Verdict.isTrue(Judge.query(body, {}, admitted))).toBe(true)
    expect(Verdict.isFalse(Judge.query(body, {}, refused, { serverOnly: 'its Read rule' }))).toBe(
      true,
    )
  })
})

describe('the two-valued interpreter, given one row', () => {
  const { Member: M, Team: T, Badge: B } = Relational
  const body = Query.from(M).pipe(
    Query.where(Expr.eq(Expr.path(M.relations.team, T.fields.name), 'Red')),
  )

  it('refuses a body that reads another row, rather than read it as absent', () => {
    expect(() => evaluate(body, {}, [{ id: 'm1', team: 't1' }])).toThrow(/path/)
  })

  it('refuses a predicate over another row with RowsMissingError, which a client reads as unknown', () => {
    expect(() => truthOver(Expr.exists(B.relations.member), { id: 'm1' })).toThrow(RowsMissingError)
  })

  it('still decides what does not rest on the other row', () => {
    expect(
      truthOver(Expr.or(Expr.eq(M.fields.rank, 1), Expr.isNull(M.fields.rank)), {
        id: 'm1',
        rank: 1,
      }),
    ).toBe(true)
  })

  it('settles an or by its own row beside an exists that cannot be refused, without its rows', () => {
    const beside = Expr.or(Expr.eq(M.fields.rank, 1), Expr.exists(B.relations.member))
    expect(truthOver(beside, { id: 'm1', rank: 1 })).toBe(true)
    // Its other side false, the exists decides, and its rows are not held.
    expect(() => truthOver(beside, { id: 'm1', rank: 2 })).toThrow(RowsMissingError)
  })
})
