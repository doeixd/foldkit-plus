/**
 * The bound domain (`Remote.make({ model, … })`): the application-facing
 * operations over the kernel, and what they compile to.
 */
import { Deferred, Effect, Fiber, Layer, Optic, Option, Queue, Schema, Stream } from 'effect'
import { TestClock } from 'effect/testing'
import { defineMessageUnion } from 'foldkit/message'
import { ModelRef, Projection, Surface } from 'foldkit-surface'
import { describe, expect, it } from 'vitest'
import {
  ConnectionChange,
  Entity,
  Mutation,
  Query,
  Remote,
  RemoteClient,
  RemoteConnections,
  RemoteData,
  RemoteMutationError,
  RemotePolicy,
  RemoteQueryError,
  RemoteReadError,
  Selection,
  connectionsOf,
  emptyStore,
  entityKey,
  readField,
  refreshedAt,
  requirementsOf,
  writeEntity,
  type Boundary,
  type RemoteMessage,
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
    expect(Schema.decodeUnknownSync(Remote.Model)(Remote.initial)).toEqual(Remote.initial)
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
    expect(requirementsOf(projection)).toEqual(requirementsOf(Remote.select(Data, summary)('p1')))
    expect(Data.plan(initial, projection)).toEqual(Remote.plan(Data, initial, projection))
    expect(Data.storeOf(initial)).toBe(Remote.storeOf(Data, initial))

    const loaded = await Effect.runPromise(
      Data.prefetch(initial, projection).pipe(Effect.provide(client())),
    )
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
      deleted: [],
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

describe('Data.overlay shows a change nobody has made', () => {
  const summary = Project.select({ name: true })
  const known = Data.reduce(initial, {
    _tag: 'ReadReceived',
    requests: [{ entity: 'Project', id: 'p1', fields: ['name'] }],
    result: { entities: [{ entity: 'Project', id: 'p1', values: { name: 'Saved' } }] },
    now: 0,
  })
  const name = (model: Model) => Data.get(summary, 'p1').read(model)

  it('over the store, for every Selection, until it is lifted, and the store is as it was', () => {
    const shown = Data.overlay(known, 'preview', [Project.patch('p1', { name: 'Previewed' })])
    expect(name(shown)).toEqual({ _tag: 'Ready', value: { name: 'Previewed' } })
    // No request began, and what the server said is untouched beneath.
    expect(shown.remote.mutations).toBe(known.remote.mutations)
    expect(shown.remote.entities).toBe(known.remote.entities)

    const lifted = Data.lift(shown, 'preview')
    expect(name(lifted)).toEqual({ _tag: 'Ready', value: { name: 'Saved' } })
    expect(lifted.remote.optimistic).toEqual(known.remote.optimistic)
  })

  it('replaces what an id showed when it is shown again', () => {
    const first = Data.overlay(known, 'preview', [
      Project.patch('p1', { name: 'First' }),
      ConnectionChange.prepend('Feed', Project.ref('p1')),
    ])
    const second = Data.overlay(first, 'preview', [Project.patch('p1', { name: 'Second' })])
    expect(name(second)).toEqual({ _tag: 'Ready', value: { name: 'Second' } })
    expect(second.remote.optimistic.layers).toHaveLength(1)
    expect(second.remote.optimistic.overlays).toEqual([])
  })

  it('is apart from a request of the same id, and outlives it', () => {
    const shown = Data.overlay(known, 'remote-1', [Project.patch('p1', { name: 'Previewed' })])
    const started = Data.mutate(
      shown,
      Rename,
      { id: 'p1', name: 'x' },
      {
        optimistic: [Project.patch('p1', { name: 'Pending' })],
      },
    )
    expect(started.requestId).toBe('remote-1')
    const failed = Data.reduce(started.model, {
      _tag: 'MutationFailed',
      requestId: 'remote-1',
      error: { _tag: 'RemoteMutationError', message: 'no' },
    })
    expect(name(failed)).toEqual({ _tag: 'Ready', value: { name: 'Previewed' } })
  })

  it('lifting what was never shown is the same Model', () => {
    expect(Data.lift(known, 'nothing')).toBe(known)
  })
})

describe('Data.confirmed reads past what is only pending', () => {
  const summary = Project.select({ name: true })
  const project = Data.get(summary, 'p1')
  const known = Data.reduce(initial, {
    _tag: 'ReadReceived',
    requests: [{ entity: 'Project', id: 'p1', fields: ['name'] }],
    result: { entities: [{ entity: 'Project', id: 'p1', values: { name: 'Saved' } }] },
    now: 0,
  })

  it('shows what the server said while the projection itself shows the layer', () => {
    const shown = Data.overlay(known, 'preview', [Project.patch('p1', { name: 'Previewed' })])

    expect(project.read(shown)).toEqual({ _tag: 'Ready', value: { name: 'Previewed' } })
    expect(Data.confirmed(project).read(shown)).toEqual({
      _tag: 'Ready',
      value: { name: 'Saved' },
    })
  })

  it('follows the layer once the server agrees to it', () => {
    const started = Data.mutate(
      known,
      Rename,
      { id: 'p1', name: 'Renamed' },
      { optimistic: [Project.patch('p1', { name: 'Renamed' })] },
    )
    const confirmed = Data.confirmed(project)

    // While it is in flight the two disagree: that is the whole point of asking.
    expect(project.read(started.model)).toEqual({ _tag: 'Ready', value: { name: 'Renamed' } })
    expect(confirmed.read(started.model)).toEqual({ _tag: 'Ready', value: { name: 'Saved' } })

    const settled = Data.reduce(started.model, {
      _tag: 'MutationSucceeded',
      requestId: started.requestId,
      entities: [{ entity: 'Project', id: 'p1', values: { name: 'Renamed' } }],
    })

    expect(confirmed.read(settled)).toEqual({ _tag: 'Ready', value: { name: 'Renamed' } })
  })

  it('keeps a failed mutation out of both reads, since the layer is gone', () => {
    const started = Data.mutate(
      known,
      Rename,
      { id: 'p1', name: 'Renamed' },
      { optimistic: [Project.patch('p1', { name: 'Renamed' })] },
    )
    const failed = Data.reduce(started.model, {
      _tag: 'MutationFailed',
      requestId: started.requestId,
      error: { _tag: 'RemoteMutationError', message: 'no' },
    })

    expect(project.read(failed)).toEqual({ _tag: 'Ready', value: { name: 'Saved' } })
    expect(Data.confirmed(project).read(failed)).toEqual({
      _tag: 'Ready',
      value: { name: 'Saved' },
    })
  })

  it('leaves an optimistically inserted edge out of a connection', () => {
    const projects = Data.query(ProjectsByOwner, { ownerId: 'u1' }, { select: summary, first: 2 })
    const loaded = Data.reduce(
      Data.reduce(known, {
        _tag: 'ConnectionMerged',
        connection: projects.ref.identity,
        page: {
          edges: [{ key: 'Project:p1', ref: { entity: 'Project', id: 'p1' } }],
          start: { _tag: 'Terminal' },
          end: { _tag: 'Terminal' },
        },
      }),
      { _tag: 'GapCleared', stream: 'unused' },
    )
    const shown = Data.overlay(loaded, 'preview', [
      Project.patch('p2', { name: 'Draft' }),
      ConnectionChange.prepend(projects.ref, Project.ref('p2')),
    ])

    const visible = projects.read(shown)
    const confirmed = Data.confirmed(projects).read(shown)

    expect(visible).toMatchObject({ value: { items: [{ name: 'Draft' }, { name: 'Saved' }] } })
    expect(confirmed).toMatchObject({ value: { items: [{ name: 'Saved' }] } })
  })

  it('plans exactly what the projection plans, so observing it reads the same', () => {
    expect(Data.plan(known, Data.confirmed(project))).toEqual(Data.plan(known, project))
    expect(requirementsOf(Data.confirmed(project))).toEqual(requirementsOf(project))
  })

  it('is the same read when nothing is pending', () => {
    expect(Data.confirmed(project).read(known)).toEqual(project.read(known))
  })

  it('keeps what a query projection carries beside its read', () => {
    const projects = Data.query(ProjectsByOwner, { ownerId: 'u1' }, { select: summary, first: 2 })

    expect(Data.confirmed(projects).ref).toBe(projects.ref)
  })
})

describe('Data.live and Data.subscriptions', () => {
  const summary = Project.select({ name: true })
  const Page = App.surface('Page', {
    params: { projectId: Schema.String },
    model: ({ params }) => ({
      project: Data.live(summary, params.projectId),
      owner: Data.get(User.select({ name: true }), 'u1'),
    }),
  })
  const Home = App.surface('Home', { model: () => ({ project: Data.get(summary, 'p1') }) })
  const subscriptions = Data.subscriptions({
    page: Surface.at(Page, model => (model.route === '' ? undefined : { projectId: model.route })),
    home: Home,
  })
  const at = (route: string): Model => ({ route, remote: Remote.initial })

  it('live marks the projection’s requirements; get does not; the mark survives Projection.struct', () => {
    expect(requirementsOf(Data.live(summary, 'p1'))).toEqual([
      { entity: 'Project', id: 'p1', fields: ['name'], live: true },
    ])
    expect(requirementsOf(Data.get(summary, 'p1'))).toEqual([
      { entity: 'Project', id: 'p1', fields: ['name'] },
    ])
    expect(
      requirementsOf(Page.projection({ projectId: 'p1' })).map(r => [r.entity, r.live]),
    ).toEqual([
      ['Project', true],
      ['User', undefined],
    ])
    expect(Data.live(summary, 'p1').read(initial)).toEqual({ _tag: 'Initial' })
  })

  it('the plan never carries the mark to the wire', () => {
    expect(Data.plan(initial, Data.live(summary, 'p1'))).toEqual([
      { entity: 'Project', id: 'p1', fields: ['name'] },
    ])
  })

  it('is a Subscriptions record: a read and a live entry per Surface, and one retain entry', () => {
    expect(Object.keys(subscriptions).sort()).toEqual([
      'home.live',
      'home.read',
      'page.live',
      'page.read',
      'retain',
    ])
  })

  it('the read entry plans from the params the Model gives; an inactive Surface plans nothing', () => {
    expect(subscriptions['page.read'].modelToDependencies(at('p7'))).toEqual({
      requirements: [
        { entity: 'Project', id: 'p7', fields: ['name'] },
        { entity: 'User', id: 'u1', fields: ['name'] },
      ],
      queries: [],
      refresh: 0,
    })
    expect(subscriptions['page.read'].modelToDependencies(at(''))).toEqual({
      requirements: [],
      queries: [],
      refresh: 0,
    })
    expect(subscriptions['home.read'].modelToDependencies(at(''))).toEqual({
      requirements: [{ entity: 'Project', id: 'p1', fields: ['name'] }],
      queries: [],
      refresh: 0,
    })
  })

  it('the live entry subscribes only what the Surface reads live', () => {
    expect(subscriptions['page.live'].modelToDependencies(at('p7'))).toEqual({
      requirements: [{ entity: 'Project', id: 'p7', fields: ['name'], live: true }],
      cursor: 0,
    })
    expect(subscriptions['home.live'].modelToDependencies(at('p7'))).toEqual({
      requirements: [],
      cursor: 0,
    })
  })

  it('the retain entry’s roots are the active Surfaces’ requirements', () => {
    expect(subscriptions.retain.modelToDependencies(at('p7'))).toEqual({
      requirements: [
        { entity: 'Project', id: 'p7', fields: ['name'], live: true },
        { entity: 'User', id: 'u1', fields: ['name'] },
        { entity: 'Project', id: 'p1', fields: ['name'] },
      ],
      connections: [],
    })
    expect(subscriptions.retain.modelToDependencies(at(''))).toEqual({
      requirements: [{ entity: 'Project', id: 'p1', fields: ['name'] }],
      connections: [],
    })
  })

  it('the entries fetch, subscribe, and collect through RemoteClient like the kernel’s', async () => {
    const read = subscriptions['page.read']
    const messages = await Effect.runPromise(
      Stream.runCollect(read.dependenciesToStream(read.modelToDependencies(at('p7')))).pipe(
        Effect.provide(client()),
      ),
    )
    expect(messages.map(message => message._tag)).toEqual(['ReadStarted', 'ReadReceived'])
    const loaded = messages.reduce(Data.reduce, at('p7'))
    expect(Data.get(summary, 'p7').read(loaded)).toEqual({
      _tag: 'Ready',
      value: { name: 'name of p7' },
    })
    expect(read.modelToDependencies(loaded)).toEqual({ requirements: [], queries: [], refresh: 0 })

    const collected = await Effect.runPromise(
      Stream.runCollect(
        subscriptions.retain.dependenciesToStream(subscriptions.retain.modelToDependencies(at(''))),
      ).pipe(Effect.provide(client())),
    )
    expect(collected.map(message => message._tag)).toEqual(['RetentionChanged'])
    expect(Data.inspect(Data.reduce(loaded, collected[0]!)).entities.map(e => e.key)).toEqual([])
  })

  it('the retain entry waits for the grace period', async () => {
    const graced = Data.subscriptions({ home: Home }, { grace: '5 seconds' })
    const collected: string[] = []
    await Effect.runPromise(
      Effect.gen(function* () {
        const fiber = yield* Effect.forkChild(
          Stream.runForEach(
            graced.retain.dependenciesToStream(graced.retain.modelToDependencies(at(''))),
            message => Effect.sync(() => void collected.push(message._tag)),
          ),
        )
        yield* TestClock.adjust('4 seconds')
        expect(collected).toEqual([])
        yield* TestClock.adjust('2 seconds')
        yield* Fiber.join(fiber)
      }).pipe(Effect.provide(Layer.merge(TestClock.layer(), client()))),
    )
    expect(collected).toEqual(['RetentionChanged'])
  })

  it('takes the observe, live, and retain options', () => {
    const tuned = Data.subscriptions(
      { home: Home },
      { policy: RemotePolicy.networkOnly, connections: ['Feed'], grace: '1 second' },
    )
    expect(tuned.retain.modelToDependencies(at(''))).toMatchObject({
      connections: [{ identity: 'Feed' }],
    })
    // networkOnly plans every field, present or not.
    const loaded = {
      ...initial,
      remote: {
        ...initial.remote,
        entities: writeEntity(emptyStore, entityKey('Project', 'p1'), { name: 'x' }, 0),
      },
    }
    expect(subscriptions['home.read'].modelToDependencies(loaded)).toEqual({
      requirements: [],
      queries: [],
      refresh: 0,
    })
    expect(tuned['home.read'].modelToDependencies(loaded)).toEqual({
      requirements: [{ entity: 'Project', id: 'p1', fields: ['name'] }],
      queries: [],
      refresh: 0,
    })
  })
})

describe('what runs on every Model change is built once', () => {
  it('the RemoteData and Page schemas for a selection are shared across projections', () => {
    const summary = Project.select({ name: true })
    expect(Data.get(summary, 'p1').Model).toBe(Data.get(summary, 'p2').Model)
    expect(Data.live(summary, 'p1').Model).toBe(Data.get(summary, 'p1').Model)
    const page = () => Data.query(ProjectsByOwner, { ownerId: 'u1' }, { select: summary, first: 2 })
    expect(page().Model).toBe(page().Model)
    expect(RemoteData.schema(summary.schema)).toBe(RemoteData.schema(summary.schema))
    // Another selection is another schema.
    expect(Data.get(Project.select({ id: true }), 'p1').Model).not.toBe(
      Data.get(summary, 'p1').Model,
    )
  })

  it('equal reads of one Model state return one value; a changed store or connection reads anew', () => {
    const summary = Project.select({ name: true })
    const loaded = Data.reduce(initial, {
      _tag: 'ReadReceived',
      requests: [{ entity: 'Project', id: 'p1', fields: ['name'] }],
      result: { entities: [{ entity: 'Project', id: 'p1', values: { name: 'Apollo' } }] },
      now: 0,
    })
    const first = Data.get(summary, 'p1').read(loaded)
    expect(first).toEqual({ _tag: 'Ready', value: { name: 'Apollo' } })
    expect(Data.get(summary, 'p1').read(loaded)).toBe(first)
    expect(Data.get(summary, 'p1').read({ ...loaded })).toBe(first)
    // Another selection, id, or store is another read.
    expect(Data.get(Project.select({ id: true }), 'p1').read(loaded)).not.toBe(first)
    expect(Data.get(summary, 'p2').read(loaded)).toEqual({ _tag: 'Initial' })
    const renamed = Data.reduce(loaded, {
      _tag: 'ReadReceived',
      requests: [{ entity: 'Project', id: 'p1', fields: ['name'] }],
      result: { entities: [{ entity: 'Project', id: 'p1', values: { name: 'Apollo II' } }] },
      now: 1,
    })
    expect(Data.get(summary, 'p1').read(renamed)).toEqual({
      _tag: 'Ready',
      value: { name: 'Apollo II' },
    })

    const projects = Data.query(ProjectsByOwner, { ownerId: 'u1' }, { select: summary, first: 2 })
    const identity = projects.ref.identity
    const paged = Data.reduce(loaded, {
      _tag: 'ConnectionMerged',
      connection: identity,
      page: {
        edges: [{ key: 'Project:p1', ref: { entity: 'Project', id: 'p1' } }],
        start: { _tag: 'Terminal' },
        end: { _tag: 'Terminal' },
      },
    })
    const page = projects.read(paged)
    expect(page).toMatchObject({ _tag: 'Ready', value: { items: [{ name: 'Apollo' }] } })
    expect(projects.read(paged)).toBe(page)
    // The same store under an invalidated connection is another read.
    const stale = Data.reduce(paged, { _tag: 'ConnectionInvalidated', connection: identity })
    expect(Data.storeOf(stale)).toBe(Data.storeOf(paged))
    expect(projects.read(stale)).toMatchObject({ _tag: 'Refreshing' })
    // And another selection of the same connection reads its own value: `id` is
    // not in the store, so this page is Initial while the `name` page is Ready.
    expect(
      Data.query(
        ProjectsByOwner,
        { ownerId: 'u1' },
        { select: Project.select({ id: true }), first: 2 },
      ).read(paged),
    ).toEqual({ _tag: 'Initial' })
  })

  it('a Surface’s model callback runs once per Model for the read, live, and retain entries', () => {
    let built = 0
    const Counted = App.surface('Counted', {
      params: { projectId: Schema.String },
      model: ({ params }) => {
        built += 1
        return { project: Data.live(Project.select({ name: true }), params.projectId) }
      },
    })
    const subscriptions = Data.subscriptions({
      counted: Surface.at(Counted, model =>
        model.route === '' ? undefined : { projectId: model.route },
      ),
    })
    const model: Model = { route: 'p1', remote: Remote.initial }
    subscriptions['counted.read'].modelToDependencies(model)
    subscriptions['counted.live'].modelToDependencies(model)
    subscriptions.retain.modelToDependencies(model)
    expect(built).toBe(1)
    // A new Model is a new projection; an inactive one builds nothing.
    subscriptions['counted.read'].modelToDependencies({ ...model })
    expect(built).toBe(2)
    subscriptions.retain.modelToDependencies({ route: '', remote: Remote.initial })
    expect(built).toBe(2)
  })
})

describe('an unregistered descriptor is an error naming it and the domain', () => {
  const Team = Entity.make('Team', Schema.Struct({ id: Schema.String, name: Schema.String }))
  const TeamsByName = Query.make('TeamsByName', { Input: {}, Result: Team })
  const Archive = Mutation.make('Archive', { Input: { id: Schema.String }, Output: {} })

  it('get, live, and Remote.select reject an entity the domain never declared', () => {
    const message = 'Remote: Entity "Team" is not registered with domain "remote"'
    // @ts-expect-error Team is not registered (branded: `Entity "Team" is not registered …`)
    expect(() => Data.get(Team.select({ id: true }), 't1')).toThrow(message)
    // @ts-expect-error nor for live
    expect(() => Data.live(Team.select({ id: true }), 't1')).toThrow(message)
    // @ts-expect-error nor for the kernel form
    expect(() => Remote.select(Data, Team.select({ id: true }))).toThrow(message)
    expect(Data.get(Project.select({ id: true }), 'p1').read(initial)).toEqual({ _tag: 'Initial' })
  })

  it('query rejects an unregistered query, and a selection of another entity than the query lists', () => {
    // @ts-expect-error TeamsByName is not registered
    expect(() => Data.query(TeamsByName, {}, { select: Team.select({ id: true }) })).toThrow(
      'Remote: Query "TeamsByName" is not registered with domain "remote"',
    )
    expect(() =>
      // @ts-expect-error the selection is of User, the query lists Project
      Data.query(ProjectsByOwner, { ownerId: 'u1' }, { select: User.select({ name: true }) }),
    ).toThrow('Remote: the selection is of "User", but query "ProjectsByOwner" lists "Project"')
  })

  it('query rejects a page size that is not a non-negative integer', () => {
    const summary = Project.select({ name: true })
    expect(() =>
      Data.query(ProjectsByOwner, { ownerId: 'u1' }, { select: summary, first: -1 }),
    ).toThrow(
      'Remote: query "ProjectsByOwner" asks for first: -1; a page size is a non-negative integer',
    )
    expect(() =>
      Data.query(ProjectsByOwner, { ownerId: 'u1' }, { select: summary, last: 2.5 }),
    ).toThrow('asks for last: 2.5')
    expect(
      Data.query(ProjectsByOwner, { ownerId: 'u1' }, { select: summary, first: 0 }).ref.window,
    ).toEqual({ first: 0 })
  })

  it('query rejects a query whose Result is not a connection over an entity', () => {
    const Count = Query.make('Count', { Input: {}, Result: Schema.Number })
    const Counting = Remote.make({ model: App.model.remote, entities: [Project], queries: [Count] })
    expect(() => Counting.query(Count, {}, { select: Project.select({ id: true }) })).toThrow(
      'Remote: query "Count" is not a connection over an entity, so it has no page to select',
    )
  })

  it('mutate rejects an unregistered mutation before touching the Model', () => {
    // @ts-expect-error Archive is not registered
    expect(() => Data.mutate(initial, Archive, { id: 'p1' })).toThrow(
      'Remote: Mutation "Archive" is not registered with domain "remote"',
    )
  })

  it('subscriptions reject a Surface of another application, even with the same Model type', () => {
    const OtherApp = Surface.application({ Model, Message })
    const OtherData = Remote.make({ model: OtherApp.model.remote, entities: [Project] })
    const Foreign = OtherApp.surface('Foreign', {
      model: () => ({ project: OtherData.get(Project.select({ name: true }), 'p1') }),
    })
    expect(() => Data.subscriptions({ foreign: Foreign })).toThrow(
      'Remote: Surface "Foreign" belongs to another application than domain "remote"',
    )
    expect(() => Data.subscriptions({ foreign: Surface.at(Foreign, undefined) })).toThrow(
      'belongs to another application',
    )
    expect(Object.keys(OtherData.subscriptions({ foreign: Foreign }))).toContain('foreign.read')
    // A domain bound to a raw optic claims no application, so it takes any Surface.
    const Unowned = Remote.at(
      Remote.define({ entities: [Project] }),
      ModelRef.fromOptic(Remote.Model, Optic.id<Model>().key('remote'), ['remote']),
    )
    expect(Unowned.contract.owner).toBeUndefined()
    const unownedData = Remote.make({ model: Unowned.store, entities: [Project] })
    expect(Object.keys(unownedData.subscriptions({ foreign: Foreign }))).toContain('foreign.read')
  })
})

describe('Data.query reads a connection as a page of selected items', () => {
  const summary = Project.select({ name: true })
  const projects = Data.query(ProjectsByOwner, { ownerId: 'u1' }, { select: summary, first: 2 })
  const identity = ProjectsByOwner.ref({ ownerId: 'u1' }).identity
  const cursor = (value: string) => ({ _tag: 'Cursor' as const, cursor: value })
  const terminal = { _tag: 'Terminal' as const }
  const edge = (id: string) => ({ key: `Project:${id}`, ref: { entity: 'Project', id } })
  const merged = (
    model: Model,
    ids: ReadonlyArray<string>,
    end: Boundary = cursor(`after:${ids.at(-1)}`),
  ) =>
    Data.reduce(model, {
      _tag: 'ConnectionMerged',
      connection: identity,
      page: { edges: ids.map(edge), start: terminal, end },
    })
  const read = (model: Model, ids: ReadonlyArray<string>) =>
    Data.reduce(model, {
      _tag: 'ReadReceived',
      requests: ids.map(id => ({ entity: 'Project', id, fields: ['name'] })),
      result: {
        entities: ids.map(id => ({ entity: 'Project', id, values: { name: `name of ${id}` } })),
      },
      now: 0,
    })

  /** A client whose queries page `ids` two at a time by cursor, recording every call. */
  const paging = (ids: ReadonlyArray<string>, options: { readonly fail?: boolean } = {}) => {
    const queries: Array<{ readonly input: unknown; readonly window: unknown }> = []
    const reads: Array<ReadonlyArray<string>> = []
    const layer = Layer.succeed(RemoteClient, {
      read: batch => {
        reads.push(batch.requests.map(request => request.id))
        return Effect.succeed({
          entities: batch.requests.map(request => ({
            entity: request.entity,
            id: request.id,
            values: { name: `name of ${request.id}` },
          })),
        })
      },
      query: request => {
        queries.push({ input: request.input, window: request.window })
        if (options.fail === true) return Effect.fail(new RemoteQueryError({ message: 'boom' }))
        const from = request.window.after === undefined ? 0 : ids.indexOf(request.window.after) + 1
        const page = ids.slice(from, from + (request.window.first ?? ids.length))
        const last = page.at(-1)
        return Effect.succeed({
          edges: page.map(id => ({ entity: 'Project', id, key: `Project:${id}` })),
          start: request.window.after === undefined ? terminal : cursor(request.window.after),
          end: last === undefined || last === ids.at(-1) ? terminal : cursor(last),
        })
      },
      mutate: () => Effect.die('unused'),
      live: () => Stream.empty,
    })
    return { queries, reads, layer }
  }

  describe('Data.refresh', () => {
    /** Runs the read entry that observes `projection` until it plans nothing more. */
    const observe = async (
      model: Model,
      projection: Projection<Model, unknown>,
      layer: Layer.Layer<RemoteClient>,
    ): Promise<Model> => {
      const entry = Remote.observe(
        Data,
        App.surface('Refreshed', { model: () => ({ value: projection }) }),
        undefined,
      )
      let current = model
      for (let pass = 0; pass < 3; pass += 1) {
        const dependencies = entry.modelToDependencies(current)
        if (dependencies.requirements.length === 0 && dependencies.queries.length === 0) break
        const messages = await Effect.runPromise(
          Stream.runCollect(entry.dependenciesToStream(dependencies)).pipe(Effect.provide(layer)),
        )
        current = messages.reduce(Data.reduce, current)
      }
      return current
    }

    it('marks a present entity Refreshing, and its read entry reads it once', async () => {
      const project = Data.get(summary, 'p1')
      const loaded = read(initial, ['p1'])
      const client = paging([])
      // Without a refresh, the cache-first entry has nothing to read.
      expect(await observe(loaded, project, client.layer)).toBe(loaded)

      const refreshed = Data.refresh(loaded, project)

      expect(project.read(refreshed)).toEqual({ _tag: 'Refreshing', value: { name: 'name of p1' } })
      const settled = await observe(refreshed, project, client.layer)
      expect(client.reads).toEqual([['p1']])
      expect(project.read(settled)).toEqual({ _tag: 'Ready', value: { name: 'name of p1' } })
    })

    it('asks again for an entity it knew to be absent', async () => {
      const project = Data.get(summary, 'p9')
      // The server answered a read of p9 with nothing.
      const absent = Data.reduce(initial, {
        _tag: 'ReadReceived',
        requests: [{ entity: 'Project', id: 'p9', fields: ['name'] }],
        result: { entities: [] },
        now: 0,
      })
      expect(project.read(absent)._tag).toBe('NotFound')
      const client = paging([])
      expect(await observe(absent, project, client.layer)).toBe(absent)

      const refreshed = Data.refresh(absent, project)

      expect(project.read(refreshed)._tag).not.toBe('NotFound')
      const settled = await observe(refreshed, project, client.layer)
      expect(client.reads).toEqual([['p9']])
      expect(project.read(settled)).toEqual({ _tag: 'Ready', value: { name: 'name of p9' } })
    })

    it('invalidates a loaded connection: one page query, then one read of its items', async () => {
      const known = read(merged(initial, ['p1', 'p2']), ['p1', 'p2'])
      const client = paging(['p1', 'p2', 'p3'])

      const refreshed = Data.refresh(known, projects)

      expect(refreshed.remote.connections[identity]?.stale).toBe(true)
      expect(projects.read(refreshed)._tag).toBe('Refreshing')
      const settled = await observe(refreshed, projects, client.layer)
      expect(client.queries).toEqual([{ input: { ownerId: 'u1' }, window: { first: 2 } }])
      expect(client.reads).toEqual([['p1', 'p2']])
      expect(projects.read(settled)._tag).toBe('Ready')
    })

    it('takes a Surface without params, as the kernel form does', () => {
      const loaded = read(initial, ['p1'])
      const Home = App.surface('RefreshHome', {
        model: () => ({ project: Data.get(summary, 'p1') }),
      })

      const refreshed = Data.refresh(loaded, Home)

      expect(Home.projection(undefined).read(refreshed)).toEqual({
        project: { _tag: 'Refreshing', value: { name: 'name of p1' } },
      })
      expect(Remote.refresh(Data, loaded, Home)).toEqual(refreshed)
    })

    it('settles a failed refetch back to the value it had', async () => {
      const project = Data.get(summary, 'p1')
      const loaded = read(merged(initial, ['p1']), ['p1'])
      const unreachable = Layer.succeed(RemoteClient, {
        read: () => Effect.fail(new RemoteReadError({ message: 'down' })),
        query: () => Effect.fail(new RemoteQueryError({ message: 'down' })),
        mutate: () => Effect.die('unused'),
        live: () => Stream.empty,
      })

      const entity = await observe(Data.refresh(loaded, project), project, unreachable)
      const page = await observe(Data.refresh(loaded, projects), projects, unreachable)

      expect(project.read(entity)).toEqual({ _tag: 'Ready', value: { name: 'name of p1' } })
      expect(page.remote.connections[identity]?.stale).toBe(false)
      expect(projects.read(page)._tag).toBe('Ready')
    })

    it('leaves live subscriptions as they are', () => {
      const loaded = read(initial, ['p1'])
      const Live = App.surface('RefreshLive', {
        model: () => ({ project: Data.live(summary, 'p1') }),
      })
      const live = Remote.live(Data, Live, undefined)

      expect(live.modelToDependencies(Data.refresh(loaded, Live))).toEqual(
        live.modelToDependencies(loaded),
      )
    })

    it('leaves a connection the Model never loaded to its read entry', () => {
      const refreshed = Data.refresh(initial, projects)

      expect(refreshed.remote.connections[identity]).toBeUndefined()
      expect(projects.read(refreshed)).toEqual({ _tag: 'Initial' })
    })

    it('returns the same Model when nothing remote is required', () => {
      const local = Projection.fromReader(Schema.String, (model: Model) => model.route)

      expect(Data.refresh(initial, local)).toBe(initial)
    })

    it('returns the same Model when nothing it names is loaded', () => {
      expect(Data.refresh(initial, Data.get(summary, 'p1'))).toBe(initial)
    })

    it('returns the same Model when refreshing what is already being refreshed', () => {
      const known = read(merged(initial, ['p1', 'p2']), ['p1', 'p2'])
      const both = Projection.struct({ project: Data.get(summary, 'p1'), projects })

      const once = Data.refresh(known, both)

      expect(once).not.toBe(known)
      expect(Data.refresh(once, both)).toBe(once)
    })

    it('returns the same Model for a connection already invalidated', () => {
      const stale = Data.reduce(merged(initial, ['p1']), {
        _tag: 'ConnectionInvalidated',
        connection: identity,
      })

      expect(Data.refresh(stale, projects)).toBe(stale)
    })

    it('restarts only the read entries that observe what was refreshed', () => {
      const p1 = Data.get(summary, 'p1')
      const p2 = Data.get(summary, 'p2')
      const entryFor = (projection: Projection<Model, unknown>) =>
        Remote.observe(
          Data,
          App.surface('Scoped', { model: () => ({ value: projection }) }),
          undefined,
        )
      const loaded = read(initial, ['p1', 'p2'])

      const refreshed = Data.refresh(loaded, p1)

      // The entry that observes p1 sees a new generation, so its stream restarts.
      expect(entryFor(p1).modelToDependencies(refreshed)).not.toEqual(
        entryFor(p1).modelToDependencies(loaded),
      )
      // The entry that observes only p2 was not refreshed, so it must not restart:
      // a read of p2 in flight is not cancelled by a refresh of p1.
      expect(entryFor(p2).modelToDependencies(refreshed)).toEqual(
        entryFor(p2).modelToDependencies(loaded),
      )
    })

    it('asks again once a read has begun since the last refresh', () => {
      const project = Data.get(summary, 'p1')
      const once = Data.refresh(read(initial, ['p1']), project)
      const requests = [{ entity: 'Project', id: 'p1', fields: ['name'] }]
      const reading = Data.reduce(once, {
        _tag: 'ReadStarted',
        requests,
        refresh: refreshedAt(once.remote.refresh, requests),
      })

      expect(refreshedAt(Data.refresh(reading, project).remote.refresh, requests)).toBe(
        refreshedAt(once.remote.refresh, requests) + 1,
      )
    })

    it.each([
      { change: 'removes an item', server: ['p2', 'p3', 'p4', 'p5'], items: ['p2', 'p3'] },
      { change: 'reorders items', server: ['p2', 'p1', 'p3', 'p4'], items: ['p2', 'p1'] },
    ])(
      'follows the server when it $change, dropping the pages past the first',
      async ({ server, items }) => {
        const first = await observe(initial, projects, paging(['p1', 'p2', 'p3', 'p4']).layer)
        const next = Data.next(first, projects)
        if (next === undefined) throw new Error('the first page has a next page')
        const page = await Effect.runPromise(
          Data.fetch(next).effect.pipe(Effect.provide(paging(['p1', 'p2', 'p3', 'p4']).layer)),
        )
        const loaded = await observe(Data.reduce(first, page), projects, paging([]).layer)
        expect(projects.read(loaded)).toMatchObject({
          _tag: 'Ready',
          value: { items: ['p1', 'p2', 'p3', 'p4'].map(id => ({ name: `name of ${id}` })) },
        })

        const settled = await observe(
          Data.refresh(loaded, projects),
          projects,
          paging(server).layer,
        )

        expect(projects.read(settled)).toEqual({
          _tag: 'Ready',
          value: {
            items: items.map(id => ({ name: `name of ${id}` })),
            hasNext: true,
            hasPrevious: false,
          },
        })
      },
    )

    it('restarts a networkOnly entry whose query is in flight when its connection is invalidated', () => {
      const List = App.surface('RefreshList', { model: () => ({ projects }) })
      const entry = Data.subscriptions({ list: List }, { policy: RemotePolicy.networkOnly })[
        'list.read'
      ]
      const known = read(merged(initial, ['p1', 'p2']), ['p1', 'p2'])

      expect(entry.modelToDependencies(Data.refresh(known, projects))).not.toEqual(
        entry.modelToDependencies(known),
      )
    })

    it('restarts a read already in flight, so its older answer is not applied', async () => {
      const project = Data.get(summary, 'p1')
      const Page = App.surface('RefreshInFlight', { model: () => ({ project }) })
      const entry = Data.subscriptions({ page: Page }, { policy: RemotePolicy.networkOnly })[
        'page.read'
      ]
      const settled = await Effect.runPromise(
        Effect.gen(function* () {
          let name = 'Apollo'
          let calls = 0
          const called = yield* Deferred.make<void>()
          const gate = yield* Deferred.make<void>()
          const layer = Layer.succeed(RemoteClient, {
            read: batch => {
              calls += 1
              // The answer is the server as it is when the read is sent.
              const answer = {
                entities: batch.requests.map(request => ({
                  entity: request.entity,
                  id: request.id,
                  values: { name },
                })),
              }
              // The first read reports that it was sent, and resolves only when the test says so.
              return calls === 1
                ? Deferred.succeed(called, undefined).pipe(
                    Effect.andThen(Deferred.await(gate)),
                    Effect.as(answer),
                  )
                : Effect.succeed(answer)
            },
            query: () => Effect.die('unused'),
            mutate: () => Effect.die('unused'),
            live: () => Stream.empty,
          })

          // Foldkit's part: reduce each Message, and restart the stream when the
          // dependencies change. A stream's end is reported by its generation.
          const inbox = yield* Queue.unbounded<RemoteMessage | { readonly ended: number }>()
          let model = Data.reduce(initial, {
            _tag: 'ReadReceived',
            requests: [{ entity: 'Project', id: 'p1', fields: ['name'] }],
            result: { entities: [{ entity: 'Project', id: 'p1', values: { name } }] },
            now: 0,
          })
          let dependencies = entry.modelToDependencies(model)
          let generation = 0
          const start = () => {
            const ended = generation
            return Effect.forkChild(
              Stream.runForEach(entry.dependenciesToStream(dependencies), message =>
                Queue.offer(inbox, message),
              ).pipe(Effect.andThen(Queue.offer(inbox, { ended })), Effect.provide(layer)),
            )
          }
          let fiber = yield* start()
          const settle = (next: Model) =>
            Effect.gen(function* () {
              model = next
              const changed = entry.modelToDependencies(model)
              if (JSON.stringify(changed) === JSON.stringify(dependencies)) return
              dependencies = changed
              yield* Fiber.interrupt(fiber)
              generation += 1
              fiber = yield* start()
            })

          // The read is announced and in flight; then the server changes and the user refreshes.
          for (let taken = 0; taken < 2; taken += 1) {
            const message = yield* Queue.take(inbox)
            if ('_tag' in message) yield* settle(Data.reduce(model, message))
          }
          expect(project.read(model)).toEqual({ _tag: 'Refreshing', value: { name: 'Apollo' } })
          yield* Deferred.await(called)
          name = 'Apollo II'
          yield* settle(Data.refresh(model, project))
          yield* Deferred.succeed(gate, undefined)

          for (;;) {
            const message = yield* Queue.take(inbox)
            if (!('_tag' in message)) {
              if (message.ended === generation) break
              continue
            }
            yield* settle(Data.reduce(model, message))
          }
          return model
        }),
      )

      expect(project.read(settled)).toEqual({ _tag: 'Ready', value: { name: 'Apollo II' } })
    })

    it('refuses a Surface whose params it cannot supply', () => {
      const Paged = App.surface('RefreshPaged', {
        params: { id: Schema.String },
        model: ({ params }) => ({ project: Data.get(summary, params.id) }),
      })
      const refused = () =>
        // @ts-expect-error a Surface with params needs them: refresh its projection instead.
        Data.refresh(initial, Paged)
      expect(typeof refused).toBe('function')
    })
  })

  it('carries the connection and no entity requirement; it reads Initial until the page is known', () => {
    expect(requirementsOf(projects)).toEqual([])
    expect(connectionsOf(projects)).toEqual([
      {
        identity,
        window: { first: 2 },
        select: { entity: 'Project', fields: ['name'] },
        ref: projects.ref,
      },
    ])
    expect(projects.ref).toEqual({
      ...ProjectsByOwner.ref({ ownerId: 'u1' }),
      window: { first: 2 },
    })
    expect(projects.read(initial)).toEqual({ _tag: 'Initial' })
    // The window is what was asked, and only that.
    expect(Data.query(ProjectsByOwner, { ownerId: 'u1' }, { select: summary }).ref.window).toEqual(
      {},
    )
    expect(
      Data.query(ProjectsByOwner, { ownerId: 'u1' }, { select: summary, last: 3, before: 'c' }).ref
        .window,
    ).toEqual({ last: 3, before: 'c' })
    expect(
      Data.query(
        ProjectsByOwner,
        { ownerId: 'u1' },
        { select: summary, first: 2, after: undefined },
      ).ref.window,
    ).toStrictEqual({ first: 2 })
  })

  it('plans an unknown or stale connection as a query, and a known one as its items’ fields', () => {
    expect(Data.plan(initial, projects)).toEqual([])
    expect(Remote.planQueries(Data, initial, projects)).toEqual([projects.ref])

    const known = merged(initial, ['p1', 'p2'])
    expect(Remote.planQueries(Data, known, projects)).toEqual([])
    expect(Data.plan(known, projects)).toEqual([
      { entity: 'Project', id: 'p1', fields: ['name'] },
      { entity: 'Project', id: 'p2', fields: ['name'] },
    ])
    expect(Data.plan(read(known, ['p1']), projects)).toEqual([
      { entity: 'Project', id: 'p2', fields: ['name'] },
    ])

    const stale = Data.reduce(known, { _tag: 'ConnectionInvalidated', connection: identity })
    expect(Remote.planQueries(Data, stale, projects)).toEqual([projects.ref])
    expect(Data.plan(stale, projects)).toEqual([])
    expect(Remote.planQueries(Data, known, projects, { force: true })).toEqual([projects.ref])
  })

  it('reads Ready once every item is assembled, Refreshing while any part refetches, Failed on bad data', () => {
    const known = merged(initial, ['p1', 'p2'])
    expect(projects.read(read(known, ['p1']))).toEqual({ _tag: 'Initial' })
    const loaded = read(known, ['p1', 'p2'])
    const page = {
      items: [{ name: 'name of p1' }, { name: 'name of p2' }],
      hasNext: true,
      hasPrevious: false,
    }
    expect(projects.read(loaded)).toEqual({ _tag: 'Ready', value: page })
    expect(projects.read(read(merged(initial, ['p1', 'p2'], terminal), ['p1', 'p2']))).toEqual({
      _tag: 'Ready',
      value: { ...page, hasNext: false },
    })
    expect(
      projects.read(Data.reduce(loaded, { _tag: 'ConnectionInvalidated', connection: identity })),
    ).toEqual({ _tag: 'Refreshing', value: page })
    expect(
      projects.read(
        Data.reduce(loaded, {
          _tag: 'RefreshStarted',
          requests: [{ entity: 'Project', id: 'p2', fields: ['name'] }],
        }),
      ),
    ).toEqual({ _tag: 'Refreshing', value: page })
    const corrupt = {
      ...loaded,
      remote: {
        ...loaded.remote,
        entities: writeEntity(loaded.remote.entities, entityKey('Project', 'p2'), { name: 42 }),
      },
    }
    expect(projects.read(corrupt)).toMatchObject({ _tag: 'Failed', error: { _tag: 'DecodeError' } })
  })

  it('the read entry runs the query; the merged page makes its items the next plan', async () => {
    const List = App.surface('List', { model: () => ({ projects }) })
    const subscriptions = Data.subscriptions({ list: List })
    const entry = subscriptions['list.read']
    expect(entry.modelToDependencies(initial)).toEqual({
      requirements: [],
      queries: [
        { identity, window: { first: 2 }, select: { entity: 'Project', fields: ['name'] } },
      ],
      refresh: 0,
    })
    // The connection is a retention root by itself, with what the page selects of each item.
    expect(subscriptions.retain.modelToDependencies(initial)).toEqual({
      requirements: [],
      connections: [{ identity, select: { entity: 'Project', fields: ['name'] } }],
    })

    const client = paging(['p1', 'p2', 'p3'])
    const messages = await Effect.runPromise(
      Stream.runCollect(entry.dependenciesToStream(entry.modelToDependencies(initial))).pipe(
        Effect.provide(client.layer),
      ),
    )
    // One Message per page: the merge and the refresh together, so a stream restart
    // between two Messages cannot leave the connection stale and re-querying.
    expect(messages).toEqual([
      {
        _tag: 'ConnectionMerged',
        connection: identity,
        page: {
          edges: [
            { key: 'Project:p1', ref: { entity: 'Project', id: 'p1' } },
            { key: 'Project:p2', ref: { entity: 'Project', id: 'p2' } },
          ],
          start: terminal,
          end: cursor('p2'),
        },
        refreshes: true,
      },
    ])
    // The wire request is rebuilt from the connection identity: the canonical encoded input.
    expect(client.queries).toEqual([{ input: { ownerId: 'u1' }, window: { first: 2 } }])
    expect(client.reads).toEqual([])
    // The page changes the Model, so Foldkit recomputes the dependencies: the page's
    // items, planned against the store, are what the restarted stream reads.
    const paged = messages.reduce(Data.reduce, initial)
    expect(projects.read(paged)).toEqual({ _tag: 'Initial' })
    expect(entry.modelToDependencies(paged)).toEqual({
      requirements: [
        { entity: 'Project', id: 'p1', fields: ['name'] },
        { entity: 'Project', id: 'p2', fields: ['name'] },
      ],
      queries: [],
      refresh: 0,
    })
    const reads = await Effect.runPromise(
      Stream.runCollect(entry.dependenciesToStream(entry.modelToDependencies(paged))).pipe(
        Effect.provide(client.layer),
      ),
    )
    expect(reads.map(message => message._tag)).toEqual(['ReadStarted', 'ReadReceived'])
    expect(client.reads).toEqual([['p1', 'p2']])
    const loaded = reads.reduce(Data.reduce, paged)
    expect(projects.read(loaded)).toEqual({
      _tag: 'Ready',
      value: {
        items: [{ name: 'name of p1' }, { name: 'name of p2' }],
        hasNext: true,
        hasPrevious: false,
      },
    })
    expect(entry.modelToDependencies(loaded)).toEqual({ requirements: [], queries: [], refresh: 0 })
  })

  it('a refreshing policy announces only the fields it refetches, never a bare query', async () => {
    const List = App.surface('List', { model: () => ({ projects }) })
    let clock = 5_000
    const entry = Data.subscriptions(
      { list: List },
      { policy: RemotePolicy.staleWhileRevalidate({ maxAge: 1_000 }), now: () => clock },
    )['list.read']
    const messages = await Effect.runPromise(
      Stream.runCollect(entry.dependenciesToStream(entry.modelToDependencies(initial))).pipe(
        Effect.provide(paging(['p1']).layer),
      ),
    )
    expect(messages.map(message => message._tag)).toEqual(['ConnectionMerged'])
    // With the page known and its items aged out, the refetch is announced.
    const loaded = read(messages.reduce(Data.reduce, initial), ['p1'])
    clock = 10_000
    const refetch = await Effect.runPromise(
      Stream.runCollect(entry.dependenciesToStream(entry.modelToDependencies(loaded))).pipe(
        Effect.provide(paging(['p1']).layer),
      ),
    )
    expect(refetch.map(message => message._tag)).toEqual([
      'ReadStarted',
      'RefreshStarted',
      'ReadReceived',
    ])
  })

  it('a connection invalidated before it was ever loaded still reads Initial', () => {
    const never = Data.reduce(initial, { _tag: 'ConnectionInvalidated', connection: identity })
    expect(projects.read(never)).toEqual({ _tag: 'Initial' })
    expect(Remote.planQueries(Data, never, projects)).toEqual([projects.ref])
  })

  it('a hand-built connection that is not a query’s fails as a query would, without dying', async () => {
    const literal = Projection.fromReader(Schema.Unknown, () => null, {
      metadata: RemoteConnections.of({
        identity: 'Feed',
        window: {},
        select: { entity: 'Project', fields: ['name'] },
      }),
    })
    const List = App.surface('List', { model: () => ({ literal }) })
    const entry = Data.subscriptions({ list: List })['list.read']
    expect(Remote.planQueries(Data, initial, literal)).toEqual([])
    const messages = await Effect.runPromise(
      Stream.runCollect(entry.dependenciesToStream(entry.modelToDependencies(initial))).pipe(
        Effect.provide(paging(['p1']).layer),
      ),
    )
    expect(messages).toEqual([
      {
        _tag: 'QueryFailed',
        connection: 'Feed',
        error: {
          _tag: 'RemoteQueryError',
          message: 'connection "Feed" is not a query\'s: only a QueryRef identity can be run',
        },
      },
    ])
  })

  it('a failed query yields QueryFailed, which ends the refresh and keeps the pages', async () => {
    const List = App.surface('List', { model: () => ({ projects }) })
    const entry = Data.subscriptions({ list: List })['list.read']
    const stale = Data.reduce(read(merged(initial, ['p1', 'p2']), ['p1', 'p2']), {
      _tag: 'ConnectionInvalidated',
      connection: identity,
    })
    expect(entry.modelToDependencies(stale).queries).toHaveLength(1)
    const messages = await Effect.runPromise(
      Stream.runCollect(entry.dependenciesToStream(entry.modelToDependencies(stale))).pipe(
        Effect.provide(paging([], { fail: true }).layer),
      ),
    )
    expect(messages).toEqual([
      {
        _tag: 'QueryFailed',
        connection: identity,
        error: { _tag: 'RemoteQueryError', message: 'boom' },
      },
    ])
    const settled = messages.reduce(Data.reduce, stale)
    expect(projects.read(settled)).toMatchObject({ _tag: 'Ready' })
    expect(entry.modelToDependencies(settled).queries).toEqual([])
  })

  it('an empty page reads nothing further; a page of another entity plans no items', async () => {
    const List = App.surface('List', { model: () => ({ projects }) })
    const entry = Data.subscriptions({ list: List })['list.read']
    const client = paging([])
    const messages = await Effect.runPromise(
      Stream.runCollect(entry.dependenciesToStream(entry.modelToDependencies(initial))).pipe(
        Effect.provide(client.layer),
      ),
    )
    expect(messages.map(message => message._tag)).toEqual(['ConnectionMerged'])
    const empty = messages.reduce(Data.reduce, initial)
    expect(projects.read(empty)).toEqual({
      _tag: 'Ready',
      value: { items: [], hasNext: false, hasPrevious: false },
    })
    expect(entry.modelToDependencies(empty)).toEqual({ requirements: [], queries: [], refresh: 0 })
    const foreign = Data.reduce(initial, {
      _tag: 'ConnectionMerged',
      connection: identity,
      page: {
        edges: [{ key: 'User:u1', ref: { entity: 'User', id: 'u1' } }],
        start: terminal,
        end: terminal,
      },
    })
    expect(Data.plan(foreign, projects)).toEqual([])
  })

  it('next and previous page from the loaded boundaries, keeping the page size', () => {
    expect(Data.next(initial, projects)).toBeUndefined()
    expect(Data.previous(initial, projects)).toBeUndefined()
    const known = merged(initial, ['p1', 'p2'])
    expect(Data.next(known, projects)).toEqual({
      ...projects.ref,
      window: { first: 2, after: 'after:p2' },
    })
    expect(Data.previous(known, projects)).toBeUndefined()
    expect(Data.next(merged(initial, ['p1', 'p2'], terminal), projects)).toBeUndefined()
    expect(Data.next(merged(initial, ['p1'], { _tag: 'Unknown' }), projects)).toBeUndefined()

    const backwards = Data.reduce(initial, {
      _tag: 'ConnectionMerged',
      connection: identity,
      page: { edges: [edge('p9')], start: cursor('before:p9'), end: terminal },
    })
    expect(Data.previous(backwards, projects)).toEqual({
      ...projects.ref,
      window: { last: 2, before: 'before:p9' },
    })
    const unknownStart = Data.reduce(initial, {
      _tag: 'ConnectionMerged',
      connection: identity,
      page: { edges: [edge('p9')], start: { _tag: 'Unknown' }, end: terminal },
    })
    expect(Data.previous(unknownStart, projects)).toBeUndefined()
    const whole = Data.query(ProjectsByOwner, { ownerId: 'u1' }, { select: summary })
    expect(Data.next(known, whole)).toEqual({ ...whole.ref, window: { after: 'after:p2' } })
    const last = Data.query(ProjectsByOwner, { ownerId: 'u1' }, { select: summary, last: 5 })
    expect(Data.next(known, last)).toEqual({ ...last.ref, window: { first: 5, after: 'after:p2' } })
  })

  it('fetch is a Command that merges the page, or reports the failure', async () => {
    const known = read(merged(initial, ['p1', 'p2'], cursor('p2')), ['p1', 'p2'])
    const next = Data.next(known, projects)!
    const command = Data.fetch(next)
    expect(command.name).toBe('Remote.query(ProjectsByOwner)')
    expect(command.args).toEqual({ connection: identity, window: { first: 2, after: 'p2' } })
    const client = paging(['p1', 'p2', 'p3', 'p4', 'p5'])
    const merge = await Effect.runPromise(command.effect.pipe(Effect.provide(client.layer)))
    expect(merge).toMatchObject({ _tag: 'ConnectionMerged', connection: identity })
    expect(client.queries).toEqual([
      { input: { ownerId: 'u1' }, window: { first: 2, after: 'p2' } },
    ])
    const more = Data.reduce(known, merge)
    // The new page's items are what the read entry plans next.
    expect(Data.plan(more, projects)).toEqual([
      { entity: 'Project', id: 'p3', fields: ['name'] },
      { entity: 'Project', id: 'p4', fields: ['name'] },
    ])
    expect(projects.read(read(more, ['p3', 'p4']))).toEqual({
      _tag: 'Ready',
      value: {
        items: ['p1', 'p2', 'p3', 'p4'].map(id => ({ name: `name of ${id}` })),
        hasNext: true,
        hasPrevious: false,
      },
    })
    const failed = await Effect.runPromise(
      command.effect.pipe(Effect.provide(paging([], { fail: true }).layer)),
    )
    expect(failed).toEqual({
      _tag: 'QueryFailed',
      connection: identity,
      error: { _tag: 'RemoteQueryError', message: 'boom' },
    })
  })

  it('prefetch runs the pending queries, then one read for their items, and returns the Model', async () => {
    const List = App.surface('List', {
      model: () => ({ projects, owner: Data.get(User.select({ name: true }), 'u1') }),
    })
    const client = paging(['p1', 'p2', 'p3'])
    const loaded = await Effect.runPromise(
      Data.prefetch(initial, List.projection(undefined)).pipe(Effect.provide(client.layer)),
    )
    expect(client.queries).toHaveLength(1)
    expect(client.reads).toEqual([['p1', 'p2', 'u1']])
    expect(List.projection(undefined).read(loaded)).toEqual({
      projects: {
        _tag: 'Ready',
        value: {
          items: [{ name: 'name of p1' }, { name: 'name of p2' }],
          hasNext: true,
          hasPrevious: false,
        },
      },
      owner: { _tag: 'Ready', value: { name: 'name of u1' } },
    })
    // Nothing is pending afterwards, so a second prefetch touches the client no further.
    const again = await Effect.runPromise(
      Data.prefetch(loaded, List.projection(undefined)).pipe(Effect.provide(client.layer)),
    )
    expect(again).toBe(loaded)
    expect(client.queries).toHaveLength(1)
    expect(client.reads).toHaveLength(1)
    // A stale connection is queried again and reads fresh afterwards.
    const stale = Data.reduce(loaded, { _tag: 'ConnectionInvalidated', connection: identity })
    expect(projects.read(stale)).toMatchObject({ _tag: 'Refreshing' })
    const fresh = await Effect.runPromise(
      Data.prefetch(stale, projects).pipe(Effect.provide(client.layer)),
    )
    expect(client.queries).toHaveLength(2)
    expect(projects.read(fresh)).toMatchObject({ _tag: 'Ready' })
    // A query failure fails the prefetch, as a read failure does.
    const exit = await Effect.runPromiseExit(
      Data.prefetch(initial, projects).pipe(Effect.provide(paging([], { fail: true }).layer)),
    )
    expect(exit._tag).toBe('Failure')
  })

  it('two projections of one connection plan one query and select the union of their fields', () => {
    const ids = Data.query(
      ProjectsByOwner,
      { ownerId: 'u1' },
      { select: Project.select({ id: true }), first: 2 },
    )
    const both = Projection.struct({ names: projects, ids })
    expect(connectionsOf(both).map(connection => connection.select)).toEqual([
      { entity: 'Project', fields: ['name', 'id'] },
    ])
    expect(Remote.planQueries(Data, initial, both)).toEqual([projects.ref])
    // The retention root selects the union too, and a connection listed by identity
    // keeps the select a projection gives it.
    expect(Remote.retain([projects, ids]).modelToDependencies(initial).connections).toEqual([
      { identity, select: { entity: 'Project', fields: ['name', 'id'] } },
    ])
    expect(
      Remote.retain([projects], undefined, { connections: [identity, 'Zed'] }).modelToDependencies(
        initial,
      ).connections,
    ).toEqual([{ identity, select: { entity: 'Project', fields: ['name'] } }, { identity: 'Zed' }])
    expect(Data.plan(merged(initial, ['p1']), both)).toEqual([
      { entity: 'Project', id: 'p1', fields: ['name', 'id'] },
    ])
    // The planner merges for itself too, as it does requirements, for a hand-built projection.
    const literal = Projection.fromReader(Schema.Unknown, () => null, {
      metadata: RemoteConnections.of(...connectionsOf(projects), ...connectionsOf(ids)),
    })
    expect(Remote.planQueries(Data, initial, literal)).toEqual([projects.ref])
    expect(Data.plan(merged(initial, ['p1']), literal)).toEqual([
      { entity: 'Project', id: 'p1', fields: ['name', 'id'] },
    ])
    // Another window of the same connection is another query.
    const wider = Data.query(ProjectsByOwner, { ownerId: 'u1' }, { select: summary, first: 50 })
    expect(Remote.planQueries(Data, initial, Projection.struct({ a: projects, b: wider }))).toEqual(
      [projects.ref, wider.ref],
    )
  })
})
