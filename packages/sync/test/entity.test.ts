/**
 * `EditableEntity`: per-cell edits laid over rows by revision, absorbed by
 * sequence, held while a cached row is behind them, and settled by a read.
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
  })
})

describe('overlay', () => {
  test.each([
    ['a pending edit shows', pending('a:1', 9), 5, 9],
    ['one committed after the row’s revision shows', committed('a:1', 9, 6), 5, 9],
    ['one the row is at hides', committed('a:1', 9, 5), 5, 1],
    ['one before the row hides', committed('a:1', 9, 4), 5, 1],
  ])('%s', (_, edit, revision, shown) => {
    expect(Edits.overlay([edit])(row('a:1', 1, revision)).price).toBe(shown)
    // The other row whose id it begins is untouched.
    expect(Edits.overlay([edit])(row('a:10', 1, 0)).price).toBe(1)
  })

  test('a row with no edit is the row itself', () => {
    const plain = row('b', 1, 0)
    expect(Edits.overlay([committed('a:1', 9, 6)])(plain)).toBe(plain)
  })
})

describe('held edits', () => {
  const revisions = new Map([
    ['a:1', 2],
    ['a:10', 9],
  ])
  const revisionOf = (id: string) => Option.fromUndefinedOr(revisions.get(id))

  test('keeps what the slice dropped while its cached row is behind it', () => {
    const before = [
      committed('a:1', 5, 4),
      committed('a:10', 6, 5),
      pending('a:1', 7),
      committed('c', 1, 9),
    ]
    // a:1's row is at 2, behind 4; a:10's at 9, past 5; c is not cached; the pending edit is not committed.
    expect(Edits.held(before, [], revisionOf)).toEqual([committed('a:1', 5, 4)])
    // A cell the slice still holds is shown from the slice, not held.
    expect(Edits.held(before, [committed('a:1', 8, 6)], revisionOf)).toEqual([])
  })

  test('says when a cell is newly held', () => {
    const held = [committed('a:1', 5, 4)]
    expect(Edits.newlyHeld([], held)).toBe(true)
    expect(Edits.newlyHeld(held, held)).toBe(false)
    expect(Edits.newlyHeld(held, [committed('a:1', 5, 6)])).toBe(true)
  })

  test('lets go of what a read reached, saying when the row then holds another value', () => {
    const held = [
      committed('a:1', 5, 4),
      committed('a:10', 6, 5),
      committed('d', 7, 3, { actor: 'ben', replica: 'ben-tab' }),
      committed('e', 8, 9),
    ]
    const rows = new Map([
      ['a:1', row('a:1', 5, 4)],
      ['a:10', row('a:10', 60, 7)],
      ['d', row('d', 70, 8)],
      ['e', row('e', 1, 2)],
    ])
    const settled = Edits.settled(held, id => Option.fromUndefinedOr(rows.get(id)), 'ada-tab')
    // e is not reached yet and stays; a:1 holds its value; a:10 holds another: replaced;
    // d holds another too, but it was ben's.
    expect(settled.held).toEqual([committed('e', 8, 9)])
    expect(settled.replaced).toEqual([{ edit: committed('a:10', 6, 5), by: Option.none() }])
    const none = Edits.settled(
      [committed('e', 8, 9)],
      id => Option.fromUndefinedOr(rows.get(id)),
      'ada-tab',
    )
    expect(none.held).toEqual([committed('e', 8, 9)])
  })

  test('keeps the same array when a read reached nothing', () => {
    const held = [committed('e', 8, 9)]
    expect(Edits.settled(held, () => Option.some(row('e', 1, 2)), 'ada-tab').held).toBe(held)
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
