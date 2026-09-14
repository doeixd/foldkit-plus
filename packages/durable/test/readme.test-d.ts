/**
 * The examples from this package's README, type-checked so the documentation
 * cannot drift from the API. `provider` stands in for the application's own
 * external service, and the orders journal for one the application owns.
 */
import { Effect, Option, Schema } from 'effect'
import {
  ActorId,
  Cursor,
  DocumentId,
  InvalidOperationError,
  Journal,
  JournalService,
  OpId,
  makeJournal,
  makeJournalLayer,
  actorId,
  cursor,
  documentId,
  opId,
  type JournalOptions,
} from '../src/index.js'

const Operation = Schema.Struct({ opId: Schema.String, title: Schema.String })
const Snapshot = Schema.Struct({ todos: Schema.Array(Schema.String) })
type Operation = typeof Operation.Type
type Snapshot = typeof Snapshot.Type
type Principal = { readonly actorId: string }

const program = Effect.gen(function* () {
  // The schemas decide the types: `append` takes `Operation`'s encoded side.
  const journal = yield* Journal.make({
    file: 'journal.sqlite',
    operation: Operation,
    snapshot: Snapshot,
    empty: () => ({ todos: [] }),
    reduce: (snapshot, operation) => ({ todos: [...snapshot.todos, operation.title] }),
    opId: operation => OpId.make(operation.opId),
    actorId: (principal: Principal) => ActorId.make(principal.actorId),
  })

  const todos = DocumentId.make('todos')
  yield* journal.append(todos, { opId: 'tab-1:1', title: 'Milk' }, { actorId: 'alice' })
  const { snapshot } = yield* journal.load(todos)
  const since = yield* journal.read(todos, Cursor.make(0))
  return { snapshot, since }
}).pipe(Effect.scoped)

await Effect.runPromise(program)

// The journal as a service.
const TodoJournal = Journal.define<Operation, Snapshot, Principal>('app/TodoJournal')

declare const options: JournalOptions<Operation, Snapshot, Principal>

const served = Effect.gen(function* () {
  const journal = yield* TodoJournal.tag
  return yield* journal.load(DocumentId.make('todos'))
}).pipe(Effect.provide(TodoJournal.layer(options)))

void served

// Validation and policy.
const hooks: Pick<JournalOptions<Operation, Snapshot, Principal>, 'validate' | 'authorize'> = {
  // Throw, or return an Effect that fails with InvalidOperationError.
  validate: ({ operation }) =>
    operation.title.length === 0
      ? Effect.fail(new InvalidOperationError({ message: 'title is empty' }))
      : Effect.void,
  // `true`/`false`, a refusal carrying its reason, or an Effect of either.
  authorize: ({ principal, operation }) =>
    principal.actorId === operation.opId.split(':')[0] || {
      allowed: false,
      reason: 'an operation must be committed by the tab that created it',
    },
}

void hooks

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
    key: DocumentId.make('orders'),
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

// The older spellings still work.
const legacy = Effect.gen(function* () {
  const journal = yield* makeJournal<Operation, Snapshot, Principal>({
    file: 'journal.sqlite',
    // A codec given as a function pair, as before.
    operation: { encode: operation => operation, decode: Schema.decodeUnknownSync(Operation) },
    snapshot: { encode: snapshot => snapshot, decode: Schema.decodeUnknownSync(Snapshot) },
    empty: () => ({ todos: [] }),
    reduce: (snapshot, operation) => ({ todos: [...snapshot.todos, operation.title] }),
    opId: operation => opId(operation.opId),
    actorId: principal => actorId(principal.actorId),
  })
  return yield* journal.read(documentId('todos'), cursor(0))
}).pipe(Effect.scoped)

const legacyServed = Effect.gen(function* () {
  const journal = yield* JournalService<Operation, Snapshot, Principal>()
  return yield* journal.load(documentId('todos'))
}).pipe(Effect.provide(makeJournalLayer(options)))

void legacy
void legacyServed
