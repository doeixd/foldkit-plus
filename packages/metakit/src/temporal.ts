/**
 * What a single-step proof cannot cover (`metakit/temporal`).
 *
 * `Prove.transition` shows one step keeps a rule, from any valid state. Two
 * things lie outside it:
 *
 * 1. **What the store must do.** A rule holds across concurrent writers only
 *    if the store runs them as the proof assumes. `requirements` reads which
 *    capability each declared rule needs, and `metakit/store`'s `mount` throws
 *    where a store that cannot give one is asked to hold the rule.
 * 2. **What the order of events must not change.** Two transitions that touch
 *    the same state can be answered in either order. `obligations` names each
 *    such pair as an obligation of kind `walk`, `walk` runs a scenario's steps
 *    in seeded orders and checks a property after every step, and
 *    `undischarged` lists the obligations no passing walk covers.
 */
import { Data, Option } from 'effect'
import type { Aggregate } from './aggregates.js'
import * as Expr from './expr.js'
import type { Machine } from './machine.js'
import type { Requirement } from './store.js'
import * as Transition from './transition.js'
import type * as Verdict from './verdict.js'

type Tagged = Pick<Aggregate<unknown>, '_tag'>

/**
 * The capability each declared rule needs, by the rule's key.
 *
 * - An aggregate (`Rows.sum`, `Rows.count`, …) reads every row under one
 *   parent, so two writers that each read a value admitting them can together
 *   break a rule over it: it needs `parent-serialized`.
 * - A transition that reads the state it writes, or writes a state whose
 *   Schema carries rules, needs `row-atomic`: its proof assumes the state the
 *   guard read is the state the writes land on. A transition that writes
 *   nothing needs nothing.
 *
 * Throws for a key declared as both a transition and an aggregate.
 */
export const requirements = <
  State = never,
  Transitions extends Readonly<Record<string, unknown>> = {},
  Aggregates extends Readonly<Record<string, Tagged>> = {},
>(declared: {
  readonly machine?: Machine<State, Transitions>
  readonly aggregates?: Aggregates
}): ReadonlyArray<Requirement<(keyof Transitions & string) | (keyof Aggregates & string)>> => {
  type Rule = (keyof Transitions & string) | (keyof Aggregates & string)
  const out: Array<Requirement<Rule>> = []
  const machine = declared.machine
  if (machine !== undefined) {
    const ruled = Expr.rulesOf(machine.stateSchema).length > 0
    for (const [tag, { reads, writes }] of Object.entries(footprintsOf(machine))) {
      if (writes.length === 0) continue
      const readsState = Option.match(reads, { onNone: () => true, onSome: r => r.length > 0 })
      if (!readsState && !ruled) continue
      out.push({
        rule: tag as Rule,
        needs: 'row-atomic',
        because: readsState
          ? 'it writes from the state it read'
          : "it writes a state whose Schema's rules it must keep",
      })
    }
  }
  for (const key of Object.keys(declared.aggregates ?? {})) {
    if (machine !== undefined && Object.hasOwn(machine.transitions, key)) {
      throw new Error(
        `[metakit] Temporal.requirements: "${key}" names both a transition and an aggregate`,
      )
    }
    out.push({
      rule: key as Rule,
      needs: 'parent-serialized',
      because: 'it reads every row under one parent',
    })
  }
  return out
}

/**
 * Something to show by running steps in several orders: `detail` says what,
 * `over` names the Messages or transitions whose order is in question.
 */
export interface WalkObligation<Name extends string = string, Over extends string = string>
  extends Verdict.Obligation {
  readonly kind: 'walk'
  readonly name: Name
  readonly over: ReadonlyArray<Over>
}

/** A walk obligation a check of your own emits. */
export const obligation = <const Name extends string, const Over extends string>(declared: {
  readonly name: Name
  readonly shows: string
  readonly over: ReadonlyArray<Over>
}): WalkObligation<Name, Over> => ({
  kind: 'walk',
  name: declared.name,
  detail: declared.shows,
  over: declared.over,
})

type Paths = ReadonlyArray<ReadonlyArray<string>>

interface Footprint {
  readonly reads: Option.Option<Paths>
  readonly writes: Paths
}

/** Each transition's reads of the state and its writes, from the state. */
const footprintsOf = <State, Transitions extends Readonly<Record<string, unknown>>>(
  machine: Machine<State, Transitions>,
): Readonly<Record<string, Footprint>> =>
  Object.fromEntries(
    Object.entries(machine.transitions).map(([tag, transition]) => {
      const { stateReads, writes } = Transition.footprint(
        transition as Transition.Transition<State, unknown, unknown>,
      )
      return [tag, { reads: stateReads, writes }]
    }),
  )

/** Whether one path is the other or lies inside it. */
const overlaps = (left: ReadonlyArray<string>, right: ReadonlyArray<string>): boolean =>
  left.length <= right.length
    ? left.every((segment, at) => segment === right[at])
    : overlaps(right, left)

/** Whether what `writer` writes is something `other` reads or writes. */
const disturbs = (writer: Footprint, other: Footprint): boolean =>
  writer.writes.some(
    written =>
      other.writes.some(path => overlaps(written, path)) ||
      Option.match(other.reads, {
        onNone: () => true,
        onSome: reads => reads.some(path => overlaps(written, path)),
      }),
  )

/**
 * One walk obligation for each pair of `machine`'s transitions whose order
 * matters: one writes what the other reads or writes (a transition that writes
 * pairs with itself). Each step is proved alone, so every order keeps the
 * state's rules; what no step proves is that answers arriving in another order
 * than the steps were sent leave the same state. Transitions that touch
 * disjoint state commute and get none.
 */
export const obligations = <State, Transitions extends Readonly<Record<string, unknown>>>(
  machine: Machine<State, Transitions>,
): ReadonlyArray<
  WalkObligation<
    `${keyof Transitions & string}/${keyof Transitions & string}`,
    keyof Transitions & string
  >
> => {
  type Tag = keyof Transitions & string
  const prints = Object.entries(footprintsOf(machine)) as ReadonlyArray<readonly [Tag, Footprint]>
  return prints.flatMap(([first, a], at) =>
    prints
      .slice(at)
      .filter(([, b]) => disturbs(a, b) || disturbs(b, a))
      .map(([second]) => ({
        kind: 'walk' as const,
        name: `${first}/${second}` as const,
        detail: `answers to ${first} and ${second} arriving in either order leave the state their sending order leaves`,
        over: [first, second],
      })),
  )
}

/** One step of a scenario: a send, an answer, a reconnect. */
export interface Step<State, Name extends string, Of extends string = never> {
  readonly name: Name
  /** The Message or transition this step is an instance of: what an obligation's `over` names. */
  readonly of?: Of
  /** The steps that must have run before this one (an answer after its send). */
  readonly after?: ReadonlyArray<NoInfer<Name>>
  readonly run: (state: State) => State
}

/** Steps a walk orders, and what must hold after each. */
export interface Scenario<State, Name extends string, Of extends string = never> {
  readonly initial: () => State
  readonly steps: ReadonlyArray<Step<State, Name, Of>>
  /** Asked after every step, with the steps run so far: a reason when the property is broken. */
  readonly holds: (state: State, ran: ReadonlyArray<Name>) => Option.Option<string>
}

/**
 * What a walk found. `Broken` carries the `seed` whose order broke the
 * property (`walk(scenario, { seed, runs: 1 })` runs it again), that order up
 * to the failing step, and the fewest of its steps that still break it.
 */
export type WalkResult<Name = string> = Data.TaggedEnum<{
  Held: { readonly seed: number; readonly runs: number }
  Broken: {
    readonly seed: number
    readonly interleaving: ReadonlyArray<Name>
    readonly minimal: ReadonlyArray<Name>
    readonly reason: string
  }
}>

interface WalkResultDefinition extends Data.TaggedEnum.WithGenerics<1> {
  readonly taggedEnum: WalkResult<this['A']>
}

export const WalkResult = Data.taggedEnum<WalkResultDefinition>()

export interface WalkOptions {
  /** The first order's seed; each further run adds one. `1` unless given. */
  readonly seed?: number
  /** How many orders to try. `200` unless given. */
  readonly runs?: number
}

/** A small seeded generator (mulberry32): the same seed gives the same orders everywhere. */
export const generator = (seed: number): (() => number) => {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/**
 * Run `scenario`'s steps in `runs` seeded orders, each respecting every
 * step's `after`, asking `holds` after every step. The first broken order
 * stops the walk.
 *
 * Throws for a scenario no order can run: two steps of one name, an `after`
 * naming no step, or steps waiting on each other.
 */
export const walk = <State, Name extends string, Of extends string = never>(
  scenario: Scenario<State, Name, Of>,
  options?: WalkOptions,
): WalkResult<Name> => {
  type S = Step<State, Name, Of>
  const { steps } = scenario
  const names = new Set<Name>()
  for (const step of steps) {
    if (names.has(step.name)) {
      throw new Error(`[metakit] Temporal.walk: two steps are named "${step.name}"`)
    }
    names.add(step.name)
  }
  for (const step of steps) {
    const unknown = (step.after ?? []).find(name => !names.has(name))
    if (unknown !== undefined) {
      throw new Error(
        `[metakit] Temporal.walk: step "${step.name}" runs after "${unknown}", which is no step`,
      )
    }
  }

  /** One seeded order of every step, each after the steps it waits on. */
  const orderOf = (seed: number): ReadonlyArray<S> => {
    const next = generator(seed)
    const ran = new Set<Name>()
    const waiting = [...steps]
    const order: Array<S> = []
    while (waiting.length > 0) {
      const ready = waiting.filter(step => (step.after ?? []).every(name => ran.has(name)))
      if (ready.length === 0) {
        throw new Error(
          `[metakit] Temporal.walk: steps ${waiting.map(step => `"${step.name}"`).join(', ')} wait on each other`,
        )
      }
      const step = ready[Math.floor(next() * ready.length)]!
      waiting.splice(waiting.indexOf(step), 1)
      ran.add(step.name)
      order.push(step)
    }
    return order
  }

  /** The steps of `order` up to the first after which the property is broken, and why. */
  const broken = (
    order: ReadonlyArray<S>,
  ): Option.Option<{ readonly ran: ReadonlyArray<S>; readonly reason: string }> => {
    let state = scenario.initial()
    const ran: Array<Name> = []
    for (const [at, step] of order.entries()) {
      state = step.run(state)
      ran.push(step.name)
      const reason = scenario.holds(state, ran)
      if (Option.isSome(reason)) {
        return Option.some({ ran: order.slice(0, at + 1), reason: reason.value })
      }
    }
    return Option.none()
  }

  /** `failing` without each step that nothing left waits on and the break does not need. */
  const shrunk = (failing: {
    readonly ran: ReadonlyArray<S>
    readonly reason: string
  }): { readonly ran: ReadonlyArray<S>; readonly reason: string } => {
    for (const step of failing.ran) {
      const rest = failing.ran.filter(other => other !== step)
      if (rest.some(other => (other.after ?? []).includes(step.name))) continue
      const still = broken(rest)
      if (Option.isSome(still)) return shrunk(still.value)
    }
    return failing
  }

  const first = options?.seed ?? 1
  const runs = options?.runs ?? 200
  if (!Number.isInteger(runs) || runs <= 0) {
    throw new Error(`[metakit] Temporal.walk: runs must be a positive integer, got ${runs}`)
  }
  for (let run = 0; run < runs; run++) {
    const seed = first + run
    const failing = broken(orderOf(seed))
    if (Option.isSome(failing)) {
      const least = shrunk(failing.value)
      return WalkResult.Broken({
        seed,
        interleaving: failing.value.ran.map(step => step.name),
        minimal: least.ran.map(step => step.name),
        reason: least.reason,
      })
    }
  }
  return WalkResult.Held({ seed: first, runs })
}

/** One step of an `AsyncScenario`: a send, an exchange, a transaction, awaited. */
export interface AsyncStep<World, Name extends string> {
  readonly name: Name
  readonly after?: ReadonlyArray<NoInfer<Name>>
  readonly run: (world: World) => Promise<void>
}

/** `Scenario` for steps that must be awaited: each order runs on a world of its own. */
export interface AsyncScenario<World, Name extends string> {
  readonly initial: () => Promise<World>
  readonly steps: ReadonlyArray<AsyncStep<World, Name>>
  /** Asked after every step, with the steps run so far: a reason when the property is broken. */
  readonly holds: (world: World, ran: ReadonlyArray<Name>) => Promise<Option.Option<string>>
  /** Closes the world an order ran on, whether or not it broke the property. */
  readonly finish?: (world: World) => Promise<void>
}

/**
 * `walk` for steps that must be awaited (an exchange, an IndexedDB
 * transaction): the same seeded orders, each step after the ones it waits on,
 * the property asked after every step, the same `WalkResult` with the seed and
 * the shortest order that still breaks it. A step that throws breaks the
 * property with its message. `runs` is `30` unless given.
 *
 * Throws for steps that wait on each other, or on one that is no step.
 */
export const walkAsync = async <World, Name extends string>(
  scenario: AsyncScenario<World, Name>,
  options?: WalkOptions,
): Promise<WalkResult<Name>> => {
  type S = AsyncStep<World, Name>
  const { steps } = scenario

  const orderOf = (seed: number): ReadonlyArray<S> => {
    const next = generator(seed)
    const ran = new Set<Name>()
    const waiting = [...steps]
    const order: Array<S> = []
    while (waiting.length > 0) {
      const ready = waiting.filter(step => (step.after ?? []).every(name => ran.has(name)))
      const step = ready[Math.floor(next() * ready.length)]
      if (step === undefined)
        throw new Error(
          '[metakit] Temporal.walkAsync: steps wait on each other, or on one that is no step',
        )
      waiting.splice(waiting.indexOf(step), 1)
      ran.add(step.name)
      order.push(step)
    }
    return order
  }

  /** The steps of `order` up to the first after which the property is broken, and why. */
  const broken = async (
    order: ReadonlyArray<S>,
  ): Promise<Option.Option<{ readonly ran: ReadonlyArray<S>; readonly reason: string }>> => {
    const world = await scenario.initial()
    try {
      const ran: Array<Name> = []
      for (const [at, step] of order.entries()) {
        const reason = await step.run(world).then(
          () => scenario.holds(world, [...ran, step.name]),
          (cause: unknown) =>
            Option.some(
              `${step.name} threw: ${cause instanceof Error ? cause.message : String(cause)}`,
            ),
        )
        ran.push(step.name)
        if (Option.isSome(reason))
          return Option.some({ ran: order.slice(0, at + 1), reason: reason.value })
      }
      return Option.none()
    } finally {
      await scenario.finish?.(world)
    }
  }

  const shrunk = async (failing: {
    readonly ran: ReadonlyArray<S>
    readonly reason: string
  }): Promise<{ readonly ran: ReadonlyArray<S>; readonly reason: string }> => {
    for (const step of failing.ran) {
      const rest = failing.ran.filter(other => other !== step)
      if (rest.some(other => (other.after ?? []).includes(step.name))) continue
      const still = await broken(rest)
      if (Option.isSome(still)) return shrunk(still.value)
    }
    return failing
  }

  const first = options?.seed ?? 1
  const runs = options?.runs ?? 30
  if (!Number.isInteger(runs) || runs <= 0) {
    throw new Error(`[metakit] Temporal.walkAsync: runs must be a positive integer, got ${runs}`)
  }
  for (let run = 0; run < runs; run++) {
    const seed = first + run
    const failing = await broken(orderOf(seed))
    if (Option.isSome(failing)) {
      const least = await shrunk(failing.value)
      return WalkResult.Broken({
        seed,
        interleaving: failing.value.ran.map(step => step.name),
        minimal: least.ran.map(step => step.name),
        reason: least.reason,
      })
    }
  }
  return WalkResult.Held({ seed: first, runs })
}

/**
 * A walk run for one obligation, and what it found. `answer` is set only by a
 * walk that was asked what the order does rather than to show it never
 * matters (`metakit/pairs`): its `Broken` result is the answer, an order that
 * gives another state, and the obligation is discharged by it.
 */
export interface Discharge<Name extends string = string> {
  readonly obligation: Name
  readonly result: WalkResult
  readonly answer?: 'order-matters'
}

const closes = ({ result, answer }: Discharge): boolean =>
  WalkResult.$is('Held')(result) || answer !== undefined

/**
 * Walk `scenario` for `obligation`. Throws when the scenario has no step for
 * one of the obligation's `over` (a pair of one transition needs two steps of
 * it): such a walk would pass having shown nothing about it.
 */
export const discharge = <Name extends string, Over extends string, State, StepName extends string>(
  obligation: WalkObligation<Name, Over>,
  scenario: Scenario<State, StepName, NoInfer<Over>>,
  options?: WalkOptions,
): Discharge<Name> => {
  const available = scenario.steps.flatMap(step => (step.of === undefined ? [] : [step.of]))
  for (const needed of obligation.over) {
    const at = available.indexOf(needed)
    if (at < 0) {
      throw new Error(
        `[metakit] Temporal.discharge: obligation "${obligation.name}" is over ${obligation.over.join(', ')}, but the scenario has too few steps of "${needed}"`,
      )
    }
    available.splice(at, 1)
  }
  return { obligation: obligation.name, result: walk(scenario, options) }
}

/**
 * The obligations no walk that held covers: assert it is empty in a test. A
 * discharge naming no obligation of the list is a type error.
 */
export const undischarged = <Name extends string, Over extends string>(
  owed: ReadonlyArray<WalkObligation<Name, Over>>,
  discharges: ReadonlyArray<Discharge<NoInfer<Name>>>,
): ReadonlyArray<WalkObligation<Name, Over>> => {
  const held = new Set(discharges.filter(closes).map(({ obligation: name }) => name))
  return owed.filter(({ name }) => !held.has(name))
}

/** Where an obligation belongs: `owner` names the machine or protocol, `where` the place that declared it. */
export interface Scope {
  readonly owner: string
  /** `file:line` of the declaring code; read from the call stack when left out. */
  readonly where?: string
}

/** An obligation no walk that held covers, and why it is open. */
export interface OpenObligation {
  readonly owner: string
  readonly where: string
  readonly obligation: WalkObligation
  readonly why: string
}

/** An obligation a walk covers, and what the walk found. */
export interface DischargedObligation {
  readonly owner: string
  readonly where: string
  readonly obligation: WalkObligation
  readonly discharge: Discharge
}

/** A pair decided without a test, why, and the walk that checked the decision, if one ran. */
export interface DecidedPair {
  readonly owner: string
  readonly where: string
  readonly name: string
  readonly reason: string
  readonly checked: Option.Option<WalkResult>
}

/** What a registry holds: open and discharged obligations, and the pairs decided without one. */
export interface ObligationReport {
  readonly open: ReadonlyArray<OpenObligation>
  readonly discharged: ReadonlyArray<DischargedObligation>
  readonly decided: ReadonlyArray<DecidedPair>
  /** The decided pairs a walk showed to give another state in one order: each is a wrong decision. */
  readonly refuted: ReadonlyArray<DecidedPair>
  /** No obligation is open and no decision is refuted. */
  readonly ok: boolean
  /** The report as text: open first, then discharged, then decided with the reason. */
  readonly format: () => string
}

/**
 * Everything declared and shown for obligations. A package adds its own:
 * `declare` what it owes, `record` a walk that covers it, `decide` a pair that
 * needs no test. `report` reads them all, whichever package added them.
 */
export interface Registry {
  /** Obligations `scope` owes. Declaring a name again from the same place replaces it; from another place throws. */
  readonly declare: (scope: Scope, owed: ReadonlyArray<WalkObligation>) => void
  /** A walk's result for an obligation `scope` declared: throws for a name it did not. */
  readonly record: (scope: Scope, discharge: Discharge) => void
  /** A pair of `scope` that needs no test, with the rule that decided it and the walk that checked it. */
  readonly decide: (
    scope: Scope,
    decided: { readonly name: string; readonly reason: string; readonly checked?: WalkResult },
  ) => void
  readonly report: () => ObligationReport
}

/** The first frame of the call stack outside metakit itself, as `file:line`. */
const callerOf = (): string => {
  const frame = (new Error().stack ?? '')
    .split('\n')
    .slice(1)
    .find(
      line => !/[\\/]metakit[\\/](?:src|dist)[\\/]/.test(line) && !line.includes('node:internal'),
    )
  return /([^\s()]+:\d+):\d+\)?\s*$/.exec(frame ?? '')?.[1]?.replace(/^file:\/+/, '') ?? 'unknown'
}

const describeResult = (result: WalkResult): string =>
  WalkResult.$match(result, {
    Held: ({ seed, runs }) => `held over ${runs} runs from seed ${seed}`,
    Broken: ({ seed, minimal, reason }) =>
      `broke at seed ${seed} in the order ${minimal.join(', ')}: ${reason}`,
  })

/** The case a walk found where the order matters: its seed, and what differed. */
const describeAnswer = (result: WalkResult): string =>
  WalkResult.$match(result, {
    Held: () => 'the walk held',
    Broken: ({ seed, reason }) => `seed ${seed}: ${reason}`,
  })

/** An empty registry. Most code wants `registry`, the one every package shares. */
export const makeRegistry = (): Registry => {
  const owed = new Map<string, { scope: Required<Scope>; obligation: WalkObligation }>()
  const shown = new Map<string, Array<Discharge>>()
  const decided = new Map<string, DecidedPair>()
  const keyOf = (owner: string, name: string) => `${owner}\u0000${name}`
  const placed = (scope: Scope): Required<Scope> => ({
    owner: scope.owner,
    where: scope.where ?? callerOf(),
  })

  const report = (): ObligationReport => {
    const open: Array<OpenObligation> = []
    const discharged: Array<DischargedObligation> = []
    for (const [key, { scope, obligation }] of owed) {
      const walks = shown.get(key) ?? []
      const last = walks.at(-1)
      if (last !== undefined && closes(last)) {
        discharged.push({ ...scope, obligation, discharge: last })
        continue
      }
      open.push({
        ...scope,
        obligation,
        why: last === undefined ? 'no walk has covered it' : describeResult(last.result),
      })
    }
    const all = [...decided.values()]
    const refuted = all.filter(
      ({ checked }) => Option.isSome(checked) && WalkResult.$is('Broken')(checked.value),
    )
    const lines = (title: string, rows: ReadonlyArray<string>) =>
      [`${title} (${rows.length})`, ...rows.map(row => `  ${row}`)].join('\n')
    return {
      open,
      discharged,
      decided: all,
      refuted,
      ok: open.length === 0 && refuted.length === 0,
      format: () =>
        [
          lines(
            'open',
            open.map(
              ({ owner, obligation, where, why }) =>
                `${owner} ${obligation.name} (declared at ${where}): ${why}`,
            ),
          ),
          lines(
            'discharged',
            discharged.map(({ owner, obligation, discharge }) =>
              discharge.answer === undefined
                ? `${owner} ${obligation.name}: ${describeResult(discharge.result)}`
                : `${owner} ${obligation.name}: the order matters (${describeAnswer(discharge.result)})`,
            ),
          ),
          lines(
            'decided without a test',
            all.map(({ owner, name, reason, checked }) =>
              Option.match(checked, {
                onNone: () => `${owner} ${name}: ${reason}`,
                onSome: result =>
                  `${owner} ${name}: ${reason}; checked by a walk that ${describeResult(result)}`,
              }),
            ),
          ),
          ...(refuted.length === 0
            ? []
            : [
                lines(
                  'decided wrongly (a walk gave another state in one order)',
                  refuted.map(({ owner, name, reason }) => `${owner} ${name}: ${reason}`),
                ),
              ]),
        ].join('\n'),
    }
  }

  return {
    declare: (scope, obligations) => {
      const at = placed(scope)
      for (const obligation of obligations) {
        const key = keyOf(at.owner, obligation.name)
        const before = owed.get(key)
        if (before !== undefined && before.scope.where !== at.where) {
          throw new Error(
            `[metakit] Temporal.declare: ${at.owner} declares "${obligation.name}" at ${before.scope.where} and again at ${at.where}`,
          )
        }
        owed.set(key, { scope: at, obligation })
        shown.delete(key)
      }
    },
    record: (scope, discharge) => {
      const key = keyOf(scope.owner, discharge.obligation)
      if (!owed.has(key)) {
        throw new Error(
          `[metakit] Temporal.record: ${scope.owner} declared no obligation "${discharge.obligation}"`,
        )
      }
      shown.set(key, [...(shown.get(key) ?? []), discharge])
    },
    decide: (scope, { name, reason, checked }) => {
      const at = placed(scope)
      const key = keyOf(at.owner, name)
      const prev = decided.get(key)
      const nextChecked = Option.fromUndefinedOr(checked)
      if (
        prev !== undefined &&
        Option.isSome(prev.checked) &&
        WalkResult.$is('Broken')(prev.checked.value) &&
        !(Option.isSome(nextChecked) && WalkResult.$is('Broken')(nextChecked.value))
      ) {
        return
      }
      decided.set(key, {
        ...at,
        name,
        reason,
        checked: nextChecked,
      })
    },
    report,
  }
}

const sharedKey = Symbol.for('metakit/temporal/registry')

/**
 * The registry every package shares: one per process, kept on `globalThis` so
 * a second copy of this module (a workspace and a published build side by
 * side) reads and adds to the same one.
 */
export const registry: Registry = (() => {
  const held: Registry | undefined = Reflect.get(globalThis, sharedKey)
  if (held !== undefined) return held
  const made = makeRegistry()
  Reflect.set(globalThis, sharedKey, made)
  return made
})()
