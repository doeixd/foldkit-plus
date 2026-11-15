/**
 * The walk of `Sell` and `Restock` through the example's server over SQLite:
 * from each start, seeded random sequences of sales and restocks, each sent as
 * a client would send it. `sell.walk.test.ts` runs it, and `laws.test.ts`
 * passes its records to the Module graph.
 */
import { DatabaseSync } from 'node:sqlite'
import { drizzle } from 'drizzle-orm/node-sqlite'
import { Effect, Match, Option, Schema } from 'effect'
import { Laws } from 'foldkit-entity'
import { databaseLayer } from 'foldkit-remote-drizzle'
import { Walk } from 'foldkit-remote/testing'
import { RemoteServer } from 'foldkit-remote-server'
import { schema, server } from '../src/server.js'
import { reservedWithinStock } from '../src/domain.js'

/** The row's numbers, and how the last write was answered. */
interface Stock {
  readonly stock: number
  readonly reserved: number
  readonly revision: number
  readonly answer: string
}

export const SellMessage = Schema.TaggedStruct('Sell', { quantity: Schema.Int })
export const RestockMessage = Schema.TaggedStruct('Restock', {
  revision: Schema.Int,
  quantity: Schema.Int,
})
type Message = typeof SellMessage.Type | typeof RestockMessage.Type

const sqlite = new DatabaseSync(':memory:')
sqlite.exec(schema)
const layer = databaseLayer(drizzle({ client: sqlite }))
const handlers = RemoteServer.handlers(server, Option.some({ id: 'ada' }))
const put = sqlite.prepare(
  "insert or replace into products values ('p1', 'ada', 'Bolt', 'published', ?, ?, ?)",
)
const read = sqlite.prepare("select stock, reserved, revision from products where id = 'p1'")

let requests = 0

/** Puts the row as the walk has it, sends the message, and reads what the table holds. */
export const step = async (model: Stock, message: Message): Promise<Stock> => {
  put.run(model.stock, model.reserved, model.revision)
  requests += 1
  const [mutation, input] = Match.value(message).pipe(
    Match.tagsExhaustive({
      Sell: ({ quantity }) => ['Sell', { id: 'p1', quantity }] as const,
      Restock: ({ revision, quantity }) => ['Restock', { id: 'p1', revision, quantity }] as const,
    }),
  )
  const outcome = await Effect.runPromise(
    handlers
      .FoldkitRemoteMutate({
        requestId: `r${requests}`,
        mutation,
        input,
        // A sale is told from a retry by its operation: each one here is its own.
        ...(mutation === 'Sell' ? { operation: `sale-${requests}` } : {}),
      })
      .pipe(Effect.result, Effect.provide(layer)),
  )
  const row = read.get() as { stock: number; reserved: number; revision: number }
  const answer = Match.value(outcome).pipe(
    Match.tag('Success', () => 'written'),
    Match.tag('Failure', ({ failure }) =>
      JSON.stringify((failure as { refusal?: unknown }).refusal ?? failure),
    ),
    Match.exhaustive,
  )
  return { ...row, answer }
}

const refusals = new Set([
  '{"_tag":"Invalid","entity":"Product","rule":"becomes:InStock"',
  '{"_tag":"Invalid","entity":"Product","rule":"reservedWithinStock"',
  '{"_tag":"Conflict"',
])
const legitimate = (answer: string) =>
  answer === 'written' || [...refusals].some(prefix => answer.startsWith(prefix))

export const law = Laws.law(reservedWithinStock)

/** The Entity's one law the walk judges, named as `Laws.law` and the graph name it. */
export const broken = (_before: Stock, _message: Message, after: Stock) =>
  after.reserved > after.stock
    ? [{ law, message: `${after.reserved} reserved of ${after.stock}` }]
    : []

/**
 * What the writer must answer, judged by a walk of its own: these are checks
 * of the writer and of Sell's own postcondition, not laws of the Entity, so
 * their walk's records are not evidence for anything the graph holds.
 */
export const checks = (before: Stock, message: Message, after: Stock) => [
  ...(!legitimate(after.answer) ? [{ law: 'refusal', message: `answered ${after.answer}` }] : []),
  ...(after.answer !== 'written' &&
  (after.stock !== before.stock || after.revision !== before.revision)
    ? [{ law: 'a refusal writes nothing', message: `${before.stock} became ${after.stock}` }]
    : []),
  ...(message._tag === 'Sell' && after.answer === 'written' && after.stock <= after.reserved
    ? [{ law: 'becomes:InStock', message: `${after.stock} in stock, ${after.reserved} reserved` }]
    : []),
]

export const start = (name: string, stock: number, reserved: number) => ({
  name,
  start: (): Stock => ({ stock, reserved, revision: 1, answer: 'written' }),
})

const { list } = Walk.cases<Stock, Message>()({
  Sell: {
    'takes one': () => SellMessage.make({ quantity: -1 }),
    'takes what leaves the reserved': model =>
      SellMessage.make({ quantity: model.reserved - model.stock }),
    'takes more than there is': model => SellMessage.make({ quantity: -model.stock - 1 }),
    'takes none': () => SellMessage.make({ quantity: 0 }),
    adds: () => SellMessage.make({ quantity: 3 }),
  },
  Restock: {
    'adds five at the revision it read': model =>
      RestockMessage.make({ revision: model.revision, quantity: 5 }),
    'adds at a stale revision': model =>
      RestockMessage.make({ revision: model.revision - 1, quantity: 5 }),
    'removes more than is unreserved': model =>
      RestockMessage.make({
        revision: model.revision,
        quantity: model.reserved - model.stock - 1,
      }),
    'removes down to the reserved': model =>
      RestockMessage.make({ revision: model.revision, quantity: model.reserved - model.stock }),
  },
})

export const walk = {
  cases: list,
  from: [start('stocked', 10, 2), start('all reserved', 3, 3), start('empty', 0, 0)],
  step,
  transition: (tag: string) => `write:${tag}`,
  seeds: 12,
  steps: 15,
}
