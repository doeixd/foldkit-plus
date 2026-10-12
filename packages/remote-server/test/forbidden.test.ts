/**
 * A refusal of who is asking, end to end: a Source fails with
 * `RemoteServer.forbid`, `answer` sends it as a 403, and the client's
 * mutation fails with `_tag: 'Forbidden'` and the reason, if one was given,
 * over JSON and over Effect RPC alike.
 */
import { createServer } from 'node:http'
import type { AddressInfo } from 'node:net'
import { Effect, Schema } from 'effect'
import { defineMessageUnion } from 'foldkit/message'
import { REMOTE_PROTOCOL_VERSION, Mutation, Remote, RemoteRpc } from 'foldkit-remote'
import { Surface } from 'foldkit-surface'
import { describe, expect, it } from 'vitest'
import { RemoteServer } from '../src/index.js'

const Archive = Mutation.make('Archive', { Input: { id: Schema.String }, Output: {} })

type Principal = 'admin' | 'member' | 'visitor'

const server = RemoteServer.make<Principal>({
  entities: [],
  mutations: [
    RemoteServer.mutation(Archive, ({ principal }) =>
      principal === 'admin'
        ? Effect.succeed({ output: {} })
        : Effect.fail(
            RemoteServer.forbid(principal === 'member' ? 'Only an admin may archive.' : undefined),
          ),
    ),
  ],
})

const archive = { requestId: 'r1', mutation: 'Archive', input: { id: 't1' } }
const answer = (principal: Principal) =>
  Effect.runPromise(
    RemoteServer.answer(RemoteServer.handlers(server, principal), {
      operation: 'mutate',
      payload: archive,
    }),
  )

describe('a forbidden mutation', () => {
  it('is answered as a 403, with the reason when the Source gave one', async () => {
    expect(await answer('member')).toEqual({
      status: 403,
      body: {
        error: 'Only an admin may archive.',
        forbidden: { reason: 'Only an admin may archive.' },
      },
    })
    expect(await answer('visitor')).toEqual({
      status: 403,
      body: { error: 'Forbidden', forbidden: {} },
    })
    expect((await answer('admin')).status).toBe(200)
  })

  it('fails the client’s mutation as Forbidden, over JSON, for Data.mutation to show', async () => {
    const Model = Schema.Struct({ remote: Remote.Model })
    const App = Surface.application({ Model, Message: defineMessageUnion({ ...Remote.messages }) })
    const Data = Remote.make({ model: App.model.remote, entities: [], mutations: [Archive] })
    const statusAs = async (principal: Principal) => {
      const client = Remote.json(request =>
        Effect.runPromise(
          RemoteServer.answer(RemoteServer.handlers(server, principal), JSON.parse(request)),
        ).then(answered => answered.body),
      )
      const started = Data.mutate({ remote: Remote.initial }, Archive, { id: 't1' })
      const message = await Effect.runPromise(
        started.command.effect.pipe(Effect.provide(Remote.clientLayer(client))),
      )
      return Data.mutation(Data.reduce(started.model, message), started.requestId)
    }
    expect(await statusAs('member')).toEqual({
      _tag: 'Failed',
      error: {
        _tag: 'Forbidden',
        message: 'Only an admin may archive.',
        reason: 'Only an admin may archive.',
      },
    })
    expect(await statusAs('visitor')).toEqual({
      _tag: 'Failed',
      error: { _tag: 'Forbidden', message: 'Forbidden' },
    })
  })

  it('crosses Effect RPC as Forbidden, by the error schema a transport encodes with', async () => {
    const failed = await Effect.runPromise(
      Effect.flip(RemoteServer.handlers(server, 'member').FoldkitRemoteMutate(archive)),
    )
    const declared = RemoteRpc.requests.get('FoldkitRemoteMutate')!.errorSchema
    const sent = await Effect.runPromise(
      Schema.encodeUnknownEffect(declared)(failed).pipe(
        Effect.flatMap(Schema.decodeUnknownEffect(declared)),
      ),
    )
    expect(sent).toMatchObject({ _tag: 'Forbidden', reason: 'Only an admin may archive.' })
  })
})

describe('Remote.http', () => {
  const serving = async (respond: (response: import('node:http').ServerResponse) => void) => {
    const node = createServer((_, response) => respond(response))
    await new Promise<void>(resolve => node.listen(0, '127.0.0.1', resolve))
    const { port } = node.address() as AddressInfo
    return {
      client: Remote.http(`http://127.0.0.1:${port}/remote`),
      close: () => new Promise<void>(resolve => node.close(() => resolve())),
    }
  }

  it('reads a 403 from in front of Remote as Forbidden, keeping the status', async () => {
    const { client, close } = await serving(response => {
      response.writeHead(403, { 'content-type': 'application/json' })
      response.end(JSON.stringify({ message: 'session expired' }))
    })
    // A body shaped as an error answer, from middleware, is no answer of Remote's.
    const { client: erring, close: closeErring } = await serving(response => {
      response.writeHead(403, { 'content-type': 'application/json' })
      response.end(JSON.stringify({ error: 'session expired' }))
    })
    try {
      const mutated = await Effect.runPromise(Effect.flip(client.FoldkitRemoteMutate(archive)))
      expect(mutated).toMatchObject({ _tag: 'Forbidden', message: '403 Forbidden' })
      expect(mutated).not.toHaveProperty('reason')
      expect(
        await Effect.runPromise(Effect.flip(erring.FoldkitRemoteMutate(archive))),
      ).toMatchObject({ _tag: 'Forbidden', message: '403 Forbidden' })
      const read = await Effect.runPromise(
        Effect.flip(client.FoldkitRemoteRead({ version: REMOTE_PROTOCOL_VERSION, requests: [] })),
      )
      expect(read).toMatchObject({ _tag: 'RemoteReadError', message: '403 Forbidden' })
    } finally {
      await close()
      await closeErring()
    }
  })

  it('reads a 403 that is Remote’s own answer by its body', async () => {
    const { client, close } = await serving(response => {
      response.writeHead(403, { 'content-type': 'application/json' })
      response.end(JSON.stringify({ error: 'No.', forbidden: { reason: 'Archived already.' } }))
    })
    try {
      const mutated = await Effect.runPromise(Effect.flip(client.FoldkitRemoteMutate(archive)))
      expect(mutated).toMatchObject({
        _tag: 'Forbidden',
        message: 'No.',
        reason: 'Archived already.',
      })
    } finally {
      await close()
    }
  })
})
