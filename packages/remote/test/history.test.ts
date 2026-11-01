/**
 * Back and Forward from a held list (#401). A list left is held stale, so
 * going back reads it `Refreshing` while it refetches; going back by history
 * (`Navigated` `history`, which `Site.routing` sends for a `popstate`) within
 * `historyWindow` reads it as it was left and asks for nothing. Past the
 * window, or after a navigation the reader started, it refetches as before.
 */
import { Effect, Option, Schema, Stream } from 'effect'
import { defineMessageUnion } from 'foldkit/message'
import { modifyFields } from 'foldkit/struct'
import type * as Update from 'foldkit/update'
import { Entity as DomainEntity, Expr, Order } from 'foldkit-entity'
import { Surface } from 'foldkit-surface'
import { describe, expect, it } from 'vitest'
import {
  Query,
  Remote,
  isRemoteMessage,
  type RemoteClient,
  type RemoteMessage,
} from '../src/index.js'
import { Respond, Trace } from '../src/testing.js'
import { why, Why } from '../src/why.js'

const Project = DomainEntity.define(
  'Project',
  Schema.Struct({ id: Schema.String, name: Schema.String, ownerId: Schema.String }),
)
const Summary = DomainEntity.select(Project, { id: true, name: true })

const ProjectsByOwner = Query.define('ProjectsByOwner', { ownerId: Schema.String }, ({ input }) =>
  Query.from(Project).pipe(
    Query.where(Expr.eq(Project.fields.ownerId, input.ownerId)),
    Query.orderBy(Order.asc(Project.fields.id)),
  ),
)

const Model = Schema.Struct({ remote: Remote.Model, shown: Schema.Boolean })
type Model = typeof Model.Type
const own = { Showed: { shown: Schema.Boolean } }
const Message = defineMessageUnion({ ...Remote.messages, ...own })
type Message = typeof Message.Type
const App = Surface.application({ Model, Message })
const Data = Remote.make({
  model: App.model.remote,
  entities: [Project],
  queries: [ProjectsByOwner],
})

const projects = Data.query(ProjectsByOwner, { ownerId: 'u1' }, { select: Summary, first: 25 })
const identity = projects.ref.identity

const Own = defineMessageUnion(own)
const update = (model: Model, message: Message): Update.Return<Model, Message> => {
  if (isRemoteMessage(message)) return { model: Data.reduce(model, message) }
  return Own.match(message, {
    Showed: ({ shown }) => ({ model: modifyFields(model, { shown: () => shown }) }),
  })
}

const active = {
  projects: Data.active('projects', (model: Model) =>
    model.shown ? Option.some(projects) : Option.none(),
  ),
}

/** A server answering each query with p1 and p2, counting the queries. */
const server = () => {
  let queries = 0
  const client: RemoteClient['Service'] = {
    read: () => Effect.die('every row arrives with its page'),
    query: request => {
      queries++
      const ids = ['p1', 'p2']
      const row = (id: string): Readonly<Record<string, string>> => ({ id, name: `Project ${id}` })
      return Effect.succeed({
        edges: ids.map(id => ({ entity: 'Project', id, key: `Project:${id}` })),
        start: { _tag: 'Terminal' as const },
        end: { _tag: 'Terminal' as const },
        entities: ids.map(id => ({
          entity: 'Project',
          id,
          values: Object.fromEntries(
            (request.select?.fields ?? []).map(field => [field, row(id)[field]]),
          ),
        })),
      })
    },
    mutate: () => Effect.die('unused'),
    live: () => Stream.empty,
  }
  return { client, queries: () => queries }
}

const navigated = (kind: 'history' | 'push'): Message => Message.Navigated({ kind })

/** The list loaded, then left by a link at `now`, and the queries that took. */
const left = async (now: number) => {
  const { client, queries } = server()
  const trace = await Trace.run(Data, {
    start: { remote: Remote.initial, shown: true },
    update,
    active,
    client,
    now,
    steps: [Respond.all, navigated('push'), Message.Showed({ shown: false })],
  })
  return { model: trace.entries.at(-1)!.model, asked: queries() }
}

/** From `from`, at `now`: the navigation, the list shown again, and what was answered. */
const back = async (from: Model, now: number, kind: 'history' | 'push') => {
  const { client, queries } = server()
  const trace = await Trace.run(Data, {
    start: from,
    update,
    active,
    client,
    now,
    steps: [navigated(kind), Message.Showed({ shown: true }), Respond.all],
  })
  // What the list read from the navigation on, each change once: before it,
  // the list was not shown.
  const navigation = trace.entries.findIndex(entry => entry.message._tag === 'Navigated')
  const shown = trace.entries
    .slice(navigation)
    .map(entry => projects.read(entry.model)._tag)
    .filter((tag, at, tags) => at === 0 || tags[at - 1] !== tag)
  return { trace, shown, asked: queries() }
}

const leftAt = 1_000
const window = 300_000

describe('A list left, gone back to through history', () => {
  it('reads Ready within the window, and nothing asks for it', async () => {
    const before = await left(leftAt)
    const { trace, shown, asked } = await back(before.model, leftAt + window - 1, 'history')

    expect(before.asked).toBe(1)
    expect(asked).toBe(0)
    expect(shown).toEqual(['Ready'])
    expect(trace.entries.at(-1)!.model.remote.connections[identity]?.stale).toBe(false)
  })

  it('is refetched past the window, reading Refreshing meanwhile', async () => {
    const before = await left(leftAt)
    const { shown, asked } = await back(before.model, leftAt + window, 'history')

    expect(asked).toBe(1)
    // Held until retention, which keeps the clock, says the window has passed.
    expect(shown).toEqual(['Ready', 'Refreshing', 'Ready'])
  })

  it('is refetched after a navigation the reader started', async () => {
    const before = await left(leftAt)
    const { shown, asked } = await back(before.model, leftAt + 1, 'push')

    expect(asked).toBe(1)
    expect(shown).toEqual(['Refreshing', 'Ready'])
  })

  it('is refetched after a link, though a history navigation follows', async () => {
    const before = await left(leftAt)
    const { client, queries } = server()
    const trace = await Trace.run(Data, {
      start: before.model,
      update,
      active,
      client,
      now: leftAt + 1,
      steps: [
        navigated('push'),
        Message.Showed({ shown: true }),
        navigated('history'),
        Respond.all,
      ],
    })

    expect(queries()).toBe(1)
    expect(projects.read(trace.entries.at(-1)!.model)._tag).toBe('Ready')
  })

  it('is refetched when it was invalidated while held', async () => {
    const before = await left(leftAt)
    const invalidated = Data.reduce(before.model, {
      _tag: 'ConnectionInvalidated',
      connection: identity,
    })
    const { asked } = await back(invalidated, leftAt + 1, 'history')

    expect(asked).toBe(1)
  })

  it('is refetched when it was asked again while held', async () => {
    const before = await left(leftAt)
    const asked = Data.reduce(before.model, {
      _tag: 'RefreshStarted',
      requests: [],
      connections: [identity],
    })

    expect((await back(asked, leftAt + 1, 'history')).asked).toBe(1)
  })

  it('is refetched when it changed while held', async () => {
    const before = await left(leftAt)
    const changed = Data.reduce(before.model, {
      _tag: 'ConnectionMerged',
      connection: identity,
      page: {
        edges: [{ key: 'Project:p3', ref: { entity: 'Project', id: 'p3' } }],
        start: { _tag: 'Terminal' },
        end: { _tag: 'Terminal' },
      },
    })

    expect((await back(changed, leftAt + 1, 'history')).asked).toBe(1)
  })

  it('is not planned once shown, before retention sees it', async () => {
    const before = await left(leftAt)
    const shown = [Message.Navigated({ kind: 'history' }), Message.Showed({ shown: true })].reduce(
      (model, message) => update(model, message).model,
      before.model,
    )
    const read = Data.subscriptions(active)['projects.read']

    expect(read.modelToDependencies(shown).queries).toEqual([])
    expect(
      read.modelToDependencies(update(shown, Message.Navigated({ kind: 'push' })).model).queries,
    ).toHaveLength(1)
  })

  it('names why it is not fetched', async () => {
    const before = await left(leftAt)
    const there = Data.reduce(before.model, { _tag: 'Navigated', kind: 'history' })
    const said = why(Data, there, projects)

    expect(said.state).toBe('Ready')
    expect(said.because.filter(Why.guards.HeldForHistory)).toEqual([
      Why.HeldForHistory({ list: { query: 'ProjectsByOwner', identity } }),
    ])
  })
})

describe('A list left', () => {
  const rootsOf = (shown: boolean) =>
    Remote.retain(shown ? [projects] : []).modelToDependencies({ remote: Remote.initial, shown })
  const retention = (
    shown: boolean,
    now?: number,
  ): Extract<RemoteMessage, { readonly _tag: 'RetentionChanged' }> => ({
    _tag: 'RetentionChanged',
    roots: rootsOf(shown),
    ...(now === undefined ? {} : { now }),
  })
  const loaded = (): Model =>
    [
      retention(true),
      {
        _tag: 'ConnectionMerged',
        connection: identity,
        page: {
          edges: [{ key: 'Project:p1', ref: { entity: 'Project', id: 'p1' } }],
          start: { _tag: 'Terminal' },
          end: { _tag: 'Terminal' },
        },
        refreshes: true,
        select: { entity: 'Project', fields: ['id', 'name'] },
        entities: [{ entity: 'Project', id: 'p1', values: { id: 'p1', name: 'One' } }],
      } satisfies RemoteMessage,
    ].reduce(Data.reduce, { remote: Remote.initial, shown: true })

  it('is held only when retention says when it left', () => {
    const unstamped = [retention(false), Message.Navigated({ kind: 'history' })].reduce(
      Data.reduce,
      loaded(),
    )

    expect(projects.read(unstamped)._tag).toBe('Refreshing')
    expect(Data.reduce(unstamped, retention(true, 2))).toMatchObject({
      remote: { connections: { [identity]: { stale: true } } },
    })
  })

  it('is not held by a history navigation made before it left', () => {
    const model = [
      Message.Navigated({ kind: 'history' }),
      retention(false, 1),
      retention(true, 2),
    ].reduce(Data.reduce, loaded())

    expect(model.remote.connections[identity]?.stale).toBe(true)
  })

  it('is refetched when it was stale as it left', () => {
    const model = [
      { _tag: 'ConnectionInvalidated', connection: identity } satisfies RemoteMessage,
      retention(false, 1),
      Message.Navigated({ kind: 'history' }),
      retention(true, 2),
    ].reduce(Data.reduce, loaded())

    expect(model.remote.connections[identity]?.stale).toBe(true)
  })

  it('is not held under a window of none', () => {
    const model = [
      { ...retention(false, 1), historyWindow: 0 },
      Message.Navigated({ kind: 'history' }),
      retention(true, 1),
    ].reduce(Data.reduce, loaded())

    expect(model.remote.connections[identity]?.stale).toBe(true)
  })

  it("takes its window from Remote.make's historyWindow", async () => {
    const NoWindow = Remote.make({
      model: App.model.remote,
      entities: [Project],
      queries: [ProjectsByOwner],
      historyWindow: 0,
    })
    const leaving = await Effect.runPromise(
      Stream.runHead(NoWindow.subscriptions(active).retain.dependenciesToStream(rootsOf(false))),
    )

    expect(leaving).toMatchObject(Option.some({ _tag: 'RetentionChanged', historyWindow: 0 }))
  })

  it('takes its window from a retain entry wired by hand', async () => {
    const leaving = await Effect.runPromise(
      Stream.runHead(
        Remote.retain([], undefined, { historyWindow: 0 }).dependenciesToStream(rootsOf(false)),
      ),
    )

    expect(leaving).toMatchObject(Option.some({ _tag: 'RetentionChanged', historyWindow: 0 }))
  })

  it.each([-1, Number.NaN])('refuses a history window of %s', historyWindow => {
    expect(() =>
      Remote.make({ model: App.model.remote, entities: [Project], historyWindow }),
    ).toThrow(/historyWindow/)
    expect(() => Remote.retain([], undefined, { historyWindow })).toThrow(/historyWindow/)
  })

  it('ends its hold when retention drops it', () => {
    const model = [retention(false, 1)].reduce(Data.reduce, loaded())
    const dropped = Data.reduce(model, { ...retention(false, 2), budget: 0 })

    expect(model.remote.history.held[identity]).toBeDefined()
    expect(dropped.remote.history.held).toEqual({})
  })
})
