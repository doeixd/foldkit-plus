/**
 * The kitchen-sink stack: one application that composes every package.
 *
 * - `foldkit-surface` owns the application and its projections.
 * - `foldkit-remote` is the server-derived cache submodel; `foldkit-remote-drizzle`
 *   compiles its entity reads and query connections into SQL, and
 *   `foldkit-remote-server` serves them.
 * - `foldkit-durable` orders the client-owned `notes` operations and `foldkit-sync`
 *   replicates them, exchanging through a `TransportClient`.
 * - `foldkit-agent` (and its adapters) project the same Model and Messages.
 */
import { journalExchange } from 'foldkit-sync/journal'
import { DatabaseSync } from 'node:sqlite'
import { eq } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/node-sqlite'
import { sqliteTable, text } from 'drizzle-orm/sqlite-core'
import { Effect, Layer, Match, Option, Schema } from 'effect'
import { modifyFields } from 'foldkit/struct'
import { Bundle } from 'foldkit-bundle'
import { defineMessageUnion } from 'foldkit/message'
import * as Update from 'foldkit/update'
import { Entity, Expr, Write } from 'foldkit-entity'
import { Mutation, Query, Remote, RemoteClient, type RemoteMessageTag } from 'foldkit-remote'
import {
  bind,
  databaseLayer,
  entity,
  one,
  query,
  returning,
  runStatement,
  source,
  writer,
} from 'foldkit-remote-drizzle'
import { RemoteServer } from 'foldkit-remote-server'
import { MessageSet, Projection, Surface } from 'foldkit-surface'
import { ActorId as DurableActorId, Journal, OpId } from 'foldkit-durable'
import {
  DocumentId as SyncDocumentId,
  ReplicaId,
  StorageError,
  forApplication,
  type Storage,
  type Sync as SyncContract,
  type TransportClient,
} from 'foldkit-sync'
import { live } from 'foldkit-remote/live'

// ---------------------------------------------------------------------------
// The Drizzle-backed Remote domain
// ---------------------------------------------------------------------------

export const sqlite = new DatabaseSync(':memory:')
sqlite.exec(`
  CREATE TABLE users (id TEXT PRIMARY KEY, name TEXT NOT NULL);
  CREATE TABLE projects (
    id TEXT PRIMARY KEY, name TEXT NOT NULL, owner_id TEXT NOT NULL, status TEXT NOT NULL
  );
  INSERT INTO users (id, name) VALUES ('u1', 'Ada');
  INSERT INTO projects (id, name, owner_id, status) VALUES
    ('p1', 'Apollo', 'u1', 'active'),
    ('p2', 'Borealis', 'u1', 'archived');
  CREATE TABLE tasks (id TEXT PRIMARY KEY, title TEXT NOT NULL, status TEXT NOT NULL);
  INSERT INTO tasks (id, title, status) VALUES ('t1', 'Draft the brief', 'open'), ('t2', 'Book the room', 'done');
`)

export const db = drizzle({ client: sqlite })

export const users = sqliteTable('users', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
})

export const projects = sqliteTable('projects', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  ownerId: text('owner_id').notNull(),
  status: text('status').notNull(),
})

export const tasks = sqliteTable('tasks', {
  id: text('id').primaryKey(),
  title: text('title').notNull(),
  status: text('status').notNull(),
})

/** An Entity declared once, which client and server both read, and a declared write over it. */
export const Task = Entity.define(
  'Task',
  Schema.Struct({
    id: Schema.String,
    title: Schema.String,
    status: Schema.Literals(['open', 'done']),
  }),
)
const Db = bind({ Task }, { Task: { table: tasks } })

/**
 * A task is completed while it is open. The server refuses it otherwise, and
 * the client reads the same `when` to tell an agent before it asks
 * (`Data.capability` in `agent.ts`).
 */
export const CompleteTask = Mutation.write(
  'CompleteTask',
  Write.update(
    Entity.input(Task, Schema.Struct({ id: Schema.String, status: Schema.Literal('done') })),
    { id: 'id', when: () => Expr.eq(Task.fields.status, 'open') },
  ),
)

/** The binding is the Remote `EntityDescriptor`; no second field declaration. */
export const User = entity('User', users)

/** `owner` is a relation: the entity field is a ref, and the read resolves it. */
export const Project = entity('Project', projects, {
  relations: { owner: one(User, { field: projects.ownerId }) },
})

/**
 * A nested selection: the Surface reads the owner's name through the ref, and
 * one `FoldkitRemoteRead` resolves both entities.
 */
export const ProjectSummary = Project.select({
  id: true,
  name: true,
  status: true,
  owner: User.select({ name: true }),
})

export const RenameProject = Mutation.make('RenameProject', {
  Input: { id: Schema.String, name: Schema.String },
  Output: { id: Schema.String },
})

export const ProjectsByOwner = Query.make('ProjectsByOwner', {
  Input: { ownerId: Schema.String },
  Result: Project,
})

export const CreateProject = Mutation.make('CreateProject', {
  Input: { id: Schema.String, name: Schema.String, ownerId: Schema.String },
  Output: { id: Schema.String },
})

/**
 * The live hub: what each mutation answers is published to it, and every live
 * subscriber that selects those fields receives them, re-read through the
 * entity source under its own principal. It needs only the entity sources.
 */
const entitySources = [source(User), source(Project), source(Db.Task)]
export const liveHub = Effect.runSync(RemoteServer.liveHub(entitySources))

const RenameProjectSource = RemoteServer.mutation(RenameProject, ({ input }) =>
  Effect.gen(function* () {
    const project = returning(Project, ['id', 'name', 'status'])
    const rows = yield* runStatement(
      () =>
        db
          .update(projects)
          .set({ name: input.name })
          .where(eq(projects.id, input.id))
          .returning(project.columns),
      'Database write failed',
    )
    // The patches answered here are what live subscribers hear: the handlers
    // given `live: liveHub` publish them, so nothing names the change twice.
    return { output: { id: input.id }, entities: project.patches(rows) }
  }),
)

/**
 * A mutation that also changes a connection: the result carries the confirmed
 * insert, so the client's optimistic prepend becomes the real edge in place.
 */
const CreateProjectSource = RemoteServer.mutation(CreateProject, ({ input }) =>
  Effect.gen(function* () {
    const project = returning(Project, ['id', 'name', 'status', 'owner'])
    const rows = yield* Effect.promise(() =>
      Promise.resolve(
        db
          .insert(projects)
          .values({ id: input.id, name: input.name, ownerId: input.ownerId, status: 'active' })
          .returning(project.columns),
      ),
    )
    return {
      output: { id: input.id },
      entities: project.patches(rows),
      connections: [
        RemoteServer.prepend(
          ProjectsByOwner.ref({ ownerId: input.ownerId }),
          Project.ref(input.id),
        ),
      ],
    }
  }),
)

const ProjectsByOwnerSource = query(ProjectsByOwner, {
  entity: Project,
  orderBy: [{ key: projects.id, direction: 'desc' }],
  where: input => eq(projects.ownerId, input.ownerId),
})

// ---------------------------------------------------------------------------
// The Surface application
// ---------------------------------------------------------------------------

const Note = Schema.Struct({ id: Schema.String, body: Schema.String })

const Model = Schema.Struct({
  remote: Remote.Model,
  projectId: Schema.String,
  notes: Schema.Array(Note),
  // `null` on the wire: the agent's context carries it.
  selectedNoteId: Schema.OptionFromNullOr(Schema.String),
})
export type Model = typeof Model.Type

// Remote's Messages are cases of the application's own union; the assembly
// below hands them to `Data.reduce` by tag, so there is no wrapper Message.
export const Message = defineMessageUnion({
  ...Remote.messages,
  Ping: {},
  RequestedCreateNote: { id: Schema.String, body: Schema.String },
  RequestedRenameNote: { id: Schema.String, body: Schema.String },
  RequestedCompleteTask: { id: Schema.String },
  SelectedNote: { id: Schema.String },
  SelectedProject: { id: Schema.String },
})
export type Message = typeof Message.Type

/**
 * The application's own transitions. The assembly routes Remote's Messages
 * before `own` ever sees them; the tag check narrows the union for
 * `reduceOwn`, and its fallback arm is unreachable.
 */
const ownUpdate = (model: Model, message: Message): Update.Return<Model, Message, RemoteClient> =>
  Remote.reduces(message) ? { model } : reduceOwn(model, message)

const reduceOwn = (
  model: Model,
  message: Exclude<Message, { readonly _tag: RemoteMessageTag }>,
): Update.Return<Model, Message, RemoteClient> =>
  Match.valueTags(message, {
    RequestedCompleteTask: ({ id }) => {
      const started = Data.mutate(model, CompleteTask, { id, status: 'done' })
      return { model: started.model, commands: [started.command] }
    },
    Ping: () => ({ model }),
    RequestedCreateNote: ({ id, body }) => ({
      model: modifyFields(model, {
        notes: () =>
          model.notes.some(note => note.id === id) ? model.notes : [...model.notes, { id, body }],
      }),
    }),
    RequestedRenameNote: ({ id, body }) => ({
      model: modifyFields(model, {
        notes: () => model.notes.map(note => (note.id === id ? { ...note, body } : note)),
      }),
    }),
    SelectedNote: ({ id }) => ({
      model: modifyFields(model, { selectedNoteId: () => Option.some(id) }),
    }),
    SelectedProject: ({ id }) => ({ model: modifyFields(model, { projectId: () => id }) }),
  })

export const App = Surface.application({
  Model,
  Message,
  initial: {
    remote: Remote.initial,
    projectId: 'p1',
    notes: [],
    selectedNoteId: Option.none(),
  },
  // The assembly below; invoked only after this module finishes loading.
  update: (model, message) => update(model, message),
})

/** The Remote domain, bound to `model.remote`: the application-facing operations live here. */
export const Data = Remote.make({
  model: App.model.remote,
  entities: [User, Project, Task],
  mutations: [RenameProject, CreateProject, CompleteTask],
  queries: [ProjectsByOwner],
  // Run by tsx and tested by Vitest, never built for a reader: always verified.
  verifyPredictions: true,
})

/**
 * A Surface over the server-derived project plus the replicated notes. The
 * project is read live, so the Board's subscriptions include a live entry.
 */
export const BoardSurface = App.surface('Board', {
  model: ({ model }) => ({
    project: live(Data, ProjectSummary, 'p1'),
    notes: model.notes,
    selectedNoteId: model.selectedNoteId,
  }),
  messages: [Message.SelectedNote, Message.RequestedRenameNote],
})

// ---------------------------------------------------------------------------
// The client-owned replica (durable + sync)
// ---------------------------------------------------------------------------

/**
 * What the agent sees, as a Surface declared closed: the notes and the selection after one of
 * these Messages depend on nothing else in the Model, and no other Message moves them.
 * `test/agent-context.test.ts` walks it with `Closure.violations`.
 */
export const AgentContext = App.surface('AgentContext', {
  model: ({ model }) => ({ notes: model.notes, selectedNoteId: model.selectedNoteId }),
  messages: [Message.RequestedCreateNote, Message.RequestedRenameNote, Message.SelectedNote],
  closed: true,
})

export const Notes = Projection.pick(App.model.notes)
export const NoteChanges = MessageSet.make(App, [
  Message.RequestedCreateNote,
  Message.RequestedRenameNote,
])
const syncDefinition = forApplication(App).make({
  documentId: SyncDocumentId.make('kitchen'),
  shared: Notes,
  durable: NoteChanges,
})
export const KitchenSync: SyncContract<
  Message,
  { readonly notes: ReadonlyArray<typeof Note.Type> }
> = syncDefinition

const revisionOf = Schema.decodeUnknownOption(Schema.Struct({ revision: Schema.Number }))

/** A minimal in-memory `Storage`, so the replica needs no browser runtime. */
export const memoryStorage = (): Storage => {
  let stored: unknown
  return {
    load: () => Effect.succeed(stored),
    save: (state, expectedRevision) =>
      Effect.try({
        try: () => {
          const current = Option.getOrNull(
            Option.map(revisionOf(stored), ({ revision }) => revision),
          )
          if (current !== expectedRevision) throw new Error('Replica was changed by another writer')
          stored = state
        },
        catch: cause => new StorageError({ message: 'Could not save the replica', cause }),
      }),
    close: Effect.void,
  }
}

export interface Principal {
  readonly actorId: string
  readonly canWrite: boolean
}

/**
 * The durable server half: a `Journal.make` over the Sync contract, and a
 * `TransportClient` the replica exchanges through.
 */
export const makeSyncServer = (principal: Principal) =>
  Effect.gen(function* () {
    const journal = yield* Journal.make({
      ...KitchenSync.journalContract(),
      file: ':memory:',
      opId: operation => OpId.make(operation.opId),
      actorId: (value: Principal) => DurableActorId.make(value.actorId),
    })
    // The exchange is `foldkit-sync/journal`'s: refused operations are
    // rejected by their id, and the reply is what committed since.
    const transport: TransportClient = journalExchange({ sync: KitchenSync, journal, principal })
    return { journal, transport }
  })

export const openReplica = KitchenSync.openReplica(memoryStorage(), {
  replicaId: ReplicaId.make('kitchen-a'),
})

const Page = Bundle.parent({ Model: App.Model, Message }).withServices<RemoteClient>()

/**
 * The one list of what joins the application: the Remote domain brings its
 * routing, Subscriptions, and contract (and requires `RemoteClient` from the
 * runtime's resources), and the sync contract joins for the Module. `update`
 * derives from it, so a missed step is a type error rather than a silent
 * no-op.
 */
export const wiring = Page.assemble(Data.wiring({ board: BoardSurface }), syncDefinition.wiring())

/**
 * Remote's Messages go to the domain; every other Message goes to `own`.
 * Annotated to break the inference cycle: `App` above is built from this
 * update, which is built from the domain, which is bound over `App`.
 */
export const update: (
  model: Model,
  message: Message,
) => Update.Return<Model, Message, RemoteClient> = wiring.update(ownUpdate)

// ---------------------------------------------------------------------------
// The server-backed RemoteClient
// ---------------------------------------------------------------------------

/**
 * Wires `RemoteClient` straight to `RemoteServer.handlers` over the Drizzle
 * database, so `Remote.observe`/`prefetch`/`mutate` run the real server path.
 */
export const serverClient = (principal: string): Layer.Layer<RemoteClient> => {
  const server = RemoteServer.make({
    entities: entitySources,
    mutations: [
      RenameProjectSource,
      CreateProjectSource,
      // The binding's writer judges the write's `when` where it commits.
      RemoteServer.write(CompleteTask, writer(Db.Task)),
    ],
    queries: [ProjectsByOwnerSource],
  })
  // Every source names a descriptor the domain declared.
  RemoteServer.validate(Data, server)
  const handlers = RemoteServer.handlers(server, principal, { live: liveHub })
  return Remote.clientLayer(handlers).pipe(Layer.provide(databaseLayer(db)))
}
