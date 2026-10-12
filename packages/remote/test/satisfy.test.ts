/**
 * `Data.satisfy`: the Model with everything the active Surfaces read, in as
 * many passes as their dependencies take, bounded.
 */
import { Effect, Layer, Option, Schema, Stream } from 'effect'
import { defineMessageUnion } from 'foldkit/message'
import { Surface } from 'foldkit-surface'
import { describe, expect, it } from 'vitest'
import { Entity, Remote, RemoteClient, RemoteReadError, RemoteUnsatisfied } from '../src/index.js'

const User = Entity.make('User', Schema.Struct({ id: Schema.String, name: Schema.String }))
const Project = Entity.make(
  'Project',
  Schema.Struct({ id: Schema.String, name: Schema.String, lead: Schema.String }),
)

const Model = Schema.Struct({ remote: Remote.Model })
type Model = typeof Model.Type
const App = Surface.application({ Model, Message: defineMessageUnion({ ...Remote.messages }) })
const Data = Remote.make({ model: App.model.remote, entities: [User, Project] })
const initial: Model = { remote: Remote.initial }

const project = Data.get(Project.select({ name: true, lead: true }), 'p1')
// Active only once the project is read: its lead is a value the read brings.
const actives = {
  lead: Data.active('Lead', model => {
    const read = project.read(model)
    return read._tag === 'Ready'
      ? Option.some(Data.get(User.select({ name: true }), read.value.lead))
      : Option.none()
  }),
  project: Data.active('Project', () => Option.some(project)),
}

/** A client that answers every read and records what it was asked. */
const recording = () => {
  const reads: Array<ReadonlyArray<string>> = []
  const layer = Layer.succeed(RemoteClient, {
    read: batch => {
      reads.push(batch.requests.map(request => `${request.entity}:${request.id}`))
      return Effect.succeed({
        settled: [],
        entities: batch.requests.map(request => ({
          entity: request.entity,
          id: request.id,
          values: { id: request.id, name: `name of ${request.id}`, lead: 'u7' },
        })),
      })
    },
    query: () => Effect.die('unused'),
    mutate: () => Effect.die('unused'),
    live: () => Stream.empty,
  })
  return { reads, layer }
}

describe('Data.satisfy', () => {
  it('reads a Surface active only once another has read, then stops', async () => {
    const client = recording()
    const satisfied = await Effect.runPromise(
      Data.satisfy(initial, actives).pipe(Effect.provide(client.layer)),
    )
    // The lead comes first in `actives`, so it is read in the second pass.
    expect(client.reads).toEqual([['Project:p1'], ['User:u7']])
    expect(Data.get(User.select({ name: true }), 'u7').read(satisfied)).toEqual({
      _tag: 'Ready',
      value: { name: 'name of u7' },
    })
    // Satisfied already: no pass plans anything, so nothing is asked.
    const again = await Effect.runPromise(
      Data.satisfy(satisfied, actives).pipe(Effect.provide(client.layer)),
    )
    expect(again).toBe(satisfied)
    expect(client.reads).toHaveLength(2)
  })

  it('fails naming the Surfaces still reading when the passes run out', async () => {
    // One pass reads the project, and the lead it reveals is left unread.
    const short = await Effect.runPromise(
      Effect.flip(Data.satisfy(initial, actives, { passes: 1 })).pipe(
        Effect.provide(recording().layer),
      ),
    )
    expect(short).toEqual(new RemoteUnsatisfied({ surfaces: ['Lead'], passes: 1 }))
    // Two passes are enough, though the second is the last.
    const exact = await Effect.runPromise(
      Data.satisfy(initial, actives, { passes: 2 }).pipe(Effect.provide(recording().layer)),
    )
    expect(Data.get(User.select({ name: true }), 'u7').read(exact)).toMatchObject({ _tag: 'Ready' })
    // A chain whose every read reveals one more is read once a pass, then refused.
    const name = Project.select({ name: true })
    const chain = {
      chain: Data.active('Chain', model => {
        let k = 1
        while (Data.get(name, `p${k}`).read(model)._tag === 'Ready') k++
        return Option.some(Data.get(name, `p${k}`))
      }),
    }
    const client = recording()
    const endless = await Effect.runPromise(
      Effect.flip(Data.satisfy(initial, chain, { passes: 3 })).pipe(Effect.provide(client.layer)),
    )
    expect(endless).toEqual(new RemoteUnsatisfied({ surfaces: ['Chain'], passes: 3 }))
    expect(client.reads).toEqual([['Project:p1'], ['Project:p2'], ['Project:p3']])
  })

  it('refuses a Surface of another application', () => {
    const Other = Surface.application({
      Model,
      Message: defineMessageUnion({ ...Remote.messages }),
    })
    const foreign = { other: Other.surface('Other', { model: () => project }) }
    expect(() =>
      Effect.runSync(Data.satisfy(initial, foreign).pipe(Effect.provide(recording().layer))),
    ).toThrow(/belongs to another application/)
  })
})

// A Surface that takes params is placed with `Surface.at`, as in `Data.wiring`.
const Page = App.surface('Page', {
  params: { id: Schema.String },
  model: ({ params }) => Data.get(Project.select({ name: true }), params.id),
})
export const unplaced = () =>
  // @ts-expect-error the Surface's params are unknown
  Data.satisfy(initial, { page: Page })

describe('Data.preload', () => {
  const Message = defineMessageUnion({ ...Remote.messages })
  const name = (model: Model, id: string) => Data.get(User.select({ name: true }), id).read(model)
  const preloaded = async (model: Model, layer: Layer.Layer<RemoteClient>) =>
    Effect.runPromise(
      Data.preload(model, actives, { now: () => 5 }).effect.pipe(Effect.provide(layer)),
    )

  it('hands on what satisfy reads, for the Model as it is when it lands', async () => {
    const client = recording()
    const message = await preloaded(initial, client.layer)
    expect(client.reads).toEqual([['Project:p1'], ['User:u7']])
    // Meanwhile the live Model read someone else.
    const moved = Data.reduce(initial, {
      _tag: 'ReadReceived',
      requests: [{ entity: 'User', id: 'u9', fields: ['name'] }],
      result: { settled: [], entities: [{ entity: 'User', id: 'u9', values: { name: 'Nine' } }] },
      now: 0,
    })
    const landed = Data.reduce(moved, message)
    expect(name(landed, 'u7')).toEqual({ _tag: 'Ready', value: { name: 'name of u7' } })
    expect(name(landed, 'u9')).toEqual({ _tag: 'Ready', value: { name: 'Nine' } })
    // What landed over the starting Model is what satisfy gives.
    const satisfied = await Effect.runPromise(
      Data.satisfy(initial, actives, { now: () => 5 }).pipe(Effect.provide(recording().layer)),
    )
    expect(Data.reduce(initial, message).remote.entities).toEqual(satisfied.remote.entities)
  })

  it('crosses a Message schema, as a Port or a recording sends it', async () => {
    const message = await preloaded(initial, recording().layer)
    const crossed = Schema.decodeUnknownSync(Message)(Schema.encodeSync(Message)(message))
    expect(Data.reduce(initial, crossed).remote.entities).toEqual(
      Data.reduce(initial, message).remote.entities,
    )
    // What it carries is checked as Remote's Messages, not taken on trust.
    expect(() =>
      Schema.decodeUnknownSync(Message)({ _tag: 'Preloaded', messages: [{ _tag: 'Nope' }] }),
    ).toThrow()
  })

  it('hands on what it read before a failure, and never fails itself', async () => {
    let asked = 0
    const failingSecond = Layer.succeed(RemoteClient, {
      read: batch => {
        asked++
        if (asked > 1) return Effect.fail(new RemoteReadError({ message: 'down' }))
        return Effect.succeed({
          settled: [],
          entities: batch.requests.map(request => ({
            entity: request.entity,
            id: request.id,
            values: { id: request.id, name: 'Apollo', lead: 'u7' },
          })),
        })
      },
      query: () => Effect.die('unused'),
      mutate: () => Effect.die('unused'),
      live: () => Stream.empty,
    })
    const partial = Data.reduce(initial, await preloaded(initial, failingSecond))
    expect(project.read(partial)).toMatchObject({ _tag: 'Ready' })
    expect(name(partial, 'u7')._tag).not.toBe('Ready')
    // A client that dies hands on nothing, and the Command still answers.
    const dying = Layer.succeed(RemoteClient, {
      read: () => Effect.die('broken'),
      query: () => Effect.die('unused'),
      mutate: () => Effect.die('unused'),
      live: () => Stream.empty,
    })
    expect(await preloaded(initial, dying)).toEqual({ _tag: 'Preloaded', messages: [] })
  })

  it('refuses a Surface of another application when the Command is made', () => {
    const Other = Surface.application({ Model, Message })
    const foreign = { other: Other.surface('Other', { model: () => project }) }
    expect(() => Data.preload(initial, foreign)).toThrow(/belongs to another application/)
  })

  it('arrives wrapped through Remote.fold', async () => {
    const Wrapped = defineMessageUnion({ GotRemote: { message: Remote.Message } })
    const fold = Remote.fold(Data, message => Wrapped.GotRemote({ message }))
    const wrapped = await Effect.runPromise(
      fold.preload(initial, actives).effect.pipe(Effect.provide(recording().layer)),
    )
    expect(wrapped).toMatchObject({ _tag: 'GotRemote', message: { _tag: 'Preloaded' } })
  })
})
