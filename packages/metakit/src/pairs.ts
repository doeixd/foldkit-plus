/**
 * Which pairs of a machine's transitions need a test (`metakit/pairs`).
 *
 * Two transitions whose footprints overlap can be answered in either order.
 * For each such pair `Transition.commutes` answers: `True` needs no test, and
 * `pairs` says which rule decided it; `Unknown` is an obligation of the kind
 * `walk`. `walkPair` runs both orders from states and inputs generated from
 * the machine's Schemas and compares what they leave: the state, the records
 * emitted, and which of the two steps were refused. `settle` declares a
 * machine's pairs in a registry and walks them all: the pairs `commutes`
 * decided too, so a rule that decides wrongly turns a walk red.
 *
 * It is a development and test tool: it carries the checker and the
 * generators, and no page imports it. The pairs come from the machine's own
 * footprints, the overlap `metakit/temporal` already names, not from
 * `metakit/graph`: a machine's footprints are paths of its own state, and the
 * graph adds only the bridges between rows and Model paths that none has.
 */
import { Arbitrary, Effect, Option, Result, Schema } from 'effect'
import type { Machine } from './machine.js'
import * as Path from './path.js'
import { writeProperties, type CommuteCondition } from './properties.js'
import * as Temporal from './temporal.js'
import * as Transition from './transition.js'
import { commutes } from './transitionCommutes.js'
import * as Verdict from './verdict.js'

type Segments = ReadonlyArray<string>
type AnyTransition = Transition.Transition<unknown, unknown, unknown, unknown>

/** One pair of transitions whose footprints overlap, and what `Transition.commutes` says of it. */
export interface Pair<Tag extends string = string> {
  readonly name: `${Tag}/${Tag}`
  readonly over: readonly [Tag, Tag]
  readonly verdict: Verdict.Verdict<never>
  /** For a `True` pair the rule that decided it; for an `Unknown` one, why it does not decide. */
  readonly why: string
}

const conditions: { readonly [Condition in CommuteCondition]: string } = {
  always: 'the two ways always commute',
  'one-kind': 'both write values of one kind',
  'same-literal': 'both write one literal',
  'different-literals': 'the two literals differ',
  'in-range':
    'integer amounts, and every total either order passes through stays in the safe range',
  'disjoint-fields': 'they set different fields and neither reads a field the other sets',
  steady: 'no element can refuse either',
  'reads-no-set-field': 'the removal reads no field the patch sets',
}

const ofWay = (tag: string): string => (/^[aeiou]/.test(tag) ? `an ${tag}` : `a ${tag}`)

/** The rule behind a `True` pair: each pair of writes that meet, the way of each and the condition that held. */
const ruleOf = (first: AnyTransition, second: AnyTransition): string => {
  const rules = first.writes.flatMap(a =>
    second.writes
      .filter(b => Path.meets(a.target, b.target))
      .map(
        b =>
          `${ofWay(a.way._tag)} and ${ofWay(b.way._tag)} of "${Path.format(a.target)}": ${
            conditions[writeProperties[a.way._tag].commutes[b.way._tag] ?? 'always']
          }`,
      ),
  )
  return rules.length === 0 ? 'neither reads what the other writes' : rules.join('; ')
}

/**
 * Every pair of `machine`'s transitions whose footprints overlap (a
 * transition that writes pairs with itself), each with `Transition.commutes`'
 * answer. A pair on disjoint state is left out: it commutes by construction.
 * An opaque transition is `Unknown` against every pair that overlaps its
 * declared reads and writes.
 */
export const pairs = <State, Transitions extends Readonly<Record<string, unknown>>>(
  machine: Machine<State, Transitions>,
): ReadonlyArray<Pair<keyof Transitions & string>> =>
  Temporal.obligations(machine).map(({ over }) => {
    const [first, second] = over as readonly [
      keyof Transitions & string,
      keyof Transitions & string,
    ]
    const a = machine.transitions[first] as AnyTransition
    const b = machine.transitions[second] as AnyTransition
    const verdict = commutes(a, b)
    return {
      name: `${first}/${second}` as const,
      over: [first, second] as const,
      verdict,
      why: Verdict.match(verdict, {
        True: () => ruleOf(a, b),
        False: () => 'a witness shows it does not',
        Unknown: ({ reason }) => reason,
      }),
    }
  })

/** The pairs `Transition.commutes` left to a walk, as obligations. */
export const owed = <State, Transitions extends Readonly<Record<string, unknown>>>(
  machine: Machine<State, Transitions>,
): ReadonlyArray<
  Temporal.WalkObligation<
    `${keyof Transitions & string}/${keyof Transitions & string}`,
    keyof Transitions & string
  >
> =>
  pairs(machine).flatMap(pair =>
    Verdict.isTrue(pair.verdict)
      ? []
      : [
          {
            kind: 'walk' as const,
            name: pair.name,
            detail: `the order of ${pair.over[0]} and ${pair.over[1]} is undecided: ${pair.why}`,
            over: pair.over,
          },
        ],
  )

/** Sorted keys, so two states that are equal print alike. */
const canonical = (value: unknown): string =>
  JSON.stringify(value, (_, inner: unknown) =>
    typeof inner === 'object' && inner !== null && !Array.isArray(inner)
      ? Object.fromEntries(Object.entries(inner).sort(([x], [y]) => (x < y ? -1 : x > y ? 1 : 0)))
      : inner,
  )

const isPlain = (value: unknown): value is Readonly<Record<string, unknown>> => {
  if (typeof value !== 'object' || value === null) return false
  const prototype = Object.getPrototypeOf(value)
  return prototype === Object.prototype || prototype === null
}

/** The strings and numbers inside `value`, through plain objects, arrays and an `Option`'s value. */
const leavesOf = (value: unknown): ReadonlyArray<string | number> => {
  if (typeof value === 'string' || typeof value === 'number') return [value]
  if (Option.isOption(value)) return Option.isSome(value) ? leavesOf(value.value) : []
  if (Array.isArray(value)) return value.flatMap(leavesOf)
  return isPlain(value) ? Object.values(value).flatMap(leavesOf) : []
}

/** `value` with the `at`th string or number (in `leavesOf`'s order) replaced. */
const withLeaf = (value: unknown, at: number, next: string | number): unknown => {
  let seen = -1
  const go = (inner: unknown): unknown => {
    if (typeof inner === 'string' || typeof inner === 'number') {
      seen++
      return seen === at ? next : inner
    }
    if (Array.isArray(inner)) return inner.map(go)
    if (isPlain(inner)) return Object.fromEntries(Object.entries(inner).map(([k, v]) => [k, go(v)]))
    return inner
  }
  return go(value)
}

/**
 * `input` with some of its strings and numbers replaced by ones the state
 * holds, so a generated Message meets the rows the state has (a random id
 * would name none). A replacement the input's Schema refuses is dropped.
 */
const meeting = (
  input: unknown,
  state: unknown,
  schema: Option.Option<Schema.Codec<unknown>>,
  next: () => number,
): unknown => {
  const pool = leavesOf(state)
  const accepts = Option.match(schema, {
    onNone: () => () => true,
    onSome: codec => Schema.is(codec),
  })
  let current = input
  for (const [at, leaf] of leavesOf(input).entries()) {
    const pick = pool.filter(candidate => typeof candidate === typeof leaf)
    if (pick.length === 0 || next() > 0.75) continue
    const candidate = withLeaf(current, at, pick[Math.floor(next() * pick.length)]!)
    if (accepts(candidate)) current = candidate
  }
  return current
}

interface Outcome {
  readonly state: unknown
  readonly emitted: ReadonlyArray<string>
  readonly refused: ReadonlyArray<string>
}

const clip = (text: string): string => (text.length > 60 ? `${text.slice(0, 59)}…` : text)

/** Where two outcomes differ: each state field, the records emitted, the steps refused. */
const differences = (forward: Outcome, backward: Outcome): string => {
  const [x, y] = [forward.state, backward.state]
  const fields =
    isPlain(x) && isPlain(y)
      ? [...new Set([...Object.keys(x), ...Object.keys(y)])]
          .filter(key => canonical(x[key]) !== canonical(y[key]))
          .map(key => `${key} (${clip(canonical(x[key]))} or ${clip(canonical(y[key]))})`)
      : canonical(x) === canonical(y)
        ? []
        : ['the state']
  return [
    ...fields,
    ...(canonical(forward.emitted) === canonical(backward.emitted) ? [] : ['the records emitted']),
    ...(canonical(forward.refused) === canonical(backward.refused)
      ? []
      : ['which step was refused']),
  ].join(', ')
}

type Dispatch = (
  state: unknown,
  message: { readonly _tag: string; readonly input: unknown; readonly supplied: unknown },
) => Result.Result<{ readonly state: unknown; readonly emitted: ReadonlyArray<unknown> }, unknown>

/**
 * Run `a` and `b` from generated states in both orders and compare what each
 * order leaves: the state, the records emitted (as a set) and which steps were
 * refused. Run `n` is made from seed `first + n`, so a `Broken` seed with
 * `runs: 1` runs the same case again. `interleaving` is the order that
 * differed from `a` then `b`, and `minimal` the same: a pair has no shorter one.
 *
 * Throws for a tag the machine does not declare.
 */
export const walkPair = <State, Transitions extends Readonly<Record<string, unknown>>>(
  machine: Machine<State, Transitions>,
  over: readonly [keyof Transitions & string, keyof Transitions & string],
  options?: Temporal.WalkOptions,
): Temporal.WalkResult<keyof Transitions & string> => {
  const [first, second] = over
  for (const tag of over) {
    if (!Object.hasOwn(machine.transitions, tag)) {
      throw new Error(`[metakit] Pairs.walkPair: the machine declares no transition "${tag}"`)
    }
  }
  const a = machine.transitions[first] as AnyTransition
  const b = machine.transitions[second] as AnyTransition
  const slice = (schema: Option.Option<Schema.Codec<unknown>>) =>
    Option.match(schema, {
      onNone: () => Arbitrary.Constant<unknown>({}),
      onSome: codec => Arbitrary.schema(codec) as Arbitrary.Arbitrary<unknown>,
    })
  const arbitrary = Arbitrary.all({
    state: Arbitrary.schema(machine.stateSchema) as Arbitrary.Arbitrary<unknown>,
    inputA: slice(a.inputSchema),
    suppliedA: slice(a.suppliedSchema),
    inputB: slice(b.inputSchema),
    suppliedB: slice(b.suppliedSchema),
  })
  const dispatch = machine.dispatch as unknown as Dispatch

  /** What running `steps` in order leaves: the state, the records emitted and the steps refused. */
  const outcome = (state: unknown, steps: ReadonlyArray<Parameters<Dispatch>[1]>): Outcome => {
    let at = state
    const emitted: Array<string> = []
    const refused: Array<string> = []
    for (const step of steps) {
      const result = dispatch(at, step)
      if (Result.isSuccess(result)) {
        at = result.success.state
        emitted.push(...result.success.emitted.map(canonical))
      } else {
        // By the Message, not its place: two equal Messages swap without a trace.
        refused.push(canonical(step))
      }
    }
    return { state: at, emitted: emitted.sort(), refused: refused.sort() }
  }

  const firstSeed = options?.seed ?? 1
  const runs = options?.runs ?? 100
  for (let run = 0; run < runs; run++) {
    const seed = firstSeed + run
    const [drawn] = Effect.runSync(Arbitrary.sampleEffect(arbitrary, { count: 1, seed, size: 8 }))
    if (drawn === undefined) continue
    const next = Temporal.generator(seed)
    const stepA = {
      _tag: first,
      input: meeting(drawn.inputA, drawn.state, a.inputSchema, next),
      supplied: drawn.suppliedA,
    }
    const stepB = {
      _tag: second,
      input: meeting(drawn.inputB, drawn.state, b.inputSchema, next),
      supplied: drawn.suppliedB,
    }
    const [forward, backward] = [
      outcome(drawn.state, [stepA, stepB]),
      outcome(drawn.state, [stepB, stepA]),
    ]
    if (canonical(forward) !== canonical(backward)) {
      return Temporal.WalkResult.Broken({
        seed,
        interleaving: [second, first],
        minimal: [second, first],
        reason: `with ${first} ${clip(canonical(stepA.input))} and ${second} ${clip(canonical(stepB.input))}, ${first} first and ${second} first differ in ${differences(forward, backward)}`,
      })
    }
  }
  return Temporal.WalkResult.Held({ seed: firstSeed, runs })
}

/** What a machine's pairs ask of the registry that holds them. */
export interface SettleOptions extends Temporal.Scope {
  /** The registry the pairs go into: the shared one unless given. */
  readonly registry?: Temporal.Registry
  /** The first seed of every walk. `1` unless given. */
  readonly seed?: number
  /** How many cases a walk of an undecided pair tries. `100` unless given. */
  readonly runs?: number
  /** How many cases the walk that checks a decided pair tries. `40` unless given. */
  readonly checks?: number
}

/**
 * Declare `machine`'s pairs in a registry without walking any: each `Unknown`
 * pair is an obligation, open until a walk covers it, and each `True` pair is
 * recorded with the rule that decided it.
 */
export const declare = <State, Transitions extends Readonly<Record<string, unknown>>>(
  machine: Machine<State, Transitions>,
  options: SettleOptions,
): void => {
  const target = options.registry ?? Temporal.registry
  target.declare(options, owed(machine))
  for (const pair of pairs(machine)) {
    if (Verdict.isTrue(pair.verdict)) target.decide(options, { name: pair.name, reason: pair.why })
  }
}

/**
 * `declare`, then walk every pair. An `Unknown` pair is discharged by its walk
 * whatever it finds: held, the pair commutes over the cases tried; broken, the
 * order matters and the discharge carries a seed and the case. A `True` pair
 * is walked too, and a walk that breaks is a decision the report refutes.
 */
export const settle = <State, Transitions extends Readonly<Record<string, unknown>>>(
  machine: Machine<State, Transitions>,
  options: SettleOptions,
): void => {
  const target = options.registry ?? Temporal.registry
  declare(machine, options)
  const walking = { seed: options.seed ?? 1 }
  for (const pair of pairs(machine)) {
    if (Verdict.isTrue(pair.verdict)) {
      target.decide(options, {
        name: pair.name,
        reason: pair.why,
        checked: walkPair(machine, pair.over, { ...walking, runs: options.checks ?? 40 }),
      })
    } else {
      const result = walkPair(machine, pair.over, { ...walking, runs: options.runs ?? 100 })
      target.record(options, {
        obligation: pair.name,
        result,
        ...(Temporal.WalkResult.$is('Broken')(result) ? { answer: 'order-matters' as const } : {}),
      })
    }
  }
}
