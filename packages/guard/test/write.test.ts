// @vitest-environment node
/**
 * A guard set's write rules on declared writes, over real SQLite: each write
 * checked before it lands, and answered as its writer may now see the row.
 */
import { DatabaseSync } from 'node:sqlite'
import { drizzle } from 'drizzle-orm/node-sqlite'
import { sqliteTable, text } from 'drizzle-orm/sqlite-core'
import { Effect, Option, Result, Schema } from 'effect'
import { Entity, Expr, Relation, Write } from 'foldkit-entity'
import { Mutation, Remote } from 'foldkit-remote'
import { bind, databaseLayer, source, writer, type DrizzleDatabase } from 'foldkit-remote-drizzle'
import { RemoteServer, type EntityWriter, type MutationSource } from 'foldkit-remote-server'
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
  { key: user => user.id, unguarded: 'allow' },
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
    },
    interactions: {
      [Archive.key]: Guards.on(
        [G.isOwner, G.isAdmin],
        Guards.explain('Only its owner may archive it.'),
      ),
    },
    members: {
      ownerId: { Create: [G.isOwner, G.isAdmin] },
      // Who claimed a todo is an admin's to read, and an editor's of their own.
      claimedBy: { Read: [G.isAdmin, Guards.all(G.isEditor, G.isOwner)] },
    },
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
const Claim = Mutation.write(
  'ClaimTodo',
  Write.update(
    Entity.input(
      Todo,
      Schema.Struct({ id: Schema.String, claimedBy: Schema.NullOr(Schema.String) }),
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
    ...[Edit, Move, Claim, Create, CreateBare, Remove].map(mutation =>
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
  return { mutate, row, layer }
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

  it('answers a write without a member its writer may not read', async () => {
    const { mutate, row } = open()
    expect(await mutate(ada, 'ClaimTodo', { id: 't1', claimedBy: 'ada' })).toMatchObject({
      _tag: 'Success',
      success: {
        entities: [
          {
            entity: 'Todo',
            id: 't1',
            values: expect.not.objectContaining({ claimedBy: expect.anything() }),
          },
        ],
      },
    })
    expect(row('t1')).toMatchObject({ claimed_by: 'ada' })
    // What the rule read to decide (ed's ownerId) is not shown with it.
    const own = Result.getOrThrow(await mutate(ed, 'ClaimTodo', { id: 't4', claimedBy: 'ed' }))
    expect(own.entities[0]?.values).toEqual({ id: 't4', claimedBy: 'ed' })
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

// Writes over claimedBy, which only an admin or its owning editor may read.
const TitleInput = Entity.input(
  Todo,
  Schema.Struct({ id: Schema.String, title: Schema.String, guess: Schema.String }),
  { guess: Entity.unmapped },
)
// Unmet or written would say whether the guess is who claimed it, which the writer may not read.
const Probe = Mutation.write(
  'Probe',
  Write.update(TitleInput, {
    id: 'id',
    when: ({ input }) => Expr.eq(Related.Todo.fields.claimedBy, input.guess),
  }),
)
// The same probe, through an operator: the member is read under the call.
const claimedAs = Expr.operator('acme.claimedAs', {
  input: [Schema.Unknown, Schema.Unknown],
  output: Schema.Boolean,
  definedAs: (claimedBy, guess) => Expr.eq(claimedBy, guess),
})
const ProbeThrough = Mutation.write(
  'ProbeThrough',
  Write.update(TitleInput, {
    id: 'id',
    when: ({ input }) => claimedAs(Related.Todo.fields.claimedBy, input.guess),
  }),
)
const ClaimAt = Mutation.write(
  'ClaimAt',
  Write.update(
    Entity.input(
      Todo,
      Schema.Struct({
        id: Schema.String,
        title: Schema.String,
        claimedBy: Schema.NullOr(Schema.String),
      }),
    ),
    { id: 'id', expect: 'claimedBy' },
  ),
)

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

  it('refuses a precondition or an expected revision that reads a member with a Read rule', () => {
    const serving = (source: MutationSource<Option.Option<User>, DrizzleDatabase>) => () =>
      GuardServer.validate(Policy, {
        entities: [Todo],
        domain: Remote.define({ entities: [Todo, Note, Related.Project] }),
        server: RemoteServer.make({ entities: [], mutations: [source] }),
      })
    expect(serving(RemoteServer.write(Probe, guarded))).toThrow(
      "write Probe's precondition reads Todo's claimedBy, which has a Read rule",
    )
    expect(serving(RemoteServer.write(ClaimAt, guarded))).toThrow(
      "write ClaimAt expects Todo's claimedBy, which has a Read rule",
    )
    // A computed value is answered, so what it is computed from is disclosed with it.
    const CopyClaim = Mutation.write(
      'CopyClaim',
      Write.update(
        Entity.input(Todo, Schema.Struct({ id: Schema.String, ownerId: Schema.String })),
        { id: 'id', expect: 'ownerId', compute: { title: ({ row }) => row.claimedBy } },
      ),
    )
    expect(serving(RemoteServer.write(CopyClaim, guarded))).toThrow(
      "write CopyClaim computes Todo's title from its claimedBy, which has a Read rule",
    )
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
    // Note's rules over a Todo's writer are refused where they meet.
    expect(() => GuardServer.writer(Note, Policy, writer(Db.Todo))).toThrow(
      "Note's rules over a writer for Todo",
    )
  })
})

describe('GuardServer.mutation', () => {
  const ArchiveTodo = Mutation.make('ArchiveTodo', { Input: { id: Schema.String }, Output: {} })
  const ImportTodos = Mutation.make('ImportTodos', { Input: {}, Output: {} })
  const TouchTodo = Mutation.make('TouchTodo', { Input: { id: Schema.String }, Output: {} })
  const ClaimByHand = Mutation.make('ClaimByHand', {
    Input: { id: Schema.String, by: Schema.String },
    Output: {},
  })
  const GiveTodo = Mutation.make('GiveTodo', {
    Input: { id: Schema.String, to: Schema.String },
    Output: {},
  })
  // One editor's input for create and edit: no id is a new one.
  const SaveTodo = Mutation.make('SaveTodo', {
    Input: { id: Schema.OptionFromNullOr(Schema.String) },
    Output: {},
  })
  const seen: Array<unknown> = []
  let database = new DatabaseSync(':memory:')
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
      // Writes the owner, and answers the row as it claims it now is.
      GuardServer.mutation(
        GiveTodo,
        {
          entity: Todo,
          policy: Policy,
          interaction: 'Update',
          id: input => input.id,
          source: source(Db.Todo),
        },
        ({ input }) =>
          Effect.sync(() => {
            database.prepare('update todos set owner_id = ? where id = ?').run(input.to, input.id)
            return {
              output: {},
              entities: [
                { entity: 'Todo', id: input.id, values: { ownerId: input.to, title: 'Claimed' } },
              ],
            }
          }),
      ),
      GuardServer.mutation(
        SaveTodo,
        {
          entity: Todo,
          policy: Policy,
          interaction: 'Update',
          id: input => input.id,
          source: source(Db.Todo),
        },
        ({ row }) => Effect.sync(() => (seen.push(row), { output: {} })),
      ),
      // Changes nothing it names: its row is answered as there, with no values.
      GuardServer.mutation(
        TouchTodo,
        {
          entity: Todo,
          policy: Policy,
          interaction: 'Update',
          id: input => input.id,
          source: source(Db.Todo),
        },
        ({ input }) =>
          Effect.succeed({ output: {}, entities: [{ entity: 'Todo', id: input.id, values: {} }] }),
      ),
      // Answers only what it wrote; the read back must not add what its writer may not read.
      GuardServer.mutation(
        ClaimByHand,
        {
          entity: Todo,
          policy: Policy,
          interaction: 'Update',
          id: input => input.id,
          source: source(Db.Todo, { filter: GuardServer.filter(Todo, Policy) }),
        },
        ({ input }) =>
          Effect.sync(() => {
            database.prepare('update todos set claimed_by = ? where id = ?').run(input.by, input.id)
            return {
              output: {},
              entities: [{ entity: 'Todo', id: input.id, values: { claimedBy: input.by } }],
            }
          }),
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
    database = sqlite
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

  it('answers its rows as their writer now sees them, one it hid from them as deleted', async () => {
    expect(await handle(root, 'GiveTodo', { id: 't1', to: 'grace' })).toMatchObject({
      _tag: 'Success',
      success: {
        entities: [{ entity: 'Todo', id: 't1', values: { ownerId: 'grace', title: 'Own' } }],
        deleted: [],
      },
    })
    expect(await handle(ada, 'GiveTodo', { id: 't1', to: 'grace' })).toMatchObject({
      _tag: 'Success',
      success: { entities: [], deleted: [{ entity: 'Todo', id: 't1' }] },
    })
  })

  it('reads an answer back without a member its writer may not read', async () => {
    expect(await handle(ada, 'ClaimByHand', { id: 't1', by: 'ada' })).toMatchObject({
      _tag: 'Success',
      success: {
        entities: [
          { id: 't1', values: expect.not.objectContaining({ claimedBy: expect.anything() }) },
        ],
      },
    })
    expect(await handle(root, 'ClaimByHand', { id: 't1', by: 'root' })).toMatchObject({
      _tag: 'Success',
      success: { entities: [{ id: 't1', values: { claimedBy: 'root' } }] },
    })
  })

  it('answers a row its handler named with no values as still there', async () => {
    expect(await handle(ada, 'TouchTodo', { id: 't1' })).toMatchObject({
      _tag: 'Success',
      success: { entities: [{ id: 't1' }], deleted: [] },
    })
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

  it('creates where the id is absent, under Create, and edits where it is given', async () => {
    seen.length = 0
    // Ada may update the todo she owns, and may create none: she owns nothing yet.
    expect(await handle(ada, 'SaveTodo', { id: 't1' })).toMatchObject({ _tag: 'Success' })
    expect(await handle(ada, 'SaveTodo', { id: null })).toMatchObject({
      _tag: 'Failure',
      failure: { _tag: 'Forbidden' },
    })
    // An editor may update any todo, so only Create refuses their new one.
    expect(await handle(ed, 'SaveTodo', { id: null })).toMatchObject({
      _tag: 'Failure',
      failure: { _tag: 'Forbidden' },
    })
    // A viewer passes Create's isUnclaimed over t1, so only Update refuses their edit.
    expect(await handle(vi, 'SaveTodo', { id: 't1' })).toMatchObject({
      _tag: 'Failure',
      failure: { _tag: 'Forbidden' },
    })
    expect(await handle(root, 'SaveTodo', { id: null })).toMatchObject({ _tag: 'Success' })
    expect(seen).toEqual([Option.some({ id: 't1', ownerId: 'ada' }), Option.none()])
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
    // A Todo's rule is not a Project's, though neither carries guards of its own.
    expect(() =>
      GuardServer.mutation(
        ArchiveTodo,
        {
          entity: Related.Project,
          policy: Policy,
          interaction: 'Update',
          id: input => input.id,
          source: source(Db.Todo),
        },
        () => Effect.succeed({ output: {} }),
      ),
    ).toThrow("ArchiveTodo's Source does not apply Project's Read rules")
  })
})

describe('GuardServer.writer over a link its writer cannot see', () => {
  // An editor may update and point any todo, but only an admin unlinks one; no
  // one but an admin reads a project.
  const Todo = Related.Todo.pipe(
    Guards.attach(G, {
      row: { Read: [G.isEditor, G.isAdmin], Update: [G.isEditor, G.isAdmin] },
      relations: { project: { Link: [G.isEditor, G.isAdmin], Unlink: [G.isAdmin] } },
    }),
  )
  const Project = Related.Project.pipe(Guards.attach(G, { row: { Read: [G.isAdmin] } }))
  const visible = GuardDrizzle.visible(Policy, [Todo, Project])
  const Db = bind(
    { Todo, Project },
    {
      Todo: {
        table: todos,
        relations: { project: { field: todos.projectId } },
        visible: visible.Todo,
      },
      Project: { table: projects, visible: visible.Project },
    },
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
  // A writer that cannot say what is stored: every link it sees as none may be hidden.
  const { linked: _linked, ...unsure } = writer<Option.Option<User>>(Db.Todo)
  const servers = {
    exact: RemoteServer.make<Option.Option<User>, DrizzleDatabase>({
      entities: [],
      mutations: [RemoteServer.write(Move, GuardServer.writer(Todo, Policy, writer(Db.Todo)))],
    }),
    unsure: RemoteServer.make<Option.Option<User>, DrizzleDatabase>({
      entities: [],
      mutations: [RemoteServer.write(Move, GuardServer.writer(Todo, Policy, unsure))],
    }),
  }
  const move = (
    principal: Option.Option<User>,
    id: string,
    projectId: string | null,
    served: keyof typeof servers = 'exact',
  ) => {
    const sqlite = new DatabaseSync(':memory:')
    sqlite.exec(`
      create table projects (id text primary key);
      create table todos (id text primary key, owner_id text not null, title text not null, claimed_by text, project_id text);
      insert into projects values ('p1');
      insert into todos values ('t1', 'ada', 'Linked', null, 'p1'), ('t2', 'ada', 'Loose', null, null);
    `)
    return Effect.runPromise(
      RemoteServer.handlers(servers[served], principal)
        .FoldkitRemoteMutate({ requestId: 'r', mutation: 'MoveTodo', input: { id, projectId } })
        .pipe(Effect.result, Effect.provide(databaseLayer(drizzle({ client: sqlite })))),
    )
  }

  it('refuses unlinking a row hidden from its writer, and changes nothing that was empty', async () => {
    // t1 points at p1, which the editor reads as no link at all.
    expect(await move(ed, 't1', null)).toMatchObject({
      _tag: 'Failure',
      failure: { _tag: 'Forbidden' },
    })
    expect(await move(ed, 't2', null)).toMatchObject({ _tag: 'Success' })
    expect(await move(root, 't1', null)).toMatchObject({ _tag: 'Success' })
  })

  it('unlinks wherever it sees none, when the writer cannot say what is stored', async () => {
    expect(await move(ed, 't1', null, 'unsure')).toMatchObject({
      _tag: 'Failure',
      failure: { _tag: 'Forbidden' },
    })
    // Refused though nothing was linked: it cannot tell.
    expect(await move(ed, 't2', null, 'unsure')).toMatchObject({
      _tag: 'Failure',
      failure: { _tag: 'Forbidden' },
    })
    expect(await move(root, 't1', null, 'unsure')).toMatchObject({ _tag: 'Success' })
  })
})

describe('GuardServer.writer over a write that reads a hidden member', () => {
  // No validate here: the writer refuses on its own.
  const server = RemoteServer.make<Option.Option<User>, DrizzleDatabase>({
    entities: [],
    mutations: [
      RemoteServer.write(Probe, guarded),
      RemoteServer.write(ProbeThrough, guarded),
      RemoteServer.write(ClaimAt, guarded),
    ],
  })
  const send = (mutation: string, input: unknown) =>
    Effect.runPromise(
      RemoteServer.handlers(server, ada)
        .FoldkitRemoteMutate({ requestId: mutation, mutation, input })
        .pipe(Effect.result, Effect.provide(open().layer)),
    )

  it('refuses a precondition that reads it, whatever the row holds', async () => {
    expect(await send('Probe', { id: 't1', title: 'Mine', guess: 'grace' })).toMatchObject({
      _tag: 'Failure',
      failure: { message: "Todo's write reads claimedBy, which a Read rule hides from its writer" },
    })
  })

  it('refuses a precondition that reads it through an operator call', async () => {
    expect(await send('ProbeThrough', { id: 't1', title: 'Mine', guess: 'grace' })).toMatchObject({
      _tag: 'Failure',
      failure: { message: "Todo's write reads claimedBy, which a Read rule hides from its writer" },
    })
  })

  it('refuses an expected revision that names it', async () => {
    expect(await send('ClaimAt', { id: 't1', title: 'Mine', claimedBy: null })).toMatchObject({
      _tag: 'Failure',
      failure: { message: "Todo's write reads claimedBy, which a Read rule hides from its writer" },
    })
  })
})
