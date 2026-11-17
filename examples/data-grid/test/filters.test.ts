/** Taking every filter off at once: what it clears, and that a repeat changes nothing. */
import { Option } from 'effect'
import { modifyFields } from 'foldkit/struct'
import { expect, test } from 'vitest'
import { Grid, Message, init, update } from '../src/main.js'

test('Clear filters takes every filter off, and with none on it changes nothing', () => {
  const clear = Message.ClearedFilters()
  const unfiltered = init(10).model
  expect(update(unfiltered, clear).model).toBe(unfiltered)

  const model = modifyFields(unfiltered, {
    filters: filters =>
      Grid.setFilter(filters, {
        column: 'line',
        filter: Option.some({ _tag: 'Contains', text: 'Paint' }),
      }),
  })
  const cleared = update(model, clear).model
  expect(cleared.filters).toBe(Grid.noFilters)
  expect(cleared.notice).toBe('Filters cleared.')
})

test.each([
  [1, 1, 'Copied 1 row by 1 column.'],
  [3, 2, 'Copied 3 rows by 2 columns.'],
  [1200, 1, 'Copied 1,200 rows by 1 column.'],
])('a copy of %i rows by %i columns says so in the notice', (rows, columns, notice) => {
  const copied = update(
    init(10).model,
    Message.GotGridMessage({ message: Grid.Message.Copied({ rows, columns }) }),
  )
  expect(copied.model.notice).toBe(notice)
})
