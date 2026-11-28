import { DatabaseSync } from 'node:sqlite'
import { Effect, Layer, Option, Schema } from 'effect'
import {
  DispatchConflict,
  JournalFailure,
  RevisionConflict,
  TransactionConflict,
  checkTransaction,
  isSameDispatch,
  journalContext,
  receiptFor,
  sameTransaction,
  transactionReceipt,
  wireCommit,
  wireSnapshot,
  type AtomicJournalStore,
  type TransactionFailure,
  type WireCommit,
} from './journal.js'

const readCommit = Schema.decodeUnknownSync(Schema.fromJsonString(wireCommit), {
  onExcessProperty: 'error',
})
const readSnapshot = Schema.decodeUnknownSync(Schema.fromJsonString(wireSnapshot), {
  onExcessProperty: 'error',
})
const writeCommit = Schema.encodeSync(Schema.fromJsonString(wireCommit))
const writeSnapshot = Schema.encodeSync(Schema.fromJsonString(wireSnapshot))
const readReceipt = Schema.decodeUnknownSync(Schema.fromJsonString(transactionReceipt), {
  onExcessProperty: 'error',
})
const writeReceipt = Schema.encodeSync(Schema.fromJsonString(transactionReceipt))

const attempt = <A>(operation: string, work: () => A) =>
  Effect.try({ try: work, catch: cause => new JournalFailure({ operation, cause }) })

const writeFailure = (operation: string, cause: unknown): TransactionFailure =>
  cause instanceof DispatchConflict ||
  cause instanceof RevisionConflict ||
  cause instanceof TransactionConflict
    ? cause
    : new JournalFailure({ operation, cause })

const make = (db: DatabaseSync): AtomicJournalStore => {
  db.exec(`
    PRAGMA busy_timeout = 5000;
    CREATE TABLE IF NOT EXISTS successor_commits (
      stream TEXT NOT NULL,
      revision INTEGER NOT NULL,
      dispatch TEXT NOT NULL,
      record TEXT NOT NULL,
      PRIMARY KEY (stream, revision),
      UNIQUE (stream, dispatch)
    ) STRICT;
    CREATE TABLE IF NOT EXISTS successor_snapshots (
      stream TEXT PRIMARY KEY,
      revision INTEGER NOT NULL,
      record TEXT NOT NULL
    ) STRICT;
    CREATE TABLE IF NOT EXISTS successor_transactions (
      id TEXT PRIMARY KEY,
      receipt TEXT NOT NULL
    ) STRICT;
  `)
  const lookup = db.prepare(
    'SELECT record FROM successor_commits WHERE stream = ? AND dispatch = ?',
  )
  const latest = db.prepare(
    'SELECT max(revision) AS revision FROM successor_commits WHERE stream = ?',
  )
  const history = db.prepare(
    'SELECT revision, record FROM successor_commits WHERE stream = ? AND revision > ? ORDER BY revision',
  )
  const snapshot = db.prepare('SELECT revision, record FROM successor_snapshots WHERE stream = ?')
  const insert = db.prepare(
    'INSERT INTO successor_commits (stream, revision, dispatch, record) VALUES (?, ?, ?, ?)',
  )
  const save = db.prepare(`
    INSERT INTO successor_snapshots (stream, revision, record) VALUES (?, ?, ?)
    ON CONFLICT (stream) DO UPDATE SET revision = excluded.revision, record = excluded.record
    WHERE excluded.revision >= successor_snapshots.revision
  `)
  const lookupReceipt = db.prepare('SELECT receipt FROM successor_transactions WHERE id = ?')
  const insertReceipt = db.prepare('INSERT INTO successor_transactions (id, receipt) VALUES (?, ?)')

  const transaction = <A>(begin: 'BEGIN' | 'BEGIN IMMEDIATE', work: () => A): A => {
    db.exec(begin)
    try {
      const value = work()
      db.exec('COMMIT')
      return value
    } catch (error) {
      db.exec('ROLLBACK')
      throw error
    }
  }
  const revision = (stream: string) => Number(latest.get(stream)?.revision ?? 0)
  const find = (stream: string, id: string) =>
    Option.map(Option.fromUndefinedOr(lookup.get(stream, id)), row => readCommit(row.record))
  const findTransaction = (id: string) =>
    Option.map(Option.fromUndefinedOr(lookupReceipt.get(id)), row => readReceipt(row.receipt))
  const appendNew = (stream: string, expected: number, commit: WireCommit) => {
    const actual = revision(stream)
    if (actual !== expected) throw new RevisionConflict({ expected, actual })
    if (commit.revision !== expected + 1) throw new Error('Invalid commit revision')
    insert.run(stream, commit.revision, commit.dispatchId, writeCommit(commit))
  }

  return {
    capabilities: {
      name: 'successor SQLite journal',
      isolation: 'serializable',
      isolates: 'transaction',
      parentRowLock: true,
    },
    read: (stream, from = 'checkpoint') =>
      attempt('read', () =>
        transaction('BEGIN', () => {
          const saved = from === 'checkpoint' ? snapshot.get(stream) : undefined
          const checkpoint = Option.map(Option.fromUndefinedOr(saved), entry => {
            const decoded = readSnapshot(entry.record)
            if (decoded.revision !== entry.revision) throw new Error('Snapshot revision mismatch')
            return decoded
          })
          const commits = history.all(stream, saved?.revision ?? 0).map(entry => {
            const decoded = readCommit(entry.record)
            if (decoded.revision !== entry.revision) throw new Error('Commit revision mismatch')
            return decoded
          })
          return { snapshot: checkpoint, commits }
        }),
      ),
    find: (stream, id) => attempt('find', () => find(stream, id)),
    append: (stream, expected, commit) =>
      Effect.try({
        try: () =>
          transaction('BEGIN IMMEDIATE', () => {
            const previous = find(stream, commit.dispatchId)
            if (Option.isSome(previous)) {
              if (!isSameDispatch(previous.value, commit.input)) {
                throw new DispatchConflict({ dispatchId: commit.dispatchId })
              }
              return previous.value
            }
            appendNew(stream, expected, commit)
            return commit
          }),
        catch: cause =>
          cause instanceof DispatchConflict || cause instanceof RevisionConflict
            ? cause
            : new JournalFailure({ operation: 'append', cause }),
      }),
    findTransaction: id => attempt('read transaction', () => findTransaction(id)),
    appendTransaction: (id, entries) =>
      Effect.flatMap(checkTransaction(id, entries), decoded =>
        Effect.try({
          try: () =>
            transaction('BEGIN IMMEDIATE', () => {
              const previous = findTransaction(id)
              if (Option.isSome(previous)) {
                const identities = decoded.map(({ stream, commit }) => ({ ...commit, stream }))
                if (!sameTransaction(previous.value, identities)) {
                  throw new TransactionConflict({ transactionId: id })
                }
                return previous.value
              }
              for (const { stream, commit, expectedRevision } of decoded) {
                if (Option.isSome(find(stream, commit.dispatchId))) {
                  throw new DispatchConflict({ dispatchId: commit.dispatchId })
                }
                appendNew(stream, expectedRevision, commit)
              }
              const receipt = receiptFor(decoded)
              insertReceipt.run(id, writeReceipt(receipt))
              return receipt
            }),
          catch: cause => writeFailure('append transaction', cause),
        }),
      ),
    saveSnapshot: (stream, checkpoint) =>
      attempt('checkpoint', () =>
        transaction('BEGIN IMMEDIATE', () => {
          if (checkpoint.revision > revision(stream))
            throw new Error('Snapshot is ahead of history')
          save.run(stream, checkpoint.revision, writeSnapshot(checkpoint))
        }),
      ),
  }
}

/** A scoped SQLite host that records one complete batch per stream revision. */
export const sqliteLayer = (file: string) =>
  Layer.effectContext(
    Effect.gen(function* () {
      const db = yield* Effect.acquireRelease(
        attempt('open', () => new DatabaseSync(file)),
        connection => Effect.sync(() => connection.close()),
      )
      return journalContext(yield* attempt('initialize', () => make(db)))
    }),
  )
