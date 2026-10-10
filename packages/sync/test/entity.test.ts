/**
 * `EditableEntity`: per-cell edits, merged per cell, absorbed by sequence,
 * and told when another replica's commit replaced one.
 * Two ids share a prefix (`a:1`, `a:10`) and each row has two members, so a
 * key built from the wrong parts would mix them up.
 */
import { Option, Schema } from 'effect'
import { EditableEntity, type Author } from 'foldkit-sync/entity'
import { describe, expect, test } from 'vitest'

const Status = Schema.Literals(['Active', 'Paused'])
const Item = {
  fields: {
    id: { schema: Schema.String },
    name: { schema: Schema.String },
    price: { schema: Schema.Number },
    status: { schema: Status },
  },
}
const Edits = EditableEntity.make(Item, { members: ['price', 'status'] })
type Edit = typeof Edits.Edit.Type

const ada: Author = { actor: 'ada', replica: 'ada-tab' }
const adaElsewhere: Author = { actor: 'ada', replica: 'ada-other-tab' }
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
const row = (id: string, price: number, revision: number) => ({
  id,
  name: id,
  price,
  status: 'Active' as const,
  revision,
})

describe('EditableEntity.make', () => {
  test('refuses id, or a name no field has, as a member, at runtime as the types do', () => {
    // @ts-expect-error id names the row; it is no member
    expect(() => EditableEntity.make(Item, { members: ['id'] })).toThrow(/id is not a member/)
    // @ts-expect-error a member is one of the entity's fields
    expect(() => EditableEntity.make(Item, { members: ['colour'] })).toThrow(
      /colour is not a member/,
    )
  })

  test('decodes a change by its own member’s schema', () => {
    const decode = Schema.decodeUnknownSync(Edits.Change)
    expect(decode({ id: 'a:1', member: 'price', value: 3 })).toEqual({
      id: 'a:1',
      member: 'price',
      value: 3,
    })
    expect(() => decode({ id: 'a:1', member: 'price', value: 'Active' })).toThrow()
    expect(() => decode({ id: 'a:1', member: 'status', value: 3 })).toThrow()
    expect(() => decode({ id: 'a:1', member: 'name', value: 'x' })).toThrow()
  })
})

describe('merging and absorbing', () => {
  test('a change replaces its own cell and no other', () => {
    const edits = [committed('a:1', 1, 1), committed('a:10', 10, 2)]
    const merged = Edits.merge(
      edits,
      [{ id: 'a:1', member: 'price', value: 5 }],
      Option.some(3),
      Option.some(ada),
    )
    expect(merged).toEqual([committed('a:10', 10, 2), committed('a:1', 5, 3)])
    // Another member of the same row is another cell.
    const both = Edits.merge(
      merged,
      [{ id: 'a:1', member: 'status', value: 'Paused' }],
      Option.none(),
      Option.none(),
    )
    expect(both).toHaveLength(3)
    expect(Edits.merge(edits, [], Option.none(), Option.none())).toBe(edits)
  })

  test('absorbing drops what committed through the sequence, and keeps the rest', () => {
    const edits = [committed('a:1', 1, 1), committed('a:10', 10, 3), pending('b', 2)]
    expect(Edits.absorb(edits, 2)).toEqual([committed('a:10', 10, 3), pending('b', 2)])
    expect(Edits.holdsThrough(edits, 2)).toBe(true)
    expect(Edits.holdsThrough(edits, 0)).toBe(false)
    expect(Edits.absorb(edits, 0)).toBe(edits)
    // An edit committed at the sequence itself is in the table too.
    expect(Edits.absorb(edits, 3)).toEqual([pending('b', 2)])
    expect(Edits.holdsThrough(edits, 1)).toBe(true)
  })
})

describe('changeAt', () => {
  test('is the change that sets a cell to what the row holds, by its own member', () => {
    const read = row('a:1', 4, 0)
    expect(Edits.changeAt(read, 'price')).toEqual({ id: 'a:1', member: 'price', value: 4 })
    expect(Edits.changeAt(read, 'status')).toEqual({ id: 'a:1', member: 'status', value: 'Active' })
  })
})

describe('replacements', () => {
  test('reports a cell of this replica’s that another’s commit replaced', () => {
    const mine = [pending('a:1', 5), committed('a:10', 6, 2), committed('d', 7, 3, adaElsewhere)]
    const next = [
      committed('a:1', 9, 4, adaElsewhere),
      committed('a:10', 6, 5, adaElsewhere),
      committed('d', 8, 6, { actor: 'ben', replica: 'ben-tab' }),
    ]
    // a:1 was pending here and another tab's commit has another value: replaced.
    // a:10 got the very value it had; d was not this replica's.
    expect(Edits.replaced(mine, next, 'ada-tab')).toEqual([
      { edit: pending('a:1', 5), by: Option.some(adaElsewhere) },
    ])
    // A commit of this tab's, replaced by the same person's other tab: replaced.
    expect(
      Edits.replaced([committed('f', 5, 2)], [committed('f', 6, 3, adaElsewhere)], 'ada-tab'),
    ).toEqual([{ edit: committed('f', 5, 2), by: Option.some(adaElsewhere) }])
    // Its own commit coming back replaces nothing.
    expect(Edits.replaced([pending('a:1', 5)], [committed('a:1', 5, 4)], 'ada-tab')).toEqual([])
  })

  test('tells a refusal’s cells from its changes', () => {
    expect(
      Edits.cellsOf([
        { id: 'a:1', member: 'price', value: 1 },
        { id: 'a:1', member: 'status', value: 'Paused' },
      ]),
    ).toEqual([
      { id: 'a:1', member: 'price' },
      { id: 'a:1', member: 'status' },
    ])
  })

  test('stamps an edit with its sequence and author', () => {
    expect(Edits.stamped({ sequence: 7, actorId: 'ada', replicaId: 'ada-tab' })).toEqual({
      at: 7,
      by: ada,
    })
  })
})
