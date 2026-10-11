// @vitest-environment node
/**
 * Read rules decided for one principal: principal guards answered by their
 * bodies, row guards left as a condition over the row for an interpreter.
 */
import { Effect, Option, Schema } from 'effect'
import { Entity, Expr, Relation, type AnyEntity } from 'foldkit-entity'
import { describe, expect, it } from 'vitest'
import { Condition, Guards } from '../src/index.js'

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
  { key: user => user.id },
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
    .filter(row => Condition.holds(condition, row, Policy.inputOf(user), () => false))
    .map(row => row.id)
}

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

  it('asks the caller whether an inherited row is readable', () => {
    const Inherits = TodoFields.pipe(
      Guards.attach(G, { row: { Read: [Guards.inherit('project')] } }),
    )
    const condition = readable(Inherits, Option.some(ada))
    const followed: Array<string> = []
    const holds = Condition.holds(condition, own, {}, relation => {
      followed.push(relation)
      return true
    })
    expect([holds, followed]).toEqual([true, ['project']])
    expect(Condition.members(condition)).toEqual(['project'])
  })

  it('refuses an Entity carrying another set’s guards', () => {
    const Other = Guards.declare('Other', User, guard => ({ signedIn: guard.principal() }), {
      key: user => user.id,
    })
    const Elsewhere = Project.pipe(Guards.attach(Other, { always: [Other.signedIn] }))
    expect(() => readable(Elsewhere, Option.some(ada))).toThrow(
      /Project carries the guards of Other/,
    )
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
    expect(Condition.holds(email!.condition, own, input, () => false)).toBe(true)
    expect(Condition.holds(email!.condition, shared, input, () => false)).toBe(false)
    expect(notes!.condition).toBe(Condition.never)
  })
})
