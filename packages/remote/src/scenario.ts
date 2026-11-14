/**
 * `Scenario`: a write, or a Message, as plain data with what must come of it
 * (#538). A scenario holds no function and names no backend; a runner seeds
 * its backend from `given`, sends `when` as `principal` at `now` under
 * `operation`, and answers one `ScenarioStep` for each thing it owns and
 * checked. `run` compares each step's two sides and issues the evidence.
 */
import { Effect, type Layer, Match, Option, Result, Schema } from 'effect'
import {
  Entity,
  Finding,
  Footprint,
  LawVerdict,
  type AnyEntity,
  type AnyWrite,
  type Invariant,
  type LawReport as LawsReport,
  type Row,
  type WriteEntry,
} from 'foldkit-entity'
import { Evidence } from 'foldkit-metadata'
import { RemoteClient } from './client.js'
import { Law } from './law.js'
import type { RemoteDomain } from './index.js'
import type { MutationDescriptor } from './mutationDescriptor.js'
import { stableStringify } from './query.js'
import { REMOTE_PROTOCOL_VERSION } from './wire.js'
import { Walk } from './walk.js'

type AnyMutation = MutationDescriptor<string, any, any, any>

/**
 * A refusal named by its declaration: an invariant (`Refusal.isInvalidBy`
 * matches it, so a `Write.ensured` does too), or the tag of the write's own.
 */
export type RefusalMatch =
  | Pick<Invariant, 'entity' | 'id'>
  | 'Unmet'
  | 'Conflict'
  | 'Taken'
  | 'Referenced'

/** What every backend must say of a write. */
export type WriteExpectation =
  /** `row` holds only the fields the write changes; the rest is what `given` seeded. */
  | { readonly _tag: 'Accepted'; readonly row: Row }
  | { readonly _tag: 'Refused'; readonly refusal: RefusalMatch }
  | { readonly _tag: 'Forbidden' }
  /** Nobody is signed in. */
  | { readonly _tag: 'Unauthenticated' }

/** One write, the rows it starts from, and what every backend must say of it. */
export interface WriteScenario<Principal> {
  readonly name: string
  /** Encoded rows, seeded before the write: one or more per Entity. */
  readonly given: ReadonlyArray<{ readonly entity: AnyEntity; readonly row: Row }>
  /** Who asks: none is a visitor. */
  readonly principal: Option.Option<Principal>
  /** The clock the write is decided at, in milliseconds since the epoch. */
  readonly now: number
  readonly when: readonly [mutation: AnyMutation, input: unknown]
  /** The operation id a retry repeats. */
  readonly operation: string
  readonly expect: WriteExpectation
}

/** One thing a backend owns and checked: what the scenario says it holds, and what it held. */
export interface ScenarioStep {
  readonly backend: string
  readonly step: string
  readonly expected: unknown
  readonly actual: unknown
}

/** Runs a scenario against one backend. `name` is its steps' `backend`. */
export interface ScenarioRunner<Principal> {
  readonly name: string
  readonly run: (
    scenario: WriteScenario<Principal>,
  ) => Effect.Effect<ReadonlyArray<ScenarioStep>, unknown, never>
}

/** What a decision reads as, whichever backend made it: the tag, and the rule a refusal names. */
export type Decision =
  | { readonly _tag: 'Accepted' }
  | { readonly _tag: 'Refused'; readonly refusal: string }
  | { readonly _tag: 'Forbidden' }
  | { readonly _tag: 'Unauthenticated' }

/** What `run` found, and the evidence it issued. */
export interface ScenarioResult {
  readonly steps: ReadonlyArray<ScenarioStep>
  /** Every step whose two sides differ, each naming its backend and step. */
  readonly mismatches: ReadonlyArray<ScenarioStep>
  /** One `Scenario` record per runner with no mismatch, for each law the write could break. */
  readonly evidence: ReadonlyArray<Evidence>
}

const issuer = Evidence.issuer('foldkit-remote/scenario')

const refusalName = (refusal: RefusalMatch): string =>
  typeof refusal === 'string' ? refusal : `Invalid ${refusal.entity}.${refusal.id}`

/** Whether the scenario says the write lands. */
const lands = (expect: WriteExpectation): boolean =>
  Match.valueTags(expect, {
    Accepted: () => true,
    Refused: () => false,
    Forbidden: () => false,
    Unauthenticated: () => false,
  })

const expectedDecision = ({ expect }: { readonly expect: WriteExpectation }): Decision =>
  Match.valueTags(expect, {
    Accepted: (): Decision => ({ _tag: 'Accepted' }),
    Forbidden: (): Decision => ({ _tag: 'Forbidden' }),
    Unauthenticated: (): Decision => ({ _tag: 'Unauthenticated' }),
    Refused: ({ refusal }): Decision => ({ _tag: 'Refused', refusal: refusalName(refusal) }),
  })

/** The id of the row the write is aimed at, read from its encoded input. */
const target = ({ when: [mutation, input] }: WriteScenario<unknown>): string => {
  const key = mutation.write?.id.key ?? 'id'
  const encoded = Schema.encodeUnknownSync(mutation.Input)(input) as Readonly<
    Record<string, unknown>
  >
  return String(encoded[key])
}

/** The rows `given` seeds for `id`, whichever Entity. */
const seeded = (scenario: WriteScenario<unknown>, id: string): Row =>
  scenario.given.find(({ row }) => String(row['id']) === id)?.row ?? {}

/** The fields the scenario says the row holds afterwards: what the write changes, or the seeded ones. */
const expectedRow = (scenario: WriteScenario<unknown>, id: string): Row =>
  Match.valueTags(scenario.expect, {
    Accepted: ({ row }) => row,
    Refused: () => seeded(scenario, id),
    Forbidden: () => seeded(scenario, id),
    Unauthenticated: () => seeded(scenario, id),
  })

/** The fields of `row` that `of` names. */
const pick = (row: Row, of: Row): Row =>
  Object.fromEntries(Object.keys(of).map(key => [key, row[key]]))

const decodeRefusalOf = (mutation: AnyMutation, refusal: unknown) =>
  Schema.decodeUnknownOption(mutation.Refusal)(refusal)

/** What a failed mutation says, as a decision: its declared refusal, `Forbidden`, `Unauthenticated`, or the failure's own tag. */
const failedAs = (
  mutation: AnyMutation,
  failure: { readonly _tag: string; readonly refusal?: unknown },
): Decision =>
  Match.value(failure._tag).pipe(
    Match.when('Forbidden', (): Decision => ({ _tag: 'Forbidden' })),
    Match.when('Unauthenticated', (): Decision => ({ _tag: 'Unauthenticated' })),
    Match.when('RemoteMutationError', (): Decision =>
      Option.match(decodeRefusalOf(mutation, failure.refusal), {
        onNone: () => ({ _tag: 'Refused', refusal: `Failed ${failure._tag}` }),
        onSome: refusal => ({
          _tag: 'Refused',
          refusal: Match.value(refusal as { readonly _tag: string }).pipe(
            Match.when(
              { _tag: 'Invalid' },
              ({ entity, rule }: any) =>
                `Invalid ${Option.getOrElse(entity as Option.Option<string>, () => '?')}.${Option.getOrElse(rule as Option.Option<string>, () => '?')}`,
            ),
            Match.orElse(({ _tag }) => _tag),
          ),
        }),
      }),
    ),
    Match.orElse((tag): Decision => ({ _tag: 'Refused', refusal: `Failed ${tag}` })),
  )

/** Whatever a mutation call answered, as one `Decision`. */
const decisionOf = <E extends { readonly _tag: string }, R>(
  mutation: AnyMutation,
  call: Effect.Effect<unknown, E, R>,
): Effect.Effect<Decision, never, R> =>
  Effect.map(Effect.result(call), result =>
    Result.isSuccess(result) ? ({ _tag: 'Accepted' } as const) : failedAs(mutation, result.failure),
  )

/** Whether a step's two sides say the same, as JSON would write them. */
const same = (left: unknown, right: unknown): boolean =>
  stableStringify(left) === stableStringify(right)

const mismatches = (steps: ReadonlyArray<ScenarioStep>): ReadonlyArray<ScenarioStep> =>
  steps.filter(({ expected, actual }) => !same(expected, actual))

/** A mismatch as a line: which backend, which step, and both sides. */
const describeMismatch = ({ backend, step, expected, actual }: ScenarioStep): string =>
  `${backend} / ${step}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`

/** What `Scenario.remote` is made from. */
export interface RemoteRunnerOptions<AppModel, Principal> {
  readonly data: RemoteDomain<AppModel, any, any, any, any>
  /** The application's Model before the client holds anything. */
  readonly model: AppModel
  /**
   * A server over exactly these rows, answering as this principal. Called
   * twice for one scenario, once per run it makes, so each call must give
   * a backend of its own: a shared one would hold the first write when the
   * second is judged.
   */
  readonly backend: (
    rows: WriteScenario<Principal>['given'],
    principal: Option.Option<Principal>,
  ) => Layer.Layer<RemoteClient, unknown>
}

const encodedInput = (scenario: WriteScenario<unknown>) =>
  Schema.encodeUnknownSync(scenario.when[0].Input)(scenario.when[1])

/**
 * Runs a scenario through `Law.check`, so the client's prediction and the
 * server's answer are compared in the same run, and through the server alone
 * for the decision and the row it leaves. Steps: `law` (the client and the
 * server agree), `decision`, and `row`, which a `Forbidden` or an
 * `Unauthenticated` scenario has none of, since nobody it names may read it.
 *
 * `operation` is sent with the write, but `Law.check` does not take one: a
 * runner that asserts a ledger is an example's.
 */
const remote = <AppModel, Principal>(
  options: RemoteRunnerOptions<AppModel, Principal>,
): ScenarioRunner<Principal> => ({
  name: 'remote',
  run: scenario =>
    Effect.gen(function* () {
      const [mutation, input] = scenario.when
      const id = target(scenario)
      const entities = [...new Set(scenario.given.map(({ entity }) => entity))]
      const holds = entities.map(entity => ({
        entity,
        ids: scenario.given
          .filter(each => each.entity === entity)
          .map(({ row }) => String(row['id'])),
      }))
      // Nobody it refuses may read the row, and the client cannot know who asks, so the
      // prediction is compared only for a write the principal may make.
      const readable = Match.valueTags(scenario.expect, {
        Accepted: () => true,
        Refused: () => true,
        Forbidden: () => false,
        Unauthenticated: () => false,
      })
      const report = readable
        ? yield* Law.check(options.data, {
            model: options.model,
            holds,
            mutation,
            input,
            now: scenario.now,
          }).pipe(Effect.provide(options.backend(scenario.given, scenario.principal)))
        : undefined
      const served = Effect.gen(function* () {
        const client = yield* RemoteClient
        const decision = yield* decisionOf(
          mutation,
          client.mutate({
            requestId: scenario.operation,
            operation: scenario.operation,
            mutation: mutation.name,
            input: encodedInput(scenario),
            now: scenario.now,
          }),
        )
        const wanted = expectedRow(scenario, id)
        const entity = mutation.write?.input.entity.name
        const read =
          entity === undefined
            ? undefined
            : yield* client.read({
                version: REMOTE_PROTOCOL_VERSION,
                requests: [{ entity, id, fields: Object.keys(wanted) }],
              })
        const held = read?.entities.find(each => each.entity === entity && each.id === id)
        return { decision, wanted, held: (held?.values ?? {}) as Row }
      })
      const after = yield* served.pipe(
        Effect.provide(options.backend(scenario.given, scenario.principal)),
      )
      return [
        ...(report === undefined
          ? []
          : [{ backend: 'remote', step: 'law', expected: [], actual: report.disagreed }]),
        {
          backend: 'remote',
          step: 'decision',
          expected: expectedDecision(scenario),
          actual: after.decision,
        },
        ...(readable
          ? [
              {
                backend: 'remote',
                step: 'row',
                expected: after.wanted,
                actual: pick(after.held, after.wanted),
              },
            ]
          : []),
      ]
    }),
})

/** The invariants a write could break: each pair of its name whose invariant reads a member it writes. */
const lawsOf = (report: LawsReport, write: string): ReadonlyArray<string> => {
  const found = report.pairs
    .filter(pair => pair.write === write && !pair.postcondition)
    .filter(pair =>
      Footprint.$match(pair.footprint, {
        Derived: ({ writes }) => pair.reads.some(key => writes.includes(key)),
        Declared: ({ writes }) => pair.reads.some(key => writes.includes(key)),
        Unknown: () => true,
      }),
    )
    .map(pair => `${pair.entity}.${pair.invariant}`)
  return [...new Set(found)]
}

const agreesOn = (row: Row, partial: Row): boolean =>
  Object.entries(partial).every(([key, value]) => same(row[key], value))

/**
 * Refuses a scenario that expects what the report disproved: a write that
 * lands where an invariant refuses it, or a refusal by an invariant the
 * report kept the write from ever breaking.
 */
const checkAgainst = (scenario: WriteScenario<unknown>, report: LawsReport): void => {
  const [mutation] = scenario.when
  const encoded = encodedInput(scenario) as Row
  const row = seeded(scenario, target(scenario))
  const pairs = report.pairs.filter(pair => pair.write === mutation.name)
  const fail = (what: string): never => {
    throw new Error(`[foldkit-remote] Scenario "${scenario.name}": ${what}`)
  }
  Match.valueTags(scenario.expect, {
    Accepted: () => {
      for (const pair of pairs)
        LawVerdict.$match(pair.verdict, {
          Refused: ({ steps }) => {
            const step = steps.find(
              each => agreesOn(row, each.before) && agreesOn(encoded, each.input),
            )
            if (step !== undefined)
              fail(
                `expects ${mutation.name} to land, but Laws.check refused it against ${pair.entity}.${pair.invariant}: from ${JSON.stringify(step.before)} it leaves ${JSON.stringify(step.after)}`,
              )
          },
          Kept: () => {},
          Undecided: () => {},
        })
    },
    Refused: ({ refusal }) => {
      if (typeof refusal === 'string') return
      const pair = pairs.find(
        each => each.entity === refusal.entity && each.invariant === refusal.id,
      )
      if (pair === undefined) return
      LawVerdict.$match(pair.verdict, {
        Kept: ({ by }) => {
          if (by === 'disjointness' || by === 'enumeration')
            fail(
              `expects ${mutation.name} to be refused by ${refusal.entity}.${refusal.id}, but Laws.check kept it (${by})`,
            )
        },
        Refused: () => {},
        Undecided: () => {},
      })
    },
    Forbidden: () => {},
    Unauthenticated: () => {},
  })
}

/**
 * Runs `scenario` on every runner, compares what each said with what the
 * scenario expects, and issues one `Scenario` record per runner that had no
 * mismatch, for each invariant the write could break (given `report`).
 *
 * With `report`, a scenario that expects what enumeration disproved throws
 * here, before any runner runs. The runners run in order.
 */
const run = <Principal>(
  scenario: WriteScenario<Principal>,
  runners: ReadonlyArray<ScenarioRunner<Principal>>,
  options: { readonly report?: LawsReport | undefined } = {},
): Effect.Effect<ScenarioResult, unknown, never> => {
  if (options.report !== undefined) checkAgainst(scenario, options.report)
  return Effect.gen(function* () {
    const steps = (yield* Effect.forEach(runners, runner => runner.run(scenario))).flat()
    const wrong = mismatches(steps)
    const [mutation] = scenario.when
    const laws =
      options.report === undefined || !lands(scenario.expect)
        ? []
        : lawsOf(options.report, mutation.name)
    const evidence = runners
      .filter(
        runner =>
          steps.some(({ backend }) => backend === runner.name) &&
          !wrong.some(({ backend }) => backend === runner.name),
      )
      .flatMap(runner =>
        laws.map(law =>
          issuer.issue(
            Evidence.Scenario({
              transition: `write:${mutation.name}`,
              law,
              name: scenario.name,
              runner: runner.name,
            }),
          ),
        ),
      )
    return { steps, mismatches: wrong, evidence }
  })
}

/** A state the report's arrow or pair needs a row in, and none of `starts` is. */
const noStart = (what: string): never => {
  throw new Error(
    `[foldkit-remote] Scenario.fromReport: no start fits ${what}; give one in \`starts\``,
  )
}

/** What `fromReport` is given beside the report. */
export interface FromReportOptions<Principal> {
  /** The declared writes the report was made from, by their mutations. */
  readonly writes: ReadonlyArray<AnyMutation & WriteEntry>
  /** Encoded rows to start from: one per state or refusal the report names must fit one. */
  readonly starts: ReadonlyArray<{ readonly entity: AnyEntity; readonly row: Row }>
  readonly principal: Option.Option<Principal>
  readonly now: number
}

/** The row an input leaves: the fields it sets, over `row`. */
const setOver = (write: AnyWrite, encoded: Row): Row =>
  Object.fromEntries(write.sets.map(set => [set.field.key, encoded[set.key]]))

/**
 * The scenarios a report implies: an acceptance for each arrow it says holds,
 * a rejection for each refused pair. Each runs the reference judge's answer
 * against the application's own stack. A pair a write only states by its
 * author's word (`Declared`), an undecided one and an undeclared arrow
 * imply none, since the report decided nothing there.
 */
const fromReport = <Principal>(
  report: LawsReport,
  options: FromReportOptions<Principal>,
): ReadonlyArray<WriteScenario<Principal>> => {
  const writeOf = (name: string) => {
    const found = options.writes.find(each => each.name === name)
    if (found === undefined)
      throw new Error(`[foldkit-remote] Scenario.fromReport: \`writes\` has no ${name}`)
    return found
  }
  const startsOf = (entity: string) => options.starts.filter(start => start.entity.name === entity)
  let count = 0
  const make = (
    name: string,
    mutation: AnyMutation & WriteEntry,
    start: { readonly entity: AnyEntity; readonly row: Row },
    input: Record<string, unknown>,
    expect: WriteExpectation,
  ): WriteScenario<Principal> => ({
    name,
    given: [start],
    principal: options.principal,
    now: options.now,
    when: [mutation, Schema.decodeUnknownSync(mutation.Input)(input)],
    operation: `${mutation.name}:${++count}`,
    expect,
  })
  const holds = report.findings.flatMap(finding =>
    Finding.$match(finding, {
      Undeclared: () => [],
      Enforced: () => [],
      Refused: () => [],
      Unreached: () => [],
      Terminal: () => [],
      Holds: finding => [
        (() => {
          const mutation = writeOf(finding.write)
          const entity = mutation.write.input.entity
          const named = (state: string) => Entity.states(entity).find(each => each.name === state)
          const from = named(finding.from)
          const to = named(finding.to)
          const label = `${finding.write}: ${finding.from} -> ${finding.to}`
          if (from === undefined || to === undefined) return noStart(label)
          for (const start of startsOf(finding.entity)) {
            if (!Option.contains(Entity.inState(from, start.row), true)) continue
            const draws = Walk.states(mutation.Input, { count: 20, seed: 1 })
            for (const draw of draws) {
              const encoded = {
                ...(Schema.encodeUnknownSync(mutation.Input)(draw.start()) as Row),
                [mutation.write.id.key]: start.row['id'],
              }
              const after = { ...start.row, ...setOver(mutation.write, encoded) }
              if (Option.contains(Entity.inState(to, after), true))
                return make(label, mutation, start, encoded, {
                  _tag: 'Accepted',
                  row: setOver(mutation.write, encoded),
                })
            }
          }
          return noStart(label)
        })(),
      ],
    }),
  )
  const refused = report.pairs.flatMap(pair =>
    LawVerdict.$match(pair.verdict, {
      Kept: () => [],
      Undecided: () => [],
      Refused: ({ steps }) => {
        if (pair.postcondition) return []
        const mutation = writeOf(pair.write)
        const label = `${pair.write} x ${pair.invariant}`
        for (const step of steps)
          for (const start of startsOf(pair.entity))
            if (agreesOn(start.row, step.before))
              return [
                make(
                  `${label}: refused`,
                  mutation,
                  start,
                  { ...step.input, [mutation.write.id.key]: start.row['id'] },
                  { _tag: 'Refused', refusal: { entity: pair.entity, id: pair.invariant } },
                ),
              ]
        return noStart(label)
      },
    }),
  )
  return [...holds, ...refused]
}

/** What a Message scenario expects of the Model after `when`. */
export type MessageExpectation =
  /** The reader (named in `runMessages`'s `readers`) answers `equals`, and no law is broken. */
  | { readonly _tag: 'Reads'; readonly reader: string; readonly equals: unknown }
  /** The contract's judge names this law broken by the step. */
  | { readonly _tag: 'Breaks'; readonly law: string }

/** A history of Messages, one more, and what must come of it. */
export interface MessageScenario<Message> {
  readonly name: string
  /** Applied from `initial`, in order. */
  readonly given: ReadonlyArray<Message>
  readonly when: Message
  readonly expect: MessageExpectation
}

/** What `runMessages` runs over: the application, how to read its Model, and the laws that judge a step. */
export interface MessageRunOptions<Model, Message> {
  readonly app: {
    readonly initial: Model
    readonly update: (model: Model, message: Message) => { readonly model: Model }
  }
  /** Named readings of the Model, so a scenario survives a change to how the Model holds its state. */
  readonly readers: Readonly<Record<string, (model: Model) => unknown>>
  /** The first law the step from `before` to `after` breaks, as a contract's `judge` says. */
  readonly judge?:
    | ((before: Model, after: Model) => Option.Option<{ readonly id: string }>)
    | undefined
  /** With it, a scenario with no mismatch issues a `Scenario` record for `transition` against each of `laws`. */
  readonly evidence?:
    | { readonly transition: string; readonly laws: ReadonlyArray<string> }
    | undefined
}

const reader = <Model>(
  scenario: { readonly name: string },
  readers: Readonly<Record<string, (model: Model) => unknown>>,
  name: string,
): ((model: Model) => unknown) => {
  const found = Object.hasOwn(readers, name) ? readers[name] : undefined
  if (found === undefined)
    throw new Error(`[foldkit-remote] Scenario "${scenario.name}": \`readers\` has no "${name}"`)
  return found
}

/** Applies the history and `when` over the Model, and judges `expect`. */
const runMessages = <Model, Message>(
  scenario: MessageScenario<Message>,
  options: MessageRunOptions<Model, Message>,
): ScenarioResult => {
  const history = scenario.given.reduce(
    (model, message) => options.app.update(model, message).model,
    options.app.initial,
  )
  const after = options.app.update(history, scenario.when).model
  const broken = Option.flatMap(Option.fromUndefinedOr(options.judge), judge =>
    judge(history, after),
  )
  const backend = 'messages'
  const brokenLaw = Option.match(broken, { onNone: () => 'none', onSome: ({ id }) => id })
  const steps: ReadonlyArray<ScenarioStep> = Match.valueTags(scenario.expect, {
    Reads: ({ reader: name, equals }): ReadonlyArray<ScenarioStep> => [
      {
        backend,
        step: `reads ${name}`,
        expected: equals,
        actual: reader(scenario, options.readers, name)(after),
      },
      { backend, step: 'law', expected: 'none', actual: brokenLaw },
    ],
    Breaks: ({ law }): ReadonlyArray<ScenarioStep> => [
      { backend, step: 'law', expected: law, actual: brokenLaw },
    ],
  })
  const wrong = mismatches(steps)
  const reading = Match.valueTags(scenario.expect, { Reads: () => true, Breaks: () => false })
  const evidence =
    wrong.length > 0 || options.evidence === undefined || !reading
      ? []
      : options.evidence.laws.map(law =>
          issuer.issue(
            Evidence.Scenario({
              transition: options.evidence!.transition,
              law,
              name: scenario.name,
              runner: backend,
            }),
          ),
        )
  return { steps, mismatches: wrong, evidence }
}

export const Scenario = {
  /** A write scenario; the types are the declaration. */
  write: <Principal>(scenario: WriteScenario<Principal>): WriteScenario<Principal> => scenario,
  /** The write lands; `row` holds the fields it changes. */
  accepted: (row: Row): WriteExpectation => ({ _tag: 'Accepted', row }),
  /** Refused by an invariant (or a write's `ensures`), or by `'Unmet'`, `'Conflict'`, `'Taken'`, `'Referenced'`. */
  refused: (refusal: RefusalMatch): WriteExpectation => ({ _tag: 'Refused', refusal }),
  forbidden: { _tag: 'Forbidden' } as WriteExpectation,
  unauthenticated: { _tag: 'Unauthenticated' } as WriteExpectation,
  remote,
  run,
  fromReport,
  /** A Message scenario. */
  messages: <Message>(scenario: MessageScenario<Message>): MessageScenario<Message> => scenario,
  reads: (reader: string, equals: unknown): MessageExpectation => ({
    _tag: 'Reads',
    reader,
    equals,
  }),
  breaks: (law: string): MessageExpectation => ({ _tag: 'Breaks', law }),
  runMessages,
  /** For a runner of another package: the decision a failed call reads as, and the scenario's own sides. */
  decisionOf,
  expectedDecision,
  expectedRow,
  target,
  pick,
  mismatches,
  describeMismatch,
}
