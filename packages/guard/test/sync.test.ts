// @vitest-environment node
/**
 * A guard set's rules on Sync's cell edits: who may open a document of them,
 * what the journal refuses under its lock, what the exchange refuses after
 * reading the row, and the documents refused where they are declared.
 */
import { Effect, Option, Schema } from 'effect'
import { Entity, Expr } from 'foldkit-entity'
import { Remote } from 'foldkit-remote'
import { RemoteServer } from 'foldkit-remote-server'
import { DocumentId, localSequence, opId, replicaId, sequence, type Operation } from 'foldkit-sync'
import { describe, expect, it } from 'vitest'
import { Guards } from '../src/index.js'
import { GuardServer } from '../src/server.js'
import { GuardSync, type CellChange } from '../src/sync.js'

const User = Schema.Struct({
  id: Schema.String,
  role: Schema.Literals(['staff', 'pricer', 'guest']),
})
type User = typeof User.Type

const ProductFields = Entity.define(
  'Product',
  Schema.Struct({
    id: Schema.String,
    name: Schema.String,
    cents: Schema.Number,
    ownerId: Schema.String,
    secret: Schema.String,
  }),
)

const G = Guards.declare(
  'Registry',
  User,
  guard => ({
    isStaff: guard.principal(),
    isPricer: guard.principal(),
    isGuest: guard.principal(),
    isOwner: guard.row(ProductFields, p => Expr.eq(ProductFields.fields.ownerId, p.id)),
    isDowel: guard.row(ProductFields, () => Expr.eq(ProductFields.fields.name, 'Dowel')),
  }),
  { key: user => user.id },
)

const Product = ProductFields.pipe(
  Guards.attach(G, {
    row: { Read: [G.isStaff], Update: [G.isOwner] },
    members: {
      cents: {
        Update: Guards.on([G.isPricer], Guards.explain('Only a pricer may change a price.')),
      },
      secret: { Read: [G.isPricer] },
    },
  }),
)

const Policy = G.implement({
  isStaff: principal => Option.exists(principal, user => user.role !== 'guest'),
  isPricer: principal => Option.exists(principal, user => user.role === 'pricer'),
  isGuest: principal => Option.exists(principal, user => user.role === 'guest'),
})

const Edits = GuardSync.document(
  { entity: Product, members: ['name', 'cents', 'ownerId'] },
  { readers: [G.isStaff] },
)

const ada = Option.some<User>({ id: 'ada', role: 'staff' })
const pia = Option.some<User>({ id: 'pia', role: 'pricer' })
const gus = Option.some<User>({ id: 'gus', role: 'guest' })

const rows = {
  Product: [
    { id: 'p1', name: 'Dowel', cents: 120, ownerId: 'ada', secret: 's' },
    { id: 'p2', name: 'Plank', cents: 900, ownerId: 'pia', secret: 's' },
  ],
}
const source = RemoteServer.memory({
  domain: Remote.define({ entities: [Product] }),
  rows,
  principal: Option.none<User>(),
  ...GuardServer.memory(Policy, [Product]),
}).server.entities.get('Product')!

describe('GuardSync.document', () => {
  it('refuses a document whose edits could reach someone its rows hide them from', () => {
    expect(() =>
      GuardSync.document(
        { entity: Product, members: ['name', 'secret'] },
        { readers: [G.isStaff] },
      ),
    ).toThrow('secret has a Read rule of its own')
    expect(() =>
      GuardSync.document({ entity: Product, members: ['constructor'] }, { readers: [G.isStaff] }),
    ).toThrow('constructor is not a field of it')
    expect(() =>
      GuardSync.document({ entity: Product, members: ['name'] }, { readers: [G.isGuest] }),
    ).toThrow("isGuest is not in its rows' Read rule")
    expect(() =>
      GuardSync.document({ entity: Product, members: ['name'] }, { readers: [] }),
    ).toThrow('so the document names its readers')
    const Watched = ProductFields.pipe(
      Guards.attach(G, { row: { Read: [G.isStaff] }, always: [G.isOwner] }),
    )
    expect(() =>
      GuardSync.document({ entity: Watched, members: ['name'] }, { readers: [G.isStaff] }),
    ).toThrow('its `always` rules read the row')
  })

  it('opens to its readers, and to no one else', () => {
    const opens = (principal: Option.Option<User>) =>
      Effect.runSync(GuardSync.opens(Policy, Edits, principal))
    expect([opens(ada), opens(pia), opens(gus), opens(Option.none())]).toEqual([
      true,
      true,
      false,
      false,
    ])
    // A reader must also pass the Entity's `always`.
    const Priced = ProductFields.pipe(
      Guards.attach(G, { row: { Read: [G.isStaff] }, always: [G.isPricer] }),
    )
    const PricedEdits = GuardSync.document(
      { entity: Priced, members: ['name'] },
      { readers: [G.isStaff] },
    )
    expect(
      [ada, pia].map(principal => Effect.runSync(GuardSync.opens(Policy, PricedEdits, principal))),
    ).toEqual([false, true])
    // Rows anyone may read: a document of them names no readers, and is anyone's.
    const Open = GuardSync.document<User>(
      { entity: ProductFields, members: ['name'] },
      { readers: [] },
    )
    expect(
      [gus, Option.none<User>()].map(principal =>
        Effect.runSync(GuardSync.opens(Policy, Open, principal)),
      ),
    ).toEqual([true, true])
  })
})

describe('GuardSync.authorize, under the journal’s lock', () => {
  const authorize = GuardSync.authorize(Policy, Edits)
  const edit = (principal: Option.Option<User>, changes: ReadonlyArray<CellChange>) =>
    authorize({ principal, message: { changes } })

  it('refuses a changed member its principal guards refuse, with its reason', () => {
    expect(edit(ada, [{ id: 'p1', member: 'cents', value: 150 }])).toEqual({
      allowed: false,
      reason: 'Only a pricer may change a price.',
    })
    expect(edit(pia, [{ id: 'p2', member: 'cents', value: 950 }])).toBe(true)
  })

  it('leaves what reads the row to the exchange', () => {
    // isOwner is a row guard: ada may own a product, so the lock does not refuse.
    expect(edit(ada, [{ id: 'p2', member: 'name', value: 'Board' }])).toBe(true)
    // A visitor passes no row guard that reads them: refused here already.
    expect(edit(Option.none(), [{ id: 'p1', member: 'name', value: 'Rod' }])).toBe(false)
  })
})

describe('GuardSync.admit, before the journal sees an edit', () => {
  // What the edits are is `changesOf`'s to read: the operation only carries them.
  const operation: Operation = {
    protocolVersion: 1,
    schemaVersion: 1,
    documentId: DocumentId.make('products'),
    replicaId: replicaId('tab'),
    localSequence: localSequence(1),
    opId: opId('tab:1'),
    baseCursor: sequence(0),
    message: null,
  }
  const admit = (principal: Option.Option<User>, changes: ReadonlyArray<CellChange>) =>
    Effect.runPromise(
      GuardSync.admit(Policy, Edits, { principal, source, changesOf: () => changes })(operation),
    )

  it('admits an edit to a row the principal may update, and refuses one they may not', async () => {
    expect(await admit(ada, [{ id: 'p1', member: 'name', value: 'Rod' }])).toBe(true)
    expect(await admit(ada, [{ id: 'p2', member: 'name', value: 'Board' }])).toBe(false)
  })

  it('refuses a changed member’s own rule with its reason', async () => {
    expect(await admit(ada, [{ id: 'p1', member: 'cents', value: 150 }])).toEqual({
      allowed: false,
      reason: 'Only a pricer may change a price.',
    })
  })

  it('refuses an edit that would move the row out of its editor’s reach', async () => {
    expect(await admit(ada, [{ id: 'p1', member: 'ownerId', value: 'pia' }])).toBe(false)
  })

  it('refuses a row the principal cannot see', async () => {
    expect(await admit(gus, [{ id: 'p1', member: 'name', value: 'Rod' }])).toBe(false)
  })

  it('admits an operation that edits nothing', async () => {
    expect(await admit(gus, [])).toBe(true)
  })

  it('refuses a member outside the document, or a value its member cannot encode', async () => {
    expect(await admit(ada, [{ id: 'p1', member: 'constructor', value: 'x' }])).toBe(false)
    expect(await admit(ada, [{ id: 'p1', member: 'secret', value: 'x' }])).toBe(false)
    expect(await admit(ada, [{ id: 'p1', member: 'name', value: 7 }])).toBe(false)
  })

  it('judges every edit to a row together', async () => {
    // Ada may update what she owns, and any Dowel: each edit alone keeps p1 in reach.
    const Either = ProductFields.pipe(
      Guards.attach(G, { row: { Read: [G.isStaff], Update: [G.isOwner, G.isDowel] } }),
    )
    const EitherEdits = GuardSync.document(
      { entity: Either, members: ['name', 'ownerId'] },
      { readers: [G.isStaff] },
    )
    const eitherSource = RemoteServer.memory({
      domain: Remote.define({ entities: [Either] }),
      rows,
      principal: Option.none<User>(),
      ...GuardServer.memory(Policy, [Either]),
    }).server.entities.get('Product')!
    const admitEither = (changes: ReadonlyArray<CellChange>) =>
      Effect.runPromise(
        GuardSync.admit(Policy, EitherEdits, {
          principal: ada,
          source: eitherSource,
          changesOf: () => changes,
        })(operation),
      )
    expect(await admitEither([{ id: 'p1', member: 'ownerId', value: 'pia' }])).toBe(true)
    expect(await admitEither([{ id: 'p1', member: 'name', value: 'Rod' }])).toBe(true)
    expect(
      await admitEither([
        { id: 'p1', member: 'ownerId', value: 'pia' },
        { id: 'p1', member: 'name', value: 'Rod' },
      ]),
    ).toBe(false)
  })
})
