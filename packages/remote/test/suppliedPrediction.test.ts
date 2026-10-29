/**
 * A supplied member that says how a client foresees it (`Derived.make`'s
 * `predict`) is foreseen over the row a write leaves: the store's row with
 * the write's values over it, a moved field unknown, the operation's context
 * given. None foresees nothing, so the row waits for the answer.
 * operations-phase5-DESIGN §3.
 */
import { Option, Schema } from 'effect'
import { Derived, Entity, Held, Write, type AnyWrite } from 'foldkit-entity'
import { describe, expect, it } from 'vitest'
import { predictionOfWrite, type EntityStore } from '../src/index.js'

const Item = Entity.define(
  'Item',
  Schema.Struct({ id: Schema.String, count: Schema.Number, label: Schema.String }),
).pipe(
  Entity.derived({
    // Foreseen from the row: a count over ten is big.
    big: Derived.make(Schema.Boolean, {
      predict: ({ row }) =>
        Held.match(row.field('count'), {
          onHeld: count => Option.some(typeof count === 'number' && count > 10),
          onUnheld: () => Option.none(),
        }),
    }),
    // Foreseen from the context: who wrote it last.
    by: Derived.make(Schema.String, {
      predict: ({ context }) => Option.map(context.viewer, viewer => viewer.id),
    }),
    // Not foreseen: the server's alone.
    rank: Derived.make(Schema.Number),
  }),
)

const store: EntityStore = {
  'Item:i1': {
    values: { id: 'i1', count: 5, label: 'small' },
    present: new Set(['id', 'count', 'label']),
    stale: new Set(),
    unavailable: new Set(),
    tombstone: false,
    updatedAt: 0,
    windows: {},
  },
}

/** What the write foresees of the row's supplied members, asked by ada. */
const foreseen = (write: AnyWrite, input: unknown) =>
  predictionOfWrite(write, input, undefined, {
    derived: new Map(),
    store,
    viewer: Option.some({ entity: 'User', id: 'ada' }),
    now: Option.some(1),
  }).flatMap(patch =>
    '_tag' in patch
      ? []
      : Object.entries(patch.values).filter(([key]) => ['big', 'by', 'rank'].includes(key)),
  )

describe('a supplied member foreseen', () => {
  it('over a new row, from what the write sets and who asks', () => {
    const create = Write.insert(
      Entity.input(
        Item,
        Schema.Struct({ id: Schema.String, count: Schema.Number, label: Schema.String }),
      ),
      { id: 'id' },
    )
    expect(foreseen(create, { id: 'i2', count: 20, label: 'big' })).toEqual([
      ['big', true],
      ['by', 'ada'],
    ])
  })

  it('over the row the store holds, with the write over it', () => {
    const relabel = Write.update(
      Entity.input(Item, Schema.Struct({ id: Schema.String, label: Schema.String })),
      { id: 'id' },
    )
    expect(foreseen(relabel, { id: 'i1', label: 'renamed' })).toEqual([
      ['big', false],
      ['by', 'ada'],
    ])
  })

  it('not over a field the write moves, whose value the server works out', () => {
    const bump = Write.update(
      Entity.input(Item, Schema.Struct({ id: Schema.String, by: Schema.Number }), {
        by: Entity.unmapped,
      }),
      { id: 'id', increment: { count: 'by' } },
    )
    expect(foreseen(bump, { id: 'i1', by: 10 })).toEqual([['by', 'ada']])
  })
})
