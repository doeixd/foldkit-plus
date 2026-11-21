/**
 * What a single-step proof cannot cover (`metakit/temporal`).
 *
 * `Prove.transition` shows one step keeps a rule, from any valid state. Two
 * things lie outside it:
 *
 * 1. **What the store must do.** A rule holds across concurrent writers only
 *    if the store runs them as the proof assumes. `requirements` reads which
 *    capability each declared rule needs, and `mount` throws where a store
 *    that cannot give one is asked to hold the rule.
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
import * as Transition from './transition.js'
import type * as Verdict from './verdict.js'

/**
 * How a store runs concurrent writes. `serializable`: as if one at a time.
 * `read-committed`: each statement reads what has committed, so two writers
 * can each read a value the other is about to change. `eventual`: replicas
 * accept writes apart and merge them later.
 */
export type Isolation = 'eventual' | 'read-committed' | 'serializable'

/** What a store or adapter declares it guarantees. */
export interface StoreCapabilities {
  /** What a refusal calls the store (`Postgres`, `memory`). */
  readonly name: string
  readonly isolation: Isolation
  /**
   * Whether a write locks the row its rule's rows hang on (an account, for a
   * rule over its entries) until it commits, so writers of one parent wait
   * for each other.
   */
  readonly parentRowLock: boolean
}

/**
 * What a rule needs of its store. `row-atomic`: a guard and the writes it
 * admits apply to one row as one step. `parent-serialized`: writers of the
 * rows under one parent run one at a time.
 */
export type Capability = 'row-atomic' | 'parent-serialized'

const given: Readonly<Record<Capability, (store: StoreCapabilities) => boolean>> = {
  'row-atomic': store => store.isolation !== 'eventual',
  'parent-serialized': store =>
    store.isolation === 'serializable' ||
    (store.isolation === 'read-committed' && store.parentRowLock),
}

const meaning: Readonly<Record<Capability, string>> = {
  'row-atomic': 'a guard and its writes apply to one row as one step',
  'parent-serialized': 'writers of the rows under one parent run one at a time',
}

/** Whether `store` gives `capability`. */
export const gives = (store: StoreCapabilities, capability: Capability): boolean =>
  given[capability](store)

/** One declared rule, the capability it needs and why. */
export interface Requirement<Rule extends string = string> {
  readonly rule: Rule
  readonly needs: Capability
  readonly because: string
}

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

/** A store asked to hold rules it cannot. */
export class StoreRefused extends Data.TaggedError('StoreRefused')<{
  readonly store: StoreCapabilities
  /** The rules the store cannot hold; never empty. */
  readonly refused: ReadonlyArray<Requirement>
}> {
  override get message(): string {
    const { name, isolation, parentRowLock } = this.store
    const lines = this.refused.map(
      ({ rule, needs, because }) => `  - "${rule}" needs ${needs} (${meaning[needs]}): ${because}`,
    )
    return `[metakit] store "${name}" (${isolation}, ${parentRowLock ? 'locks' : 'does not lock'} the parent row) cannot hold:\n${lines.join('\n')}`
  }
}

/** The requirements `store` cannot give. */
export const refused = <Rule extends string>(
  store: StoreCapabilities,
  needed: ReadonlyArray<Requirement<Rule>>,
): ReadonlyArray<Requirement<Rule>> => needed.filter(({ needs }) => !gives(store, needs))

/**
 * Call where a store is set up: throws `StoreRefused`, naming each rule, the
 * capability it needs and the store, when `store` cannot hold one of `needed`.
 */
export const mount = (store: StoreCapabilities, needed: ReadonlyArray<Requirement>): void => {
  const cannot = refused(store, needed)
  if (cannot.length > 0) throw new StoreRefused({ store, refused: cannot })
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
const generator = (seed: number): (() => number) => {
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

/** A walk run for one obligation, and what it found. */
export interface Discharge<Name extends string = string> {
  readonly obligation: Name
  readonly result: WalkResult
}

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
  const held = new Set(
    discharges
      .filter(({ result }) => WalkResult.$is('Held')(result))
      .map(({ obligation: name }) => name),
  )
  return owed.filter(({ name }) => !held.has(name))
}
