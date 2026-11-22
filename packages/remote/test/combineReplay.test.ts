import { Option, Schema } from 'effect'
import { describe, expect, it } from 'vitest'
import * as Operation from 'metakit/operation'
import { noKept } from '../src/kept.js'
import { beginOptimistic, emptyOptimistic, visibleStore } from '../src/optimistic.js'
import { replayOver, settleReplayed } from '../src/replay.js'
import { entityKey, writeEntities, type EntityStore } from '../src/store.js'

const Flags = Schema.Int.check(Schema.isBetween({ minimum: 0, maximum: 0x7fff_ffff }))
const flagsOr = Operation.define({
  id: 'flags.or',
  version: 1,
  args: [Flags, Flags],
  returns: Flags,
  nulls: 'strict',
  claims: {
    commutative: true,
    associative: true,
    idempotent: true,
    identity: { value: 0, side: 'both' },
  },
})

const impls = Operation.implementations(
  'page',
  Operation.implement(flagsOr, (a, b) => a | b),
)

describe('PendingPatch.combines in optimistic store and replay', () => {
  it('resolves pending combines in visibleStore when the page holds the implementation, and skips when absent', () => {
    const emptyStore: EntityStore = {}
    const base = writeEntities(emptyStore, [
      {
        key: entityKey('Role', 'r1'),
        values: { id: 'r1', granted: 1 },
        updatedAt: 100,
        oldestAt: 100,
        revision: 1,
      },
    ])
    const opt = beginOptimistic(emptyOptimistic, 'req-1', [
      {
        entity: 'Role',
        id: 'r1',
        values: {},
        combines: { granted: { op: 'flags.or@1', value: 4 } },
      },
    ])

    const withImpl = visibleStore(base, opt, noKept, undefined, impls)
    expect(withImpl[entityKey('Role', 'r1')]?.values['granted']).toBe(5)

    // Without implementation, the optimistic layer leaves the stored value until the server answers.
    const withoutImpl = visibleStore(base, opt, noKept)
    expect(withoutImpl[entityKey('Role', 'r1')]?.values['granted']).toBe(1)
  })

  it('replays a pending combine over a newer server value when the implementation is held, else triggers a reread', () => {
    const key = entityKey('Role', 'r1')
    const emptyStore: EntityStore = {}
    const initial = writeEntities(emptyStore, [
      { key, values: { id: 'r1', granted: 1 }, updatedAt: 100, oldestAt: 100, revision: 1 },
    ])
    const opt = beginOptimistic(emptyOptimistic, 'req-1', [
      {
        entity: 'Role',
        id: 'r1',
        values: {},
        combines: { granted: { op: 'flags.or@1', value: 4 } },
      },
    ])
    const layer = opt.layers[0]
    const pending = new Set(['req-1'])

    // Live patch arrives from another writer: granted becomes 1 | 2 = 3 at revision 2.
    const kept = replayOver(
      noKept,
      initial,
      [{ entity: 'Role', id: 'r1', values: { granted: 3 }, revision: 2 }],
      'patch',
      pending,
      200,
    )
    const afterPatch = writeEntities(initial, [
      { key, values: { granted: 3 }, updatedAt: 200, oldestAt: 200, revision: 2 },
    ])

    // Server answers req-1 at revision 3 with 3 | 4 = 7: matches replayed combine -> no reread.
    const settled = settleReplayed(
      kept,
      afterPatch,
      layer,
      'req-1',
      [{ entity: 'Role', id: 'r1', values: { granted: 7 }, revision: 3 }],
      new Set(),
      300,
      undefined,
      undefined,
      impls,
    )
    expect(settled.again).toEqual([])

    // Without the implementation, combine falls back to set -> triggers a reread.
    const withoutImpl = settleReplayed(
      kept,
      afterPatch,
      layer,
      'req-1',
      [{ entity: 'Role', id: 'r1', values: { granted: 7 }, revision: 3 }],
      new Set(),
      300,
    )
    expect(withoutImpl.again).toEqual([{ entity: 'Role', id: 'r1', fields: ['granted'] }])

    // Even with the implementation, an answer that disagrees with the replay triggers a reread.
    const disagreed = settleReplayed(
      kept,
      afterPatch,
      layer,
      'req-1',
      [{ entity: 'Role', id: 'r1', values: { granted: 15 }, revision: 3 }],
      new Set(),
      300,
      undefined,
      undefined,
      impls,
    )
    expect(disagreed.again).toEqual([{ entity: 'Role', id: 'r1', fields: ['granted'] }])
    expect(Option.isNone(Option.none())).toBe(true)
  })
})
