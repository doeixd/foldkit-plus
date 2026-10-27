// @vitest-environment node
/**
 * The row log's migration says what `rowChangeLog(Db.Todo)` says: a change to
 * the table or the library that moves the triggers fails here, not in a
 * deployed database whose log stopped filling.
 */
import { readFileSync } from 'node:fs'
import { rowChangeLog } from 'foldkit-remote-drizzle'
import { expect, it } from 'vitest'
import { Db } from '../src/schema.js'

it('keeps the row log as rowChangeLog writes it', () => {
  const statements = readFileSync(
    new URL('../migrations/0004_row_change_log.sql', import.meta.url),
    'utf8',
  )
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(line => line !== '' && !line.startsWith('--') && !line.startsWith('DROP '))
  expect(statements).toEqual(rowChangeLog(Db.Todo))
})
