/**
 * The bounds pass against the reference judge, over small random domains: a
 * pair it keeps has no row and input within the declared bounds that breaks
 * the rule (searched over a grid of halves), and every witness it refuses
 * with really breaks it, judged by `Entity.judge` over the row `Write.apply`
 * leaves. Seeded; a failure prints its seed.
 */
import { Option, Schema } from 'effect'
import { Verdict } from '@doeixd/metakit'
import { describe, expect, it } from 'vitest'
import {
  Entity,
  Expr,
  Held,
  Judge,
  Operators,
  Write,
  type AnyWrite,
  type InputExpr,
  type Predicate,
} from '../src/index.js'
import { Laws } from '../src/laws.js'

/** The kernel's table, which runs `Expr.add` and `Expr.sub`. */
const operators = Operators.kernel

/** mulberry32: a small seeded generator, so a failing domain can be built again. */
const random = (seed: number) => {
  let state = seed >>> 0
  return () => {
    state = (state + 0x6d2b79f5) >>> 0
    let t = state
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

type Pick = <T>(choices: ReadonlyArray<T>) => T

/** A number schema, an integer or not, bounded below, above, both or neither by small literals. */
const numberSchema = (pick: Pick, integer: boolean = pick([false, true])) => {
  const base = integer ? Schema.Int : Schema.Number
  const lo = pick([Option.none(), Option.some(pick([-2, 0, 1]))])
  const hi = pick([Option.none(), Option.some(pick([2, 3, 5]))])
  const low = Option.match(lo, {
    onNone: () => base,
    onSome: value => base.check(Schema.isGreaterThanOrEqualTo(value)),
  })
  return Option.match(hi, {
    onNone: () => low,
    onSome: value => low.check(Schema.isLessThanOrEqualTo(value)),
  })
}

const compare = (pick: Pick) => pick([Expr.lt, Expr.lte, Expr.gt, Expr.gte] as const)

/** One random domain: an Entity with a status and two numbers, one rule, and one write. */
const domainOf = (seed: number) => {
  const next = random(seed)
  const pick: Pick = choices => choices[Math.floor(next() * choices.length)]!
  // An integer member moves only by integers: the write refuses anything else where it is declared.
  const integer = pick([false, true])
  const Fields = Entity.define(
    `Prop${seed}`,
    Schema.Struct({
      id: Schema.String,
      status: Schema.Literals(['a', 'b']),
      x: numberSchema(pick, integer),
      y: numberSchema(pick),
    }),
  )
  const guarded = pick([true, false])
  const bound = pick([-1, 0, 1, 3])
  const op = compare(pick)
  const relational = pick([false, false, false, true])
  const rule = Entity.invariant<typeof Fields>(
    'rule',
    ({ after }) => {
      const body = relational ? op(after.x, after.y) : op(after.x, bound)
      return guarded ? Expr.or(Expr.not(Expr.eq(after.status, 'a')), body) : body
    },
    { message: 'the rule' },
  )
  const Thing = Fields.pipe(rule)
  const A = Entity.refine(Thing, 'A', { status: 'a' })
  const amount = numberSchema(pick, integer || pick([false, true]))
  const input = Entity.input(Thing, Schema.Struct({ id: Schema.String, amount }), {
    amount: Entity.unmapped,
  })
  const from = Option.getOrUndefined(pick([Option.none(), Option.some(A)]))
  // Every write has a `when`, so one overload takes them all; `x` is never null, so the first is no condition.
  const when = pick([
    (): Predicate => Expr.isNotNull(Thing.fields.x),
    (): Predicate => compare(pick)(Thing.fields.x, pick([0, 2])),
    (value: InputExpr<number>): Predicate => compare(pick)(value, pick([0, 1, 4])),
    (value: InputExpr<number>): Predicate => compare(pick)(Thing.fields.x, value),
  ])
  const builders = {
    increment: () =>
      Write.update(input, {
        id: 'id',
        from,
        increment: { x: 'amount' },
        when: ({ input: given }) => when(given.amount),
      }),
    decrement: () =>
      Write.update(input, {
        id: 'id',
        from,
        decrement: { x: 'amount' },
        when: ({ input: given }) => when(given.amount),
      }),
    add: () =>
      Write.update(input, {
        id: 'id',
        from,
        compute: { x: ({ row, input: given }) => Expr.add(row.x, given.amount) },
        when: ({ input: given }) => when(given.amount),
      }),
    sub: () =>
      Write.update(input, {
        id: 'id',
        from,
        compute: { x: ({ row, input: given }) => Expr.sub(row.x, given.amount) },
        when: ({ input: given }) => when(given.amount),
      }),
  }
  const write: AnyWrite = builders[pick(['increment', 'decrement', 'add', 'sub'] as const)]()
  return { Thing, write, amount }
}

/** The values the grid tries for a number: every bound the generator writes, beside it, and a half. */
const grid = [-4, -2, -1, -0.5, 0, 0.5, 1, 2, 3, 5, 6]

const heldRow = (
  entity: ReturnType<typeof domainOf>['Thing'],
  row: Readonly<Record<string, unknown>>,
) => Held.rows([{ entity, rows: [row], complete: false }]).rows(entity)[0]!

/** Whether the reference judge, over the row `Write.apply` leaves, finds `before` and `amount` breaking the rule. */
const breaks = (
  domain: ReturnType<typeof domainOf>,
  before: Readonly<Record<string, unknown>>,
  amount: number,
): 'breaks' | 'keeps' | 'outside' => {
  const { Thing, write } = domain
  const fields = Thing.fields
  if (!Schema.is(fields.x.schema)(before['x']) || !Schema.is(fields.y.schema)(before['y']))
    return 'outside'
  if (!Schema.is(domain.amount)(amount)) return 'outside'
  if (Entity.judge(Thing, { after: before }, operators)._tag !== 'Valid') return 'outside'
  const given = { id: 'r', amount }
  const meets = Option.match(write.when, {
    onNone: () => true,
    onSome: body => {
      const verdict = Judge.query(body, given, heldRow(Thing, before), { operators })
      return Verdict.isTrue(verdict)
    },
  })
  if (!meets) return 'outside'
  const after = Write.apply(before, Write.bind(write, given), { operators }).row
  const judged = Entity.judge(Thing, { before, after }, operators)
  return judged._tag === 'Invalid' && judged.failures.some(failure => failure.id === 'rule')
    ? 'breaks'
    : 'keeps'
}

describe('An interval’s closed end', () => {
  const Gauge = Entity.define(
    'Gauge',
    Schema.Struct({ id: Schema.String, level: Schema.Number }),
  ).pipe(
    Entity.invariant('positive', ({ after }) => Expr.gt(after.level, 0), { message: 'positive' }),
    Entity.invariant('atLeastZero', ({ after }) => Expr.gte(after.level, 0), {
      message: 'at least zero',
    }),
  )
  const Adjust = {
    name: 'Adjust',
    write: Write.update(
      Entity.input(
        Gauge,
        Schema.Struct({
          id: Schema.String,
          level: Schema.Number.check(Schema.isBetween({ minimum: 0, maximum: 5 })),
        }),
      ),
      { id: 'id' },
    ),
  }
  const report = Laws.check({ writes: [Adjust] })
  const verdictOf = (rule: string) => report.pairs.find(pair => pair.invariant === rule)!.verdict

  it('is held: a value at 0 is not above 0, and is at least 0', () => {
    expect(verdictOf('positive')).toMatchObject({
      _tag: 'Refused',
      witness: { input: { level: 0 }, after: { level: 0 } },
    })
    expect(verdictOf('atLeastZero')).toMatchObject({ _tag: 'Kept', by: 'zone' })
  })
})

describe('The bounds pass against the reference judge', () => {
  it('never keeps a pair the grid breaks, and every witness it gives breaks the rule', () => {
    const seeds = Array.from({ length: 400 }, (_, at) => 1000 + at)
    const counts = { kept: 0, refused: 0, undecided: 0 }
    for (const seed of seeds) {
      const domain = domainOf(seed)
      const report = Laws.check({ writes: [{ name: 'W', write: domain.write }], operators })
      const pair = report.pairs.find(each => each.invariant === 'rule')!
      const verdict = pair.verdict
      if (verdict._tag === 'Undecided') {
        counts.undecided++
        continue
      }
      if (verdict._tag === 'Refused') {
        counts.refused++
        const { witness } = verdict
        const before = Option.getOrThrow(witness.before)
        const amount = witness.input['amount']
        if (typeof amount !== 'number') throw new Error(`seed ${seed}: the witness has no amount`)
        // A witness holds what the rule and the write read; any value of the rest completes it.
        const completions = (['status', 'y'] as const).reduce<
          ReadonlyArray<Readonly<Record<string, unknown>>>
        >(
          (rows, key) =>
            Object.hasOwn(before, key)
              ? rows
              : rows.flatMap(row =>
                  (key === 'status' ? ['a', 'b'] : grid).map(value => ({ ...row, [key]: value })),
                ),
          [{ id: 'r', ...before }],
        )
        expect(
          completions.some(row => breaks(domain, row, amount) === 'breaks'),
          `seed ${seed}: ${JSON.stringify(witness)}`,
        ).toBe(true)
        const after = Write.apply(before, Write.bind(domain.write, { id: 'r', amount }), {
          operators,
        }).row
        expect(after['x'], `seed ${seed}`).toBe(witness.after['x'])
        continue
      }
      counts.kept++
      for (const status of ['a', 'b'])
        for (const x of grid)
          for (const y of grid)
            for (const amount of grid)
              expect(
                breaks(domain, { id: 'r', status, x, y }, amount),
                `seed ${seed}: ${JSON.stringify({ status, x, y, amount })}`,
              ).not.toBe('breaks')
    }
    // A pass that decides nothing would pass the checks above: it must decide both ways.
    expect(counts.kept).toBeGreaterThan(40)
    expect(counts.refused).toBeGreaterThan(40)
    expect(counts.undecided).toBeGreaterThan(0)
    // About 4s here: each kept domain is checked over 2,662 rows and inputs.
  }, 60_000)
})
