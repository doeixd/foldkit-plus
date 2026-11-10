/**
 * Data routing (#236): each Site node owns the Surface its page reads, and the
 * window a read keeps is the route's, chosen by the `policy` matched over the
 * route shown. Both are read from the real wiring's Subscriptions.
 */
import { Effect, Option, Stream } from 'effect'
import { fromString } from 'foldkit/url'
import { Remote, type RemoteClient } from 'foldkit-remote'
import { Respond, Trace } from 'foldkit-remote/testing'
import { RemoteServer } from 'foldkit-remote-server'
import { describe, expect, it } from 'vitest'
import { actives, freshness, policy, profileFreshness, subscriptions, update } from '../src/app.js'
import { openServer, principalOf } from '../src/server/server.js'
import { memorySqlite } from '../src/server/sqlite-node.js'
import { Data, Message } from '../src/state.js'
import { opened } from './opened.js'

const sandbox = (): RemoteClient['Service'] => {
  const { server, database } = openServer(memorySqlite())
  const handlers = RemoteServer.handlers(server, principalOf('you'))
  const json = Remote.json(request =>
    Effect.runPromise(
      RemoteServer.answer(handlers, JSON.parse(request)).pipe(Effect.provide(database)),
    ).then(answered => answered.body),
  )
  return {
    read: json.FoldkitRemoteRead,
    query: json.FoldkitRemoteQuery,
    mutate: json.FoldkitRemoteMutate,
    live: () => Stream.never,
  }
}

const to = (path: string) =>
  Message.ChangedUrl({ url: Option.getOrThrow(fromString(`http://chirp.test${path}`)) })

/** The page at `path`, loaded: the Model once everything it asked is answered. */
const shown = async (path: string, at: number) => {
  const trace = await Trace.run(Data, {
    start: opened,
    update,
    active: actives,
    options: { policy },
    client: sandbox(),
    now: at,
    steps: [to(path), Respond.all],
  })
  return trace.entries.at(-1)!.model
}

const tags = ['Home', 'Profile', 'Status'] as const

const entry = (tag: (typeof tags)[number]) => subscriptions[`${tag}.read`]!

/** What each node's reads ask for at `model`: row ids and list identities, by the node's tag. */
const asked = (model: typeof opened) =>
  Object.fromEntries(
    tags.map(tag => {
      const { requirements, queries } = entry(tag).modelToDependencies(model)
      return [
        tag,
        [
          ...requirements.map((row: { entity: string; id: string }) => `${row.entity} ${row.id}`),
          ...queries.map((list: { identity: string }) => list.identity.replace(/\p{Cc}/gu, ' ')),
        ],
      ]
    }),
  )

const routes = [
  {
    path: '/',
    tag: 'Home',
    asks: { Home: ['Timeline {}'], Profile: [], Status: [] },
    window: 60_000,
  },
  {
    path: '/ada',
    tag: 'Profile',
    asks: { Home: [], Profile: ['User ada', 'ByAuthor {"authorId":"ada"}'], Status: [] },
    window: 15_000,
  },
  {
    path: '/ada/status/p1',
    tag: 'Status',
    asks: { Home: [], Profile: [], Status: ['Post p1'] },
    window: 60_000,
  },
] as const

describe('the reads on each route', () => {
  it('are the Surfaces of the nodes in the tree, and the editor', () => {
    expect(Object.keys(actives).sort()).toEqual(['Home', 'Profile', 'Status', 'editor'])
  })

  it.each(routes)('at $path ask only what the $tag node reads', async ({ path, asks }) => {
    const trace = await Trace.run(Data, {
      start: opened,
      update,
      active: actives,
      client: sandbox(),
      steps: [to(path)],
    })

    expect(asked(trace.entries.at(-1)!.model)).toEqual(asks)
  })
})

describe('the window each route keeps', () => {
  it('is matched over the route shown', () => {
    const at = (path: string) => policy(update(opened, to(path)).model)

    expect(at('/')).toBe(freshness)
    expect(at('/ada')).toBe(profileFreshness)
    expect(at('/ada/status/p1')).toBe(freshness)
    expect(at('/nowhere/at/all/x')).toBe(freshness)
  })

  it.each(routes)(
    'is what the wiring gives the $tag node at $path',
    async ({ path, tag, window }) => {
      const answeredAt = Date.now()
      const model = await shown(path, answeredAt)

      expect(entry(tag).modelToDependencies(model).expires?.at).toBe(answeredAt + window)
    },
  )
})
