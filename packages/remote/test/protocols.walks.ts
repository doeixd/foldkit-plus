/**
 * Seeded walks over Remote's real reducer (`Data.reduce`, `Data.mutate`): the
 * orders in which answers, live events and reads can arrive, with the property
 * each protocol owes checked after every Message. `protocols.obligations.ts`
 * declares what is owed and runs these; `protocols.test.ts` holds them to it.
 * The oracles are written from the protocol (a request started later wins; a
 * revision never goes back), never by running the reducer a second way, except
 * where the property is "as if the failed write never began": there the
 * reference is the same reducer, never shown the write.
 */
import { Option, Schema } from 'effect'
import { defineMessageUnion } from 'foldkit/message'
import { Surface } from 'foldkit-surface'
import * as Temporal from '@doeixd/metakit/temporal'
import { Entity, Mutation, Remote, type RemoteMessage } from '../src/index.js'
import { live } from '../src/live.js'

const Doc = Entity.make(
  'Doc',
  Schema.Struct({
    id: Schema.String,
    name: Schema.String,
    note: Schema.String,
    likes: Schema.Number,
  }),
)
const Edit = Mutation.make('Edit', { Input: { id: Schema.String }, Output: {} })

const Message = defineMessageUnion({ ...Remote.messages })
const Model = Schema.Struct({ remote: Remote.Model })
type Model = typeof Model.Type
const App = Surface.application({ Model, Message })
const Data = Remote.make({
  model: App.model.remote,
  entities: [Doc],
  mutations: [Edit],
  verifyPredictions: true,
})

const selection = Doc.select({ name: true, note: true, likes: true })
const doc = Data.get(selection, 'd1')
// Reading it live installs the capability that keeps a newer value beside a pending write.
live(Data, selection, 'd1')

const fields = ['name', 'note', 'likes']
const asked = { entity: 'Doc', id: 'd1', fields }
const START = { name: 'Ada', note: 'old', likes: 10 }
type Values = typeof START

const read = (
  model: Model,
  values: Partial<Values>,
  options: { readonly revision?: number; readonly now?: number } = {},
): Model =>
  Data.reduce(model, {
    _tag: 'ReadReceived',
    requests: [asked],
    result: {
      entities: [
        {
          entity: 'Doc',
          id: 'd1',
          values,
          ...(options.revision === undefined ? {} : { revision: options.revision }),
        },
      ],
      settled: [],
    },
    now: options.now ?? 0,
  })
const known: Model = read({ remote: Remote.initial }, START)

/** What a Model shows of the row, as shown and as the server confirmed it. */
interface View {
  readonly tag: string
  readonly shown: Readonly<Record<string, unknown>>
  readonly confirmed: Readonly<Record<string, unknown>>
  /** The requests whose layers are still on the row. */
  readonly layers: ReadonlyArray<string>
}
const valuesOf = (result: object): Readonly<Record<string, unknown>> =>
  'value' in result && typeof result.value === 'object' && result.value !== null
    ? { ...result.value }
    : {}
const viewOf = (model: Model): View => ({
  tag: doc.read(model)._tag,
  shown: valuesOf(doc.read(model)),
  confirmed: valuesOf(Data.confirmed(doc).read(model)),
  layers: model.remote.optimistic.layers.map(layer => layer.id),
})

const succeeded = (
  requestId: string,
  values: Partial<Values>,
  revision?: number,
): RemoteMessage => ({
  _tag: 'MutationSucceeded',
  requestId,
  entities: [
    {
      entity: 'Doc',
      id: 'd1',
      values,
      ...(revision === undefined ? {} : { revision }),
    },
  ],
  now: 5,
})
const failed = (requestId: string): RemoteMessage => ({
  _tag: 'MutationFailed',
  requestId,
  error: { _tag: 'RemoteUnreachable', message: 'down' },
  operation: requestId,
})
const patched = (values: Partial<Values>, cursor: number, revision?: number): RemoteMessage => ({
  _tag: 'LiveReceived',
  stream: 's',
  event: {
    _tag: 'EntityPatched',
    cursor,
    ref: { entity: 'Doc', id: 'd1' },
    values,
    changed: Object.keys(values),
    ...(revision === undefined ? {} : { revision }),
  },
  now: 10 + cursor,
})

/** What a write sets, and what it adds to the count. */
interface Write {
  readonly set?: Partial<Values>
  readonly adds?: { readonly likes: number }
}

const start = (model: Model, requestId: string, write: Write): Model =>
  Data.mutate(
    model,
    Edit,
    { id: 'd1' },
    {
      requestId,
      optimistic: [
        {
          entity: 'Doc',
          id: 'd1',
          values: write.set ?? {},
          ...(write.adds === undefined ? {} : { adds: write.adds }),
        },
      ],
    },
  ).model

type Fate = 'ok' | 'ko'

/** Every way each of `count` requests can end. */
const fatesOf = (count: number): ReadonlyArray<ReadonlyArray<Fate>> =>
  Array.from({ length: 2 ** count }, (_, bits) =>
    Array.from({ length: count }, (_, at): Fate => ((bits >> at) & 1 ? 'ok' : 'ko')),
  )

/**
 * A walk over each of `scenarios`, `runs` orders each: the first broken order
 * of any of them, or one `Held` for all.
 */
const walkEach = <State, Name extends string, Of extends string>(
  scenarios: ReadonlyArray<Temporal.Scenario<State, Name, Of>>,
  options: Temporal.WalkOptions | undefined,
): Temporal.WalkResult<Name> => {
  const seed = options?.seed ?? 1
  const runs = options?.runs ?? 30
  for (const scenario of scenarios) {
    const result = Temporal.walk(scenario, { seed, runs })
    if (Temporal.WalkResult.$is('Broken')(result)) return result
  }
  return Temporal.WalkResult.Held({ seed, runs: runs * scenarios.length })
}

const none = Option.none()
const some = Option.some

// -- Latest wins ------------------------------------------------------------

const names = ['Grace', 'Hopper', 'Turing']

/**
 * Three writes of one field started in order, answered in any order, each
 * succeeding or failing. The server applied them in the order they started,
 * so what it confirmed is the last started that succeeded; what is shown is
 * the last started that has not failed. An earlier answer never takes a later
 * request's place, in the shown value or in the confirmed one.
 */
export const latestWins = (options?: Temporal.WalkOptions) =>
  walkEach(
    fatesOf(names.length).map(fates => {
      const ids = names.map((_, at) => `w${at}`)
      const answer = (at: number): RemoteMessage =>
        fates[at] === 'ok' ? succeeded(ids[at]!, { name: names[at]! }) : failed(ids[at]!)
      const steps = ids.flatMap((id, at) => [
        {
          name: `start:${id}`,
          of: 'Edit',
          ...(at === 0 ? {} : { after: [`start:${ids[at - 1]}`] }),
          run: (model: Model) => start(model, id, { set: { name: names[at]! } }),
        },
        {
          name: `answer:${id}`,
          of: 'answer',
          after: [`start:${id}`],
          run: (model: Model) => Data.reduce(model, answer(at)),
        },
      ])
      return {
        initial: () => known,
        steps,
        holds: (model: Model, ran: ReadonlyArray<string>) => {
          const started = (at: number) => ran.includes(`start:${ids[at]}`)
          const answered = (at: number) => ran.includes(`answer:${ids[at]}`)
          const latest = (among: (at: number) => boolean) =>
            names
              .map((_, at) => at)
              .filter(among)
              .pop()
          const nameAt = (at: number | undefined) => (at === undefined ? 'Ada' : names[at])
          const view = viewOf(model)
          const shown = nameAt(latest(at => started(at) && !(answered(at) && fates[at] === 'ko')))
          const confirmed = nameAt(latest(at => answered(at) && fates[at] === 'ok'))
          if (view.tag !== 'Ready') return some(`the read is ${view.tag}`)
          if (view.shown['name'] !== shown)
            return some(`shows ${String(view.shown['name'])}, not ${shown}`)
          if (view.confirmed['name'] !== confirmed)
            return some(`confirmed is ${String(view.confirmed['name'])}, not ${confirmed}`)
          return none
        },
      }
    }),
    options,
  )

// -- Optimistic rollback ----------------------------------------------------

const writes: ReadonlyArray<Write> = [
  { set: { name: 'Grace', note: 'n1' } },
  { set: { name: 'Hopper' } },
  { adds: { likes: 1 } },
  { adds: { likes: 1 } },
]

/**
 * Four writes (two of them set fields, one overlapping the other; two add to a
 * count) started in order and answered in any order, each succeeding or
 * failing. After every Message, the Model is what the same Messages leave
 * without the writes that have failed: a rolled-back write leaves nothing
 * behind and the others keep theirs. The server applies the writes that
 * succeed in the order they started, and each answer carries the row as that
 * write left it.
 */
export const optimisticRollback = (options?: Temporal.WalkOptions) =>
  walkEach(
    fatesOf(writes.length).map(fates => {
      const ids = writes.map((_, at) => `w${at}`)
      const server: Record<string, unknown> = { ...START }
      const answers = writes.map((write, at): RemoteMessage => {
        if (fates[at] === 'ko') return failed(ids[at]!)
        for (const [field, value] of Object.entries(write.set ?? {})) server[field] = value
        for (const [field, amount] of Object.entries(write.adds ?? {}))
          server[field] = (server[field] as number) + amount
        const touched = [...Object.keys(write.set ?? {}), ...Object.keys(write.adds ?? {})]
        return succeeded(ids[at]!, Object.fromEntries(touched.map(field => [field, server[field]])))
      })
      const steps = writes.flatMap((write, at) => [
        {
          name: `start:${ids[at]}`,
          of: 'Edit',
          ...(at === 0 ? {} : { after: [`start:${ids[at - 1]}`] }),
          run: (model: Model) => start(model, ids[at]!, write),
        },
        {
          name: `answer:${ids[at]}`,
          of: 'answer',
          after: [`start:${ids[at]}`],
          run: (model: Model) => Data.reduce(model, answers[at]!),
        },
      ])
      const stepOf = (name: string) => steps.find(step => step.name === name)!
      return {
        initial: () => known,
        steps,
        holds: (model: Model, ran: ReadonlyArray<string>) => {
          const rolledBack = ids.filter(
            (_, at) => ran.includes(`answer:${ids[at]}`) && fates[at] === 'ko',
          )
          const never = new Set(rolledBack.flatMap(id => [`start:${id}`, `answer:${id}`]))
          const reference = ran
            .filter(name => !never.has(name))
            .reduce((state, name) => stepOf(name).run(state), known)
          const [actual, expected] = [viewOf(model), viewOf(reference)]
          for (const key of ['tag', 'shown', 'confirmed', 'layers'] as const)
            if (JSON.stringify(actual[key]) !== JSON.stringify(expected[key]))
              return some(
                `${key} is ${JSON.stringify(actual[key])}; without ${rolledBack.join(', ') || 'any failed write'} it is ${JSON.stringify(expected[key])}`,
              )
          return none
        },
      }
    }),
    options,
  )

// -- Stale responses, and a stream that reconnects ---------------------------

/**
 * The server's row at version `n`, and what its change to version `n` carried:
 * odd versions rename, even ones set the note, so a change that is lost leaves
 * a field no later change brings back.
 */
const versions = [1, 2, 3, 4]
const rowAt = (version: number) => {
  const last = (parity: number) => versions.filter(at => at <= version && at % 2 === parity).pop()
  const [renamed, noted] = [last(1), last(0)]
  return {
    name: renamed === undefined ? 'Ada' : `n${renamed}`,
    note: noted === undefined ? 'old' : `e${noted}`,
  }
}
const changeAt = (version: number): Partial<Values> =>
  version % 2 === 1 ? { name: `n${version}` } : { note: `e${version}` }
const event = (version: number): RemoteMessage => patched(changeAt(version), version, version)

/** The Model with the stream's session replayed from its cursor, after the gap is cleared. */
const reconnect = (model: Model): Model => {
  const cursor = model.remote.live['s']?.cursor ?? 0
  return versions
    .filter(version => version > cursor)
    .reduce(
      (state, version) => Data.reduce(state, event(version)),
      Data.reduce(model, { _tag: 'GapCleared', stream: 's' }),
    )
}

/** The revision the store holds the row at: the version its values are of. */
const revisionOf = (model: Model): number => model.remote.entities['Doc:d1']?.revision ?? 0

interface Seen {
  readonly model: Model
  /** The newest revision the row has been held at. */
  readonly peak: number
  /** The last Message left the row at an older revision than it was at. */
  readonly back: boolean
}
const seeing = (previous: Seen, model: Model): Seen => ({
  model,
  peak: Math.max(previous.peak, revisionOf(model)),
  back: revisionOf(model) < previous.peak,
})

/**
 * A row the server moves through four versions, each sent with its revision on
 * a live stream (cursor and revision are the version) and, as a snapshot of
 * some version, in reads answered in any order. The stream loses events
 * (a gap), repeats events, and reconnects: the session replays what follows
 * its cursor. After every Message the confirmed value is a version the server
 * held, and is never older than one already shown; once the last reconnect
 * has run, it is the last version, however the reads and events interleaved.
 */
export const staleResponses = (options?: Temporal.WalkOptions) =>
  walkEach(
    [[], [2], [1, 3], [4]].map(lost => {
      const delivered = versions.filter(version => !lost.includes(version))
      const eventSteps = delivered.map((version, at) => ({
        name: `event:${version}`,
        of: 'LiveReceived',
        ...(at === 0 ? {} : { after: [`event:${delivered[at - 1]}`] }),
        run: (seen: Seen) => seeing(seen, Data.reduce(seen.model, event(version))),
      }))
      const readSteps = [2, 4].map(version => ({
        name: `read:${version}`,
        of: 'ReadReceived',
        run: (seen: Seen) => seeing(seen, read(seen.model, rowAt(version), { revision: version })),
      }))
      const steps = [
        ...eventSteps,
        ...readSteps,
        {
          name: 'repeat:2',
          of: 'LiveReceived',
          after: delivered.includes(2) ? ['event:2'] : [],
          run: (seen: Seen) => seeing(seen, Data.reduce(seen.model, event(2))),
        },
        {
          name: 'reconnect',
          of: 'GapCleared',
          run: (seen: Seen) => seeing(seen, reconnect(seen.model)),
        },
        {
          name: 'reconnect:last',
          of: 'GapCleared',
          after: [...eventSteps, ...readSteps]
            .map(step => step.name)
            .concat('repeat:2', 'reconnect'),
          run: (seen: Seen) => seeing(seen, reconnect(seen.model)),
        },
      ]
      return {
        initial: (): Seen => ({ model: known, peak: 0, back: false }),
        steps,
        holds: (seen: Seen, ran: ReadonlyArray<string>) => {
          const revision = revisionOf(seen.model)
          if (seen.back) return some(`the row went back to revision ${revision} from ${seen.peak}`)
          const { confirmed } = viewOf(seen.model)
          const expected = rowAt(revision)
          if (confirmed['name'] !== expected.name || confirmed['note'] !== expected.note)
            return some(
              `at revision ${revision} the row is ${JSON.stringify([confirmed['name'], confirmed['note']])}, not ${JSON.stringify([expected.name, expected.note])}`,
            )
          return ran.length === steps.length && revision !== 4
            ? some(`after the last reconnect the row is at revision ${revision}, not 4`)
            : none
        },
      }
    }),
    options,
  )

// -- A write answered while the stream and reads carry what came before it ---

/**
 * Our `Grace` is committed between another writer's `Ada` and `Eve`, which a
 * stream sends in that order and a read may bring; our answer arrives at any
 * point among them. Nothing in an answer says where it falls in the stream, so
 * the protocol shows Grace, never the older `Ada`, and reads the row again
 * where the answer and the newer value disagree: when every Message has
 * arrived, either the confirmed value is `Eve` or a read is planned, and that
 * read, answered `Eve`, ends on it.
 */
export const lateAnswers = (options?: Temporal.WalkOptions) =>
  walkEach(
    [
      // The whole stream, and a stream with a read beside it.
      { withRead: false, sent: 3 },
      { withRead: true, sent: 3 },
      // A read brings Eve, and the stream was opened after it: it sends nothing.
      { withRead: true, sent: 0 },
    ].map(({ withRead, sent }) => {
      const events = (
        [
          ['Ada', 1],
          ['Grace', 2],
          ['Eve', 3],
        ] as const
      ).slice(0, sent)
      const steps = [
        ...events.map(([name, cursor], at) => ({
          name: `event:${name}`,
          of: 'LiveReceived',
          ...(at === 0 ? {} : { after: [`event:${events[at - 1]![0]}`] }),
          run: (model: Model) => Data.reduce(model, patched({ name }, cursor)),
        })),
        {
          name: 'answer:a',
          of: 'MutationSucceeded',
          run: (model: Model) => Data.reduce(model, succeeded('a', { name: 'Grace' })),
        },
        ...(withRead
          ? [
              {
                name: 'read:Eve',
                of: 'ReadReceived',
                run: (model: Model) => read(model, { name: 'Eve' }, { now: 3 }),
              },
            ]
          : []),
      ]
      return {
        initial: () => start(known, 'a', { set: { name: 'Grace' } }),
        steps,
        holds: (model: Model, ran: ReadonlyArray<string>) => {
          const view = viewOf(model)
          if (view.shown['name'] === 'Ada' && ran.some(step => step !== 'event:Ada'))
            return some('shows Ada, which the write and the answer replaced')
          if (ran.includes('answer:a') && view.confirmed['name'] === 'Ada')
            return some('confirms Ada after the answer')
          if (ran.length < steps.length) return none
          if (view.confirmed['name'] === 'Eve') return none
          if (Data.plan(model, doc).length === 0)
            return some(
              `rests on ${String(view.confirmed['name'])}, not Eve, and reads nothing again`,
            )
          const after = viewOf(read(model, { name: 'Eve' }, { now: 20 }))
          return after.shown['name'] === 'Eve' && after.confirmed['name'] === 'Eve'
            ? none
            : some('the read that follows does not end on Eve')
        },
      }
    }),
    options,
  )
