/**
 * Every TypeScript snippet of this package's README, in order, as one module,
 * so the documentation cannot drift from the API. What the README leaves to
 * the reader is declared here and marked so: the Drizzle tables and database,
 * a request's body and principal, the client application, and the Sync
 * document's contract, journal and `changesOf`.
 */
import { sqliteTable, text } from 'drizzle-orm/sqlite-core'
import { Context, Effect, Option, Schema } from 'effect'
import { Entity, Expr, type Selected } from 'foldkit-entity'
import { Guards } from 'foldkit-guard'
import type { CellChange } from 'foldkit-guard/sync'
import { Surface } from 'foldkit-surface'
import type { Operation, Sync } from 'foldkit-sync'
import type { JournalExchangeOptions } from 'foldkit-sync/journal'
import { defineMessageUnion } from 'foldkit/message'

// ## Sixty seconds

const User = Schema.Struct({
  id: Schema.String,
  role: Schema.Literals(['admin', 'member']),
  projectIds: Schema.Array(Schema.String),
})

const TodoFields = Entity.define(
  'Todo',
  Schema.Struct({
    id: Schema.String,
    ownerId: Schema.String,
    projectId: Schema.String,
    title: Schema.String,
  }),
)

// Shared: names and predicates, which are data.
const G = Guards.declare(
  'Todos',
  User,
  guard => ({
    isAdmin: guard.principal(),
    isOwner: guard.row(TodoFields, p => Expr.eq(TodoFields.fields.ownerId, p.id)),
    inProject: guard.row(TodoFields, p => Expr.in(TodoFields.fields.projectId, p.projectIds)),
  }),
  { key: user => user.id, unguarded: 'deny' },
)

// Server: the body of every principal guard, and nothing else.
const Policy = G.implement({
  isAdmin: principal => Option.exists(principal, user => user.role === 'admin'),
})

Effect.runSync(
  Policy.decide(G.isOwner, {
    principal: Option.some({ id: 'ada', role: 'member', projectIds: [] }),
    interaction: 'Read',
    row: { id: 't1', ownerId: 'ada', projectId: 'p1', title: 'Write the README' },
  }),
) // true

// ## Attaching guards to an Entity

import { Relation } from 'foldkit-entity'
import { Interaction } from 'foldkit-guard'

const ProjectFields = Entity.define(
  'Project',
  Schema.Struct({ id: Schema.String, name: Schema.String }),
)
const Related = Entity.relate(
  { Todo: TodoFields, Project: ProjectFields },
  { Todo: { project: Relation.one(ProjectFields) } },
)
const Project = Related.Project

const Archive = Interaction.make('Archive')

const Todo = Related.Todo.pipe(
  Guards.attach(G, {
    row: {
      Read: [G.isOwner, G.inProject, G.isAdmin],
      Write: [G.isOwner],
    },
    interactions: {
      [Archive.key]: Guards.on([G.isAdmin], Guards.explain('Only an admin may archive.')),
    },
    members: { ownerId: { Update: [G.isAdmin] } },
  }),
  Guards.may, // the server's answer to what a reader may do: see What the client may do
)

Guards.matrix([Todo])
// Todo.Read: isOwner | inProject | isAdmin → not_found
// Todo.Create: isOwner → forbidden
// Todo.Update: isOwner → forbidden
// Todo.Delete: isOwner → forbidden
// Todo.Archive: isAdmin → explain("Only an admin may archive.")
// Todo.ownerId.Create: isAdmin → forbidden
// Todo.ownerId.Update: isAdmin → forbidden

// ## Deciding reads and writes

import { Condition } from 'foldkit-guard'

const ada = Option.some({ id: 'ada', role: 'member' as const, projectIds: ['p1'] })
const readable = Effect.runSync(Policy.readable(Todo, ada))
// isAdmin was false, so: isOwner or inProject, over each row

const t1 = { id: 't1', ownerId: 'ada', projectId: 'p9', title: 'Write the README' }
Condition.holds(readable, t1, Policy.inputOf(ada), () => false)
// true

// ## Serving reads

import { GuardServer } from 'foldkit-guard/server'
import { Remote } from 'foldkit-remote'
import { RemoteServer } from 'foldkit-remote-server'

const visitor: Option.Option<typeof User.Type> = Option.none()

const Data = Remote.define({ entities: [Todo, Project] })
const backend = RemoteServer.memory({
  domain: Data,
  rows: {
    Todo: [{ id: 't1', ownerId: 'ada', projectId: 'p1', title: 'Write', project: 'Project:p1' }],
    Project: [{ id: 'p1', name: 'Borealis' }],
  },
  principal: visitor, // reads no todo: every Read rule here needs a principal
  ...GuardServer.memory(Policy, [Todo]),
})

// The reader's own: Drizzle tables for `Todo` and `Project`.
const todos = sqliteTable('todos', {
  id: text('id').primaryKey(),
  ownerId: text('owner_id').notNull(),
  projectId: text('project_id').notNull(),
  title: text('title').notNull(),
})
const projects = sqliteTable('projects', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
})

import { GuardDrizzle } from 'foldkit-guard/drizzle'
import { bind, source } from 'foldkit-remote-drizzle'

const visible = GuardDrizzle.visible(Policy, [Todo])

class Memberships extends Context.Service<
  Memberships,
  { readonly admins: ReadonlyArray<string> }
>()('app/Memberships') {}

const Checked = G.implement({
  isAdmin: principal =>
    Effect.map(Memberships, ({ admins }) =>
      Option.exists(principal, user => admins.includes(user.id)),
    ),
})
const ReadPolicy = Checked.provide(Context.make(Memberships, { admins: ['ada'] }))
GuardDrizzle.visible(ReadPolicy, [Todo])
// @ts-expect-error a type error with `Checked`
GuardDrizzle.visible(Checked, [Todo])
const Db = bind(
  { Todo, Project },
  {
    Todo: {
      table: todos,
      relations: { project: { field: todos.projectId } },
      derived: { may: { supplied: true } }, // not a column: `GuardServer.filter` answers it
      visible: visible.Todo,
    },
    Project: { table: projects },
  },
)
const TodoSource = source(Db.Todo, { filter: GuardServer.filter(Todo, Policy) })

// ## Serving writes

import { Write } from 'foldkit-entity'
import { Mutation } from 'foldkit-remote'
import { writer } from 'foldkit-remote-drizzle'

const EditTodo = Mutation.write(
  'EditTodo',
  Write.update(Entity.input(Todo, Schema.Struct({ id: Schema.String, title: Schema.String })), {
    id: 'id',
  }),
)
RemoteServer.write(EditTodo, GuardServer.writer(Todo, Policy, writer(Db.Todo)))

GuardServer.writer(Todo, Policy, writer(Db.Todo), { presets: { ownerId: user => user.id } })

const ArchiveTodo = Mutation.make('ArchiveTodo', { Input: { id: Schema.String }, Output: {} })

GuardServer.mutation(
  ArchiveTodo,
  {
    entity: Todo,
    policy: Policy,
    interaction: Archive.key,
    id: input => input.id,
    source: TodoSource,
  },
  ({ input, row }) => Effect.succeed({ output: {} }), // `row`: the todo, as its writer sees it
)

// ## Checking a server at startup

GuardServer.validate(Policy, { entities: [Todo], domain: Data, server: backend.server })

// ## Who is asking

// The reader's own: a request's body, and who authentication resolved it was from.
declare const body: unknown
declare const principal: Option.Option<typeof User.Type>

const handlers = RemoteServer.handlers(backend.server, G.Principal)

// per request: `body` is what it sent, and authentication resolved `principal`
RemoteServer.answer(handlers, body).pipe(Effect.provideService(G.Principal, principal))

Effect.gen(function* () {
  const hub = yield* RemoteServer.liveHub([...backend.server.entities.values()], {
    key: Policy.keyOf,
  })
  return hub
})

// ## What the client may do

import { May } from 'foldkit-guard'

// The reader's own: a Todo read through `Row`.
declare const row: Selected<typeof Row>

// Select it as any member, and read it with `May`; `row` is a Todo read through `Row`.
const Row = Entity.select(Todo, { title: true, may: true })

May.can(row.may, Archive.key) // the row's rule for Archive
May.canSet(row.may, Todo, 'ownerId') // the row's Update, and ownerId's own
May.canLink(row.may, Todo, 'project', 'Link')

// ## Who the client is: `Me`

const OpenAdmin = Interaction.make('OpenAdmin')

// Shared domain code, beside the other Entities.
export const Me = Guards.me(G, {
  interactions: { [OpenAdmin.key]: [G.isAdmin] },
})

// The server: one Source among the others.
const MeSource = GuardServer.me(Me, Policy)

declare const me: Selected<typeof MeRow>
const MeRow = Entity.select(Me, { signedIn: true, key: true, may: true })
May.can(me.may, OpenAdmin.key)

// ## Sync

// The reader's own: the document's Sync contract and journal, and what reads an
// operation's cell edits; and the database `TodoSource` reads.
declare const sync: Sync<unknown, unknown>
declare const journal: JournalExchangeOptions<unknown, unknown, typeof principal>['journal']
declare const changesOf: (operation: Operation) => ReadonlyArray<CellChange>
declare const db: unknown

import { GuardSync } from 'foldkit-guard/sync'
import { databaseLayer } from 'foldkit-remote-drizzle'
import { EditableEntity } from 'foldkit-sync/entity'
import { journalExchange } from 'foldkit-sync/journal'

// Edits to titles: a member with a Read rule of its own could not be one.
const TodoEdits = EditableEntity.make(Todo, { members: ['title'] })

// Who may open it: its readers, each in the rows' Read rule. Only an admin reads every todo.
const Edits = GuardSync.document(TodoEdits, { readers: [G.isAdmin] })

// Under the journal's lock: the principal's own guards, for the Sync contract's authorize.
const authorize = { EditedTodos: GuardSync.authorize(Policy, Edits) }

// Each exchange, as its principal: whether they may open it, and each edit against its row.
journalExchange({
  sync,
  journal,
  principal,
  opens: GuardSync.opens(Policy, Edits, principal),
  admit: operation =>
    GuardSync.admit(Policy, Edits, { principal, source: TodoSource, changesOf })(operation).pipe(
      Effect.provide(databaseLayer(db)),
    ),
})

// ## Agents

// The reader's own: the client application, whose Model holds Remote's store
// at `remote` and the selected todo's id at `selected`.
const Message = defineMessageUnion({ RequestedArchive: { id: Schema.String } })
const App = Surface.application({
  Model: Schema.Struct({ remote: Remote.Model, selected: Schema.String }),
  Message,
})

import { Agent } from 'foldkit-agent'
import { GuardAgent } from 'foldkit-guard/agent'

const TodoAgent = Agent.forApplication(App).withPrincipal(G.Principal)
// The Todo an id names, read through `Row` from the client's Model.
const todo = Remote.select(Remote.at(Data, App.model.remote), Row)

TodoAgent.expose(Message, {
  RequestedArchive: {
    description: 'Archive a todo',
    authorize: GuardAgent.authorize(Archive.key, ({ input, model }) => todo(input.id).read(model)),
    available: GuardAgent.available(Archive.key, model => todo(model.selected).read(model)),
  },
})

void authorize
