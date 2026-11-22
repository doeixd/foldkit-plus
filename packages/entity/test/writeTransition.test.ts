/**
 * `transitionOf(write)`: an Entity's write as a metakit transition over the
 * row's place in its table, `{ present, row }`. The differential test
 * (`writeTransition.differential.test.ts`) holds its row to `Write.apply`'s;
 * this file holds the mapping to ways of writing, when each kind lands, what
 * the transition reads and commutes with, and what a write's context supplies.
 */
import { Effect, Option, Result, Schema } from 'effect'
import { Transition, Verdict } from 'metakit'
import { describe, expect, it } from 'vitest'
import { Entity, Expr, Held, Relation, Write } from '../src/index.js'
import { suppliedOf, transitionOf } from '../src/writeTransition.js'

const Count = Schema.Int.check(Schema.isBetween({ minimum: 0, maximum: 1_000_000 }))
const Small = Schema.Int.check(Schema.isBetween({ minimum: 0, maximum: 1000 }))

const Owner = Entity.define('Owner', Schema.Struct({ id: Schema.String, name: Schema.String }))
const Fields = Entity.define(
  'Item',
  Schema.Struct({
    id: Schema.String,
    name: Schema.String,
    note: Schema.NullOr(Schema.String),
    stock: Count,
    reserved: Count,
    revision: Count,
    status: Schema.String,
    createdAt: Schema.Int,
    createdBy: Schema.String,
  }),
)
const Shop = Entity.relate(
  { Owner, Item: Fields },
  { Item: { owner: Relation.one(Owner), approver: Relation.one(Owner, { optional: true }) } },
)
const Item = Shop.Item.pipe(
  Entity.sets({ createdAt: Expr.now, createdBy: Expr.viewer(Shop.Owner) }, { on: 'create' }),
)

const rename = Write.update(
  Entity.input(
    Item,
    Schema.Struct({
      id: Schema.String,
      revision: Schema.Int,
      name: Schema.optional(Schema.String),
      note: Schema.optional(Schema.NullOr(Schema.String)),
      ownerId: Schema.String,
      approverId: Schema.NullOr(Schema.String),
    }),
    {
      ownerId: Relation.input(Item.relations.owner),
      approverId: Relation.input(Item.relations.approver),
    },
  ),
  { id: 'id', expect: 'revision' },
)

const Move = Entity.input(Item, Schema.Struct({ id: Schema.String, quantity: Small }), {
  quantity: Entity.unmapped,
})
const restock = Write.update(Move, { id: 'id', increment: { stock: 'quantity' } })
const reserve = Write.update(Move, { id: 'id', increment: { reserved: 'quantity' } })
const take = Write.update(Move, { id: 'id', decrement: { stock: 'quantity' } })
const recount = Write.update(Move, {
  id: 'id',
  compute: { reserved: ({ row, input }) => Expr.add(row.reserved, input.quantity) },
})
const publish = Write.update(
  Entity.input(Item, Schema.Struct({ id: Schema.String, status: Schema.String })),
  { id: 'id', when: ({ row }) => Expr.eq(row.status, 'draft') },
)
const setStock = Write.update(
  Entity.input(Item, Schema.Struct({ id: Schema.String, stock: Count })),
  { id: 'id' },
)
const restockExpecting = Write.update(
  Entity.input(Item, Schema.Struct({ id: Schema.String, revision: Schema.Int, quantity: Small }), {
    quantity: Entity.unmapped,
  }),
  { id: 'id', expect: 'revision', increment: { stock: 'quantity' } },
)
const create = Write.insert(
  Entity.input(Item, Schema.Struct({ id: Schema.String, name: Schema.String })),
  { id: 'id' },
)
const remove = Write.delete(
  Entity.input(Item, Schema.Struct({ id: Schema.String, revision: Schema.Int })),
  { id: 'id', expect: 'revision' },
)

const waysOf = (write: Parameters<typeof transitionOf>[0]) =>
  Object.fromEntries(transitionOf(write).writes.map(each => [each.target.join('.'), each.way._tag]))

const row = {
  id: 'i1',
  name: 'Bolt',
  note: null,
  stock: 10,
  reserved: 2,
  revision: 1,
  status: 'draft',
}

/** The state after a step, or none where the transition refuses. */
const stepped = (
  write: Parameters<typeof transitionOf>[0],
  state: { readonly present: boolean; readonly row: Readonly<Record<string, unknown>> },
  input: Readonly<Record<string, unknown>>,
  supplied: Readonly<Record<string, unknown>> = {},
) =>
  Option.map(
    Option.fromNullOr(
      Result.getOrNull(Transition.step(transitionOf(write), state, input, supplied)),
    ),
    each => each.state,
  )

describe('transitionOf: ways of writing', () => {
  it('names an update’s sets, links and revision `set`, an increment and a decrement `add`', () => {
    expect(waysOf(rename)).toEqual({
      'row.name': 'set',
      'row.note': 'set',
      'row.owner': 'set',
      'row.approver': 'set',
      'row.revision': 'set',
    })
    expect(waysOf(restock)).toEqual({ 'row.stock': 'add' })
    expect(waysOf(take)).toEqual({ 'row.stock': 'add' })
  })

  it('names a computed field `set` of what it computes', () => {
    expect(waysOf(recount)).toEqual({ 'row.reserved': 'set' })
  })

  it('names an insert by setting `present`, with its sets and its context’s values', () => {
    expect(waysOf(create)).toEqual({
      present: 'set',
      'row.name': 'set',
      'row.createdAt': 'set',
      'row.createdBy': 'set',
    })
  })

  it('names a delete by clearing `present`', () => {
    expect(waysOf(remove)).toEqual({ present: 'set' })
  })
})

describe('transitionOf: when each kind lands', () => {
  const present = { present: true, row }

  it('adds an amount, and a decrement takes it away', () => {
    expect(stepped(restock, present, { id: 'i1', quantity: 3 })).toEqual(
      Option.some({ present: true, row: { ...row, stock: 13 } }),
    )
    expect(stepped(take, present, { id: 'i1', quantity: 3 })).toEqual(
      Option.some({ present: true, row: { ...row, stock: 7 } }),
    )
  })

  it('refuses an update, a delete and an insert in the wrong place', () => {
    const absent = { present: false, row }
    expect(Option.isNone(stepped(restock, absent, { id: 'i1', quantity: 3 }))).toBe(true)
    expect(Option.isNone(stepped(remove, absent, { id: 'i1', revision: 1 }))).toBe(true)
    expect(
      Option.isNone(stepped(create, present, { id: 'i1', name: 'x' }, { viewer: 'o1', now: 1 })),
    ).toBe(true)
  })

  it('lands an insert with the context’s values, and a delete clearing present', () => {
    expect(
      stepped(
        create,
        { present: false, row: {} },
        { id: 'i2', name: 'Nut' },
        { viewer: 'o1', now: 5 },
      ),
    ).toEqual(Option.some({ present: true, row: { name: 'Nut', createdAt: 5, createdBy: 'o1' } }))
    expect(stepped(remove, present, { id: 'i1', revision: 1 })).toEqual(
      Option.some({ present: false, row }),
    )
  })

  it('holds an update to its `when`', () => {
    expect(Option.isSome(stepped(publish, present, { id: 'i1', status: 'live' }))).toBe(true)
    expect(
      Option.isNone(
        stepped(
          publish,
          { present: true, row: { ...row, status: 'live' } },
          { id: 'i1', status: 'x' },
        ),
      ),
    ).toBe(true)
  })

  it('lands where the row is at the revision it expects, and moves it on by one', () => {
    const input = { id: 'i1', revision: 1, name: 'Nut', ownerId: 'o1', approverId: null }
    const landed = stepped(rename, present, input)
    expect(Option.map(landed, each => each.row.revision)).toEqual(Option.some(2))
    expect(Option.isNone(stepped(rename, present, { ...input, revision: 7 }))).toBe(true)
  })

  it('writes an input key left out as the field was, and a link left out as pointing nowhere', () => {
    const left = stepped(rename, present, {
      id: 'i1',
      revision: 1,
      ownerId: 'o1',
      approverId: null,
    })
    expect(Option.map(left, each => [each.row.name, each.row.note, each.row.approver])).toEqual(
      Option.some(['Bolt', null, null]),
    )
    const given = stepped(rename, present, {
      id: 'i1',
      revision: 1,
      name: 'Nut',
      note: 'n',
      ownerId: 'o1',
      approverId: 'o2',
    })
    expect(Option.map(given, each => [each.row.name, each.row.note, each.row.approver])).toEqual(
      Option.some(['Nut', 'n', 'o2']),
    )
  })

  it('sets a nullable field to null when null is given, and keeps it when the key is left out', () => {
    const noted = { present: true, row: { ...row, note: 'kept' } }
    const base = { id: 'i1', revision: 1, ownerId: 'o1', approverId: null }
    expect(
      Option.map(stepped(rename, noted, { ...base, note: null }), each => each.row.note),
    ).toEqual(Option.some(null))
    expect(Option.map(stepped(rename, noted, base), each => each.row.note)).toEqual(
      Option.some('kept'),
    )
  })

  it('refuses a sum past the safe integer range, as an evaluation', () => {
    const big = { present: true, row: { ...row, stock: Number.MAX_SAFE_INTEGER } }
    expect(Option.isNone(stepped(restock, big, { id: 'i1', quantity: 1 }))).toBe(true)
  })
})

describe('transitionOf: what the checker, the prover and the graph read', () => {
  const fieldsOf = (paths: ReadonlyArray<ReadonlyArray<string>>) =>
    new Set(paths.filter(([slice]) => slice === 'row').map(([, field]) => field))

  it.each([
    ['an increment', restock],
    ['a decrement', take],
    ['a computed field', recount],
    ['a when', publish],
    ['a revision it expects, on an update', restockExpecting],
    ['an insert with context values', create],
  ])('reads and writes the fields `Write.footprint` says: %s', (_, write) => {
    const footprint = Write.footprint(write)
    if (footprint._tag !== 'Derived') throw new Error('a declared write has a derived footprint')
    const { stateReads, writes } = Transition.footprint(transitionOf(write))
    expect(fieldsOf(Option.getOrThrow(stateReads))).toEqual(new Set(footprint.reads))
    expect(fieldsOf(writes)).toEqual(new Set(footprint.writes))
  })

  it('writes no revision on a delete, where `Write.footprint` lists it', () => {
    const footprint = Write.footprint(remove)
    if (footprint._tag !== 'Derived') throw new Error('a declared write has a derived footprint')
    expect(footprint.writes).toEqual(['revision'])
    expect(fieldsOf(Transition.footprint(transitionOf(remove)).writes)).toEqual(new Set())
  })

  it('reads the field an input key that may be left out sets: it keeps what the row holds', () => {
    const { stateReads } = Transition.footprint(transitionOf(rename))
    expect(fieldsOf(Option.getOrThrow(stateReads))).toEqual(new Set(['name', 'note', 'revision']))
    expect(Write.reads(rename).map(field => field.key)).toEqual(['revision'])
  })

  it('knows which writes of one row it moves apart from the guard’s `present`', () => {
    const { writes, stateReads } = Transition.footprint(transitionOf(create))
    expect(writes.map(path => path.join('.'))).toContain('present')
    expect(Option.getOrThrow(stateReads).map(path => path.join('.'))).toEqual(['present'])
  })
})

describe('Transition.commutes over entity writes', () => {
  const answer = (a: Parameters<typeof transitionOf>[0], b: Parameters<typeof transitionOf>[0]) =>
    Transition.commutes(transitionOf(a), transitionOf(b))

  it('two increments of one field commute', () => {
    expect(Verdict.isTrue(answer(restock, restock))).toBe(true)
  })

  it('increments of different fields commute', () => {
    expect(Verdict.isTrue(answer(restock, reserve))).toBe(true)
  })

  it('a set and an increment of one field do not decide as commuting', () => {
    const verdict = answer(setStock, restock)
    expect(Verdict.isUnknown(verdict)).toBe(true)
    expect(Verdict.isUnknown(answer(restock, setStock))).toBe(true)
  })

  it('two sets of one field do not decide', () => {
    expect(Verdict.isUnknown(answer(setStock, setStock))).toBe(true)
  })

  it('a write reading what another writes does not decide', () => {
    // `publish` is held to `status`, which no other write here sets: they commute.
    expect(Verdict.isTrue(answer(publish, restock))).toBe(true)
    const holdsOn = Write.update(Move, {
      id: 'id',
      when: ({ row: before, input }) => Expr.lte(input.quantity, before.stock),
      increment: { reserved: 'quantity' },
    })
    expect(Verdict.isUnknown(answer(holdsOn, restock))).toBe(true)
  })
})

describe('suppliedOf', () => {
  const by = { viewer: Option.some({ entity: 'Owner', id: 'o1' }), now: Option.some(5) }
  const none = () => Effect.succeed(Held.of(null))

  it('gives the viewer’s id and the time a write’s context sets', () => {
    expect(Effect.runSync(suppliedOf(create, by, none))).toEqual({
      supplied: { viewer: 'o1', now: 5 },
      unfilled: [],
    })
  })

  it('gives a visitor as null, and names the time it cannot read', () => {
    const answer = Effect.runSync(
      suppliedOf(create, { viewer: Option.none(), now: Option.none() }, none),
    )
    expect(answer.supplied).toEqual({ viewer: null })
    expect([...answer.unfilled].sort()).toEqual(['createdAt', 'createdBy'])
  })

  it('supplies nothing for a write whose context sets nothing', () => {
    expect(Effect.runSync(suppliedOf(restock, by, none)).supplied).toEqual({})
  })
})
