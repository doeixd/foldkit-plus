/**
 * The journal over SQLite compiled to WebAssembly (`@effect/sql-sqlite-wasm`,
 * in memory), as a browser runs it through `foldkit-durable/core`: append and
 * its retry, a refusal, read, load, effect recovery, compaction and its
 * checkpointed read, and a reset to a new epoch.
 */
import * as WasmClient from '@effect/sql-sqlite-wasm/SqliteClient'
import { Effect, Layer, Schema } from 'effect'
import { expect, test } from 'vitest'
import { Journal, actorId, cursor, documentId, opId, sequence } from '../src/core.js'

const Edit = Schema.Struct({
  opId: Schema.String,
  value: Schema.String,
  at: Schema.optionalKey(Schema.Number),
})
type Edit = typeof Edit.Type
const key = documentId('d')
const sent = (n: number): Edit => ({ opId: `e:${n}`, value: `v${n}` })
const Edits = Journal.define<Edit, ReadonlyArray<Edit>, string>('test/Edits')
const live = Edits.layer({
  operation: Edit,
  snapshot: Schema.Array(Edit),
  empty: () => [],
  reduce: (state, value) => [...state, value],
  opId: value => opId(value.opId),
  actorId: principal => actorId(principal),
  stamp: (value, { sequence: at }) => ({ ...value, at }),
  authorize: ({ operation }) => operation.value !== 'no' || { allowed: false, reason: 'Not that' },
}).pipe(Layer.provide(Layer.orDie(WasmClient.layerMemory({}))))

test('keeps the journal’s guarantees on SQLite compiled to WebAssembly', () =>
  Effect.runPromise(
    Effect.scoped(
      Effect.gen(function* () {
        const journal = yield* Edits.tag
        yield* journal.append(key, sent(1), 'ada')
        yield* journal.append(key, sent(2), 'ada')
        // A retry by what was sent is answered from history.
        const again = yield* journal.append(key, sent(1), 'ada')
        expect(again).toMatchObject({ _tag: 'Committed', committed: { sequence: 1 } })
        const refused = yield* Effect.result(
          journal.append(key, { opId: 'e:3', value: 'no' }, 'ada'),
        )
        expect(refused).toMatchObject({
          _tag: 'Failure',
          failure: { _tag: 'OperationRejectedError', reason: 'Not that' },
        })
        expect((yield* journal.read(key, cursor(0))).map(entry => entry.operation)).toEqual([
          { ...sent(1), at: 1 },
          { ...sent(2), at: 2 },
        ])
        const ran: Array<string> = []
        const settled = yield* journal.recover({
          key,
          from: cursor(0),
          intents: value => [{ key: value.opId, run: Effect.sync(() => ran.push(value.opId)) }],
        })
        expect(settled).toBe(2)
        expect(ran).toEqual(['e:1', 'e:2'])
        yield* journal.compact(key, sequence(2))
        const compacted = yield* Effect.result(journal.read(key, cursor(0)))
        expect(compacted).toMatchObject({
          _tag: 'Failure',
          failure: { _tag: 'CompactedCursorError' },
        })
        expect(yield* journal.load(key)).toMatchObject({ cursor: 2 })
        const before = yield* journal.epoch(key)
        yield* journal.reset(key)
        expect(yield* journal.cursor(key)).toBe(0)
        expect(yield* journal.epoch(key)).not.toBe(before)
      }).pipe(Effect.provide(live)),
    ),
  ))
