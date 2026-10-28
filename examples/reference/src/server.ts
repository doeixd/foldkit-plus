/**
 * The Remote server: the domain bound to D1's tables, the guard's body,
 * three declared writes landed by the guarded writer, and a live source that
 * polls D1 from inside each subscriber's own request. Nothing here imports
 * the Workers runtime, so the tests read it from Node.
 */
import { index, integer, primaryKey, sqliteTable, text } from 'drizzle-orm/sqlite-core'
import { Effect, Option } from 'effect'
import { GuardDrizzle } from 'foldkit-plus/guard/drizzle'
import { GuardServer } from 'foldkit-plus/guard/server'
import { Remote } from 'foldkit-plus/remote'
import {
  bind,
  checkConstraints,
  pollLive,
  query,
  rowChangeLog,
  revisionTrigger,
  rowLog,
  source,
  writer,
  type DrizzleDatabase,
} from 'foldkit-plus/remote-drizzle'
import { RemoteServer } from 'foldkit-plus/remote-server'
import { accounts } from './auth.js'
import { G, Me, Member, Note, type Principal } from './guard.js'
import { AddNote, DeleteNote, EditNote, NOTES_PAGE, NOTES_WATCH, Notes } from './operations.js'

export const notes = sqliteTable('notes', {
  id: text('id').primaryKey(),
  authorId: text('author_id')
    .notNull()
    .references(() => accounts.id),
  title: text('title').notNull(),
  body: text('body').notNull(),
  createdAt: integer('created_at').notNull(),
  revision: integer('revision').notNull().default(0),
})

/**
 * Each write the notes' writer landed, by whose operation it was, so a write
 * sent again (its answer lost) is answered with its row rather than refused
 * as a create of a taken id. D1 commits each record in one batch with its row.
 */
export const ledger = sqliteTable(
  'write_ledger',
  {
    scope: text('scope').notNull(),
    operation: text('operation').notNull(),
    target: text('target').notNull(),
    answer: text('answer').notNull(),
    at: integer('at').notNull(),
    request: text('request'),
  },
  table => [
    primaryKey({ columns: [table.scope, table.operation, table.target] }),
    index('write_ledger_at').on(table.at),
  ],
)

/** Every signed-in reader is a member; a visitor reads nothing. */
export const Policy = G.implement({ isMember: principal => Option.isSome(principal) })

export const Db = bind(
  { Member, Note },
  {
    Member: {
      table: accounts,
      visible: GuardDrizzle.visible(Policy, [Member]).Member,
      relations: { notes: { foreignKey: notes.authorId } },
    },
    Note: {
      table: notes,
      visible: GuardDrizzle.visible(Policy, [Note]).Note,
      relations: { author: { field: notes.authorId } },
      // `may` is the guard's answer, per reader: the server supplies it.
      derived: { may: { supplied: true } },
    },
  },
)

/** The notes table's CHECKs, compiled from the Entity's rules: none is written by hand. */
export const noteChecks = checkConstraints(Db.Note)

/** The statements of the log `pollLive` reads, one per line of the migration. */
export const noteLog = rowChangeLog(Db.Note)

/** What moves a note's revision on a change no writer of this server made. */
export const noteRevision = revisionTrigger(Db.Note, 'revision')

const NoteSource = source(Db.Note, { filter: GuardServer.filter(Note, Policy) })
const NotesSource = query(Notes, { entity: Db.Note })

/**
 * Another member's note joins the list, and an edit or a delete reaches every
 * reader: each stream re-reads D1 in its own request, since a Worker cannot
 * wake another request's stream. The page watches the list through
 * `NOTES_WATCH`.
 */
const NotesLive = pollLive(NoteSource, {
  lists: [
    {
      identity: Notes.ref({}).identity,
      watchId: NOTES_WATCH,
      fields: ['id', 'title', 'createdAt'],
      edges: principal =>
        NotesSource.run({ input: {}, window: { first: NOTES_PAGE }, principal }).pipe(
          Effect.map(page => page.edges),
        ),
    },
  ],
  changes: rowLog(Db.Note),
})

/**
 * Every write of a note is judged by its rules before it lands, and lands
 * only on the revision they were judged over. Its retry is answered from the
 * ledger, as it landed, and not judged again.
 */
const notesWriter = GuardServer.writer(
  Note,
  Policy,
  writer(Db.Note, {
    ledger: {
      table: ledger,
      // An operation id is unique only per client: a record is its asker's.
      scope: principal => Option.match(principal, { onNone: () => '', onSome: ({ id }) => id }),
    },
  }),
  { revision: 'revision' },
)

const served = {
  // Who asks, as the member a new note is set to.
  viewer: (principal: Option.Option<Principal>) =>
    Option.map(principal, ({ id }) => Remote.ref(Member, id)),
  entities: [
    source(Db.Member, { filter: GuardServer.filter(Member, Policy) }),
    NoteSource,
    GuardServer.me(Me, Policy),
  ],
  queries: [NotesSource],
  mutations: [
    RemoteServer.write(AddNote, notesWriter),
    RemoteServer.write(EditNote, notesWriter),
    RemoteServer.write(DeleteNote, notesWriter),
  ],
}

export const server = RemoteServer.make<Option.Option<Principal>, DrizzleDatabase>({
  ...served,
  live: [NotesLive],
})

// A guarded Entity served without its rule would serve every row: refuse to
// start. It is checked without the live source: `validate` refuses any live
// source over a guarded Entity but a hub, and a hub reaches no one on a
// Worker. `pollLive` re-reads each row through `NoteSource`, the guarded
// Source checked here, so it streams nothing the reader could not read.
GuardServer.validate(Policy, {
  entities: [Member, Note],
  domain: Remote.define({ entities: [Member, Note], queries: [Notes] }),
  server: RemoteServer.make<Option.Option<Principal>, DrizzleDatabase>(served),
})
