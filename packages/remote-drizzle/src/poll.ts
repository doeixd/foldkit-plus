/**
 * Live data where one request cannot wake another's stream, as on Cloudflare
 * Workers: each live stream polls the database from inside its own request,
 * under its own principal. A log of the rows each write touched, kept by
 * triggers (`rowChangeLog`), tells a tick which rows to read again, so a quiet
 * tick is one small query.
 */
import { asc, getTableName, gt, is, max } from 'drizzle-orm'
import { integer, sqliteTable, SQLiteTable, text } from 'drizzle-orm/sqlite-core'
import { Duration, Effect, Equal, Option, Schedule, Schema, Stream } from 'effect'
import { entityKey, type LiveChange } from 'foldkit-remote'
import {
  RemoteServer,
  RemoteServerError,
  type EntitySource,
  type LiveQuery,
  type LiveSource,
} from 'foldkit-remote-server'
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
type ListedEdge = Effect.Success<LiveQuery['edges']>[number]

/**
 * What a listed row is diffed by: the fields its read selects, less a paged
 * relation, which is not polled.
 */
const listedFields = ({ select }: LiveQuery<unknown>): ReadonlyArray<string> =>
  select.fields.filter(field => !Object.hasOwn(select.windows ?? {}, field))

/** The fields of `fields` a read returned: one the principal may not read is left out. */
const heldOf = (
  values: Readonly<Record<string, unknown>>,
  fields: ReadonlyArray<string>,
): Array<string> => fields.filter(field => Object.hasOwn(values, field))

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
 * tick reads the subscribed rows again through the entity's source as a read
 * answers the subscriber (`RemoteServer.readAs`: its `authorize` and `filter`
 * applied, so a member it may not read is never sent), and patches what moved
 * since the last tick: a row absent at one tick and present at the next
 * patches whole, and one present and then gone, or no longer visible to the
 * subscriber, is deleted. A field compares by what it holds (`Equal.equals`),
 * since a read makes a new value of a relation's refs or a date every time,
 * and comparing by identity would patch it on every tick. It names `source` as the one it `reads`, so `GuardServer.validate`
 * accepts it over the guarded source it checks.
 *
 * A stream also diffs each list its subscriber reads live
 * (`Data.query(…, { live: true })`, admitted and run by `handlers` as the
 * subscriber reads it): a listed row's change is a patch, a row that joined a
 * patch and then an insert, one that left a delete and then a remove, each by
 * the fields the read selects. Its first read is silent, and then invalidates
 * the list once, so a page read before the stream opened (or while it was
 * down) asks again. A list's window is run again each tick that may have moved
 * it (every tick without a log, a tick the log names a row of the entity with
 * one), so a row joins by the query's own filter and window. A row that leaves
 * it and is still there to the principal is only removed from the list; one
 * gone, or no longer readable, is deleted too.
 *
 * With `changes`, a tick asks the log first and reads only the rows it names:
 * none on a quiet tick. The log is read before the rows, so a write between
 * the two shows on the next tick. A log that fails, or no longer reaches back
 * to the last entry read, reads everything, as with no log. A list whose read
 * fails is asked again from the same entry on the next tick; a subscribed
 * row's failed read fails the stream, and the client's reconnect reads again.
 * The subscribed rows are read in one read a tick, of every field any of them
 * asks the principal may read; `RemoteServer.handlers` admits no more of them
 * than its `maxIdsPerEntity`.
 */
export const pollLive = <P, R>(
  source: EntitySource<P, R>,
  options: {
    /** How often a stream polls. Default 250 milliseconds. */
    readonly every?: Duration.Input | undefined
    readonly changes?: RowLog<R> | undefined
  } = {},
): LiveSource<P, R> => ({
  entity: source.entity,
  reads: source,
  subscribe: ({ requirements, queries, after, principal, viewer }) => {
    const ours = requirements.filter(requirement => requirement.entity === source.entity)
    const wanted = new Map<string, Set<string>>()
    for (const requirement of ours) {
      const fields = wanted.get(requirement.id) ?? new Set<string>()
      for (const field of requirement.fields) fields.add(field)
      wanted.set(requirement.id, fields)
    }
    const watched = queries.filter(query => query.select.entity === source.entity)
    if (wanted.size === 0 && watched.length === 0) return Stream.never
    // Each subscribed row by the fields asked of it that the principal may read,
    // in the order asked: a patch's `changed` keeps it. A row it may read none
    // of is never read, so it is not told apart from a gone one.
    const asked = new Map<string, ReadonlyArray<string>>()
    for (const [id, fields] of wanted) {
      const allowed = RemoteServer.allowedFields(source, principal, [...fields])
      if (allowed.length > 0) asked.set(id, allowed)
    }
    // Read together, so a tick is one read however the subscriber spreads its
    // fields over its rows: asking each row for fields of its own would make it one a row.
    const fields = [...new Set([...asked.values()].flat())]
    const { changes } = options
    return Stream.unwrap(
      Effect.gen(function* () {
        let cursor = after
        const next = () => (cursor += 1)
        // As a read answers this principal: none when it may read none of the fields.
        const read = (ids: ReadonlyArray<string>, fields: ReadonlyArray<string>) =>
          RemoteServer.readAs(source, { ids: [...ids], fields: [...fields], principal, viewer })
        // The log entry the rows were last read at; none reads every tick.
        let readAt =
          changes === undefined ? Option.none<number>() : yield* Effect.option(changes.head)
        // What each subscribed row holds when the stream opens: a change that
        // landed before it is already in it, so open the stream before the change.
        const previous = new Map<string, Readonly<Record<string, unknown>>>()
        if (asked.size > 0) {
          const records = yield* read([...asked.keys()], fields)
          for (const record of Option.getOrElse(records, () => [])) {
            previous.set(record.id, record.values)
          }
        }

        /** One watched list's state in this stream. */
        const listings = watched.map(list => ({
          list,
          fields: listedFields(list),
          known: Option.none<Set<string>>(),
          values: new Map<string, Readonly<Record<string, unknown>>>(),
          invalidated: false,
        }))
        type Listing = (typeof listings)[number]

        /** The listed rows of `ids` the principal can read, as edges. */
        const readable = (listing: Listing, ids: ReadonlyArray<string>) =>
          Effect.option(
            Effect.map(
              ids.length === 0 ? Effect.succeed(Option.none()) : read(ids, listing.fields),
              records =>
                new Map(
                  Option.getOrElse(records, () => []).map(record => [record.id, record.values]),
                ),
            ),
          )
        /** The list's whole window and the rows in it the principal can read. */
        const window = (listing: Listing) =>
          Effect.gen(function* () {
            const edges = yield* Effect.option(listing.list.edges)
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
          if (listing.invalidated) return []
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

        /** A watched list's patches this tick, after the rows' own; none when its read failed. */
        const diff = (
          listing: Listing,
          only: Option.Option<ReadonlySet<string>>,
          // The fields of each row sent this tick, shared by the tick's lists:
          // a field is sent once however many of them select it.
          sent: Map<string, Set<string>>,
          deleted: ReadonlySet<string>,
        ) =>
          Effect.gen(function* () {
            const { list, fields } = listing
            if (Option.isNone(listing.known)) {
              const loaded = yield* window(listing)
              if (Option.isNone(loaded)) return Option.none<ReadonlyArray<LivePatch>>()
              seed(listing, loaded.value)
              return Option.some(invalidate(listing))
            }
            // A tick the log names no row of this entity in moved nothing listed.
            if (Option.isSome(only) && only.value.size === 0) return Option.some([])
            // The window is run again, so what joins is judged by the query's own
            // filter and window, not by being readable.
            const edges = yield* Effect.option(list.edges)
            if (Option.isNone(edges)) return Option.none<ReadonlyArray<LivePatch>>()
            const current = listing.known.value
            const edgeOf = new Map(edges.value.map(edge => [edge.id, edge]))
            const stale = (id: string) =>
              Option.match(only, { onNone: () => true, onSome: ids => ids.has(id) })
            // What joins, what was written, and what leaves: a row leaving is read
            // too, so one still there is told from one gone.
            const rows = yield* readable(listing, [
              ...[...edgeOf.keys()].filter(id => !current.has(id) || stale(id)),
              ...[...current].filter(id => !edgeOf.has(id)),
            ])
            if (Option.isNone(rows)) return Option.none<ReadonlyArray<LivePatch>>()
            const patches: Array<LivePatch> = []
            const patch = (id: string, values: Readonly<Record<string, unknown>>) => {
              const before = listing.values.get(id)
              listing.values.set(id, values)
              const already = sent.get(id) ?? new Set<string>()
              const changed = heldOf(values, fields).filter(
                field => !already.has(field) && !Equal.equals(before?.[field], values[field]),
              )
              if (changed.length === 0) return
              for (const field of changed) already.add(field)
              sent.set(id, already)
              patches.push({
                _tag: 'EntityPatched',
                entity: source.entity,
                id,
                values: picked(values, changed),
                changed,
                cursor: next(),
              })
            }
            const listed = new Set<string>()
            for (const [id, edge] of edgeOf) {
              if (current.has(id) && !stale(id)) {
                listed.add(id)
                continue
              }
              const values = rows.value.get(id)
              // One the principal cannot read is not listed to them.
              if (values === undefined) continue
              listed.add(id)
              patch(id, values)
              if (current.has(id)) continue
              patches.push({
                _tag: 'ConnectionInsert',
                connection: list.identity,
                position: 'prepend',
                edge: { entity: edge.entity, id: edge.id, key: edge.key },
                cursor: next(),
              })
            }
            for (const id of current) {
              if (listed.has(id)) continue
              const values = rows.value.get(id)
              // Still there to the principal: it left the list, not the store.
              if (values !== undefined) patch(id, values)
              else if (!deleted.has(id)) {
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
            return Option.some(patches)
          })

        const tick = Effect.gen(function* () {
          const from = readAt
          // A quiet tick (the log names nothing) reads no row and no window.
          const only = yield* touched
          const reads = (id: string) =>
            Option.match(only, { onNone: () => true, onSome: ids => ids.has(id) })
          const patches: Array<LivePatch> = []
          const sent = new Map<string, Set<string>>()
          const deleted = new Set<string>()
          const ids = [...asked.keys()].filter(reads)
          const answered = ids.length === 0 ? Option.none() : yield* read(ids, fields)
          if (Option.isSome(answered)) {
            const records = new Map(answered.value.map(record => [record.id, record.values]))
            for (const [id, own] of asked) {
              if (!reads(id)) continue
              const values = records.get(id)
              const before = previous.get(id)
              if (values === undefined) {
                if (before !== undefined) {
                  previous.delete(id)
                  deleted.add(id)
                  patches.push({ _tag: 'EntityDeleted', entity: source.entity, id, cursor: next() })
                }
                continue
              }
              const changed = heldOf(values, own).filter(
                field => !Equal.equals(before?.[field], values[field]),
              )
              if (changed.length === 0) continue
              previous.set(id, values)
              sent.set(id, new Set(changed))
              patches.push({
                _tag: 'EntityPatched',
                entity: source.entity,
                id,
                values: picked(values, changed),
                changed,
                cursor: next(),
              })
            }
          }
          for (const listing of listings) {
            const listed = yield* diff(listing, only, sent, deleted)
            // A list that could not be read still owes this tick's rows: the next
            // tick asks the log from where this one did, and diffing them again
            // against what the stream holds sends only what it has not seen.
            if (Option.isNone(listed)) readAt = from
            else patches.push(...listed.value)
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

const decodeHead = Schema.decodeUnknownEffect(
  Schema.Struct({ newest: Schema.NullOr(Schema.Number) }),
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
  const head = Effect.gen(function* () {
    const db = yield* DrizzleDatabase
    const [row] = yield* runStatement(
      () => db.select({ newest: max(changes.seq) }).from(changes),
      failed,
    )
    return yield* decodeHead(row).pipe(
      Effect.map(({ newest }) => newest ?? 0),
      Effect.mapError(unread),
    )
  })
  return {
    head,
    since: after =>
      Effect.gen(function* () {
        const db = yield* DrizzleDatabase
        // One statement, so a trim cannot land between reading the log's
        // reach and its entries.
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
        const first = entries[0]
        // Only the trim deletes, oldest first, so a first entry past `after + 1`
        // means some after `after` are gone. A gap with another cause would
        // only make the stream read everything once.
        const trimmed = first !== undefined && first.seq > after + 1
        return {
          through: entries.at(-1)?.seq ?? after,
          ids: trimmed ? Option.none() : Option.some(entries.map(entry => entry.id)),
        }
      }),
  }
}
