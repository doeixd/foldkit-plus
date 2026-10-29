// @vitest-environment node
/**
 * The law over the notebook's three writes (operations-phase6-DESIGN §1):
 * each run through the page's own `Data.mutate` and through the server, as
 * Ada at one time, the page holding every row it may see, its session
 * included. What the page shows while a write is pending must be what the
 * server then stores, the author's count and the notebook's order included.
 */
import { drizzle } from 'drizzle-orm/node-sqlite'
import { Clock, Effect, Layer, Option } from 'effect'
import { ME } from 'foldkit-plus/guard'
import { databaseLayer } from 'foldkit-plus/remote-drizzle'
import { Remote } from 'foldkit-plus/remote'
import { Law } from 'foldkit-plus/remote/testing'
import { RemoteServer } from 'foldkit-plus/remote-server'
import { readFileSync } from 'node:fs'
import { DatabaseSync } from 'node:sqlite'
import { describe, expect, it } from 'vitest'
import { Me, Member, Note } from '../src/guard.js'
import { Data, initial } from '../src/main.js'
import { AddNote, DeleteNote, EditNote, Notes } from '../src/operations.js'
import { server } from '../src/server.js'

const NOW = 1_000_000

const stoppedAt = (at: number): Clock.Clock => ({
  currentTimeMillisUnsafe: () => at,
  currentTimeMillis: Effect.succeed(at),
  currentTimeNanosUnsafe: () => BigInt(at) * 1_000_000n,
  currentTimeNanos: Effect.succeed(BigInt(at) * 1_000_000n),
  monotonicTimeNanosUnsafe: () => BigInt(at) * 1_000_000n,
  monotonicTimeNanos: Effect.succeed(BigInt(at) * 1_000_000n),
  sleep: () => Effect.void,
})

/** The migrations on Node's SQLite, with two members and a note of each. */
const seeded = () => {
  const sqlite = new DatabaseSync(':memory:')
  for (const file of ['0001_accounts.sql', '0002_notes.sql', '0003_write_ledger.sql'])
    sqlite.exec(readFileSync(new URL(`../migrations/${file}`, import.meta.url), 'utf8'))
  sqlite.exec(`
    insert into accounts values ('ada', 'active', 'r1', 'ada@example.invalid', 'Ada');
    insert into accounts values ('grace', 'active', 'r2', 'grace@example.invalid', 'Grace');
    insert into notes (id, author_id, title, body, created_at) values ('a0', 'ada', 'Mine', '', 50);
    insert into notes (id, author_id, title, body, created_at) values ('g1', 'grace', 'Wire', '', 100);
  `)
  return databaseLayer(drizzle({ client: sqlite }))
}

const notes = Notes.ref({})

/** One write as Ada, on a freshly seeded database. */
const checked = (mutation: Parameters<typeof Law.check>[1]['mutation'], input: unknown) =>
  Effect.runPromise(
    Law.check(Data, {
      model: initial,
      holds: [
        { entity: Me, ids: [ME] },
        { entity: Member, ids: ['ada', 'grace'] },
        { entity: Note, ids: ['a0', 'g1'] },
      ],
      lists: [notes],
      mutation,
      input,
      now: NOW,
    }).pipe(
      Effect.provide(
        Remote.clientLayer(RemoteServer.handlers(server, Option.some({ id: 'ada' }))).pipe(
          Layer.provide(seeded()),
        ),
      ),
      Effect.provideService(Clock.Clock, stoppedAt(NOW)),
    ),
  )

describe("the law over the notebook's writes", () => {
  it.each([
    {
      what: 'a new note: its author, its time, her count, and the notebook',
      mutation: AddNote,
      input: { id: 'a1', title: 'First light', body: '' },
      compares: [
        'Note:a1.title',
        'Note:a1.author',
        'Note:a1.createdAt',
        'Member:ada.noteCount',
        notes.identity,
      ],
    },
    {
      what: 'an edit of her note',
      mutation: EditNote,
      input: { id: 'a0', title: 'Still mine', body: 'More' },
      compares: ['Note:a0.title', 'Note:a0.body', notes.identity],
    },
    {
      what: 'her note deleted: gone, and her count one fewer',
      mutation: DeleteNote,
      input: { id: 'a0' },
      compares: ['Note:a0', 'Member:ada.noteCount', notes.identity],
    },
  ])('$what', async ({ mutation, input, compares }) => {
    const report = await checked(mutation, input)
    expect(report.disagreed).toEqual([])
    expect(report.agreed).toEqual(expect.arrayContaining(compares))
  })
})
