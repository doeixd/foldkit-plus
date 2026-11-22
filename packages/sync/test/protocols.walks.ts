/**
 * Seeded walks over the real replica (`Sync.openReplica`: its outbox, its
 * exchange, its projection), against a server that commits what it is sent.
 * `protocols.obligations.ts` declares what is owed and runs these;
 * `protocols.test.ts` holds them to it. The oracle is the definition's own
 * `replay` folded over the server's log, never the replica's state run a
 * second way. The IndexedDB store's walk is in `protocols.store.ts`.
 */
import { Effect, Exit, Option, Schema } from 'effect'
import * as Temporal from 'metakit/temporal'
import {
  defineSync,
  documentId,
  layerFromPromise,
  localSequence,
  opId,
  replicaId,
  sequence,
  type CommittedOperation,
  type Replica,
  type Storage,
  type SyncDefinition,
} from '../src/index.js'
import { walkAsync, type AsyncStep } from './walkAsync.js'

const Message = Schema.Struct({ _tag: Schema.Literal('Appended'), text: Schema.String })
type Message = typeof Message.Type
const Shared = Schema.Struct({ items: Schema.Array(Schema.String) })
type Shared = typeof Shared.Type

/** A list that appends: applying a Message twice shows. */
const definition: SyncDefinition<Message, Shared, unknown, unknown> = {
  documentId: documentId('protocols'),
  message: Message,
  shared: Shared,
  empty: { items: [] },
  durable: () => true,
  replay: (shared, message) => ({ items: [...shared.items, message.text] }),
}
const Sync = defineSync(definition)
const appended = (text: string): Message => ({ _tag: 'Appended', text })
const textIn = (operation: { readonly message: unknown }): string =>
  Schema.decodeUnknownSync(Message)(operation.message).text
const fold = (texts: ReadonlyArray<string>): Shared =>
  texts.reduce((shared, text) => definition.replay(shared, appended(text)), definition.empty)

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

// -- The server and the replicas of one document -----------------------------

type Fault = 'none' | 'request lost' | 'response lost'
const injected = new Error('the connection dropped')

/** A server that commits each operation once, by its id, in the order it hears them. */
const serverOf = () => {
  const state = {
    epoch: 'one',
    log: new Array<CommittedOperation>(),
    heard: new Set<string>(),
  }
  const exchange = (cursor: number, entries: ReadonlyArray<unknown>, seen: string | undefined) => {
    const sent = entries.map(entry => Sync.codec.operationFrom(entry, definition.documentId))
    const acknowledged: Array<(typeof sent)[number]['opId']> = []
    for (const operation of sent) {
      if (state.heard.has(operation.opId)) continue
      state.heard.add(operation.opId)
      acknowledged.push(operation.opId)
      state.log.push({
        ...operation,
        serverSequence: sequence(state.log.length + 1),
        actorId: 'owner',
      })
    }
    // A replica of another epoch points into a history that is gone: it starts from the top.
    const from = seen !== undefined && seen !== state.epoch ? 0 : cursor
    return {
      operations: state.log.slice(from),
      rejected: [],
      // Only what it committed now: one it heard before arrives in the log, not as an answer.
      acknowledged,
      more: false,
      epoch: state.epoch,
    }
  }
  const textOf = (operation: CommittedOperation): string => textIn(operation)
  return {
    state,
    exchange,
    texts: (upTo = state.log.length) => state.log.slice(0, upTo).map(textOf),
    /** The server loses its history and starts another with what others wrote. */
    reset: (foreign: ReadonlyArray<string>) => {
      state.epoch = state.epoch === 'one' ? 'two' : `${state.epoch}+`
      state.heard = new Set()
      state.log = foreign.map((text, at) => ({
        protocolVersion: 1,
        schemaVersion: 1,
        documentId: definition.documentId,
        replicaId: replicaId('other'),
        localSequence: localSequence(at + 1),
        opId: opId(`other:${at + 1}`),
        baseCursor: sequence(0),
        message: appended(text),
        serverSequence: sequence(at + 1),
        actorId: 'owner',
      }))
      for (const operation of state.log) state.heard.add(operation.opId)
    },
  }
}

interface Tab {
  readonly replica: Replica<Message, Shared>
  fault: Fault
  /** Everything this tab submitted, in order. */
  readonly submitted: Array<string>
}
interface World {
  readonly server: ReturnType<typeof serverOf>
  readonly tabs: Readonly<Record<'A' | 'B', Tab>>
  /** Runs once, while the next exchange is out: what a person does meanwhile. */
  meanwhile: (() => Promise<void>) | undefined
}

const openWorld = async (): Promise<World> => {
  const server = serverOf()
  const tab = async (id: string): Promise<Tab> => {
    const replica = await Effect.runPromise(
      Sync.openReplica(memoryStorage(), { replicaId: replicaId(id) }),
    )
    return { replica, fault: 'none', submitted: [] }
  }
  return { server, tabs: { A: await tab('A'), B: await tab('B') }, meanwhile: undefined }
}

const closeWorld = async (world: World): Promise<void> => {
  for (const { replica } of Object.values(world.tabs)) await Effect.runPromise(replica.close)
}

const submit = (world: World, id: 'A' | 'B', text: string) => {
  const tab = world.tabs[id]
  tab.submitted.push(text)
  return Effect.runPromise(tab.replica.submit(appended(text)))
}

/** One exchange of a tab, its connection dropping where `fault` says. */
const synchronize = async (world: World, id: 'A' | 'B', fault: Fault): Promise<void> => {
  const tab = world.tabs[id]
  tab.fault = fault
  const transport = layerFromPromise({
    exchange: async (cursor, entries, seen) => {
      if (fault === 'request lost') throw injected
      const response = world.server.exchange(cursor, entries, seen)
      const meanwhile = world.meanwhile
      world.meanwhile = undefined
      await meanwhile?.()
      if (fault === 'response lost') throw injected
      return response
    },
  })
  const exit = await Effect.runPromiseExit(Effect.provide(tab.replica.synchronize, transport))
  tab.fault = 'none'
  // A connection that was made to drop may fail the exchange; nothing else may.
  if (Exit.isFailure(exit) && fault === 'none') throw new Error(String(exit.cause))
}

/** What the replica holds, as plain texts. */
const textsOf = (replica: Replica<Message, Shared>) => ({
  committed: Effect.runSync(replica.committed).items,
  shared: Effect.runSync(replica.shared).items,
  pending: Effect.runSync(replica.pending).map(textIn),
  cursor: Effect.runSync(replica.cursor),
})

const same = (a: ReadonlyArray<string>, b: ReadonlyArray<string>) =>
  JSON.stringify(a) === JSON.stringify(b)

/**
 * After every step, for each tab: what it committed is the server's log up to
 * its cursor, what it shows is that with its pending operations replayed over
 * it, every Message it submitted is pending or in the log (the server's copy
 * counted once), and its own Messages sit in the order they were submitted.
 */
const consistent = (world: World): Option.Option<string> => {
  const log = world.server.texts()
  if (new Set(log).size !== log.length)
    return Option.some(`the server committed a Message twice: ${log.join(', ')}`)
  for (const [id, tab] of Object.entries(world.tabs)) {
    const held = textsOf(tab.replica)
    const prefix = world.server.texts(held.cursor)
    if (!same(held.committed, fold(prefix).items))
      return Option.some(
        `${id} committed ${held.committed.join(', ')} at cursor ${held.cursor}; the server's log gives ${prefix.join(', ')}`,
      )
    if (!same(held.shared, [...held.committed, ...held.pending]))
      return Option.some(
        `${id} shows ${held.shared.join(', ')}, not its committed ${held.committed.join(', ')} with its pending ${held.pending.join(', ')}`,
      )
    const own = (texts: ReadonlyArray<string>) => texts.filter(text => text.startsWith(id))
    const lost = tab.submitted.filter(text => !held.pending.includes(text) && !log.includes(text))
    if (lost.length > 0) return Option.some(`${id} lost ${lost.join(', ')}`)
    if (
      !same(
        own(log),
        tab.submitted.filter(text => log.includes(text)),
      )
    )
      return Option.some(`${id}'s Messages are committed out of order: ${own(log).join(', ')}`)
  }
  return Option.none()
}

/** The tabs have heard everything: each holds the server's document, and none has anything pending. */
const converged = (world: World): Option.Option<string> => {
  const log = world.server.texts()
  for (const [id, tab] of Object.entries(world.tabs)) {
    const held = textsOf(tab.replica)
    if (!same(held.committed, log))
      return Option.some(
        `${id} holds ${held.committed.join(', ')}; the server's document is ${log.join(', ')}`,
      )
    if (held.pending.length > 0 || held.cursor !== log.length)
      return Option.some(
        `${id} still has ${held.pending.join(', ')} pending at cursor ${held.cursor}`,
      )
  }
  return Option.none()
}

const FINAL = 'every tab exchanges with the connection up'

/** `steps`, then a last step after all of them: each tab exchanges once the connection holds. */
const closing = (
  steps: ReadonlyArray<AsyncStep<World, StepName>>,
): ReadonlyArray<AsyncStep<World, StepName>> => [
  ...steps,
  {
    name: FINAL,
    after: steps.map(step => step.name),
    run: async world => {
      for (const id of ['A', 'B', 'A'] as const) await synchronize(world, id, 'none')
    },
  },
]

type StepName = string

const submits = (id: 'A' | 'B'): ReadonlyArray<AsyncStep<World, StepName>> => [
  { name: `submit:${id}1`, run: world => submit(world, id, `${id}1`) },
  { name: `submit:${id}2`, after: [`submit:${id}1`], run: world => submit(world, id, `${id}2`) },
]

const syncs = (id: 'A' | 'B'): ReadonlyArray<AsyncStep<World, StepName>> => [
  { name: `sync:${id}`, run: world => synchronize(world, id, 'none') },
  { name: `sync:${id}:response lost`, run: world => synchronize(world, id, 'response lost') },
  { name: `sync:${id}:request lost`, run: world => synchronize(world, id, 'request lost') },
]

/**
 * One replica whose connection drops: an exchange the server never heard, one
 * it answered to nobody, and one that went through, in any order with its
 * submits. Whatever happened, a Message submitted is neither lost nor
 * committed twice, and once an exchange goes through the replica holds the
 * server's document.
 */
export const reconnect = (options?: Temporal.WalkOptions) =>
  walkAsync<World, StepName>(
    {
      initial: openWorld,
      steps: closing([...submits('A'), ...syncs('A')]),
      holds: async (world, ran) => {
        const broken = consistent(world)
        if (Option.isSome(broken)) return broken
        return ran.includes(FINAL) ? converged(world) : Option.none()
      },
      finish: closeWorld,
    },
    options,
  )

/**
 * Two tabs, each its own replica of one document, submitting and exchanging
 * in any interleaving, a connection dropping now and then, and both at the
 * server at once: after every step each holds the server's log up to its
 * cursor with its own pending operations over it, and once both have heard
 * everything they hold one document, with every Message in it once.
 */
export const twoTabs = (options?: Temporal.WalkOptions) =>
  walkAsync<World, StepName>(
    {
      initial: openWorld,
      steps: closing([
        ...submits('A'),
        ...submits('B'),
        ...syncs('A'),
        ...syncs('B'),
        {
          name: 'sync:A+B',
          run: async world => {
            await Promise.all([synchronize(world, 'A', 'none'), synchronize(world, 'B', 'none')])
          },
        },
        // A Message submitted while an exchange is out stays pending over whatever B committed.
        {
          name: 'submit:A3 and A4 while A exchanges',
          after: ['submit:A2'],
          run: async world => {
            world.meanwhile = async () => {
              await submit(world, 'A', 'A3')
              await submit(world, 'A', 'A4')
            }
            await synchronize(world, 'A', 'none')
          },
        },
      ]),
      holds: async (world, ran) => {
        const broken = consistent(world)
        if (Option.isSome(broken)) return broken
        if (!ran.includes(FINAL)) return Option.none()
        const log = world.server.texts()
        const [a, b] = [textsOf(world.tabs.A.replica), textsOf(world.tabs.B.replica)]
        if (!same(a.shared, b.shared))
          return Option.some(`the tabs hold ${a.shared.join(', ')} and ${b.shared.join(', ')}`)
        const missing = ['A1', 'A2', 'A3', 'A4', 'B1', 'B2'].filter(text => !log.includes(text))
        return missing.length > 0
          ? Option.some(`the server never committed ${missing.join(', ')}`)
          : converged(world)
      },
      finish: closeWorld,
    },
    options,
  )

/**
 * The server loses its history and starts another, shorter than the replica's
 * cursor, while the replica's outbox holds Messages whose answers were lost.
 * Once an exchange goes through the replica has rebuilt from the new history
 * and holds the server's document, its outbox sent there.
 */
export const serverReset = (options?: Temporal.WalkOptions) =>
  walkAsync<World, StepName>(
    {
      initial: openWorld,
      steps: closing([
        ...submits('A'),
        { name: 'sync:A', run: world => synchronize(world, 'A', 'none') },
        {
          name: 'sync:A:response lost',
          run: world => synchronize(world, 'A', 'response lost'),
        },
        {
          name: 'reset',
          run: async world => {
            world.server.reset(['other1'])
          },
        },
        { name: 'sync:A:request lost', run: world => synchronize(world, 'A', 'request lost') },
      ]),
      // Until the first exchange after the reset the replica's cursor points into a history that is gone.
      holds: async (world, ran) => {
        if (!ran.includes(FINAL)) return Option.none()
        const held = textsOf(world.tabs.A.replica)
        return same(held.committed, world.server.texts()) &&
          held.pending.length === 0 &&
          held.cursor === world.server.texts().length
          ? Option.none()
          : Option.some(
              `holds ${held.committed.join(', ')} at cursor ${held.cursor} with ${held.pending.join(', ')} pending; the server's document is ${world.server.texts().join(', ')}`,
            )
      },
      finish: closeWorld,
    },
    options,
  )
