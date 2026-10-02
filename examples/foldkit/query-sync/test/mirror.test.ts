// @vitest-environment jsdom
import { Effect, Option, Stream } from 'effect'
import { modifyFields } from 'foldkit/struct'
import { describe, expect, test } from 'vitest'

import { Filters, type Model, Sorting, init, initialModel } from '../src/main.js'
import { urlOrThrow, withSearch } from './helpers.js'

const filtered: Model = modifyFields(withSearch('rex'), {
  sorting: () => Sorting.Descending({ column: 'Weight' }),
  diet: () => Option.some('Carnivore' as const),
  period: () => Option.some('Cretaceous' as const),
})

describe('the Filters mirror', () => {
  test('writes sorting in the format it reads', () => {
    const href = Filters.href(
      modifyFields(initialModel, { sorting: () => Sorting.Ascending({ column: 'Length' }) }),
      {},
      '/',
    )
    expect(decodeURIComponent(href)).toBe('/?sorting=Length:Ascending')
  })

  test('leaves every filter at its initial value out of the URL', () => {
    expect(Filters.href(initialModel, {}, '/')).toBe('/')
  })

  test('a link it writes loads back to the same filters', () => {
    const href = Filters.href(filtered, {}, '/')
    const loaded = init(urlOrThrow(`http://localhost${href}`)).model
    expect(Filters.encode(loaded)).toStrictEqual({
      search: 'rex',
      sorting: 'Weight:Descending',
      diet: 'Carnivore',
      period: 'Cretaceous',
    })
    expect(loaded).toStrictEqual(filtered)
  })

  test('replaces the history entry rather than adding one', async () => {
    window.history.replaceState(null, '', '/?page=2')
    const entries = window.history.length
    const write = Filters.subscriptions['filters.mirror']
    await Effect.runPromise(
      Stream.runDrain(write.dependenciesToStream({ keys: Filters.encode(filtered) })),
    )
    expect(window.history.length).toBe(entries)
    // Keys it does not own, such as `page`, stay.
    expect(new URLSearchParams(window.location.search).get('page')).toBe('2')
    expect(new URLSearchParams(window.location.search).get('diet')).toBe('Carnivore')
  })
})
