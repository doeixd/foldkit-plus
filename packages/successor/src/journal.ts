import { Context, Data, Effect, Layer, Option, Ref, Schema } from 'effect'
import type { StoreCapabilities } from 'metakit/store'

export const wireFact = Schema.Struct({
  type: Schema.NonEmptyString,
  payload: Schema.Json,
})
export type WireFact = typeof wireFact.Type

const wireCommand = Schema.Struct({
  id: Schema.NonEmptyString,
  fact: wireFact,
})

export const wireCommit = Schema.Struct({
  version: Schema.Int.check(Schema.isGreaterThan(0)),
  dispatchId: Schema.NonEmptyString,
  input: wireFact,
  revision: Schema.Int.check(Schema.isGreaterThan(0)),
  disposition: Schema.Union([
    Schema.Struct({
      kind: Schema.Literal('accepted'),
      events: Schema.Array(wireFact),
      commands: Schema.Array(wireCommand),
    }),
    Schema.Struct({ kind: Schema.Literal('rejected'), reason: wireFact }),
  ]),
})
export type WireCommit = typeof wireCommit.Type

export const wireSnapshot = Schema.Struct({
  version: Schema.Int.check(Schema.isGreaterThan(0)),
  revision: Schema.Int.check(Schema.isGreaterThanOrEqualTo(0)),
  state: Schema.Json,
})
export type WireSnapshot = typeof wireSnapshot.Type

export class JournalFailure extends Data.TaggedError('SuccessorJournalFailure')<{
  readonly operation: string
  readonly cause: unknown
}> {}

export class RevisionConflict extends Data.TaggedError('SuccessorRevisionConflict')<{
  readonly expected: number
  readonly actual: number
}> {}

export class DispatchConflict extends Data.TaggedError('SuccessorDispatchConflict')<{
  readonly dispatchId: string
}> {}

export class TransactionConflict extends Data.TaggedError('SuccessorTransactionConflict')<{
  readonly transactionId: string
}> {}

export interface History {
  readonly snapshot: Option.Option<WireSnapshot>
  readonly commits: ReadonlyArray<WireCommit>
}

export type HistoryStart = 'initial' | 'checkpoint'

export interface JournalStore {
  readonly capabilities: StoreCapabilities
  readonly read: (stream: string, from?: HistoryStart) => Effect.Effect<History, JournalFailure>
  readonly find: (
    stream: string,
    dispatchId: string,
  ) => Effect.Effect<Option.Option<WireCommit>, JournalFailure>
  /** Atomically check dispatch identity and expected revision, then store a whole batch. */
  readonly append: (
    stream: string,
    expectedRevision: number,
    commit: WireCommit,
  ) => Effect.Effect<WireCommit, JournalFailure | DispatchConflict | RevisionConflict>
  readonly saveSnapshot: (
    stream: string,
    snapshot: WireSnapshot,
  ) => Effect.Effect<void, JournalFailure>
}

export class Journal extends Context.Service<Journal, JournalStore>()(
  'foldkit/successor/Journal',
) {}

const transactionEntry = Schema.Struct({ stream: Schema.NonEmptyString, commit: wireCommit })
export const transactionReceipt = Schema.Array(transactionEntry)
export type TransactionReceipt = typeof transactionReceipt.Type

const appendEntry = Schema.Struct({
  ...transactionEntry.fields,
  expectedRevision: Schema.Int.check(Schema.isGreaterThanOrEqualTo(0)),
})
export type TransactionEntry = typeof appendEntry.Type

export type TransactionFailure =
  | JournalFailure
  | TransactionConflict
  | DispatchConflict
  | RevisionConflict

export interface AtomicJournalStore extends JournalStore {
  readonly findTransaction: (
    id: string,
  ) => Effect.Effect<Option.Option<TransactionReceipt>, JournalFailure>
  /** Commit every stream and the ordered receipt under one transactional authority. */
  readonly appendTransaction: (
    id: string,
    entries: ReadonlyArray<TransactionEntry>,
  ) => Effect.Effect<TransactionReceipt, TransactionFailure>
}

export class AtomicJournal extends Context.Service<AtomicJournal, AtomicJournalStore>()(
  'foldkit/successor/AtomicJournal',
) {}

export const canonicalJson = (value: Schema.Json): string => {
  if (typeof value !== 'object' || value === null) return JSON.stringify(value)
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`
  const object = value as Readonly<Record<string, Schema.Json>>
  const fields = Object.keys(object)
    .sort()
    .map(key => `${JSON.stringify(key)}:${canonicalJson(object[key]!)}`)
  return `{${fields.join(',')}}`
}

export const sameDispatch = (
  previous: WireCommit,
  input: WireFact,
): Effect.Effect<WireCommit, DispatchConflict> =>
  isSameDispatch(previous, input)
    ? Effect.succeed(previous)
    : Effect.fail(new DispatchConflict({ dispatchId: previous.dispatchId }))

export const isSameDispatch = (previous: WireCommit, input: WireFact): boolean =>
  previous.input.type === input.type &&
  canonicalJson(previous.input.payload) === canonicalJson(input.payload)

export interface DispatchIdentity {
  readonly stream: string
  readonly dispatchId: string
  readonly input: WireFact
}

/** The expected revision admits a new write. The durable identity survives a retry. */
export const sameTransaction = (
  saved: TransactionReceipt,
  requested: ReadonlyArray<DispatchIdentity>,
): boolean =>
  saved.length === requested.length &&
  requested.every(({ stream, dispatchId, input }, index) => {
    const entry = saved[index]!
    return (
      entry.stream === stream &&
      entry.commit.dispatchId === dispatchId &&
      isSameDispatch(entry.commit, input)
    )
  })

export const validateTransaction = (
  id: string,
  entries: ReadonlyArray<{ readonly stream: string }>,
): Effect.Effect<void, JournalFailure> => {
  const streams = new Set(entries.map(entry => entry.stream))
  return id.length > 0 && entries.length >= 2 && streams.size === entries.length && !streams.has('')
    ? Effect.void
    : Effect.fail(
        new JournalFailure({
          operation: 'transaction',
          cause: 'A transaction needs an identity and at least two distinct nonempty streams',
        }),
      )
}

const readEntries = Schema.decodeUnknownSync(Schema.Array(appendEntry), {
  onExcessProperty: 'error',
})

export const checkTransaction = (id: string, entries: ReadonlyArray<TransactionEntry>) =>
  Effect.gen(function* () {
    const decoded = yield* Effect.try({
      try: () => readEntries(entries),
      catch: cause => new JournalFailure({ operation: 'transaction', cause }),
    })
    yield* validateTransaction(id, decoded)
    return decoded
  })

export const receiptFor = (entries: ReadonlyArray<TransactionEntry>): TransactionReceipt =>
  entries.map(({ stream, commit }) => ({ stream, commit }))

export const memoryCapabilities = {
  name: 'successor memory journal',
  isolation: 'serializable',
  isolates: 'transaction',
  parentRowLock: true,
} as const satisfies StoreCapabilities

interface MemoryStream {
  readonly snapshot: Option.Option<WireSnapshot>
  readonly commits: ReadonlyArray<WireCommit>
  readonly byDispatch: ReadonlyMap<string, WireCommit>
}

const empty: MemoryStream = { snapshot: Option.none(), commits: [], byDispatch: new Map() }

const appendTo = (current: MemoryStream, saved: WireCommit): MemoryStream => ({
  ...current,
  byDispatch: new Map(current.byDispatch).set(saved.dispatchId, saved),
  commits: [...current.commits, saved],
})

interface MemoryJournal {
  readonly streams: ReadonlyMap<string, MemoryStream>
  readonly transactions: ReadonlyMap<string, TransactionReceipt>
}

export const memory = Effect.gen(function* () {
  const storage = yield* Ref.make<MemoryJournal>({
    streams: new Map(),
    transactions: new Map(),
  })
  const store: AtomicJournalStore = {
    capabilities: memoryCapabilities,
    read: (stream, from = 'checkpoint') =>
      Effect.map(Ref.get(storage), ({ streams }) => {
        const current = streams.get(stream) ?? empty
        const snapshot = from === 'initial' ? Option.none<WireSnapshot>() : current.snapshot
        return {
          snapshot: Option.map(snapshot, saved => structuredClone(saved)),
          commits: structuredClone(
            current.commits.slice(
              Option.match(snapshot, {
                onNone: () => 0,
                onSome: saved => saved.revision,
              }),
            ),
          ),
        }
      }),
    find: (stream, dispatchId) =>
      Effect.map(Ref.get(storage), ({ streams }) =>
        Option.map(Option.fromUndefinedOr(streams.get(stream)?.byDispatch.get(dispatchId)), saved =>
          structuredClone(saved),
        ),
      ),
    append: (stream, expected, commit) =>
      Effect.flatten(
        Ref.modify(
          storage,
          (
            data,
          ): readonly [
            Effect.Effect<WireCommit, DispatchConflict | RevisionConflict | JournalFailure>,
            MemoryJournal,
          ] => {
            const current = data.streams.get(stream) ?? empty
            const previous = current.byDispatch.get(commit.dispatchId)
            if (previous !== undefined) {
              return [sameDispatch(structuredClone(previous), commit.input), data]
            }
            const actual = current.commits.length
            if (expected !== actual) {
              return [Effect.fail(new RevisionConflict({ expected, actual })), data]
            }
            if (commit.revision !== expected + 1) {
              return [
                Effect.fail(new JournalFailure({ operation: 'append', cause: 'invalid revision' })),
                data,
              ]
            }
            const next = appendTo(current, structuredClone(commit))
            return [
              Effect.succeed(commit),
              { ...data, streams: new Map(data.streams).set(stream, next) },
            ]
          },
        ),
      ),
    findTransaction: id =>
      Effect.map(Ref.get(storage), ({ transactions }) =>
        Option.map(Option.fromUndefinedOr(transactions.get(id)), saved => structuredClone(saved)),
      ),
    appendTransaction: (id, entries) =>
      Effect.flatMap(checkTransaction(id, entries), decoded =>
        Effect.flatten(
          Ref.modify(
            storage,
            (
              data,
            ): readonly [Effect.Effect<TransactionReceipt, TransactionFailure>, MemoryJournal] => {
              const saved = data.transactions.get(id)
              if (saved !== undefined) {
                const identities = decoded.map(({ stream, commit }) => ({
                  ...commit,
                  stream,
                }))
                return [
                  sameTransaction(saved, identities)
                    ? Effect.succeed(structuredClone(saved))
                    : Effect.fail(new TransactionConflict({ transactionId: id })),
                  data,
                ]
              }
              const streams = new Map(data.streams)
              const stored = structuredClone(decoded)
              for (const { stream, commit, expectedRevision: expected } of stored) {
                const current = streams.get(stream) ?? empty
                const actual = current.commits.length
                if (current.byDispatch.has(commit.dispatchId)) {
                  return [
                    Effect.fail(new DispatchConflict({ dispatchId: commit.dispatchId })),
                    data,
                  ]
                }
                if (expected !== actual) {
                  return [Effect.fail(new RevisionConflict({ expected, actual })), data]
                }
                if (commit.revision !== expected + 1) {
                  return [
                    Effect.fail(
                      new JournalFailure({ operation: 'transaction', cause: 'invalid revision' }),
                    ),
                    data,
                  ]
                }
                streams.set(stream, appendTo(current, commit))
              }
              return [
                Effect.succeed(receiptFor(decoded)),
                { streams, transactions: new Map(data.transactions).set(id, receiptFor(stored)) },
              ]
            },
          ),
        ),
      ),
    saveSnapshot: (stream, snapshot) =>
      Effect.flatten(
        Ref.modify(
          storage,
          (data): readonly [Effect.Effect<void, JournalFailure>, MemoryJournal] => {
            const current = data.streams.get(stream) ?? empty
            if (snapshot.revision > current.commits.length) {
              return [
                Effect.fail(
                  new JournalFailure({
                    operation: 'snapshot',
                    cause: 'revision is ahead of history',
                  }),
                ),
                data,
              ]
            }
            if (
              Option.isSome(current.snapshot) &&
              current.snapshot.value.revision > snapshot.revision
            ) {
              return [Effect.void, data]
            }
            return [
              Effect.void,
              {
                ...data,
                streams: new Map(data.streams).set(stream, {
                  ...current,
                  snapshot: Option.some(structuredClone(snapshot)),
                }),
              },
            ]
          },
        ),
      ),
  }
  return store
})

export const journalContext = (store: AtomicJournalStore) =>
  Context.add(Context.make(Journal, store), AtomicJournal, store)

export const memoryLayer = Layer.effectContext(Effect.map(memory, journalContext))
