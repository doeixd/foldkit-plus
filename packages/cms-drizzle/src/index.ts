/**
 * `foldkit-cms-drizzle` — the server half of `foldkit-cms`.
 *
 * It keeps an author's unpublished work in three tables beside the
 * application's own, and it is where the audience boundary is enforced: a
 * principal that is not an author is refused entries, drafts and revisions
 * outright, and sees of the content only the rows its `published` role shows.
 * Both are a binding's `visible`, so they hold on every path a table is read by.
 *
 * So far: drafts. Saving, discarding, the worklist, and the boundary. Publishing
 * is the next step of the design.
 */
import {
  and,
  eq,
  inArray,
  isNotNull,
  isNull,
  like,
  sql,
  type AnyColumn,
  type SQL,
} from 'drizzle-orm'
import { Effect } from 'effect'
import { Cms, type Content, type Facts } from 'foldkit-cms'
import type { MutationDescriptor } from 'foldkit-remote'
import {
  DrizzleDatabase,
  bind,
  query,
  returning,
  source,
  type AnyEntityBinding,
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

/** A content type as the server holds it: its declaration, and the binding of its table. */
export interface ServedContent {
  readonly type: Content<string, any, any, any>
  readonly binding: AnyEntityBinding
}

export interface CmsServerConfig<P> {
  readonly tables: CmsTables
  readonly content: ReadonlyArray<ServedContent>
  /** Who reads and writes unpublished work. Everyone else is a visitor. */
  readonly isAuthor: (principal: P) => boolean
  /**
   * Whether this author may make this transition. It is asked after the entry is
   * found and the transition is one its state offers. Default: any author may.
   */
  readonly allow?: (principal: P, transition: 'save' | 'discard', entry: EntryRow) => boolean
  /** The server's clock, passed in so a test can hold it. */
  readonly now?: () => Date
  readonly newId?: () => string
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
}

const refuse = (message: string) => new RemoteServerError({ message })

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
    const newId = config.newId ?? (() => globalThis.crypto.randomUUID())
    const nameOf = config.nameOf ?? (() => null)

    const byType = new Map(config.content.map(served => [served.type.name, served]))
    for (const { type, binding } of config.content) {
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
      RemoteServer.mutation<P, DrizzleDatabase, Name, Input, Output>(descriptor, run)

    /** Asks the two questions every operation asks: is this an author, and may they do this. */
    const asking = (principal: P, transition: 'save' | 'discard', entry: EntryRow | undefined) =>
      !isAuthor(principal)
        ? Effect.fail(refuse('Only an author may change unpublished work'))
        : entry !== undefined && config.allow?.(principal, transition, entry) === false
          ? Effect.fail(refuse(`This author may not ${transition} this entry`))
          : Effect.void

    const draftFields = ['values', 'model', 'form', 'updatedAt', 'updatedBy', 'baseRevision']
    const draftPatch = returning(Db.Draft, draftFields)
    const entryPatch = returning(Db.Entry, ['type', 'targetId', 'label', 'createdAt', 'archivedAt'])
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
        const existing = input.entry === null ? undefined : yield* findEntry(input.entry)
        if (input.entry !== null && existing === undefined)
          return yield* refuse('There is no such entry')
        if (existing !== undefined && existing.type !== input.type)
          return yield* refuse(`This entry is of "${existing.type}", not "${input.type}"`)
        if (existing?.archivedAt != null) return yield* refuse('An archived entry takes no draft')
        yield* asking(principal, 'save', existing)

        const database = (yield* DrizzleDatabase) as unknown as Writes
        const who = nameOf(principal)
        const id = existing?.id ?? newId()
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
        }

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
              }),
            ),
          )
        }
        if (previous === null) {
          // The first draft of an entry: nothing to have been based on.
          if (input.basedOn !== null) return yield* refuse('CmsConflict: this draft was discarded')
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
          ...entryPatch.patches(yield* readRows(Db.Entry, entryPatch.columns, id)),
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
        if (entry.targetId !== null) return { output: {}, deleted: gone }
        yield* Effect.promise(() =>
          Promise.resolve(database.delete(tables.entries).where(eq(tables.entries.id, entry.id))),
        )
        return { output: {}, deleted: [...gone, { entity: 'CmsEntry', id: entry.id }] }
      }),
    )

    const sources: ReadonlyArray<EntitySource<P, DrizzleDatabase>> = [
      entries,
      source<P>(Db.Draft),
      source<P>(Db.Revision),
      ...config.content.map(served => source<P>(served.binding)),
    ]
    const mutations: ReadonlyArray<MutationSource<P, DrizzleDatabase>> = [SaveDraft, DiscardDraft]

    return {
      /**
       * The sources of the content types and of the CMS's own Entities, each behind
       * the audience boundary. Register these and not `source(binding)` of a content
       * table: that is how the boundary cannot be forgotten.
       */
      sources,
      queries: [worklist] as ReadonlyArray<QuerySource<P, DrizzleDatabase>>,
      mutations,
      /** The bindings of `Entry`, `Draft` and `Revision`, for a handler that returns patches of them. */
      bindings: Db,
    }
  },
}
