/**
 * The server's one endpoint, apart from how a request arrives: Node's HTTP
 * server (`http.ts`) and the published demo, which runs the server in the page
 * (`browser.ts`), both answer through it. **The chair stands in for
 * authentication.** It is the client saying who it is, which no real server
 * believes: a real one derives the principal from a session it verified.
 *
 * It is also what keeps time. The CMS owns no timer, so the host asks what is
 * due every few seconds; behind a load balancer it would be one cron trigger.
 */
import { Effect, Schema } from 'effect'
import { MutationRequest, QueryRequest, ReadBatch } from 'foldkit-remote'
import { RemoteServer } from 'foldkit-remote-server'
import type { DrizzleDatabase } from 'foldkit-remote-drizzle'
import type { openServer, Principal } from './server.js'
import type { Answer } from './transport.js'

type Backend = ReturnType<typeof openServer>

const principals: Readonly<Record<string, Principal>> = {
  wren: { name: 'wren', role: 'author' },
  edda: { name: 'edda', role: 'editor' },
}
/** A name the client chose: only the principals' own keys, never an Object member. */
const principalOf = (name: string | null): Principal =>
  name !== null && Object.hasOwn(principals, name) ? (principals[name] ?? null) : null

const Envelope = Schema.Struct({
  operation: Schema.Literals(['read', 'query', 'mutate']),
  payload: Schema.Unknown,
})

/**
 * Answers one request, the body as JSON sent it: decoded by the protocol's own
 * schema before a handler sees it. `ok` is false for a body that is not a
 * request (a 400 over HTTP) or a handler's failure (a 500).
 */
export const answer = (backend: Backend, chair: string, body: unknown): Promise<Answer> =>
  Effect.runPromise(
    Effect.gen(function* () {
      const { operation, payload } = yield* Schema.decodeUnknownEffect(Envelope)(body)
      const handlers = RemoteServer.handlers(backend.server, principalOf(chair))
      const as = <A>(schema: Schema.Codec<A, unknown>) =>
        Schema.decodeUnknownEffect(schema)(payload)
      const asked: Effect.Effect<unknown, { readonly message: string }, DrizzleDatabase> =
        operation === 'read'
          ? Effect.flatMap(as(ReadBatch), handlers.FoldkitRemoteRead)
          : operation === 'query'
            ? Effect.flatMap(as(QueryRequest), handlers.FoldkitRemoteQuery)
            : Effect.flatMap(as(MutationRequest), handlers.FoldkitRemoteMutate)
      return yield* asked.pipe(Effect.provide(backend.database))
    }).pipe(
      Effect.map((result): Answer => ({ ok: true, result })),
      Effect.catch(error => Effect.succeed<Answer>({ ok: false, error: error.message })),
    ),
  )

/** Publishes what is due, as whoever scheduled it; says what it did. */
export const publishDue = (backend: Backend): Promise<ReadonlyArray<string>> =>
  Effect.runPromise(
    backend.cms.due(new Date(), { as: principalOf }).pipe(Effect.provide(backend.database)),
  ).then(outcomes =>
    outcomes.map(({ entry, error }) =>
      error === null ? `published ${entry}, as scheduled` : `${entry}: ${error}`,
    ),
  )
