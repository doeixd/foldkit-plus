/**
 * The examples from this package's README, type-checked so the documentation
 * cannot drift from the API. `provider` stands in for the application's own
 * external service, and the orders journal for one the application owns.
 */
import { Effect, Option, Schema } from 'effect'
import {
  JournalService,
  actorId,
  cursor,
  documentId,
  makeJournal,
  makeJournalLayer,
  opId,
  type Cursor,
  type Journal,
  type JournalOptions,
} from '../src/index.js'

const Operation = Schema.Struct({ opId: Schema.String, title: Schema.String })
const Snapshot = Schema.Struct({ todos: Schema.Array(Schema.String) })
type Operation = typeof Operation.Type
type Snapshot = typeof Snapshot.Type
type Principal = { readonly actorId: string }

const decodeOperation = Schema.decodeUnknownSync(Operation)
const decodeSnapshot = Schema.decodeUnknownSync(Snapshot)

const program = Effect.gen(function* () {
  const journal = yield* makeJournal<Operation, Snapshot, Principal>({
    file: 'journal.sqlite',
    // Operations are stored exactly as they arrive, so `encode` is the identity.
    operation: { encode: operation => operation, decode: decodeOperation },
    snapshot: { encode: snapshot => snapshot, decode: decodeSnapshot },
    empty: () => ({ todos: [] }),
    reduce: (snapshot, operation) => ({ todos: [...snapshot.todos, operation.title] }),
    opId: operation => opId(operation.opId),
    actorId: principal => actorId(principal.actorId),
  })

  const todos = documentId('todos')
  yield* journal.append(todos, { opId: 'tab-1:1', title: 'Milk' }, { actorId: 'alice' })
  const { snapshot } = yield* journal.load(todos)
  const since = yield* journal.read(todos, cursor(0))
  return { snapshot, since }
}).pipe(Effect.scoped)

await Effect.runPromise(program)

// The journal as a service.
declare const options: JournalOptions<Operation, Snapshot, Principal>
const JournalLayer = makeJournalLayer(options)

const served = Effect.gen(function* () {
  const journal = yield* JournalService<Operation, Snapshot, Principal>()
  return yield* journal.load(documentId('todos'))
}).pipe(Effect.provide(JournalLayer))

void served

// Effect recovery: the identity is chosen before the action runs.
type Order = { readonly opId: string; readonly id: string }
type OrderSnapshot = { readonly confirmed: ReadonlyArray<string> }
type Orders = Journal<Order, OrderSnapshot, Principal>
declare const provider: {
  sendConfirmation: (input: { orderId: string; idempotencyKey?: string }) => Promise<void>
}

const confirmationKey = (order: Order) =>
  JSON.stringify(['orders', order.opId, 'send-confirmation:v1'])

const sendConfirmation = (journal: Orders, order: Order) => {
  const key = confirmationKey(order)
  return journal.runEffect(
    key,
    Effect.tryPromise(() => provider.sendConfirmation({ orderId: order.id, idempotencyKey: key })),
  )
}

void sendConfirmation

const settle = (journal: Orders, from: Cursor) =>
  journal.recover({
    key: documentId('orders'),
    from,
    intents: order => [
      {
        key: confirmationKey(order),
        run: Effect.tryPromise(() =>
          provider.sendConfirmation({
            orderId: order.id,
            idempotencyKey: confirmationKey(order),
          }),
        ),
      },
    ],
    // The default is `retry`. `skip` stops the loop and leaves the returned
    // cursor at the previous operation, for manual resolution.
    onUnresolved: (_intent, record) =>
      Option.isSome(record) && record.value.status === 'failed' ? 'skip' : 'retry',
  })

void settle
