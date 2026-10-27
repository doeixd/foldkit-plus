// @vitest-environment node
/**
 * A guarded write pinned to the revision its rules were decided over, over
 * real SQLite: another write landing between the check and the write is
 * decided again, never written over.
 */
import { DatabaseSync } from 'node:sqlite'
import { drizzle } from 'drizzle-orm/node-sqlite'
import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core'
import { Effect, Option, Schema } from 'effect'
import { Entity, Expr, Write } from 'foldkit-entity'
import { Mutation, Remote } from 'foldkit-remote'
import {
  bind,
  databaseLayer,
  revisionTrigger,
  writer,
  type DrizzleDatabase,
} from 'foldkit-remote-drizzle'
import { RemoteServer, type EntityWriter } from 'foldkit-remote-server'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { GuardDrizzle } from '../src/drizzle.js'
import { Guards } from '../src/index.js'
import { GuardServer } from '../src/server.js'

const User = Schema.Struct({ id: Schema.String, role: Schema.Literals(['member', 'viewer']) })
type User = typeof User.Type

const todos = sqliteTable('todos', {
  id: text('id').primaryKey(),
  ownerId: text('owner_id').notNull(),
  title: text('title').notNull(),
  revision: integer('revision').notNull(),
})
const Fields = Entity.define(
  'Todo',
  Schema.Struct({
    id: Schema.String,
    ownerId: Schema.String,
    title: Schema.String,
    revision: Schema.Number,
  }),
)
const G = Guards.declare(
  'Pinned',
  User,
  guard => ({
    isViewer: guard.principal(),
    isOwner: guard.row(Fields, p => Expr.eq(Fields.fields.ownerId, p.id)),
  }),
  { key: user => user.id, unguarded: 'allow' },
)
const Todo = Fields.pipe(
  Guards.attach(G, {
    row: { Read: [G.isOwner, G.isViewer], Update: [G.isOwner], Delete: [G.isOwner] },
  }),
)
const Policy = G.implement({
  isViewer: principal => Option.exists(principal, user => user.role === 'viewer'),
})
const Db = bind(
  { Todo },
  { Todo: { table: todos, visible: GuardDrizzle.visible(Policy, [Todo]).Todo } },
)

const Retitle = Schema.Struct({ id: Schema.String, title: Schema.String })
const Edit = Mutation.write('Edit', Write.update(Entity.input(Todo, Retitle), { id: 'id' }))
const EditAt = Mutation.write(
  'EditAt',
  Write.update(Entity.input(Todo, Retitle.pipe(Schema.fieldsAssign({ revision: Schema.Number }))), {
    id: 'id',
    expect: 'revision',
  }),
)
const Add = Mutation.write(
  'Add',
  Write.insert(
    Entity.input(
      Todo,
      Schema.Struct({
        id: Schema.String,
        ownerId: Schema.String,
        title: Schema.String,
        revision: Schema.Number,
      }),
    ),
    {
      id: 'id',
    },
  ),
)
const Remove = Mutation.write(
  'Remove',
  Write.delete(Entity.input(Todo, Schema.Struct({ id: Schema.String })), { id: 'id' }),
)

const RemoveAt = Mutation.write(
  'RemoveAt',
  Write.delete(Entity.input(Todo, Schema.Struct({ id: Schema.String, revision: Schema.Number })), {
    id: 'id',
    expect: 'revision',
  }),
)

// Retitles only a todo still titled as it was made: a precondition beside the rules.
const untouched = () => Expr.eq(Fields.fields.title, 'Own')
const Rename = Mutation.write(
  'Rename',
  Write.update(Entity.input(Todo, Retitle), { id: 'id', when: untouched }),
)
const RenameAt = Mutation.write(
  'RenameAt',
  Write.update(Entity.input(Todo, Retitle.pipe(Schema.fieldsAssign({ revision: Schema.Number }))), {
    id: 'id',
    expect: 'revision',
    when: untouched,
  }),
)

const ada = Option.some<User>({ id: 'ada', role: 'member' })
const vi_ = Option.some<User>({ id: 'vi', role: 'viewer' })

/**
 * t1, ada's at revision 0, and a server whose writer runs `between` after
 * each read the guard makes, before the write: another writer's change
 * landing in the window.
 */
const open = (
  between: (sqlite: DatabaseSync) => void = () => {},
  pinned = true,
  trigger = false,
) => {
  const sqlite = new DatabaseSync(':memory:')
  sqlite.exec(`
    create table todos (id text primary key, owner_id text not null, title text not null, revision integer not null);
    insert into todos values ('t1', 'ada', 'Own', 0);
  `)
  if (trigger) sqlite.exec(revisionTrigger(Db.Todo, 'revision'))
  const bare = writer<Option.Option<User>>(Db.Todo)
  let reads = 0
  const racing: EntityWriter<Option.Option<User>, DrizzleDatabase> = {
    ...bare,
    read: context =>
      bare.read!(context).pipe(
        Effect.tap(() =>
          Effect.sync(() => {
            reads++
            between(sqlite)
          }),
        ),
      ),
  }
  const guarded = GuardServer.writer(Todo, Policy, racing, pinned ? { revision: 'revision' } : {})
  const server = RemoteServer.make<Option.Option<User>, DrizzleDatabase>({
    entities: [],
    mutations: [Edit, EditAt, Remove, RemoveAt, Rename, RenameAt].map(mutation =>
      RemoteServer.write(mutation, guarded),
    ),
  })
  const layer = databaseLayer(drizzle({ client: sqlite }))
  let requests = 0
  const mutate = (principal: Option.Option<User>, mutation: string, input: unknown) =>
    Effect.runPromise(
      RemoteServer.handlers(server, principal)
        .FoldkitRemoteMutate({ requestId: `r${++requests}`, mutation, input })
        .pipe(Effect.result, Effect.provide(layer)),
    )
  const row = () => sqlite.prepare("select * from todos where id = 't1'").get()
  return { mutate, row, reads: () => reads }
}

/** Runs `change` the first time only: one write landing in the window. */
const once = (change: string) => {
  let done = false
  return (sqlite: DatabaseSync) => {
    if (done) return
    done = true
    sqlite.exec(change)
  }
}

describe('GuardServer.writer with a revision', () => {
  it('decides again when the row moved out of reach between check and write, and refuses', async () => {
    const { mutate, row, reads } = open(
      once("update todos set owner_id = 'grace', revision = revision + 1 where id = 't1'"),
    )
    const refused = await mutate(ada, 'Edit', { id: 't1', title: 'Mine' })
    expect(refused).toMatchObject({ _tag: 'Failure', failure: { _tag: 'Forbidden' } })
    expect(row()).toMatchObject({ owner_id: 'grace', title: 'Own', revision: 1 })
    expect(reads()).toBe(2)
  })

  it('writes on the row as it now is when it moved within reach', async () => {
    const { mutate, row } = open(
      once("update todos set title = 'Theirs', revision = revision + 1 where id = 't1'"),
    )
    const done = await mutate(ada, 'Edit', { id: 't1', title: 'Mine' })
    expect(done).toMatchObject({ _tag: 'Success' })
    expect(row()).toMatchObject({ owner_id: 'ada', title: 'Mine', revision: 2 })
  })

  it('fails after three moves, having written nothing', async () => {
    const { mutate, row, reads } = open(sqlite =>
      sqlite.exec("update todos set revision = revision + 1 where id = 't1'"),
    )
    const failed = await mutate(ada, 'Edit', { id: 't1', title: 'Mine' })
    expect(failed).toMatchObject({ _tag: 'Failure' })
    expect(JSON.stringify(failed)).toContain('changed while it was written')
    expect(row()).toMatchObject({ title: 'Own', revision: 3 })
    expect(reads()).toBe(3)
  })

  it('deletes nothing when the row moved out of reach between check and write', async () => {
    const { mutate, row, reads } = open(
      once("update todos set owner_id = 'grace', revision = revision + 1 where id = 't1'"),
    )
    // Decided again, the row is hidden from ada: a delete of it changes nothing.
    await mutate(ada, 'Remove', { id: 't1' })
    expect(row()).toMatchObject({ owner_id: 'grace' })
    expect(reads()).toBe(2)
  })

  it('answers an input expecting another revision with a Conflict, before any rule', async () => {
    const { mutate, row } = open()
    // vi may read t1 but not update it: the stale revision is what is said.
    const stale = await mutate(vi_, 'EditAt', { id: 't1', title: 'Mine', revision: 5 })
    expect(stale).toMatchObject({
      _tag: 'Failure',
      failure: { _tag: 'RemoteMutationError', refusal: { _tag: 'Conflict' } },
    })
    const done = await mutate(ada, 'EditAt', { id: 't1', title: 'Mine', revision: 0 })
    expect(done).toMatchObject({ _tag: 'Success' })
    expect(row()).toMatchObject({ title: 'Mine', revision: 1 })
  })

  it('keeps a row whose delete expects another revision', async () => {
    const { mutate, row } = open()
    const stale = await mutate(ada, 'RemoveAt', { id: 't1', revision: 5 })
    expect(stale).toMatchObject({
      _tag: 'Failure',
      failure: { _tag: 'RemoteMutationError', refusal: { _tag: 'Conflict' } },
    })
    expect(row()).toMatchObject({ owner_id: 'ada' })
  })

  it('is not retried when the input pinned the write and the row moved', async () => {
    const { mutate, row, reads } = open(
      once("update todos set title = 'Theirs', revision = revision + 1 where id = 't1'"),
    )
    const conflict = await mutate(ada, 'EditAt', { id: 't1', title: 'Mine', revision: 0 })
    expect(conflict).toMatchObject({
      _tag: 'Failure',
      failure: { _tag: 'RemoteMutationError', refusal: { _tag: 'Conflict' } },
    })
    expect(row()).toMatchObject({ title: 'Theirs' })
    expect(reads()).toBe(1)
  })

  it('without a revision, writes over the change, as the README warns', async () => {
    const { mutate, row } = open(
      once("update todos set owner_id = 'grace', revision = revision + 1 where id = 't1'"),
      false,
    )
    await mutate(ada, 'Edit', { id: 't1', title: 'Mine' })
    expect(row()).toMatchObject({ owner_id: 'grace', title: 'Mine' })
  })

  it('refuses a revision not stored as a number, which the writer cannot move on', () => {
    expect(() => GuardServer.writer(Todo, Policy, writer(Db.Todo), { revision: 'title' })).toThrow(
      `Todo's revision "title" is not stored as a number`,
    )
  })

  it('refuses at run time an input expecting another field than the one it pins', async () => {
    const OwnerAt = Mutation.write(
      'OwnerAt',
      Write.update(
        Entity.input(Todo, Retitle.pipe(Schema.fieldsAssign({ ownerId: Schema.String }))),
        { id: 'id', expect: 'ownerId' },
      ),
    )
    const sqlite = new DatabaseSync(':memory:')
    sqlite.exec(
      "create table todos (id text primary key, owner_id text not null, title text not null, revision integer not null); insert into todos values ('t1', 'ada', 'Own', 0);",
    )
    const server = RemoteServer.make<Option.Option<User>, DrizzleDatabase>({
      entities: [],
      mutations: [
        RemoteServer.write(
          OwnerAt,
          GuardServer.writer(Todo, Policy, writer(Db.Todo), { revision: 'revision' }),
        ),
      ],
    })
    const failed = await Effect.runPromise(
      RemoteServer.handlers(server, ada)
        .FoldkitRemoteMutate({
          requestId: 'r1',
          mutation: 'OwnerAt',
          input: { id: 't1', title: 'Mine', ownerId: 'ada' },
        })
        .pipe(Effect.result, Effect.provide(databaseLayer(drizzle({ client: sqlite })))),
    )
    expect(failed).toMatchObject({
      _tag: 'Failure',
      failure: { message: `Todo's input expects "ownerId", but its writer pins "revision"` },
    })
    // GuardServer.validate says so at startup.
    expect(() =>
      GuardServer.validate(Policy, {
        entities: [Todo],
        domain: Remote.define({ entities: [Todo] }),
        server,
      }),
    ).toThrow("write OwnerAt expects Todo's ownerId, but its writer pins revision")
    expect(sqlite.prepare("select title from todos where id = 't1'").get()).toEqual({
      title: 'Own',
    })
  })

  it('refuses a revision the Entity does not have', () => {
    expect(() =>
      // @ts-expect-error: not a field of Todo.
      GuardServer.writer(Todo, Policy, writer(Db.Todo), { revision: 'version' }),
    ).toThrow('Todo has no field "version" for its revision')
  })
})

describe('GuardServer.validate over an unpinned writer', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })
  const validate = (options: { readonly revision?: 'revision' }) =>
    GuardServer.validate(Policy, {
      entities: [Todo],
      domain: Remote.define({ entities: [Todo] }),
      server: RemoteServer.make({
        entities: [],
        mutations: [
          RemoteServer.write(Edit, GuardServer.writer(Todo, Policy, writer(Db.Todo), options)),
        ],
      }),
    })

  it('warns, naming the write, and says nothing of a pinned one', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    validate({})
    expect(warn).toHaveBeenCalledOnce()
    expect(warn.mock.calls[0]?.[0]).toContain(
      'Edit writes through a GuardServer.writer with no revision',
    )
    warn.mockClear()
    validate({ revision: 'revision' })
    expect(warn).not.toHaveBeenCalled()
  })

  // Only a write a change can come between the check and: an update, or a delete of an
  // Entity the server updates. An insert has no row before it (#223).
  it.each([
    ['an insert and a delete, with nothing updating the Entity', [Add, Remove], []],
    ['a delete beside an update of its Entity', [Add, Remove, Edit], ['Remove', 'Edit']],
  ] as const)('names %s', (_, mutations, named) => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const unpinned = GuardServer.writer(Todo, Policy, writer(Db.Todo))
    GuardServer.validate(Policy, {
      entities: [Todo],
      domain: Remote.define({ entities: [Todo] }),
      server: RemoteServer.make({
        entities: [],
        mutations: mutations.map(mutation => RemoteServer.write(mutation, unpinned)),
      }),
    })
    expect(warn.mock.calls.map(([message]) => message)).toEqual(
      named.length === 0 ? [] : [expect.stringContaining(`${named.join(', ')} write through`)],
    )
  })
})

describe('GuardServer.writer over a write with a precondition', () => {
  const retitled = "update todos set title = 'Theirs' where id = 't1'"

  it('refuses who may not write before saying the row does not hold it', async () => {
    // The row fails the precondition too; the rules speak first.
    const { mutate } = open(sqlite => sqlite.exec(retitled))
    const grace = Option.some<User>({ id: 'grace', role: 'member' })
    // vi may read t1 but not update it; grace may not see it.
    expect(await mutate(vi_, 'Rename', { id: 't1', title: 'Mine' })).toMatchObject({
      _tag: 'Failure',
      failure: { _tag: 'Forbidden' },
    })
    expect(await mutate(grace, 'Rename', { id: 't1', title: 'Mine' })).toMatchObject({
      _tag: 'Failure',
      failure: { _tag: 'Forbidden' },
    })
  })

  it('says a stale revision before an unmet precondition', async () => {
    const { mutate } = open(sqlite => sqlite.exec(retitled))
    expect(await mutate(ada, 'RenameAt', { id: 't1', title: 'Mine', revision: 5 })).toMatchObject({
      _tag: 'Failure',
      failure: { refusal: { _tag: 'Conflict' } },
    })
  })

  it('is unmet when the row stops holding it after the check, and is not retried', async () => {
    // Retitled after the guard's read by a write that leaves the revision alone, so the pin
    // cannot see it: only the precondition, checked where the write commits, stops it.
    const { mutate, row, reads } = open(once(retitled))
    expect(await mutate(ada, 'Rename', { id: 't1', title: 'Mine' })).toMatchObject({
      _tag: 'Failure',
      failure: { refusal: { _tag: 'Unmet' } },
    })
    expect(row()).toMatchObject({ title: 'Theirs' })
    expect(reads()).toBe(1)
  })

  it('writes a row that holds it, pinned', async () => {
    const { mutate, row } = open()
    expect((await mutate(ada, 'Rename', { id: 't1', title: 'Mine' }))._tag).toBe('Success')
    expect(row()).toMatchObject({ title: 'Mine', revision: 1 })
  })
})

describe('GuardServer.writer over a table whose revision a trigger moves', () => {
  // A change of owner by raw SQL that leaves the revision alone: the pin's documented gap.
  const stolen = "update todos set owner_id = 'grace' where id = 't1'"

  it('sees a change that did not move the revision, and decides again', async () => {
    const { mutate, row, reads } = open(once(stolen), true, true)
    expect(await mutate(ada, 'Edit', { id: 't1', title: 'Mine' })).toMatchObject({
      _tag: 'Failure',
      failure: { _tag: 'Forbidden' },
    })
    expect(row()).toMatchObject({ owner_id: 'grace', title: 'Own', revision: 1 })
    expect(reads()).toBe(2)
  })

  it('without it, writes over that change, as the README warns', async () => {
    const { mutate, row } = open(once(stolen), true, false)
    await mutate(ada, 'Edit', { id: 't1', title: 'Mine' })
    expect(row()).toMatchObject({ owner_id: 'grace', title: 'Mine' })
  })
})
