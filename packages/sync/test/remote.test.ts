/**
 * `foldkit-sync/remote`: a slice's cell edits shown as Remote overlays, until
 * the row Remote holds has them. Two ids share a prefix (`a:1`, `a:10`), so a
 * key built from the wrong parts would mix them up.
 */
import { Option, Schema } from 'effect'
import { defineMessageUnion } from 'foldkit/message'
import { Entity } from 'foldkit-entity'
import { Remote } from 'foldkit-remote'
import { Surface } from 'foldkit-surface'
import { EditableEntity, type Author } from 'foldkit-sync/entity'
import { RemoteEdits } from 'foldkit-sync/remote'
import { describe, expect, test } from 'vitest'

const Item = Entity.define(
  'Item',
  Schema.Struct({
    id: Schema.String,
    name: Schema.String,
    price: Schema.Number,
    revision: Schema.Number,
  }),
)
const Tag = Entity.define(
  'Tag',
  Schema.Struct({ id: Schema.String, price: Schema.Number, revision: Schema.Number }),
)
const ItemRow = Entity.select(Item, { id: true, name: true, price: true, revision: true })

const Model = Schema.Struct({ remote: Remote.Model })
type Model = typeof Model.Type
const App = Surface.application({ Model, Message: defineMessageUnion({ ...Remote.messages }) })
const Data = Remote.make({ model: App.model.remote, entities: [Item, Tag] })

const Edits = EditableEntity.make(Item, { members: ['price', 'name'] })
type Edit = typeof Edits.Edit.Type
const Shown = RemoteEdits.make(Data, Edits)

const here = 'here-tab'
const ada: Author = { actor: 'ada', replica: here }
const grace: Author = { actor: 'grace', replica: 'grace-tab' }

const pending = (id: string, price: number): Edit => ({
  id,
  member: 'price',
  value: price,
  at: Option.none(),
  by: Option.none(),
})
const committed = (id: string, price: number, at: number, by: Author = ada): Edit => ({
  id,
  member: 'price',
  value: price,
  at: Option.some(at),
  by: Option.some(by),
})

/** The model with each row as a read of the table returned it. */
const read = (
  model: Model,
  ...rows: ReadonlyArray<{ readonly id: string; readonly price: number; readonly revision: number }>
): Model =>
  Data.reduce(model, {
    _tag: 'ReadReceived',
    requests: rows.map(row => ({
      entity: 'Item',
      id: row.id,
      fields: ['id', 'name', 'price', 'revision'],
    })),
    result: {
      settled: [],
      entities: rows.map(row => ({
        entity: 'Item',
        id: row.id,
        values: { ...row, name: `item ${row.id}` },
      })),
    },
    now: 0,
  })

const priceOf = (model: Model, id: string) => {
  const row = Data.get(ItemRow, id).read(model)
  return row._tag === 'Ready' ? row.value.price : row._tag
}

const initial: Model = { remote: Remote.initial }
const loaded = read(
  initial,
  { id: 'a:1', price: 10, revision: 0 },
  { id: 'a:10', price: 20, revision: 0 },
)

const reconcile = (model: Model, slice: ReadonlyArray<Edit>) => Shown.reconcile(model, slice, here)

describe('RemoteEdits', () => {
  test('shows a pending edit in every read of its row, and only its row', () => {
    const { model } = reconcile(loaded, [pending('a:1', 11)])
    expect(priceOf(model, 'a:1')).toBe(11)
    expect(priceOf(model, 'a:10')).toBe(20)
    expect(Shown.shown(model)).toEqual([{ edit: pending('a:1', 11), held: false }])
  })

  test('changes nothing when the overlays already match the slice', () => {
    const { model } = reconcile(loaded, [pending('a:1', 11)])
    expect(reconcile(model, [pending('a:1', 11)]).model).toBe(model)
    expect(reconcile(loaded, []).model).toBe(loaded)
  })

  test('reads the overlays again only when the store, the overlays or the slice changed', () => {
    let reads = 0
    const Counted = RemoteEdits.make(
      { ...Data, overlays: (model: Model) => (reads++, Data.overlays(model)) },
      Edits,
    )
    const slice = [pending('a:1', 11)]
    const { model } = Counted.reconcile(loaded, slice, here)
    const before = reads
    expect(Counted.reconcile(model, slice, here).model).toBe(model)
    expect(reads).toBe(before)
    // A read lands: the store is another, so the overlays are read again.
    Counted.reconcile(read(model, { id: 'a:10', price: 21, revision: 1 }), slice, here)
    expect(reads).toBe(before + 1)
  })

  test('shows a committed edit until a read of its row reaches it', () => {
    const slice = [committed('a:1', 11, 5)]
    const { model } = reconcile(loaded, slice)
    expect(priceOf(model, 'a:1')).toBe(11)
    // A read below the commit leaves it shown.
    const below = reconcile(read(model, { id: 'a:1', price: 10, revision: 4 }), slice).model
    expect(priceOf(below, 'a:1')).toBe(11)
    // A read at it shows the row, and the overlay is gone.
    const at = reconcile(read(model, { id: 'a:1', price: 11, revision: 5 }), slice).model
    expect(Shown.shown(at)).toEqual([])
    expect(priceOf(read(at, { id: 'a:1', price: 12, revision: 6 }), 'a:1')).toBe(12)
  })

  test('holds an absorbed edit while the cached row is below it, and says so once', () => {
    const shown = reconcile(loaded, [committed('a:1', 11, 5)]).model
    const absorbed = reconcile(shown, [])
    expect(absorbed.held).toEqual([committed('a:1', 11, 5)])
    expect(priceOf(absorbed.model, 'a:1')).toBe(11)
    expect(Shown.shown(absorbed.model)).toEqual([{ edit: committed('a:1', 11, 5), held: true }])
    const again = reconcile(absorbed.model, [])
    expect(again.model).toBe(absorbed.model)
    expect(again.held).toEqual([])
  })

  test('lets a held edit go once a read reaches it, and says when the row holds another value', () => {
    const held = reconcile(reconcile(loaded, [committed('a:1', 11, 5)]).model, []).model
    const same = reconcile(read(held, { id: 'a:1', price: 11, revision: 5 }), [])
    expect(Shown.shown(same.model)).toEqual([])
    expect(same.replaced).toEqual([])
    const later = reconcile(read(held, { id: 'a:1', price: 13, revision: 7 }), [])
    expect(priceOf(later.model, 'a:1')).toBe(13)
    expect(later.replaced).toEqual([committed('a:1', 11, 5)])
  })

  test('does not say another replica’s held edit was replaced', () => {
    const held = reconcile(reconcile(loaded, [committed('a:1', 11, 5, grace)]).model, []).model
    expect(reconcile(read(held, { id: 'a:1', price: 13, revision: 7 }), []).replaced).toEqual([])
  })

  test('holds nothing for a row that is not cached: its next read has the table’s value', () => {
    const shown = reconcile(initial, [committed('b', 11, 5)]).model
    const absorbed = reconcile(shown, [])
    expect(absorbed.held).toEqual([])
    expect(Shown.shown(absorbed.model)).toEqual([])
  })

  test('replaces a cell’s overlay with its next edit, holding none of the old', () => {
    const first = reconcile(loaded, [committed('a:1', 11, 5)]).model
    const next = reconcile(first, [pending('a:1', 12)])
    expect(next.held).toEqual([])
    expect(priceOf(next.model, 'a:1')).toBe(12)
    expect(Shown.shown(next.model)).toEqual([{ edit: pending('a:1', 12), held: false }])
  })

  test('shows the row again when a refused edit leaves the slice', () => {
    const shown = reconcile(loaded, [pending('a:1', 11)]).model
    const refused = reconcile(shown, []).model
    expect(priceOf(refused, 'a:1')).toBe(10)
    expect(Shown.shown(refused)).toEqual([])
  })

  test('leaves another Entity’s overlays alone, and clears only its own', () => {
    const Tags = RemoteEdits.make(Data, EditableEntity.make(Tag, { members: ['price'] }))
    const both = Tags.reconcile(
      reconcile(loaded, [pending('a:1', 11)]).model,
      [{ id: 'a:1', member: 'price', value: 99, at: Option.none(), by: Option.none() }],
      here,
    ).model
    expect(Shown.shown(both)).toEqual([{ edit: pending('a:1', 11), held: false }])
    expect(reconcile(both, [pending('a:1', 11)]).model).toBe(both)
    const cleared = Shown.clear(both)
    expect(Shown.shown(cleared)).toEqual([])
    expect(Tags.shown(cleared)).toHaveLength(1)
  })
})
