// @vitest-environment node
/**
 * A `may` that says yes where the server says no (#284): held stale after a
 * change the page did not see, or edited in the page's own cache. The page
 * sends the write, the server refuses it, and the page shows the refusal and
 * takes its edit back. Nothing the page holds decides a write.
 */
import { Effect, Layer, Stream } from 'effect'
import { Entity } from 'foldkit-entity'
import { Remote, RemoteClient } from 'foldkit-remote'
import { RemoteServer } from 'foldkit-remote-server'
import { describe, expect, it } from 'vitest'
import { Data, initial } from '../src/app.js'
import { Post } from '../src/guard.js'
import { EditPost, PostChirp, TimelinePost, Timeline } from '../src/operations.js'
import { openServer, principalOf } from '../src/server/server.js'
import { memorySqlite } from '../src/server/sqlite-node.js'

const ADAS = 'The engine weaves algebraic patterns as the loom weaves flowers.'

/** Ada's p1, as a page holds it whose `may` says you may edit it. */
const held = Data.reduce(initial, {
  _tag: 'ReadReceived',
  requests: [{ entity: 'Post', id: 'p1', fields: ['id', 'body', 'may'] }],
  result: {
    settled: [],
    entities: [
      {
        entity: 'Post',
        id: 'p1',
        values: {
          id: 'p1',
          body: ADAS,
          may: { row: { Update: true, Delete: true }, reasons: {}, members: {}, relations: {} },
        },
      },
    ],
  },
  now: 0,
})

const Shown = Entity.select(Post, { body: true })
const body = (model: typeof held) => {
  const read = Data.get(Shown, 'p1').read(model)
  return read._tag === 'Ready' ? read.value.body : read._tag
}

describe('an edit a held may allows and the server does not', () => {
  it('is sent, refused as Forbidden, shown as refused, and taken back', async () => {
    const started = Data.mutate(held, EditPost, { id: 'p1', body: 'Mine now' })
    // The page believes its may: it shows the edit at once and sends it.
    expect(body(started.model)).toBe('Mine now')
    const { server, database } = openServer(memorySqlite())
    const answer = await Effect.runPromise(
      started.command.effect.pipe(
        Effect.provide(
          Remote.clientLayer(RemoteServer.handlers(server, principalOf('you'))).pipe(
            Layer.provide(database),
          ),
        ),
      ),
    )
    expect(answer).toMatchObject({
      _tag: 'MutationFailed',
      error: { _tag: 'Forbidden' },
    })
    const answered = Data.reduce(started.model, answer)
    expect(Data.mutation(answered, started.requestId)).toMatchObject({
      _tag: 'Failed',
      error: { _tag: 'Forbidden' },
    })
    expect(body(answered)).toBe(ADAS)
  })
})

describe('the may a page foresees for its own chirp', () => {
  it('is never sent, and gives way to the server’s answer', async () => {
    const { server, database } = openServer(memorySqlite())
    const handlers = RemoteServer.handlers(server, principalOf('you'))
    const sent: Array<string> = []
    // What goes up the wire, as text, through the real handlers.
    const json = Remote.json(request => {
      sent.push(request)
      return Effect.runPromise(
        RemoteServer.answer(handlers, JSON.parse(request)).pipe(Effect.provide(database)),
      ).then(answered => answered.body)
    })
    const client: RemoteClient['Service'] = {
      read: () => Effect.die('unused'),
      query: () => Effect.die('unused'),
      mutate: json.FoldkitRemoteMutate,
      live: () => Stream.never,
    }
    // The timeline shows may, so the write's answer reads it back.
    const showing = Data.reduce(initial, {
      _tag: 'ConnectionMerged',
      connection: Data.query(Timeline, {}, { select: TimelinePost, first: 25 }).ref.identity,
      page: { edges: [], start: { _tag: 'Terminal' }, end: { _tag: 'Terminal' } },
    })
    const started = Data.mutate(showing, PostChirp, { id: 'n1', body: 'Hi' }, { now: 1 })
    const Mine = Entity.select(Post, { may: true })
    const foreseen = Data.get(Mine, 'n1').read(started.model)
    expect(foreseen).toMatchObject({ _tag: 'Ready', value: { may: { row: { Update: true } } } })
    const answer = await Effect.runPromise(
      started.command.effect.pipe(Effect.provideService(RemoteClient, client)),
    )
    expect(sent).toHaveLength(1)
    const request = JSON.parse(sent[0]!) as { readonly payload: { readonly input: object } }
    expect(request.payload.input).toEqual({ id: 'n1', body: 'Hi' })
    // `may` is named among what the page shows, never given a value.
    expect(sent[0]).not.toContain('"row"')
    if (answer._tag !== 'MutationSucceeded') throw new Error(`answered ${answer._tag}`)
    const served = [...answer.entities, ...(answer.read?.result.entities ?? [])].find(
      row => row.entity === 'Post' && row.id === 'n1' && Object.hasOwn(row.values, 'may'),
    )
    expect(served).toBeDefined()
    expect(Data.get(Mine, 'n1').read(Data.reduce(started.model, answer))).toMatchObject({
      _tag: 'Ready',
      value: { may: served!.values.may },
    })
  })
})
