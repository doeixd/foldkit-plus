/**
 * Phase 4: filters and sort. A choice reaches the Model through a desktop
 * dropdown or a phone's sheet; All Results is arranged from it and the
 * prices read; the Available filter and the price sorts read the whole
 * catalog.
 */
import * as UiDialog from '@foldkit/ui/dialog'
import * as UiListbox from '@foldkit/ui/listbox'
import { Effect, Option, Stream } from 'effect'
import { fromString } from 'foldkit/url'
import { Sheet } from 'foldkit-mixins-ui'
import type { RemoteClient } from 'foldkit-remote'
import { Respond, Trace } from 'foldkit-remote/testing'
import { describe, expect, test } from 'vitest'
import {
  Data,
  Message,
  actives,
  arrangementOf,
  freshness,
  init,
  readNames,
  update,
  type Model,
} from '../src/client/app.js'
import { FocusFiltersButton } from '../src/client/command.js'
import { SearchInput } from '../src/client/message.js'
import { namesOf } from '../src/client/results.js'
import { readDomains } from '../src/server/remote.js'

const empty = init(Option.getOrThrow(fromString('https://domains.test/'))).model

const client: RemoteClient['Service'] = {
  read: batch =>
    Effect.succeed({
      settled: [],
      entities: readDomains(batch.requests.map(({ id }) => id)).map(({ id, values }) => ({
        entity: 'Domain',
        id,
        values,
      })),
    }),
  query: () => Effect.die('the page lists nothing'),
  mutate: () => Effect.die('the page writes nothing'),
  live: () => Stream.die('the page reads nothing live'),
}

const searched = (value: string): ReadonlyArray<Message> => [
  Message.UpdatedSearch({ value }),
  Message.GotSearchMessage({ message: SearchInput.Message.Settled({ value, generation: 1 }) }),
]

/** A row chosen in a desktop dropdown, which hands back any string. */
const sorted = (item: string) =>
  Message.GotSortListboxMessage({ message: UiListbox.Message.SelectedItem({ item }) })
const shown = (item: string) =>
  Message.GotAvailabilityListboxMessage({ message: UiListbox.Message.SelectedItem({ item }) })

const run = (steps: ReadonlyArray<Message | Respond>) =>
  Trace.run(Data, {
    start: empty,
    update,
    active: actives,
    options: { policy: freshness },
    client,
    steps,
  })

const last = (trace: {
  readonly entries: ReadonlyArray<{ readonly model: Model }>
  readonly start: Model
}) => trace.entries.at(-1)?.model ?? trace.start

/** The names All Results lists, in its order. */
const listed = (model: Model): ReadonlyArray<string> =>
  arrangementOf(model, 'vercel').groups.flatMap(group => group.listings.map(({ name }) => name))

describe('every sort and availability', () => {
  test.each([
    ['Relevance', 'All', ['vercel.com', 'vercel.dev', 'vercel.app'], 556],
    ['Length', 'All', ['vercel.ac', 'vercel.ag', 'vercel.ai'], 556],
    ['Alphabetical', 'All', ['vercel.ac', 'vercel.academy', 'vercel.accountant'], 556],
    ['PriceAscending', 'All', ['vercel.space', 'vercel.site', 'vercel.xyz'], 556],
    ['PriceDescending', 'All', ['vercel.ai', 'vercel.design', 'vercel.io'], 556],
    ['Relevance', 'Available', ['vercel.app', 'vercel.io', 'vercel.ai'], 554],
    ['Length', 'Available', ['vercel.ac', 'vercel.ag', 'vercel.ai'], 554],
    ['Alphabetical', 'Available', ['vercel.ac', 'vercel.academy', 'vercel.accountant'], 554],
    ['PriceAscending', 'Available', ['vercel.space', 'vercel.site', 'vercel.xyz'], 554],
    ['PriceDescending', 'Available', ['vercel.ai', 'vercel.design', 'vercel.io'], 554],
  ] as const)(
    'sorted by %s showing %s: %j first, %i in all',
    async (sort, availability, first, count) => {
      const trace = await run([
        ...searched('vercel'),
        sorted(sort),
        shown(availability),
        Respond.all,
      ])
      const model = last(trace)
      expect(model.sortOrder).toBe(sort)
      expect(model.availabilityFilter).toBe(availability)
      expect(listed(model).slice(0, 3)).toEqual(first)
      expect(arrangementOf(model, 'vercel').count).toBe(count)
    },
  )

  test('a price sort puts the names with no price last', async () => {
    const trace = await run([...searched('vercel'), sorted('PriceAscending'), Respond.all])
    expect(listed(last(trace)).slice(-2)).toEqual(['vercel.com', 'vercel.dev'])
  })
})

describe('reading for the filters', () => {
  test('the Available filter and the price sorts read the whole catalog, the others what is in view', async () => {
    const searching = searched('vercel').reduce(
      (model, message) => update(model, message).model,
      empty,
    )
    expect(readNames(searching).length).toBeLessThan(100)
    for (const choice of [
      shown('Available'),
      sorted('PriceAscending'),
      sorted('PriceDescending'),
    ]) {
      expect(readNames(update(searching, choice).model)).toEqual(namesOf('vercel'))
    }
    expect(readNames(update(searching, sorted('Alphabetical')).model).length).toBeLessThan(100)
  })

  test('a filter chosen while the prices are read applies when they land', async () => {
    const before = await run([...searched('vercel'), shown('Available')])
    // Nothing is known yet: every name stays, pending.
    expect(listed(last(before))).toContain('vercel.com')
    const after = await run([...searched('vercel'), shown('Available'), Respond.all])
    expect(listed(last(after))).not.toContain('vercel.com')
  })

  test('a value no option holds changes nothing', () => {
    expect(update(empty, sorted('Cheapest')).model.sortOrder).toBe('Relevance')
  })
})

describe('the TLD filter on a phone', () => {
  test('opens with an empty search, filters by the extension chosen and closes', () => {
    const typed = update(
      update(empty, Message.ClickedTldFilter()).model,
      Message.UpdatedTldSearch({ value: '.de' }),
    ).model
    expect(Sheet.isOpen(typed.tldSheet)).toBe(true)
    const reopened = update(typed, Message.ClickedTldFilter()).model
    expect(reopened.tldSearchQuery).toBe('')
    const chosen = update(typed, Message.ClickedMobileTldOption({ value: 'Dev' })).model
    expect(chosen.tldFilter).toBe('Dev')
    expect(Sheet.isOpen(chosen.tldSheet)).toBe(false)
  })
})

describe('the TLD filter on a desktop', () => {
  test('a row chosen in the dropdown filters by it', () => {
    const chosen = update(
      empty,
      Message.GotTldListboxMessage({ message: UiListbox.Message.SelectedItem({ item: 'Dev' }) }),
    ).model
    expect(chosen.tldFilter).toBe('Dev')
    expect(arrangementOf(chosen, 'vercel').count).toBe(1)
  })
})

describe('availability and sort on a phone', () => {
  /** The Dialog's own report that its close has run. */
  const closedFrom = (model: Model) =>
    update(
      model,
      Message.GotFiltersSheetMessage({
        message: Sheet.Message.GotDialog({ message: UiDialog.Message.CompletedCloseDialog() }),
      }),
    )

  test('one sheet holds both: a choice applies, closes it, and gives focus back to its button once closed', () => {
    const opened = update(empty, Message.ClickedFilters()).model
    expect(Sheet.isOpen(opened.filtersSheet)).toBe(true)
    const sorted = update(opened, Message.ClickedMobileSortOption({ value: 'PriceAscending' }))
    expect(sorted.model.sortOrder).toBe('PriceAscending')
    expect(Sheet.isOpen(sorted.model.filtersSheet)).toBe(false)
    const closed = closedFrom(sorted.model)
    // Focus moves once the browser has closed it, not when the choice asks it to close.
    expect((sorted.commands ?? []).map(command => command.name)).not.toContain(
      FocusFiltersButton().name,
    )
    expect((closed.commands ?? []).map(command => command.name)).toContain(
      FocusFiltersButton().name,
    )

    const reopened = update(closed.model, Message.ClickedFilters()).model
    const shown = update(reopened, Message.ClickedMobileAvailabilityOption({ value: 'Available' }))
    expect(shown.model.availabilityFilter).toBe('Available')
    expect(shown.model.sortOrder).toBe('PriceAscending')
    expect(Sheet.isOpen(shown.model.filtersSheet)).toBe(false)
  })
})
