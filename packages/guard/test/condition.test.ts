// @vitest-environment node
/**
 * Read rules decided for one principal: principal guards answered by their
 * bodies, row guards left as a condition over the row for an interpreter.
 */
import { Effect, Option, Schema } from 'effect'
import { Entity, Expr, Operators, Relation, type AnyEntity } from 'foldkit-entity'
import { describe, expect, it } from 'vitest'
import { Condition, Guards, Interaction } from '../src/index.js'

const User = Schema.Struct({
  id: Schema.String,
  role: Schema.Literals(['admin', 'member']),
  projectIds: Schema.Array(Schema.String),
})
type User = typeof User.Type

const ProjectBase = Entity.define('Project', Schema.Struct({ id: Schema.String }))
const { Project, Todo: TodoFields } = Entity.relate(
  {
    Project: ProjectBase,
    Todo: Entity.define(
      'Todo',
      Schema.Struct({
        id: Schema.String,
        ownerId: Schema.String,
        projectId: Schema.String,
        email: Schema.String,
        notes: Schema.String,
      }),
    ),
  },
  { Todo: { project: Relation.one(ProjectBase) } },
)

const G = Guards.declare(
  'Todos',
  User,
  guard => ({
    isAdmin: guard.principal(),
    signedIn: guard.principal(),
    isOwner: guard.row(TodoFields, p => Expr.eq(TodoFields.fields.ownerId, p.id)),
    inProject: guard.row(TodoFields, p => Expr.in(TodoFields.fields.projectId, p.projectIds)),
  }),
  { key: user => user.id, unguarded: 'allow' },
)

const Todo = TodoFields.pipe(
  Guards.attach(G, {
    row: { Read: [G.isOwner, G.inProject, G.isAdmin, Guards.all(G.signedIn, G.isAdmin)] },
    members: {
      email: { Read: Guards.on([G.isOwner], Guards.redact('hidden')) },
      notes: { Read: [G.isAdmin] },
    },
    always: [G.signedIn],
  }),
)

let asked = 0
const Policy = G.implement({
  isAdmin: principal => {
    asked += 1
    return Option.exists(principal, user => user.role === 'admin')
  },
  signedIn: principal => Option.isSome(principal),
})

const ada: User = { id: 'ada', role: 'member', projectIds: ['p1'] }
const root: User = { id: 'root', role: 'admin', projectIds: [] }
const own = { id: 't1', ownerId: 'ada', projectId: 'p9', email: 'a@x', notes: '' }
const shared = { id: 't2', ownerId: 'grace', projectId: 'p1', email: 'g@x', notes: '' }
const other = { id: 't3', ownerId: 'grace', projectId: 'p2', email: 'g@x', notes: '' }

const readable = (entity: AnyEntity, user: Option.Option<User>) =>
  Effect.runSync(Policy.readable(entity, user))

const rowsFor = (user: Option.Option<User>, entity = Todo) => {
  const condition = readable(entity, user)
  return [own, shared, other]
    .filter(row =>
      Condition.holds(condition, row, Policy.inputOf(user), () => false, Policy.operators),
    )
    .map(row => row.id)
}

describe('a row its rules cannot judge', () => {
  it('does not hold, rather than ending the request, when the row holds a NUL', () => {
    // `isOwner` compares the stored owner, which no interpreter answers for here.
    const row = { ...own, ownerId: `ada${String.fromCharCode(0)}` }
    const user = Option.some(ada)
    expect(
      Condition.holds(
        readable(Todo, user),
        row,
        Policy.inputOf(user),
        () => false,
        Policy.operators,
      ),
    ).toBe(false)
  })
})

describe('a body that refuses with a reason', () => {
  // `{ allowed: false, reason }` is an object, and so truthy: it must still refuse.
  const Refusing = G.implement({
    isAdmin: () => ({ allowed: false, reason: 'Only an admin.' }),
    signedIn: () => true,
  })
  it('refuses inside a rule as a plain refusal does', () => {
    const Admins = TodoFields.pipe(
      Guards.attach(G, { row: { Read: [G.isAdmin], Update: [G.isAdmin] } }),
    )
    const someone = Option.some(root)
    expect(Effect.runSync(Refusing.readable(Admins, someone))).toEqual(Condition.never)
    expect(Effect.runSync(Refusing.writable(Admins, someone, 'Update')).condition).toEqual(
      Condition.never,
    )
  })
})

describe('Policy.readable', () => {
  it('leaves the row guards of a disjunction a principal guard did not settle', () => {
    asked = 0
    expect(rowsFor(Option.some(ada))).toEqual(['t1', 't2'])
    // isAdmin is named twice, and asked once.
    expect(asked).toBe(1)
    expect(Condition.members(readable(Todo, Option.some(ada)))).toEqual(['ownerId', 'projectId'])
  })

  it('settles the whole condition when a principal guard decides it', () => {
    expect(readable(Todo, Option.some(root))).toBe(Condition.always)
    expect(readable(Todo, Option.none())).toBe(Condition.never)
  })

  it('reads an Entity without guards as open, and a Read left unruled by the set’s default', () => {
    expect(readable(Project, Option.none())).toBe(Condition.always)
    const Closed = Guards.declare('Closed', User, guard => ({ signedIn: guard.principal() }), {
      key: user => user.id,
      unguarded: 'deny',
    })
    const Locked = Project.pipe(Guards.attach(Closed, { always: [Closed.signedIn] }))
    const policy = Closed.implement({ signedIn: Option.isSome })
    expect(Effect.runSync(policy.readable(Locked, Option.some(ada)))).toBe(Condition.never)
    const Open = Project.pipe(Guards.attach(G, { always: [G.signedIn] }))
    expect(readable(Open, Option.some(ada))).toBe(Condition.always)
    expect(readable(Open, Option.none())).toBe(Condition.never)
  })

  it('passes a visitor no row guard, and a conjunction only when every part holds', () => {
    const Both = TodoFields.pipe(
      Guards.attach(G, { row: { Read: [Guards.all(G.isAdmin, G.isOwner), G.inProject] } }),
    )
    expect(rowsFor(Option.some(ada), Both)).toEqual(['t2'])
    expect(rowsFor(Option.some({ ...root, id: 'grace' }), Both)).toEqual(['t2', 't3'])
    expect(rowsFor(Option.none(), Both)).toEqual([])
  })

  it('passes a visitor a row guard over the row alone', () => {
    const Open = Guards.declare(
      'Open',
      User,
      guard => ({ isShared: guard.row(TodoFields, () => Expr.eq(TodoFields.fields.email, 'g@x')) }),
      { key: user => user.id, unguarded: 'allow' },
    )
    const Shared = TodoFields.pipe(Guards.attach(Open, { row: { Read: [Open.isShared] } }))
    const Opened = Open.implement({})
    const condition = Effect.runSync(Opened.readable(Shared, Option.none()))
    expect(
      [own, shared, other]
        .filter(row =>
          Condition.holds(
            condition,
            row,
            Opened.inputOf(Option.none()),
            () => false,
            Opened.operators,
          ),
        )
        .map(row => row.id),
    ).toEqual(['t2', 't3'])
    const decided = (row: typeof own) =>
      Effect.runSync(
        Opened.decide(Open.isShared, { principal: Option.none(), interaction: 'Read', row }),
      )
    expect([decided(own), decided(shared)]).toEqual([false, true])
  })

  it('asks the caller whether an inherited row is readable', () => {
    const Inherits = TodoFields.pipe(
      Guards.attach(G, { row: { Read: [Guards.inherit('project')] } }),
    )
    const condition = readable(Inherits, Option.some(ada))
    const followed: Array<string> = []
    const holds = Condition.holds(
      condition,
      own,
      {},
      relation => {
        followed.push(relation)
        return true
      },
      Policy.operators,
    )
    expect([holds, followed]).toEqual([true, ['project']])
    expect(Condition.members(condition)).toEqual(['project'])
  })

  it('refuses an Entity carrying another set’s guards', () => {
    const Other = Guards.declare('Other', User, guard => ({ signedIn: guard.principal() }), {
      key: user => user.id,
      unguarded: 'allow',
    })
    const Elsewhere = Project.pipe(Guards.attach(Other, { always: [Other.signedIn] }))
    expect(() => readable(Elsewhere, Option.some(ada))).toThrow(
      /Project carries the guards of Other/,
    )
  })
})

describe('Condition.unsetting', () => {
  it('refuses every row guard reading an unset field, whatever it asks of it', () => {
    const D = Guards.declare(
      'Drafts',
      User,
      guard => ({
        claimed: guard.row(TodoFields, () => Expr.isNotNull(TodoFields.fields.notes)),
        unclaimed: guard.row(TodoFields, () => Expr.isNull(TodoFields.fields.notes)),
        mentions: guard.row(TodoFields, () => Expr.contains(TodoFields.fields.notes, 'x')),
        owned: guard.row(TodoFields, p => Expr.eq(TodoFields.fields.ownerId, p.id)),
      }),
      { key: user => user.id, unguarded: 'allow' },
    )
    const unset = new Set(['notes'])
    // Every followed row is readable here, so only `unset` can refuse one.
    const holds = (condition: Condition) =>
      Condition.holds(
        Condition.unsetting(condition, unset),
        { ownerId: 'ada' },
        { 'principal.id': 'ada' },
        () => true,
        Operators.kernel,
      )
    for (const guard of [D.claimed, D.unclaimed, D.mentions]) {
      expect(holds({ _tag: 'Row', guard })).toBe(false)
    }
    // A guard over set fields still decides; a disjunction keeps it.
    expect(holds({ _tag: 'Row', guard: D.owned })).toBe(true)
    expect(
      holds(
        Condition.or([
          { _tag: 'Row', guard: D.claimed },
          { _tag: 'Row', guard: D.owned },
        ]),
      ),
    ).toBe(true)
    expect(holds({ _tag: 'Inherit', relation: 'notes' })).toBe(false)
  })
})

describe('Policy.readMembers', () => {
  it('decides each ruled member, with the refusal it shows', () => {
    const members = Effect.runSync(
      Policy.readMembers(Todo, Option.some(ada), ['email', 'notes', 'ownerId']),
    )
    expect(members.map(({ member, deny }) => [member, deny._tag])).toEqual([
      ['email', 'Redact'],
      ['notes', 'Omit'],
    ])
    const [email, notes] = members
    const input = Policy.inputOf(Option.some(ada))
    const { operators } = Policy
    expect(Condition.holds(email!.condition, own, input, () => false, operators)).toBe(true)
    expect(Condition.holds(email!.condition, shared, input, () => false, operators)).toBe(false)
    expect(notes!.condition).toBe(Condition.never)
  })
})

describe('write rules', () => {
  const Archive = Interaction.make('Archive')
  const Writable = TodoFields.pipe(
    Guards.attach(G, {
      row: {
        Write: [G.isOwner, G.isAdmin],
      },
      interactions: {
        [Archive.key]: Guards.on([G.isAdmin], Guards.explain('Only an admin may archive.')),
      },
      members: { ownerId: { Update: [G.isAdmin] } },
      relations: { project: { Link: [G.inProject] } },
      always: [G.signedIn],
    }),
  )
  const told: Array<string> = []
  const Telling = G.implement({
    isAdmin: principal => Option.exists(principal, user => user.role === 'admin'),
    signedIn: (principal, { interaction }) => {
      told.push(interaction)
      return Option.isSome(principal)
    },
  })
  const holds = (condition: Condition, user: User, row: Readonly<Record<string, unknown>>) =>
    Condition.holds(
      condition,
      row,
      Telling.inputOf(Option.some(user)),
      () => false,
      Telling.operators,
    )

  it('decides a row’s write by its interaction, its bodies told which one', () => {
    told.length = 0
    const update = Effect.runSync(Telling.writable(Writable, Option.some(ada), 'Update'))
    expect(told).toEqual(['Update'])
    expect(update.deny).toEqual({ _tag: 'Forbidden' })
    expect(holds(update.condition, ada, own)).toBe(true)
    expect(holds(update.condition, ada, shared)).toBe(false)
    expect(Effect.runSync(Telling.writable(Writable, Option.some(root), 'Delete')).condition).toBe(
      Condition.always,
    )
    expect(Effect.runSync(Telling.writable(Writable, Option.none(), 'Create')).condition).toBe(
      Condition.never,
    )
  })

  it('refuses a named interaction with its explanation', () => {
    const archive = Effect.runSync(Telling.writable(Writable, Option.some(ada), Archive.key))
    expect(archive).toEqual({
      condition: Condition.never,
      deny: { _tag: 'Explain', reason: 'Only an admin may archive.' },
    })
  })

  it('decides setting a member, its Update governing its Create', () => {
    for (const interaction of ['Create', 'Update'] as const) {
      const [ownerId] = Effect.runSync(
        Telling.writeMembers(Writable, Option.some(ada), ['ownerId', 'email'], interaction),
      )
      expect(ownerId).toEqual({
        member: 'ownerId',
        condition: Condition.never,
        deny: { _tag: 'Forbidden' },
      })
    }
    expect(
      Effect.runSync(Telling.writeMembers(Writable, Option.some(root), ['ownerId'], 'Update')),
    ).toMatchObject([{ member: 'ownerId', condition: Condition.always }])
  })

  it('decides linking a relation over the parent row, and none where it has no rule', () => {
    const link = Option.getOrThrow(
      Effect.runSync(Telling.linkable(Writable, Option.some(ada), 'project', 'Link')),
    )
    expect(holds(link.condition, ada, shared)).toBe(true)
    expect(holds(link.condition, ada, other)).toBe(false)
    expect(
      Effect.runSync(Telling.linkable(Writable, Option.some(ada), 'project', 'Unlink')),
    ).toEqual(Option.none())
  })
})
