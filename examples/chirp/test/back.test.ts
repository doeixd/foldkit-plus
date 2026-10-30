/**
 * Going back to a page you just left (#234). Chirp reads under
 * `staleWhileRevalidate` with a minute's window, so the timeline you return to
 * within it is drawn from the store, `Ready`, and nothing is asked again.
 */
import { Effect, Option, Stream } from 'effect'
import { fromString } from 'foldkit/url'
import { Remote, RemotePolicy, type RemoteClient } from 'foldkit-remote'
import { Respond, Trace } from 'foldkit-remote/testing'
import { RemoteServer } from 'foldkit-remote-server'
import { describe, expect, it } from 'vitest'
import { Data, Message, actives, freshness, subscriptions, update } from '../src/app.js'
import { Timeline, TimelinePost } from '../src/operations.js'
import { openServer, principalOf } from '../src/server/server.js'
import { memorySqlite } from '../src/server/sqlite-node.js'
import { opened } from './opened.js'

const timeline = Data.query(Timeline, {}, { select: TimelinePost, first: 25 })

/** Remote's client over the sandbox's server, as you. */
const sandbox = (): RemoteClient['Service'] => {
  const { server, database } = openServer(memorySqlite())
  const handlers = RemoteServer.handlers(server, principalOf('you'))
  const json = Remote.json(request =>
    Effect.runPromise(
      RemoteServer.answer(handlers, JSON.parse(request)).pipe(Effect.provide(database)),
    ).then(answered => answered.body),
  )
  return {
    // A server in the same process always answers.
    read: batch => json.FoldkitRemoteRead(batch).pipe(Effect.catchTag('Unreachable', Effect.die)),
    query: request =>
      json.FoldkitRemoteQuery(request).pipe(Effect.catchTag('Unreachable', Effect.die)),
    mutate: json.FoldkitRemoteMutate,
    live: () => Stream.never,
  }
}

const to = (path: string) =>
  Message.ChangedUrl({ url: Option.getOrThrow(fromString(`http://chirp.test${path}`)) })

/** The timeline loaded, a profile opened, and the timeline gone back to, under `policy`. */
const back = (policy: RemotePolicy) =>
  Trace.run(Data, {
    start: opened,
    update,
    active: actives,
    options: { policy },
    client: sandbox(),
    steps: [Respond.all, to('/ada'), Respond.all, to('/')],
  })

describe("Chirp's own wiring", () => {
  it('ages the timeline, so it keeps its age once left', () => {
    expect(subscriptions.retain!.modelToDependencies(opened).connections).toEqual([
      expect.objectContaining({ identity: timeline.ref.identity, ages: true }),
    ])
  })
})

describe('the timeline gone back to', () => {
  it('within the minute is drawn from the store, and asks nothing', async () => {
    const trace = await back(freshness)

    expect(Trace.tags(trace, timeline)).toEqual(['Initial', 'Loading', 'Ready'])
    expect(trace.pending).toEqual([])
  })

  it('without a window is held stale, and asked for again with its rows on screen', async () => {
    const trace = await back(RemotePolicy.cacheFirst)

    expect(Trace.tags(trace, timeline)).toEqual(['Initial', 'Loading', 'Ready', 'Refreshing'])
    expect(Trace.regressions(trace, { timeline })).toEqual([])
    expect(trace.pending).toEqual(['query Timeline {}'])
  })
})
