/**
 * One check per pair of ways of writing `writeProperties` lists as commuting
 * on one path: two writes that meet its condition, run in both orders over
 * seeded states, give one state, or are refused alike. A pair whose check
 * fails must not be listed. A way that lists `idempotent` has one more: a
 * write that meets its condition, run twice, leaves what once leaves.
 */
import { Result, Schema } from 'effect'
import type { Each } from './ops/arr.js'
import * as Bool from './ops/bool.js'
import * as Num from './ops/num.js'
import * as Operation from './operation.js'
import type {
  CommuteCondition,
  IdempotentCondition,
  WayOfWriting,
  WriteProperties,
} from './properties.js'
import * as Transition from './transition.js'

// A test reads `c`, which no write sets, so a removal and a patch meet the condition.
const Entry = Schema.Struct({
  id: Schema.String,
  a: Schema.Boolean,
  b: Schema.Int,
  c: Schema.Boolean,
})
const SmallInt = Schema.Int.check(Schema.isBetween({ minimum: -50, maximum: 50 }))
const State = Schema.Struct({
  n: SmallInt,
  tag: Schema.String,
  list: Schema.Array(Entry),
  set: Schema.Array(Schema.String),
})
type State = typeof State.Type
const None = Schema.Struct({})

const maxOp = Operation.define({
  id: 'check.max',
  version: 1,
  args: [SmallInt, SmallInt],
  returns: SmallInt,
  nulls: 'strict',
  claims: { commutative: true, associative: true, idempotent: true },
})

const combineImpls = Operation.implementations(
  'writeChecks',
  Operation.implement(maxOp, (a, b) => (a > b ? a : b)),
)

type Write = Transition.Transition<State, {}, never, Transition.NoSupplied>

const write = (
  apply: (
    state: Transition.TransitionPaths<State, {}, {}>['state'],
  ) => Transition.WriteEquation<State, {}, unknown>,
): Write => Transition.make({ state: State, input: None, apply: ({ state }) => [apply(state)] })

/**
 * Writes of one way, each a pair the condition holds of: two values for
 * `same-literal` alike, two that differ for `different-literals`, fields
 * apart for `disjoint-fields`, and a removal that reads no field the patch
 * sets for `reads-no-set-field`.
 */
const writesOf = (
  way: WayOfWriting,
  condition: CommuteCondition | IdempotentCondition,
  other: boolean,
): ReadonlyArray<Write> => {
  const literals = ((): ReadonlyArray<string> => {
    if (condition === 'same-literal') return ['x']
    if (condition === 'different-literals') return [other ? 'y' : 'x']
    return ['x', 'y']
  })()
  // What a patch sets: fields apart where the condition asks it; otherwise
  // each field, and one set from the other.
  type Sets = 'a' | 'b' | 'a from b' | 'b to 4'
  // `sets-unread`: nothing a patch sets is read by what it sets.
  const fields: ReadonlyArray<Sets> =
    condition === 'disjoint-fields'
      ? [other ? 'a' : 'b']
      : condition === 'sets-unread'
        ? ['a from b', 'b to 4']
        : ['a', 'b', 'a from b']
  const setOf = (sets: Sets, each: Each<typeof Entry.Type>) => {
    if (sets === 'b') return { b: Num.add(each.b, 1) }
    if (sets === 'b to 4') return { b: 4 }
    return { a: sets === 'a' ? Bool.not(each.a) : Num.gt(each.b, 0) }
  }
  switch (way) {
    case 'set':
      return literals.map(value => write(state => Transition.set(state.tag, value)))
    case 'add':
      return [-3, 0, 7].map(amount => write(state => Transition.add(state.n, amount)))
    case 'combine':
      return [-3, 0, 7].map(value => write(state => Transition.combine(state.n, maxOp, value)))
    case 'append':
      return literals.map(id =>
        write(state => Transition.append(state.list, { id, a: true, b: 1, c: true })),
      )
    case 'insert':
      return [...literals, '\0'].map(id =>
        write(state => Transition.insert(state.list, { id, a: true, b: 1, c: true })),
      )
    case 'remove':
      return ['p', 'q'].map(id => write(state => Transition.remove(state.list, id)))
    case 'removeWhere':
      return [write(state => Transition.removeWhere(state.list, each => each.c))]
    case 'patch':
      return fields.map(sets =>
        write(state => Transition.patch(state.list, 'p', each => setOf(sets, each))),
      )
    case 'patchWhere':
      return fields.map(sets =>
        write(state =>
          Transition.patchWhere(
            state.list,
            each => each.c,
            each => setOf(sets, each),
          ),
        ),
      )
    case 'include':
      return literals.map(value => write(state => Transition.include(state.set, value)))
    case 'exclude':
      return literals.map(value => write(state => Transition.exclude(state.set, value)))
  }
}

/** mulberry32: the states are the same on every run. */
const seeded = (seed: number) => () => {
  seed = (seed + 0x6d2b79f5) | 0
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296
}

const states: ReadonlyArray<State> = (() => {
  const random = seeded(419)
  const pick = <A>(pool: ReadonlyArray<A>): A => pool[Math.floor(random() * pool.length)]!
  return Array.from({ length: 60 }, () => ({
    n: pick([-50, -4, 0, 3, 46, 50]),
    tag: pick(['x', 'y', 'z']),
    list: Array.from({ length: pick([0, 1, 2, 3]) }, () => ({
      id: pick(['p', 'q', 'x', 'y']),
      a: pick([true, false]),
      b: pick([-2, 0, 5]),
      c: pick([true, false]),
    })),
    set: pick([[], ['x'], ['a', 'y'], ['x', 'y']]),
  }))
})()

const outcome = (state: State, first: Write, second: Write): State | 'refused' =>
  Result.match(Transition.run(first, state, {}, undefined, { foreign: combineImpls }), {
    onFailure: () => 'refused' as const,
    onSuccess: after =>
      Result.match(Transition.run(second, after, {}, undefined, { foreign: combineImpls }), {
        onFailure: () => 'refused' as const,
        onSuccess: done => done,
      }),
  })

const once = (state: State, write: Write): State | 'refused' =>
  Result.match(Transition.run(write, state, {}, undefined, { foreign: combineImpls }), {
    onFailure: () => 'refused' as const,
    onSuccess: done => done,
  })

/** Two outcomes are one: alike as data, or both refused. */
const same = (left: State | 'refused', right: State | 'refused'): boolean =>
  JSON.stringify(left) === JSON.stringify(right)

export interface WriteReport {
  readonly way: WayOfWriting
  readonly ok: boolean
  readonly checked: number
  readonly failures: ReadonlyArray<{ readonly with: WayOfWriting; readonly state: string }>
}

/**
 * Check each pair `properties` lists of `way` against `Transition.step`.
 * `writeProperties[way]` is the table's declaration; a test passes another
 * to show that a false one is caught.
 */
export const checkWriteProperties = (
  way: WayOfWriting,
  properties: WriteProperties,
): WriteReport => {
  const failures: Array<WriteReport['failures'][number]> = []
  let checked = 0
  for (const [other, condition] of Object.entries(properties.commutes) as ReadonlyArray<
    readonly [WayOfWriting, CommuteCondition]
  >) {
    for (const a of writesOf(way, condition, false)) {
      for (const b of writesOf(other, condition, true)) {
        for (const state of states) {
          checked++
          if (!same(outcome(state, a, b), outcome(state, b, a))) {
            failures.push({ with: other, state: JSON.stringify(state) })
          }
        }
      }
    }
  }
  // Twice in a row is once, over the same states.
  if (properties.idempotent !== undefined) {
    for (const write of writesOf(way, properties.idempotent, false)) {
      for (const state of states) {
        checked++
        if (!same(outcome(state, write, write), once(state, write))) {
          failures.push({ with: way, state: JSON.stringify(state) })
        }
      }
    }
  }
  return { way, ok: failures.length === 0, checked, failures }
}
