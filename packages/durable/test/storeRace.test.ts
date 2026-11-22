// @vitest-environment node
/**
 * The journal over SQLite declares `serializable`: appends sent at once commit
 * as if one at a time. A law on the document (at most `CAP` notes) is judged
 * over the snapshot each append lands on, so a race that let two appends read
 * the same snapshot would commit more than `CAP`, or fail some on the
 * sequence's uniqueness. One connection only: `node:sqlite` is synchronous, so
 * a second connection in this thread would wait on a lock its own thread holds;
 * two processes on one file are not tried here.
 */
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Effect, Schema } from 'effect'
import { describe, expect, it } from 'vitest'
import { actorId, cursor, documentId, makeJournal, opId } from '../src/index.js'

const Note = Schema.Struct({ opId: Schema.String, title: Schema.String })
type Note = typeof Note.Type

const CAP = 3
const APPENDS = 12
const key = documentId('d')
const note = (n: number): Note => ({ opId: `n:${n}`, title: `note ${n}` })

const open = (file: string) =>
  makeJournal<Note, ReadonlyArray<Note>, string>({
    file,
    operation: Note,
    snapshot: Schema.Array(Note),
    empty: () => [],
    reduce: (state, value) => [...state, value],
    opId: value => opId(value.opId),
    actorId: principal => actorId(principal),
    // The driver is synchronous, so appends only overlap where a decision suspends.
    authorize: () => Effect.as(Effect.sleep('1 millis'), true),
    judge: ({ after }) =>
      after.length <= CAP || { rule: 'capped', message: `At most ${CAP} notes`, path: [] },
  })

/** A fresh directory for one test's database file, removed after. */
const inFile = async (body: (file: string) => Promise<void>) => {
  const directory = await mkdtemp(join(tmpdir(), 'foldkit-store-race-'))
  try {
    await body(join(directory, 'journal.sqlite'))
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
}

describe('a journal over SQLite, declared serializable', () => {
  it('says so', () =>
    inFile(file =>
      Effect.runPromise(
        Effect.scoped(
          Effect.gen(function* () {
            expect((yield* open(file)).store).toEqual({
              name: 'SQLite journal',
              isolation: 'serializable',
              isolates: 'transaction',
              parentRowLock: false,
            })
          }),
        ),
      ),
    ))

  it('commits appends sent at once through one connection as if one at a time', () =>
    inFile(file =>
      Effect.runPromise(
        Effect.scoped(
          Effect.gen(function* () {
            const journal = yield* open(file)
            const answers = yield* Effect.forEach(
              Array.from({ length: APPENDS }, (_, n) => n + 1),
              n => Effect.result(journal.append(key, note(n), 'ada')),
              { concurrency: 'unbounded' },
            )
            expect(answers.filter(answer => answer._tag === 'Success')).toHaveLength(CAP)
            const committed = yield* journal.read(key, cursor(0))
            expect(committed.map(entry => entry.sequence)).toEqual([1, 2, 3])
          }),
        ),
      ),
    ))
})
