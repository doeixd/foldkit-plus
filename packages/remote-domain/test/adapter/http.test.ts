// @vitest-environment node
/**
 * The adapter over a real transport: the Api served by a local Node server
 * through `Domain.protocolHttp`, with the model hosted in memory behind it. The
 * server can close the socket after a command has committed, as a proxy or a
 * dropped connection does, so the reply is lost and only the retry is left.
 */
import * as InMemory from '@alchemy.run/domain/InMemory'
import { Effect, Layer, Option } from 'effect'
import * as FetchHttpClient from 'effect/http/FetchHttpClient'
import { toWebHandlerLayerWith } from 'effect/http/HttpEffect'
import { createServer, type Server } from 'node:http'
import { DomainReads, DomainRemote } from '../../src/index.js'
import { RemoteClient } from 'foldkit-remote'
import { afterEach, describe, expect, it } from 'vitest'
import {
  CurrentActor,
  ProductRowLive,
  Reserve,
  Session,
  Shop,
  ShopApi,
  invalidOf,
} from './fixture.js'

/** Whoever calls is ada: the session a cookie would give, with none to read. */
const AlwaysAda = Layer.succeed(Session, effect =>
  Effect.provideService(effect, CurrentActor, { id: 'ada' }),
)

const Reads = DomainRemote.view(Reserve.write.input.entity, ShopApi, 'ProductRow', {
  revision: 'revision',
})
const Reserving = DomainRemote.command(Reserve, ShopApi, 'ReserveStock', {
  target: input => input.id,
  input: input => ({ quantity: input.quantity, revision: input.revision }),
  refusals: {
    Moved: () => DomainRemote.refuse({ _tag: 'Conflict' }),
    Invalid: rejection => DomainRemote.refuse(invalidOf(rejection)),
    NotOwner: () => DomainRemote.forbid('Only its owner reserves its stock'),
    Missing: () => DomainRemote.fail('No such product'),
  },
  written: reply => reply,
})

const servers: Array<{ readonly server: Server; readonly dispose: () => Promise<void> }> = []
afterEach(async () => {
  for (const { server, dispose } of servers.splice(0)) {
    server.closeAllConnections()
    await new Promise(done => server.close(done))
    await dispose()
  }
})

/**
 * The model behind a Node server. `lose` arms the server to close the socket
 * on the next command it has run, in place of answering it.
 */
const serve = async () => {
  const { layer: platform, control } = InMemory.make({ manual: true })
  const hosted = AlwaysAda.pipe(
    Layer.provideMerge(Shop.layer(ProductRowLive).pipe(Layer.provide(platform))),
  )
  const web = toWebHandlerLayerWith(hosted, {
    toHandler: context => Effect.map(Effect.provideContext(ShopApi, context), api => api.fetch),
  })
  let losing = 0
  const server = createServer(async (incoming, outgoing) => {
    const chunks: Array<Buffer> = []
    for await (const chunk of incoming) chunks.push(chunk as Buffer)
    const body = Buffer.concat(chunks)
    const request = new Request(`http://${incoming.headers.host}${incoming.url}`, {
      method: incoming.method ?? 'GET',
      headers: incoming.headers as Record<string, string>,
      ...(body.length === 0 ? {} : { body }),
    })
    const response = await web.handler(request)
    const text = Buffer.from(await response.arrayBuffer())
    if (losing > 0 && body.toString().includes('ReserveStock')) {
      losing -= 1
      incoming.socket.destroy()
      return
    }
    outgoing.writeHead(response.status, Object.fromEntries(response.headers))
    outgoing.end(text)
  })
  await new Promise<void>(done => server.listen(0, '127.0.0.1', done))
  servers.push({ server, dispose: web.dispose })
  const address = server.address()
  if (address === null || typeof address === 'string') throw new Error('no port')
  return {
    url: `http://127.0.0.1:${address.port}`,
    control,
    lose: () => {
      losing += 1
    },
  }
}

type Hosted = Awaited<ReturnType<typeof serve>>

/** Runs a body against a server, over the adapter and the Api's HTTP client. */
const run = async <A, E>(
  body: (
    shop: Hosted,
  ) => Effect.Effect<A, E, RemoteClient | DomainReads | (typeof ShopApi.Client)['Identifier']>,
) => {
  const shop = await serve()
  const adapter = DomainRemote.layer(ShopApi, {
    views: [Reads],
    commands: [Reserving],
    principal: Effect.succeed(Option.some('ada')),
    denied: () => 'Unauthenticated',
    confirmWithin: '200 millis',
  }).pipe(
    Layer.provideMerge(ShopApi.layerClientHttp(shop.url)),
    Layer.provide(FetchHttpClient.layer),
  )
  return Effect.runPromise(
    body(shop).pipe(Effect.scoped, Effect.provide(adapter)) as Effect.Effect<A, E>,
  )
}

const reserve = (operation: string) =>
  Effect.flatMap(RemoteClient, client =>
    client.mutate({
      requestId: operation,
      operation,
      mutation: 'ReserveStock',
      input: { id: 'p1', quantity: 2, revision: 1 },
      principal: 'ada',
    }),
  )

const seeded = (shop: Hosted) =>
  Effect.gen(function* () {
    yield* (yield* ShopApi.Client).Seed('p1', { ownerId: 'ada', stock: 10 })
    yield* shop.control.drain
  })

describe('the adapter over HTTP', () => {
  it('lands a write and answers its reply', async () => {
    const seen = await run(shop =>
      Effect.gen(function* () {
        yield* seeded(shop)
        return yield* reserve('op1')
      }),
    )
    expect(seen.entities).toEqual([
      { entity: 'Product', id: 'p1', values: { reserved: 2, revision: 2 } },
    ])
  })

  it('reads Unreachable for a reply lost after the commit, and the retry reuses the receipt', async () => {
    const seen = await run(shop =>
      Effect.gen(function* () {
        yield* seeded(shop)
        shop.lose()
        const lost = yield* Effect.flip(reserve('op1'))
        const committedBefore = shop.control.commits.length
        const retried = yield* reserve('op1')
        return { lost, committedBefore, committedAfter: shop.control.commits.length, retried }
      }),
    )
    expect(seen.lost._tag).toBe('Unreachable')
    // The seed and the one reservation: the retry committed nothing.
    expect(seen.committedBefore).toBe(2)
    expect(seen.committedAfter).toBe(2)
    expect(seen.retried.entities[0]?.values).toEqual({ reserved: 2, revision: 2 })
  })
})
