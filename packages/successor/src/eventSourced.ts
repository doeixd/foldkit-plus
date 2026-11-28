import { Data, Effect, Option, Schema, Scope, type Context } from 'effect'
import {
  StoreRefused,
  refused,
  type Requirement,
  type StoreCapabilities,
} from '@doeixd/metakit/store'
import {
  AtomicJournal,
  DispatchConflict,
  Journal,
  RevisionConflict,
  TransactionConflict,
  sameDispatch,
  sameTransaction,
  validateTransaction,
  wireCommit,
  wireSnapshot,
  type DispatchIdentity,
  type History,
  type JournalFailure,
  type JournalStore,
  type TransactionFailure,
  type TransactionReceipt,
  type WireCommit,
  type WireFact,
  type WireSnapshot,
} from './journal.js'

type Codec = Schema.Codec<unknown, unknown>
type Codecs = Readonly<Record<string, Codec>>
type Key<T> = keyof T & string
type SomeFact = { readonly type: string; readonly payload: unknown }

export type Fact<T extends Codecs> = {
  readonly [K in Key<T>]: { readonly type: K; readonly payload: T[K]['Type'] }
}[Key<T>]

export interface Command {
  readonly id: string
  readonly fact: WireFact
}

export type Decision<Event, Reason> =
  | {
      readonly kind: 'accepted'
      readonly events: ReadonlyArray<Event>
      readonly commands?: ReadonlyArray<WireFact>
    }
  | { readonly kind: 'rejected'; readonly reason: Reason }

export type Disposition<Event, Reason> =
  | {
      readonly kind: 'accepted'
      readonly revision: number
      readonly events: ReadonlyArray<Event>
      readonly commands: ReadonlyArray<Command>
    }
  | { readonly kind: 'rejected'; readonly revision: number; readonly reason: Reason }

export interface Message<State, Input, Event, Reason, Failure, Services> {
  readonly input: Schema.Codec<Input, unknown>
  readonly decide: (
    state: State,
    input: Input,
  ) => Effect.Effect<Decision<Event, Reason>, Failure, Services>
  readonly readEvent: (fact: WireFact) => Event
  readonly readReason: (fact: WireFact) => Reason
}

type Messages<State> = Readonly<
  Record<
    string,
    {
      readonly input: Codec
      readonly decide: (
        state: State,
        input: never,
      ) => Effect.Effect<Decision<SomeFact, SomeFact>, unknown, unknown>
      readonly readEvent: (fact: WireFact) => SomeFact
      readonly readReason: (fact: WireFact) => SomeFact
    }
  >
>
type InputOf<M> = M extends { readonly input: Schema.Codec<infer I, unknown> } ? I : never
type FailureOf<M> = M extends {
  readonly decide: (...args: never[]) => Effect.Effect<unknown, infer E, unknown>
}
  ? E
  : never
type ServicesOf<M> = M extends {
  readonly decide: (...args: never[]) => Effect.Effect<unknown, unknown, infer R>
}
  ? R
  : never
type EventOf<M> = M extends { readonly readEvent: (fact: WireFact) => infer E } ? E : never
type ReasonOf<M> = M extends { readonly readReason: (fact: WireFact) => infer Q } ? Q : never

export class InvalidHistory extends Data.TaggedError('SuccessorInvalidHistory')<{
  readonly operation: string
  readonly cause: unknown
}> {}

export class MachineClosed extends Data.TaggedError('SuccessorMachineClosed')<{
  readonly stream: string
}> {}

type HostFailure = InvalidHistory | JournalFailure | MachineClosed

export interface Revision<State> {
  readonly revision: number
  readonly state: State
}

export type Request<Arm, K extends string> = {
  readonly id: string
  readonly expectedRevision: number
  readonly type: K
  readonly input: NoInfer<InputOf<Arm>>
}

export type Answer<Arm> = Disposition<EventOf<Arm>, ReasonOf<Arm>>

export interface LiveMachine<State, Arms extends Messages<State>> {
  readonly read: Effect.Effect<Revision<State>, HostFailure>
  readonly checkpoint: Effect.Effect<Revision<State>, HostFailure>
  readonly dispatch: <K extends Key<Arms>>(
    request: Request<Arms[K], K>,
  ) => Effect.Effect<
    Answer<Arms[K]>,
    HostFailure | DispatchConflict | RevisionConflict | FailureOf<Arms[K]>,
    ServicesOf<Arms[K]>
  >
}

export interface Transport<State, Arms extends Messages<State>, Failure> {
  readonly read: Effect.Effect<Revision<State>, Failure>
  readonly dispatch: <K extends Key<Arms>>(
    request: Request<Arms[K], K>,
  ) => Effect.Effect<Answer<Arms[K]>, Failure>
}

type DispatchFailure<Arms> = HostFailure | DispatchConflict | RevisionConflict | FailureOf<Arms>

/** Supply every live decision service at the authoritative host. */
export const serve = <State, Arms extends Messages<State>>(
  machine: LiveMachine<State, Arms>,
  services: Context.Context<ServicesOf<Arms[Key<Arms>]>>,
): Transport<State, Arms, DispatchFailure<Arms[Key<Arms>]>> => ({
  read: machine.read,
  dispatch: <K extends Key<Arms>>(request: Request<Arms[K], K>) => {
    // Each message uses a subset of the requirements of the whole machine.
    const work = machine.dispatch(request) as Effect.Effect<
      Answer<Arms[K]>,
      DispatchFailure<Arms[Key<Arms>]>,
      ServicesOf<Arms[Key<Arms>]>
    >
    return Effect.provideContext(work, services)
  },
})

/** The client needs a transport for the contract, regardless of the server's decision services. */
export const client = <State, Arms extends Messages<State>, Failure, Service>(
  transport: Context.Key<Service, Transport<State, Arms, Failure>>,
) => ({
  read: Effect.flatMap(transport, connection => connection.read),
  dispatch: <K extends Key<Arms>>(request: Request<Arms[K], K>) =>
    Effect.flatMap(transport, connection => connection.dispatch(request)),
})

const encodeJson = <A>(codec: Schema.Codec<A, unknown>, value: A): Schema.Json =>
  Schema.decodeUnknownSync(Schema.Json)(Schema.encodeSync(codec)(value))
const decode = <A>(schema: Schema.Codec<A, unknown>, value: unknown): A =>
  Schema.decodeUnknownSync(schema, { onExcessProperty: 'error' })(value)

const factFrom = (codecs: Codecs, fact: WireFact): SomeFact => {
  if (!Object.hasOwn(codecs, fact.type)) throw new Error(`Unknown fact "${fact.type}"`)
  return { type: fact.type, payload: decode(codecs[fact.type]!, fact.payload) }
}

const factTo = (codecs: Codecs, fact: SomeFact): WireFact => {
  if (!Object.hasOwn(codecs, fact.type)) throw new Error(`Unknown fact "${fact.type}"`)
  return { type: fact.type, payload: encodeJson(codecs[fact.type]!, fact.payload) }
}

export const streamId = (machine: string, aggregate: string): string =>
  JSON.stringify([machine, aggregate])

/** One stream stores each accepted event batch and its commands at the same revision. */
export const atomicCommit: Requirement<'atomic event batch'> = {
  rule: 'atomic event batch',
  needs: 'parent-serialized',
  judged: 'constraint',
  because: 'competing writers must publish at most one commit for each stream revision',
}

const atomicStreams: Requirement<'atomic event streams'> = {
  rule: 'atomic event streams',
  needs: 'row-atomic',
  judged: 'read-first',
  because: 'all streams and their receipt must commit in the same serializable transaction',
}

export interface TransactionMember<Answer, Failure, Services> {
  readonly stream: string
  readonly dispatchId: string
  readonly expectedRevision: number
  readonly input: Effect.Effect<WireFact, InvalidHistory>
  readonly prepare: (
    journal: JournalStore,
    input: WireFact,
  ) => Effect.Effect<
    WireCommit,
    InvalidHistory | JournalFailure | RevisionConflict | Failure,
    Services
  >
  readonly describe: (record: WireCommit) => Effect.Effect<Answer, InvalidHistory>
}

type AnyMember = TransactionMember<unknown, unknown, unknown>
type MemberAnswer<T> = T extends TransactionMember<infer A, unknown, unknown> ? A : never
type MemberFailure<T> = T extends TransactionMember<unknown, infer E, unknown> ? E : never
type MemberServices<T> = T extends TransactionMember<unknown, unknown, infer R> ? R : never
type TransactionDispatchFailure = InvalidHistory | StoreRefused | TransactionFailure

/** Publish every member's disposition in one commit, including recorded domain rejections. */
export const commitTogether = <
  const Members extends readonly [AnyMember, AnyMember, ...AnyMember[]],
>(
  id: string,
  members: Members,
): Effect.Effect<
  { readonly [K in keyof Members]: MemberAnswer<Members[K]> },
  TransactionDispatchFailure | MemberFailure<Members[number]>,
  AtomicJournal | MemberServices<Members[number]>
> => {
  const work = Effect.gen(function* () {
    const journal = yield* AtomicJournal
    const missing = refused(journal.capabilities, [atomicStreams])
    if (missing.length !== 0) {
      return yield* new StoreRefused({ store: journal.capabilities, refused: missing })
    }
    yield* validateTransaction(id, members)
    const inputs = yield* Effect.forEach(members, member => member.input)
    const identities: ReadonlyArray<DispatchIdentity> = members.map(
      ({ stream, dispatchId }, index) => ({ stream, dispatchId, input: inputs[index]! }),
    )
    const answers = (receipt: TransactionReceipt) =>
      sameTransaction(receipt, identities)
        ? Effect.forEach(members, (member, index) => member.describe(receipt[index]!.commit))
        : Effect.fail(new TransactionConflict({ transactionId: id }))
    const previous = yield* journal.findTransaction(id)
    if (Option.isSome(previous)) return yield* answers(previous.value)
    const attempt = Effect.gen(function* () {
      const entries = yield* Effect.forEach(members, (member, index) =>
        Effect.map(member.prepare(journal, inputs[index]!), commit => ({
          stream: member.stream,
          expectedRevision: member.expectedRevision,
          commit,
        })),
      )
      const receipt = yield* journal.appendTransaction(id, entries)
      return yield* answers(receipt)
    })
    return yield* Effect.catch(attempt, error =>
      Effect.gen(function* () {
        if (error instanceof RevisionConflict || error instanceof DispatchConflict) {
          const saved = yield* journal.findTransaction(id)
          if (Option.isSome(saved)) return yield* answers(saved.value)
        }
        return yield* Effect.fail(error)
      }),
    )
  })
  // The receipt is checked against the member identity at every position before decoding.
  return work as Effect.Effect<
    { readonly [K in keyof Members]: MemberAnswer<Members[K]> },
    TransactionDispatchFailure | MemberFailure<Members[number]>,
    AtomicJournal | MemberServices<Members[number]>
  >
}

export interface Definition<State, Arms extends Messages<State>> {
  readonly replay: (aggregate: string, history: History) => Revision<State>
  readonly open: (
    aggregate: string,
  ) => Effect.Effect<LiveMachine<State, Arms>, StoreRefused, Journal | Scope.Scope>
  readonly member: <K extends Key<Arms>>(
    aggregate: string,
    request: Request<Arms[K], K>,
  ) => TransactionMember<Answer<Arms[K]>, FailureOf<Arms[K]>, ServicesOf<Arms[K]>>
}

export type TransportOf<Plan, Failure> =
  Plan extends Definition<infer State, infer Arms> ? Transport<State, Arms, Failure> : never

/** Define the schema and the single pure event fold before constructing message decisions. */
export const define = <State, Events extends Codecs, Reasons extends Codecs>(config: {
  readonly name: string
  readonly version: number
  readonly state: Schema.Codec<State, unknown>
  readonly initial: (aggregate: string) => State
  readonly events: Events
  readonly reasons: Reasons
  readonly evolve: {
    readonly [K in Key<Events>]: (state: State, payload: Events[K]['Type']) => State
  }
  /** Upgrade one full record, retaining stream position and dispatch identity. */
  readonly migrate?: (record: WireCommit) => unknown
  readonly migrateSnapshot?: (snapshot: WireSnapshot) => unknown
}) => {
  if (config.name.length === 0 || !Number.isSafeInteger(config.version) || config.version < 1) {
    throw new Error('A machine needs a nonempty name and a positive integer version')
  }
  const applyEvent = (state: State, event: Fact<Events>): State =>
    config.evolve[event.type](state, event.payload)
  const acceptsState = Schema.is(config.state)

  const message = <
    Input,
    E extends Key<Events>,
    Q extends Key<Reasons>,
    Facts,
    Failure,
    Services,
  >(options: {
    readonly input: Schema.Codec<Input, unknown>
    readonly emits: ReadonlyArray<E>
    readonly rejects: ReadonlyArray<Q>
    readonly resolve: (input: Input) => Effect.Effect<Facts, Failure, Services>
    readonly decide: (
      state: State,
      input: Input,
      facts: Facts,
    ) => Decision<
      Extract<Fact<Events>, { readonly type: NoInfer<E> }>,
      Extract<Fact<Reasons>, { readonly type: NoInfer<Q> }>
    >
  }): Message<
    State,
    Input,
    Extract<Fact<Events>, { readonly type: E }>,
    Extract<Fact<Reasons>, { readonly type: Q }>,
    Failure,
    Services
  > => {
    type Event = Extract<Fact<Events>, { readonly type: E }>
    type Reason = Extract<Fact<Reasons>, { readonly type: Q }>
    const narrow = <F>(names: ReadonlyArray<string>, codecs: Codecs, fact: WireFact): F => {
      if (!names.includes(fact.type)) throw new Error(`Unexpected fact "${fact.type}" for message`)
      return factFrom(codecs, fact) as F
    }
    const emits = [...options.emits]
    const rejects = [...options.rejects]
    return {
      input: options.input,
      decide: (state, input) =>
        Effect.map(options.resolve(input), facts => options.decide(state, input, facts)),
      readEvent: fact => narrow<Event>(emits, config.events, fact),
      readReason: fact => narrow<Reason>(rejects, config.reasons, fact),
    }
  }

  const prepare = (record: WireCommit): WireCommit => {
    if (record.version === config.version) return record
    const migrated = decode(wireCommit, config.migrate?.(record))
    if (
      migrated.version !== config.version ||
      migrated.revision !== record.revision ||
      migrated.dispatchId !== record.dispatchId
    ) {
      throw new Error(`Invalid migration at revision ${record.revision}`)
    }
    return migrated
  }

  const readSnapshot = (saved: WireSnapshot): Revision<State> => {
    const snapshot =
      saved.version === config.version
        ? saved
        : decode(wireSnapshot, config.migrateSnapshot?.(saved))
    if (snapshot.revision !== saved.revision || snapshot.version !== config.version) {
      throw new Error(`Invalid snapshot version at revision ${saved.revision}`)
    }
    return { state: decode(config.state, snapshot.state), revision: snapshot.revision }
  }

  const run = <Arms extends Messages<State>>(declarations: Arms): Definition<State, Arms> => {
    const arms = { ...declarations }
    const armOf = (type: string): Arms[Key<Arms>] => {
      if (!Object.hasOwn(arms, type)) throw new Error(`Unknown message "${type}"`)
      return arms[type as Key<Arms>]!
    }

    const applyCommit = (state: State, record: WireCommit): State => {
      const arm = armOf(record.input.type)
      decode(arm.input, record.input.payload)
      const disposition = record.disposition
      if (disposition.kind === 'rejected') {
        arm.readReason(disposition.reason)
        return state
      }
      const next = disposition.events.reduce(
        (candidate, fact) => applyEvent(candidate, arm.readEvent(fact) as Fact<Events>),
        state,
      )
      if (!acceptsState(next)) throw new Error(`Invalid state at revision ${record.revision}`)
      return next
    }

    const replay = (aggregate: string, history: History): Revision<State> => {
      let { state, revision } = Option.match(history.snapshot, {
        onNone: () => {
          const initial = config.initial(aggregate)
          if (!acceptsState(initial)) throw new Error('Invalid initial state')
          return { revision: 0, state: initial }
        },
        onSome: readSnapshot,
      })
      for (const raw of history.commits) {
        const record = prepare(raw)
        if (record.revision !== revision + 1) throw new Error(`Expected revision ${revision + 1}`)
        state = applyCommit(state, record)
        revision = record.revision
      }
      return { state, revision }
    }

    const checked = <A>(operation: string, work: () => A) =>
      Effect.try({ try: work, catch: cause => new InvalidHistory({ operation, cause }) })

    const routeOf = <K extends Key<Arms>>(stream: string, request: Request<Arms[K], K>) => {
      type Arm = Arms[K]
      // The message builder links the schema, decision and decoders before this lookup.
      const arm = arms[request.type] as unknown as Message<
        State,
        InputOf<Arm>,
        EventOf<Arm>,
        ReasonOf<Arm>,
        FailureOf<Arm>,
        ServicesOf<Arm>
      >
      const describe = (raw: WireCommit) =>
        checked('read disposition', (): Answer<Arm> => {
          const found = prepare(raw)
          const disposition = found.disposition
          if (disposition.kind === 'rejected') {
            return {
              kind: 'rejected',
              revision: found.revision,
              reason: arm.readReason(disposition.reason),
            }
          }
          return {
            kind: 'accepted',
            revision: found.revision,
            events: disposition.events.map(arm.readEvent),
            commands: disposition.commands,
          }
        })
      const input = checked('dispatch input', () => {
        armOf(request.type)
        if (request.id.length === 0) throw new Error('A dispatch needs a stable identity')
        return { type: request.type, payload: encodeJson(arm.input, request.input) }
      })
      const makeCommit = (current: Revision<State>, fact: WireFact) =>
        Effect.flatMap(arm.decide(current.state, request.input), decision =>
          checked('prepare commit', () => {
            const disposition: WireCommit['disposition'] =
              decision.kind === 'accepted'
                ? {
                    kind: 'accepted',
                    events: decision.events.map(event => factTo(config.events, event)),
                    commands: (decision.commands ?? []).map((entry, index) => ({
                      id: JSON.stringify([stream, request.id, index]),
                      fact: entry,
                    })),
                  }
                : { kind: 'rejected', reason: factTo(config.reasons, decision.reason) }
            const record = decode(wireCommit, {
              version: config.version,
              dispatchId: request.id,
              revision: current.revision + 1,
              input: fact,
              disposition,
            })
            applyCommit(current.state, record)
            return record
          }),
        )
      return { input, describe, makeCommit }
    }

    const readStream = (journal: JournalStore, stream: string, aggregate: string) =>
      Effect.suspend(() =>
        Effect.flatMap(journal.read(stream), history =>
          checked('replay', () => replay(aggregate, history)),
        ),
      )

    return {
      replay,
      member: (aggregate, request) => {
        const stream = streamId(config.name, aggregate)
        const route = routeOf(stream, request)
        return {
          stream,
          dispatchId: request.id,
          expectedRevision: request.expectedRevision,
          input: route.input,
          describe: route.describe,
          prepare: (journal, input) =>
            Effect.gen(function* () {
              const current = yield* readStream(journal, stream, aggregate)
              if (current.revision !== request.expectedRevision) {
                return yield* new RevisionConflict({
                  expected: request.expectedRevision,
                  actual: current.revision,
                })
              }
              return yield* route.makeCommit(current, input)
            }),
        }
      },
      open: aggregate =>
        Effect.gen(function* () {
          const journal = yield* Journal
          const missing = refused(journal.capabilities, [atomicCommit])
          if (missing.length > 0) {
            return yield* new StoreRefused({ store: journal.capabilities, refused: missing })
          }
          const stream = streamId(config.name, aggregate)
          let active = true
          yield* Scope.addFinalizer(
            yield* Scope.Scope,
            Effect.sync(() => {
              active = false
            }),
          )
          const guard = Effect.suspend(() =>
            active ? Effect.void : Effect.fail(new MachineClosed({ stream })),
          )
          const read = Effect.andThen(guard, readStream(journal, stream, aggregate))
          const checkpoint = Effect.gen(function* () {
            const current = yield* read
            const saved = yield* checked('checkpoint', () => ({
              version: config.version,
              revision: current.revision,
              state: encodeJson(config.state, current.state),
            }))
            yield* journal.saveSnapshot(stream, saved)
            return current
          })

          const dispatch: LiveMachine<State, Arms>['dispatch'] = request => {
            const route = routeOf(stream, request)
            const retrieve = (raw: WireCommit, input: WireFact) =>
              Effect.gen(function* () {
                const migrated = yield* checked('migrate dispatch', () => prepare(raw))
                yield* sameDispatch(migrated, input)
                return yield* route.describe(migrated)
              })
            return Effect.gen(function* () {
              yield* guard
              const input = yield* route.input
              const previous = yield* journal.find(stream, request.id)
              if (Option.isSome(previous)) return yield* retrieve(previous.value, input)
              const current = yield* read
              if (current.revision !== request.expectedRevision) {
                // A concurrent copy of this input could have committed between find and read.
                const duplicate = yield* journal.find(stream, request.id)
                if (Option.isSome(duplicate)) return yield* retrieve(duplicate.value, input)
                return yield* new RevisionConflict({
                  expected: request.expectedRevision,
                  actual: current.revision,
                })
              }
              const commit = yield* route.makeCommit(current, input)
              yield* guard
              const stored = yield* journal.append(stream, request.expectedRevision, commit)
              return yield* route.describe(stored)
            })
          }
          return { read, dispatch, checkpoint }
        }),
    }
  }

  return { message, run }
}

/** Check a statically known host before its Layer is installed. */
export const serializes = <const C extends StoreCapabilities>(
  capabilities: C & (Extract<C['isolation'], 'eventual'> extends never ? unknown : never),
): C => capabilities
