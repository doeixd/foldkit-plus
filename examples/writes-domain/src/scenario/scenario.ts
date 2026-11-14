/**
 * A write scenario as data, and what a backend's run of it reports. A scenario
 * holds no function and names no backend; a runner (`sqlite.ts`, `memory.ts`,
 * `domain.ts`) seeds its backend from `given`, sends `when` as `principal` at
 * `now` under `operation`, and answers one `ScenarioStep` for each thing it
 * owns and checked. `mismatches` is every step whose two sides differ.
 *
 * The shape is the one `Scenario` in `foldkit-remote/testing` is to take
 * (the laws note's D25); when it lands this file is replaced by it.
 */
import { Effect, Match, Option } from 'effect'
import type { Invariant, Row } from 'foldkit-entity'
import type { Product, User } from 'foldkit-example-writes/domain'
import type { ReserveStock } from '../domain.js'

/** A refusal named by its declaration: an invariant (`Refusal.isInvalidBy` matches it), or the tag of the write's own. */
export type RefusalMatch = Pick<Invariant, 'entity' | 'id'> | 'Unmet' | 'Conflict'

/** One write, the rows it starts from, and what every backend must say of it. */
export interface WriteScenario {
  readonly name: string
  /** Encoded rows, seeded before the write. */
  readonly given: ReadonlyArray<{ readonly entity: typeof Product; readonly row: Row }>
  /** Who asks: none is a visitor. */
  readonly principal: Option.Option<User>
  /** The clock the write is decided at, in milliseconds since the epoch. */
  readonly now: number
  readonly when: readonly [mutation: typeof ReserveStock, input: unknown]
  /** The operation id a retry repeats. */
  readonly operation: string
  readonly expect:
    /** `row` holds only the fields the write changes; the rest is what `given` seeded. */
    | { readonly _tag: 'Accepted'; readonly row: Row }
    | { readonly _tag: 'Refused'; readonly refusal: RefusalMatch }
    | { readonly _tag: 'Forbidden' }
    /** Nobody is signed in. */
    | { readonly _tag: 'Unauthenticated' }
}

/** One thing a backend owns and checked: what the scenario says it holds, and what it held. */
export interface ScenarioStep {
  readonly backend: string
  readonly step: string
  readonly expected: unknown
  readonly actual: unknown
}

/** Runs a scenario against one backend. */
export interface ScenarioRunner {
  readonly name: string
  readonly run: (
    scenario: WriteScenario,
  ) => Effect.Effect<ReadonlyArray<ScenarioStep>, unknown, never>
}

export const Scenario = {
  write: (scenario: WriteScenario): WriteScenario => scenario,
  accepted: (row: Row) => ({ _tag: 'Accepted', row }) as const,
  refused: (refusal: RefusalMatch) => ({ _tag: 'Refused', refusal }) as const,
  forbidden: { _tag: 'Forbidden' } as const,
  unauthenticated: { _tag: 'Unauthenticated' } as const,
}

/** What a decision reads as, whichever backend made it: the tag, and the rule an `Invalid` names. */
export type Decision =
  | { readonly _tag: 'Accepted' }
  | { readonly _tag: 'Refused'; readonly refusal: string }
  | { readonly _tag: 'Forbidden' }
  | { readonly _tag: 'Unauthenticated' }

/** The decision the scenario expects. */
export const expectedDecision = ({ expect }: WriteScenario): Decision =>
  Match.valueTags(expect, {
    Accepted: (): Decision => ({ _tag: 'Accepted' }),
    Forbidden: (): Decision => ({ _tag: 'Forbidden' }),
    Unauthenticated: (): Decision => ({ _tag: 'Unauthenticated' }),
    Refused: ({ refusal }): Decision => ({
      _tag: 'Refused',
      refusal: typeof refusal === 'string' ? refusal : `Invalid ${refusal.entity}.${refusal.id}`,
    }),
  })

/** Whether the scenario says the write lands. */
export const lands = ({ expect }: WriteScenario): boolean =>
  Match.valueTags(expect, {
    Accepted: () => true,
    Refused: () => false,
    Forbidden: () => false,
    Unauthenticated: () => false,
  })

/** The row the scenario seeded for `id`. */
export const seededRow = (scenario: WriteScenario, id: string): Row =>
  scenario.given.find(({ row }) => row['id'] === id)?.row ?? {}

/** The fields the scenario says the row holds afterwards: what the write changes, or the seeded ones. */
export const expectedRow = (scenario: WriteScenario, id: string): Row =>
  Match.valueTags(scenario.expect, {
    Accepted: ({ row }) => row,
    Refused: () => seededRow(scenario, id),
    Forbidden: () => seededRow(scenario, id),
    Unauthenticated: () => seededRow(scenario, id),
  })

/** The id of the row the write is aimed at. */
export const targetOf = ({ when: [, input] }: WriteScenario): string =>
  String((input as { readonly id: unknown }).id)

/** Whether a step's two sides say the same, as JSON would write them. */
const same = (left: unknown, right: unknown): boolean =>
  JSON.stringify(left) === JSON.stringify(right)

/** The steps whose sides differ. */
export const mismatches = (steps: ReadonlyArray<ScenarioStep>): ReadonlyArray<ScenarioStep> =>
  steps.filter(({ expected, actual }) => !same(expected, actual))

/** Runs a scenario on each runner and gathers every step. */
export const run = (scenario: WriteScenario, runners: ReadonlyArray<ScenarioRunner>) =>
  Effect.gen(function* () {
    const steps = (yield* Effect.forEach(runners, runner => runner.run(scenario))).flat()
    return { steps, mismatches: mismatches(steps) }
  })

/** A mismatch as a line: which backend, which step, and both sides. */
export const describeMismatch = ({ backend, step, expected, actual }: ScenarioStep): string =>
  `${backend} / ${step}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`

/** The fields of `row` that `of` names. */
export const pick = (row: Row, of: Row): Row =>
  Object.fromEntries(Object.keys(of).map(key => [key, row[key]]))
