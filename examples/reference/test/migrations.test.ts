// @vitest-environment node
/**
 * The migrations say what the code says: a change to a table, a rule on the
 * Entity, or a library that moves what it expects fails here, not in a
 * deployed database.
 */
import { readFileSync } from 'node:fs'
import { expect, it } from 'vitest'
import { accounts, storage } from '../src/auth.js'
import { ledger, noteChecks, noteLog, noteRevision, notes } from '../src/server.js'
import { createTable } from './schemaSql.js'

/** A migration's SQL, without its comments. */
const sqlOf = (file: string) =>
  readFileSync(new URL(`../migrations/${file}`, import.meta.url), 'utf8')
    .split(/\r?\n/)
    .filter(line => !line.startsWith('--'))
    .join('\n')
    .trim()

it("creates the accounts and Yielded's tables as the auth storage declares them", () => {
  expect(sqlOf('0001_accounts.sql')).toBe(
    [accounts, ...Object.values(storage.schema)].flatMap(table => createTable(table)).join('\n'),
  )
})

it("creates the notes with the Entity's rules as CHECKs, the revision trigger and the row log", () => {
  expect(sqlOf('0002_notes.sql')).toBe(
    [
      ...createTable(
        notes,
        noteChecks.constraints.map(({ constraint }) => constraint),
      ),
      noteRevision,
      ...noteLog,
    ].join('\n'),
  )
})

it("creates the notes writer's ledger, keyed by asker, operation and row, indexed by time", () => {
  expect(sqlOf('0003_write_ledger.sql')).toBe(createTable(ledger).join('\n'))
})

it('holds every rule of the note in a CHECK', () => {
  expect(noteChecks.serverOnly).toEqual([])
})
