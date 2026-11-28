import { Effect, Schema } from 'effect'
import { describe, expect, it } from 'vitest'
import { actorId, cursor, documentId, makeJournal, opId, sequence } from '../src/index.js'

const EntryOp = Schema.Struct({
  id: Schema.String,
  account: Schema.String,
  delta: Schema.Int,
})
type EntryOp = typeof EntryOp.Type

const LedgerSnapshot = Schema.Struct({
  totals: Schema.Record(Schema.String, Schema.Int),
})
type LedgerSnapshot = typeof LedgerSnapshot.Type

const openLedger = () =>
  makeJournal<EntryOp, LedgerSnapshot, string>({
    file: ':memory:',
    operation: EntryOp,
    snapshot: LedgerSnapshot,
    empty: () => ({ totals: {} }),
    reduce: (snap, op) => ({
      totals: {
        ...snap.totals,
        [op.account]: (snap.totals[op.account] ?? 0) + op.delta,
      },
    }),
    opId: op => opId(op.id),
    actorId: actor => actorId(actor),
  })

describe('Durable journal change replay and stored totals (Phase 4 Bouts 4.17–4.18)', () => {
  it('replays operations after a reconnecting client cursor in order with pagination', async () => {
    await Effect.runPromise(
      Effect.scoped(
        Effect.gen(function* () {
          const journal = yield* openLedger()
          const doc = documentId('ledger-1')
          const initialEpoch = yield* journal.epoch(doc)

          yield* journal.append(doc, { id: 'op1', account: 'a', delta: 100 }, 'u1')
          yield* journal.append(doc, { id: 'op2', account: 'a', delta: -30 }, 'u1')
          yield* journal.append(doc, { id: 'op3', account: 'b', delta: 50 }, 'u2')

          // Reconnecting client at cursor 1 with limit 1 gets op2 with hasMore: true
          const page1 = yield* journal.replay(doc, {
            after: cursor(1),
            epoch: initialEpoch,
            limit: 1,
          })
          expect(page1._tag).toBe('Operations')
          if (page1._tag === 'Operations') {
            expect(page1.operations.map(o => o.operation.id)).toEqual(['op2'])
            expect(page1.cursor).toBe(cursor(2))
            expect(page1.hasMore).toBe(true)
            expect(page1.epoch).toBe(initialEpoch)
          }

          // Follow-up from cursor 2 gets op3 with hasMore: false
          const page2 = yield* journal.replay(doc, {
            after: cursor(2),
            epoch: initialEpoch,
            limit: 5,
          })
          expect(page2._tag).toBe('Operations')
          if (page2._tag === 'Operations') {
            expect(page2.operations.map(o => o.operation.id)).toEqual(['op3'])
            expect(page2.cursor).toBe(cursor(3))
            expect(page2.hasMore).toBe(false)
          }

          // Stored totals in snapshot reflect all committed operations
          const loaded = yield* journal.load(doc)
          expect(loaded.snapshot.totals).toEqual({ a: 70, b: 50 })
        }),
      ),
    )
  })

  it('falls back to authoritative Snapshot when cursor is below compaction floor or epoch changed', async () => {
    await Effect.runPromise(
      Effect.scoped(
        Effect.gen(function* () {
          const journal = yield* openLedger()
          const doc = documentId('ledger-2')
          const firstEpoch = yield* journal.epoch(doc)

          yield* journal.append(doc, { id: 'op1', account: 'a', delta: 40 }, 'u1')
          yield* journal.append(doc, { id: 'op2', account: 'a', delta: 60 }, 'u1')
          yield* journal.compact(doc, sequence(2))

          const compacted = yield* journal.replay(doc, {
            after: cursor(0),
            epoch: firstEpoch,
          })
          expect(compacted._tag).toBe('Snapshot')
          if (compacted._tag === 'Snapshot') {
            expect(compacted.reason).toBe('compacted')
            expect(compacted.snapshot.totals).toEqual({ a: 100 })
            expect(compacted.cursor).toBe(cursor(2))
          }

          // Cursor ahead of document also resets cleanly to Snapshot
          const ahead = yield* journal.replay(doc, {
            after: cursor(99),
            epoch: firstEpoch,
          })
          expect(ahead._tag).toBe('Snapshot')
          if (ahead._tag === 'Snapshot') {
            expect(ahead.reason).toBe('cursor-ahead')
            expect(ahead.cursor).toBe(cursor(2))
          }

          // After reset, old epoch receives Snapshot with reason 'epoch-changed'
          yield* journal.reset(doc)
          yield* journal.append(doc, { id: 'op3', account: 'a', delta: 25 }, 'u1')
          const resetReplay = yield* journal.replay(doc, {
            after: cursor(0),
            epoch: firstEpoch,
          })
          expect(resetReplay._tag).toBe('Snapshot')
          if (resetReplay._tag === 'Snapshot') {
            expect(resetReplay.reason).toBe('epoch-changed')
            expect(resetReplay.epoch).not.toBe(firstEpoch)
            expect(resetReplay.snapshot.totals).toEqual({ a: 25 })
          }
        }),
      ),
    )
  })
})
