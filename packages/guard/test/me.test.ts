// @vitest-environment node
/**
 * `Me`: the visitor as an Entity, served by `GuardServer.me` through the real
 * handlers, as a visitor, an admin and a member, under a set that denies what
 * it does not name.
 */
import { Effect, Option, Schema } from 'effect'
import { Entity } from 'foldkit-entity'
import { REMOTE_PROTOCOL_VERSION, Remote } from 'foldkit-remote'
import { RemoteServer } from 'foldkit-remote-server'
import { describe, expect, it } from 'vitest'
import { Guards, Interaction, May, ME } from '../src/index.js'
import { GuardServer } from '../src/server.js'

const User = Schema.Struct({ id: Schema.String, role: Schema.Literals(['admin', 'member']) })
type User = typeof User.Type

const G = Guards.declare('Site', User, guard => ({ isAdmin: guard.principal() }), {
  key: user => `user:${user.id}`,
  unguarded: 'deny',
})
const OpenAdmin = Interaction.make('OpenAdmin')
const Me = Guards.me(G, {
  interactions: {
    [OpenAdmin.key]: Guards.on([G.isAdmin], Guards.explain('Only an admin may open this.')),
  },
})
const Policy = G.implement({
  isAdmin: principal => Option.exists(principal, user => user.role === 'admin'),
})
const server = RemoteServer.make<Option.Option<User>>({ entities: [GuardServer.me(Me, Policy)] })

const visitor = Option.none<User>()
const ada = Option.some<User>({ id: 'ada', role: 'admin' })
const grace = Option.some<User>({ id: 'grace', role: 'member' })

const read = (principal: Option.Option<User>, id = ME) =>
  Effect.runPromise(
    RemoteServer.handlers(server, principal).FoldkitRemoteRead({
      version: REMOTE_PROTOCOL_VERSION,
      requests: [{ entity: 'Me', id, fields: ['signedIn', 'key', 'may'] }],
    }),
  ).then(answer => answer.entities)

/** The row as a client decodes it from the wire: through `Me`'s selection's own schema. */
const decoded = Schema.decodeUnknownSync(
  Entity.select(Me, { signedIn: true, key: true, may: true }).schema,
)

describe('Guards.me served by GuardServer.me', () => {
  it.each([
    ['a visitor', visitor, { signedIn: false, key: Option.none() }, false],
    ['an admin', ada, { signedIn: true, key: Option.some('user:ada') }, true],
    ['a member', grace, { signedIn: true, key: Option.some('user:grace') }, false],
  ])('answers %s as themselves, and what they may open', async (_, principal, self, admin) => {
    const [row] = await read(principal)
    const { may, ...values } = decoded(row!.values)
    expect(values).toEqual(self)
    expect(May.can(may, OpenAdmin.key)).toBe(admin)
    expect(May.reason(may, OpenAdmin.key)).toEqual(
      admin ? Option.none() : Option.some('Only an admin may open this.'),
    )
    // No one writes their Me.
    expect(May.can(may, 'Update')).toBe(false)
  })

  it('has no row but its own', async () => {
    expect(await read(ada, 'someone-else')).toEqual([])
  })

  it.each([
    ['denies', Me],
    [
      'allows',
      Guards.me(
        Guards.declare('Open', User, () => ({}), { key: user => user.id, unguarded: 'allow' }),
      ),
    ],
  ])('is read by anyone and written by no one where the set %s what it does not name', (_, me) => {
    expect(Guards.matrix([me]).split('\n').slice(0, 4)).toEqual([
      'Me.Read: anyone → not_found',
      'Me.Create: nobody → forbidden',
      'Me.Update: nobody → forbidden',
      'Me.Delete: nobody → forbidden',
    ])
  })

  it('names its interactions in the matrix', () => {
    expect(Guards.matrix([Me])).toEqual(
      [
        'Me.Read: anyone → not_found',
        'Me.Create: nobody → forbidden',
        'Me.Update: nobody → forbidden',
        'Me.Delete: nobody → forbidden',
        'Me.OpenAdmin: isAdmin → explain("Only an admin may open this.")',
      ].join('\n'),
    )
  })

  it("refuses a Policy of another set than Me's guards", () => {
    const H = Guards.declare('Other', User, guard => ({ isAdmin: guard.principal() }), {
      key: user => user.id,
      unguarded: 'deny',
    })
    expect(() => GuardServer.me(Me, H.implement({ isAdmin: () => true }))).toThrow(
      'Me carries the guards of Site, not Other',
    )
  })

  it("counts as applying Me's rules for its Policy, and for no other", () => {
    const domain = Remote.define({ entities: [Me] })
    // Built before either is checked: one Source's rules must not become another's.
    const Other = G.implement({ isAdmin: () => true })
    const served = RemoteServer.make<Option.Option<User>>({ entities: [GuardServer.me(Me, Other)] })
    expect(() => GuardServer.validate(Policy, { entities: [Me], domain, server })).not.toThrow()
    expect(() =>
      GuardServer.validate(Other, { entities: [Me], domain, server: served }),
    ).not.toThrow()
    expect(() => GuardServer.validate(Policy, { entities: [Me], domain, server: served })).toThrow(
      "Me's Source does not apply its Read rules",
    )
  })
})
