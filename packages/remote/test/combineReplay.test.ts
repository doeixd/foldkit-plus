import { Option, Schema } from 'effect'
import { describe, expect, it } from 'vitest'
import * as Operation from 'metakit/operation'
import { noKept } from '../src/kept.js'
import { beginMutation, emptyMutationState } from '../src/ledger.js'
import { beginOptimistic, emptyOptimistic, settleSuccess, visibleStore } from '../src/optimistic.js'
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

  it('C2: enforces strict null handling, Schema checks, commutativity+associativity, and same-op consistency', () => {
    const flagsAndNot = Operation.define({
      id: 'flags.andNot',
      version: 1,
      args: [Flags, Flags],
      returns: Flags,
      nulls: 'strict',
    })
    const flagsXor = Operation.define({
      id: 'flags.xor',
      version: 1,
      args: [Flags, Flags],
      returns: Flags,
      nulls: 'strict',
      claims: { commutative: true, associative: true },
    })
    const allImpls = Operation.implementations(
      'page-c2',
      Operation.implement(flagsOr, (a, b) => a | b),
      Operation.implement(flagsAndNot, (a, b) => a & ~b),
      Operation.implement(flagsXor, (a, b) => a ^ b),
    )

    const key = entityKey('Role', 'r1')
    const baseNull = writeEntities({}, [
      { key, values: { id: 'r1', granted: null }, updatedAt: 100, oldestAt: 100, revision: 1 },
    ])
    const optNull = beginOptimistic(emptyOptimistic, 'req-null', [
      {
        entity: 'Role',
        id: 'r1',
        values: {},
        combines: { granted: { op: 'flags.or@1', value: 4 } },
      },
    ])
    // Strict null propagation: null | 4 = null (never coerced to 0 | 4 = 4).
    expect(
      visibleStore(baseNull, optNull, noKept, undefined, allImpls)[key]?.values['granted'],
    ).toBe(null)

    // Out-of-Schema value (-1) is refused by applyForeign -> visibleStore keeps base value (1).
    const baseOne = writeEntities({}, [
      { key, values: { id: 'r1', granted: 1 }, updatedAt: 100, oldestAt: 100, revision: 1 },
    ])
    const optBadVal = beginOptimistic(emptyOptimistic, 'req-bad', [
      {
        entity: 'Role',
        id: 'r1',
        values: {},
        combines: { granted: { op: 'flags.or@1', value: -1 } },
      },
    ])
    expect(
      visibleStore(baseOne, optBadVal, noKept, undefined, allImpls)[key]?.values['granted'],
    ).toBe(1)

    // Non-commutative combine (flags.andNot) must NOT replay silently; triggers a reread.
    const optNonComm = beginOptimistic(emptyOptimistic, 'req-nc', [
      {
        entity: 'Role',
        id: 'r1',
        values: {},
        combines: { granted: { op: 'flags.andNot@1', value: 1 } },
      },
    ])
    const keptNc = replayOver(
      noKept,
      baseOne,
      [{ entity: 'Role', id: 'r1', values: { granted: 3 }, revision: 2 }],
      'patch',
      new Set(['req-nc']),
      200,
    )
    const afterPatch = writeEntities(baseOne, [
      { key, values: { granted: 3 }, updatedAt: 200, oldestAt: 200, revision: 2 },
    ])
    const settledNc = settleReplayed(
      keptNc,
      afterPatch,
      optNonComm.layers[0],
      'req-nc',
      [{ entity: 'Role', id: 'r1', values: { granted: 2 }, revision: 3 }],
      new Set(),
      300,
      undefined,
      undefined,
      allImpls,
    )
    expect(settledNc.again).toEqual([{ entity: 'Role', id: 'r1', fields: ['granted'] }])

    // Mismatched chained combines in one layer (flags.or then flags.xor) must NOT replay.
    const optMismatch = beginOptimistic(emptyOptimistic, 'req-mm', [
      {
        entity: 'Role',
        id: 'r1',
        values: {},
        combines: { granted: { op: 'flags.or@1', value: 4 } },
      },
      {
        entity: 'Role',
        id: 'r1',
        values: {},
        combines: { granted: { op: 'flags.xor@1', value: 2 } },
      },
    ])
    const keptMm = replayOver(
      noKept,
      baseOne,
      [{ entity: 'Role', id: 'r1', values: { granted: 3 }, revision: 2 }],
      'patch',
      new Set(['req-mm']),
      200,
    )
    const settledMm = settleReplayed(
      keptMm,
      afterPatch,
      optMismatch.layers[0],
      'req-mm',
      [{ entity: 'Role', id: 'r1', values: { granted: 5 }, revision: 3 }],
      new Set(),
      300,
      undefined,
      undefined,
      allImpls,
    )
    expect(settledMm.again).toEqual([{ entity: 'Role', id: 'r1', fields: ['granted'] }])
  })

  it('H1: superseded preserves unrelated pending combines and strips settled combines', () => {
    const key = entityKey('Role', 'r1')
    const base = writeEntities({}, [
      {
        key,
        values: { id: 'r1', granted: 1, name: 'user' },
        updatedAt: 100,
        oldestAt: 100,
        revision: 1,
      },
    ])
    let state = beginMutation(emptyMutationState, 'req-1')
    state = beginMutation(state, 'req-2')
    const opt = beginOptimistic(emptyOptimistic, 'req-1', [
      {
        entity: 'Role',
        id: 'r1',
        values: {},
        combines: { granted: { op: 'flags.or@1', value: 4 } },
      },
    ])

    // Settling a later request on an unrelated field (`name`) must NOT drop req-1's pending `combines.granted`.
    const afterUnrelated = settleSuccess(base, opt, state, 'req-2', {
      entities: [{ entity: 'Role', id: 'r1', values: { name: 'admin' } }],
      now: 200,
    })
    expect(afterUnrelated.optimistic.layers[0]?.patches).toHaveLength(1)
    expect(afterUnrelated.optimistic.layers[0]?.patches[0]?.combines).toEqual({
      granted: { op: 'flags.or@1', value: 4 },
    })

    // Settling a later request on `granted` strips req-1's `combines.granted` and drops the now-empty patch.
    const afterSettled = settleSuccess(base, opt, state, 'req-2', {
      entities: [{ entity: 'Role', id: 'r1', values: { granted: 5 } }],
      now: 200,
    })
    expect(afterSettled.optimistic.layers[0]?.patches).toHaveLength(0)
  })
})
