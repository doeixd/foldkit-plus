/**
 * The shared Todo document both sides of an exchange test use: the contract,
 * an in-memory journal over it, replicas that write, the operations one would
 * send held back, and one exchange's reply decoded as the replica decodes
 * it. Lifetimes close through `closeScopes`, which each file calls from its
 * own `afterEach`.
 */
import { Effect, Exit, Scope } from 'effect'
import { ActorId, Journal, OpId } from 'foldkit-durable'
import {
  Sync,
  documentId,
  replicaId,
  sequence,
  type Operation,
  type TransportClient,
} from '../../src/index.js'
import { memoryStorage } from '../memoryStorage.js'
import { Message, Todos } from './todos-contract.js'

export { App, Message, Todos } from './todos-contract.js'

const scopes: Array<Scope.Closeable> = []

/** Makes a scope the fixture closes, for journals a test opens itself. */
export const openScope = (): Scope.Closeable => {
  const scope = Effect.runSync(Scope.make())
  scopes.push(scope)
  return scope
}

/** Closes every journal scope the fixture opened, for `afterEach`. */
export const closeScopes = (): void => {
  for (const scope of scopes.splice(0)) Effect.runSync(Scope.close(scope, Exit.void))
}

export const openJournal = () => {
  const scope = openScope()
  return Effect.runSync(
    Journal.make<Operation, typeof Todos extends Sync<Message, infer S> ? S : never, string>({
      ...Todos.journalContract(),
      file: ':memory:',
      opId: operation => OpId.make(operation.opId),
      actorId: principal => ActorId.make(principal),
      // The journal's own check, as a server makes one: no operation from the future.
      validate: ({ operation, cursor }) => {
        if (operation.baseCursor > cursor)
          throw new Error('Operation cursor is ahead of the server')
      },
    }).pipe(Effect.provideService(Scope.Scope, scope)),
  )
}

export const replica = (name: string) =>
  Effect.runPromise(Todos.openReplica(replicaId(name), memoryStorage()))

/** The operations a replica would send, held back. */
export const pendingOf = async (name: string, titles: ReadonlyArray<string>) => {
  const writer = await replica(name)
  for (const [index, title] of titles.entries()) {
    await Effect.runPromise(writer.submit(Message.CreatedTodo({ id: `${name}${index}`, title })))
  }
  let held: ReadonlyArray<Operation> = []
  await Effect.runPromise(
    writer.synchronize.pipe(
      Effect.provide(
        Sync.transport.fromPromise({
          exchange: async (_, pending) => {
            held = pending
            throw new Error('held')
          },
        }),
      ),
      Effect.ignore,
    ),
  )
  return held
}

/** One exchange's reply, decoded as the replica decodes it. */
export const send = async (
  exchange: TransportClient,
  cursor: number,
  pending: ReadonlyArray<Operation>,
) => {
  const reply = Todos.codec.decodeExchange(await exchange.exchange(sequence(cursor), pending))
  return {
    ...reply,
    committed: reply.operations.map(
      operation => Todos.codec.committedFrom(operation, documentId('todos')).opId,
    ),
  }
}
