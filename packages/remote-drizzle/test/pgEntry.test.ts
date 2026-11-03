// @vitest-environment node
/**
 * Postgres support is opt-in (#464): the main entry imports no `pg-core`, and a
 * Postgres table reached without registering `postgres()` is refused by name.
 * One test, so the refusal is asserted before registration and the bind after.
 */
import { pgTable, text } from 'drizzle-orm/pg-core'
import { Schema } from 'effect'
import { Entity } from 'foldkit-entity'
import { describe, expect, it } from 'vitest'
import { bind } from '../src/index.js'
import { postgres } from '../src/pg.js'

const users = pgTable('users', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
})

const User = Entity.define('User', Schema.Struct({ id: Schema.String, name: Schema.String }))

describe('Postgres support', () => {
  it('refuses a Postgres table until postgres() registers it', () => {
    expect(() => bind({ User }, { User: { table: users } })).toThrow(/foldkit-remote-drizzle\/pg/)
    postgres()
    expect(bind({ User }, { User: { table: users } }).User.name).toBe('User')
  })
})
