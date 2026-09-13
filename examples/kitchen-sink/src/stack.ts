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
import { DatabaseSync } from 'node:sqlite'
import { eq } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/node-sqlite'
import { sqliteTable, text } from 'drizzle-orm/sqlite-core'
import { Effect, Layer, Schema } from 'effect'
import { defineMessageUnion } from 'foldkit/message'
import * as Update from 'foldkit/update'
import {
  Mutation,
  Query,
  Remote,
  RemoteClient,
  type RemoteMessageTag,
  type RemoteModel,
} from 'foldkit-remote'
import { databaseLayer, entity, returning, one, query, source } from 'foldkit-remote-drizzle'
import { RemoteServer } from 'foldkit-remote-server'
import { MessageSet, Projection, Surface } from 'foldkit-surface'
import {
  actorId as toDurableActorId,
  cursor as toDurableCursor,
  documentId as toDurableDocumentId,
  makeJournal,
  opId,
} from 'foldkit-durable'
import {
  type Sync as SyncContract,
  documentId as toSyncDocumentId,
  forApplication,
  replicaId,
  sequence,
  StorageError,
  type Storage,
  type TransportClient,
} from 'foldkit-sync'

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
 * The live hub: mutation sources tell it what changed, and every live
 * subscriber that selects those fields receives them, re-read through the
 * entity source under its own principal. It needs only the entity sources.
 */
const entitySources = [source(User), source(Project)]
export const liveHub = Effect.runSync(RemoteServer.liveHub(entitySources))

const RenameProjectSource = RemoteServer.mutation(RenameProject, ({ input }) =>
  Effect.gen(function* () {
    const project = returning(Project, ['id', 'name', 'status'])
    const rows = yield* Effect.promise(() =>
      Promise.resolve(
        db
          .update(projects)
          .set({ name: input.name })
          .where(eq(projects.id, input.id))
          .returning(project.columns),
      ),
    )
    // Live subscribers that select `name` learn of the rename from here.
    yield* liveHub.changed(Project.ref(input.id), ['name'])
    return { output: { id: input.id }, entities: project.patches(rows) }
  }),
)

/**
 * A mutation that also changes a connection: the result carries the confirmed
 * insert, so the client's optimistic prepend becomes the real edge in place.
 */
const CreateProjectSource = RemoteServer.mutation(CreateProject, ({ input }) =>
  Effect.gen(function* () {
    const project = returning(Project, ['id', 'name', 'status'])
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
  orderBy: [{ column: projects.id, direction: 'desc' }],
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
  selectedNoteId: Schema.NullOr(Schema.String),
  lastError: Schema.NullOr(Schema.String),
})
export type Model = typeof Model.Type

// Remote's Messages are cases of the application's own union; `update`
// hands them to `Data.reduce` by tag, so there is no wrapper Message.
export const Message = defineMessageUnion({
  ...Remote.messages,
  Ping: {},
  RequestedCreateNote: { id: Schema.String, body: Schema.String },
  RequestedRenameNote: { id: Schema.String, body: Schema.String },
  SelectedNote: { id: Schema.String },
  SelectedProject: { id: Schema.String },
})
export type Message = typeof Message.Type

export const update = (model: Model, message: Message): Update.Return<Model, Message> => {
  if (Remote.reduces(message)) return { model: Data.reduce(model, message) }
  return { model: reduceNotes(model, message) }
}

const reduceNotes = (
  model: Model,
  message: Exclude<Message, { readonly _tag: RemoteMessageTag }>,
): Model => {
  switch (message._tag) {
    case 'Ping':
      return model
    case 'RequestedCreateNote':
      return {
        ...model,
        notes: model.notes.some(note => note.id === message.id)
          ? model.notes
          : [...model.notes, { id: message.id, body: message.body }],
      }
    case 'RequestedRenameNote':
      return {
        ...model,
        notes: model.notes.map(note =>
          note.id === message.id ? { ...note, body: message.body } : note,
        ),
      }
    case 'SelectedNote':
      return { ...model, selectedNoteId: message.id }
    case 'SelectedProject':
      return { ...model, projectId: message.id }
  }
}

export const App = Surface.application({
  Model,
  Message,
  initial: {
    remote: Remote.initial,
    projectId: 'p1',
    notes: [],
    selectedNoteId: null,
    lastError: null,
  },
  update,
})

/** The Remote domain, bound to `model.remote`: the application-facing operations live here. */
export const Data = Remote.make({
  model: App.model.remote,
  entities: [User, Project],
  mutations: [RenameProject, CreateProject],
  queries: [ProjectsByOwner],
})

/** A Surface over the server-derived project plus the replicated notes. */
export const BoardSurface = Surface.make(App, 'Board', {
  model: ({ model }) =>
    Projection.struct({
      project: Data.get(ProjectSummary, 'p1'),
      notes: model.notes,
      selectedNoteId: model.selectedNoteId,
    }),
  messages: [Message.SelectedNote, Message.RequestedRenameNote],
})

// ---------------------------------------------------------------------------
// The client-owned replica (durable + sync)
// ---------------------------------------------------------------------------

export const Notes = Projection.pick(App.fields.notes)
export const NoteChanges = MessageSet.make(App, [
  Message.RequestedCreateNote,
  Message.RequestedRenameNote,
])
export const KitchenSync: SyncContract<
  Message,
  { readonly notes: ReadonlyArray<typeof Note.Type> }
> = forApplication(App).make({
  documentId: toSyncDocumentId('kitchen'),
  shared: Notes,
  durable: NoteChanges,
})

/** A minimal in-memory `Storage`, so the replica needs no browser runtime. */
export const memoryStorage = (): Storage => {
  let stored: unknown
  return {
    load: () => Effect.succeed(stored),
    save: (state, expectedRevision) =>
      Effect.try({
        try: () => {
          const current = (stored as { revision?: number } | undefined)?.revision ?? null
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
 * The durable server half: a `makeJournal` over the Sync contract, and a
 * `TransportClient` the replica exchanges through.
 */
export const makeSyncServer = (principal: Principal) =>
  Effect.gen(function* () {
    const journal = yield* makeJournal({
      ...KitchenSync.journalContract(),
      file: ':memory:',
      opId: operation => opId(operation.opId),
      actorId: (value: Principal) => toDurableActorId(value.actorId),
    })
    const document = toDurableDocumentId('kitchen')
    const transport: TransportClient = {
      exchange: async (cursor, pending) => {
        for (const operation of pending) {
          await Effect.runPromise(journal.append(document, operation, principal))
        }
        const committed = await Effect.runPromise(
          journal.read(document, toDurableCursor(Number(cursor))),
        )
        return {
          operations: committed.map(entry => ({
            ...entry.operation,
            serverSequence: sequence(Number(entry.sequence)),
            actorId: String(entry.actorId),
          })),
          rejected: [],
          acknowledged: pending.map(operation => operation.opId),
        }
      },
    }
    return { journal, transport }
  })

export const openReplica = KitchenSync.openReplica(replicaId('kitchen-a'), memoryStorage())

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
    mutations: [RenameProjectSource, CreateProjectSource],
    queries: [ProjectsByOwnerSource],
  })
  // Every source names a descriptor the domain declared.
  RemoteServer.validate(Data, server)
  const handlers = RemoteServer.handlers(server, principal, { live: liveHub })
  return Remote.clientLayer(handlers).pipe(Layer.provide(databaseLayer(db)))
}
