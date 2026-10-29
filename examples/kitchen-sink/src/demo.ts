/**
 * Runs the kitchen-sink stack end to end and returns an assertable transcript.
 *
 * The same `update` is driven by a server-derived read, a durable replicated
 * note, a human, and an agent; the four agent adapters project one contract.
 */
import { Effect, Fiber, Option, Schema, Stream } from 'effect'
import { ConnectionChange, RemotePersistence } from 'foldkit-remote'
import { Agent } from 'foldkit-agent'
import { AgentA2a } from 'foldkit-agent-a2a'
import { AgentMcp } from 'foldkit-agent-mcp'
import { AgentNative } from 'foldkit-agent-native'
import { AgentWebMcp } from 'foldkit-agent-webmcp'
import type { ModelContext, RegisterToolOptions, ToolDescriptor } from 'foldkit-agent-webmcp'
import {
  Attributes,
  Capability,
  Slot,
  Slots,
  SlotView,
  Style,
  type SlotAttributes,
} from 'foldkit-mixins'
import { SurfaceView } from 'foldkit-mixins-surface'
import { Button, ButtonSlots } from 'foldkit-mixins-ui'
import { view as buttonView } from '@foldkit/ui/button'
import { Remote, RemoteData, requirementsOf, type EntityStore } from 'foldkit-remote'
import { Sync } from 'foldkit-sync'
import {
  App,
  BoardSurface,
  Data,
  CreateProject,
  Message,
  Project,
  ProjectSummary,
  ProjectsByOwner,
  RenameProject,
  liveHub,
  makeSyncServer,
  openReplica,
  serverClient,
  update,
  wiring,
} from './stack.js'
import { AppAgent, bindAgent } from './agent.js'

const describeData = (data: RemoteData<{ readonly name: string }>): string =>
  RemoteData.match(data, {
    Initial: () => 'Initial',
    Loading: () => 'Loading',
    Ready: value => `Ready ${value.name}`,
    Refreshing: value => `Refreshing ${value.name}`,
    Failed: error => `Failed ${error._tag}`,
    NotFound: () => 'NotFound',
  })

const withStore = (model: typeof App.initial, store: EntityStore): typeof App.initial => ({
  ...model,
  remote: { ...model.remote, entities: store },
})

/** What an MCP `tools/list` answers, as far as the transcript reads it. */
const ToolList = Schema.Struct({
  result: Schema.Struct({ tools: Schema.Array(Schema.Struct({ name: Schema.String })) }),
})

/** Stands in for `document.modelContext` outside a browser. */
class RecordingModelContext implements ModelContext {
  readonly tools: Array<{ tool: ToolDescriptor; signal: AbortSignal | undefined }> = []
  registerTool = (tool: ToolDescriptor, options?: RegisterToolOptions): void => {
    this.tools.push({ tool, signal: options?.signal })
  }
  live(): ReadonlyArray<ToolDescriptor> {
    return this.tools.filter(entry => entry.signal?.aborted !== true).map(entry => entry.tool)
  }
  static tool(context: RecordingModelContext, name: string): ToolDescriptor {
    const found = context.live().find(tool => tool.name === name)
    if (found === undefined) throw new Error(`no live tool named ${name}`)
    return found
  }
}

const BoardSlots = Slots.define({
  root: Slot.make({ capability: Capability.Container }),
  name: Slot.make({ capability: Capability.Container }),
})

const BoardStyle = Style.forSlots(BoardSlots)({
  root: Style.compose(Style.class('board'), Style.inline({ display: 'grid' })),
  name: Style.class('board-name'),
})

export const runDemo = async (): Promise<ReadonlyArray<string>> => {
  const lines: string[] = []
  const say = (line: string) => lines.push(line)

  // -------------------------------------------------------------------------
  // Server-derived state: Remote + remote-server + remote-drizzle
  // -------------------------------------------------------------------------
  const client = serverClient('u1')
  const projection = Data.get(ProjectSummary, 'p1')
  say(
    `plan: ${requirementsOf(projection)
      .map(r => `${r.entity}:${r.id} [${r.fields.join(',')}]`)
      .join(', ')}`,
  )
  say(`before fetch: ${describeData(projection.read(App.initial))}`)

  const loaded = await Effect.runPromise(
    Data.prefetch(App.initial, projection).pipe(Effect.provide(client)),
  )
  say(`after fetch (Drizzle SQLite): ${describeData(projection.read(loaded))}`)
  const fetched = projection.read(loaded)
  say(
    `nested selection (one read): owner ${fetched._tag === 'Ready' ? fetched.value.owner.name : fetched._tag}`,
  )

  // A live subscription for the Board is registered with the server's hub
  // before the rename, so the patch the mutation answers with reaches it.
  // The Board's Subscription entries, as `Subscription.make` would take them;
  // the live entry exists because the Board reads the project through `Data.live`.
  const liveEntry = Data.subscriptions({ board: BoardSurface })['board.live']
  // `Data.mutate` is what `update` calls: it starts the request in the Model
  // (the id comes from the Model's own sequence) and hands back the Command
  // whose Message settles it; here the Command runs and reduces in place.
  const rename = Data.mutate(loaded, RenameProject, { id: 'p1', name: 'Apollo II' })
  const { settled, liveEvent } = await Effect.runPromise(
    Effect.gen(function* () {
      const subscription = yield* Effect.forkChild(
        Stream.runHead(liveEntry.dependenciesToStream(liveEntry.modelToDependencies(loaded))),
      )
      // The hub delivers only to registered subscribers; wait for this one.
      while ((yield* liveHub.size) === 0) yield* Effect.yieldNow
      const settled = yield* rename.command.effect
      const head = yield* Fiber.join(subscription)
      return { settled, liveEvent: head._tag === 'Some' ? head.value : undefined }
    }).pipe(Effect.provide(client)),
  )
  const renamed = Data.reduce(rename.model, settled)
  say(
    `mutation (${rename.requestId}): ${settled._tag} -> ${describeData(projection.read(renamed))}`,
  )
  say(
    `live (published by the mutation): ${
      liveEvent?._tag === 'LiveReceived' && liveEvent.event._tag === 'EntityPatched'
        ? `${liveEvent.event._tag} ${liveEvent.event.changed.join(',')}=${String(liveEvent.event.values.name)}`
        : 'nothing'
    }`,
  )

  // A query is a Projection: the connection read as a page of the selected
  // items. The prefetch runs the query through the Drizzle source, whose
  // response already carries the selected fields with the edges; a read
  // follows only for what the page leaves out.
  const projects = Data.query(
    ProjectsByOwner,
    { ownerId: 'u1' },
    { select: ProjectSummary, first: 25 },
  )
  const queried = await Effect.runPromise(
    Data.prefetch(renamed, projects).pipe(Effect.provide(client)),
  )
  const pageIds = (model: typeof App.initial) =>
    RemoteData.match(projects.read(model), {
      Initial: () => 'Initial',
      Loading: () => 'Loading',
      Ready: page => page.items.map(item => item.id).join(', '),
      Refreshing: page => `Refreshing ${page.items.map(item => item.id).join(', ')}`,
      Failed: error => `Failed ${error._tag}`,
      NotFound: () => 'NotFound',
    })
  say(`query page: ${pageIds(queried)}`)

  // An optimistic insert: the new project shows in the page at once (the patch
  // carries every field the page selects), and the server's confirmed insert
  // takes its place without a duplicate.
  const create = Data.mutate(
    queried,
    CreateProject,
    { id: 'p3', name: 'Calypso', ownerId: 'u1' },
    {
      optimistic: [
        Project.patch('p3', { id: 'p3', name: 'Calypso', status: 'active', owner: 'User:u1' }),
        ConnectionChange.prepend(projects.ref, Project.ref('p3')),
      ],
    },
  )
  say(`optimistic insert: ${pageIds(create.model)}`)
  const confirmed = Data.reduce(
    create.model,
    await Effect.runPromise(create.command.effect.pipe(Effect.provide(client))),
  )
  say(`confirmed insert: ${pageIds(confirmed)}`)
  say(`inspect: ${Data.inspect(confirmed).entities.length} entities cached`)
  const remote = confirmed.remote

  // Retention: the Board reaches p1 and, through its ref, u1. With the
  // projects page among the roots its items stay too; without it, the other
  // projects are collected.
  const retentionOf = (projections: ReadonlyArray<typeof projects>) =>
    Effect.gen(function* () {
      const entry = Remote.retain([BoardSurface.projection(undefined), ...projections])
      const message = yield* Stream.runHead(
        entry.dependenciesToStream(entry.modelToDependencies(confirmed)),
      )
      return Data.inspect(Data.reduce(confirmed, Option.getOrThrow(message)))
        .entities.map(entity => entity.key)
        .join(', ')
    })
  say(`retained with the page: ${await Effect.runPromise(retentionOf([projects]))}`)
  say(`retained by the Board alone: ${await Effect.runPromise(retentionOf([]))}`)

  // Hydration: the cache dehydrates to deterministic text (SSR would embed it)
  // and hydrates into a fresh Model with nothing left to fetch. Connections are
  // session state unless named, and this names none — the entities are the
  // cache, and the plan is empty because they are all it needed.
  const snapshot = RemotePersistence.dehydrate(RemotePersistence.snapshotOf(remote), {
    scope: 'u1',
  })
  const fresh = withStore(
    App.initial,
    Option.getOrElse(
      RemotePersistence.hydrate(snapshot, { scope: 'u1' }),
      () => RemotePersistence.emptySnapshot,
    ).entities,
  )
  say(
    `hydrated: ${describeData(projection.read(fresh))}, plan ${
      Data.plan(fresh, projection).length === 0 ? 'empty' : 'pending'
    }`,
  )

  // -------------------------------------------------------------------------
  // Client-owned replicated state: durable + sync
  // -------------------------------------------------------------------------
  const replicated = await Effect.runPromise(
    Effect.scoped(
      Effect.gen(function* () {
        const server = yield* makeSyncServer({ actorId: 'owner', canWrite: true })
        const replica = yield* openReplica
        const settled = yield* replica.statusChanges.pipe(
          Stream.filter(status => status.cursor === 1),
          Stream.take(1),
          Stream.runHead,
          Effect.forkScoped,
        )
        yield* Effect.forkScoped(
          replica.start.pipe(Effect.provide(Sync.transport.fromPromise(server.transport))),
        )
        yield* replica.submit(Message.RequestedCreateNote({ id: 'n1', body: 'First note' }))
        yield* Fiber.join(settled)
        const shared = yield* replica.shared
        yield* replica.close
        return shared
      }),
    ),
  )
  say(`replicated (durable journal): ${replicated.notes.map(note => note.body).join(', ')}`)

  // -------------------------------------------------------------------------
  // The agent contract, bound to the application's own runtime
  // -------------------------------------------------------------------------
  // The runtime a server runs per session: `update`, its Commands, and the
  // assembly's Subscriptions (Remote's reads among them) over the in-process
  // server, with no view. It owns the Model; the agent only sends Messages.
  const app = Agent.headless({
    init: () => ({ model: { ...App.initial, notes: replicated.notes } }),
    update,
    subscriptions: wiring.subscriptions(),
    resources: client,
  })
  const board = Data.live(ProjectSummary, 'p1')
  const boardRead = await new Promise<string>(resolve => {
    const check = () => {
      const data = board.read(app.host.model())
      if (data._tag !== 'Ready') return
      stop()
      resolve(describeData(data))
    }
    const stop = app.host.subscribe(check)
    check()
  })
  say(`headless board (read by its Subscription): ${boardRead}`)

  const agent = bindAgent({
    definition: AppAgent,
    host: { ...app.host, principal: () => ({ canWrite: true }) },
  })

  say(
    `capabilities: ${Agent.messages(AppAgent)
      .map(capability => capability.name)
      .join(', ')}`,
  )
  say(`agent context: ${JSON.stringify(await Effect.runPromise(agent.context))}`)
  await Effect.runPromise(
    agent.messages.dispatch(Message.RequestedCreateNote, { id: 'n2', body: 'From the agent' }),
  )
  say(
    `notes after agent: ${app.host
      .model()
      .notes.map(note => note.body)
      .join(', ')}`,
  )

  // -------------------------------------------------------------------------
  // The same contract, through each adapter
  // -------------------------------------------------------------------------
  const modelContext = new RecordingModelContext()
  const registration = AgentWebMcp.register({ agent, modelContext })
  await registration.refresh()
  say(`webmcp tools: ${registration.registered().join(', ')}`)
  const toolResult = await RecordingModelContext.tool(
    modelContext,
    'requested_create_note',
  ).execute({ id: 'n3', body: 'From WebMCP' }, {})
  say(`webmcp call: ${toolResult.content[0]?.text}`)

  const mcp = AgentMcp.handler({ agent, onNotification: () => {} })
  await mcp.handle({ jsonrpc: '2.0', id: 0, method: 'initialize' })
  const mcpList = Schema.decodeUnknownSync(ToolList)(
    await mcp.handle({ jsonrpc: '2.0', id: 1, method: 'tools/list' }),
  )
  say(`mcp tools: ${mcpList.result.tools.map(tool => tool.name).join(', ')}`)

  const card = AgentA2a.agentCard(AppAgent, {
    name: 'Kitchen Sink',
    description: 'A project board',
    url: 'https://example/a2a',
  })
  say(`a2a card: ${card.name} (${card.skills.length} skills)`)
  const a2a = AgentA2a.handler({ agent })
  await a2a.handle({
    jsonrpc: '2.0',
    id: 2,
    method: 'message/send',
    params: {
      message: {
        kind: 'message',
        role: 'user',
        messageId: 'm-1',
        parts: [
          {
            kind: 'data',
            data: { skill: 'requested_create_note', input: { id: 'n4', body: 'From A2A' } },
          },
        ],
      },
    },
  })
  say(
    `notes after A2A: ${app.host
      .model()
      .notes.map(note => note.body)
      .join(', ')}`,
  )

  const native = AgentNative.actions({ definition: AppAgent, resolveRuntime: () => agent })
  say(`native actions: ${Object.keys(native).join(', ')}`)

  // -------------------------------------------------------------------------
  // The view: mixins + mixins-surface over the Surface projection
  // -------------------------------------------------------------------------
  let rendered: SlotAttributes<typeof Message.Type> | undefined
  const BoardView = SurfaceView.define(BoardSurface, BoardSlots, (model, slots, h) => {
    rendered = slots.root.attrs()
    return h.article(slots.root.attrs(), [h.h2(slots.name.attrs(), [describeData(model.project)])])
  }).pipe(Style.attach(BoardStyle))
  SurfaceView.render(BoardView, BoardSurface, undefined, app.host.model())
  say(`rendered classes: ${Attributes.find(rendered ?? [], 'Class')?.value ?? ''}`)

  // A `@foldkit/ui` component customised through `foldkit-mixins-ui`: the
  // component hands its attribute bundle to `toView`, and `Button.resolve`
  // merges the attached Mixins around it without disturbing the base bundle.
  const SaveStyle = Style.forSlots(ButtonSlots)({ button: Style.class('save') })
  let buttonClasses = ''
  const h = SlotView.inertBuilder<typeof Message.Type>()
  buttonView<typeof Message.Type>(
    {
      onClick: Message.SelectedNote({ id: 'n1' }),
      toView: attributes => {
        const slots = Button.resolve(attributes, [SaveStyle.mixin], {
          input: undefined,
          h,
        })
        buttonClasses = Attributes.find(slots.button, 'Class')?.value ?? ''
        return h.button(slots.button, ['Rename'])
      },
    },
    h,
  )
  say(`mixins-ui button classes: ${buttonClasses || '(none)'}`)

  registration.unregister()
  await app.dispose()
  return lines
}
