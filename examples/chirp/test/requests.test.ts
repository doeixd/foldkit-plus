/**
 * How many requests a write costs on Chirp's pages (#386): the write, and
 * whatever the page asks again once it is answered. Each scenario loads the
 * page through its real read entries over the sandbox's server, makes one
 * write, and answers everything until nothing is held; the counts are what
 * went up the wire after the write. `docs/benchmarks.md` records them.
 *
 * Chirp places every row it lists itself, so the query a post once cost was
 * `verifyPredictions` (on in development, as here) asking the server's page
 * to check the placement against. The write's answer now carries that page.
 */
import { Effect, Option, Stream } from 'effect'
import { TestClock } from 'effect/testing'
import { fromString } from 'foldkit/url'
import { Remote, type RemoteClient } from 'foldkit-remote'
import { Respond, Trace } from 'foldkit-remote/testing'
import { RemoteServer } from 'foldkit-remote-server'
import { describe, expect, it } from 'vitest'
import { ComposeForm, actives, durable, freshness, update } from '../src/app.js'
import { Data, Message } from '../src/state.js'
import { Compose } from '../src/compose.js'
import { openServer, principalOf } from '../src/server/server.js'
import { memorySqlite } from '../src/server/sqlite-node.js'
import { opened } from './opened.js'

const at = 1_800_000_000_000

/** Remote's client over a fresh sandbox, as you, counting what each kind of request sends. */
const counted = () => {
  const { server, database } = openServer(memorySqlite())
  const handlers = RemoteServer.handlers(server, principalOf('you'))
  const json = Remote.json(request =>
    Effect.runPromise(
      Effect.andThen(
        TestClock.setTime(at),
        RemoteServer.answer(handlers, JSON.parse(request)),
      ).pipe(Effect.provide(database), Effect.provide(TestClock.layer())),
    ).then(answered => answered.body),
  )
  const sent = { read: 0, query: 0, mutate: 0 }
  const client: RemoteClient['Service'] = {
    read: batch => Effect.suspend(() => (sent.read++, json.FoldkitRemoteRead(batch))),
    query: request => Effect.suspend(() => (sent.query++, json.FoldkitRemoteQuery(request))),
    mutate: request => Effect.suspend(() => (sent.mutate++, json.FoldkitRemoteMutate(request))),
    live: () => Stream.never,
  }
  return { client, sent }
}

const to = (path: string) =>
  Message.ChangedUrl({ url: Option.getOrThrow(fromString(`http://chirp.test${path}`)) })

/**
 * The page at `path`, loaded, then `write`, answered with all it leads to:
 * what went up after the write.
 */
const cost = async (path: string, write: ReadonlyArray<Message>) => {
  const { client, sent } = counted()
  const start = ComposeForm.helpers.fill({ id: 'n1', body: 'Hello' })(opened).model
  let before = { ...sent }
  await Trace.run(Data, {
    start,
    update,
    active: actives,
    options: { policy: freshness },
    client: {
      ...client,
      // What the load asked is counted apart: the first write is the line.
      mutate: request =>
        Effect.suspend(() => {
          before = { ...sent }
          return client.mutate(request)
        }),
    },
    outbox: durable,
    now: at,
    steps: [to(path), Respond.all, ...write, Respond.all],
  })
  return { read: sent.read - before.read, query: sent.query - before.query, mutate: sent.mutate }
}

const posted = [Message.GotComposeMessage({ message: Compose.Message.Submitted() })]

describe('what a write costs in requests', () => {
  it('a chirp posted on the timeline', async () => {
    expect(await cost('/', posted)).toMatchInlineSnapshot(`
      {
        "mutate": 1,
        "query": 0,
        "read": 0,
      }
    `)
  })

  it('a chirp posted on your profile', async () => {
    expect(await cost('/you', posted)).toMatchInlineSnapshot(`
      {
        "mutate": 1,
        "query": 0,
        "read": 0,
      }
    `)
  })

  it('a chirp of yours deleted from your profile', async () => {
    expect(await cost('/you', [Message.ClickedDelete({ id: 'p4' })])).toMatchInlineSnapshot(`
      {
        "mutate": 1,
        "query": 0,
        "read": 0,
      }
    `)
  })
})
