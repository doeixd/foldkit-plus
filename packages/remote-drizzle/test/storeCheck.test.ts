// @vitest-environment node
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { eq } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/node-sqlite'
import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core'
import { Schema } from 'effect'
import { Entity } from 'foldkit-entity'
import { checkStore, type StoreAdapter, type StoreRow } from 'metakit/store/check'
import { describe, expect, it } from 'vitest'
import { bind, writer } from '../src/index.js'

const Account = Entity.define('Account', Schema.Struct({ id: Schema.String, balance: Schema.Int }))

const accounts = sqliteTable('store_check_accounts', {
  id: text('id').primaryKey(),
  balance: integer('balance').notNull(),
})

const entries = sqliteTable('store_check_entries', {
  id: text('id').primaryKey(),
  parentId: text('parent_id').notNull(),
  balance: integer('balance').notNull(),
})

const Sqlite = bind({ Account }, { Account: { table: accounts } })

const createSchema = (sqlite: DatabaseSync) => {
  sqlite.exec(`
    create table if not exists store_check_accounts (id text primary key, balance integer not null);
    create table if not exists store_check_entries (id text primary key, parent_id text not null, balance integer not null);
  `)
}

const withSqliteAdapter = async <A>(
  mode: 'immediate' | 'statement-only',
  run: (adapter: StoreAdapter) => Promise<A>,
): Promise<A> => {
  const dir = mkdtempSync(join(tmpdir(), 'foldkit-sqlite-check-'))
  const dbPath = join(dir, 'store.sqlite')
  const setup = new DatabaseSync(dbPath)
  createSchema(setup)
  setup.close()

  const adapter: StoreAdapter = {
    seed: async ({ parent, children }) => {
      const sqlite = new DatabaseSync(dbPath)
      try {
        const db = drizzle({ client: sqlite })
        db.delete(entries).run()
        db.delete(accounts).run()
        db.insert(accounts).values({ id: parent.id, balance: parent.balance }).run()
        for (const child of children) {
          db.insert(entries)
            .values({ id: child.id, parentId: child.parentId ?? '', balance: child.balance })
            .run()
        }
      } finally {
        sqlite.close()
      }
    },
    connect: async () => {
      const sqlite = new DatabaseSync(dbPath)
      const db = drizzle({ client: sqlite })

      const read = async (id: string): Promise<StoreRow | undefined> => {
        const rows = db.select().from(accounts).where(eq(accounts.id, id)).all()
        const row = rows[0]
        return row === undefined ? undefined : { id: row.id, balance: row.balance }
      }

      const write = async (id: string, balance: number): Promise<void> => {
        db.update(accounts).set({ balance }).where(eq(accounts.id, id)).run()
      }

      const listChildren = async (parentId: string): Promise<ReadonlyArray<StoreRow>> =>
        db
          .select()
          .from(entries)
          .where(eq(entries.parentId, parentId))
          .all()
          .map(row => ({ id: row.id, parentId: row.parentId, balance: row.balance }))

      const addChild = async (row: StoreRow): Promise<void> => {
        db.insert(entries)
          .values({ id: row.id, parentId: row.parentId ?? '', balance: row.balance })
          .run()
      }

      return {
        read,
        write,
        transaction: async body => {
          const tx = { read, write, lockParent: async () => {}, listChildren, addChild }
          if (mode === 'statement-only') return body(tx)
          sqlite.exec('BEGIN IMMEDIATE')
          try {
            const result = await body(tx)
            sqlite.exec('COMMIT')
            return result
          } catch (error) {
            sqlite.exec('ROLLBACK')
            throw error
          }
        },
        close: async () => {
          sqlite.close()
        },
      }
    },
  }

  try {
    return await run(adapter)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

describe('Drizzle SQLite store capability probe (metakit/store/check)', () => {
  const declared = writer(Sqlite.Account).store

  it('passes checkStore for Drizzle SQLite declared capabilities', async () => {
    const report = await withSqliteAdapter('immediate', adapter => checkStore(declared, adapter))
    expect(report.store).toBe('SQLite')
    expect(report.passed).toBe(true)
    expect(report.failures).toEqual([])
  })

  it('passes checkStore when SQLite connections serialize via BEGIN IMMEDIATE', async () => {
    const report = await withSqliteAdapter('immediate', adapter =>
      checkStore({ ...declared, isolates: 'transaction', parentRowLock: true }, adapter),
    )
    expect(report.passed).toBe(true)
    expect(report.failures).toEqual([])
  })

  it('fails checkStore when statement-only SQLite falsely declares transaction isolation', async () => {
    const report = await withSqliteAdapter('statement-only', adapter =>
      checkStore({ ...declared, isolates: 'transaction' }, adapter),
    )
    expect(report.passed).toBe(false)
    expect(report.failures).toHaveLength(1)
    expect(report.failures[0]!.probe).toBe('serializable-transaction')
    expect(report.failures[0]!.message).toContain('"SQLite"')
  })
})
