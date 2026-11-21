/**
 * An aggregate over a loaded list, kept from the rows that changed (#580).
 *
 * The law: after every Message, what `aggregated` keeps equals the aggregate
 * worked out from nothing over the rows `filtered` gives for the same list
 * and query, and `complete` is `filtered`'s. The walk checks it after each
 * step of seeded walks through server answers, live patches, pending writes
 * and their rollbacks, refetches and snapshots. The unit tests after it check
 * that the cheap path is the one taken: a row written moves the value by one
 * delta, and each case that cannot be followed row by row reads every row
 * again.
 */
import { Optic, Option, Schema } from 'effect'
import { defineMessageUnion } from 'foldkit/message'
import { Entity as DomainEntity, Expr, Order, Relation } from 'foldkit-entity'
import { ModelRef, Projection, Surface } from 'foldkit-surface'
import * as Rows from 'metakit/aggregates'
import { describe, expect, it } from 'vitest'
import { aggregated, type ListAggregate } from '../src/aggregate.js'
import { filtered } from '../src/filter.js'
import {
  ConnectionChange,
  Query,
  Remote,
  emptyLiveState,
  emptyStore,
  terminal,
  writeEntities,
  type RemoteMessage,
} from '../src/index.js'
import { Walk, type WalkCase } from '../src/testing.js'
import {
  All,
  AllSmall,
  AnyLarge,
  Counted,
  Data,
  Earliest,
  Invoice,
  Largest,
  Overdue,
  Total,
  Unpaid,
  answered,
  counting,
  countingMin,
  Selected,
  edgeOf,
  list,
  liveRow,
  loadedWith,
  page,
  type Model,
  type Row,
} from './aggregateFixture.js'

const aggregates: ReadonlyArray<readonly [string, ListAggregate<Row>]> = [
  ['sum', Total],
  ['count', Counted],
  ['count where', Overdue],
  ['min', Earliest],
  ['max', Largest],
  ['every', AllSmall],
  ['any', AnyLarge],
]

const same = (a: unknown, b: unknown): boolean =>
  Option.isOption(a) && Option.isOption(b)
    ? Option.makeEquivalence<unknown>(Object.is)(a, b)
    : Object.is(a, b)

const show = (value: unknown): string =>
  Option.isOption(value)
    ? Option.match(value, { onNone: () => 'none', onSome: some => `some(${String(some)})` })
    : String(value)

/** The aggregate worked out from nothing: `filtered`'s rows, folded whole. */
const recomputed = (model: Model, aggregate: ListAggregate<Row>, unpaid: boolean) => {
  const rows = filtered(Data, model, list, unpaid ? Unpaid : All, {})
  return { value: aggregate.evaluate(rows.items), complete: rows.complete }
}

const kept = (model: Model, aggregate: ListAggregate<Row>, unpaid: boolean) =>
  unpaid
    ? aggregated(Data, model, list, aggregate, { where: Unpaid, input: {} })
    : aggregated(Data, model, list, aggregate)

/** Each aggregate, over every row and over the unpaid ones, that disagrees with its recomputation. */
const disagreements = (model: Model): ReadonlyArray<string> =>
  aggregates.flatMap(([name, aggregate]) =>
    [false, true].flatMap(unpaid => {
      const want = recomputed(model, aggregate, unpaid)
      const got = kept(model, aggregate, unpaid)
      return got.complete === want.complete && same(got.value, want.value)
        ? []
        : [
            `${name}${unpaid ? ' of the unpaid' : ''}: kept ${show(got.value)} (complete ${String(got.complete)}), recomputed ${show(want.value)} (complete ${String(want.complete)})`,
          ]
    }),
  )

const down = { _tag: 'RemoteMutationError', message: 'down' } as const

const centsOf = (model: Model, id: string): number => {
  const cents = model.remote.entities[`Invoice:${id}`]?.values['cents']
  return typeof cents === 'number' ? cents : 0
}

const cursorOf = (model: Model) => (model.remote.live['s'] ?? emptyLiveState).cursor + 1

const pending = (requestId: string, values: Readonly<Record<string, unknown>>, id: string) =>
  ({
    _tag: 'MutationStarted',
    requestId,
    optimistic: [{ entity: 'Invoice', id, values }],
  }) satisfies RemoteMessage

const failed = (requestId: string) =>
  ({
    _tag: 'MutationFailed',
    requestId,
    error: down,
    operation: `op-${requestId}`,
  }) satisfies RemoteMessage

const step = (
  name: string,
  generate: (model: Model) => RemoteMessage,
): WalkCase<Model, RemoteMessage> => ({ tag: name, name, generate })

const cases: ReadonlyArray<WalkCase<Model, RemoteMessage>> = [
  ...['i1', 'i2', 'i3', 'i4', 'i6'].map((id, index) =>
    step(`the server moves ${id}'s cents`, model =>
      answered({ [id]: { cents: (centsOf(model, id) + 113 * (index + 1)) % 1000 } }),
    ),
  ),
  step('the server marks i2 paid', () => answered({ i2: { status: 'paid' } })),
  step('the server marks i2 unpaid', () => answered({ i2: { status: 'unpaid' } })),
  step('the server marks i3 unpaid', () => answered({ i3: { status: 'unpaid' } })),
  step("the server clears i3's due", () => answered({ i3: { due: null } })),
  step('the server dates i3 42', () => answered({ i3: { due: 42 } })),
  step('the server dates i1 0', () => answered({ i1: { due: 0 } })),
  step("the server answers i5's status", () => answered({ i5: { status: 'unpaid' } })),
  step("the server answers i6's due", () => answered({ i6: { due: 12 } })),
  step('the server answers i1 at revision 9', () => answered({ i1: { cents: 950 } }, 9)),
  step('the server answers i1 at revision 4', () => answered({ i1: { cents: 1 } }, 4)),
  step('the server answers i7 and i8', () =>
    answered({
      i7: { cents: 640, status: 'unpaid', due: 7 },
      i8: { cents: 2, status: 'paid', due: 61 },
    }),
  ),
  step('the server answers without i4', () => ({
    _tag: 'ReadReceived',
    requests: [{ entity: 'Invoice', id: 'i4', fields: ['cents'] }],
    result: { settled: [], entities: [] },
    now: 1,
  })),
  step("a live patch of i2's cents", model => ({
    _tag: 'LiveReceived',
    stream: 's',
    event: {
      _tag: 'EntityPatched',
      ref: { entity: 'Invoice', id: 'i2' },
      values: { cents: (centsOf(model, 'i2') + 211) % 1000 },
      changed: ['cents'],
      cursor: cursorOf(model),
    },
    now: 3,
  })),
  step('a live delete of i3', model => ({
    _tag: 'LiveReceived',
    stream: 's',
    event: { _tag: 'EntityDeleted', ref: { entity: 'Invoice', id: 'i3' }, cursor: cursorOf(model) },
    now: 3,
  })),
  step('i1 bumped, pending', () => pending('bump', { cents: 999 }, 'i1')),
  step('i2 paid, pending', () => pending('pay', { status: 'paid' }, 'i2')),
  step('i4 lowered, pending', () => pending('lower', { cents: 3, due: 1 }, 'i4')),
  step('i3 deleted, pending', () => ({
    _tag: 'MutationStarted',
    requestId: 'drop',
    optimistic: [Remote.tombstone(Invoice, 'i3')],
  })),
  step('an invoice created into the list, pending', () => ({
    _tag: 'MutationStarted',
    requestId: 'create',
    optimistic: [
      { entity: 'Invoice', id: 'new', values: { cents: 640, status: 'unpaid', due: 1 } },
      ConnectionChange.append(list.ref, { entity: 'Invoice', id: 'new' }),
    ],
  })),
  step('i6 taken off the list, pending', () => ({
    _tag: 'MutationStarted',
    requestId: 'hide',
    optimistic: [ConnectionChange.remove(list.ref, { entity: 'Invoice', id: 'i6' })],
  })),
  step('the bump confirmed', () => ({
    _tag: 'MutationSucceeded',
    requestId: 'bump',
    entities: [{ entity: 'Invoice', id: 'i1', values: { cents: 999 } }],
    now: 2,
  })),
  step('the payment confirmed', () => ({
    _tag: 'MutationSucceeded',
    requestId: 'pay',
    entities: [{ entity: 'Invoice', id: 'i2', values: { status: 'paid' } }],
    now: 2,
  })),
  step('the delete confirmed', () => ({
    _tag: 'MutationSucceeded',
    requestId: 'drop',
    entities: [],
    deleted: [{ entity: 'Invoice', id: 'i3' }],
    now: 2,
  })),
  step('the create confirmed as i9', () => ({
    _tag: 'MutationSucceeded',
    requestId: 'create',
    entities: [{ entity: 'Invoice', id: 'i9', values: { cents: 640, status: 'unpaid', due: 1 } }],
    connections: [ConnectionChange.append(list.ref, { entity: 'Invoice', id: 'i9' })],
    now: 2,
  })),
  ...['bump', 'pay', 'lower', 'drop', 'create', 'hide'].map(id =>
    step(`the ${id} failed`, () => failed(id)),
  ),
  step('the list refetched as i1, i2, i7', () => page(['i1', 'i2', 'i7'])),
  step('the list refetched whole', () => page(['i1', 'i2', 'i3', 'i4', 'i5', 'i6', 'i7', 'i8'])),
  step('the list refetched with more to come', () => page(['i1', 'i2', 'i3'], true)),
  step('a snapshot replacing the store', () => ({
    _tag: 'Hydrated',
    entities: writeEntities(emptyStore, [
      { key: 'Invoice:i2', values: { cents: 1, status: 'unpaid', due: 2 } },
    ]),
    connections: { [list.ref.identity]: [[edgeOf('i2'), edgeOf('i5')]] },
    merge: 'replace',
  })),
  step('a snapshot kept under what is held', () => ({
    _tag: 'Hydrated',
    entities: writeEntities(emptyStore, [
      { key: 'Invoice:i8', values: { cents: 870, status: 'unpaid', due: 5 } },
    ]),
    connections: { [list.ref.identity]: [[edgeOf('i1'), edgeOf('i8')]] },
    merge: 'preserve-existing',
  })),
  step("i1's cents refreshing", () => ({
    _tag: 'RefreshStarted',
    requests: [{ entity: 'Invoice', id: 'i1', fields: ['cents'] }],
  })),
  step('the list refreshing', () => ({
    _tag: 'RefreshStarted',
    requests: [],
    connections: [list.ref.identity],
  })),
  step('a preview over i4 and i8', () => ({
    _tag: 'OverlayShown',
    id: 'preview',
    optimistic: [
      { entity: 'Invoice', id: 'i4', values: { cents: 10 } },
      ConnectionChange.append(list.ref, { entity: 'Invoice', id: 'i8' }),
    ],
  })),
  step('the preview lifted', () => ({ _tag: 'OverlayLifted', id: 'preview' })),
]

const reduceAll = (model: Model, messages: ReadonlyArray<RemoteMessage>): Model =>
  messages.reduce(Data.reduce, model)

/** Six invoices listed; i5 is missing its status and i6 its due. */
const partial = (): Model =>
  reduceAll({ remote: Remote.initial, viewer: 'u1' }, [
    page(['i1', 'i2', 'i3', 'i4', 'i5', 'i6']),
    answered({
      i1: { cents: 120, status: 'unpaid', due: 14 },
      i2: { cents: 700, status: 'unpaid', due: 3 },
      i3: { cents: 45, status: 'paid', due: null },
      i4: { cents: 880, status: 'unpaid', due: 30 },
      i5: { cents: 300, due: 9 },
      i6: { cents: 510, status: 'unpaid' },
    }),
  ])

/** The same six with every field held: the list is whole. */
const whole = (): Model =>
  Data.reduce(partial(), answered({ i5: { status: 'unpaid' }, i6: { due: 12 } }))

describe('An aggregate kept from the rows that changed', () => {
  it('starts as its recomputation, whole and partial', () => {
    expect(disagreements(partial())).toEqual([])
    expect(disagreements(whole())).toEqual([])
    expect(kept(whole(), Total, false)).toEqual({ value: 2555, complete: true })
    expect(kept(partial(), Total, true).complete).toBe(false)
  })

  it.each(cases)('equals its recomputation after $name', ({ generate }) => {
    for (const start of [partial(), whole()]) {
      disagreements(start)
      const after = Data.reduce(start, generate(start))
      expect(disagreements(after)).toEqual([])
    }
  })

  it('equals its recomputation after every step of seeded walks', async () => {
    const result = await Walk.run({
      cases,
      from: [
        { name: 'partial', start: partial },
        { name: 'whole', start: whole },
      ],
      step: (model, message) => {
        // The value before the step is the one the next read moves from.
        disagreements(model)
        return Data.reduce(model, message)
      },
      violations: (_before, _message, after) =>
        disagreements(after).map(message => ({ law: 'kept equals recomputed', message })),
      laws: ['kept equals recomputed'],
      seeds: 150,
      steps: 30,
    })
    expect(result.failures).toEqual([])
  }, 120_000)
})

describe('The cheap path', () => {
  it('moves a sum by one delta when the server writes one row', () => {
    const { aggregate, calls } = counting(Total)
    const model = loadedWith(50)
    const before = aggregated(Data, model, list, aggregate).value
    expect(calls).toEqual({ evaluated: 0, inserted: 50, deleted: 0, updated: 0 })
    const next = Data.reduce(model, answered({ i7: { cents: 999 } }))
    expect(aggregated(Data, next, list, aggregate).value).toBe(before - centsOf(model, 'i7') + 999)
    expect(calls).toEqual({ evaluated: 0, inserted: 50, deleted: 0, updated: 1 })
  })

  it('adds a row entering the filter and takes away one leaving it', () => {
    const { aggregate, calls } = counting(Total)
    const model = loadedWith(30)
    const where = { where: Unpaid, input: {} }
    const before = aggregated(Data, model, list, aggregate, where).value
    const unpaid = Data.reduce(model, answered({ i0: { status: 'unpaid' } }))
    expect(aggregated(Data, unpaid, list, aggregate, where).value).toBe(
      before + centsOf(model, 'i0'),
    )
    const paid = Data.reduce(unpaid, answered({ i1: { status: 'paid' } }))
    expect(aggregated(Data, paid, list, aggregate, where)).toEqual(recomputed(paid, Total, true))
    expect(calls).toEqual({ evaluated: 0, inserted: 21, deleted: 1, updated: 0 })
  })

  it('moves by a pending write and back by its rollback, judging no other row', () => {
    const { aggregate, calls } = counting(Total)
    const model = loadedWith(40)
    const before = aggregated(Data, model, list, aggregate).value
    const shown = Data.reduce(model, pending('bump', { cents: 999 }, 'i3'))
    expect(aggregated(Data, shown, list, aggregate).value).toBe(before - centsOf(model, 'i3') + 999)
    const rolledBack = Data.reduce(shown, failed('bump'))
    expect(aggregated(Data, rolledBack, list, aggregate).value).toBe(before)
    expect(calls).toEqual({ evaluated: 0, inserted: 40, deleted: 0, updated: 2 })
  })

  it('judges only the rows a merged page adds', () => {
    const { aggregate, calls } = counting(Total)
    const model = loadedWith(20)
    aggregated(Data, model, list, aggregate)
    const ids = Array.from({ length: 20 }, (_, index) => `i${index}`)
    const grown = reduceAll(model, [
      page([...ids, 'x1']),
      answered({ x1: { cents: 5, status: 'paid', due: 1 } }),
    ])
    expect(aggregated(Data, grown, list, aggregate)).toEqual(recomputed(grown, Total, false))
    expect(calls).toEqual({ evaluated: 0, inserted: 21, deleted: 0, updated: 0 })
  })

  it('gives the same object back while nothing it counts changed', () => {
    const model = loadedWith(10)
    const first = aggregated(Data, model, list, Total)
    const unrelated = Data.reduce(model, answered({ elsewhere: { cents: 1 } }))
    expect(aggregated(Data, unrelated, list, Total)).toBe(first)
    const changed = Data.reduce(unrelated, answered({ i1: { cents: 1 } }))
    expect(aggregated(Data, changed, list, Total)).not.toBe(first)
  })

  it('keeps a minimum that a changed row still holds without reading the rows again', () => {
    const { aggregate, calls } = countingMin(Earliest)
    const model = Data.reduce(loadedWith(12), answered({ i5: { due: 0 } }))
    expect(aggregated(Data, model, list, aggregate).value).toEqual(Option.some(0))
    const lower = Data.reduce(model, answered({ i5: { due: -4 } }))
    expect(aggregated(Data, lower, list, aggregate).value).toEqual(Option.some(-4))
    const other = Data.reduce(lower, answered({ i6: { due: 40 } }))
    expect(aggregated(Data, other, list, aggregate)).toEqual(recomputed(other, Earliest, false))
    expect(calls.evaluated).toBe(0)
  })
})

describe('Read again whole when a change cannot be followed row by row', () => {
  it('after a snapshot replaced the store', () => {
    const { aggregate, calls } = counting(Total)
    const model = loadedWith(25)
    aggregated(Data, model, list, aggregate)
    const ids = Array.from({ length: 25 }, (_, index) => `i${index}`)
    const restored = Data.reduce(model, {
      _tag: 'Hydrated',
      entities: writeEntities(emptyStore, [
        { key: 'Invoice:i2', values: { cents: 4, status: 'paid', due: 1 } },
      ]),
      connections: { [list.ref.identity]: [ids.map(edgeOf)] },
      merge: 'replace',
    })
    expect(aggregated(Data, restored, list, aggregate)).toEqual(recomputed(restored, Total, false))
    expect(calls.inserted).toBe(50)
  })

  it('after a change of who is viewing', () => {
    const { aggregate, calls } = counting(Total)
    const model = loadedWith(25)
    const first = aggregated(Data, model, list, aggregate)
    expect(aggregated(Data, { ...model, viewer: 'u2' }, list, aggregate)).toEqual(first)
    expect(calls.inserted).toBe(50)
  })

  it('after more writes than are remembered', () => {
    const { aggregate, calls } = counting(Total)
    const model = loadedWith(10)
    aggregated(Data, model, list, aggregate)
    let later = model
    for (let write = 0; write < 1100; write++)
      later = Data.reduce(later, answered({ i4: { cents: write % 1000 } }))
    expect(aggregated(Data, later, list, aggregate)).toEqual(recomputed(later, Total, false))
    expect(calls).toEqual({ evaluated: 0, inserted: 20, deleted: 0, updated: 0 })
  })

  it('when a Model earlier than the last one read is read', () => {
    const { aggregate, calls } = counting(Total)
    const model = loadedWith(10)
    const later = Data.reduce(model, answered({ i4: { cents: 1 } }))
    aggregated(Data, model, list, aggregate)
    aggregated(Data, later, list, aggregate)
    expect(aggregated(Data, model, list, aggregate)).toEqual(recomputed(model, Total, false))
    expect(calls).toEqual({ evaluated: 0, inserted: 20, deleted: 0, updated: 1 })
  })

  it('reads the counted rows when the row holding the minimum leaves, and only then', () => {
    const { aggregate, calls } = countingMin(Earliest)
    const model = Data.reduce(loadedWith(12), answered({ i5: { due: -1 } }))
    aggregated(Data, model, list, aggregate)
    const notTheLeast = Data.reduce(model, answered({ i6: { due: null } }))
    aggregated(Data, notTheLeast, list, aggregate)
    expect(calls.evaluated).toBe(0)
    const leastGone = Data.reduce(notTheLeast, answered({ i5: { due: 33 } }))
    expect(aggregated(Data, leastGone, list, aggregate)).toEqual(
      recomputed(leastGone, Earliest, false),
    )
    expect(calls.evaluated).toBe(12)
  })

  it('on any store change when the body reads another row', () => {
    const Customer = DomainEntity.define(
      'Customer',
      Schema.Struct({ id: Schema.String, active: Schema.Boolean }),
    )
    const Billing = DomainEntity.relate(
      {
        Customer,
        Bill: DomainEntity.define('Bill', Schema.Struct({ id: Schema.String, cents: Schema.Int })),
      },
      { Bill: { customer: Relation.one(Customer) } },
    )
    const Bills = Query.define('Bills', {}, () =>
      Query.from(Billing.Bill).pipe(Query.orderBy(Order.asc(Billing.Bill.fields.id))),
    )
    const OfActive = Query.define('OfActive', {}, () =>
      Query.from(Billing.Bill).pipe(
        Query.where(
          Expr.eq(Expr.path(Billing.Bill.relations.customer, Billing.Customer.fields.active), true),
        ),
        Query.orderBy(Order.asc(Billing.Bill.fields.id)),
      ),
    )
    const BillModel = Schema.Struct({ remote: Remote.Model })
    const App = Surface.application({
      Model: BillModel,
      Message: defineMessageUnion({ ...Remote.messages }),
    })
    const Bill = Remote.make({
      model: App.model.remote,
      entities: [Billing.Bill, Billing.Customer],
      queries: [Bills, OfActive],
    })
    const bills = Bill.query(
      Bills,
      {},
      { select: DomainEntity.select(Billing.Bill, { cents: true }), first: 10 },
    )
    const BillTotal = counting(Rows.sum(Schema.Struct({ cents: Schema.Int }), $ => $.cents))
    const where = { where: OfActive, input: {} }
    const customer = (id: string, active: boolean): RemoteMessage => ({
      _tag: 'ReadReceived',
      requests: [{ entity: 'Customer', id, fields: ['active'] }],
      result: { settled: [], entities: [{ entity: 'Customer', id, values: { active } }] },
      now: 1,
    })
    const model = [
      {
        _tag: 'ConnectionMerged',
        connection: bills.ref.identity,
        page: {
          edges: ['b1', 'b2'].map(id => ({ key: `Bill:${id}`, ref: { entity: 'Bill', id } })),
          start: terminal,
          end: terminal,
        },
        now: 0,
      } satisfies RemoteMessage,
      {
        _tag: 'ReadReceived',
        requests: ['b1', 'b2'].map(id => ({ entity: 'Bill', id, fields: ['cents', 'customer'] })),
        result: {
          settled: [],
          entities: [
            { entity: 'Bill', id: 'b1', values: { cents: 10, customer: 'Customer:c1' } },
            { entity: 'Bill', id: 'b2', values: { cents: 20, customer: 'Customer:c2' } },
          ],
        },
        now: 1,
      } satisfies RemoteMessage,
      customer('c1', true),
      customer('c2', true),
    ].reduce(Bill.reduce, { remote: Remote.initial })
    expect(aggregated(Bill, model, bills, BillTotal.aggregate, where).value).toBe(30)
    // c2 is no bill of the list, and changes which bills count.
    const inactive = Bill.reduce(model, customer('c2', false))
    expect(aggregated(Bill, inactive, bills, BillTotal.aggregate, where)).toEqual({
      value: 10,
      complete: true,
    })
    expect(BillTotal.calls.inserted).toBe(3)
  })
})

describe('What it refuses', () => {
  it('a query over another Entity than the list', () => {
    const Other = DomainEntity.define('Other', Schema.Struct({ id: Schema.String }))
    const OverOther = Query.define('OverOther', {}, () => Query.from(Other))
    const Wide = Remote.make({
      model: Surface.application({
        Model: Schema.Struct({ remote: Remote.Model }),
        Message: defineMessageUnion({ ...Remote.messages }),
      }).model.remote,
      entities: [Invoice, Other],
      queries: [All, OverOther],
    })
    const invoices = Wide.query(
      All,
      {},
      { select: DomainEntity.select(Invoice, { cents: true }), first: 5 },
    )
    expect(() =>
      aggregated(
        Wide,
        { remote: Remote.initial },
        invoices,
        Rows.count(Schema.Struct({ cents: Schema.Int })),
        { where: OverOther, input: {} },
      ),
    ).toThrow('query "OverOther" is over "Other", but the list is of "Invoice"')
  })
})

/**
 * A Remote read names the store's field as what it reads, so a memo over it
 * skips while the field is the same object (#588). That is sound only if
 * nothing the read consults lives outside the field: `verify` reads again
 * wherever the memo would skip, and throws on a different answer.
 */
describe('A Remote read names its store’s path (#588)', () => {
  const row = Data.get(Selected, 'i1')
  const confirmedList = Data.confirmed(list)
  const reads: ReadonlyArray<Projection<Model, unknown>> = [list, row, confirmedList, liveRow]

  it('declares the store field, and a raw optic nothing', () => {
    for (const read of reads) expect(read.dependencies).toEqual([['remote']])
    const Bare = Remote.make({
      model: ModelRef.fromOptic(Remote.Model, Optic.id<Model>().key('remote')),
      entities: [Invoice],
      queries: [All],
    })
    expect(Bare.get(Selected, 'i1').dependencies).toEqual([])
    expect(Bare.query(All, {}, { select: Selected, first: 5 }).dependencies).toEqual([])
  })

  it('is skipped when another field changes and read again when the store does', () => {
    let reads = 0
    const shown = Projection.derive([list], (model: Model) => {
      reads += 1
      return list.read(model)
    })
    const model = whole()
    shown.read(model)
    shown.read({ ...model, viewer: 'u2' })
    expect(reads).toBe(1)
    shown.read(Data.reduce(model, answered({ i1: { cents: 3 } })))
    expect(reads).toBe(2)
  })

  it('gives what reading again gives wherever it is skipped, through seeded walks', async () => {
    const verified = reads.map(read => Projection.derive([read], read.read, { verify: true }))
    const result = await Walk.run({
      cases,
      from: [
        { name: 'partial', start: partial },
        { name: 'whole', start: whole },
      ],
      step: (model, message) => {
        const after = Data.reduce(model, message)
        // Each read after the Message, then after a change outside the store,
        // where `verify` reads again.
        const moved = { ...after, viewer: after.viewer === 'u1' ? 'u2' : 'u1' }
        for (const read of verified) {
          read.read(after)
          read.read(moved)
        }
        return moved
      },
      violations: () => [],
      laws: ['a skipped read gives what reading again gives'],
      seeds: 60,
      steps: 30,
    })
    expect(result.failures).toEqual([])
  }, 120_000)
})
