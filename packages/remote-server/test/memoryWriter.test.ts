/**
 * `RemoteServer.memoryWriter`: declared writes landed over a memory backend's
 * rows through the real handlers, each refusal answered as the mutation's own,
 * and a write landed end to end through `Law.check`.
 */
import { Effect, Schema } from 'effect'
import { defineMessageUnion } from 'foldkit/message'
import { Entity, Expr, Operators, Relation, Write, type AnyEntity } from 'foldkit-entity'
import { Mutation, Refusal, Remote } from 'foldkit-remote'
import { Law } from 'foldkit-remote/testing'
import { Surface } from 'foldkit-surface'
import { describe, expect, it } from 'vitest'
import { RemoteServer, type MemoryStore } from '../src/index.js'

const concat = Expr.operator('acme.concat', {
  input: [Schema.String, Schema.String],
  output: Schema.String,
})
const operators = Operators.memory(Operators.implement(concat, (left, right) => `${left}${right}`))

const OwnerFields = Entity.define(
  'Owner',
  Schema.Struct({ id: Schema.String, name: Schema.String }),
)
const StockFields = Entity.define(
  'Stock',
  Schema.Struct({
    id: Schema.String,
    name: Schema.String,
    label: Schema.String,
    status: Schema.String,
    quantity: Schema.Int,
    reserved: Schema.Int,
    revision: Schema.Int,
  }),
)
const Related = Entity.relate(
  { Owner: OwnerFields, Stock: StockFields },
  { Stock: { owner: Relation.one(OwnerFields) } },
)
const { Owner } = Related
const Stock = Related.Stock.pipe(
  Entity.invariant(
    'reservedWithinQuantity',
    ({ after }) => Expr.lte(after.reserved, after.quantity),
    { message: 'Reserved stock cannot exceed the quantity', path: ['reserved'] },
  ),
)

/** Over numbers, so no write into it is proved where declared: each is held to it where it lands. */
const Available = Entity.refine(Stock, 'Available', ({ row }) =>
  Expr.gt(row.quantity, row.reserved),
)

const Reserve = Mutation.write(
  'Reserve',
  Write.update(
    Entity.input(
      Stock,
      Schema.Struct({ id: Schema.String, revision: Schema.Int, quantity: Schema.Int }),
      { quantity: Entity.unmapped },
    ),
    {
      id: 'id',
      expect: 'revision',
      when: () => Expr.eq(Stock.fields.status, 'published'),
      increment: { reserved: 'quantity' },
    },
  ),
)
/** Sets the name and computes the label from the name the row held before. */
const Rename = Mutation.write(
  'Rename',
  Write.update(
    Entity.input(
      Stock,
      Schema.Struct({
        id: Schema.String,
        revision: Schema.Int,
        name: Schema.String,
        prefix: Schema.String,
      }),
      { prefix: Entity.unmapped },
    ),
    {
      id: 'id',
      expect: 'revision',
      compute: { label: ({ row, input }) => concat(input.prefix, row.name) },
    },
  ),
)
const Relabel = Mutation.write(
  'Relabel',
  Write.update(
    Entity.input(
      Stock,
      Schema.Struct({ id: Schema.String, revision: Schema.Int, label: Schema.String }),
    ),
    { id: 'id', expect: 'revision' },
  ),
)
const List = Mutation.write(
  'List',
  Write.insert(
    Entity.input(
      Stock,
      Schema.Struct({
        id: Schema.String,
        name: Schema.String,
        label: Schema.String,
        status: Schema.String,
        quantity: Schema.Int,
        reserved: Schema.Int,
        revision: Schema.Int,
        ownerId: Schema.String,
      }),
      { ownerId: 'owner' },
    ),
    { id: 'id', becomes: Available },
  ),
)
/** Takes from the quantity, and leaves some unreserved: its postcondition. */
const Take = Mutation.write(
  'Take',
  Write.update(
    Entity.input(
      Stock,
      Schema.Struct({ id: Schema.String, revision: Schema.Int, quantity: Schema.Int }),
      { quantity: Entity.unmapped },
    ),
    { id: 'id', expect: 'revision', increment: { quantity: 'quantity' }, becomes: Available },
  ),
)
const Withdraw = Mutation.write(
  'Withdraw',
  Write.delete(Entity.input(Stock, Schema.Struct({ id: Schema.String, revision: Schema.Int })), {
    id: 'id',
    expect: 'revision',
    when: () => Expr.eq(Stock.fields.status, 'draft'),
  }),
)
const mutations = [Reserve, Rename, Relabel, List, Withdraw, Take] as const

const row = (id: string, status: string, quantity: number, reserved: number) => ({
  id,
  name: 'Bolt',
  label: 'bolt',
  status,
  quantity,
  reserved,
  revision: 1,
  owner: 'Owner:o1',
})

const backendOf = () =>
  RemoteServer.memory({
    domain: Remote.define({ entities: [Owner, Stock], mutations: [...mutations] }),
    rows: {
      Owner: [{ id: 'o1', name: 'Ada' }],
      Stock: [row('s1', 'published', 10, 5), row('s2', 'draft', 10, 0)],
    },
    operators,
    mutations: (store: MemoryStore) =>
      mutations.map(mutation =>
        RemoteServer.write(mutation, RemoteServer.memoryWriter(store, Stock, { operators })),
      ),
  })

const fresh = () => {
  const backend = backendOf()
  const handlers = RemoteServer.handlers(backend.server, undefined)
  let requests = 0
  const send = (mutation: string, input: unknown) =>
    Effect.runPromise(
      handlers
        .FoldkitRemoteMutate({ requestId: `r${++requests}`, mutation, input })
        .pipe(Effect.result),
    )
  const stock = (id: string) => backend.rows('Stock').find(each => each['id'] === id)
  return { send, stock }
}

const refused = (refusal: Record<string, unknown>) => ({
  _tag: 'Failure',
  failure: { refusal },
})

describe('RemoteServer.memoryWriter', () => {
  it('lands an update, moves its revision on, and answers what it wrote', async () => {
    const { send, stock } = fresh()
    expect(await send('Reserve', { id: 's1', revision: 1, quantity: 3 })).toMatchObject({
      _tag: 'Success',
      success: { entities: [{ entity: 'Stock', id: 's1', values: { reserved: 8, revision: 2 } }] },
    })
    expect(stock('s1')).toMatchObject({ reserved: 8, revision: 2, quantity: 10 })
  })

  it('computes over the row before the write, not the values it sets', async () => {
    const { send, stock } = fresh()
    expect(
      await send('Rename', { id: 's1', revision: 1, name: 'Nut', prefix: 'new ' }),
    ).toMatchObject({ _tag: 'Success' })
    expect(stock('s1')).toMatchObject({ name: 'Nut', label: 'new Bolt', revision: 2 })
  })

  it('lands an insert, its link kept as the ref the store holds', async () => {
    const { send, stock } = fresh()
    const listed = { ...row('s3', 'draft', 4, 1), ownerId: 'o1' }
    expect(await send('List', listed)).toMatchObject({
      _tag: 'Success',
      success: { entities: [{ entity: 'Stock', id: 's3', values: { owner: 'Owner:o1' } }] },
    })
    expect(stock('s3')).toEqual(row('s3', 'draft', 4, 1))
  })

  it('lands a delete, and a delete of a row already gone', async () => {
    const { send, stock } = fresh()
    expect(await send('Withdraw', { id: 's2', revision: 1 })).toMatchObject({
      _tag: 'Success',
      success: { deleted: [{ entity: 'Stock', id: 's2' }] },
    })
    expect(stock('s2')).toBeUndefined()
    expect(await send('Withdraw', { id: 's2', revision: 1 })).toMatchObject({ _tag: 'Success' })
  })

  it.each([
    ['a stale revision', 'Reserve', { id: 's1', revision: 7, quantity: 1 }, { _tag: 'Conflict' }],
    ['a row not published', 'Reserve', { id: 's2', revision: 1, quantity: 1 }, { _tag: 'Unmet' }],
    [
      'a row it would leave over its quantity',
      'Reserve',
      { id: 's1', revision: 1, quantity: 6 },
      { _tag: 'Invalid', rule: 'reservedWithinQuantity', path: ['reserved'] },
    ],
    [
      'an id already taken',
      'List',
      { ...row('s1', 'draft', 1, 0), ownerId: 'o1' },
      { _tag: 'Taken', entity: 'Stock', id: 's1' },
    ],
    [
      'an update it would leave outside its becomes',
      'Take',
      { id: 's1', revision: 1, quantity: -5 },
      {
        _tag: 'Invalid',
        entity: 'Stock',
        rule: 'becomes:Available',
        path: ['quantity', 'reserved'],
      },
    ],
    [
      'an insert it would leave outside its becomes',
      'List',
      { ...row('s3', 'draft', 1, 1), ownerId: 'o1' },
      { _tag: 'Invalid', entity: 'Stock', rule: 'becomes:Available' },
    ],
    ['a delete at a stale revision', 'Withdraw', { id: 's2', revision: 7 }, { _tag: 'Conflict' }],
    ['a delete of a row not a draft', 'Withdraw', { id: 's1', revision: 1 }, { _tag: 'Unmet' }],
  ])('refuses %s, and writes nothing', async (_, mutation, input, refusal) => {
    const { send, stock } = fresh()
    const before = [stock('s1'), stock('s2')]
    expect(await send(mutation, input)).toMatchObject(refused(refusal))
    expect([stock('s1'), stock('s2')]).toEqual(before)
  })

  it('answers a sum past the safe integer range as a server error, and writes nothing', async () => {
    const { send, stock } = fresh()
    const before = stock('s1')
    const answer = await send('Reserve', { id: 's1', revision: 1, quantity: 2 ** 53 })
    // Not one of the mutation's own refusals, and nothing of the evaluator's message.
    expect(answer).toMatchObject({ failure: { _tag: 'RemoteMutationError' } })
    expect(answer).not.toHaveProperty('failure.refusal')
    expect(JSON.stringify(answer)).not.toContain('safe')
    expect(stock('s1')).toEqual(before)
  })

  it('lands a write its postcondition holds of, and names the postcondition it refuses by', async () => {
    const { send, stock } = fresh()
    expect(await send('Take', { id: 's1', revision: 1, quantity: -4 })).toMatchObject({
      _tag: 'Success',
    })
    expect(stock('s1')).toMatchObject({ quantity: 6, reserved: 5, revision: 2 })
    const answer = await send('Take', { id: 's1', revision: 2, quantity: -1 })
    if (answer._tag !== 'Failure') throw new Error('the take landed')
    const { refusal } = answer.failure as { readonly refusal: unknown }
    expect(
      Refusal.isInvalidBy(
        Schema.decodeUnknownSync(Take.Refusal)(refusal),
        Write.ensured(Take.write),
      ),
    ).toBe(true)
    expect(stock('s1')).toMatchObject({ quantity: 6, revision: 2 })
  })

  it('answers a retry of an update that landed with the row, and a computing one as a conflict', async () => {
    const { send } = fresh()
    const relabel = { id: 's1', revision: 1, label: 'nut' }
    await send('Relabel', relabel)
    expect(await send('Relabel', relabel)).toMatchObject({
      _tag: 'Success',
      success: { entities: [{ values: { label: 'nut', revision: 2 } }] },
    })
    // A row a revision on may be another's computation: only the write says it landed.
    const rename = { id: 's2', revision: 1, name: 'Nut', prefix: '' }
    await send('Rename', rename)
    expect(await send('Rename', rename)).toMatchObject(refused({ _tag: 'Conflict' }))
  })

  it('is refused by name where a write needs a ledger or a precondition it cannot judge', () => {
    const backend = backendOf()
    const writer = RemoteServer.memoryWriter(backend, Stock)
    const Bump = Mutation.write(
      'Bump',
      Write.update(
        Entity.input(Stock, Schema.Struct({ id: Schema.String, by: Schema.Int }), {
          by: Entity.unmapped,
        }),
        { id: 'id', increment: { reserved: 'by' } },
      ),
    )
    expect(() => RemoteServer.write(Bump, writer)).toThrow(
      'write "Bump" increments a field and expects no revision, so a retry could add twice; give it `expect`, or a writer with a ledger',
    )
    const Owned = Mutation.write(
      'Owned',
      Write.update(Entity.input(Stock, Schema.Struct({ id: Schema.String, name: Schema.String })), {
        id: 'id',
        when: () => Expr.eq(Expr.path(Stock.relations.owner, Owner.fields.name), 'Ada'),
      }),
    )
    expect(() => RemoteServer.write(Owned, writer)).toThrow(
      'write "Owned" cannot land through its writer for Stock: its precondition needs',
    )
    const Open = Mutation.write(
      'Open',
      Write.insert(
        Entity.input(
          Stock,
          Schema.Struct({ id: Schema.String, name: Schema.String, quantity: Schema.Int }),
        ),
        { id: 'id', becomes: Available },
      ),
    )
    expect(() => RemoteServer.write(Open, writer)).toThrow(
      'insert "Open" leaves unset a field an invariant reads (reservedWithinQuantity reads reserved; becomes:Available reads reserved)',
    )
    const { postconditions: _, ...unjudging } = writer
    expect(() => RemoteServer.write(Take, unjudging)).toThrow(
      'write "Take" ensures becomes:Available, which enumeration could not prove where it was declared, but its writer for Stock does not judge one (postconditions)',
    )
  })
})

describe('a memory writer given the row’s revision', () => {
  /** Sets the label with no revision to expect. */
  const Mark = Mutation.write(
    'Mark',
    Write.update(Entity.input(Stock, Schema.Struct({ id: Schema.String, label: Schema.String })), {
      id: 'id',
    }),
  )
  const marking = [Mark, Relabel] as const
  /** A server over s1 at revision 1, read by `principal` under `authorize` and `readable`. */
  const serving = (
    options: { readonly revision?: 'revision' },
    principal: string,
    authorize?: (who: string, fields: ReadonlyArray<string>) => ReadonlyArray<string>,
  ) => {
    const backend = RemoteServer.memory<string>({
      domain: Remote.define({ entities: [Owner, Stock], mutations: [...marking] }),
      rows: { Owner: [{ id: 'o1', name: 'Ada' }], Stock: [row('s1', 'published', 10, 5)] },
      mutations: (store: MemoryStore) =>
        marking.map(mutation =>
          RemoteServer.write(mutation, RemoteServer.memoryWriter(store, Stock, options)),
        ),
      ...(authorize === undefined ? {} : { authorize: { Stock: authorize } }),
      // Eve may read no Stock row.
      readable: who => Effect.succeed(() => who !== 'eve'),
    })
    const send = (mutation: string, input: unknown) =>
      Effect.runPromise(
        RemoteServer.handlers(backend.server, principal).FoldkitRemoteMutate({
          requestId: 'r',
          mutation,
          input,
        }),
      )
    return { send, stock: () => backend.rows('Stock')[0] }
  }

  it.each([
    ['an update that expects none', 'Mark', { id: 's1', label: 'nut' }],
    ['an update that expects it', 'Relabel', { id: 's1', revision: 1, label: 'nut' }],
  ])('moves it on once through %s, and answers the row at it', async (_, mutation, input) => {
    const { send, stock } = serving({ revision: 'revision' }, 'ada')
    expect((await send(mutation, input)).entities).toEqual([
      { entity: 'Stock', id: 's1', values: { id: 's1', label: 'nut', revision: 2 }, revision: 2 },
    ])
    expect(stock()).toMatchObject({ label: 'nut', revision: 2 })
  })

  it('answers no revision when given none, and leaves the field where a write expects none', async () => {
    const { send, stock } = serving({}, 'ada')
    expect((await send('Mark', { id: 's1', label: 'nut' })).entities).toEqual([
      { entity: 'Stock', id: 's1', values: { id: 's1', label: 'nut' } },
    ])
    expect(stock()).toMatchObject({ revision: 1 })
  })

  it('answers the revision of a row whose revision field the caller may not read, as a read does', async () => {
    const { send } = serving({ revision: 'revision' }, 'ada', (_who, fields) =>
      fields.filter(field => field !== 'revision'),
    )
    expect((await send('Mark', { id: 's1', label: 'nut' })).entities).toEqual([
      { entity: 'Stock', id: 's1', values: { id: 's1', label: 'nut' }, revision: 2 },
    ])
  })

  it('answers nothing of a row the caller may not read, its revision included', async () => {
    const { send } = serving({ revision: 'revision' }, 'eve')
    const answer = await send('Mark', { id: 's1', label: 'nut' })
    expect(answer.entities).toEqual([])
  })

  it('refuses a revision that names no field', () => {
    const store: MemoryStore = { rows: () => [], write: () => {}, remove: () => {} }
    // Typed as any Entity, a name its fields lack reaches the check where the writer is made.
    const unnamed: AnyEntity = Stock
    expect(() => RemoteServer.memoryWriter(store, unnamed, { revision: 'version' })).toThrow(
      'Stock has no field "version" for its revision',
    )
  })
})

describe('a declared write over a memory backend, through Law.check', () => {
  const Model = Schema.Struct({ remote: Remote.Model })
  const App = Surface.application({ Model, Message: defineMessageUnion({ ...Remote.messages }) })
  const Data = Remote.make({
    model: App.model.remote,
    entities: [Owner, Stock],
    mutations: [...mutations],
  })

  it('agrees on the row the client predicts and the writer lands', async () => {
    const report = await Effect.runPromise(
      Law.check(Data, {
        model: { remote: Remote.initial },
        holds: [{ entity: Stock, ids: ['s1', 's2'] }],
        mutation: Reserve,
        input: { id: 's1', revision: 1, quantity: 3 },
        now: 1,
      }).pipe(Effect.provide(backendOf().layer)),
    )
    expect(report.disagreed).toEqual([])
    expect(report.agreed).toEqual(expect.arrayContaining(['Stock:s1.reserved']))
  })
})
