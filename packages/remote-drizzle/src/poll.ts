/**
 * Live data where one request cannot wake another's stream, as on Cloudflare
 * Workers: each live stream polls the database from inside its own request,
 * under its own principal. A log of the rows each write touched, kept by
 * triggers (`rowChangeLog`), tells a tick which rows to read again, so a quiet
 * tick is one small query.
 */
import { asc, getTableName, gt, is, max, min } from 'drizzle-orm'
import { integer, sqliteTable, SQLiteTable, text } from 'drizzle-orm/sqlite-core'
import { Duration, Effect, Option, Schedule, Schema, Stream } from 'effect'
import { entityKey, type LiveChange } from 'foldkit-remote'
import { RemoteServerError, type EntitySource, type LiveSource } from 'foldkit-remote-server'
import type { AnyEntityBinding } from './binding.js'
import { idColumn } from './columns.js'
import { DrizzleDatabase } from './database.js'
import { runStatement } from './index.js'
import { quoted } from './quoted.js'

type LivePatch = Schema.Schema.Type<typeof LiveChange>

/** What a log of written rows says: its newest entry, and what changed after an entry. */
export interface RowLog<R = DrizzleDatabase> {
  readonly head: Effect.Effect<number, RemoteServerError, R>
  readonly since: (after: number) => Effect.Effect<
    {
      /** The newest entry read: the next tick asks after it. */
      readonly through: number
      /** The rows written after `after`; none when the log no longer reaches back to it. */
      readonly ids: Option.Option<ReadonlyArray<string>>
    },
    RemoteServerError,
    R
  >
}

/** One row of a list's window. */
export interface ListedEdge {
  readonly entity: string
  readonly id: string
  readonly key: string
}

/**
 * A list a stream diffs, besides the rows it subscribed to: how a row the page
 * has never seen joins it. A stream watches it by subscribing to `watchId`.
 * With a row log, a logged row is listed while the principal can read it and
 * leaves when it cannot: right for a list of every readable row, not for one
 * that filters, which reads its whole window each tick (give no `changes`).
 */
export interface ListWatch<P, R = DrizzleDatabase> {
  /** The connection, as the client keys it (`Query.ref(input).identity`). */
  readonly identity: string
  /** The id a stream subscribes to, to watch this list. */
  readonly watchId: string
  /** What a listed row is drawn with: what a patch of one compares and carries. */
  readonly fields: ReadonlyArray<string>
  /** The list's window, as the principal reads it. */
  readonly edges: (principal: P) => Effect.Effect<ReadonlyArray<ListedEdge>, RemoteServerError, R>
}

const picked = (
  values: Readonly<Record<string, unknown>>,
  fields: ReadonlyArray<string>,
): Record<string, unknown> => {
  const out: Record<string, unknown> = Object.create(null)
  for (const field of fields) out[field] = values[field]
  return out
}

/**
 * A live source that polls from inside the subscriber's own request. Each
 * tick reads the subscribed rows again through the entity's source, under the
 * subscriber's principal, and patches what moved since the last tick: a row
 * absent at one tick and present at the next patches whole, and one present
 * and then gone is deleted. Scalar fields compare by identity; relations are
 * not polled.
 *
 * A stream subscribed to a list's `watchId` also diffs that list: a listed
 * row's change is a patch, a row that joined a patch and then an insert, one
 * that left a delete and then a remove. Its first read is silent; when the
 * stream asked for watch ids alone, it then invalidates the list once, so a
 * page read before the stream was watching asks again.
 *
 * With `changes`, a tick asks the log first and reads only the rows it names:
 * none on a quiet tick. The log is read before the rows, so a write between
 * the two shows on the next tick. A log that fails, or no longer reaches back
 * to the last entry read, reads everything, as with no log.
 */
export const pollLive = <P, R>(
  source: EntitySource<P, R>,
  options: {
    /** How often a stream polls. Default 250 milliseconds. */
    readonly every?: Duration.Input | undefined
    readonly lists?: ReadonlyArray<ListWatch<P, R>> | undefined
    readonly changes?: RowLog<R> | undefined
  } = {},
): LiveSource<P, R> => ({
  entity: source.entity,
  subscribe: ({ requirements, after, principal }) => {
    const ours = requirements.filter(requirement => requirement.entity === source.entity)
    const wanted = new Map<string, Set<string>>()
    for (const requirement of ours) {
      const fields = wanted.get(requirement.id) ?? new Set<string>()
      for (const field of requirement.fields) fields.add(field)
      wanted.set(requirement.id, fields)
    }
    const watched = (options.lists ?? []).filter(list => wanted.has(list.watchId))
    if (wanted.size === 0) return Stream.never
    const watchIds = new Set(watched.map(list => list.watchId))
    // Asked for watch ids alone: a page read before the stream opened may be stale.
    const onlyWatches =
      watched.length > 0 &&
      requirements.every(
        requirement => requirement.entity === source.entity && watchIds.has(requirement.id),
      )
    const { changes } = options
    return Stream.unwrap(
      Effect.gen(function* () {
        let cursor = after
        const next = () => (cursor += 1)
        const read = (ids: ReadonlyArray<string>, fields: ReadonlyArray<string>) =>
          source.read({ ids: [...ids], fields: [...fields], principal })
        // The log entry the rows were last read at; none reads every tick.
        let readAt =
          changes === undefined ? Option.none<number>() : yield* Effect.option(changes.head)
        // What each subscribed row holds when the stream opens: a change that
        // landed before it is already in it, so open the stream before the change.
        const previous = new Map<string, Readonly<Record<string, unknown>>>()
        for (const [id, fields] of wanted) {
          const [record] = yield* read([id], [...fields])
          if (record !== undefined) previous.set(id, record.values)
        }

        /** One watched list's state in this stream. */
        const listings = watched.map(list => ({
          list,
          known: Option.none<Set<string>>(),
          values: new Map<string, Readonly<Record<string, unknown>>>(),
          invalidated: false,
        }))
        type Listing = (typeof listings)[number]

        /** The listed rows of `ids` the principal can read, as edges. */
        const readable = (listing: Listing, ids: ReadonlyArray<string>) =>
          Effect.option(
            Effect.map(
              ids.length === 0 ? Effect.succeed([]) : read(ids, listing.list.fields),
              records => new Map(records.map(record => [record.id, record.values])),
            ),
          )
        /** The list's whole window and the rows in it the principal can read. */
        const window = (listing: Listing) =>
          Effect.gen(function* () {
            const edges = yield* Effect.option(listing.list.edges(principal))
            if (Option.isNone(edges)) return Option.none()
            const rows = yield* readable(
              listing,
              edges.value.map(edge => edge.id),
            )
            return Option.map(rows, rows => ({ edges: edges.value, rows }))
          })
        const seed = (
          listing: Listing,
          loaded: {
            readonly edges: ReadonlyArray<ListedEdge>
            readonly rows: ReadonlyMap<string, Readonly<Record<string, unknown>>>
          },
        ) => {
          const ids = new Set<string>()
          for (const edge of loaded.edges) {
            const values = loaded.rows.get(edge.id)
            if (values === undefined) continue
            ids.add(edge.id)
            listing.values.set(edge.id, values)
          }
          listing.known = Option.some(ids)
        }
        const invalidate = (listing: Listing): ReadonlyArray<LivePatch> => {
          if (!onlyWatches || listing.invalidated) return []
          listing.invalidated = true
          return [
            { _tag: 'ConnectionInvalidate', connection: listing.list.identity, cursor: next() },
          ]
        }

        const opening: Array<LivePatch> = []
        for (const listing of listings) {
          const loaded = yield* window(listing)
          if (Option.isNone(loaded)) continue
          seed(listing, loaded.value)
          opening.push(...invalidate(listing))
        }

        /** The rows the log names since the last tick; none to read every row. */
        const touched = Effect.gen(function* () {
          if (changes === undefined) return Option.none<ReadonlySet<string>>()
          const logged = yield* Option.match(readAt, {
            onNone: () => Effect.succeed(Option.none()),
            onSome: at => Effect.option(changes.since(at)),
          })
          if (Option.isNone(logged)) {
            // Read everything, from the log's head as it is before the reads.
            readAt = yield* Effect.option(changes.head)
            return Option.none<ReadonlySet<string>>()
          }
          readAt = Option.some(logged.value.through)
          return Option.map(logged.value.ids, (ids): ReadonlySet<string> => new Set(ids))
        })

        /** A watched list's patches this tick, after the rows' own. */
        const diff = (
          listing: Listing,
          only: Option.Option<ReadonlySet<string>>,
          // Shared by the tick's lists: a row joining two is patched once.
          patched: Set<string>,
          deleted: ReadonlySet<string>,
        ) =>
          Effect.gen(function* () {
            const { list } = listing
            const fields = list.fields
            // Only the logged rows, once the list is known; else its whole window.
            const logged = Option.isNone(listing.known) ? Option.none() : only
            const loaded = yield* Option.match(logged, {
              onNone: () => window(listing),
              onSome: ids =>
                Effect.map(readable(listing, [...ids]), rows =>
                  Option.map(rows, rows => ({
                    rows,
                    edges: [...rows.keys()].map(id => ({
                      entity: source.entity,
                      id,
                      key: entityKey(source.entity, id),
                    })),
                  })),
                ),
            })
            if (Option.isNone(loaded)) return []
            const { edges, rows } = loaded.value
            if (Option.isNone(listing.known)) {
              seed(listing, loaded.value)
              return invalidate(listing)
            }
            const current = listing.known.value
            const listed = Option.match(logged, {
              onNone: () =>
                new Set(edges.map(edge => edge.id).filter(id => rows.has(id) || current.has(id))),
              // A logged row is listed while the principal can read it.
              onSome: ids => {
                const kept = new Set(current)
                for (const id of ids) {
                  if (rows.has(id)) kept.add(id)
                  else kept.delete(id)
                }
                return kept
              },
            })
            const patches: Array<LivePatch> = []
            for (const id of current) {
              const values = rows.get(id)
              if (!listed.has(id) || values === undefined) continue
              if (patched.has(id)) {
                listing.values.set(id, values)
                continue
              }
              const before = listing.values.get(id)
              const changed = fields.filter(field => before?.[field] !== values[field])
              if (changed.length > 0) {
                patches.push({
                  _tag: 'EntityPatched',
                  entity: source.entity,
                  id,
                  values: picked(values, changed),
                  changed: [...changed],
                  cursor: next(),
                })
              }
              listing.values.set(id, values)
            }
            for (const id of listed) {
              if (current.has(id)) continue
              const values = rows.get(id)
              const edge = edges.find(item => item.id === id)
              // No row to assemble from: leave it unknown, so the next tick tries again.
              if (edge === undefined || values === undefined) {
                listed.delete(id)
                continue
              }
              if (!patched.has(id)) {
                patched.add(id)
                patches.push({
                  _tag: 'EntityPatched',
                  entity: source.entity,
                  id,
                  values: picked(values, fields),
                  changed: [...fields],
                  cursor: next(),
                })
              }
              patches.push({
                _tag: 'ConnectionInsert',
                connection: list.identity,
                position: 'prepend',
                edge: { entity: edge.entity, id: edge.id, key: edge.key },
                cursor: next(),
              })
              listing.values.set(id, values)
            }
            for (const id of current) {
              if (listed.has(id)) continue
              if (!deleted.has(id)) {
                patches.push({ _tag: 'EntityDeleted', entity: source.entity, id, cursor: next() })
              }
              patches.push({
                _tag: 'ConnectionRemove',
                connection: list.identity,
                edge: { entity: source.entity, id, key: entityKey(source.entity, id) },
                cursor: next(),
              })
              listing.values.delete(id)
            }
            listing.known = Option.some(listed)
            return patches
          })

        const tick = Effect.gen(function* () {
          // A quiet tick (the log names nothing) reads no row and no window.
          const only = yield* touched
          const reads = (id: string) =>
            Option.match(only, { onNone: () => true, onSome: ids => ids.has(id) })
          const patches: Array<LivePatch> = []
          const patched = new Set<string>()
          const deleted = new Set<string>()
          for (const [id, fields] of wanted) {
            if (!reads(id)) continue
            const [record] = yield* read([id], [...fields])
            const before = previous.get(id)
            if (record === undefined) {
              if (before !== undefined) {
                previous.delete(id)
                deleted.add(id)
                patches.push({ _tag: 'EntityDeleted', entity: source.entity, id, cursor: next() })
              }
              continue
            }
            const changed = [...fields].filter(field => before?.[field] !== record.values[field])
            if (changed.length === 0) continue
            previous.set(id, record.values)
            patched.add(id)
            patches.push({
              _tag: 'EntityPatched',
              entity: source.entity,
              id,
              values: picked(record.values, changed),
              changed,
              cursor: next(),
            })
          }
          for (const listing of listings) {
            patches.push(...(yield* diff(listing, only, patched, deleted)))
          }
          return patches
        })

        return Stream.concat(
          Stream.fromIterable(opening),
          Stream.fromSchedule(Schedule.spaced(options.every ?? '250 millis')).pipe(
            Stream.flatMap(() => Stream.fromIterableEffect(tick)),
          ),
        )
      }),
    )
  },
})

/** The log table `rowChangeLog` writes for `binding`, and `rowLog` reads. */
const logTableOf = (binding: AnyEntityBinding) => `${getTableName(binding.table)}_row_changes`

/**
 * The SQLite statements (D1's dialect) that keep a log of the rows each write
 * to `binding`'s table touched, in order, for `rowLog` to read: a table, and
 * triggers on insert, update and delete, so every path that writes the table
 * (a declared write, a handler, raw SQL) is logged with no code of its own.
 * The last `keep` entries are kept (default 1000); a stream further behind
 * reads everything. One statement each, for a migration that runs them one
 * at a time. A Postgres table is refused: it has `LISTEN` for this, and a
 * server there can push.
 */
export const rowChangeLog = (
  binding: AnyEntityBinding,
  options: { readonly keep?: number | undefined } = {},
): ReadonlyArray<string> => {
  if (!is(binding.table, SQLiteTable)) {
    throw new Error(
      `[foldkit-remote-drizzle] rowChangeLog: ${binding.name}'s table is not SQLite's; on Postgres a server can push (LISTEN, a live hub)`,
    )
  }
  const keep = options.keep ?? 1000
  if (!Number.isInteger(keep) || keep < 1) {
    throw new Error(`[foldkit-remote-drizzle] rowChangeLog: keep must be a whole number above 0`)
  }
  const table = getTableName(binding.table)
  const log = logTableOf(binding)
  const id = quoted(idColumn(binding).name)
  const trigger = (what: string, row: 'new' | 'old') =>
    `create trigger if not exists ${quoted(`${table}_logged_${what}`)} after ${what} on ${quoted(table)} begin insert into ${quoted(log)} (id) values (${row}.${id}); end;`
  return [
    `create table if not exists ${quoted(log)} (seq integer primary key autoincrement, id text not null);`,
    trigger('insert', 'new'),
    trigger('update', 'new'),
    trigger('delete', 'old'),
    `create trigger if not exists ${quoted(`${log}_trimmed`)} after insert on ${quoted(log)} begin delete from ${quoted(log)} where seq <= new.seq - ${keep}; end;`,
  ]
}

const decodeBounds = Schema.decodeUnknownEffect(
  Schema.Struct({ oldest: Schema.NullOr(Schema.Number), newest: Schema.NullOr(Schema.Number) }),
)
const decodeEntries = Schema.decodeUnknownEffect(
  Schema.Array(Schema.Struct({ seq: Schema.Number, id: Schema.String })),
)

/**
 * The log `rowChangeLog` keeps for `binding`, read through `DrizzleDatabase`,
 * at most `batch` entries a tick (default 500); the rest wait for the next.
 */
export const rowLog = (
  binding: AnyEntityBinding,
  options: { readonly batch?: number | undefined } = {},
): RowLog => {
  const batch = options.batch ?? 500
  const changes = sqliteTable(logTableOf(binding), {
    seq: integer('seq').primaryKey({ autoIncrement: true }),
    id: text('id').notNull(),
  })
  const failed = 'The row log could not be read'
  const unread = () => new RemoteServerError({ message: failed })
  const bounds = Effect.gen(function* () {
    const db = yield* DrizzleDatabase
    const [row] = yield* runStatement(
      () => db.select({ oldest: min(changes.seq), newest: max(changes.seq) }).from(changes),
      failed,
    )
    return yield* decodeBounds(row).pipe(Effect.mapError(unread))
  })
  return {
    head: Effect.map(bounds, ({ newest }) => newest ?? 0),
    since: after =>
      Effect.gen(function* () {
        const db = yield* DrizzleDatabase
        const { oldest, newest } = yield* bounds
        // Trimmed past `after`: the entries after it are gone, so they cannot say.
        if (oldest !== null && after < oldest - 1) {
          return { through: newest ?? after, ids: Option.none() }
        }
        const rows = yield* runStatement(
          () =>
            db
              .select({ seq: changes.seq, id: changes.id })
              .from(changes)
              .where(gt(changes.seq, after))
              .orderBy(asc(changes.seq))
              .limit(batch),
          failed,
        )
        const entries = yield* decodeEntries(rows).pipe(Effect.mapError(unread))
        return {
          through: entries.at(-1)?.seq ?? after,
          ids: Option.some(entries.map(entry => entry.id)),
        }
      }),
  }
}
