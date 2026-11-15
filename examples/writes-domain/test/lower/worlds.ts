/**
 * The two authorities over the same seeded rows, each asked as a client asks
 * it: SQLite through Remote's client over the server's handlers, Domain
 * through the Api's in-process client with the session header set. Each
 * answer is read back as one `Outcome`, so a test compares them whole.
 */
import { DatabaseSync } from 'node:sqlite'
import { drizzle } from 'drizzle-orm/node-sqlite'
import { Effect, Layer, Option, Ref, Schema, Stream } from 'effect'
import { schema } from 'foldkit-example-writes/server'
import { Remote, RemoteClient } from 'foldkit-remote'
import { databaseLayer } from 'foldkit-remote-drizzle'
import { DomainRemote } from 'foldkit-remote-domain'
import { RemoteServer } from 'foldkit-remote-server'
import { ReserveStock } from '../../src/domain.js'
import { host, ProductReads, ReserveBinding, ShopApi } from '../../src/model.js'
import { server } from '../../src/sqlite.js'

/** The rows both authorities start from: p1 published, p2 a draft, both ada's. */
export const rows = [
  {
    id: 'p1',
    ownerId: 'ada',
    name: 'Bolt',
    status: 'published',
    stock: 10,
    reserved: 2,
    revision: 1,
  },
  { id: 'p2', ownerId: 'ada', name: 'Rivet', status: 'draft', stock: 5, reserved: 0, revision: 1 },
] as const

/** One reservation, as who asks, under an operation a retry repeats. */
export interface Ask {
  readonly as: string
  readonly id: string
  readonly revision: number
  readonly quantity: number
  readonly operation: string
}

/** What an authority answered, in terms both share. */
export type Outcome =
  | { readonly _tag: 'Accepted'; readonly reserved: number; readonly revision: number }
  | { readonly _tag: 'Refused'; readonly refusal: string; readonly rule: Option.Option<string> }
  | { readonly _tag: 'Forbidden' }

const accepted = (written: Readonly<Record<string, unknown>>): Outcome => ({
  _tag: 'Accepted',
  reserved: Number(written['reserved']),
  revision: Number(written['revision']),
})

const refused = (refusal: string, rule: Option.Option<string> = Option.none()): Outcome => ({
  _tag: 'Refused',
  refusal,
  rule,
})

const forbidden: Outcome = { _tag: 'Forbidden' }

const decodeRefusal = Schema.decodeUnknownSync(ReserveStock.Refusal)

/** The SQLite server over a fresh database holding `rows`. */
export const sqlite = () => {
  const database = new DatabaseSync(':memory:')
  database.exec(schema)
  const insert = database.prepare(
    'insert into products (id, owner_id, name, status, stock, reserved, revision) values (?, ?, ?, ?, ?, ?, ?)',
  )
  for (const row of rows)
    insert.run(row.id, row.ownerId, row.name, row.status, row.stock, row.reserved, row.revision)
  const db = databaseLayer(drizzle({ client: database }))
  const ask = (ask: Ask): Promise<Outcome> =>
    Effect.runPromise(
      Effect.flatMap(RemoteClient, client =>
        client.mutate({
          requestId: ask.operation,
          operation: ask.operation,
          mutation: ReserveStock.name,
          input: { id: ask.id, revision: ask.revision, quantity: ask.quantity },
        }),
      ).pipe(
        Effect.map(({ entities }) => accepted(entities[0]!.values)),
        Effect.catchTags({
          RemoteMutationError: error =>
            error.refusal === undefined
              ? Effect.succeed(refused(error.message))
              : Effect.succeed(
                  Option.match(Option.liftThrowable(decodeRefusal)(error.refusal), {
                    onNone: (): Outcome => refused(error.message),
                    onSome: refusal =>
                      refused(refusal._tag, 'rule' in refusal ? refusal.rule : Option.none()),
                  }),
                ),
          Forbidden: () => Effect.succeed(forbidden),
        }),
        Effect.provide(
          Remote.clientLayer(RemoteServer.handlers(server, Option.some({ id: ask.as }))).pipe(
            Layer.provide(db),
          ),
        ),
      ),
    )
  /** The row as the table holds it. */
  const row = (id: string): unknown =>
    database
      .prepare(
        'select id, owner_id as ownerId, name, status, stock, reserved, revision from products where id = ?',
      )
      .get(id)
  return { ask, row }
}

type Client = Effect.Success<typeof ShopApi.clientInProcess>
type Hosted = Layer.Success<ReturnType<typeof host>['layer']>

/** Runs `body` against the Domain model in memory, `rows` listed first. */
export const domain = <A, E>(body: (client: Client) => Effect.Effect<A, E, Hosted>) => {
  const { layer, control } = host()
  return Effect.runPromise(
    Effect.gen(function* () {
      const client = yield* ShopApi.clientInProcess
      for (const row of rows) yield* client.ListProduct(row.id, { row: { ...row } })
      yield* control.drain
      return yield* body(client)
    }).pipe(Effect.scoped, Effect.provide(layer)),
  )
}

/** Sends a reservation to the Domain model as `ask.as`, under `commandId`. */
export const reserve = (client: Client, ask: Omit<Ask, 'operation'>, commandId?: string) =>
  client
    .ReserveStock(
      ask.id,
      { revision: ask.revision, quantity: ask.quantity },
      { headers: { 'x-user': ask.as }, ...(commandId === undefined ? {} : { commandId }) },
    )
    .pipe(
      Effect.map(({ reply }) => accepted(reply)),
      Effect.catchTags({
        Conflict: () => Effect.succeed(refused('Conflict')),
        Unmet: () => Effect.succeed(refused('Unmet')),
        Invalid: ({ rule }) => Effect.succeed(refused('Invalid', rule)),
        Reused: () => Effect.succeed(refused('Reused')),
        Forbidden: () => Effect.succeed(forbidden),
      }),
    )

/**
 * The Domain model behind the adapter (`DomainRemote.layer` over the bindings
 * `Lower.write` derived), signed in as whoever `as` holds: each call carries
 * that user's header, as a session cookie would. The View is held behind
 * every write, so a write answers with its reply's fields.
 */
export const adapted = <A, E>(
  body: (as: Ref.Ref<string>) => Effect.Effect<A, E, RemoteClient | Hosted>,
) => {
  const { layer, control } = host()
  const as = Ref.makeUnsafe('ada')
  const signedIn = <O extends { readonly headers?: unknown }>(options: O | undefined) =>
    Effect.map(Ref.get(as), id => ({ ...options, headers: { 'x-user': id } }))
  const clientLayer = Layer.effect(
    ShopApi.Client,
    Effect.map(ShopApi.clientInProcess, (client): Client => {
      const view = client.ProductRow
      return {
        ...client,
        ReserveStock: (target, input, options) =>
          Effect.flatMap(signedIn(options), options => client.ReserveStock(target, input, options)),
        ProductRow: {
          ...view,
          snapshot: (key, options) =>
            Effect.flatMap(signedIn(options), options => view.snapshot(key, options)),
          watch: (key, options) =>
            Stream.unwrap(Effect.map(signedIn(options), options => view.watch(key, options))),
        },
      }
    }),
  )
  const adapter = DomainRemote.layer(ShopApi, {
    views: [ProductReads],
    commands: [ReserveBinding],
    principal: Effect.map(Ref.get(as), Option.some),
    denied: () => 'Unauthenticated',
    confirmWithin: '50 millis',
  }).pipe(Layer.provideMerge(clientLayer), Layer.provideMerge(layer))
  return Effect.runPromise(
    Effect.gen(function* () {
      const client = yield* ShopApi.clientInProcess
      for (const row of rows) yield* client.ListProduct(row.id, { row: { ...row } })
      yield* control.drain
      return yield* body(as)
    }).pipe(Effect.scoped, Effect.provide(adapter)),
  )
}

/** Sends a reservation through the adapter, as Remote's client would. */
export const mutate = (ask: Ask) =>
  Effect.flatMap(RemoteClient, client =>
    client.mutate({
      requestId: ask.operation,
      operation: ask.operation,
      mutation: ReserveStock.name,
      input: { id: ask.id, revision: ask.revision, quantity: ask.quantity },
      principal: ask.as,
    }),
  ).pipe(
    Effect.map(({ entities }) => accepted(entities[0]!.values)),
    Effect.catchTags({
      RemoteMutationError: error =>
        Effect.succeed(
          error.refusal === undefined
            ? refused(error.message)
            : refused(decodeRefusal(error.refusal)._tag),
        ),
      Forbidden: () => Effect.succeed(forbidden),
    }),
  )
