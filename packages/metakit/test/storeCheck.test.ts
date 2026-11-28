import { describe, expect, it } from 'vitest'
import { checkStore, type StoreAdapter, type StoreRow } from '../src/storeCheck.js'

/** Fake store that lets two transactions interleave reads before writes. */
const makeInterleavingStore = (): StoreAdapter => {
  const rows = new Map<string, StoreRow>()
  const children: Array<StoreRow> = []
  return {
    seed: async ({ parent, children: kids }) => {
      rows.clear()
      rows.set(parent.id, parent)
      children.length = 0
      children.push(...kids)
    },
    connect: async () => ({
      read: async id => rows.get(id),
      write: async (id, balance) => {
        rows.set(id, { id, balance })
      },
      transaction: async run =>
        run({
          read: async id => rows.get(id),
          write: async (id, balance) => {
            rows.set(id, { id, balance })
          },
          lockParent: async () => {},
          listChildren: async parentId => children.filter(c => c.parentId === parentId),
          addChild: async row => {
            children.push(row)
          },
        }),
    }),
  }
}

/** Properly serialized in-memory store (runs one transaction at a time). */
const makeSerializedStore = (): StoreAdapter => {
  const rows = new Map<string, StoreRow>()
  const children: Array<StoreRow> = []
  let chain: Promise<unknown> = Promise.resolve()
  const serialized = <A>(fn: () => Promise<A>): Promise<A> => {
    const next = chain.then(fn, fn)
    chain = next
    return next
  }
  return {
    seed: async ({ parent, children: kids }) => {
      rows.clear()
      rows.set(parent.id, parent)
      children.length = 0
      children.push(...kids)
    },
    connect: async () => ({
      read: async id => rows.get(id),
      write: async (id, balance) => {
        rows.set(id, { id, balance })
      },
      transaction: run =>
        serialized(() =>
          run({
            read: async id => rows.get(id),
            write: async (id, balance) => {
              rows.set(id, { id, balance })
            },
            lockParent: async () => {},
            listChildren: async parentId => children.filter(c => c.parentId === parentId),
            addChild: async row => {
              children.push(row)
            },
          }),
        ),
    }),
  }
}

describe('metakit/store/check (Phase 9 Bout 9.3)', () => {
  it('fails a fake interleaving store declaring serializable over a transaction with the exact refusal', async () => {
    const report = await checkStore(
      {
        name: 'FakeStore',
        isolation: 'serializable',
        isolates: 'transaction',
        parentRowLock: false,
      },
      makeInterleavingStore(),
    )
    expect(report.passed).toBe(false)
    expect(report.failures).toHaveLength(1)
    expect(report.failures[0]!.probe).toBe('serializable-transaction')
    expect(report.failures[0]!.message).toBe(
      '[metakit/store] "FakeStore" declares serializable over a transaction, and two writers each read balance 10 and wrote 5: the second write did not see the first. Declare read-committed, or isolate the round trips.',
    )
  })

  it('fails a fake interleaving store declaring parentRowLock without locking', async () => {
    const report = await checkStore(
      {
        name: 'FakeLockStore',
        isolation: 'read-committed',
        isolates: 'transaction',
        parentRowLock: true,
      },
      makeInterleavingStore(),
    )
    expect(report.passed).toBe(false)
    expect(report.failures).toHaveLength(1)
    expect(report.failures[0]!.probe).toBe('parent-row-lock')
    expect(report.failures[0]!.message).toContain('"FakeLockStore" declares parentRowLock')
  })

  it('passes a properly serialized store declaring serializable transaction and parentRowLock', async () => {
    const report = await checkStore(
      {
        name: 'MemoryStore',
        isolation: 'serializable',
        isolates: 'transaction',
        parentRowLock: true,
      },
      makeSerializedStore(),
    )
    expect(report.passed).toBe(true)
    expect(report.failures).toEqual([])
  })
})
