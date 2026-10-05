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
import { build } from 'esbuild'
import { Effect, Schema } from 'effect'
import { expect, test } from 'vitest'
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
