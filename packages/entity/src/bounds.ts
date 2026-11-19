/**
 * The numbers half of `Laws.check` (#600): what a write does to a numeric
 * member, decided from what is declared. Each numeric member of the row before
 * and each numeric input key gets an interval: its Schema's checks, narrowed by
 * the write's `from` and `when` and by the Entity's state invariants, assumed
 * to hold of the row before (what makes a proof that each write keeps a rule a
 * proof that every row does). The write's effect is carried through the
 * intervals (a set, an increment, an assignment through operators that declare
 * a monotonic law for each argument), and the rule is judged over the result
 * in SQL's three values. Finite members are enumerated as the rest of the check
 * enumerates them, one case per combination.
 *
 * Deliberately non-relational: a `when` comparing two unknowns narrows each by
 * the other's interval and no further, so `amount <= balance` keeps nothing on
 * its own. What this pass leaves undecided is carried as data for a solver.
 * A refusal is never inferred from intervals: it is a concrete row and input,
 * checked by the reference judge.
 */
import { Data, Match, Option, Schema, SchemaAST } from 'effect'
import { Steps, finiteValues, steps, type Step } from './enumerate.js'
import { Judge, OperatorMissingError, applyOperator, type Row } from './evaluate.js'
import {
  Query,
  dependenciesOf,
  isPredicate,
  type AnyExpr,
  type CompareOperator,
  type Operandish,
  type OperatorDescriptor,
  type Predicate,
} from './expr.js'
import type { AnyEntity, EntityField } from './index.js'
import { judgeAgainst, readsBefore, type Invariant } from './invariant.js'
import { nameOf } from './memoryTable.js'
import type { MemoryOperators } from './operators.js'
import { own, put } from './record.js'
import { heldRow } from './rows.js'
import { SchemaShape } from './shape.js'
import type { AnyWrite } from './write.js'

type AnyField = EntityField<string, string, Schema.Constraint>

/** The numbers a member or an input may hold; `±Infinity` where nothing bounds it. */
interface Interval {
  readonly lo: number
  readonly loOpen: boolean
  readonly hi: number
  readonly hiOpen: boolean
}

const whole: Interval = { lo: -Infinity, loOpen: true, hi: Infinity, hiOpen: true }
const point = (value: number): Interval => ({ lo: value, loOpen: false, hi: value, hiOpen: false })
const isEmpty = (range: Interval): boolean =>
  range.lo > range.hi || (range.lo === range.hi && (range.loOpen || range.hiOpen))

const meet = (left: Interval, right: Interval): Interval => {
  const lo = Math.max(left.lo, right.lo)
  const hi = Math.min(left.hi, right.hi)
  return {
    lo,
    loOpen: (left.lo === lo && left.loOpen) || (right.lo === lo && right.loOpen),
    hi,
    hiOpen: (left.hi === hi && left.hiOpen) || (right.hi === hi && right.hiOpen),
  }
}

const hull = (left: Interval, right: Interval): Interval => {
  const lo = Math.min(left.lo, right.lo)
  const hi = Math.max(left.hi, right.hi)
  return {
    lo,
    loOpen: (left.lo !== lo || left.loOpen) && (right.lo !== lo || right.loOpen),
    hi,
    hiOpen: (left.hi !== hi || left.hiOpen) && (right.hi !== hi || right.hiOpen),
  }
}

/** The integers in `range`, closed. */
const integral = (range: Interval): Interval => ({
  lo: Number.isFinite(range.lo)
    ? range.loOpen
      ? Math.floor(range.lo) + 1
      : Math.ceil(range.lo)
    : range.lo,
  loOpen: !Number.isFinite(range.lo),
  hi: Number.isFinite(range.hi)
    ? range.hiOpen
      ? Math.ceil(range.hi) - 1
      : Math.floor(range.hi)
    : range.hi,
  hiOpen: !Number.isFinite(range.hi),
})

/** What one of Effect's number checks bounds a value to; the whole line for a check this does not read. */
const checkRange = (check: SchemaAST.Check<unknown>): Interval =>
  Match.value(check).pipe(
    Match.tagsExhaustive({
      FilterGroup: group => group.checks.map(checkRange).reduce(meet, whole),
      Filter: filter => {
        const shown = filter.annotations?.representation
        const given: unknown = shown?.payload
        const payload: Readonly<Record<string, unknown>> =
          typeof given === 'object' && given !== null
            ? Object.fromEntries(Object.entries(given))
            : {}
        const at = (key: string): number => {
          const value = own(payload, key)
          return typeof value === 'number' ? value : NaN
        }
        const bounded = (range: Interval): Interval =>
          Number.isNaN(range.lo) || Number.isNaN(range.hi) ? whole : range
        switch (shown?.id) {
          case 'effect/schema/isGreaterThan':
            return bounded({ ...whole, lo: at('exclusiveMinimum'), loOpen: true })
          case 'effect/schema/isGreaterThanOrEqualTo':
            return bounded({ ...whole, lo: at('minimum'), loOpen: false })
          case 'effect/schema/isLessThan':
            return bounded({ ...whole, hi: at('exclusiveMaximum'), hiOpen: true })
          case 'effect/schema/isLessThanOrEqualTo':
            return bounded({ ...whole, hi: at('maximum'), hiOpen: false })
          case 'effect/schema/isBetween':
            return bounded({
              lo: at('minimum'),
              loOpen: own(payload, 'exclusiveMinimum') === true,
              hi: at('maximum'),
              hiOpen: own(payload, 'exclusiveMaximum') === true,
            })
          default:
            return whole
        }
      },
    }),
  )

/** How a stored or given number is bounded: its interval, and whether it is checked to be an integer. */
interface Bound {
  readonly range: Interval
  readonly integer: boolean
}

/**
 * The bound a schema's values keep, read off its checks: none when it may hold
 * something other than a number (a null, text, an absent key). A union of
 * number literals is bounded by its least and greatest.
 */
const boundOf = (schema: Schema.Top): Option.Option<Bound> => {
  if (SchemaAST.isOptional(schema.ast)) return Option.none()
  const ast = Schema.toEncoded(schema).ast
  if (SchemaAST.isNumber(ast)) {
    const range = (ast.checks ?? []).map(checkRange).reduce(meet, whole)
    const integer = SchemaShape.holdsIntegers(ast)
    return Option.some({ range: integer ? integral(range) : range, integer })
  }
  return Option.flatMap(finiteValues(schema), values =>
    values.length > 0 && values.every(value => typeof value === 'number')
      ? Option.some({
          range: values.map(value => point(value as number)).reduce(hull),
          integer: values.every(value => Number.isInteger(value)),
        })
      : Option.none(),
  )
}

/** A value as this pass knows it: an interval over the unknowns it reads, or why it cannot say. */
type Value = Data.TaggedEnum<{
  Range: { readonly range: Interval; readonly reads: ReadonlyArray<string> }
  Opaque: { readonly reason: string }
}>
const Value = Data.taggedEnum<Value>()

/** A truth as a set of SQL's three values it may take. */
const T = 1
const F = 2
const N = 4
const ALL = T | F | N

const kleene = (
  left: number,
  right: number,
  table: (left: number, right: number) => number,
): number => {
  let out = 0
  for (const a of [T, F, N]) {
    if ((left & a) === 0) continue
    for (const b of [T, F, N]) if ((right & b) !== 0) out |= table(a, b)
  }
  return out
}
const and3 = (a: number, b: number): number => (a === F || b === F ? F : a === N || b === N ? N : T)
const or3 = (a: number, b: number): number => (a === T || b === T ? T : a === N || b === N ? N : F)
const not3 = (mask: number): number =>
  ((mask & T) !== 0 ? F : 0) | ((mask & F) !== 0 ? T : 0) | (mask & N)

/** Whether some `x` in `left` and `y` in `right` have `x < y` (`strict`) or `x <= y`. */
const someBelow = (left: Interval, right: Interval, strict: boolean): boolean =>
  left.lo < right.hi || (!strict && left.lo === right.hi && !left.loOpen && !right.hiOpen)

const compareMask = (operator: CompareOperator, left: Interval, right: Interval): number => {
  const [low, high, strict] = Match.value(operator).pipe(
    Match.when('lt', () => [left, right, true] as const),
    Match.when('lte', () => [left, right, false] as const),
    Match.when('gt', () => [right, left, true] as const),
    Match.when('gte', () => [right, left, false] as const),
    Match.exhaustive,
  )
  // `low op high` may hold, and its negation is `high op' low` with the strictness swapped.
  return (someBelow(low, high, strict) ? T : 0) | (someBelow(high, low, !strict) ? F : 0)
}

const negated = (operator: CompareOperator): CompareOperator =>
  Match.value(operator).pipe(
    Match.when('lt', (): CompareOperator => 'gte'),
    Match.when('lte', (): CompareOperator => 'gt'),
    Match.when('gt', (): CompareOperator => 'lte'),
    Match.when('gte', (): CompareOperator => 'lt'),
    Match.exhaustive,
  )

/** The interval of numbers `x` with `x op y` for some `y` in `other`. */
const sideOf = (operator: CompareOperator, other: Interval): Interval =>
  Match.value(operator).pipe(
    Match.when('lt', () => ({ ...whole, hi: other.hi, hiOpen: true })),
    Match.when('lte', () => ({ ...whole, hi: other.hi, hiOpen: other.hiOpen })),
    Match.when('gt', () => ({ ...whole, lo: other.lo, loOpen: true })),
    Match.when('gte', () => ({ ...whole, lo: other.lo, loOpen: other.loOpen })),
    Match.exhaustive,
  )

const mirrored = (operator: CompareOperator): CompareOperator =>
  Match.value(operator).pipe(
    Match.when('lt', (): CompareOperator => 'gt'),
    Match.when('lte', (): CompareOperator => 'gte'),
    Match.when('gt', (): CompareOperator => 'lt'),
    Match.when('gte', (): CompareOperator => 'lte'),
    Match.exhaustive,
  )

/** One case: the finite members as enumerated, and an interval for each numeric unknown. */
interface Case {
  readonly entity: AnyEntity
  readonly operators: MemoryOperators
  readonly step: Step
  /** `before.<key>` for a member of the row before, `input.<key>` for an input key. */
  readonly vars: Map<string, Interval>
  readonly integers: ReadonlySet<string>
  /** What each numeric member holds once the write lands. */
  readonly effects: ReadonlyMap<string, Value>
  /** The numeric members the write leaves as they were. */
  readonly kept: ReadonlySet<string>
  /** Each pair of unknowns a predicate compared, which narrowing cannot use. */
  readonly relations: Set<string>
}

/** Where an invariant's `Next` reads: the row after, or, judging an assumed invariant, the row before. */
type Side = 'after' | 'before'

const shown = (key: string): string => key.slice(key.indexOf('.') + 1)

/** The unknown an operand is, when it is one itself. */
const varOf = (operand: Operandish, at: Case, side: Side): Option.Option<string> => {
  const key = Match.value(operand).pipe(
    Match.tag('Field', ({ key: field }) => Option.some(`before.${field}`)),
    Match.tag('Next', ({ field }) =>
      side === 'before' ? Option.some(`before.${field.key}`) : Option.none<string>(),
    ),
    Match.tag('Input', ({ key: input }) => Option.some(`input.${input}`)),
    Match.orElse(() => Option.none<string>()),
  )
  return Option.filter(key, name => at.vars.has(name))
}

const known = (row: Row, key: string, missing: string): Value => {
  if (!Object.hasOwn(row, key)) return Value.Opaque({ reason: missing })
  const held = row[key]
  return typeof held === 'number' && !Number.isNaN(held)
    ? Value.Range({ range: point(held), reads: [] })
    : Value.Opaque({ reason: `${key} holds ${JSON.stringify(held)}, not a number` })
}

const ranged = (at: Case, name: string): Value =>
  Value.Range({ range: at.vars.get(name)!, reads: [name] })

const inputValue = (at: Case, key: string): Value =>
  at.vars.has(`input.${key}`)
    ? ranged(at, `input.${key}`)
    : known(at.step.input, key, `the input ${key} is not a number this pass can bound`)

/**
 * Whether a law holds of every finite number: unnarrowed, or narrowed to
 * `Schema.Finite` (as `Expr.add`'s are, since an infinity less itself is NaN).
 * Enough here: an interval's ends are run only where both are finite, and an
 * infinite end gives an infinite one.
 */
const coversFinite = (domain: Option.Option<Schema.Top>): boolean =>
  Option.match(domain, {
    onNone: () => true,
    onSome: schema => {
      const ast = Schema.toType(schema).ast
      return (
        SchemaAST.isNumber(ast) &&
        (ast.checks ?? []).every(
          check =>
            check._tag === 'Filter' &&
            check.annotations?.representation?.id === 'effect/schema/isFinite',
        )
      )
    },
  })

/** An operator's result over intervals, from the monotonic law it declares for each argument. */
const monotone = (
  call: { readonly operator: OperatorDescriptor; readonly args: ReadonlyArray<Operandish> },
  at: Case,
  side: Side,
): Value => {
  const { operator, args } = call
  const name = nameOf(operator)
  if (Option.isNone(at.operators.get(operator)))
    return Value.Opaque({ reason: `${name} is not in the operator table` })
  const directions: Array<'increasing' | 'decreasing'> = []
  for (let position = 0; position < args.length; position++) {
    const law = operator.laws.find(
      each => each._tag === 'Monotonic' && each.position === position && coversFinite(each.domain),
    )
    if (law === undefined || law._tag !== 'Monotonic')
      return Value.Opaque({
        reason: `${name} declares no monotonic law for its argument ${position + 1}, so its effect on a number is not known`,
      })
    directions.push(law.direction)
  }
  const values: Array<{ readonly range: Interval; readonly reads: ReadonlyArray<string> }> = []
  for (const arg of args) {
    const value = isPredicate(arg)
      ? Value.Opaque({ reason: `${name} is given a predicate` })
      : valueOf(arg, at, side)
    if (Value.$is('Opaque')(value)) return value
    values.push(value)
  }
  // The least result takes each argument's end its law moves the result down from.
  const end = (lowest: boolean): number => {
    const ends = values.map(({ range }, at) =>
      (directions[at] === 'increasing') === lowest ? range.lo : range.hi,
    )
    if (ends.some(each => !Number.isFinite(each))) return lowest ? -Infinity : Infinity
    try {
      const result = applyOperator(operator, ends, {
        collation: Option.none(),
        operators: at.operators,
      })
      return typeof result === 'number' && !Number.isNaN(result) ? result : NaN
    } catch {
      return NaN
    }
  }
  const lo = end(true)
  const hi = end(false)
  if (Number.isNaN(lo) || Number.isNaN(hi))
    return Value.Opaque({ reason: `${name} answered no number at the ends of its arguments` })
  return Value.Range({
    range: { lo, loOpen: !Number.isFinite(lo), hi, hiOpen: !Number.isFinite(hi) },
    reads: [...new Set(values.flatMap(value => value.reads))],
  })
}

/** What an expression comes to over a case. */
const valueOf = (expr: AnyExpr, at: Case, side: Side): Value =>
  Match.value(expr).pipe(
    Match.tagsExhaustive({
      Literal: ({ value }) =>
        typeof value === 'number' && !Number.isNaN(value)
          ? Value.Range({ range: point(value), reads: [] })
          : Value.Opaque({ reason: `${JSON.stringify(value)} is not a number` }),
      Field: ({ key }) =>
        at.vars.has(`before.${key}`)
          ? ranged(at, `before.${key}`)
          : known(at.step.before, key, `${key} is not known before the write`),
      Next: ({ field }) => {
        if (side === 'before')
          return at.vars.has(`before.${field.key}`)
            ? ranged(at, `before.${field.key}`)
            : known(at.step.before, field.key, `${field.key} is not known before the write`)
        const effect = at.effects.get(field.key)
        return effect !== undefined
          ? effect
          : known(at.step.after, field.key, `${field.key} is not known after the write`)
      },
      Input: ({ key }) => inputValue(at, key),
      Call: call =>
        Option.match(call.expansion, {
          onSome: expansion => valueOf(expansion, at, side),
          onNone: () => monotone(call, at, side),
        }),
      Viewer: () => Value.Opaque({ reason: 'it reads the viewer' }),
      Now: () => Value.Opaque({ reason: 'it reads the time' }),
      Path: () => Value.Opaque({ reason: 'it reads another row through a path' }),
      ViewerPath: () => Value.Opaque({ reason: 'it reads the viewer’s row' }),
    }),
  )

/** The unknown an operand is exactly: one itself, or a member after a write that leaves it. */
const identityOf = (operand: Operandish, at: Case, side: Side): Option.Option<string> =>
  Match.value(operand).pipe(
    Match.tag('Next', ({ field }) =>
      side === 'after' && at.kept.has(field.key)
        ? Option.some(`before.${field.key}`)
        : varOf(operand, at, side),
    ),
    Match.orElse(() => varOf(operand, at, side)),
  )

const sameUnknown = (left: Operandish, right: Operandish, at: Case, side: Side): boolean => {
  const l = identityOf(left, at, side)
  return Option.isSome(l) && Option.contains(identityOf(right, at, side), l.value)
}

/** Whether a predicate reads an unknown of the case, which only the intervals can judge. */
const readsUnknown = (predicate: Predicate, at: Case, side: Side): boolean => {
  const read = dependenciesOf(predicate)
  return (
    read.fields.some(field => at.vars.has(`before.${field.key}`)) ||
    read.next.some(field =>
      side === 'before' ? at.vars.has(`before.${field.key}`) : at.effects.has(field.key),
    ) ||
    read.inputs.some(key => at.vars.has(`input.${key}`))
  )
}

/** A predicate reading no unknown, judged by the reference judge over the case's rows: none it could not. */
const judged = (predicate: Predicate, at: Case, side: Side): number => {
  try {
    const verdict = Judge.predicate(predicate, heldRow(at.entity, at.step.before), {
      next: heldRow(at.entity, side === 'before' ? at.step.before : at.step.after),
      input: at.step.input,
      operators: at.operators,
    })
    return Judge.match(verdict, {
      onKnown: truth => (truth === true ? T : truth === false ? F : N),
      onUnknown: () => ALL,
    })
  } catch (error) {
    if (error instanceof OperatorMissingError) return ALL
    throw error
  }
}

/** The values of SQL's three a predicate may take over the case. */
const truthOf = (predicate: Predicate, at: Case, side: Side): number => {
  if (!readsUnknown(predicate, at, side)) return judged(predicate, at, side)
  return Match.value(predicate).pipe(
    Match.tagsExhaustive({
      And: ({ operands }) =>
        operands.map(each => truthOf(each, at, side)).reduce((a, b) => kleene(a, b, and3)),
      Or: ({ operands }) =>
        operands.map(each => truthOf(each, at, side)).reduce((a, b) => kleene(a, b, or3)),
      Not: ({ operand }) => not3(truthOf(operand, at, side)),
      Compare: ({ operator, left, right }) => {
        // One unknown against itself (`after.sold >= before.sold` over a write leaving it).
        if (sameUnknown(left, right, at, side))
          return operator === 'lte' || operator === 'gte' ? T : F
        const l = valueOf(left, at, side)
        const r = valueOf(right, at, side)
        return Value.$is('Range')(l) && Value.$is('Range')(r)
          ? compareMask(operator, l.range, r.range)
          : ALL
      },
      Eq: ({ left, right }) => {
        if (isPredicate(left) || isPredicate(right)) return ALL
        if (sameUnknown(left, right, at, side)) return T
        const l = valueOf(left, at, side)
        const r = valueOf(right, at, side)
        if (!Value.$is('Range')(l) || !Value.$is('Range')(r)) return ALL
        const same =
          l.range.lo === l.range.hi && r.range.lo === r.range.hi && l.range.lo === r.range.lo
        return (isEmpty(meet(l.range, r.range)) ? 0 : T) | (same ? 0 : F)
      },
      Null: ({ operand, present }) =>
        Value.$is('Range')(valueOf(operand, at, side)) ? (present ? T : F) : ALL,
      Test: ({ expansion }) =>
        Option.match(expansion, {
          onSome: inner => truthOf(inner, at, side),
          onNone: () => ALL,
        }),
      Exists: () => ALL,
      Contains: () => ALL,
      In: () => ALL,
    }),
  )
}

/** Intervals some unknowns must lie in, or that none can: where a predicate takes the truth asked. */
type Region = ReadonlyMap<string, Interval> | 'empty'

const intersect = (regions: ReadonlyArray<Region>): Region => {
  const out = new Map<string, Interval>()
  for (const region of regions) {
    if (region === 'empty') return 'empty'
    for (const [key, range] of region) {
      const met = meet(out.get(key) ?? whole, range)
      if (isEmpty(met)) return 'empty'
      out.set(key, met)
    }
  }
  return out
}

const union = (regions: ReadonlyArray<Region>): Region => {
  const held = regions.filter(
    (region): region is ReadonlyMap<string, Interval> => region !== 'empty',
  )
  if (held.length === 0) return 'empty'
  const out = new Map<string, Interval>()
  for (const [key, range] of held[0]!) {
    if (held.every(region => region.has(key)))
      out.set(key, held.map(region => region.get(key)!).reduce(hull, range))
  }
  return out
}

/**
 * A region holding every case of the unknowns where `predicate` is `want`
 * (true, or false). Over-approximate: a comparison of two unknowns narrows
 * each by the other's interval, and what this pass cannot read narrows nothing.
 */
const regionOf = (predicate: Predicate, at: Case, side: Side, want: boolean): Region => {
  if (!readsUnknown(predicate, at, side))
    return (judged(predicate, at, side) & (want ? T : F)) !== 0 ? new Map() : 'empty'
  return Match.value(predicate).pipe(
    Match.tagsExhaustive({
      And: ({ operands }) =>
        (want ? intersect : union)(operands.map(each => regionOf(each, at, side, want))),
      Or: ({ operands }) =>
        (want ? union : intersect)(operands.map(each => regionOf(each, at, side, want))),
      Not: ({ operand }) => regionOf(operand, at, side, !want),
      Compare: ({ operator, left, right }): Region => {
        const op = want ? operator : negated(operator)
        const l = valueOf(left, at, side)
        const r = valueOf(right, at, side)
        const out = new Map<string, Interval>()
        const lv = varOf(left, at, side)
        const rv = varOf(right, at, side)
        if (Option.isSome(lv) && Value.$is('Range')(r)) out.set(lv.value, sideOf(op, r.range))
        if (Option.isSome(rv) && Value.$is('Range')(l))
          out.set(rv.value, sideOf(mirrored(op), l.range))
        // Two unknowns compared: each is narrowed by the other's interval, and the relation is noted.
        const reads = [l, r].flatMap(value => (Value.$is('Range')(value) ? value.reads : []))
        if (new Set(reads).size > 1) at.relations.add([...new Set(reads)].map(shown).join(' with '))
        return intersect([out])
      },
      Eq: ({ left, right }): Region => {
        if (!want || isPredicate(left) || isPredicate(right)) return new Map()
        const l = valueOf(left, at, side)
        const r = valueOf(right, at, side)
        const out = new Map<string, Interval>()
        const lv = varOf(left, at, side)
        const rv = varOf(right, at, side)
        if (Option.isSome(lv) && Value.$is('Range')(r)) out.set(lv.value, r.range)
        if (Option.isSome(rv) && Value.$is('Range')(l)) out.set(rv.value, l.range)
        return intersect([out])
      },
      Null: ({ operand, present }): Region =>
        Value.$is('Range')(valueOf(operand, at, side)) && present !== want ? 'empty' : new Map(),
      Test: ({ expansion }): Region =>
        Option.match(expansion, {
          onSome: inner => regionOf(inner, at, side, want),
          onNone: () => new Map(),
        }),
      Exists: (): Region => new Map(),
      Contains: (): Region => new Map(),
      In: (): Region => new Map(),
    }),
  )
}

/** Narrows the case's unknowns to `region`; false when none is left. */
const narrow = (at: Case, region: Region): boolean => {
  if (region === 'empty') return false
  for (const [key, range] of region) {
    const current = at.vars.get(key)
    if (current === undefined) continue
    const met = meet(current, range)
    const next = at.integers.has(key) ? integral(met) : met
    if (isEmpty(next)) return false
    at.vars.set(key, next)
  }
  return true
}

/** How a write changes one member, as this pass reads it; why not, for the rest. */
type Change = Data.TaggedEnum<{
  Keep: {}
  Set: { readonly key: string }
  /** Moved by an input amount: added, or taken away (`down`, a decrement). */
  Increment: { readonly key: string; readonly down: boolean }
  Compute: { readonly expr: AnyExpr }
  Other: { readonly reason: string }
}>
const Change = Data.taggedEnum<Change>()

const effectOf = (write: AnyWrite, key: string): Change => {
  const set = write.sets.find(each => each.field.key === key)
  if (set !== undefined) return Change.Set({ key: set.key })
  const increment = write.increments.find(each => each.field.key === key)
  if (increment !== undefined)
    return Change.Increment({ key: increment.key, down: increment.direction === 'decrement' })
  const assignment = write.assignments.find(each => each.field.key === key)
  if (assignment !== undefined) return Change.Compute({ expr: assignment.expr })
  if (write.links.some(each => each.relation.key === key))
    return Change.Other({ reason: `${key} is linked to another row` })
  if (write.context.some(each => each.member.key === key))
    return Change.Other({ reason: `${key} is set by the write's context` })
  if (write.expect?.field.key === key)
    return Change.Other({ reason: `${key} is the revision it expects, moved on where it lands` })
  return Match.valueTags(write, {
    Insert: () =>
      Change.Other({ reason: `${key} is not written by the insert, so the store decides it` }),
    Update: () => Change.Keep(),
    Delete: () => Change.Keep(),
  })
}

/** A row before, an input and the row after, concrete, that break a rule: what a refusal shows. */
export interface Witness {
  /** The row before the write, encoded as stored; none for a create. */
  readonly before: Option.Option<Row>
  readonly input: Row
  readonly after: Row
  /** The rule it breaks: its id, what it says, and the members a form shows it beside. */
  readonly invariant: string
  readonly message: string
  readonly path: ReadonlyArray<string>
}

/** The witness one enumerated step makes. */
export const witnessOf = (write: AnyWrite, held: Invariant, step: Step): Witness => ({
  before: Match.valueTags(write, {
    Insert: () => Option.none(),
    Update: () => Option.some(step.before),
    Delete: () => Option.some(step.before),
  }),
  input: step.input,
  after: step.after,
  invariant: held.id,
  message: held.message,
  path: held.path,
})

/** What this pass comes to for one write and one rule. */
export type Bounded = Data.TaggedEnum<{
  /**
   * Every case keeps it: `vacuous` where the rule holds whatever the unknowns
   * are (a write leaving the row where the rule does not bind), `bounds` where
   * the intervals decide it. `over`: the unknowns it holds over.
   */
  Kept: {
    readonly by: 'vacuous' | 'bounds'
    readonly rows: number
    readonly over: ReadonlyArray<string>
  }
  Refused: { readonly witness: Witness }
  /** Some case neither: why, and the cases (finite members' values) left. */
  Undecided: { readonly reason: string; readonly cases: ReadonlyArray<Step> }
}>
export const Bounded = Data.taggedEnum<Bounded>()

/** How the members a pair reads are known: enumerated, bounded, or neither (and why). */
interface Members {
  readonly finite: ReadonlyArray<string>
  readonly numeric: ReadonlyMap<string, Change>
  readonly other: ReadonlyMap<string, string>
}

/** Splits `keys` (and what the write's `when` and effects, and the invariants touching them, read) by how they can be known. */
const membersOf = (
  write: AnyWrite,
  keys: ReadonlyArray<string>,
  assumed: ReadonlyArray<Invariant>,
): Members => {
  const fields = write.input.entity.fields as Readonly<Record<string, AnyField>>
  const read = new Set(keys)
  if (write._tag !== 'Insert') {
    Option.map(write.when, body =>
      Query.dependencies(body).predicate.forEach(field => read.add(field.key)),
    )
    write.increments.forEach(each => read.add(each.field.key))
    write.assignments.forEach(each =>
      dependenciesOf(each.expr).fields.forEach(field => read.add(field.key)),
    )
    // An assumed invariant over a member read here bounds it, and may bound the members beside it.
    for (let grown = true; grown;) {
      grown = false
      for (const held of assumed) {
        if (!held.after.some(key => read.has(key))) continue
        for (const key of held.after)
          if (!read.has(key)) {
            read.add(key)
            grown = true
          }
      }
    }
  }
  const finite: Array<string> = []
  const numeric = new Map<string, Change>()
  const other = new Map<string, string>()
  for (const key of read) {
    const field = own(fields, key)
    if (field === undefined) {
      other.set(key, `${key} is a link, not a field`)
      continue
    }
    const effect = effectOf(write, key)
    if (Change.$is('Other')(effect)) {
      other.set(key, effect.reason)
      continue
    }
    const schema = field.schema as unknown as Schema.Top
    if (
      Option.isSome(finiteValues(schema)) &&
      !Change.$is('Increment')(effect) &&
      !Change.$is('Compute')(effect)
    )
      finite.push(key)
    else if (Option.isSome(boundOf(schema)) && SchemaAST.isNumber(Schema.toEncoded(schema).ast))
      numeric.set(key, effect)
    else other.set(key, `${key} is neither finite nor a number this pass can bound`)
  }
  return { finite, numeric, other }
}

/** The input keys a write reads as numbers, each with its bound; why not, for one it cannot bound. */
const inputBounds = (
  write: AnyWrite,
  members: Members,
): {
  readonly bounds: ReadonlyMap<string, Bound>
  readonly unbounded: ReadonlyMap<string, string>
} => {
  const keys = new Set<string>()
  for (const effect of members.numeric.values())
    Change.$match(effect, {
      Keep: () => undefined,
      Set: ({ key }) => void keys.add(key),
      Increment: ({ key }) => void keys.add(key),
      Compute: ({ expr }) => dependenciesOf(expr).inputs.forEach(key => keys.add(key)),
      Other: () => undefined,
    })
  if (write._tag !== 'Insert')
    Option.map(write.when, body => Query.dependencies(body).inputs.forEach(key => keys.add(key)))
  const bounds = new Map<string, Bound>()
  const unbounded = new Map<string, string>()
  for (const key of keys) {
    const schema = write.input.schema.fields[key] as unknown as Schema.Top | undefined
    if (schema === undefined) continue
    Option.match(boundOf(schema), {
      onSome: bound => bounds.set(key, bound),
      onNone: () =>
        // A finite input of another kind is enumerated with the case.
        Option.isSome(finiteValues(schema))
          ? undefined
          : unbounded.set(key, `the input ${key} may be absent or is not a number`),
    })
  }
  return { bounds, unbounded }
}

/** The numeric unknowns of one case, narrowed by the `when` and the assumed invariants; none when no row meets them. */
const caseOf = (
  write: AnyWrite,
  step: Step,
  members: Members,
  inputs: ReadonlyMap<string, Bound>,
  assumed: ReadonlyArray<Invariant>,
  operators: MemoryOperators,
): Option.Option<Case> => {
  const entity = write.input.entity
  const fields = entity.fields as Readonly<Record<string, AnyField>>
  const vars = new Map<string, Interval>()
  const integers = new Set<string>()
  if (write._tag !== 'Insert')
    for (const key of members.numeric.keys()) {
      const bound = Option.getOrThrow(boundOf(fields[key]!.schema as unknown as Schema.Top))
      vars.set(`before.${key}`, bound.range)
      if (bound.integer) integers.add(`before.${key}`)
    }
  for (const [key, bound] of inputs) {
    vars.set(`input.${key}`, bound.range)
    if (bound.integer) integers.add(`input.${key}`)
  }
  const at: Case = {
    entity,
    operators,
    step,
    vars,
    integers,
    effects: new Map(),
    kept: new Set(
      Match.valueTags(write, {
        Insert: () => [],
        Update: () =>
          [...members.numeric]
            .filter(([, change]) => Change.$is('Keep')(change))
            .map(([key]) => key),
        Delete: () => [],
      }),
    ),
    relations: new Set(),
  }
  if ([...vars.values()].some(isEmpty)) return Option.none()
  if (write._tag !== 'Insert') {
    const conditions = Option.match(write.when, { onNone: () => [], onSome: body => body.where })
    // Twice, so a bound one comparison gives an unknown reaches the comparisons before it.
    for (let pass = 0; pass < 2; pass++) {
      for (const condition of conditions)
        if (!narrow(at, regionOf(condition, at, 'after', true))) return Option.none()
      for (const held of assumed)
        if (!narrow(at, regionOf(held.predicate, at, 'before', true))) return Option.none()
    }
  }
  const effects = new Map<string, Value>()
  for (const [key, effect] of members.numeric) {
    effects.set(
      key,
      Change.$match(effect, {
        Keep: () => ranged(at, `before.${key}`),
        Set: ({ key: input }) => inputValue(at, input),
        Increment: ({ key: input, down }) => {
          const given = at.vars.get(`input.${input}`)
          if (given === undefined)
            return Value.Opaque({
              reason: `the amount ${input} is not a number this pass can bound`,
            })
          // A decrement adds the amount negated, as `Write.bind` carries it.
          const amount = down
            ? { lo: -given.hi, loOpen: given.hiOpen, hi: -given.lo, hiOpen: given.loOpen }
            : given
          const held = at.vars.get(`before.${key}`)!
          return Value.Range({
            range: {
              lo: held.lo + amount.lo,
              loOpen: held.loOpen || amount.loOpen,
              hi: held.hi + amount.hi,
              hiOpen: held.hiOpen || amount.hiOpen,
            },
            reads: [`before.${key}`, `input.${input}`],
          })
        },
        Compute: ({ expr }) => valueOf(expr, at, 'after'),
        Other: ({ reason }) => Value.Opaque({ reason }),
      }),
    )
  }
  return Option.some({ ...at, effects })
}

/** A few values of `range` to try: 0, its ends, and the values beside them, where it holds them. */
const candidates = (range: Interval, integer: boolean): ReadonlyArray<number> => {
  const raw = [0, range.lo, range.hi, 1, -1, range.lo + 1, range.hi - 1]
  if (Number.isFinite(range.lo) && Number.isFinite(range.hi)) raw.push((range.lo + range.hi) / 2)
  const inside = raw.filter(
    value =>
      Number.isFinite(value) &&
      (!integer || Number.isInteger(value)) &&
      !isEmpty(meet(range, point(value))),
  )
  return [...new Set(inside)].slice(0, 5)
}

/** What a computed assignment comes to over concrete rows, by the reference operators. */
const concrete = (
  expr: AnyExpr,
  before: Row,
  input: Row,
  operators: MemoryOperators,
): Option.Option<unknown> =>
  Match.value(expr).pipe(
    Match.tags({
      Literal: ({ value }) => Option.some<unknown>(value),
      Field: ({ key }) => (Object.hasOwn(before, key) ? Option.some(before[key]) : Option.none()),
      Input: ({ key }) => (Object.hasOwn(input, key) ? Option.some(input[key]) : Option.none()),
      Call: call =>
        Option.match(call.expansion, {
          onSome: inner => concrete(inner, before, input, operators),
          onNone: () =>
            Option.flatMap(
              Option.all(
                call.args.map(arg =>
                  isPredicate(arg) ? Option.none() : concrete(arg, before, input, operators),
                ),
              ),
              values => {
                try {
                  return Option.some(
                    applyOperator(call.operator, values, { collation: call.collation, operators }),
                  )
                } catch {
                  return Option.none()
                }
              },
            ),
        }),
    }),
    Match.orElse(() => Option.none()),
  )

/**
 * The smallest concrete row and input of a case that break `held`, checked by
 * the reference judge: within every Schema, meeting the `when`, every assumed
 * invariant it holds the members of keeping it, and the rule refusing the row
 * after. None where the few tried do not.
 */
const search = (
  write: AnyWrite,
  held: Invariant,
  at: Case,
  members: Members,
  assumed: ReadonlyArray<Invariant>,
): Option.Option<Witness> => {
  const entity = write.input.entity
  const fields = entity.fields as Readonly<Record<string, AnyField>>
  const names = [...at.vars.keys()]
  const choices = names.map(name => candidates(at.vars.get(name)!, at.integers.has(name)))
  if (choices.some(each => each.length === 0)) return Option.none()
  // Every combination, the nearest to 0 first.
  const combos: Array<ReadonlyArray<number>> = [[]]
  for (const values of choices) {
    const grown = combos.flatMap(combo => values.map(value => [...combo, value]))
    if (grown.length > 2048) return Option.none()
    combos.splice(0, combos.length, ...grown)
  }
  combos.sort(
    (a, b) =>
      a.reduce((sum, value) => sum + Math.abs(value), 0) -
      b.reduce((sum, value) => sum + Math.abs(value), 0),
  )
  const insert = write._tag === 'Insert'
  for (const combo of combos) {
    const before: Record<string, unknown> = { ...at.step.before }
    const input: Record<string, unknown> = { ...at.step.input }
    names.forEach((name, index) => {
      const key = shown(name)
      put(name.startsWith('before.') ? before : input, key, combo[index])
    })
    const inSchema = names.every((name, index) => {
      const key = shown(name)
      const schema = name.startsWith('before.')
        ? (fields[key]!.schema as unknown as Schema.Top)
        : (write.input.schema.fields[key] as unknown as Schema.Top)
      return Schema.is(Schema.toEncoded(schema) as Schema.Codec<unknown>)(combo[index])
    })
    if (!inSchema) continue
    const after: Record<string, unknown> = insert
      ? { ...at.step.after }
      : { ...before, ...at.step.after }
    let computed = true
    for (const [key, effect] of members.numeric) {
      const value = Change.$match(effect, {
        Keep: () => Option.some<unknown>(before[key]),
        Set: ({ key: from }) =>
          Object.hasOwn(input, from) ? Option.some(input[from]) : Option.none(),
        Increment: ({ key: from, down }) => {
          const held = before[key]
          const amount = input[from]
          return typeof held === 'number' && typeof amount === 'number'
            ? Option.some<unknown>(held + (down ? 0 - amount : amount))
            : Option.none()
        },
        Compute: ({ expr }) => concrete(expr, before, input, at.operators),
        Other: () => Option.none(),
      })
      // A member the rule does not read need not be worked out (an operator the table lacks).
      if (Option.isSome(value)) put(after, key, value.value)
      else if (held.after.includes(key)) computed = false
      else delete after[key]
    }
    if (!computed) continue
    if (!insert) {
      const meets = Option.match(write.when, {
        onNone: () => true,
        onSome: body => {
          const verdict = Judge.query(body, input, heldRow(entity, before), {
            operators: at.operators,
          })
          return verdict._tag === 'Known' && verdict.truth
        },
      })
      if (!meets) continue
      const allowed = assumed.every(other => {
        const holds = other.after.filter(key => Object.hasOwn(before, key))
        // One reading none of what the witness holds stands apart from it.
        if (holds.length === 0) return true
        if (holds.length < other.after.length) return false
        return judgeAgainst([other], { after: before }, at.operators)._tag === 'Valid'
      })
      if (!allowed) continue
    }
    const judgedAfter = judgeAgainst([held], insert ? { after } : { before, after }, at.operators)
    if (judgedAfter._tag !== 'Invalid') continue
    return Option.some({
      before: insert ? Option.none() : Option.some(before),
      input,
      after,
      invariant: held.id,
      message: held.message,
      path: held.path,
    })
  }
  return Option.none()
}

/** Why a case is left undecided: what was opaque, what was related, or what nothing bounds. */
const reasonOf = (held: Invariant, at: Case, members: Members): string => {
  const opaque = new Set<string>()
  const unbounded = new Set<string>()
  const visit = (value: Value) =>
    Value.$match(value, {
      Opaque: ({ reason }) => void opaque.add(reason),
      Range: ({ reads }) =>
        reads.forEach(name => {
          const range = at.vars.get(name)!
          const what = name.startsWith('input.') ? `the input ${shown(name)}` : shown(name)
          if (range.lo === -Infinity) unbounded.add(`${what} has no lower bound`)
          if (range.hi === Infinity) unbounded.add(`${what} has no upper bound`)
        }),
    })
  for (const key of [...held.after, ...held.before]) {
    const reason = members.other.get(key)
    if (reason !== undefined) opaque.add(reason)
  }
  held.after.forEach(key => {
    const effect = at.effects.get(key)
    if (effect !== undefined) visit(effect)
  })
  held.before.forEach(key => {
    if (at.vars.has(`before.${key}`)) visit(ranged(at, `before.${key}`))
  })
  if (opaque.size > 0) return [...opaque].join('; ')
  if (at.relations.size > 0)
    return `it rests on comparing ${[...at.relations].join(' and ')}, which intervals alone cannot use`
  if (unbounded.size > 0)
    return `${[...unbounded].join(', ')}: a check on the input, a when or an invariant could bound it`
  return 'the intervals do not decide it'
}

/**
 * One write against one rule, past enumeration: each case of the finite
 * members, judged in three values with the numbers unknown, then over their
 * intervals, then, where neither decides, searched for a concrete witness.
 */
export const judgeBounded = (
  write: AnyWrite,
  held: Invariant,
  invariants: ReadonlyArray<Invariant>,
  operators: MemoryOperators,
): Bounded => {
  const assumed = Match.valueTags(write, {
    Insert: () => [],
    Update: () => invariants.filter(each => !readsBefore(each)),
    Delete: () => invariants.filter(each => !readsBefore(each)),
  })
  const members = membersOf(write, [...new Set([...held.before, ...held.after])], assumed)
  const inputs = inputBounds(write, members)
  const listed = steps(write, members.finite, { operators })
  if (Steps.$is('Undecided')(listed)) return Bounded.Undecided({ reason: listed.reason, cases: [] })
  const over = new Set<string>()
  let byBounds = false
  const left: Array<Step> = []
  let reason = Option.none<string>()
  for (const step of listed.steps) {
    const at = caseOf(write, step, members, inputs.bounds, assumed, operators)
    // No row the rules allow meets the write here, which only the intervals can tell.
    if (Option.isNone(at)) {
      byBounds = true
      continue
    }
    const current = at.value
    if (truthOf(held.predicate, current, 'after') === T) {
      held.after.filter(key => !Object.hasOwn(step.after, key)).forEach(key => over.add(key))
      held.before.filter(key => !Object.hasOwn(step.before, key)).forEach(key => over.add(key))
      // Judged with every unknown unheld, it is the three-valued judge's, not the intervals'.
      if (judged(held.predicate, current, 'after') !== T) byBounds = true
      continue
    }
    const witness = search(write, held, current, members, assumed)
    if (Option.isSome(witness)) return Bounded.Refused({ witness: witness.value })
    left.push(step)
    if (Option.isNone(reason)) {
      const unread = [...inputs.unbounded.values()]
      reason = Option.some(unread.length > 0 ? unread.join('; ') : reasonOf(held, current, members))
    }
  }
  if (left.length > 0)
    return Bounded.Undecided({
      reason: Option.getOrElse(reason, () => 'the intervals do not decide it'),
      cases: left,
    })
  return Bounded.Kept({
    by: byBounds ? 'bounds' : 'vacuous',
    rows: listed.steps.length,
    over: [...over],
  })
}

/**
 * Whether some row the Entity's state invariants allow, and some input, meet
 * a write's `from` and `when`. False only when no case of its finite members
 * does, and the numbers they read leave no interval: a write nothing can
 * start. True where this pass cannot tell.
 */
export const meetable = (
  write: AnyWrite,
  invariants: ReadonlyArray<Invariant>,
  operators: MemoryOperators,
): boolean => {
  if (write._tag === 'Insert' || Option.isNone(write.when)) return true
  const assumed = invariants.filter(each => !readsBefore(each))
  const members = membersOf(write, [], assumed)
  const inputs = inputBounds(write, members)
  const listed = steps(write, members.finite, { operators })
  return Steps.$match(listed, {
    Undecided: () => true,
    Steps: ({ steps: each }) =>
      each.some(step =>
        Option.isSome(caseOf(write, step, members, inputs.bounds, assumed, operators)),
      ),
  })
}
