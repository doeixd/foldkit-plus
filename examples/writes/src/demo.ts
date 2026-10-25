/**
 * Four declared writes, sent as a client would send them, over SQLite in
 * memory. Each line is what the server answered.
 */
import { DatabaseSync } from 'node:sqlite'
import { drizzle } from 'drizzle-orm/node-sqlite'
import { Effect, Option, Schema } from 'effect'
import { databaseLayer } from 'foldkit-remote-drizzle'
import { RemoteServer } from 'foldkit-remote-server'
import { Publish, Rename, Restock, Sell, type User } from './domain.js'
import { schema, server } from './server.js'

export const runDemo = async (): Promise<ReadonlyArray<string>> => {
  const sqlite = new DatabaseSync(':memory:')
  sqlite.exec(schema)
  sqlite.exec(`insert into products values
    ('p1', 'ada', 'Bolt', 'draft', 10, 1),
    ('p2', 'ada', 'Rivet', 'archived', 0, 1)`)
  const layer = databaseLayer(drizzle({ client: sqlite }))
  let requests = 0

  /**
   * One mutation as `principal` sent it, and what came back: the values
   * written, or the refusal decoded by the mutation's own `Refusal`, as a
   * client's `Data.refusal` reads it, or else the failure's tag.
   */
  const send = async <Input, Refused extends { readonly _tag: string }>(
    principal: Option.Option<User>,
    mutation: {
      readonly name: string
      readonly Input: Schema.Codec<Input, unknown>
      readonly Refusal: Schema.Codec<Refused, unknown>
    },
    input: Input,
    operation?: string,
  ) => {
    const outcome = await Effect.runPromise(
      RemoteServer.handlers(server, principal)
        .FoldkitRemoteMutate({
          requestId: `r${++requests}`,
          mutation: mutation.name,
          input: Schema.encodeSync(mutation.Input)(input),
          ...(operation === undefined ? {} : { operation }),
        })
        .pipe(Effect.result, Effect.provide(layer)),
    )
    if (outcome._tag === 'Success') {
      return `written ${JSON.stringify(outcome.success.entities[0]?.values)}`
    }
    const { failure } = outcome
    const refused =
      failure._tag === 'RemoteMutationError'
        ? Schema.decodeUnknownOption(mutation.Refusal)(failure.refusal)
        : Option.none()
    return Option.match(refused, { onNone: () => failure._tag, onSome: refusal => refusal._tag })
  }
  const ada = Option.some({ id: 'ada' })
  const grace = Option.some({ id: 'grace' })
  const restock = { id: 'p1', revision: 3, quantity: 5 }

  return [
    `rename by its owner: ${await send(ada, Rename, { id: 'p1', name: 'Bolt, M6' })}`,
    `rename by another: ${await send(grace, Rename, { id: 'p1', name: 'Taken' })}`,
    `publish the draft: ${await send(ada, Publish, { id: 'p1', status: 'published' })}`,
    `publish it again: ${await send(ada, Publish, { id: 'p1', status: 'published' })}`,
    `publish an archived product: ${await send(ada, Publish, { id: 'p2', status: 'published' })}`,
    `restock 5 at revision 3: ${await send(ada, Restock, restock)}`,
    `the same restock again, its answer lost: ${await send(ada, Restock, restock)}`,
    `sell 2, from the read at revision 4: ${await send(ada, Sell, { id: 'p1', quantity: -2 }, 'sale-1')}`,
    `sell 3, from the same read: ${await send(ada, Sell, { id: 'p1', quantity: -3 }, 'sale-2')}`,
    `the first sale again, its answer lost: ${await send(ada, Sell, { id: 'p1', quantity: -2 }, 'sale-1')}`,
    `row: ${JSON.stringify(sqlite.prepare("select name, status, stock, revision from products where id = 'p1'").get())}`,
  ]
}
