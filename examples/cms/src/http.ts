/**
 * The server behind one HTTP endpoint: the same `RemoteServer` handlers the
 * scripted run calls. **The `x-chair` header stands in for authentication.** It
 * is the client saying who it is, which no real server believes: a real one
 * derives the principal from a session it verified.
 *
 * It is also the host that keeps time. The CMS owns no timer, so this asks what
 * is due every few seconds; behind a load balancer it would be one cron trigger.
 */
import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { Effect, Schema } from 'effect'
import { MutationRequest, QueryRequest, ReadBatch } from 'foldkit-remote'
import { RemoteServer } from 'foldkit-remote-server'
import type { DrizzleDatabase } from 'foldkit-remote-drizzle'
import { openServer, type Principal } from './server.js'
import type { Operation } from './transport.js'

const principals: Readonly<Record<string, Principal>> = {
  wren: { name: 'wren', role: 'author' },
  edda: { name: 'edda', role: 'editor' },
}

export const startHttpServer = async (
  port: number,
): Promise<{ readonly url: string; readonly close: () => Promise<void> }> => {
  const backend = openServer(() => new Date(), { seeded: true })
  // The payload is JSON from the wire: decoded by the protocol's own schema before a handler sees it.
  const run = (
    principal: Principal | null,
    operation: Operation,
    payload: unknown,
  ): Effect.Effect<unknown, { readonly message: string }> => {
    const handlers = RemoteServer.handlers(backend.server, principal)
    const as = <A>(schema: Schema.Codec<A, unknown>) => Schema.decodeUnknownEffect(schema)(payload)
    const asked: Effect.Effect<unknown, { readonly message: string }, DrizzleDatabase> =
      operation === 'read'
        ? Effect.flatMap(as(ReadBatch), handlers.FoldkitRemoteRead)
        : operation === 'query'
          ? Effect.flatMap(as(QueryRequest), handlers.FoldkitRemoteQuery)
          : Effect.flatMap(as(MutationRequest), handlers.FoldkitRemoteMutate)
    return asked.pipe(Effect.provide(backend.database))
  }
  const Envelope = Schema.Struct({
    operation: Schema.Literals(['read', 'query', 'mutate']),
    payload: Schema.Unknown,
  })

  const clock = setInterval(() => {
    void Effect.runPromise(
      backend.cms
        .due(new Date(), { as: name => principals[name ?? ''] ?? null })
        .pipe(Effect.provide(backend.database)),
    ).then(outcomes => {
      for (const { entry, error } of outcomes)
        console.log(error === null ? `published ${entry}, as scheduled` : `${entry}: ${error}`)
    })
  }, 5000)

  const server: Server = createServer((request, response) => {
    const reply = (status: number, body: unknown) => {
      response.writeHead(status, { 'content-type': 'application/json' })
      response.end(JSON.stringify(body))
    }
    if (request.method !== 'POST' || request.url !== '/remote')
      return reply(404, { error: 'not found' })
    // A name the client chose: only the principals' own keys, never an Object member.
    const chair = String(request.headers['x-chair'])
    const principal = Object.hasOwn(principals, chair) ? (principals[chair] ?? null) : null
    const chunks: Buffer[] = []
    request.on('data', chunk => chunks.push(chunk as Buffer))
    request.on('end', () => {
      void (async () => {
        try {
          const { operation, payload } = Schema.decodeUnknownSync(Envelope)(
            JSON.parse(Buffer.concat(chunks).toString('utf8')),
          )
          const result = await Effect.runPromise(
            run(principal, operation, payload).pipe(
              Effect.map(value => ({ status: 200, body: { result: value } })),
              Effect.catch(error =>
                Effect.succeed({ status: 500, body: { error: error.message } }),
              ),
            ),
          )
          reply(result.status, result.body)
        } catch (error) {
          reply(400, { error: error instanceof Error ? error.message : String(error) })
        }
      })()
    })
  })

  await new Promise<void>(resolve => server.listen(port, '127.0.0.1', resolve))
  const { port: bound } = server.address() as AddressInfo
  return {
    url: `http://127.0.0.1:${bound}/remote`,
    close: () =>
      new Promise<void>(resolve => {
        clearInterval(clock)
        server.close(() => resolve())
      }),
  }
}
