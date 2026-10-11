// @vitest-environment node
/**
 * A guard set's write rules on declared writes, over real SQLite: each write
 * checked before it lands, and answered as its writer may now see the row.
 */
import { DatabaseSync } from 'node:sqlite'
import { drizzle } from 'drizzle-orm/node-sqlite'
import { sqliteTable, text } from 'drizzle-orm/sqlite-core'
import { Effect, Option, Schema } from 'effect'
import { Entity, Expr, Relation, Write } from 'foldkit-entity'
import { Mutation, Remote } from 'foldkit-remote'
import { bind, databaseLayer, source, writer, type DrizzleDatabase } from 'foldkit-remote-drizzle'
import { RemoteServer, type EntityWriter } from 'foldkit-remote-server'
import { describe, expect, it } from 'vitest'
import { GuardDrizzle } from '../src/drizzle.js'
import { Guards, Interaction } from '../src/index.js'
import { GuardServer } from '../src/server.js'

const User = Schema.Struct({
  id: Schema.String,
  role: Schema.Literals(['admin', 'editor', 'viewer', 'member']),
})
type User = typeof User.Type

const projects = sqliteTable('projects', { id: text('id').primaryKey() })
const notes = sqliteTable('notes', {
  id: text('id').primaryKey(),
  authorId: text('author_id').notNull(),
  body: text('body').notNull(),
})
const todos = sqliteTable('todos', {
  id: text('id').primaryKey(),
  ownerId: text('owner_id').notNull(),
  title: text('title').notNull(),
  claimedBy: text('claimed_by'),
  projectId: text('project_id'),
})

const ProjectBase = Entity.define('Project', Schema.Struct({ id: Schema.String }))
const Related = Entity.relate(
  {
    Project: ProjectBase,
    Todo: Entity.define(
      'Todo',
      Schema.Struct({
        id: Schema.String,
        ownerId: Schema.String,
        title: Schema.String,
        claimedBy: Schema.NullOr(Schema.String),
      }),
    ),
  },
  { Todo: { project: Relation.one(ProjectBase, { optional: true }) } },
)

const G = Guards.declare(
  'Todos',
  User,
  guard => ({
    isAdmin: guard.principal(),
    isEditor: guard.principal(),
    isViewer: guard.principal(),
    isOwner: guard.row(Related.Todo, p => Expr.eq(Related.Todo.fields.ownerId, p.id)),
    isUnclaimed: guard.row(Related.Todo, () => Expr.isNull(Related.Todo.fields.claimedBy)),
  }),
  { key: user => user.id },
)

const Archive = Interaction.make('Archive')

const Todo = Related.Todo.pipe(
  Guards.attach(G, {
    row: {
      Read: [G.isOwner, G.isAdmin, G.isViewer],
      // An unclaimed todo is anyone's to create.
      Create: [G.isOwner, G.isAdmin, G.isUnclaimed],
      // An editor may change anyone's todo, though they read only their own.
      Update: [G.isOwner, G.isAdmin, G.isEditor],
      Delete: Guards.on([G.isAdmin], Guards.explain('Only an admin may delete a todo.')),
      [Archive.key]: Guards.on(
        [G.isOwner, G.isAdmin],
        Guards.explain('Only its owner may archive it.'),
      ),
    },
    members: { ownerId: { Create: [G.isOwner, G.isAdmin] } },
    relations: { project: { Link: [G.isAdmin], Unlink: [G.isOwner, G.isAdmin] } },
  }),
)

// Anyone may write a note: its Create has no rule, and the set leaves that open.
const NoteFields = Entity.define(
  'Note',
  Schema.Struct({ id: Schema.String, authorId: Schema.String, body: Schema.String }),
)
const Note = NoteFields.pipe(Guards.attach(G, { row: { Read: [G.isAdmin] } }))

const Policy = G.implement({
  isAdmin: principal => Option.exists(principal, user => user.role === 'admin'),
  isEditor: principal => Option.exists(principal, user => user.role === 'editor'),
  isViewer: principal => Option.exists(principal, user => user.role === 'viewer'),
})

const visible = GuardDrizzle.visible(Policy, [Todo, Note])
const Db = bind(
  { Todo, Project: Related.Project, Note },
  {
    Note: { table: notes, visible: visible.Note },
    Todo: {
      table: todos,
      relations: { project: { field: todos.projectId } },
      visible: visible.Todo,
    },
    Project: { table: projects },
  },
)

const Edit = Mutation.write(
  'EditTodo',
  Write.update(
    Entity.input(
      Todo,
      Schema.Struct({ id: Schema.String, ownerId: Schema.String, title: Schema.String }),
    ),
    { id: 'id' },
  ),
)
const Move = Mutation.write(
  'MoveTodo',
  Write.update(
    Entity.input(
      Todo,
      Schema.Struct({ id: Schema.String, projectId: Schema.NullOr(Schema.String) }),
      { projectId: Relation.input(Todo.relations.project) },
    ),
    { id: 'id' },
  ),
)
const Create = Mutation.write(
  'CreateTodo',
  Write.insert(
    Entity.input(
      Todo,
      Schema.Struct({ id: Schema.String, ownerId: Schema.String, title: Schema.String }),
    ),
    { id: 'id' },
  ),
)
const CreateBare = Mutation.write(
  'CreateBare',
  Write.insert(Entity.input(Todo, Schema.Struct({ id: Schema.String, title: Schema.String })), {
    id: 'id',
  }),
)
const CreateMine = Mutation.write(
  'CreateMine',
  Write.insert(Entity.input(Todo, Schema.Struct({ id: Schema.String, title: Schema.String })), {
    id: 'id',
  }),
)
const CreateAsAnyone = Mutation.write(
  'CreateAsAnyone',
  Write.insert(
    Entity.input(
      Todo,
      Schema.Struct({ id: Schema.String, ownerId: Schema.String, title: Schema.String }),
    ),
    { id: 'id' },
  ),
)
const CreateNote = Mutation.write(
  'CreateNote',
  Write.insert(Entity.input(Note, Schema.Struct({ id: Schema.String, body: Schema.String })), {
    id: 'id',
  }),
)
const Remove = Mutation.write(
  'RemoveTodo',
  Write.delete(Entity.input(Todo, Schema.Struct({ id: Schema.String })), { id: 'id' }),
)

const guarded = GuardServer.writer(Todo, Policy, writer(Db.Todo))
const server = RemoteServer.make<Option.Option<User>, DrizzleDatabase>({
  entities: [],
  mutations: [
    ...[Edit, Move, Create, CreateBare, Remove].map(mutation =>
      RemoteServer.write(mutation, guarded),
    ),
    RemoteServer.write(
      CreateNote,
      GuardServer.writer(Note, Policy, writer(Db.Note), { presets: { authorId: user => user.id } }),
    ),
    // The owner of a todo made here is whoever made it.
    ...[CreateMine, CreateAsAnyone].map(mutation =>
      RemoteServer.write(
        mutation,
        GuardServer.writer(Todo, Policy, writer(Db.Todo), {
          presets: { ownerId: user => user.id },
        }),
      ),
    ),
  ],
})

const ada = Option.some<User>({ id: 'ada', role: 'member' })
const ed = Option.some<User>({ id: 'ed', role: 'editor' })
const vi = Option.some<User>({ id: 'vi', role: 'viewer' })
const root = Option.some<User>({ id: 'root', role: 'admin' })

const open = () => {
  const sqlite = new DatabaseSync(':memory:')
  sqlite.exec(`
    create table projects (id text primary key);
    create table notes (id text primary key, author_id text not null, body text not null);
    create table todos (id text primary key, owner_id text not null, title text not null, claimed_by text, project_id text);
    insert into projects values ('p1');
    insert into todos values
      ('t1', 'ada', 'Own', null, null),
      ('t2', 'grace', 'Hidden', 'grace', null),
      ('t4', 'ed', 'Edited', null, null);
  `)
  const layer = databaseLayer(drizzle({ client: sqlite }))
  let requests = 0
  const mutate = (
    principal: Option.Option<User>,
    mutation: string,
    input: unknown,
    keys?: ReadonlyArray<string>,
  ) =>
    Effect.runPromise(
      RemoteServer.handlers(server, principal)
        .FoldkitRemoteMutate({
          requestId: `r${++requests}`,
          mutation,
          input,
          ...(keys === undefined ? {} : { keys }),
        })
        .pipe(Effect.result, Effect.provide(layer)),
    )
  const row = (id: string) => sqlite.prepare('select * from todos where id = ?').get(id)
  return { mutate, row }
}

describe('GuardServer.writer', () => {
  it('lets the owner edit their own row, and answers it as they see it', async () => {
    const { mutate, row } = open()
    const done = await mutate(ada, 'EditTodo', { id: 't1', ownerId: 'ada', title: 'Mine' }, [
      'title',
    ])
    expect(done).toMatchObject({
      _tag: 'Success',
      success: { entities: [{ entity: 'Todo', id: 't1', values: { title: 'Mine' } }] },
    })
    expect(row('t1')).toMatchObject({ title: 'Mine' })
  })

  it('refuses an edit of a row its writer may not see, and writes nothing', async () => {
    const { mutate, row } = open()
    const refused = await mutate(ada, 'EditTodo', { id: 't2', ownerId: 'ada', title: 'Taken' })
    expect(refused).toMatchObject({ _tag: 'Failure', failure: { _tag: 'Forbidden' } })
    expect(row('t2')).toMatchObject({ owner_id: 'grace', title: 'Hidden' })
  })

  it('refuses an edit of a row its writer may read but not update, whatever it would make it', async () => {
    const { mutate, row } = open()
    // As vi's own, t2 would be vi's to update; as it is, it is not.
    const refused = await mutate(vi, 'EditTodo', { id: 't2', ownerId: 'vi', title: 'Hidden' }, [
      'ownerId',
    ])
    expect(refused).toMatchObject({ _tag: 'Failure', failure: { _tag: 'Forbidden' } })
    expect(row('t2')).toMatchObject({ owner_id: 'grace' })
  })

  it('refuses an edit that would move the row out of its writer’s reach', async () => {
    const { mutate, row } = open()
    const refused = await mutate(ada, 'EditTodo', { id: 't1', ownerId: 'grace', title: 'Own' }, [
      'ownerId',
    ])
    expect(refused).toMatchObject({ _tag: 'Failure', failure: { _tag: 'Forbidden' } })
    expect(row('t1')).toMatchObject({ owner_id: 'ada' })
  })

  it('answers a row the edit hid from its writer as deleted', async () => {
    const { mutate, row } = open()
    // An editor may update any todo, but reads only their own.
    const done = await mutate(ed, 'EditTodo', { id: 't4', ownerId: 'grace', title: 'Edited' }, [
      'ownerId',
    ])
    expect(done).toMatchObject({
      _tag: 'Success',
      success: { entities: [], deleted: [{ entity: 'Todo', id: 't4' }] },
    })
    expect(row('t4')).toMatchObject({ owner_id: 'grace' })
  })

  it('refuses a link its relation’s rule refuses, and allows it to whom it allows', async () => {
    const { mutate, row } = open()
    expect(await mutate(ada, 'MoveTodo', { id: 't1', projectId: 'p1' })).toMatchObject({
      _tag: 'Failure',
      failure: { _tag: 'Forbidden' },
    })
    expect(row('t1')).toMatchObject({ project_id: null })
    expect(await mutate(root, 'MoveTodo', { id: 't1', projectId: 'p1' })).toMatchObject({
      _tag: 'Success',
      success: { entities: [{ values: { project: 'Project:p1' } }] },
    })
    // Pointing it where it points already links nothing.
    expect(await mutate(ada, 'MoveTodo', { id: 't1', projectId: 'p1' })).toMatchObject({
      _tag: 'Success',
    })
    // Unlinking is ruled apart, over the row: its owner may.
    expect(await mutate(ada, 'MoveTodo', { id: 't1', projectId: null })).toMatchObject({
      _tag: 'Success',
    })
    expect(row('t1')).toMatchObject({ project_id: null })
    // An editor's update is settled without reading the row, but unlinking still reads its owner.
    await mutate(root, 'MoveTodo', { id: 't4', projectId: 'p1' })
    expect(await mutate(ed, 'MoveTodo', { id: 't4', projectId: null })).toMatchObject({
      _tag: 'Success',
    })
  })

  it('checks a create over the values it proposes', async () => {
    const { mutate, row } = open()
    expect(
      await mutate(ada, 'CreateTodo', { id: 't5', ownerId: 'ada', title: 'New' }),
    ).toMatchObject({ _tag: 'Success' })
    expect(
      await mutate(ada, 'CreateTodo', { id: 't6', ownerId: 'grace', title: 'For her' }),
    ).toMatchObject({ _tag: 'Failure', failure: { _tag: 'Forbidden' } })
    expect(row('t6')).toBeUndefined()
  })

  it('refuses a create that leaves a field its rule reads unset', async () => {
    const { mutate, row } = open()
    // Unset is not unclaimed: the create never said so.
    expect(await mutate(ada, 'CreateBare', { id: 't7', title: 'Whose?' })).toMatchObject({
      _tag: 'Failure',
      failure: { _tag: 'Forbidden' },
    })
    expect(row('t7')).toBeUndefined()
  })

  it('refuses a delete with its explanation, and deletes nothing its writer cannot see', async () => {
    const { mutate, row } = open()
    expect(await mutate(ada, 'RemoveTodo', { id: 't1' })).toMatchObject({
      _tag: 'Failure',
      failure: { _tag: 'Forbidden', reason: 'Only an admin may delete a todo.' },
    })
    expect(row('t1')).toBeDefined()
    // t1 is not there for ed, who reads only his own: the delete changes nothing,
    // and answers it gone, as for a row already deleted.
    const unseen = await mutate(ed, 'RemoveTodo', { id: 't1' })
    expect(unseen).toMatchObject({
      _tag: 'Success',
      success: { deleted: [{ entity: 'Todo', id: 't1' }] },
    })
    expect(row('t1')).toBeDefined()
    expect(await mutate(root, 'RemoveTodo', { id: 't1' })).toMatchObject({
      _tag: 'Success',
      success: { deleted: [{ entity: 'Todo', id: 't1' }] },
    })
    expect(row('t1')).toBeUndefined()
  })

  it('presets a field from who is asking, and checks the create with it set', async () => {
    const { mutate, row } = open()
    expect(await mutate(ada, 'CreateMine', { id: 't8', title: 'Mine' })).toMatchObject({
      _tag: 'Success',
      success: { entities: [{ id: 't8', values: { ownerId: 'ada' } }] },
    })
    expect(row('t8')).toMatchObject({ owner_id: 'ada' })
    expect(await mutate(Option.none(), 'CreateMine', { id: 't9', title: 'Whose?' })).toMatchObject({
      _tag: 'Failure',
      failure: { _tag: 'Forbidden' },
    })
    expect(row('t9')).toBeUndefined()
  })

  it('refuses a visitor a create with a preset, where its rules would let anyone create', async () => {
    const { mutate } = open()
    expect(await mutate(ada, 'CreateNote', { id: 'n1', body: 'Hello' })).toMatchObject({
      _tag: 'Success',
    })
    expect(await mutate(Option.none(), 'CreateNote', { id: 'n2', body: 'Hi' })).toMatchObject({
      _tag: 'Failure',
      failure: { _tag: 'Forbidden' },
    })
  })

  it('refuses an input that sets a field the server presets', async () => {
    const { mutate, row } = open()
    expect(
      await mutate(ada, 'CreateAsAnyone', { id: 't8', ownerId: 'grace', title: 'Hers' }),
    ).toMatchObject({ _tag: 'Failure', failure: { message: /is preset by the server/ } })
    expect(row('t8')).toBeUndefined()
  })

  it('refuses a preset for a field the Entity does not have', () => {
    expect(() =>
      GuardServer.writer(Todo, Policy, writer(Db.Todo), {
        // @ts-expect-error a preset names a field of the Entity
        presets: { colour: () => 'red' },
      }),
    ).toThrow('Todo has no field "colour" to preset')
    GuardServer.writer(Todo, Policy, writer(Db.Todo), {
      // @ts-expect-error a preset gives the field's own type
      presets: { ownerId: () => 1 },
    })
  })
})

describe('GuardServer.validate over writes', () => {
  const Data = Remote.define({ entities: [Todo, Note, Related.Project] })
  const check = (writing: EntityWriter<Option.Option<User>, DrizzleDatabase>) => () =>
    GuardServer.validate(Policy, {
      entities: [Todo],
      domain: Data,
      server: RemoteServer.make({
        entities: [],
        mutations: [
          RemoteServer.write(Edit, writing),
          // Another Entity's write, checked as that Entity's.
          RemoteServer.write(CreateNote, GuardServer.writer(Note, Policy, writer(Db.Note))),
        ],
      }),
    })

  it('passes a declared write that lands through the guarded writer', () => {
    expect(check(guarded)).not.toThrow()
  })

  it('refuses one through a bare writer, or a writer guarded by another Policy or Entity', () => {
    const message = 'write EditTodo writes Todo without its write rules'
    expect(check(writer(Db.Todo))).toThrow(message)
    const Other = G.implement({
      isAdmin: () => false,
      isEditor: () => false,
      isViewer: () => false,
    })
    expect(check(GuardServer.writer(Todo, Other, writer(Db.Todo)))).toThrow(message)
    // A Note's writer, handed a Todo's binding: guarded, but for another Entity.
    expect(check(GuardServer.writer(Note, Policy, writer(Db.Todo)))).toThrow(message)
  })
})

describe('GuardServer.mutation', () => {
  const ArchiveTodo = Mutation.make('ArchiveTodo', { Input: { id: Schema.String }, Output: {} })
  const ImportTodos = Mutation.make('ImportTodos', { Input: {}, Output: {} })
  const seen: Array<unknown> = []
  const handled = RemoteServer.make<Option.Option<User>, DrizzleDatabase>({
    entities: [],
    mutations: [
      GuardServer.mutation(
        ArchiveTodo,
        {
          entity: Todo,
          policy: Policy,
          interaction: Archive.key,
          id: input => input.id,
          source: source(Db.Todo),
          fields: ['title'],
        },
        ({ row }) => Effect.sync(() => (seen.push(Option.getOrThrow(row)), { output: {} })),
      ),
      GuardServer.mutation(
        ImportTodos,
        { entity: Todo, policy: Policy, interaction: 'Create', source: source(Db.Todo) },
        ({ row }) => Effect.sync(() => (seen.push(row), { output: {} })),
      ),
    ],
  })
  const handle = (principal: Option.Option<User>, mutation: string, input: unknown) => {
    const sqlite = new DatabaseSync(':memory:')
    sqlite.exec(`
      create table todos (id text primary key, owner_id text not null, title text not null, claimed_by text, project_id text);
      insert into todos values ('t1', 'ada', 'Own', null, null), ('t2', 'grace', 'Hidden', null, null);
    `)
    return Effect.runPromise(
      RemoteServer.handlers(handled, principal)
        .FoldkitRemoteMutate({ requestId: 'r', mutation, input })
        .pipe(Effect.result, Effect.provide(databaseLayer(drizzle({ client: sqlite })))),
    )
  }

  it('runs a handler over the row its rule allows, read as its writer sees it', async () => {
    seen.length = 0
    expect(await handle(ada, 'ArchiveTodo', { id: 't1' })).toMatchObject({ _tag: 'Success' })
    expect(seen).toEqual([{ id: 't1', ownerId: 'ada', title: 'Own' }])
  })

  it('refuses with the rule’s explanation, and a row its writer cannot see, without running', async () => {
    seen.length = 0
    expect(await handle(vi, 'ArchiveTodo', { id: 't2' })).toMatchObject({
      _tag: 'Failure',
      failure: { _tag: 'Forbidden', reason: 'Only its owner may archive it.' },
    })
    expect(await handle(ada, 'ArchiveTodo', { id: 't2' })).toMatchObject({
      _tag: 'Failure',
      failure: { _tag: 'Forbidden' },
    })
    expect(seen).toEqual([])
  })

  it('decides a create by who is asking alone', async () => {
    seen.length = 0
    expect(await handle(ada, 'ImportTodos', {})).toMatchObject({
      _tag: 'Failure',
      failure: { _tag: 'Forbidden' },
    })
    expect(await handle(root, 'ImportTodos', {})).toMatchObject({ _tag: 'Success' })
    expect(seen).toEqual([Option.none()])
  })

  it('refuses a Source that does not apply the Read rules', () => {
    expect(() =>
      GuardServer.mutation(
        ArchiveTodo,
        {
          entity: Todo,
          policy: Policy,
          interaction: Archive.key,
          id: input => input.id,
          source: RemoteServer.entity<Option.Option<User>>(Todo, {
            read: () => Effect.succeed([]),
          }),
        },
        () => Effect.succeed({ output: {} }),
      ),
    ).toThrow("ArchiveTodo's Source does not apply Todo's Read rules")
  })
})
