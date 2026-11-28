/**
 * Two replicas of a document whose one field is a last-writer-wins register
 * (`lww.ts`), each setting it at the same logical time, walked in every order
 * against a server that commits what it hears. No application's document uses
 * the register, so this fixture is where its tie-break is checked: after
 * either replica reaches the server first, both hold the write the stamps
 * give (the greater counter, and at one counter the greater replica id), never
 * the one that happened to arrive last.
 */
import { Effect, Option, Schema } from 'effect'
import * as Temporal from '@doeixd/metakit/temporal'
import {
  defineSync,
  documentId,
  layerFromPromise,
  lwwRegister,
  replicaId,
  sequence,
  type CommittedOperation,
  type Replica,
  type Storage,
} from '../src/index.js'

const Title = lwwRegister(Schema.String)
const Message = Schema.Struct({ _tag: Schema.Literal('Titled'), write: Title.schema })
type Message = typeof Message.Type
const Shared = Schema.Struct({ title: Title.schema })
type Shared = typeof Shared.Type

const empty: Shared = {
  title: { stamp: { counter: 0, replicaId: replicaId('initial') }, value: '' },
}

const Sync = defineSync({
  documentId: documentId('titles'),
  message: Message,
  shared: Shared,
  empty,
  durable: () => true,
  replay: (shared, message) => ({ title: Title.merge(shared.title, message.write) }),
})

export const titled = (counter: number, replica: string, value: string): Message => ({
  _tag: 'Titled',
  write: { stamp: { counter, replicaId: replicaId(replica) }, value },
})

const memoryStorage = (): Storage => {
  let state: unknown
  return {
    store: { name: 'test replica', isolation: 'eventual', parentRowLock: false },
    load: () => Effect.sync(() => state),
    save: next =>
      Effect.sync(() => {
        state = structuredClone(next)
      }),
    close: Effect.void,
  }
}

/** A server that commits each operation once, by its id, in the order it hears them. */
const serverOf = () => {
  const log = new Array<CommittedOperation>()
  const heard = new Set<string>()
  return {
    log,
    exchange: (cursor: number, entries: ReadonlyArray<unknown>) => {
      const acknowledged: Array<string> = []
      for (const entry of entries) {
        const operation = Sync.codec.operationFrom(entry, Sync.documentId)
        if (heard.has(operation.opId)) continue
        heard.add(operation.opId)
        acknowledged.push(operation.opId)
        log.push({ ...operation, serverSequence: sequence(log.length + 1), actorId: 'owner' })
      }
      return { operations: log.slice(cursor), rejected: [], acknowledged, more: false }
    },
  }
}

type Id = 'A' | 'B'
interface World {
  readonly server: ReturnType<typeof serverOf>
  readonly replicas: Readonly<Record<Id, Replica<Message, Shared>>>
}

const openWorld = async (): Promise<World> => {
  const open = (id: Id) =>
    Effect.runPromise(Sync.openReplica(memoryStorage(), { replicaId: replicaId(id) }))
  return { server: serverOf(), replicas: { A: await open('A'), B: await open('B') } }
}

const closeWorld = async (world: World): Promise<void> => {
  for (const replica of Object.values(world.replicas)) await Effect.runPromise(replica.close)
}

const synchronize = (world: World, id: Id): Promise<void> =>
  Effect.runPromise(
    Effect.provide(
      world.replicas[id].synchronize,
      layerFromPromise({
        exchange: async (cursor, entries) => world.server.exchange(cursor, entries),
      }),
    ),
  )

const titleOf = (replica: Replica<Message, Shared>): Shared['title'] =>
  Effect.runSync(replica.shared).title

/** What the stamps give of two writes, whichever came first. */
const winner = (a: Message, b: Message): Shared['title'] => Title.merge(a.write, b.write)

/** The write each order of the exchanges leaves, for two writes at one logical time. */
export const tieBreak = async (
  writes: readonly [Message, Message] = [titled(1, 'A', 'from A'), titled(1, 'B', 'from B')],
  options?: Temporal.WalkOptions,
): Promise<Temporal.WalkResult> => {
  const expected = winner(...writes)
  return Temporal.walkAsync<World, string>(
    {
      initial: openWorld,
      steps: [
        {
          name: 'A sets the title',
          run: world => Effect.runPromise(world.replicas.A.submit(writes[0])),
        },
        {
          name: 'B sets the title',
          run: world => Effect.runPromise(world.replicas.B.submit(writes[1])),
        },
        { name: 'A exchanges', run: world => synchronize(world, 'A') },
        { name: 'B exchanges', run: world => synchronize(world, 'B') },
        {
          name: 'every replica exchanges until it has heard everything',
          after: ['A sets the title', 'B sets the title', 'A exchanges', 'B exchanges'],
          run: async world => {
            for (const id of ['A', 'B', 'A'] as const) await synchronize(world, id)
          },
        },
      ],
      holds: async (world, ran) => {
        if (!ran.includes('every replica exchanges until it has heard everything'))
          return Option.none()
        for (const [id, replica] of Object.entries(world.replicas)) {
          const held = titleOf(replica)
          if (JSON.stringify(held) !== JSON.stringify(expected))
            return Option.some(
              `${id} holds "${held.value}" (stamp ${held.stamp.counter}, ${held.stamp.replicaId}); the stamps give "${expected.value}", and the server committed ${world.server.log.map(operation => String(operation.replicaId)).join(' then ')}`,
            )
        }
        return Option.none()
      },
      finish: closeWorld,
    },
    options,
  )
}
