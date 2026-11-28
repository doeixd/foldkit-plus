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

const domain = Remote.define({
  entities: [Project, Task],
  mutations: [Retitle, RetitleWhileOpen, CloseWhenEmpty],
})

/** Registers the write over its Entity's memory writer, naming `store`, with `more` said of it. */
const register = (
  name: keyof typeof writes,
  store: StoreCapabilities,
  more: Partial<Writer> = {},
) =>
  RemoteServer.memory({
    domain,
    rows: { Project: [], Task: [] },
    mutations: (rows: MemoryStore) => {
      // Its own refusals aside: what is under test is the store it names.
      const { refuses: _, ...writer } = RemoteServer.memoryWriter<undefined>(
        rows,
        writes[name].entity,
      )
      return [writes[name].source({ ...writer, ...more, store })]
    },
  })

/** Registers the write over a memory writer with its `store` taken away. */
const registerUnnamed = (name: keyof typeof writes) =>
  RemoteServer.memory({
    domain,
    rows: { Project: [], Task: [] },
    mutations: (rows: MemoryStore) => {
      const {
        store: _,
        refuses: __,
        ...writer
      } = RemoteServer.memoryWriter<undefined>(rows, writes[name].entity)
      // @ts-expect-error a writer names its store
      return [writes[name].source(writer)]
    },
  })

const stores = {
  serializable: {
    name: 'one-writer',
    isolation: 'serializable',
    isolates: 'transaction',
    parentRowLock: false,
  },
  locking: {
    name: 'locking',
    isolation: 'read-committed',
    isolates: 'transaction',
    parentRowLock: true,
  },
  readCommitted: {
    name: 'Postgres',
    isolation: 'read-committed',
    isolates: 'transaction',
    parentRowLock: false,
  },
  eventual: { name: 'replicas', isolation: 'eventual', parentRowLock: true },
  /** Serializable for one statement or batch, no further: D1. */
  statement: { name: 'D1', isolation: 'serializable', isolates: 'statement', parentRowLock: false },
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

  describe('on a store whose isolation reaches one statement', () => {
    it.each(reaching)(
      '%s is refused through a writer that may judge it from a read first',
      name => {
        expect(() => register(name, stores.statement)).toThrow(
          `store "D1" (serializable per statement, does not lock the parent row) cannot hold:\n  - "${name} precondition" needs parent-serialized (writers of the rows under one parent run one at a time), judged from a read before the write: it reads other rows`,
        )
      },
    )

    it.each(reaching)('%s registers through a writer that judges it in its statement', name => {
      expect(() => register(name, stores.statement, { judgesInStatement: true })).not.toThrow()
    })

    it('judging in the statement does not let a read-committed store hold it', () => {
      expect(() =>
        register('RetitleWhileOpen', stores.readCommitted, { judgesInStatement: true }),
      ).toThrow('judged in the statement that writes: it reads other rows')
    })
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

describe("a writer's own rules over other rows", () => {
  const needs = () => [
    {
      rule: 'guard "projectOpen"',
      needs: 'parent-serialized' as const,
      because: 'it reads another row',
      judged: 'in-statement' as const,
    },
  ]

  it('are held to the store with the write, named under the write', () => {
    expect(() => register('Retitle', stores.readCommitted, { needs })).toThrow(
      '"Retitle guard "projectOpen"" needs parent-serialized (writers of the rows under one parent run one at a time), judged in the statement that writes: it reads another row',
    )
    expect(() => register('Retitle', stores.statement, { needs })).not.toThrow()
  })

  it('are asked of the write being registered', () => {
    const asked: Array<string> = []
    register('Retitle', stores.serializable, {
      needs: write => {
        asked.push(write._tag)
        return []
      },
    })
    expect(asked).toEqual(['Update'])
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
    expect(named).toEqual([
      { name: 'memory', isolation: 'serializable', isolates: 'transaction', parentRowLock: false },
    ])
  })
})

describe('a write whose rule reads its own row only', () => {
  it('asks nothing of its store', () => {
    expect(() => register('Retitle', stores.eventual)).not.toThrow()
  })
})

describe('a writer that names no store', () => {
  it.each(['Retitle', 'RetitleWhileOpen', 'CloseWhenEmpty'] as const)(
    '%s is refused at registration, whatever its rule reads',
    name => {
      expect(() => registerUnnamed(name)).toThrow(
        `write "${name}" writes through a writer for ${writes[name].entity.name} that names no store (store)`,
      )
    },
  )
})

describe('an insert with a cross-row invariant', () => {
  const fields = Schema.Struct({ id: Schema.String, title: Schema.String, done: Schema.Boolean })
  const Related = Entity.relate(
    { Board: ProjectFields, Item: Entity.define('Item', fields) },
    { Item: { board: Relation.one(ProjectFields) } },
  )
  const Guarded = Related.Item.pipe(
    Entity.invariant(
      'boardOpen',
      ({ after }) =>
        Expr.or(
          Expr.eq(after.done, true),
          Expr.eq(Expr.path(Related.Item.relations.board, Related.Board.fields.status), 'open'),
        ),
      { message: 'The board is closed', path: ['title'] },
    ),
  )
  const AddItem = Mutation.write(
    'AddItem',
    Write.insert(
      Entity.input(
        Guarded,
        Schema.Struct({
          id: Schema.String,
          title: Schema.String,
          done: Schema.Boolean,
          boardId: Schema.String,
        }),
        { boardId: Relation.input(Related.Item.relations.board) },
      ),
      { id: 'id' },
    ),
  )
  const Plain = Entity.define('Item', fields)
  const insertDomain = Remote.define({ entities: [Related.Board, Guarded], mutations: [AddItem] })
  const registerInsert = (store: StoreCapabilities, judgesInStatement: boolean) =>
    RemoteServer.memory({
      domain: insertDomain,
      rows: { Project: [], Item: [] },
      mutations: (rows: MemoryStore) => {
        const { refuses: _, ...base } = RemoteServer.memoryWriter<undefined>(rows, Plain)
        return [
          RemoteServer.write(AddItem, {
            ...base,
            store,
            ...(judgesInStatement ? { judgesInStatement: true } : {}),
          }),
        ]
      },
    })

  it('is always judged read-first, so a statement-isolated store refuses it even when the writer declares judgesInStatement', () => {
    expect(() => registerInsert(stores.statement, true)).toThrow(
      '"AddItem invariant "boardOpen"" needs parent-serialized (writers of the rows under one parent run one at a time), judged from a read before the write: it reads other rows',
    )
    expect(() => registerInsert(stores.serializable, true)).not.toThrow()
  })
})

describe('a delete clearing a child whose invariant reads another row', () => {
  const TeamFields = Entity.define(
    'Team',
    Schema.Struct({ id: Schema.String, locked: Schema.Boolean }),
  )
  const FolderFields = Entity.define('Folder', Schema.Struct({ id: Schema.String }))
  const DocFields = Entity.define('Doc', Schema.Struct({ id: Schema.String }))
  const Related = Entity.relate(
    { Team: TeamFields, Folder: FolderFields, Doc: DocFields },
    {
      Doc: {
        folder: Relation.one(FolderFields, { optional: true, onDelete: 'setNull' }),
        team: Relation.one(TeamFields),
      },
    },
  )
  const Doc = Related.Doc.pipe(
    Entity.invariant(
      'unlockedTeam',
      ({ after }) =>
        Expr.or(
          Expr.isNotNull(after.folder),
          Expr.eq(Expr.path(Related.Doc.relations.team, Related.Team.fields.locked), false),
        ),
      { message: 'Team is locked' },
    ),
  )
  const DeleteFolder = Mutation.write(
    'DeleteFolder',
    Write.delete(Entity.input(Related.Folder, Schema.Struct({ id: Schema.String })), { id: 'id' }),
  )
  const clearDomain = Remote.define({
    entities: [Related.Team, Related.Folder, Doc],
    mutations: [DeleteFolder],
  })
  const registerDelete = (store: StoreCapabilities) =>
    RemoteServer.memory({
      domain: clearDomain,
      rows: { Team: [], Folder: [], Doc: [] },
      mutations: (rows: MemoryStore) => {
        const { refuses: _, ...base } = RemoteServer.memoryWriter<undefined>(rows, FolderFields)
        return [
          RemoteServer.write(DeleteFolder, {
            ...base,
            clears: true,
            foreignKey: () => true,
            judgesInStatement: true,
            store,
          }),
        ]
      },
    })

  it('is refused on read-committed Postgres even when a foreign key holds the cleared link', () => {
    expect(() => registerDelete(stores.readCommitted)).toThrow(
      '"DeleteFolder clear invariant "Doc.unlockedTeam"" needs parent-serialized',
    )
    expect(() => registerDelete(stores.serializable)).not.toThrow()
  })
})
