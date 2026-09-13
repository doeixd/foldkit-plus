/**
 * The bound domain (`Remote.make({ model, … })`): the application-facing
 * operations over the kernel, and what they compile to.
 */
import { Effect, Layer, Option, Schema, Stream } from 'effect'
import { defineMessageUnion } from 'foldkit/message'
import { Surface } from 'foldkit-surface'
import { describe, expect, it } from 'vitest'
import {
  ConnectionChange,
  Entity,
  Mutation,
  Query,
  Remote,
  RemoteClient,
  RemoteMutationError,
  Selection,
  entityKey,
  readField,
} from '../src/index.js'

const User = Entity.make('User', Schema.Struct({ id: Schema.String, name: Schema.String }))
const Project = Entity.make(
  'Project',
  Schema.Struct({ id: Schema.String, name: Schema.String, owner: Entity.ref(User) }),
)
const Rename = Mutation.make('Rename', {
  Input: { id: Schema.String, name: Schema.String },
  Output: { id: Schema.String },
})
const ProjectsByOwner = Query.make('ProjectsByOwner', {
  Input: { ownerId: Schema.String },
  Result: Project,
})

const Model = Schema.Struct({ route: Schema.String, remote: Remote.Model })
type Model = typeof Model.Type
const Message = defineMessageUnion({ ...Remote.messages, Ping: {} })
const App = Surface.application({ Model, Message })
const Data = Remote.make({
  model: App.model.remote,
  entities: [User, Project],
  queries: [ProjectsByOwner],
  mutations: [Rename],
})
const initial: Model = { route: '/', remote: Remote.initial }

const client = (mutate: (typeof RemoteClient.Service)['mutate'] = () => Effect.die('unused')) =>
  Layer.succeed(RemoteClient, {
    read: batch =>
      Effect.succeed({
        entities: batch.requests.map(request => ({
          entity: request.entity,
          id: request.id,
          values: { id: request.id, name: `name of ${request.id}`, owner: 'User:u1' },
        })),
      }),
    query: () => Effect.die('unused'),
    mutate,
    live: () => Stream.empty,
  })

describe('Remote.make binds a domain', () => {
  it('is the descriptor, the binding, and the operations at once', () => {
    expect(Data.registry.entities.has('Project')).toBe(true)
    expect(Data.store.get(initial)).toBe(Remote.initial)
    expect(Data.contract).toMatchObject({ kind: 'remote', owns: [['remote']] })
    expect(Data.definition.registry).toBe(Data.registry)
  })

  it('Remote.define and Remote.at are the two halves', () => {
    const definition = Remote.define({ entities: [User] })
    const bound = Remote.at(definition, App.model.remote)
    expect(bound.definition).toBe(definition)
    expect(Remote.select(bound, User.select({ name: true }))('u1').read(initial)).toEqual({
      _tag: 'Initial',
    })
  })

  it('Remote.Model is entity-independent, so it embeds before the domain is bound', () => {
    expect(
      Schema.decodeUnknownSync(Remote.Model as unknown as Schema.ConstraintDecoder<unknown>)(
        Remote.initial,
      ),
    ).toEqual(Remote.initial)
    expect(Data.Model).not.toBe(Remote.Model)
    expect(Data.initial).toBe(Remote.initial)
  })
})

describe('the entity is the receiver of its selections and patches', () => {
  it('select is Selection.make with the entity as receiver', () => {
    const viaMethod = Project.select({ id: true, name: true, owner: User.select({ name: true }) })
    const viaKernel = Selection.make(Project, {
      id: true,
      name: true,
      owner: Selection.make(User, { name: true }),
    })
    expect(viaMethod.fields).toEqual(viaKernel.fields)
    expect(viaMethod.relations).toEqual(viaKernel.relations)
    expect(() => Project.select({})).toThrow(/picks at least one field/)
  })

  it('patch is Entity.patch of the entity’s own ref', () => {
    expect(Project.patch('p1', { name: 'x' })).toEqual(
      Entity.patch(Project.ref('p1'), { name: 'x' }),
    )
    expect(Project.patch(7 as never, { name: 'x' }).id).toBe('7')
  })
})

describe('Query.make and Mutation.make take fields where a Struct is expected', () => {
  it('builds the Struct codecs and the connection over the entity', () => {
    expect(Schema.decodeUnknownSync(Rename.Input)({ id: 'p1', name: 'n' })).toEqual({
      id: 'p1',
      name: 'n',
    })
    expect(() => Schema.decodeUnknownSync(Rename.Input)({ id: 'p1' })).toThrow()
    expect(ProjectsByOwner.Result).toEqual({ entity: 'Project' })
    expect(Query.make('ByName', { Input: {}, Result: { name: 'Project' } }).Result).toEqual({
      entity: 'Project',
    })
    expect(ProjectsByOwner.ref({ ownerId: 'u1' }).identity).toBe(
      Query.make('ProjectsByOwner', {
        Input: Schema.Struct({ ownerId: Schema.String }),
        Result: Query.connection(Project),
      }).ref({ ownerId: 'u1' }).identity,
    )
  })

  it('accepts an explicit codec unchanged', () => {
    const Input = Schema.Struct({ id: Schema.String }).annotate({ title: 'RenameInput' })
    const explicit = Mutation.make('Explicit', { Input, Output: Schema.Struct({}) })
    expect(explicit.Input).toBe(Input)
    const spec = Query.connection(Project, { edgeKey: Schema.String })
    expect(Query.make('Q', { Input: {}, Result: spec }).Result).toBe(spec)
  })
})

describe('the domain’s operations compile to the kernel’s', () => {
  const summary = Project.select({ name: true })

  it('get, plan, storeOf, prefetch, inspect', async () => {
    const projection = Data.get(summary, 'p1')
    expect(projection.requirements).toEqual(Remote.select(Data, summary)('p1').requirements)
    expect(Data.plan(initial, projection)).toEqual(Remote.plan(Data, initial, projection))
    expect(Data.storeOf(initial)).toBe(Remote.storeOf(Data, initial))

    const store = await Effect.runPromise(
      Data.prefetch(initial, projection).pipe(Effect.provide(client())),
    )
    const loaded = { ...initial, remote: { ...initial.remote, entities: store } }
    expect(projection.read(loaded)).toEqual({ _tag: 'Ready', value: { name: 'name of p1' } })
    expect(Data.inspect(loaded)).toEqual(Remote.inspect(loaded.remote))
    expect(Data.inspect(loaded).entities.map(entry => entry.key)).toEqual(['Project:p1'])
  })

  it('reduce is Remote.update on the bound slice, for RemoteMessage or the union’s case', () => {
    const message = Message.RefreshStarted({
      requests: [{ entity: 'Project', id: 'p1', fields: ['name'] }],
    })
    expect(Remote.reduces(message)).toBe(true)
    expect(Remote.reduces(Message.Ping())).toBe(false)
    // By own tag only: an inherited name is not one of Remote's Messages.
    expect(Remote.reduces({ _tag: 'toString' })).toBe(false)
    const reduced = Remote.reduces(message) ? Data.reduce(initial, message) : initial
    expect(reduced.remote).toEqual(Data.update(initial.remote, message as never))
    expect(reduced.route).toBe('/')
  })
})

describe('Data.mutate starts a mutation from update', () => {
  const rename = { id: 'p1', name: 'Apollo II' }
  const summary = Project.select({ name: true })

  it('takes its id from the Model’s sequence and advances it', () => {
    const first = Data.mutate(initial, Rename, rename)
    const second = Data.mutate(first.model, Rename, rename)
    expect(first.requestId).toBe('remote-1')
    expect(second.requestId).toBe('remote-2')
    expect(first.tempId).toBe('remote-1.tmp')
    expect([...second.model.remote.mutations.pending]).toEqual(['remote-1', 'remote-2'])
    expect(second.model.remote.mutations.sequence).toBe(2)
  })

  it('an explicit id overrides the sequence and still advances it', () => {
    const explicit = Data.mutate(initial, Rename, rename, { requestId: 'r-9' })
    expect(explicit.requestId).toBe('r-9')
    expect(Data.mutate(explicit.model, Rename, rename).requestId).toBe('remote-2')
  })

  it('applies the optimistic operations, built from the generated ids when a function', () => {
    const started = Data.mutate(initial, Rename, rename, {
      optimistic: ({ tempId, requestId }) => [
        Project.patch(tempId, { name: requestId }),
        ConnectionChange.prepend('Feed', Project.ref(tempId)),
      ],
    })
    const visible = Data.storeOf(started.model)
    expect(
      Option.getOrThrow(readField(visible, entityKey('Project', 'remote-1.tmp'), 'name')),
    ).toBe('remote-1')
    expect(started.model.remote.optimistic.overlays.map(overlay => overlay.connection)).toEqual([
      'Feed',
    ])
    expect(Remote.visibleItems(started.model.remote, 'Feed').map(edge => edge.ref.id)).toEqual([
      'remote-1.tmp',
    ])
  })

  it('the Command yields MutationSucceeded, which reduce settles', async () => {
    const started = Data.mutate(initial, Rename, rename, {
      optimistic: [Project.patch('p1', { name: 'pending' })],
    })
    expect(started.command.name).toBe('Remote.mutate(Rename)')
    expect(started.command.args).toEqual({ requestId: 'remote-1' })
    const settled = await Effect.runPromise(
      started.command.effect.pipe(
        Effect.provide(
          client(request =>
            Effect.succeed({
              output: { id: 'p1' },
              entities: [
                { entity: 'Project', id: 'p1', values: { name: `${request.requestId}!` } },
              ],
            }),
          ),
        ),
      ),
    )
    expect(settled).toEqual({
      _tag: 'MutationSucceeded',
      requestId: 'remote-1',
      entities: [{ entity: 'Project', id: 'p1', values: { name: 'remote-1!' } }],
      connections: [],
    })
    const after = Data.reduce(started.model, settled)
    expect(after.remote.mutations.pending.size).toBe(0)
    expect(after.remote.optimistic.layers).toEqual([])
    expect(Data.get(summary, 'p1').read(after)).toEqual({
      _tag: 'Ready',
      value: { name: 'remote-1!' },
    })
  })

  it('the Command yields MutationFailed instead of failing, which reduce releases', async () => {
    const started = Data.mutate(initial, Rename, rename, {
      optimistic: [Project.patch('p1', { name: 'pending' })],
    })
    const settled = await Effect.runPromise(
      started.command.effect.pipe(
        Effect.provide(client(() => Effect.fail(new RemoteMutationError({ message: 'no' })))),
      ),
    )
    expect(settled).toEqual({
      _tag: 'MutationFailed',
      requestId: 'remote-1',
      error: { _tag: 'RemoteMutationError', message: 'no' },
    })
    const after = Data.reduce(started.model, settled)
    expect(after.remote.optimistic.layers).toEqual([])
    expect([...after.remote.mutations.failed]).toEqual(['remote-1'])
    expect(Data.get(summary, 'p1').read(after)).toEqual({ _tag: 'Initial' })
  })
})
