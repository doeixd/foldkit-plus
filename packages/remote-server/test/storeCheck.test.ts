import { Schema } from 'effect'
import { Entity } from 'foldkit-entity'
import { Remote } from 'foldkit-remote'
import { checkStore, type StoreAdapter, type StoreRow } from 'metakit/store/check'
import { describe, expect, it } from 'vitest'
import { RemoteServer, type MemoryStore } from '../src/index.js'

const Account = Entity.define(
  'Account',
  Schema.Struct({ id: Schema.String, balance: Schema.Number }),
)

const Entry = Entity.define(
  'Entry',
  Schema.Struct({ id: Schema.String, parentId: Schema.String, balance: Schema.Number }),
)

const domain = Remote.define({
  entities: [Account, Entry],
  mutations: [],
})

const readRow = (store: MemoryStore, id: string): StoreRow | undefined => {
  const found = store.rows('Account').find(row => String(row['id']) === id)
  return found === undefined
    ? undefined
    : { id: String(found['id']), balance: Number(found['balance']) }
}

const listChildRows = (store: MemoryStore, parentId: string): ReadonlyArray<StoreRow> =>
  store
    .rows('Entry')
    .filter(row => String(row['parentId']) === parentId)
    .map(row => ({
      id: String(row['id']),
      parentId: String(row['parentId']),
      balance: Number(row['balance']),
    }))

const makeMemoryAdapter = (
  store: MemoryStore,
  mode: 'serialized' | 'interleaving',
): StoreAdapter => {
  let chain: Promise<unknown> = Promise.resolve()
  const runSerialized = <A>(fn: () => Promise<A>): Promise<A> => {
    const next = chain.then(fn, fn)
    chain = next
    return next
  }

  const makeTx = () => ({
    read: async (id: string) => readRow(store, id),
    write: async (id: string, balance: number) => {
      store.write('Account', id, { balance })
    },
    lockParent: async () => {},
    listChildren: async (parentId: string) => listChildRows(store, parentId),
    addChild: async (row: StoreRow) => {
      store.write('Entry', row.id, { parentId: row.parentId ?? '', balance: row.balance })
    },
  })

  return {
    seed: async ({ parent, children }) => {
      for (const row of [...store.rows('Account')]) store.remove('Account', String(row['id']))
      for (const row of [...store.rows('Entry')]) store.remove('Entry', String(row['id']))
      store.write('Account', parent.id, { balance: parent.balance })
      for (const child of children) {
        store.write('Entry', child.id, { parentId: child.parentId ?? '', balance: child.balance })
      }
    },
    connect: async () => ({
      read: async id => readRow(store, id),
      write: async (id, balance) => {
        store.write('Account', id, { balance })
      },
      transaction: run =>
        mode === 'serialized' ? runSerialized(() => run(makeTx())) : run(makeTx()),
    }),
  }
}

describe('memoryWriter store capability probe (metakit/store/check)', () => {
  it('passes checkStore for memoryWriter declared serializable transaction capabilities', async () => {
    const memory = RemoteServer.memory({ domain, rows: { Account: [], Entry: [] } })
    const declared = RemoteServer.memoryWriter(memory, Account).store

    const report = await checkStore(declared, makeMemoryAdapter(memory, 'serialized'))
    expect(report.store).toBe('memory')
    expect(report.passed).toBe(true)
    expect(report.failures).toEqual([])
  })

  it('passes checkStore with parentRowLock enabled on the serialized memory adapter', async () => {
    const memory = RemoteServer.memory({ domain, rows: { Account: [], Entry: [] } })
    const declared = { ...RemoteServer.memoryWriter(memory, Account).store, parentRowLock: true }

    const report = await checkStore(declared, makeMemoryAdapter(memory, 'serialized'))
    expect(report.passed).toBe(true)
    expect(report.failures).toEqual([])
  })

  it('fails checkStore when an interleaving memory adapter declares serializable transaction', async () => {
    const memory = RemoteServer.memory({ domain, rows: { Account: [], Entry: [] } })
    const declared = RemoteServer.memoryWriter(memory, Account).store

    const report = await checkStore(declared, makeMemoryAdapter(memory, 'interleaving'))
    expect(report.passed).toBe(false)
    expect(report.failures).toHaveLength(1)
    expect(report.failures[0]!.probe).toBe('serializable-transaction')
    expect(report.failures[0]!.message).toContain('"memory"')
  })

  it('fails checkStore when an interleaving memory adapter declares parentRowLock', async () => {
    const memory = RemoteServer.memory({ domain, rows: { Account: [], Entry: [] } })
    const declared = {
      ...RemoteServer.memoryWriter(memory, Account).store,
      isolation: 'read-committed' as const,
      parentRowLock: true,
    }

    const report = await checkStore(declared, makeMemoryAdapter(memory, 'interleaving'))
    expect(report.passed).toBe(false)
    expect(report.failures).toHaveLength(1)
    expect(report.failures[0]!.probe).toBe('parent-row-lock')
  })
})
