/**
 * `foldkit-cms-drizzle` — the server half of `foldkit-cms`.
 *
 * It keeps an author's unpublished work in three tables beside the
 * application's own, and it is where the audience boundary is enforced: a
 * principal that is not an author is refused entries, drafts and revisions
 * outright, and sees of the content only the rows its `published` role shows.
 * Both are a binding's `visible`, so they hold on every path a table is read by.
 *
 * Publishing runs the application's own mutation with the draft's value, inside
 * a transaction that also appends the revision and removes the draft, so a
 * publish happened entirely or did not happen.
 */
import {
  and,
  eq,
  inArray,
  isNotNull,
  isNull,
  like,
  lte,
  ne,
  sql,
  type AnyColumn,
  type SQL,
} from 'drizzle-orm'
import { Effect, Exit, Schema } from 'effect'
import { Cms, type Content, type Facts } from 'foldkit-cms'
import type { MutationDescriptor } from 'foldkit-remote'
import {
  DrizzleDatabase,
  bind,
  query,
  returning,
  source,
  type AnyEntityBinding,
  type DrizzleDatabaseService,
  type Visible,
} from 'foldkit-remote-drizzle'
import {
  RemoteServer,
  RemoteServerError,
  type EntitySource,
  type MutationOutcome,
  type MutationSource,
  type QuerySource,
} from 'foldkit-remote-server'
import type { CmsTables } from './tables.js'

export { pgTables, sqliteSchema, sqliteTables, type CmsTables } from './tables.js'

/** The writes the CMS makes, as any Drizzle database for SQLite or Postgres offers them. */
interface Writes {
  insert(table: unknown): { values(values: object): PromiseLike<unknown> }
  update(table: unknown): {
    set(values: object): {
      where(condition: SQL | undefined): {
        returning(columns: Record<string, AnyColumn>): PromiseLike<ReadonlyArray<object>>
      }
    }
  }
  delete(table: unknown): { where(condition: SQL | undefined): PromiseLike<unknown> }
}

/**
 * A content type as the server holds it: its declaration, the binding of its
 * table, and the application's own handlers of its two publish mutations. What
 * publishing a post does stays the application's code.
 */
export interface ServedContent<P = any> {
  readonly type: Content<string, any, any, any>
  readonly binding: AnyEntityBinding
  readonly create: MutationSource<P, DrizzleDatabase>
  readonly update: MutationSource<P, DrizzleDatabase>
}

/** What an author may be refused, by `allow`. */
export type Asked =
  | 'save'
  | 'discard'
  | 'publish'
  | 'unpublish'
  | 'schedule'
  | 'unschedule'
  | 'archive'
  | 'unarchive'
  | 'restore'

/**
 * Runs some work so that it happened entirely or did not. Drizzle's own
 * transactions differ by driver, so the application says which this is.
 */
export type Transaction = <A, E>(
  work: Effect.Effect<A, E, DrizzleDatabase>,
) => Effect.Effect<A, E, DrizzleDatabase>

const statement = (database: DrizzleDatabaseService, text: string) =>
  Effect.promise(() => {
    const runs = database as unknown as {
      run?: (query: SQL) => unknown
      execute?: (query: SQL) => unknown
    }
    return Promise.resolve(
      runs.run !== undefined ? runs.run(sql.raw(text)) : runs.execute!(sql.raw(text)),
    )
  })

export const Transaction = {
  /**
   * `begin`, the work, then `commit` or `rollback`, as statements. For a database
   * that is one connection, such as a SQLite file. Over a pool each statement may
   * take a different connection: use `drizzle` there.
   */
  statements: (<A, E>(work: Effect.Effect<A, E, DrizzleDatabase>) =>
    Effect.gen(function* () {
      const database = yield* DrizzleDatabase
      yield* statement(database, 'begin')
      return yield* work.pipe(
        Effect.onExit(exit => statement(database, Exit.isSuccess(exit) ? 'commit' : 'rollback')),
      )
    })) as Transaction,
  /**
   * Drizzle's `database.transaction`, with the work given the transaction as its
   * database. For a driver whose transactions are asynchronous: Postgres, libSQL.
   */
  drizzle: (<A, E>(work: Effect.Effect<A, E, DrizzleDatabase>) =>
    Effect.gen(function* () {
      const database = (yield* DrizzleDatabase) as unknown as {
        transaction: <T>(run: (inner: DrizzleDatabaseService) => Promise<T>) => Promise<T>
      }
      const failed = Symbol('failed')
      let exit: Exit.Exit<A, E> | undefined
      // A failure must leave the callback as a rejection, or Drizzle commits.
      yield* Effect.promise(() =>
        database
          .transaction(async inner => {
            exit = await Effect.runPromiseExit(
              work.pipe(Effect.provideService(DrizzleDatabase, inner)),
            )
            if (!Exit.isSuccess(exit)) throw failed
          })
          .catch(error => {
            if (error !== failed) throw error
          }),
      )
      return yield* exit!
    })) as Transaction,
}

export interface CmsServerConfig<P> {
  readonly tables: CmsTables
  readonly content: ReadonlyArray<ServedContent<P>>
  /** How a publish is made whole: `Transaction.statements` or `Transaction.drizzle`. */
  readonly transaction: Transaction
  /** Who reads and writes unpublished work. Everyone else is a visitor. */
  readonly isAuthor: (principal: P) => boolean
  /**
   * Whether this author may make this transition. It is asked after the entry is
   * found and the transition is one its state offers. Default: any author may.
   */
  readonly allow?: (principal: P, transition: Asked, entry: EntryRow) => boolean
  /** The server's clock, passed in so a test can hold it. */
  readonly now?: () => Date
  /** Who a principal is, for `createdBy` and `updatedBy`. */
  readonly nameOf?: (principal: P) => string | null
}

/** A row of `cms_entries`, as the server's rules see it. */
export interface EntryRow {
  readonly id: string
  readonly type: string
  readonly targetId: string | null
  readonly label: string
  readonly archivedAt: string | null
  readonly revision: number | null
}

const refuse = (message: string) => new RemoteServerError({ message })

/**
 * Whether a unique index on this column refused a write. Drivers say so in their
 * own words, and Drizzle wraps what they say, so every message down the chain of
 * causes is read. SQLite names the column; Postgres names the constraint, which
 * by default is made of the column's name.
 */
const refusedAsDuplicate = (defect: unknown, column: string): boolean => {
  const said: Array<string> = []
  for (let at = defect, depth = 0; at != null && depth < 5; depth++) {
    const { message, constraint, cause } = at as {
      readonly message?: unknown
      readonly constraint?: unknown
      readonly cause?: unknown
    }
    // Drizzle's own message quotes the statement, which names every column.
    if (!String(message).startsWith('Failed query'))
      said.push(String(message ?? at), String(constraint ?? ''))
    at = cause
  }
  const text = said.join(' ')
  const named = new RegExp(`(^|[^a-zA-Z0-9])${column.replace(/[^\w]/g, '.')}([^a-zA-Z0-9]|$)`)
  return /unique|duplicate/i.test(text) && named.test(text)
}

/**
 * For a content table's binding: a visitor sees the rows whose `published`
 * column is set, and an author sees every row. Give it as the storage's
 * `visible` when the table is bound; `CmsServer.make` refuses a content type
 * that can be unpublished and whose binding shows every row to everyone.
 */
export const published =
  <P>(column: AnyColumn, isAuthor: (principal: P) => boolean): Visible =>
  principal =>
    isAuthor(principal as P) ? undefined : isNotNull(column)

export const CmsServer = {
  make: <P = unknown>(config: CmsServerConfig<P>) => {
    const { tables, isAuthor } = config
    const now = config.now ?? (() => new Date())
    const nameOf = config.nameOf ?? (() => null)

    const byType = new Map(config.content.map(served => [served.type.name, served]))
    for (const { type, binding, create, update } of config.content) {
      for (const [handler, declared] of [
        [create, type.publish.create],
        [update, type.publish.update],
      ] as const)
        if (handler.mutation !== declared.name)
          throw new Error(
            `foldkit-cms-drizzle: content "${type.name}" publishes through "${declared.name}", but was given the handler of "${handler.mutation}"`,
          )
      if (type.roles.published === undefined) continue
      // Whether the rule is right is the application's to say: only it knows what a
      // principal is. That there is one at all is checked here.
      if (binding.visible === undefined)
        throw new Error(
          `foldkit-cms-drizzle: content "${type.name}" can be unpublished, but its binding shows every row to everyone; bind its table with \`visible: published(column, isAuthor)\``,
        )
    }

    // Unpublished work is an author's. To anyone else these tables are empty, on
    // every path they are read by.
    const authorsOnly: Visible = principal => (isAuthor(principal as P) ? undefined : sql`0 = 1`)
    const Db = bind(Cms.Entities, {
      Entry: {
        table: tables.entries,
        visible: authorsOnly,
        relations: {
          draft: { foreignKey: tables.drafts.id },
          revisions: {
            foreignKey: tables.revisions.entryId,
            orderBy: [{ column: tables.revisions.n, direction: 'desc' }],
          },
        },
        // Not a column: this server derives it, below, with its own clock.
        derived: { state: { supplied: true } },
      },
      Draft: { table: tables.drafts, visible: authorsOnly },
      Revision: { table: tables.revisions, visible: authorsOnly },
    })

    /** What is known of some entries, for their state: their drafts, and whether a visitor sees their rows. */
    const factsOf = (entries: ReadonlyArray<EntryRow>) =>
      Effect.gen(function* () {
        const database = yield* DrizzleDatabase
        const ids = entries.map(entry => entry.id)
        const drafts =
          ids.length === 0
            ? []
            : yield* Effect.promise(() =>
                Promise.resolve(
                  database
                    .select({
                      id: tables.drafts.id,
                      scheduledFor: tables.drafts.scheduledFor,
                      scheduleError: tables.drafts.scheduleError,
                    })
                    .from(tables.drafts)
                    .where(inArray(tables.drafts.id, ids)),
                ),
              )
        const draftOf = new Map(drafts.map(draft => [String(draft.id), draft]))

        // Per content type, which target rows exist and which a visitor would see.
        const rows = new Map<string, 'visible' | 'hidden'>()
        for (const [name, { type, binding }] of byType) {
          const targets = entries.flatMap(entry =>
            entry.type === name && entry.targetId !== null ? [entry.targetId] : [],
          )
          if (targets.length === 0) continue
          const id = binding.columns.id!
          const publishedColumn =
            type.roles.published === undefined
              ? undefined
              : binding.columns[type.roles.published.key]
          const found = yield* Effect.promise(() =>
            Promise.resolve(
              database
                .select({
                  id,
                  ...(publishedColumn === undefined ? {} : { shown: publishedColumn }),
                })
                .from(binding.table)
                .where(inArray(id, targets)),
            ),
          )
          for (const row of found)
            rows.set(
              `${name}:${String(row.id)}`,
              publishedColumn === undefined || row.shown !== null ? 'visible' : 'hidden',
            )
        }

        return new Map(
          entries.map((entry): readonly [string, Facts] => {
            const draft = draftOf.get(entry.id)
            return [
              entry.id,
              {
                archivedAt: entry.archivedAt,
                row:
                  entry.targetId === null
                    ? 'none'
                    : (rows.get(`${entry.type}:${entry.targetId}`) ?? 'none'),
                draft:
                  draft === undefined
                    ? null
                    : {
                        scheduledFor: (draft.scheduledFor as string | null) ?? null,
                        scheduleError: (draft.scheduleError as string | null) ?? null,
                      },
              },
            ]
          }),
        )
      })

    const entryColumns = {
      id: tables.entries.id,
      type: tables.entries.type,
      targetId: tables.entries.targetId,
      label: tables.entries.label,
      archivedAt: tables.entries.archivedAt,
      revision: tables.entries.revision,
    }
    const findEntry = (id: string) =>
      Effect.gen(function* () {
        const database = yield* DrizzleDatabase
        const [row] = yield* Effect.promise(() =>
          Promise.resolve(
            database
              .select(entryColumns)
              .from(tables.entries)
              .where(eq(tables.entries.id, id))
              .limit(1),
          ),
        )
        return row as EntryRow | undefined
      })

    // An entry's `state` is not a column. The generated source reads the rest; the
    // state is derived from what is known of each entry, with this server's clock.
    const generated = source<P>(Db.Entry)
    const entries: EntitySource<P, DrizzleDatabase> = {
      ...generated,
      read: context =>
        Effect.gen(function* () {
          const wantsState = context.fields.includes('state')
          const fields = context.fields.filter(field => field !== 'state')
          const records = yield* generated.read({
            ...context,
            // The state needs these of each entry, asked for or not.
            fields: wantsState
              ? [...new Set([...fields, 'type', 'targetId', 'archivedAt'])]
              : fields,
          })
          if (!wantsState) return records
          const facts = yield* factsOf(
            records.map(record => ({
              id: record.id,
              type: String(record.values.type),
              targetId: (record.values.targetId as string | null) ?? null,
              label: '',
              archivedAt: (record.values.archivedAt as string | null) ?? null,
              revision: null,
            })),
          )
          const at = now()
          return records.map(record => ({
            id: record.id,
            values: {
              ...Object.fromEntries(
                Object.entries(record.values).filter(
                  ([field]) => field === 'id' || context.fields.includes(field),
                ),
              ),
              state: Cms.state(facts.get(record.id)!, at),
            },
          }))
        }),
    }

    const worklist: QuerySource<P, DrizzleDatabase> = query<P, typeof Cms.Entries.Input.Type>(
      Cms.Entries,
      {
        entity: Db.Entry,
        where: input =>
          and(
            eq(tables.entries.type, input.type),
            input.archived
              ? isNotNull(tables.entries.archivedAt)
              : isNull(tables.entries.archivedAt),
            input.search === '' ? undefined : like(tables.entries.label, `%${input.search}%`),
          ),
        orderBy: [{ column: tables.entries.createdAt, direction: 'desc' }],
      },
    )

    /** A mutation of this server: its principal and its database are fixed, its input is the descriptor's. */
    const operation = <Name extends string, Input, Output>(
      descriptor: MutationDescriptor<Name, Input, Output>,
      run: (context: {
        readonly input: Input
        readonly principal: P
      }) => Effect.Effect<MutationOutcome<Output>, RemoteServerError, DrizzleDatabase>,
    ): MutationSource<P, DrizzleDatabase> =>
      // Asked before anything is looked up: a visitor is not told which entries there are.
      RemoteServer.mutation<P, DrizzleDatabase, Name, Input, Output>(descriptor, context =>
        isAuthor(context.principal)
          ? run(context)
          : Effect.fail(refuse('Only an author may change unpublished work')),
      )

    /** Whether the application lets this author do this, once the entry is known. */
    const asking = (principal: P, transition: Asked, entry: EntryRow | undefined) =>
      entry !== undefined && config.allow?.(principal, transition, entry) === false
        ? Effect.fail(refuse(`This author may not ${transition} this entry`))
        : Effect.void

    const draftFields = ['values', 'model', 'form', 'updatedAt', 'updatedBy', 'baseRevision']
    const draftPatch = returning(Db.Draft, draftFields)
    const entryPatch = returning(Db.Entry, [
      'type',
      'targetId',
      'label',
      'createdAt',
      'archivedAt',
      'revision',
    ])
    /**
     * The entry as the client should now hold it, its state with it: an operation
     * changes the state, and a patch without it would leave the old one on screen.
     */
    const entryPatches = (id: string) =>
      Effect.gen(function* () {
        const patches = entryPatch.patches(yield* readRows(Db.Entry, entryPatch.columns, id))
        const entry = yield* findEntry(id)
        if (entry === undefined) return patches
        const facts = (yield* factsOf([entry])).get(id)!
        return patches.map(patch => ({
          ...patch,
          values: { ...patch.values, state: Cms.state(facts, now()) },
        }))
      })
    const readRows = (binding: AnyEntityBinding, columns: Record<string, AnyColumn>, id: string) =>
      Effect.gen(function* () {
        const database = yield* DrizzleDatabase
        return yield* Effect.promise(() =>
          Promise.resolve(
            database.select(columns).from(binding.table).where(eq(binding.columns.id!, id)),
          ),
        )
      })

    const SaveDraft = operation(Cms.Operations.SaveDraft, ({ input, principal }) =>
      Effect.gen(function* () {
        if (!byType.has(input.type))
          return yield* refuse(`"${input.type}" is not a type of content this server knows`)
        // An id nobody has is something new: the client named it, and this makes it.
        const existing = yield* findEntry(input.entry)
        if (existing !== undefined && existing.type !== input.type)
          return yield* refuse(`This entry is of "${existing.type}", not "${input.type}"`)
        if (existing?.archivedAt != null) return yield* refuse('An archived entry takes no draft')
        yield* asking(principal, 'save', existing)

        const database = (yield* DrizzleDatabase) as unknown as Writes
        const who = nameOf(principal)
        const id = existing?.id ?? input.entry
        const [held] = yield* readRows(Db.Draft, { updatedAt: tables.drafts.updatedAt }, id)
        const previous = held === undefined ? null : String(held.updatedAt)
        // Two saves in one millisecond must still be told apart by the next one.
        const at = now().toISOString()
        const updatedAt =
          previous !== null && at <= previous
            ? new Date(new Date(previous).getTime() + 1).toISOString()
            : at
        const written = {
          values: input.values,
          model: input.model,
          form: input.form,
          updatedAt,
          updatedBy: who,
          // A draft that changed is worth trying again when its time comes.
          scheduleError: null,
        }

        // The first draft of an entry has nothing to have been based on. Asked before
        // anything is written, so a refusal leaves no entry behind.
        if (previous === null && input.basedOn !== null)
          return yield* refuse('CmsConflict: this draft was discarded')
        if (existing === undefined) {
          yield* Effect.promise(() =>
            Promise.resolve(
              database.insert(tables.entries).values({
                id,
                type: input.type,
                targetId: null,
                label: input.label,
                createdBy: who,
                createdAt: at,
                archivedAt: null,
                revision: null,
              }),
            ),
          )
        }
        if (previous === null) {
          yield* Effect.promise(() =>
            Promise.resolve(
              database.insert(tables.drafts).values({ id, ...written, baseRevision: null }),
            ),
          )
        } else {
          // Compare and set: the save names what it was made from, and a newer one
          // on the server means someone else saved in between.
          const changed = yield* Effect.promise(() =>
            Promise.resolve(
              database
                .update(tables.drafts)
                .set(written)
                .where(
                  and(eq(tables.drafts.id, id), eq(tables.drafts.updatedAt, input.basedOn ?? '')),
                )
                .returning({ id: tables.drafts.id }),
            ),
          )
          if (changed.length === 0)
            return yield* refuse('CmsConflict: this draft was saved by someone else since')
        }
        if (existing !== undefined && existing.label !== input.label) {
          yield* Effect.promise(() =>
            Promise.resolve(
              database
                .update(tables.entries)
                .set({ label: input.label })
                .where(eq(tables.entries.id, id))
                .returning({ id: tables.entries.id }),
            ),
          )
        }

        const entities = [
          ...(yield* entryPatches(id)),
          ...draftPatch.patches(yield* readRows(Db.Draft, draftPatch.columns, id)),
        ]
        return { output: { entry: id as never, updatedAt }, entities }
      }),
    )

    const DiscardDraft = operation(Cms.Operations.DiscardDraft, ({ input, principal }) =>
      Effect.gen(function* () {
        const entry = yield* findEntry(input.entry)
        if (entry === undefined) return yield* refuse('There is no such entry')
        yield* asking(principal, 'discard', entry)
        const database = (yield* DrizzleDatabase) as unknown as Writes
        yield* Effect.promise(() =>
          Promise.resolve(database.delete(tables.drafts).where(eq(tables.drafts.id, entry.id))),
        )
        const gone = [{ entity: 'CmsDraft', id: entry.id }]
        // Never published, and now with nothing entered: there is nothing left of it.
        if (entry.targetId !== null)
          return { output: {}, deleted: gone, entities: yield* entryPatches(entry.id) }
        yield* Effect.promise(() =>
          Promise.resolve(database.delete(tables.entries).where(eq(tables.entries.id, entry.id))),
        )
        return { output: {}, deleted: [...gone, { entity: 'CmsEntry', id: entry.id }] }
      }),
    )

    const done: Readonly<Record<Exclude<Asked, 'save' | 'discard'>, string>> = {
      publish: 'published',
      unpublish: 'unpublished',
      schedule: 'scheduled',
      unschedule: 'unscheduled',
      archive: 'archived',
      unarchive: 'unarchived',
      restore: 'restored',
    }
    /** The entry, if its state offers this transition now. */
    const offering = (id: string, transition: Exclude<Asked, 'save' | 'discard'>) =>
      Effect.gen(function* () {
        const entry = yield* findEntry(id)
        if (entry === undefined) return yield* refuse('There is no such entry')
        const served = byType.get(entry.type)
        if (served === undefined)
          return yield* refuse(`"${entry.type}" is not a type of content this server knows`)
        const facts = (yield* factsOf([entry])).get(entry.id)!
        if (!Cms.offers(facts, now(), served.type).includes(transition))
          return yield* refuse(`This entry cannot be ${done[transition]} as it stands`)
        return { entry, served, facts }
      })

    /** What the `published` role's column holds for "now". */
    const stamp = (column: AnyColumn, at: Date) => {
      const kind = column.dataType.split(' ')[0]
      return kind === 'string' ? at.toISOString() : kind === 'number' ? at.getTime() : at
    }

    const scheduledPatch = returning(Db.Draft, ['scheduledFor', 'scheduleError'])
    const revisionPatch = returning(Db.Revision, ['n', 'values', 'publishedAt', 'publishedBy'])

    type Found = Effect.Success<ReturnType<typeof offering>>

    /** The draft as the publish mutation would take it, or why it would not. */
    const readied = ({ entry, served, facts }: Found) =>
      Effect.gen(function* () {
        const [draft] = yield* readRows(Db.Draft, { values: tables.drafts.values }, entry.id)
        // A row that was deleted under its entry is made again.
        const creating = facts.row === 'none'
        const handler = creating ? served.create : served.update
        const value =
          creating || typeof draft?.values !== 'object' || draft.values === null
            ? draft?.values
            : { ...draft.values, id: entry.targetId }
        const decoded = yield* Schema.decodeUnknownEffect(handler.Input)(value).pipe(
          Effect.mapError(error => refuse(`This draft is not ready to publish: ${String(error)}`)),
        )
        return { draft, creating, handler, decoded }
      })

    /** A publish, for the operation that asks for one and for the schedule that comes due. */
    const publishing = (found: Found, principal: P, basedOn: number | null) =>
      Effect.gen(function* () {
        const { entry, served } = found
        const database = yield* DrizzleDatabase
        const held = entry.revision
        const conflict = refuse('CmsConflict: this entry was published by someone else since')
        if (held !== basedOn) return yield* conflict
        const { draft, creating, handler, decoded } = yield* readied(found)

        // A taken slug is refused by name, on its key. This is advice: two publishes
        // can both pass it, and then the unique index is the rule, below.
        const address = served.type.roles.slug
        const slug =
          address === undefined
            ? undefined
            : (decoded as Readonly<Record<string, unknown>> | null)?.[address.key]
        const taken = (key: string) => refuse(Cms.slugTaken.message(key, String(slug)))
        if (address !== undefined && typeof slug === 'string') {
          const column = served.binding.columns[address.key]!
          const id = served.binding.columns.id!
          const others = yield* Effect.promise(() =>
            Promise.resolve(
              database
                .select({ id })
                .from(served.binding.table)
                .where(and(eq(column, slug), creating ? undefined : ne(id, entry.targetId!)))
                .limit(1),
            ),
          )
          if (others.length > 0) return yield* taken(address.key)
        }

        return yield* config
          .transaction(
            Effect.gen(function* () {
              const writes = (yield* DrizzleDatabase) as unknown as Writes
              const n = (held ?? 0) + 1
              // Compare and set, first: of two publishes made from one revision, one
              // finds the number already moved, and nothing of it is written.
              const moved = yield* Effect.promise(() =>
                Promise.resolve(
                  writes
                    .update(tables.entries)
                    .set({ revision: n })
                    .where(
                      and(
                        eq(tables.entries.id, entry.id),
                        held === null
                          ? isNull(tables.entries.revision)
                          : eq(tables.entries.revision, held),
                      ),
                    )
                    .returning({ id: tables.entries.id }),
                ),
              )
              if (moved.length === 0) return yield* conflict
              const ran = yield* handler.run({ input: decoded, principal })
              const targetId = creating
                ? String((ran.output as { readonly id: unknown }).id)
                : entry.targetId!
              const at = now()
              const shown = served.type.roles.published
              if (shown !== undefined) {
                // Publishing shows the row. One already shown keeps its first date.
                const column = served.binding.columns[shown.key]!
                yield* Effect.promise(() =>
                  Promise.resolve(
                    writes
                      .update(served.binding.table)
                      .set({ [shown.key]: stamp(column, at) })
                      .where(and(eq(served.binding.columns.id!, targetId), isNull(column)))
                      .returning({ id: served.binding.columns.id! }),
                  ),
                )
              }
              const revisionId = `${entry.id}:${n}`
              yield* Effect.promise(() =>
                Promise.resolve(
                  writes.insert(tables.revisions).values({
                    id: revisionId,
                    entryId: entry.id,
                    n,
                    values: draft?.values,
                    publishedAt: at.toISOString(),
                    publishedBy: nameOf(principal),
                  }),
                ),
              )
              yield* Effect.promise(() =>
                Promise.resolve(writes.delete(tables.drafts).where(eq(tables.drafts.id, entry.id))),
              )
              yield* Effect.promise(() =>
                Promise.resolve(
                  writes
                    .update(tables.entries)
                    .set({ targetId })
                    .where(eq(tables.entries.id, entry.id))
                    .returning({ id: tables.entries.id }),
                ),
              )
              const content = returning(served.binding, shown === undefined ? [] : [shown.key])
              return {
                output: { entry: entry.id as never, targetId, revision: n },
                entities: [
                  ...ran.entities,
                  ...content.patches(yield* readRows(served.binding, content.columns, targetId)),
                  ...(yield* entryPatches(entry.id)),
                  ...revisionPatch.patches(
                    yield* readRows(Db.Revision, revisionPatch.columns, revisionId),
                  ),
                ],
                connections: ran.connections,
                deleted: [...ran.deleted, { entity: 'CmsDraft', id: entry.id }],
              }
            }),
          )
          .pipe(
            // The publish that lost the race: the index refused it, and it is the same
            // news as the check's. Any other defect is left as it was.
            Effect.catchDefect(defect =>
              address !== undefined &&
              refusedAsDuplicate(defect, served.binding.columns[address.key]!.name)
                ? Effect.fail(taken(address.key))
                : Effect.die(defect),
            ),
          )
      })

    const Publish = operation(Cms.Operations.Publish, ({ input, principal }) =>
      Effect.gen(function* () {
        const found = yield* offering(input.entry, 'publish')
        yield* asking(principal, 'publish', found.entry)
        return yield* publishing(found, principal, input.basedOn)
      }),
    )

    /** Writes to an entry's draft, and answers with both as the client should now hold them. */
    const drafted = (id: string, values: object) =>
      Effect.gen(function* () {
        const writes = (yield* DrizzleDatabase) as unknown as Writes
        yield* Effect.promise(() =>
          Promise.resolve(
            writes
              .update(tables.drafts)
              .set(values)
              .where(eq(tables.drafts.id, id))
              .returning({ id: tables.drafts.id }),
          ),
        )
        return {
          output: {},
          entities: [
            ...(yield* entryPatches(id)),
            ...scheduledPatch.patches(yield* readRows(Db.Draft, scheduledPatch.columns, id)),
          ],
        }
      })

    const Schedule = operation(Cms.Operations.Schedule, ({ input, principal }) =>
      Effect.gen(function* () {
        const found = yield* offering(input.entry, 'schedule')
        yield* asking(principal, 'schedule', found.entry)
        if (Number.isNaN(new Date(input.at).getTime()))
          return yield* refuse(`"${input.at}" is not a time`)
        // What cannot be published now is not promised for later.
        yield* readied(found)
        return yield* drafted(found.entry.id, {
          scheduledFor: new Date(input.at).toISOString(),
          scheduledBy: nameOf(principal),
          scheduleError: null,
        })
      }),
    )

    const Unschedule = operation(Cms.Operations.Unschedule, ({ input, principal }) =>
      Effect.gen(function* () {
        const found = yield* offering(input.entry, 'unschedule')
        yield* asking(principal, 'unschedule', found.entry)
        return yield* drafted(found.entry.id, {
          scheduledFor: null,
          scheduledBy: null,
          scheduleError: null,
        })
      }),
    )

    /** Archiving and its undoing: a fact about the entry, and for what can be hidden, the row. */
    const archiving = (transition: 'archive' | 'unarchive') =>
      operation(
        transition === 'archive' ? Cms.Operations.Archive : Cms.Operations.Unarchive,
        ({ input, principal }) =>
          Effect.gen(function* () {
            const { entry, served } = yield* offering(input.entry, transition)
            yield* asking(principal, transition, entry)
            const writes = (yield* DrizzleDatabase) as unknown as Writes
            yield* Effect.promise(() =>
              Promise.resolve(
                writes
                  .update(tables.entries)
                  .set({ archivedAt: transition === 'archive' ? now().toISOString() : null })
                  .where(eq(tables.entries.id, entry.id))
                  .returning({ id: tables.entries.id }),
              ),
            )
            const shown = served.type.roles.published
            if (transition === 'unarchive' || shown === undefined || entry.targetId === null)
              return { output: {}, entities: yield* entryPatches(entry.id) }
            // What is put away is not left on show. It comes back as unpublished work.
            yield* Effect.promise(() =>
              Promise.resolve(
                writes
                  .update(served.binding.table)
                  .set({ [shown.key]: null })
                  .where(eq(served.binding.columns.id!, entry.targetId!))
                  .returning({ id: served.binding.columns.id! }),
              ),
            )
            const content = returning(served.binding, [shown.key])
            return {
              output: {},
              entities: [
                ...content.patches(
                  yield* readRows(served.binding, content.columns, entry.targetId),
                ),
                ...(yield* entryPatches(entry.id)),
              ],
            }
          }),
      )

    /**
     * A revision's value becomes the working copy, and nothing is published. It
     * replaces what the draft held, and takes back a promise made of that: what
     * was scheduled is not what is there now. The saved Model goes too, so an
     * editor fills its form from the values, key by key.
     */
    const Restore = operation(Cms.Operations.Restore, ({ input, principal }) =>
      Effect.gen(function* () {
        const { entry } = yield* offering(input.entry, 'restore')
        yield* asking(principal, 'restore', entry)
        const database = yield* DrizzleDatabase
        const [revision] = yield* Effect.promise(() =>
          Promise.resolve(
            database
              .select({ values: tables.revisions.values })
              .from(tables.revisions)
              .where(
                and(eq(tables.revisions.entryId, entry.id), eq(tables.revisions.n, input.revision)),
              )
              .limit(1),
          ),
        )
        if (revision === undefined)
          return yield* refuse(`This entry has no revision ${input.revision}`)

        const writes = database as unknown as Writes
        const [held] = yield* readRows(Db.Draft, { updatedAt: tables.drafts.updatedAt }, entry.id)
        const at = now().toISOString()
        const updatedAt =
          held !== undefined && at <= String(held.updatedAt)
            ? new Date(new Date(String(held.updatedAt)).getTime() + 1).toISOString()
            : at
        const restored = {
          values: revision.values,
          model: null,
          form: `restored@${input.revision}`,
          updatedAt,
          updatedBy: nameOf(principal),
          baseRevision: entry.revision,
          scheduledFor: null,
          scheduledBy: null,
          scheduleError: null,
        }
        yield* Effect.promise(() =>
          Promise.resolve(
            held === undefined
              ? writes.insert(tables.drafts).values({ id: entry.id, ...restored })
              : writes
                  .update(tables.drafts)
                  .set(restored)
                  .where(eq(tables.drafts.id, entry.id))
                  .returning({ id: tables.drafts.id }),
          ),
        )
        return {
          output: { updatedAt },
          entities: [
            ...(yield* entryPatches(entry.id)),
            ...draftPatch.patches(yield* readRows(Db.Draft, draftPatch.columns, entry.id)),
            ...scheduledPatch.patches(yield* readRows(Db.Draft, scheduledPatch.columns, entry.id)),
          ],
        }
      }),
    )

    /**
     * Publishes every draft whose time has come, each in its own transaction, as
     * whoever scheduled it: `as` says who a stored name is. One that fails stays
     * scheduled with the reason, and is left alone until its draft changes, so a
     * fault the author must fix is not tried again every minute. The package owns
     * no timer: a cron trigger, an interval or a queue calls this.
     */
    const due = (at: Date, options: { readonly as: (scheduledBy: string | null) => P }) =>
      Effect.gen(function* () {
        const database = yield* DrizzleDatabase
        const waiting = yield* Effect.promise(() =>
          Promise.resolve(
            database
              .select({ id: tables.drafts.id, scheduledBy: tables.drafts.scheduledBy })
              .from(tables.drafts)
              .where(
                and(
                  isNotNull(tables.drafts.scheduledFor),
                  lte(tables.drafts.scheduledFor, at.toISOString()),
                  isNull(tables.drafts.scheduleError),
                  // What is put away keeps its promise, and keeps it waiting.
                  sql`${tables.drafts.id} in (select ${tables.entries.id} from ${tables.entries} where ${tables.entries.archivedAt} is null)`,
                ),
              ),
          ),
        )
        const outcomes: Array<{ readonly entry: string; readonly error: string | null }> = []
        for (const draft of waiting) {
          const id = String(draft.id)
          const principal = options.as((draft.scheduledBy as string | null) ?? null)
          const error = yield* Effect.gen(function* () {
            if (!isAuthor(principal))
              return yield* refuse('Whoever scheduled this is no longer an author')
            const found = yield* offering(id, 'publish')
            yield* asking(principal, 'publish', found.entry)
            yield* publishing(found, principal, found.entry.revision)
            return null
          }).pipe(
            Effect.catch(failure => Effect.succeed(failure.message)),
            Effect.catchDefect(defect => Effect.succeed(String(defect))),
          )
          if (error !== null) yield* drafted(id, { scheduleError: error })
          outcomes.push({ entry: id, error })
        }
        return outcomes
      })

    const Unpublish = operation(Cms.Operations.Unpublish, ({ input, principal }) =>
      Effect.gen(function* () {
        const { entry, served } = yield* offering(input.entry, 'unpublish')
        yield* asking(principal, 'unpublish', entry)
        const shown = served.type.roles.published!
        const writes = (yield* DrizzleDatabase) as unknown as Writes
        yield* Effect.promise(() =>
          Promise.resolve(
            writes
              .update(served.binding.table)
              .set({ [shown.key]: null })
              .where(eq(served.binding.columns.id!, entry.targetId!))
              .returning({ id: served.binding.columns.id! }),
          ),
        )
        const content = returning(served.binding, [shown.key])
        return {
          output: {},
          entities: [
            ...content.patches(yield* readRows(served.binding, content.columns, entry.targetId!)),
            ...(yield* entryPatches(entry.id)),
          ],
        }
      }),
    )

    const sources: ReadonlyArray<EntitySource<P, DrizzleDatabase>> = [
      entries,
      source<P>(Db.Draft),
      source<P>(Db.Revision),
      ...config.content.map(served => source<P>(served.binding)),
    ]
    const mutations: ReadonlyArray<MutationSource<P, DrizzleDatabase>> = [
      SaveDraft,
      DiscardDraft,
      Publish,
      Unpublish,
      Schedule,
      Unschedule,
      archiving('archive'),
      archiving('unarchive'),
      Restore,
    ]

    // A content type with an address is found by it, behind the same boundary as
    // every other read of its table.
    const bySlug = config.content.flatMap(({ type, binding }) => {
      const address = type.roles.slug
      if (address === undefined) return []
      const column = binding.columns[address.key]!
      return [
        query<P, { readonly slug: string }>(Cms.bySlug(type), {
          entity: binding,
          where: input => eq(column, input.slug),
          orderBy: [{ column: binding.columns.id!, direction: 'asc' }],
        }) as QuerySource<P, DrizzleDatabase>,
      ]
    })

    return {
      /**
       * The sources of the content types and of the CMS's own Entities, each behind
       * the audience boundary. Register these and not `source(binding)` of a content
       * table: that is how the boundary cannot be forgotten.
       */
      sources,
      queries: [worklist, ...bySlug] as ReadonlyArray<QuerySource<P, DrizzleDatabase>>,
      mutations,
      due,
      /** The bindings of `Entry`, `Draft` and `Revision`, for a handler that returns patches of them. */
      bindings: Db,
    }
  },
}
