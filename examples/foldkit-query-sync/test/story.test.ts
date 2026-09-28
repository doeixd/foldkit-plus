import { Option } from 'effect'
import { Command, given, message, model, story } from 'foldkit/story'
import { modifyFields } from 'foldkit/struct'
import { Listbox } from '@foldkit/ui'
import { describe, expect, test } from 'vitest'

import { AppRoute, Message, type Model, Sorting, initialModel, update } from '../src/main.js'
import { urlOrThrow, withSearch } from './helpers.js'

const changedUrl = (raw: string) => Message.ChangedUrl({ url: urlOrThrow(raw) })

describe('update', () => {
  describe('ChangedUrl', () => {
    test('reads search, sorting, diet, and period from the URL', () => {
      story(
        update,
        given(initialModel),
        message(
          changedUrl(
            'http://localhost/?search=raptor&sorting=Length:Ascending&diet=Carnivore&period=Cretaceous',
          ),
        ),
        model(model => {
          expect(model.route).toStrictEqual(AppRoute.Browse())
          expect(model.search).toBe('raptor')
          expect(model.sorting).toStrictEqual(Sorting.Ascending({ column: 'Length' }))
          expect(model.diet).toStrictEqual(Option.some('Carnivore'))
          expect(model.period).toStrictEqual(Option.some('Cretaceous'))
        }),
      )
    })

    test('an invalid value reads as no filter, and leaves the valid ones', () => {
      const filtered = modifyFields(withSearch('rex'), {
        sorting: () => Sorting.Descending({ column: 'Name' }),
        diet: () => Option.some('Herbivore' as const),
        period: () => Option.some('Jurassic' as const),
      })
      story(
        update,
        given(filtered),
        message(
          changedUrl('http://localhost/?search=rex&sorting=Length&diet=Dragon&period=Jurassic'),
        ),
        model(model => {
          expect(model.search).toBe('rex')
          expect(model.sorting).toStrictEqual(Sorting.Unsorted())
          expect(model.diet).toStrictEqual(Option.none())
          expect(model.period).toStrictEqual(Option.some('Jurassic'))
        }),
      )
    })

    test('a URL without filters clears them, as back to a bare URL does', () => {
      story(
        update,
        given(modifyFields(withSearch('rex'), { diet: () => Option.some('Carnivore' as const) })),
        message(changedUrl('http://localhost/')),
        model(model => {
          expect(model.search).toBe('')
          expect(model.diet).toStrictEqual(Option.none())
        }),
      )
    })

    test('an unknown path falls through to NotFound', () => {
      story(
        update,
        given(initialModel),
        message(changedUrl('http://localhost/somewhere/else')),
        model(model => {
          expect(model.route).toStrictEqual(AppRoute.NotFound({ path: '/somewhere/else' }))
        }),
      )
    })

    test('the URL the Model already shows leaves the Model as it is', () => {
      const shown = modifyFields(withSearch('rex'), {
        sorting: () => Sorting.Ascending({ column: 'Weight' }),
      })
      const { model } = update(
        shown,
        changedUrl('http://localhost/?search=rex&sorting=Weight:Ascending'),
      )
      expect(model).toBe(shown)
    })
  })

  test('typing search text sets the search, and nothing else', () => {
    story(
      update,
      given(initialModel),
      message(Message.ChangedSearchInput({ value: 'rex' })),
      Command.expectNone(),
      model(model => expect(model).toStrictEqual(withSearch('rex'))),
    )
  })

  describe('ClickedColumnHeader', () => {
    const sortingAfter = (from: Model, clicks: ReadonlyArray<'Name' | 'Length'>): Sorting =>
      clicks.reduce(
        (current, column) => update(current, Message.ClickedColumnHeader({ column })).model,
        from,
      ).sorting

    test.each([
      [['Name'], Sorting.Ascending({ column: 'Name' })],
      [['Name', 'Name'], Sorting.Descending({ column: 'Name' })],
      [['Name', 'Name', 'Name'], Sorting.Unsorted()],
      [['Name', 'Name', 'Length'], Sorting.Ascending({ column: 'Length' })],
    ] as const)('clicks %j sort %o', (clicks, expected) => {
      expect(sortingAfter(initialModel, clicks)).toStrictEqual(expected)
    })
  })

  describe('Listbox SelectedItem', () => {
    const select = (wrap: (message: Listbox.Message) => Message, item: string) => [
      message(wrap(Listbox.Message.Opened({ maybeActiveItemIndex: Option.none() }))),
      Command.resolve(Listbox.FocusItems, Listbox.Message.CompletedFocusItems()),
      message(wrap(Listbox.Message.SelectedItem({ item }))),
      Command.resolve(Listbox.FocusButton, Listbox.Message.CompletedFocusButton()),
    ]
    const toDiet = (message: Listbox.Message) => Message.GotDietListboxMessage({ message })
    const toPeriod = (message: Listbox.Message) => Message.GotPeriodListboxMessage({ message })

    test('selecting a diet or a period filters by it', () => {
      story(
        update,
        given(initialModel),
        ...select(toDiet, 'Carnivore'),
        ...select(toPeriod, 'Triassic'),
        model(model => {
          expect(model.diet).toStrictEqual(Option.some('Carnivore'))
          expect(model.period).toStrictEqual(Option.some('Triassic'))
        }),
      )
    })

    test('selecting All clears the filter', () => {
      story(
        update,
        given(
          modifyFields(initialModel, {
            diet: () => Option.some('Carnivore' as const),
            period: () => Option.some('Triassic' as const),
          }),
        ),
        ...select(toDiet, ''),
        ...select(toPeriod, ''),
        model(model => {
          expect(model.diet).toStrictEqual(Option.none())
          expect(model.period).toStrictEqual(Option.none())
        }),
      )
    })
  })
})
