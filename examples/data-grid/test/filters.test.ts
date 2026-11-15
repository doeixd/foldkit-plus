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
