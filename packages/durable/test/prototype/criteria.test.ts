/**
 * The acceptance criteria of `effect-reuse-sync-durable-DESIGN.md` §14.1, run
 * against the journal and against the EventLog-storage prototype alike, so a
 * criterion the prototype meets is shown to be one the journal meets too.
 */
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import * as SqliteClient from '@effect/sql-sqlite-node/SqliteClient'
import { Effect, Exit, Fiber, Layer, Option, Ref, Stream, type Scope } from 'effect'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import {
  actorId,
  cursor,
  documentId,
  makeJournal,
  opId,
  type Codec,
  type Cursor,
  type DocumentId,
} from '../../src/index.js'
import type { AppendResult, Committed } from '../../src/journal.js'
import { makePrototype } from './eventLogJournal.js'

interface Operation {
  readonly opId: string
  readonly id: string
}

interface Snapshot {
  readonly ids: ReadonlyArray<string>
}

const operation: Codec<Operation> = {
  encode: value => value,
  decode: value => {
    const { opId, id } = value as Record<string, unknown>
    if (typeof opId !== 'string' || typeof id !== 'string') throw new Error('invalid operation')
    // Kept as sent, key order included, so only canonical encoding can equate a reordering.
    return value as Operation
  },
}

/** Refuses to encode a snapshot holding `poison`, after the operation is written. */
const snapshot: Codec<Snapshot> = {
  encode: value => {
    if (value.ids.includes('poison')) throw new Error('unencodable snapshot')
    return value
  },
  decode: value => ({ ids: (value as Snapshot).ids.map(String) }),
}

const options = {
  operation,
  snapshot,
  empty: (): Snapshot => ({ ids: [] }),
  reduce: (state: Snapshot, op: Operation): Snapshot => ({ ids: [...state.ids, op.id] }),
  opId: (op: Operation) => opId(op.opId),
}

/** What the criteria read of a journal, whichever stores it. */
interface Subject {
  readonly append: (
    key: DocumentId,
    input: unknown,
    actor: string,
  ) => Effect.Effect<AppendResult<Operation>, unknown>
  readonly load: (
    key: DocumentId,
  ) => Effect.Effect<{ readonly snapshot: Snapshot; readonly cursor: Cursor }, unknown>
  readonly read: (
    key: DocumentId,
    after: Cursor,
  ) => Effect.Effect<ReadonlyArray<Committed<Operation>>, unknown>
  readonly compact: (key: DocumentId, through: number) => Effect.Effect<void, unknown>
  readonly changes: (key: DocumentId, after: Cursor) => Stream.Stream<Committed<Operation>, unknown>
}

type Open = (file: string) => Effect.Effect<Subject, unknown, Scope.Scope>

const journal: Open = file =>
  Effect.gen(function* () {
    const opened = yield* makeJournal({
      file,
      ...options,
      actorId: (principal: { readonly actor: string }) => actorId(principal.actor),
    })
    return {
      append: (key, input, actor) => opened.append(key, input, { actor }),
      load: opened.load,
      read: (key, after) => opened.read(key, after),
      compact: (key, through) => opened.compact(key, through as never),
      // The journal announces keys; a subscriber reads what follows its cursor on each.
      changes: (key, after) =>
        Stream.unwrap(
          Effect.gen(function* () {
            const last = yield* Ref.make(after)
            const next = Ref.get(last).pipe(
              Effect.flatMap(from => opened.read(key, from)),
              Effect.tap(found =>
                found.length === 0 ? Effect.void : Ref.set(last, cursor(found.at(-1)!.sequence)),
              ),
            )
            return Stream.concat(
              Stream.make(key),
              opened.subscribe.pipe(Stream.filter(changed => changed === key)),
            ).pipe(
              Stream.mapEffect(() => next),
              Stream.flatMap(found => Stream.fromIterable(found)),
            )
          }),
        ),
    } satisfies Subject
  })

const prototype: Open = file =>
  Effect.gen(function* () {
    const context = yield* Layer.build(SqliteClient.layer({ filename: file }))
    return yield* makePrototype(options).pipe(Effect.provide(context))
  })

let directory = ''
let files = 0
beforeAll(async () => {
  directory = await mkdtemp(join(tmpdir(), 'durable-criteria-'))
})
afterAll(() => rm(directory, { recursive: true, force: true }))
const freshFile = () => join(directory, `${files++}.db`)

const todos = documentId('todos')
const add = (n: number, id = `item-${n}`) => ({ opId: `op-${n}`, id })
const ids = (found: ReadonlyArray<Committed<Operation>>) => found.map(entry => entry.operation.id)
const sequences = (found: ReadonlyArray<Committed<Operation>>) => found.map(entry => entry.sequence)

const run = <A>(
  open: Open,
  body: (subject: Subject, file: string) => Effect.Effect<A, unknown, Scope.Scope>,
  file = freshFile(),
) => Effect.runPromise(Effect.scoped(Effect.flatMap(open(file), subject => body(subject, file))))

const failure = <A, E, R>(effect: Effect.Effect<A, E, R>) =>
  Effect.exit(effect).pipe(
    Effect.map(exit =>
      Exit.isFailure(exit) ? Option.getOrUndefined(Exit.findErrorOption(exit)) : undefined,
    ),
  )

describe.each([
  ['the SQL journal', journal],
  ['the EventLog-storage prototype', prototype],
] as const)('%s', (_name, open) => {
  it('acknowledges a retry of the same opId, payload and actor idempotently', () =>
    run(open, subject =>
      Effect.gen(function* () {
        const first = yield* subject.append(todos, add(1), 'ann')
        // Same operation, keys in another order.
        const retry = yield* subject.append(todos, { id: 'item-1', opId: 'op-1' }, 'ann')
        expect(first._tag).toBe('Committed')
        expect(retry).toEqual(first)
        expect((yield* subject.load(todos)).cursor).toBe(1)
      }),
    ))

  it('refuses the same opId with a different payload or actor as an identity conflict', () =>
    run(open, subject =>
      Effect.gen(function* () {
        yield* subject.append(todos, add(1), 'ann')
        const payload = yield* failure(subject.append(todos, add(1, 'other'), 'ann'))
        const actor = yield* failure(subject.append(todos, add(1), 'bob'))
        expect(payload).toMatchObject({ _tag: 'IdentityConflictError' })
        expect(actor).toMatchObject({ _tag: 'IdentityConflictError' })
        expect((yield* subject.load(todos)).cursor).toBe(1)
      }),
    ))

  it('gives concurrent appends a gap-free sequence', () =>
    run(open, subject =>
      Effect.gen(function* () {
        yield* Effect.forEach(
          Array.from({ length: 40 }, (_, n) => n + 1),
          n => subject.append(todos, add(n), 'ann'),
          { concurrency: 'unbounded', discard: true },
        )
        const found = yield* subject.read(todos, cursor(0))
        expect(sequences(found)).toEqual(Array.from({ length: 40 }, (_, n) => n + 1))
        expect(new Set(ids(found)).size).toBe(40)
        expect((yield* subject.load(todos)).cursor).toBe(40)
      }),
    ))

  it('commits the operation, snapshot and cursor together or not at all', () =>
    run(open, subject =>
      Effect.gen(function* () {
        const refused = yield* failure(subject.append(todos, add(1, 'poison'), 'ann'))
        expect(refused).toMatchObject({ _tag: 'InvalidOperationError' })
        expect(yield* subject.load(todos)).toEqual({ snapshot: { ids: [] }, cursor: 0 })
        expect(yield* subject.read(todos, cursor(0))).toEqual([])
        // The rolled-back opId was never taken: a different payload under it commits.
        const next = yield* subject.append(todos, add(1), 'ann')
        expect(next).toMatchObject({ _tag: 'Committed', committed: { sequence: 1 } })
        expect(yield* subject.load(todos)).toEqual({ snapshot: { ids: ['item-1'] }, cursor: 1 })
      }),
    ))

  it('keeps the snapshot and history across a restart', async () => {
    const file = freshFile()
    await run(
      open,
      subject =>
        Effect.forEach([1, 2, 3], n => subject.append(todos, add(n), 'ann'), { discard: true }),
      file,
    )
    await run(
      open,
      subject =>
        Effect.gen(function* () {
          expect(yield* subject.load(todos)).toEqual({
            snapshot: { ids: ['item-1', 'item-2', 'item-3'] },
            cursor: 3,
          })
          expect(ids(yield* subject.read(todos, cursor(0)))).toEqual(['item-1', 'item-2', 'item-3'])
          const retry = yield* subject.append(todos, add(2), 'ann')
          expect(retry).toMatchObject({ _tag: 'Committed', committed: { sequence: 2 } })
          expect(yield* failure(subject.append(todos, add(2), 'bob'))).toMatchObject({
            _tag: 'IdentityConflictError',
          })
        }),
      file,
    )
  })

  it('streams committed operations in sequence order, backlog then live', () =>
    run(open, subject =>
      Effect.gen(function* () {
        yield* subject.append(todos, add(1), 'ann')
        yield* subject.append(todos, add(2), 'ann')
        const seen = yield* Ref.make(0)
        const consumer = yield* subject.changes(todos, cursor(0)).pipe(
          Stream.tap(() => Ref.update(seen, n => n + 1)),
          Stream.take(6),
          Stream.runCollect,
          Effect.forkChild,
        )
        // Wait for the backlog, then let the subscription open.
        while ((yield* Ref.get(seen)) < 2) yield* Effect.yieldNow
        for (let n = 0; n < 100; n++) yield* Effect.yieldNow
        yield* Effect.forEach([3, 4, 5, 6], n => subject.append(todos, add(n), 'ann'), {
          concurrency: 'unbounded',
          discard: true,
        })
        const streamed = yield* Fiber.join(consumer)
        expect(sequences(streamed)).toEqual([1, 2, 3, 4, 5, 6])
        expect(streamed).toEqual(yield* subject.read(todos, cursor(0)))
      }),
    ))

  it('keeps checkpoint semantics through compaction', async () => {
    const file = freshFile()
    await run(
      open,
      subject =>
        Effect.gen(function* () {
          yield* Effect.forEach([1, 2, 3, 4], n => subject.append(todos, add(n), 'ann'), {
            discard: true,
          })
          const before = yield* subject.load(todos)
          yield* subject.compact(todos, 2)
          expect(yield* subject.load(todos)).toEqual(before)
          expect(yield* failure(subject.read(todos, cursor(0)))).toMatchObject({
            _tag: 'CompactedCursorError',
          })
          expect(yield* failure(Stream.runHead(subject.changes(todos, cursor(1))))).toMatchObject({
            _tag: 'CompactedCursorError',
          })
          expect(sequences(yield* subject.read(todos, cursor(2)))).toEqual([3, 4])
          // A compacted identity still answers a retry, and still refuses a reuse.
          expect(yield* subject.append(todos, add(1), 'ann')).toEqual({
            _tag: 'AlreadyCommitted',
            opId: 'op-1',
            sequence: 1,
            actorId: 'ann',
          })
          expect(yield* failure(subject.append(todos, add(1, 'other'), 'ann'))).toMatchObject({
            _tag: 'IdentityConflictError',
          })
          expect(yield* failure(subject.compact(todos, 1))).toMatchObject({
            _tag: 'InvalidCompactionError',
          })
        }),
      file,
    )
    await run(
      open,
      subject =>
        Effect.gen(function* () {
          expect((yield* subject.load(todos)).snapshot.ids).toEqual([
            'item-1',
            'item-2',
            'item-3',
            'item-4',
          ])
          expect(yield* failure(subject.read(todos, cursor(1)))).toMatchObject({
            _tag: 'CompactedCursorError',
          })
        }),
      file,
    )
  })
})

it('keeps the effect ledger beside EventLog storage in one database, across a restart', async () => {
  const file = freshFile()
  const runs = await Effect.runPromise(Ref.make(0))
  const ledger = (
    body: (
      journal: Effect.Success<
        ReturnType<typeof makeJournal<Operation, Snapshot, { readonly actor: string }>>
      >,
    ) => Effect.Effect<void, unknown>,
  ) =>
    Effect.runPromise(
      Effect.scoped(
        Effect.gen(function* () {
          const events = yield* prototype(file)
          const opened = yield* makeJournal({
            file,
            ...options,
            actorId: (principal: { readonly actor: string }) => actorId(principal.actor),
          })
          yield* events.append(todos, add(1), 'ann').pipe(Effect.ignore)
          yield* body(opened)
        }),
      ),
    )
  await ledger(opened =>
    Effect.gen(function* () {
      expect(
        yield* opened.runEffect(
          'mail:op-1',
          Ref.updateAndGet(runs, n => n + 1),
        ),
      ).toBe(1)
    }),
  )
  await ledger(opened =>
    Effect.gen(function* () {
      expect(
        yield* opened.runEffect(
          'mail:op-1',
          Ref.updateAndGet(runs, n => n + 1),
        ),
      ).toBe(1)
      expect(yield* opened.effect('mail:op-1')).toEqual(
        Option.some({ key: 'mail:op-1', status: 'succeeded', result: 1 }),
      )
      expect(yield* opened.unfinished()).toEqual([])
    }),
  )
  expect(await Effect.runPromise(Ref.get(runs))).toBe(1)
})
