// @vitest-environment node
/**
 * A guard set: declared once over a principal's schema, implemented on the
 * server, and decided per principal and row.
 */
import { Effect, Option, Schema } from 'effect'
import { Entity, Expr } from 'foldkit-entity'
import { describe, expect, it } from 'vitest'
import { Guards } from '../src/index.js'

const User = Schema.Struct({
  id: Schema.String,
  role: Schema.Literals(['admin', 'member']),
  projectIds: Schema.Array(Schema.String),
})
type User = typeof User.Type

const TodoFields = Entity.define(
  'Todo',
  Schema.Struct({ id: Schema.String, ownerId: Schema.String, projectId: Schema.String }),
)
const Note = Entity.define('Note', Schema.Struct({ id: Schema.String, authorId: Schema.String }))

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

const Policy = G.implement({
  isAdmin: principal => Option.exists(principal, user => user.role === 'admin'),
  signedIn: principal => Option.isSome(principal) || { allowed: false, reason: 'Sign in first.' },
})

const ada: User = { id: 'ada', role: 'member', projectIds: ['p1', 'p2'] }
const root: User = { id: 'root', role: 'admin', projectIds: [] }
const todo = { id: 't1', ownerId: 'ada', projectId: 'p3' }
const shared = { id: 't2', ownerId: 'grace', projectId: 'p2' }

const decide = (
  guard: Parameters<typeof Policy.decide>[0],
  principal: Option.Option<User>,
  row?: Readonly<Record<string, unknown>>,
) => Effect.runSync(Policy.decide(guard, { principal, interaction: 'Read', row }))

describe('a principal guard', () => {
  it('is decided by the body the server supplied', () => {
    expect(decide(G.isAdmin, Option.some(root))).toBe(true)
    expect(decide(G.isAdmin, Option.some(ada))).toBe(false)
    expect(decide(G.isAdmin, Option.none())).toBe(false)
  })

  it('may refuse with a reason for the caller', () => {
    expect(decide(G.signedIn, Option.none())).toEqual({ allowed: false, reason: 'Sign in first.' })
    expect(decide(G.signedIn, Option.some(ada))).toBe(true)
  })
})

describe('a row guard', () => {
  it('reads the principal’s fields against the row', () => {
    expect(decide(G.isOwner, Option.some(ada), todo)).toBe(true)
    expect(decide(G.isOwner, Option.some(ada), shared)).toBe(false)
  })

  it('reads a list the principal holds', () => {
    expect(decide(G.inProject, Option.some(ada), shared)).toBe(true)
    expect(decide(G.inProject, Option.some(ada), todo)).toBe(false)
    expect(decide(G.inProject, Option.some(root), shared)).toBe(false)
  })

  it('passes no visitor, and no request without a row', () => {
    expect(decide(G.isOwner, Option.none(), todo)).toBe(false)
    expect(decide(G.isOwner, Option.some(ada))).toBe(false)
  })

  it('is an input named by the principal’s field, so a compiler binds it', () => {
    expect(Expr.show(G.isOwner.body)).toBe('Todo.ownerId = $principal.id')
    expect(G.inputOf(ada)).toEqual({
      'principal.id': 'ada',
      'principal.role': 'member',
      'principal.projectIds': ['p1', 'p2'],
    })
  })
})

describe('a principal’s key', () => {
  it('names one person alike across requests, and no user as a visitor', () => {
    expect(Policy.keyOf(Option.some({ ...ada }))).toBe(Policy.keyOf(Option.some(ada)))
    expect(Policy.keyOf(Option.some(ada))).not.toBe(Policy.keyOf(Option.some(root)))
    const named = { ...ada, id: Policy.keyOf(Option.none()) }
    expect(Policy.keyOf(Option.some(named))).not.toBe(Policy.keyOf(Option.none()))
  })

  it('tells one person apart once a claim the rules read has changed', () => {
    const moved = { ...ada, projectIds: ['p3'] }
    expect(Policy.keyOf(Option.some(moved))).not.toBe(Policy.keyOf(Option.some(ada)))
  })

  it('tells claims apart that JSON alone would not: a set, a bigint', () => {
    const Staff = Schema.Struct({
      id: Schema.String,
      roles: Schema.ReadonlySet(Schema.String),
      quota: Schema.BigInt,
    })
    const S = Guards.declare('Staff', Staff, guard => ({ isAdmin: guard.principal() }), {
      key: user => user.id,
      unguarded: 'allow',
    })
    const Staffed = S.implement({ isAdmin: () => true })
    const key = (roles: ReadonlyArray<string>) =>
      Staffed.keyOf(Option.some({ id: 'ada', roles: new Set(roles), quota: 3n }))
    expect(key(['admin'])).not.toBe(key([]))
    expect(key(['admin'])).toBe(key(['admin']))
  })
})

describe('a declaration', () => {
  it('refuses a row guard that reads another Entity’s field', () => {
    expect(() =>
      Guards.declare(
        'Wrong',
        User,
        guard => ({ isAuthor: guard.row(TodoFields, p => Expr.eq(Note.fields.authorId, p.id)) }),
        { key: user => user.id, unguarded: 'allow' },
      ),
    ).toThrow(/Note\.authorId/)
  })

  it('refuses a guard named as the set names its own members', () => {
    expect(() =>
      Guards.declare(
        'Reserved',
        User,
        // @ts-expect-error `implement` is the guard set's own
        guard => ({ implement: guard.principal() }),
        { key: user => user.id, unguarded: 'allow' },
      ),
    ).toThrow(/"implement"/)
  })

  it('keeps a Context key per set, read where the server provides it', () => {
    const who = Effect.runSync(
      Effect.gen(function* () {
        return yield* G.Principal
      }).pipe(Effect.provideService(G.Principal, Option.some(ada))),
    )
    expect(who).toEqual(Option.some(ada))
    expect(G.unguarded).toBe('allow')
    expect(G.key(ada)).toBe('ada')
  })
})

describe('implement', () => {
  it('refuses a body missing, or one for no principal guard', () => {
    // @ts-expect-error `signedIn` has no body
    expect(() => G.implement({ isAdmin: () => true })).toThrow(/no body for signedIn/)
    expect(() =>
      // @ts-expect-error `isOwner` is a row guard, decided by its predicate
      G.implement({ isAdmin: () => true, signedIn: () => true, isOwner: () => true }),
    ).toThrow(/isOwner is not a principal guard/)
  })

  it('refuses a guard from another set', () => {
    const Other = Guards.declare('Other', User, guard => ({ isAdmin: guard.principal() }), {
      key: user => user.id,
      unguarded: 'allow',
    })
    expect(() => decide(Other.isAdmin, Option.some(root))).toThrow(/belongs to Other/)
  })

  it('runs a body that needs a service', async () => {
    const Effectful = G.implement({
      isAdmin: principal => Effect.succeed(Option.isSome(principal)),
      signedIn: () => true,
    })
    const decided = await Effect.runPromise(
      Effectful.decide(G.isAdmin, { principal: Option.some(ada), interaction: 'Read' }),
    )
    expect(decided).toBe(true)
  })
})
