/**
 * Remote's diagnostics (#237): the reducer records each in the Model, and the
 * wiring and `Remote.fold` report what an update recorded through the
 * `Diagnostics.Reporter` in effect, answering `CompletedReportDiagnostics`,
 * which changes nothing. A failed write the application's update does not
 * hear is one of them.
 */
import { Effect, Layer, Option, Schema, Stream } from 'effect'
import { defineMessageUnion } from 'foldkit/message'
import { Entity, Order } from 'foldkit-entity'
import { Diagnostics, Surface } from 'foldkit-surface'
import { describe, expect, it } from 'vitest'
import {
  ConnectionChange,
  Mutation,
  Query,
  Remote,
  RemoteClient,
  type RemoteDiagnostic,
  type RemoteMessage,
  type WriteUnheard,
} from '../src/index.js'

const Post = Entity.define('Post', Schema.Struct({ id: Schema.String, title: Schema.String }))
const Feed = Query.define('Feed', {}, () =>
  Query.from(Post).pipe(Query.orderBy(Order.asc(Post.fields.id))),
)
const CreatePost = Mutation.make('CreatePost', {
  Input: { title: Schema.String },
  Output: { id: Schema.String },
})

const Model = Schema.Struct({ remote: Remote.Model })
type Model = typeof Model.Type
const Message = defineMessageUnion({
  ...Remote.messages,
  GotRemote: { message: Remote.Message },
})
const App = Surface.application({ Model, Message })
const Data = Remote.make({
  model: App.model.remote,
  entities: [Post],
  queries: [Feed],
  mutations: [CreatePost],
  verifyAnswers: true,
})
const feed = Data.query(Feed, {}, { select: Entity.select(Post, { title: true }), first: 10 })
const actives = { feed: App.surface('Feed', { model: () => ({ feed }) }) }
const initial: Model = { remote: Remote.initial }
const p1 = { entity: 'Post', id: 'p1' }

const optimistic = [
  { ...p1, values: { title: 'One' } },
  ConnectionChange.prepend(Feed.ref({}).identity, p1),
]
const started: RemoteMessage = {
  _tag: 'MutationStarted',
  requestId: 'r1',
  optimistic,
  write: { mutation: 'CreatePost', input: { title: 'One' } },
}
/** The answer leaves out the title the client showed: an `AnswerGap`. */
const answered: RemoteMessage = {
  _tag: 'MutationSucceeded',
  requestId: 'r1',
  entities: [{ ...p1, values: { id: 'p1' } }],
  now: 1,
}
const failed: RemoteMessage = {
  _tag: 'MutationFailed',
  requestId: 'r1',
  error: { _tag: 'RemoteMutationError', message: 'offline' },
  operation: 'o1',
}

const route = (wiring: ReturnType<typeof Data.wiring>, model: Model, message: RemoteMessage) =>
  Option.getOrThrow(wiring.route!(model, message))

/** Reporting reaches no server. */
const noServer = Layer.succeed(RemoteClient, {
  read: () => Effect.die('no reads'),
  query: () => Effect.die('no queries'),
  mutate: () => Effect.die('no writes'),
  live: () => Stream.empty,
})

/** Runs `commands` with a collecting reporter: what each reported, and what it answered. */
const run = (
  commands:
    | ReadonlyArray<{ readonly effect: Effect.Effect<unknown, never, RemoteClient> }>
    | undefined,
) => {
  const collected = Diagnostics.collect()
  const answers = (commands ?? []).map(command =>
    Effect.runSync(
      command.effect.pipe(
        Effect.provide(noServer),
        Effect.provideService(Diagnostics.Reporter, collected.report),
      ),
    ),
  )
  return { reported: collected.reported, answers }
}

/** The request each unheard write names, oldest first. */
const unheard = (diagnostics: ReadonlyArray<RemoteDiagnostic>) =>
  diagnostics
    .filter((diagnostic): diagnostic is WriteUnheard => diagnostic._tag === 'WriteUnheard')
    .map(diagnostic => diagnostic.requestId)

describe('Remote diagnostics through the wiring', () => {
  const wiring = Data.wiring(actives)

  it('reports what an update recorded, and the answer it reports with changes nothing', () => {
    const pending = route(wiring, initial, started)
    expect(pending.commands ?? []).toEqual([])
    const settled = route(wiring, pending.model, answered)
    expect(settled.model.remote.diagnostics.map(d => d._tag)).toEqual(['AnswerGap'])
    const { reported, answers } = run(settled.commands)
    expect(reported).toEqual(settled.model.remote.diagnostics)
    expect(answers).toEqual([{ _tag: 'CompletedReportDiagnostics' }])
    expect(route(wiring, settled.model, { _tag: 'CompletedReportDiagnostics' }).model).toBe(
      settled.model,
    )
  })

  it('reports only what this update recorded, not what was kept before', () => {
    const settled = route(wiring, route(wiring, initial, started).model, answered).model
    const again = route(wiring, settled, {
      _tag: 'MutationStarted',
      requestId: 'r2',
      optimistic: [{ entity: 'Post', id: 'p2', values: { title: 'Two' } }],
      write: { mutation: 'CreatePost', input: { title: 'Two' } },
    }).model
    const second = route(wiring, again, {
      _tag: 'MutationSucceeded',
      requestId: 'r2',
      entities: [{ entity: 'Post', id: 'p2', values: { id: 'p2' } }],
      now: 2,
    })
    const { reported } = run(second.commands)
    expect(reported).toEqual([second.model.remote.diagnostics[1]])
    expect(second.model.remote.diagnostics).toHaveLength(2)
  })

  it('records and reports a failed write the application does not hear', () => {
    const settled = route(wiring, route(wiring, initial, started).model, failed)
    expect(settled.model.remote.diagnostics).toEqual([
      {
        _tag: 'WriteUnheard',
        source: 'foldkit-remote',
        level: 'warning',
        message:
          "CreatePost (request r1) failed (RemoteMutationError: offline) and the application's update does not hear it, so its change went with no word. Share MutationFailed (Data.wiring(actives, { shared: ['MutationFailed'] })) and show Data.failedWrites.",
        requestId: 'r1',
        mutation: Option.some('CreatePost'),
        error: { _tag: 'RemoteMutationError', message: 'offline' },
      },
    ])
    expect(run(settled.commands).reported).toEqual(settled.model.remote.diagnostics)
    // The ledger still keeps the failure itself.
    expect(Data.failedWrites(settled.model).map(write => write.requestId)).toEqual(['r1'])
  })

  it('records nothing for a failure the application hears, or one already settled', () => {
    const heard = Data.wiring(actives, { shared: ['MutationFailed'] })
    const shared = route(heard, route(heard, initial, started).model, failed)
    expect(shared.model.remote.diagnostics).toEqual([])
    expect(shared.commands ?? []).toEqual([])
    const once = route(wiring, route(wiring, initial, started).model, failed).model
    expect(route(wiring, once, failed).model.remote.diagnostics).toBe(once.remote.diagnostics)
  })

  it('names the request alone when it was started without a write', () => {
    const bare: RemoteMessage = { _tag: 'MutationStarted', requestId: 'r1', optimistic }
    const settled = route(wiring, route(wiring, initial, bare).model, failed).model
    expect(settled.remote.diagnostics[0]!.message).toMatch(/^Request r1 failed/)
  })

  it('keeps the newest 256', () => {
    let model = initial
    for (let index = 0; index < 260; index++) {
      const requestId = `r${index}`
      model = route(wiring, model, {
        _tag: 'MutationStarted',
        requestId,
        write: { mutation: 'CreatePost', input: {} },
      }).model
      model = route(wiring, model, { ...failed, requestId }).model
    }
    const kept = unheard(model.remote.diagnostics)
    expect(kept).toHaveLength(256)
    expect(kept[0]).toBe('r4')
    expect(kept.at(-1)).toBe('r259')
  })

  it('reports nothing when forgetting clears what was recorded', () => {
    const settled = route(wiring, route(wiring, initial, started).model, failed).model
    const forgotten = Data.forget(settled)
    expect(forgotten.remote.diagnostics).toEqual([])
    expect(route(wiring, forgotten, { _tag: 'CompletedReportDiagnostics' }).commands ?? []).toEqual(
      [],
    )
  })
})

describe('Remote diagnostics through Remote.fold', () => {
  const fold = Remote.fold(Data, message => Message.GotRemote({ message }))

  it('reports what it recorded, the answer wrapped, and records no unheard write', () => {
    const settled = fold(fold(initial, started).model, answered)
    const { reported, answers } = run(settled.commands)
    expect(reported.map(d => d._tag)).toEqual(['AnswerGap'])
    expect(answers).toEqual([
      Message.GotRemote({ message: { _tag: 'CompletedReportDiagnostics' } }),
    ])
    // Its update receives every Remote Message, a failure included.
    expect(fold(fold(initial, started).model, failed).model.remote.diagnostics).toEqual([])
  })
})
