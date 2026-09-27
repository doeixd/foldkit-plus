import { mkdtempSync, rmSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Effect, Exit, Schema, Scope } from 'effect'
import { actorId, documentId, makeJournal, opId, sequence } from '../src/index.js'

interface Operation {
  readonly opId: string
  readonly id: string
}
interface Snapshot {
  readonly count: number
}
interface Principal {
  readonly actorId: string
}

const codec = <T>(): { encode: (value: T) => T; decode: (value: unknown) => T } => ({
  encode: value => value,
  decode: value => value as T,
})
const principal: Principal = { actorId: 'owner' }
const operations = 5_000

const directory = mkdtempSync(join(tmpdir(), 'foldkit-storage-'))
const path = join(directory, 'journal.sqlite')
const scope = Effect.runSync(Scope.make())
const journal = Effect.runSync(
  makeJournal<Operation, Snapshot, Principal>({
    file: path,
    operation: codec<Operation>(),
    snapshot: codec<Snapshot>(),
    empty: () => ({ count: 0 }),
    reduce: state => ({ count: state.count + 1 }),
    opId: operation => opId(operation.opId),
    actorId: value => actorId(value.actorId),
  }).pipe(Effect.provideService(Scope.Scope, scope)),
)

const size = (): number => statSync(path).size
const started = performance.now()
for (let index = 1; index <= operations; index += 1)
  Effect.runSync(
    journal.append(documentId('bench'), { opId: `op:${index}`, id: String(index) }, principal),
  )
const appended = size()
const elapsed = performance.now() - started

// Compaction drops payloads but keeps one identity row per operation, so the
// file does not shrink; this separates "payload bytes" from "identity bytes".
Effect.runSync(journal.compact(documentId('bench'), sequence(operations)))
const compacted = size()
Effect.runSync(journal.vacuum())
const vacuumed = size()
const heap = process.memoryUsage()

console.log(
  [
    `operations: ${operations}`,
    `append: ${elapsed.toFixed(0)} ms (${(elapsed / operations).toFixed(2)} ms/op)`,
    `bytes appended: ${appended} (${(appended / operations).toFixed(1)} B/op)`,
    `bytes after compacting all payloads: ${compacted}`,
    `bytes after vacuum: ${vacuumed}`,
    `heap: ${(heap.heapUsed / 1_000_000).toFixed(1)} MB, rss: ${(heap.rss / 1_000_000).toFixed(1)} MB`,
  ].join('\n'),
)

Effect.runSync(Scope.close(scope, Exit.void))

// A document-sized snapshot through a real Schema codec: what an append costs when
// the snapshot is a page of content rather than a counter.
const Item = Schema.Struct({ id: Schema.String, title: Schema.String })
const Document = Schema.Struct({ items: Schema.Array(Item) })
const Edit = Schema.Struct({ opId: Schema.String, at: Schema.Number, title: Schema.String })
const items = 2_000
const edits = 500
const appendEdits = (snapshotEvery: number): number => {
  const documentScope = Effect.runSync(Scope.make())
  const documents = Effect.runSync(
    makeJournal<typeof Edit.Type, typeof Document.Type, Principal>({
      file: join(directory, `document-${snapshotEvery}.sqlite`),
      operation: Edit,
      snapshot: Document,
      empty: () => ({
        items: Array.from({ length: items }, (_, index) => ({ id: `i${index}`, title: 'item' })),
      }),
      reduce: (state, edit) => ({
        items: state.items.map((item, index) =>
          index === edit.at ? { ...item, title: edit.title } : item,
        ),
      }),
      opId: operation => opId(operation.opId),
      actorId: value => actorId(value.actorId),
      snapshotEvery,
    }).pipe(Effect.provideService(Scope.Scope, documentScope)),
  )
  const started = performance.now()
  for (let index = 1; index <= edits; index += 1)
    Effect.runSync(
      documents.append(
        documentId('page'),
        { opId: `edit:${index}`, at: index % items, title: `edited ${index}` },
        principal,
      ),
    )
  const elapsed = performance.now() - started
  Effect.runSync(Scope.close(documentScope, Exit.void))
  return elapsed / edits
}
for (const every of [1, 50])
  console.log(
    `append to a ${items}-item snapshot, written every ${every}: ${appendEdits(every).toFixed(2)} ms/op over ${edits} edits`,
  )
rmSync(directory, { recursive: true, force: true })
