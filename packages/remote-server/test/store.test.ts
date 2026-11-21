/**
 * A rule that reads other rows holds only where the store runs the writers of
 * those rows one at a time: `RemoteServer.write` refuses it, where the write
 * is registered, through a writer whose store cannot, or that names none.
 */
import { Schema } from 'effect'
import { Entity, Expr, Relation, Write } from 'foldkit-entity'
import { Mutation, Remote } from 'foldkit-remote'
import { describe, expect, it } from 'vitest'
import {
  RemoteServer,
  type EntityWriter,
  type MemoryStore,
  type StoreCapabilities,
} from '../src/index.js'

const ProjectFields = Entity.define(
  'Project',
  Schema.Struct({ id: Schema.String, status: Schema.String }),
)
const TaskFields = Entity.define(
  'Task',
  Schema.Struct({ id: Schema.String, title: Schema.String, done: Schema.Boolean }),
)
const { Project, Task } = Entity.relate(
  { Project: ProjectFields, Task: TaskFields },
  { Task: { project: Relation.one(ProjectFields) } },
)

const TitleInput = Entity.input(Task, Schema.Struct({ id: Schema.String, title: Schema.String }))
/** Reads the task's own row only. */
const Retitle = Mutation.write(
  'Retitle',
  Write.update(TitleInput, { id: 'id', when: ({ row }) => Expr.eq(row.done, false) }),
)
/** Reads the project the task points at: another row. */
const RetitleWhileOpen = Mutation.write(
  'RetitleWhileOpen',
  Write.update(TitleInput, {
    id: 'id',
    when: () => Expr.eq(Expr.path(Task.relations.project, Project.fields.status), 'open'),
  }),
)
const StatusInput = Entity.input(
  Project,
  Schema.Struct({ id: Schema.String, status: Schema.String }),
)
/** Reads every task pointing at the project: an aggregate of other rows. */
const CloseWhenEmpty = Mutation.write(
  'CloseWhenEmpty',
  Write.update(StatusInput, {
    id: 'id',
    when: () => Expr.not(Expr.exists(Task.relations.project)),
  }),
)

type Writer = EntityWriter<undefined>
const writes = {
  Retitle: { entity: Task, source: (writer: Writer) => RemoteServer.write(Retitle, writer) },
  RetitleWhileOpen: {
    entity: Task,
    source: (writer: Writer) => RemoteServer.write(RetitleWhileOpen, writer),
  },
  CloseWhenEmpty: {
    entity: Project,
    source: (writer: Writer) => RemoteServer.write(CloseWhenEmpty, writer),
  },
}

/** Registers the write over its Entity's memory writer, naming `store` or none. */
const register = (name: keyof typeof writes, store: StoreCapabilities | undefined) =>
  RemoteServer.memory({
    domain: Remote.define({
      entities: [Project, Task],
      mutations: [Retitle, RetitleWhileOpen, CloseWhenEmpty],
    }),
    rows: { Project: [], Task: [] },
    mutations: (rows: MemoryStore) => {
      // Its own refusals aside: what is under test is the store it names.
      const {
        store: _,
        refuses: __,
        ...writer
      } = RemoteServer.memoryWriter<undefined>(rows, writes[name].entity)
      return [writes[name].source(store === undefined ? writer : { ...writer, store })]
    },
  })

const stores = {
  serializable: { name: 'one-writer', isolation: 'serializable', parentRowLock: false },
  locking: { name: 'locking', isolation: 'read-committed', parentRowLock: true },
  readCommitted: { name: 'Postgres', isolation: 'read-committed', parentRowLock: false },
  eventual: { name: 'replicas', isolation: 'eventual', parentRowLock: true },
} as const satisfies Readonly<Record<string, StoreCapabilities>>

describe('a write whose rule reads other rows', () => {
  const reaching = ['RetitleWhileOpen', 'CloseWhenEmpty'] as const

  it.each(reaching)('%s is refused on a store that cannot serialize a parent', name => {
    for (const store of [stores.readCommitted, stores.eventual]) {
      const registering = () => register(name, store)
      expect(registering).toThrow(`store "${store.name}"`)
      expect(registering).toThrow(`"${name} precondition" needs parent-serialized`)
    }
  })

  it.each(reaching)('%s registers on a store that can', name => {
    expect(() => register(name, stores.serializable)).not.toThrow()
    expect(() => register(name, stores.locking)).not.toThrow()
  })

  it('is refused through a writer that names no store', () => {
    expect(() => register('RetitleWhileOpen', undefined)).toThrow(
      'write "RetitleWhileOpen precondition" reads other rows, which needs parent-serialized, but its writer for Task does not say what its store guarantees (store)',
    )
  })

  it('names an invariant that reads other rows', () => {
    const card = Schema.Struct({ id: Schema.String, title: Schema.String, done: Schema.Boolean })
    const Related = Entity.relate(
      { Board: ProjectFields, Card: Entity.define('Card', card) },
      { Card: { board: Relation.one(ProjectFields) } },
    )
    const Card = Related.Card.pipe(
      Entity.invariant(
        'boardOpen',
        ({ after }) =>
          Expr.or(
            Expr.eq(after.done, true),
            Expr.eq(Expr.path(Related.Card.relations.board, Related.Board.fields.status), 'open'),
          ),
        { message: 'The board is closed', path: ['title'] },
      ),
    )
    const Rename = Mutation.write(
      'Rename',
      Write.update(Entity.input(Card, Schema.Struct({ id: Schema.String, title: Schema.String })), {
        id: 'id',
      }),
    )
    // A memory writer does not run a path, so the writer is one of a Card with no invariant.
    const Plain = Entity.define('Card', card)
    const registering = (store: StoreCapabilities) =>
      RemoteServer.memory({
        domain: Remote.define({ entities: [Related.Board, Card], mutations: [Rename] }),
        rows: { Project: [], Card: [] },
        mutations: (rows: MemoryStore) => [
          RemoteServer.write(Rename, { ...RemoteServer.memoryWriter(rows, Plain), store }),
        ],
      })
    expect(() => registering(stores.readCommitted)).toThrow(
      '"Rename invariant "boardOpen"" needs parent-serialized',
    )
    expect(() => registering(stores.serializable)).not.toThrow()
  })
})

describe('the memory writer', () => {
  it('names a store that runs every write alone', () => {
    const named: Array<StoreCapabilities | undefined> = []
    RemoteServer.memory({
      domain: Remote.define({ entities: [Project, Task], mutations: [] }),
      rows: { Project: [], Task: [] },
      mutations: (rows: MemoryStore) => {
        named.push(RemoteServer.memoryWriter(rows, Task).store)
        return []
      },
    })
    expect(named).toEqual([{ name: 'memory', isolation: 'serializable', parentRowLock: false }])
  })
})

describe('a write whose rule reads its own row only', () => {
  it('asks nothing of its store', () => {
    expect(() => register('Retitle', undefined)).not.toThrow()
    expect(() => register('Retitle', stores.eventual)).not.toThrow()
  })
})
