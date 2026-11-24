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

export const memory = Effect.gen(function* () {
  const streams = yield* Ref.make(new Map<string, MemoryStream>())
  const store: JournalStore = {
    capabilities: memoryCapabilities,
    read: (stream, from = 'checkpoint') =>
      Effect.map(Ref.get(streams), all => {
        const current = all.get(stream) ?? empty
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
      Effect.map(Ref.get(streams), all =>
        Option.map(Option.fromUndefinedOr(all.get(stream)?.byDispatch.get(dispatchId)), saved =>
          structuredClone(saved),
        ),
      ),
    append: (stream, expected, commit) =>
      Effect.flatten(
        Ref.modify(
          streams,
          (
            all,
          ): readonly [
            Effect.Effect<WireCommit, DispatchConflict | RevisionConflict | JournalFailure>,
            Map<string, MemoryStream>,
          ] => {
            const current = all.get(stream) ?? empty
            const previous = current.byDispatch.get(commit.dispatchId)
            if (previous !== undefined) {
              return [sameDispatch(structuredClone(previous), commit.input), all]
            }
            const actual = current.commits.length
            if (expected !== actual) {
              return [Effect.fail(new RevisionConflict({ expected, actual })), all]
            }
            if (commit.revision !== expected + 1) {
              return [
                Effect.fail(new JournalFailure({ operation: 'append', cause: 'invalid revision' })),
                all,
              ]
            }
            const saved = structuredClone(commit)
            const byDispatch = new Map(current.byDispatch).set(saved.dispatchId, saved)
            const next = { ...current, byDispatch, commits: [...current.commits, saved] }
            return [Effect.succeed(commit), new Map(all).set(stream, next)]
          },
        ),
      ),
    saveSnapshot: (stream, snapshot) =>
      Effect.flatten(
        Ref.modify(
          streams,
          (all): readonly [Effect.Effect<void, JournalFailure>, Map<string, MemoryStream>] => {
            const current = all.get(stream) ?? empty
            if (snapshot.revision > current.commits.length) {
              return [
                Effect.fail(
                  new JournalFailure({
                    operation: 'snapshot',
                    cause: 'revision is ahead of history',
                  }),
                ),
                all,
              ]
            }
            if (
              Option.isSome(current.snapshot) &&
              current.snapshot.value.revision > snapshot.revision
            ) {
              return [Effect.void, all]
            }
            return [
              Effect.void,
              new Map(all).set(stream, {
                ...current,
                snapshot: Option.some(structuredClone(snapshot)),
              }),
            ]
          },
        ),
      ),
  }
  return store
})

export const memoryLayer = Layer.effect(Journal, memory)
