// @vitest-environment node
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Effect, Schema } from 'effect'
import { checkStore, type StoreAdapter, type StoreRow } from '@doeixd/metakit/store/check'
import { describe, expect, it } from 'vitest'
import { actorId, documentId, makeJournal, opId } from '../src/index.js'

const Op = Schema.Union([
  Schema.Struct({
    _tag: Schema.Literal('Seed'),
    id: Schema.String,
    balance: Schema.Number,
    seq: Schema.String,
  }),
  Schema.Struct({
    _tag: Schema.Literal('Set'),
    id: Schema.String,
    balance: Schema.Number,
    seq: Schema.String,
  }),
])
type Op = typeof Op.Type

const Snapshot = Schema.Record(Schema.String, Schema.Number)
type Snapshot = typeof Snapshot.Type

describe('foldkit-durable SQLite journal storeCheck (Phase 9 Bout 9.4)', () => {
  it('passes checkStore for its declared serializable transaction capability', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'foldkit-durable-check-'))
    try {
      const file = join(dir, 'journal.sqlite')
      await Effect.runPromise(
        Effect.scoped(
          Effect.gen(function* () {
            const journal = yield* makeJournal<Op, Snapshot, string>({
              file,
              operation: Op,
              snapshot: Snapshot,
              empty: () => ({}),
              reduce: (state, op) => ({ ...state, [op.id]: op.balance }),
              opId: op => opId(op.seq),
              actorId: p => actorId(p),
            })

            let docCounter = 0
            let currentDoc = documentId('doc-0')
            let seqCounter = 0
            let chain: Promise<unknown> = Promise.resolve()
            const serialized = <A>(fn: () => Promise<A>): Promise<A> => {
              const next = chain.then(fn, fn)
              chain = next
              return next
            }

            const readRow = async (id: string): Promise<StoreRow | undefined> => {
              const { snapshot } = await Effect.runPromise(journal.load(currentDoc))
              const bal = snapshot[id]
              return bal === undefined ? undefined : { id, balance: bal }
            }

            const writeRow = async (id: string, balance: number): Promise<void> => {
              seqCounter += 1
              await Effect.runPromise(
                journal.append(
                  currentDoc,
                  { _tag: 'Set', id, balance, seq: `set-${seqCounter}` },
                  'tester',
                ),
              )
            }

            const adapter: StoreAdapter = {
              seed: async ({ parent }) => {
                docCounter += 1
                currentDoc = documentId(`doc-${docCounter}`)
                seqCounter += 1
                await Effect.runPromise(
                  journal.append(
                    currentDoc,
                    {
                      _tag: 'Seed',
                      id: parent.id,
                      balance: parent.balance,
                      seq: `seed-${seqCounter}`,
                    },
                    'tester',
                  ),
                )
              },
              connect: async () => ({
                read: readRow,
                write: writeRow,
                transaction: run =>
                  serialized(() =>
                    run({
                      read: readRow,
                      write: writeRow,
                    }),
                  ),
              }),
            }

            const report = yield* Effect.promise(() =>
              checkStore(journal.store, adapter, { runs: 2 }),
            )
            expect(report.passed).toBe(true)
            expect(report.failures).toEqual([])
          }),
        ),
      )
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })
})
