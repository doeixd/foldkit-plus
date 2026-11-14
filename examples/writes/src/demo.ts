/**
 * Five declared writes, sent as a client would send them, over SQLite in
 * memory. Each line is what the server answered.
 */
import { DatabaseSync } from 'node:sqlite'
import { drizzle } from 'drizzle-orm/node-sqlite'
import { Effect, Match, Option, Optic, Schema } from 'effect'
import { Write } from 'foldkit-entity'
import { databaseLayer } from 'foldkit-remote-drizzle'
import { Can, Refusal, Remote } from 'foldkit-remote'
import { ModelRef } from 'foldkit-surface'
import { RemoteServer } from 'foldkit-remote-server'
import {
  Product,
  Publish,
  publishedStaysPublished,
  Rename,
  reservedWithinStock,
  Restock,
  Revert,
  Sell,
  type User,
} from './domain.js'
import { schema, server } from './server.js'

// What a refusal may name: the Entity's invariants, and the sale's own `becomes`.
const invariants = [reservedWithinStock, publishedStaysPublished, Write.ensured(Sell.write)]

/** What a client holds of the products, to ask `Data.can` before sending anything. */
const ClientModel = Schema.Struct({ remote: Remote.Model })
const Data = Remote.make({
  model: ModelRef.fromOptic(Remote.Model, Optic.id<typeof ClientModel.Type>().key('remote'), [
    'remote',
  ]),
  entities: [Product],
  mutations: [Publish, Revert],
})
const held = Data.reduce(
  { remote: Remote.initial },
  {
    _tag: 'ReadReceived',
    requests: ['p1', 'p2', 'p3'].map(id => ({
      entity: 'Product',
      id,
      fields: [...Object.keys(Product.fields)],
    })),
    result: {
      settled: [],
      entities: [
        ['p1', 'draft'],
        ['p2', 'archived'],
        ['p3', 'published'],
      ].map(([id, status]) => ({
        entity: 'Product',
        id: id!,
        values: { id, ownerId: 'ada', name: id, status, stock: 10, reserved: 2, revision: 1 },
      })),
    },
    now: 0,
  },
)

/** What `Data.can` says, as a line: the answer, and the invariant or rule behind a refusal. */
const said = (answer: Can): string =>
  Can.match(answer, {
    Yes: () => 'Yes',
    No: ({ refusal }) =>
      Match.value(refusal).pipe(
        Match.tagsExhaustive({
          Forbidden: () => 'No(Forbidden)',
          Unmet: () => 'No(Unmet)',
          Invalid: ({ rule }) => `No(Invalid ${rule})`,
        }),
      ),
    Undecided: ({ reasons }) => `Undecided(${reasons.join('; ')})`,
  })

export const runDemo = async (): Promise<ReadonlyArray<string>> => {
  const sqlite = new DatabaseSync(':memory:')
  sqlite.exec(schema)
  sqlite.exec(`insert into products values
    ('p1', 'ada', 'Bolt', 'draft', 10, 2, 1),
    ('p2', 'ada', 'Rivet', 'archived', 0, 0, 1)`)
  const layer = databaseLayer(drizzle({ client: sqlite }))
  let requests = 0

  /**
   * One mutation as `principal` sent it, and what came back: the values
   * written, or the refusal decoded by the mutation's own `Refusal`, as a
   * client's `Data.refusal` reads it (with the invariant it names, matched by
   * its declaration), or else the failure's tag.
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
    const refused = Match.value(failure).pipe(
      Match.tag('RemoteMutationError', ({ refusal }) =>
        Schema.decodeUnknownOption(mutation.Refusal)(refusal),
      ),
      Match.orElse(() => Option.none()),
    )
    return Option.match(refused, {
      onNone: () => failure._tag,
      onSome: refusal =>
        [
          refusal._tag,
          ...invariants.filter(held => Refusal.isInvalidBy(refusal, held)).map(held => held.id),
        ].join(' '),
    })
  }
  const ada = Option.some({ id: 'ada' })
  const grace = Option.some({ id: 'grace' })
  const restock = { id: 'p1', revision: 3, quantity: 5 }

  return [
    `can publish the draft: ${said(Data.can(held, Publish, { id: 'p1', status: 'published' }))}`,
    `can publish a published product: ${said(Data.can(held, Publish, { id: 'p3', status: 'published' }))}`,
    `can publish an archived product: ${said(Data.can(held, Publish, { id: 'p2', status: 'published' }))}`,
    `can put the published product back to draft: ${said(Data.can(held, Revert, { id: 'p3', status: 'draft' }))}`,
    `rename by its owner: ${await send(ada, Rename, { id: 'p1', name: 'Bolt, M6' })}`,
    `rename by another: ${await send(grace, Rename, { id: 'p1', name: 'Taken' })}`,
    `publish the draft: ${await send(ada, Publish, { id: 'p1', status: 'published' })}`,
    `publish it again: ${await send(ada, Publish, { id: 'p1', status: 'published' })}`,
    `publish an archived product: ${await send(ada, Publish, { id: 'p2', status: 'published' })}`,
    `put the published product back to draft: ${await send(ada, Revert, { id: 'p1', status: 'draft' })}`,
    `restock 5 at revision 3: ${await send(ada, Restock, restock)}`,
    `the same restock again, its answer lost: ${await send(ada, Restock, restock)}`,
    `sell 2, from the read at revision 4: ${await send(ada, Sell, { id: 'p1', quantity: -2 }, 'sale-1')}`,
    `sell 3, from the same read: ${await send(ada, Sell, { id: 'p1', quantity: -3 }, 'sale-2')}`,
    `the first sale again, its answer lost: ${await send(ada, Sell, { id: 'p1', quantity: -2 }, 'sale-1')}`,
    `sell 9 of the 10, 2 of them reserved: ${await send(ada, Sell, { id: 'p1', quantity: -9 }, 'sale-3')}`,
    `sell 8 of the 10, leaving only the 2 reserved: ${await send(ada, Sell, { id: 'p1', quantity: -8 }, 'sale-4')}`,
    `row: ${JSON.stringify(sqlite.prepare("select name, status, stock, reserved, revision from products where id = 'p1'").get())}`,
  ]
}
