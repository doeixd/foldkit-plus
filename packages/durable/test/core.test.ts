// @vitest-environment node
/**
 * `foldkit-durable/core` is what a browser loads, so it must reach neither
 * Node's SQLite driver nor a `node:` module, and the journal it opens hashes a
 * payload as `node:crypto` did, so a database written before still proves its
 * retransmissions.
 */
import { createHash } from 'node:crypto'
import { mkdtemp, rm } from 'node:fs/promises'
import { DatabaseSync } from 'node:sqlite'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import * as SqliteClient from '@effect/sql-sqlite-node/SqliteClient'
import { build } from 'esbuild'
import { Context, Effect, Exit, Fiber, Layer, Schema, Scope, Stream } from 'effect'
import { expect, test, vi } from 'vitest'
import { Journal } from '../src/core.js'
import { actorId, documentId, makeJournal, opId } from '../src/index.js'

const here = (file: string) => fileURLToPath(new URL(file, import.meta.url))

test('reaches no Node module, as a browser bundle of it resolves', async () => {
  const bundled = await build({
    entryPoints: [here('../src/core.ts')],
    tsconfig: here('../tsconfig.json'),
    conditions: ['foldkit-plus:source'],
    bundle: true,
    format: 'esm',
    platform: 'browser',
    write: false,
    metafile: true,
    logLevel: 'silent',
  })
  const inputs = Object.keys(bundled.metafile.inputs)
  expect(inputs.some(path => path.endsWith('durable/src/journal.ts'))).toBe(true)
  expect(inputs.filter(path => /sql-sqlite-node|^node:/.test(path))).toEqual([])
}, 60_000)

test('hashes a payload as node:crypto did, past ASCII too', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'foldkit-hash-'))
  const path = join(directory, 'journal.sqlite')
  const Note = Schema.Struct({ opId: Schema.String, text: Schema.String })
  type Note = typeof Note.Type
  try {
    await Effect.runPromise(
      Effect.scoped(
        Effect.gen(function* () {
          const journal = yield* makeJournal<Note, ReadonlyArray<Note>, string>({
            file: path,
            operation: Note,
            snapshot: Schema.Array(Note),
            empty: () => [],
            reduce: (state, value) => [...state, value],
            opId: value => opId(value.opId),
            actorId: principal => actorId(principal),
          })
          yield* journal.append(documentId('d'), { opId: 'n:1', text: 'Crème brûlée ✓' }, 'ada')
        }),
      ),
    )
    const database = new DatabaseSync(path)
    try {
      expect(
        database.prepare('SELECT payload_hash FROM operations WHERE op_id = ?').get('n:1'),
      ).toEqual({
        payload_hash: createHash('sha256')
          .update('{"opId":"n:1","text":"Crème brûlée ✓"}')
          .digest('hex'),
      })
    } finally {
      database.close()
    }
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})

test('a journal layer keeps its database for as long as the layer, and closes it with the layer', async () => {
  const Note = Schema.Struct({ opId: Schema.String })
  type Note = typeof Note.Type
  const Notes = Journal.define<Note, ReadonlyArray<Note>, string>('test/Notes')
  const live = Notes.layer({
    operation: Note,
    snapshot: Schema.Array(Note),
    empty: () => [],
    reduce: (state, value) => [...state, value],
    opId: value => opId(value.opId),
    actorId: principal => actorId(principal),
  }).pipe(Layer.provide(SqliteClient.layer({ filename: ':memory:' })))
  const key = documentId('d')
  const scope = Effect.runSync(Scope.make())
  // The effect that builds the layer ends here; the journal must outlive it.
  const journal = Context.get(await Effect.runPromise(Layer.buildWithScope(live, scope)), Notes.tag)
  const woken: Array<string> = []
  const reader = Effect.runFork(
    Stream.runForEach(journal.subscribe, woke => Effect.sync(() => woken.push(woke))),
  )
  for (let turn = 0; turn < 100; turn++) await Effect.runPromise(Effect.yieldNow)
  await Effect.runPromise(journal.append(key, { opId: 'n:1' }, 'ada'))
  await vi.waitFor(() => expect(woken).toEqual(['d']))
  expect(await Effect.runPromise(journal.load(key))).toMatchObject({ cursor: 1 })

  // Closing the layer's scope closes the journal and its database together.
  await Effect.runPromise(Scope.close(scope, Exit.void))
  await Effect.runPromise(Fiber.join(reader))
  expect(
    await Effect.runPromise(Effect.result(journal.append(key, { opId: 'n:2' }, 'ada'))),
  ).toMatchObject({
    _tag: 'Failure',
    failure: { _tag: 'JournalError' },
  })
})
