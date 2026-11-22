/**
 * Two replicas of the todo list's durable subset against the real journal
 * (`openJournal(':memory:')`, the contract's own reducer and `authorize`
 * rules), walked with `Temporal.walkAsync`. `sync.obligations.ts` declares
 * what `foldkit-sync/metakit`'s `convergence` owes and runs these;
 * `sync.convergence.test.ts` holds them to it.
 *
 * The oracle is the contract's reducer folded over the journal's log, never a
 * replica's state run a second way. A pair is walked from a base list both
 * replicas hold, each replica submitting one Message before it hears the
 * other's and the exchanges in any order. The two Messages name todos in each
 * of the `meetings` below, so they meet in one todo, in two, or in none; each
 * meeting is also run with each replica reaching the journal first, and the
 * two documents compared.
 */
import { Effect, Option } from 'effect'
import { layerFromPromise, type Exchange } from 'foldkit-sync'
import type { PairWalk } from 'foldkit-sync/metakit'
import * as Temporal from 'metakit/temporal'
import { Message } from '../src/app.js'
import { openJournal, type ServerJournal } from '../src/journal.js'
import type { SyncPrincipal } from '../src/principal.js'
import { footprints, TodoSync, type DurableMessage } from '../src/sync.js'
import { todoMachine } from '../src/surface.js'
import { closeStorages, openReplica, type TodoReplica } from './helpers.js'

const principal: SyncPrincipal = { actorId: 'owner', documentId: 'todos', canWrite: true }
const contract = TodoSync.journalContract()

type MachineTag = keyof (typeof todoMachine)['transitions'] & string
const isMachineTag = (tag: string): tag is MachineTag => Object.hasOwn(todoMachine.transitions, tag)

/** The durable Messages the contract declares transitions for, read from the contract itself. */
export const durableTags: ReadonlyArray<MachineTag> = Object.keys(footprints ?? {}).filter(
  isMachineTag,
)

// -- Messages -----------------------------------------------------------------

/**
 * The todos two Messages may name, one each: the base list's `a` (open) and
 * `b` (done), and two it does not hold, so a pair meets in one todo, in two
 * that exist, in a new one and an old one, and in two new ones.
 */
type Todo = 'a' | 'b' | 'n1' | 'n2'
export const meetings: ReadonlyArray<readonly [Todo, Todo]> = [
  ['a', 'a'],
  ['a', 'b'],
  ['b', 'a'],
  ['b', 'b'],
  ['n1', 'n1'],
  ['n1', 'n2'],
  ['a', 'n1'],
  ['n1', 'a'],
  ['b', 'n1'],
  ['n1', 'b'],
]

/** A Message of `tag` about todo `id`; `variant` picks the rest of its fields. */
const messageOf = (tag: string, id: Todo, variant: number): DurableMessage => {
  const of = <A>(choices: ReadonlyArray<A>): A => choices[variant % choices.length]!
  switch (tag) {
    case 'SubmittedTodo':
      return Message.SubmittedTodo({ id, title: of(['x', 'y']), createdAt: 9 })
    case 'RestoredTodo':
      return Message.RestoredTodo({
        todo: {
          id,
          title: of(['x', 'y']),
          completed: of([true, false]),
          priority: 'normal',
          createdAt: 9,
        },
      })
    case 'ToggledTodo':
      return Message.ToggledTodo({ id })
    case 'RenamedTodo':
      return Message.RenamedTodo({ id, title: of(['r1', 'r2']) })
    case 'PrioritySet':
      return Message.PrioritySet({ id, priority: of(['low', 'high']) })
    case 'DeletedTodo':
      return Message.DeletedTodo({ id })
    case 'ClearedCompleted':
      return Message.ClearedCompleted()
    case 'RenamedList':
      return Message.RenamedList({ title: of(['L1', 'L2']) })
    default:
      throw new Error(`sync.convergence.ts: no Message is drawn for durable "${tag}"`)
  }
}

// -- The world: one journal, replicas of one list ------------------------------

type Id = 'A' | 'B'

interface World {
  readonly journal: ServerJournal
  readonly replicas: Readonly<Record<Id, TodoReplica>>
  /** What the server last answered each replica, for a delivery the network repeats. */
  readonly answered: Map<Id, Exchange<unknown>>
}

const baseList = (journal: ServerJournal): void => {
  const append = (message: DurableMessage) => journal.appendAsServer(message, principal, 'server')
  append(Message.SubmittedTodo({ id: 'a', title: 'a', createdAt: 1 }))
  append(Message.SubmittedTodo({ id: 'b', title: 'b', createdAt: 2 }))
  append(Message.SubmittedTodo({ id: 'c', title: 'c', createdAt: 3 }))
  append(Message.ToggledTodo({ id: 'b' }))
  append(Message.RenamedList({ title: 'Base' }))
}

const logOf = (world: World) => world.journal.read(principal.documentId, 0)

/** What the journal's operations leave, by the contract's own reducer. */
const foldLog = (world: World, upTo?: number) =>
  logOf(world)
    .slice(0, upTo)
    .reduce((shared, operation) => contract.reduce(shared, operation), contract.empty())

const exchangeOf = (world: World, id: Id, repeat: boolean) =>
  layerFromPromise({
    exchange: async (cursor, pending, epoch) => {
      const earlier = world.answered.get(id)
      if (repeat && earlier !== undefined) {
        // The same committed operations a second time, with nothing to acknowledge or reject.
        return { ...earlier, acknowledged: [], rejected: [], refusals: [], reasons: [] }
      }
      const answer = await world.journal.transport(principal).exchange(cursor, pending, epoch)
      world.answered.set(id, answer as Exchange<unknown>)
      return answer
    },
  })

/** One exchange of a replica; `repeat` has the network deliver the last answer again instead. */
const synchronize = async (world: World, id: Id, repeat = false): Promise<void> => {
  await Effect.runPromise(
    Effect.provide(world.replicas[id].synchronize, exchangeOf(world, id, repeat)),
  )
}

const openWorld = async (): Promise<World> => {
  const journal = openJournal(':memory:')
  baseList(journal)
  const world: World = {
    journal,
    replicas: { A: await openReplica('A'), B: await openReplica('B') },
    answered: new Map(),
  }
  await synchronize(world, 'A')
  await synchronize(world, 'B')
  world.answered.clear()
  return world
}

const closeWorld = async (world: World): Promise<void> => {
  for (const replica of Object.values(world.replicas)) await Effect.runPromise(replica.close)
  world.journal.close()
  await closeStorages()
}

const submit = (world: World, id: Id, message: DurableMessage): Promise<void> =>
  Effect.runPromise(world.replicas[id].submit(message))

// -- What holds ---------------------------------------------------------------

const same = (a: unknown, b: unknown): boolean => JSON.stringify(a) === JSON.stringify(b)

/**
 * After every step, for each replica: what it committed is the journal's log
 * up to its cursor, and what it shows is that with its pending operations
 * replayed over it.
 */
const consistent = async (world: World): Promise<Option.Option<string>> => {
  for (const [id, replica] of Object.entries(world.replicas)) {
    const [committed, shown, pending, cursor] = await Promise.all([
      Effect.runPromise(replica.committed),
      Effect.runPromise(replica.shared),
      Effect.runPromise(replica.pending),
      Effect.runPromise(replica.cursor),
    ])
    const expected = foldLog(world, cursor)
    if (!same(committed, expected))
      return Option.some(
        `${id} committed ${JSON.stringify(committed)} at cursor ${cursor}; the log gives ${JSON.stringify(expected)}`,
      )
    const replayed = pending.reduce(
      (shared, written) => contract.reduce(shared, contract.operation.decode(written)),
      committed,
    )
    if (!same(shown, replayed))
      return Option.some(
        `${id} shows ${JSON.stringify(shown)}, not its committed state with its pending operations over it`,
      )
  }
  return Option.none()
}

/** Every replica has heard everything: each holds the journal's document, with nothing pending. */
const converged = async (world: World): Promise<Option.Option<string>> => {
  const document = world.journal.snapshot(principal.documentId).model
  const length = logOf(world).length
  for (const [id, replica] of Object.entries(world.replicas)) {
    const [shown, pending, cursor] = await Promise.all([
      Effect.runPromise(replica.shared),
      Effect.runPromise(replica.pending),
      Effect.runPromise(replica.cursor),
    ])
    if (!same(shown, document) || pending.length > 0 || cursor !== length)
      return Option.some(
        `${id} shows ${JSON.stringify(shown)} with ${pending.length} pending at cursor ${cursor}; the journal's document is ${JSON.stringify(document)}`,
      )
  }
  return Option.none()
}

const FINAL = 'every replica exchanges until it has heard everything'

/** The last step, after every other: A, B and A again, so each has heard the other's commit. */
const settling = (
  steps: ReadonlyArray<Temporal.AsyncStep<World, string>>,
): ReadonlyArray<Temporal.AsyncStep<World, string>> => [
  ...steps,
  {
    name: FINAL,
    after: steps.map(step => step.name),
    run: async world => {
      for (const id of ['A', 'B', 'A'] as const) await synchronize(world, id)
    },
  },
]

// -- The walks ----------------------------------------------------------------

type Pair = { readonly A: DurableMessage; readonly B: DurableMessage }

/** The document the journal holds when `first`'s replica reaches it before the other's. */
const committedFirst = async (messages: Pair, first: Id): Promise<string> => {
  const world = await openWorld()
  try {
    await submit(world, 'A', messages.A)
    await submit(world, 'B', messages.B)
    await synchronize(world, first)
    await synchronize(world, first === 'A' ? 'B' : 'A')
    return JSON.stringify(world.journal.snapshot(principal.documentId).model)
  } finally {
    await closeWorld(world)
  }
}

/**
 * One pair, both replicas submitting before they hear each other, the
 * exchanges in any order: each replica holds the journal's document, and
 * `orderMatters` is true where the two orders (A's Message committed first,
 * B's first) left different documents for some Messages drawn. A `never`
 * pair is held to one document in both.
 */
export const walkPair = async (
  over: readonly [string, string],
  options?: { readonly runs?: number },
): Promise<PairWalk> => {
  const runs = options?.runs ?? 3
  let orderMatters = false
  for (const [instance, [idA, idB]] of meetings.entries()) {
    // The two differ in whatever else they carry, so a title or a priority shows which came last.
    const messages = {
      A: messageOf(over[0], idA, instance),
      B: messageOf(over[1], idB, instance + 1),
    }
    orderMatters ||= (await committedFirst(messages, 'A')) !== (await committedFirst(messages, 'B'))
    const result = await Temporal.walkAsync<World, string>(
      {
        initial: openWorld,
        steps: settling([
          { name: 'submit A', run: world => submit(world, 'A', messages.A) },
          { name: 'submit B', run: world => submit(world, 'B', messages.B) },
          { name: 'exchange A', run: world => synchronize(world, 'A') },
          { name: 'exchange B', run: world => synchronize(world, 'B') },
          // Both replicas at the journal at once.
          {
            name: 'exchange A and B',
            run: async world => {
              await Promise.all([synchronize(world, 'A'), synchronize(world, 'B')])
            },
          },
        ]),
        holds: async (world, steps) => {
          const broken = await consistent(world)
          return Option.isSome(broken) || !steps.includes(FINAL) ? broken : converged(world)
        },
        finish: closeWorld,
      },
      { seed: 1 + instance * 1000, runs },
    )
    if (Temporal.WalkResult.$is('Broken')(result)) return { result, orderMatters }
  }
  return {
    result: Temporal.WalkResult.Held({ seed: 1, runs: meetings.length * runs }),
    orderMatters,
  }
}

/** The document a replica's Message leaves once, through a world of its own. */
const once = async (message: DurableMessage): Promise<string> => {
  const world = await openWorld()
  try {
    await submit(world, 'A', message)
    await synchronize(world, 'A')
    return JSON.stringify(world.journal.snapshot(principal.documentId).model)
  } finally {
    await closeWorld(world)
  }
}

/**
 * One Message delivered twice. The server's answer comes to the replica a
 * second time (its operations again), which the committed history's ids and
 * sequence remove whatever the Message; and where the Message is `harmless`
 * (its writes idempotent) the replica also submits it twice, two operations,
 * and the document is what once leaves.
 */
export const walkRedelivery = async (
  tag: string,
  copy: 'harmless' | 'removed by id',
  options?: { readonly runs?: number },
): Promise<Temporal.WalkResult> => {
  // A todo the Message acts on: the base list's, or a new one for the Messages that add.
  const message = messageOf(tag, tag === 'SubmittedTodo' || tag === 'RestoredTodo' ? 'n1' : 'a', 0)
  const expected = await once(message)
  return Temporal.walkAsync<World, string>(
    {
      initial: openWorld,
      steps: settling([
        { name: 'submit', run: world => submit(world, 'A', message) },
        ...(copy === 'harmless'
          ? [
              {
                name: 'submit again',
                after: ['submit'],
                run: (world: World) => submit(world, 'A', message),
              },
            ]
          : []),
        { name: 'exchange', run: world => synchronize(world, 'A') },
        {
          name: 'the answer arrives again',
          after: ['exchange'],
          run: world => synchronize(world, 'A', true),
        },
      ]),
      holds: async (world, steps) => {
        const broken = await consistent(world)
        if (Option.isSome(broken) || !steps.includes(FINAL)) return broken
        const document = JSON.stringify(world.journal.snapshot(principal.documentId).model)
        if (document !== expected)
          return Option.some(`the journal holds ${document}; once leaves ${expected}`)
        return converged(world)
      },
      finish: closeWorld,
    },
    { runs: options?.runs ?? 12 },
  )
}
