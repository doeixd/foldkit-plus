/**
 * A seeded walk over the real IndexedDB store (`Storage.indexedDb`), written
 * by two tabs that share one replica's database. `protocols.obligations.ts`
 * declares what is owed and runs it; `protocols.test.ts` holds it to it.
 */
import { Effect, Exit, Option, Schema, Scope } from 'effect'
import { IDBFactory } from 'fake-indexeddb'
import * as Temporal from 'metakit/temporal'
import { indexedDb, type Storage } from '../src/index.js'

type Writer = 'A' | 'B'
const writers: ReadonlyArray<Writer> = ['A', 'B']

interface Stored {
  readonly scope: Scope.Closeable
  readonly connections: Readonly<Record<Writer, Required<Storage>>>
  /** The revision each tab believes the store is at, as of its last read or write. */
  readonly known: Record<Writer, number>
  /** What the store must hold, kept from the writes the compare-and-swap is owed to accept. */
  readonly stored: { revision: number; pending: Array<string> }
  /** A reason, once a write landed or was refused against the rule. */
  broken: Option.Option<string>
  counter: number
}

const openStored = async (): Promise<Stored> => {
  const factory = new IDBFactory()
  const scope = Effect.runSync(Scope.make())
  const open = Effect.provideService(indexedDb('replica', factory), Scope.Scope, scope)
  const [a, b] = [await Effect.runPromise(open), await Effect.runPromise(open)]
  await Effect.runPromise(a.save({ revision: 0, pending: [] }, null))
  return {
    scope,
    connections: { A: a, B: b },
    known: { A: 0, B: 0 },
    stored: { revision: 0, pending: [] },
    broken: Option.none(),
    counter: 0,
  }
}

const closeStored = (world: Stored) => Effect.runPromise(Scope.close(world.scope, Exit.void))

type Kind = 'append' | 'save'

/** A write by `writer` from the revision it knows, started now, answered when the store answers. */
const writeFrom = (world: Stored, writer: Writer, kind: Kind) => {
  const expected = world.known[writer]
  const revision = expected + 1
  const label = `${writer}${(world.counter += 1)}`
  const connection = world.connections[writer]
  const landed = Effect.runPromise(
    Effect.result(
      kind === 'save'
        ? connection.save({ revision, pending: [] }, expected)
        : connection.append(
            {
              revision,
              nextLocalSequence: world.counter + 1,
              localSequence: world.counter,
              operation: { id: label },
            },
            expected,
          ),
    ),
  ).then(result => result._tag === 'Success')
  return { writer, expected, revision, label, kind, landed }
}
type Started = ReturnType<typeof writeFrom>

/**
 * What the store owes the writes sent together: a write lands only if it
 * expected the revision the store was at, and of writes that expected the
 * same one, exactly one lands. Then the store is what the landed write left.
 */
const settle = async (world: Stored, started: ReadonlyArray<Started>): Promise<void> => {
  const outcomes = await Promise.all(
    started.map(async write => ({ write, landed: await write.landed })),
  )
  const owed = outcomes.filter(({ write }) => write.expected === world.stored.revision)
  const landed = outcomes.filter(outcome => outcome.landed)
  if (
    landed.length !== Math.min(owed.length, 1) ||
    !landed.every(outcome => owed.includes(outcome))
  ) {
    world.broken = Option.some(
      `${outcomes.map(({ write, landed }) => `${write.label} expecting ${write.expected} ${landed ? 'landed' : 'was refused'}`).join(', ')} with the store at ${world.stored.revision}`,
    )
    return
  }
  for (const { write } of landed) {
    world.known[write.writer] = write.revision
    world.stored.revision = write.revision
    if (write.kind === 'save') world.stored.pending = []
    else world.stored.pending.push(write.label)
  }
}

const StoredState = Schema.Struct({
  revision: Schema.Number,
  pending: Schema.Array(Schema.Struct({ id: Schema.String })),
})
const readStore = async (world: Stored, writer: Writer) =>
  Schema.decodeUnknownSync(StoredState)(await Effect.runPromise(world.connections[writer].load()))

const reload = async (world: Stored, writer: Writer): Promise<void> => {
  world.known[writer] = (await readStore(world, writer)).revision
}

const writeSteps = (writer: Writer): ReadonlyArray<Temporal.AsyncStep<Stored, string>> => [
  ...[1, 2].map((at): Temporal.AsyncStep<Stored, string> => ({
    name: `${writer} appends ${at}`,
    run: world => settle(world, [writeFrom(world, writer, 'append')]),
  })),
  ...[1, 2].map((at): Temporal.AsyncStep<Stored, string> => ({
    name: `${writer} settles ${at}`,
    run: world => settle(world, [writeFrom(world, writer, 'save')]),
  })),
  ...[1, 2].map((at): Temporal.AsyncStep<Stored, string> => ({
    name: `${writer} reloads ${at}`,
    run: world => reload(world, writer),
  })),
]

const FINAL = 'both tabs reload'

/**
 * Two tabs of one replica writing its store: appending an operation, settling
 * (saving the whole state), reloading, and writing at once, in any order,
 * each from the revision it last saw. A write whose revision is not the
 * store's is refused and leaves nothing behind; of two sent together that
 * expect the same revision exactly one lands; and when both tabs have
 * reloaded they hold the store's revision and its pending operations are
 * exactly those the accepted appends left since the last accepted settle.
 */
export const tabWriters = (options?: Temporal.WalkOptions) => {
  const steps: ReadonlyArray<Temporal.AsyncStep<Stored, string>> = [
    ...writers.flatMap(writeSteps),
    {
      name: 'A and B settle at once',
      run: world => settle(world, [writeFrom(world, 'A', 'save'), writeFrom(world, 'B', 'save')]),
    },
    {
      name: 'A and B append at once',
      run: world =>
        settle(world, [writeFrom(world, 'A', 'append'), writeFrom(world, 'B', 'append')]),
    },
  ]
  return Temporal.walkAsync<Stored, string>(
    {
      initial: openStored,
      steps: [
        ...steps,
        {
          name: FINAL,
          after: steps.map(step => step.name),
          run: async world => {
            for (const writer of writers) await reload(world, writer)
          },
        },
      ],
      holds: async (world, ran) => {
        if (Option.isSome(world.broken)) return world.broken
        const { revision, pending } = await readStore(world, 'A')
        const ids = pending.map(({ id }) => id)
        if (revision !== world.stored.revision || ids.join() !== world.stored.pending.join())
          return Option.some(
            `the store is at revision ${revision} with ${ids.join(', ') || 'nothing'} pending; the accepted writes leave revision ${world.stored.revision} with ${world.stored.pending.join(', ') || 'nothing'}`,
          )
        return ran.includes(FINAL) &&
          (world.known.A !== world.stored.revision || world.known.B !== world.stored.revision)
          ? Option.some('after both tabs reloaded they do not hold the store’s revision')
          : Option.none()
      },
      finish: closeStored,
    },
    options,
  )
}
