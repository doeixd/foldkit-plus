/// <reference types="@vitest/browser-playwright" />
/**
 * `Listbox.view` on a real runtime, over placed `Bundles.Listbox` and values
 * the application owns: a press or the keys choose a row and the application's
 * field follows through its `Choice`; the clear button draws a cross inside
 * the trigger, clear of its text and chevron, and empties the choice; a
 * closed listbox in a form submits its value; a row's trailing part stands at
 * the row's end; and a choice the application wrote (at most two) refuses a
 * third through the same view.
 */
import { Option, Schema } from 'effect'
import { Bundle } from 'foldkit-bundle'
import type { Html, HtmlBuilder } from 'foldkit/html'
import * as Runtime from 'foldkit/runtime'
import { Layers, Style } from 'foldkit-mixins'
import { Defaults } from 'foldkit-mixins/defaults'
import { Theme } from 'foldkit-mixins/theme'
import { afterEach, expect, test, vi } from 'vitest'
import { userEvent } from 'vitest/browser'
import {
  Bundles,
  ChoiceChange,
  Listbox,
  ListboxSlots,
  Popover,
  Recipes,
  type Choice,
  type RowContent,
} from '../src/index.js'

const theme = Theme.standard(Theme.make({ accent: { hue: 265, chroma: 0.16 } }))
const style = Style.forSlots(ListboxSlots)(Recipes.Listbox({ width: 'trigger' }))

const cities = ['lis', 'opo', 'fao', 'bgz'] as const
type City = (typeof cities)[number]
const names: Readonly<Record<City, string>> = {
  lis: 'Lisbon',
  opo: 'Porto',
  fao: 'Faro',
  bgz: 'Braga',
}
const One = Listbox.one(cities)

/** A rule of the application's own: at most two, over the shipped `many`. */
const upToTwo = <Item extends string>(
  items: ReadonlyArray<Item>,
): Choice<Item, ReadonlyArray<Item>> => {
  const many = Listbox.many(items)
  return {
    ...many,
    picked: (value, change) => {
      const next = many.picked(value, change)
      return next.length > 2 ? value : next
    },
  }
}
const Two = upToTwo(cities)

const App = Bundle.compose({
  city: Schema.Option(Schema.Literals(cities)),
  stops: Schema.Array(Schema.Literals(cities)),
}).pipe(
  Bundle.withMessages({ ClearedCity: {} }),
  Bundle.withChild('cityBox', Bundles.Listbox, {
    args: { id: 'city' },
    onOut: out => model => ({ model: { ...model, city: One.picked(model.city, out) } }),
  }),
  Bundle.withChild('stopsBox', Bundles.Listbox, {
    args: { id: 'stops', multiple: true },
    onOut: out => model => ({ model: { ...model, stops: Two.picked(model.stops, out) } }),
  }),
)
type Model = typeof App.Model.Type

const anchor = Popover.anchor({ portal: false })
const option =
  (h: HtmlBuilder<typeof App.Message.Type>) =>
  (item: City): RowContent => ({
    label: names[item],
    trailing: h.span([h.DataAttribute('code', item)], [item.toUpperCase()]),
  })

const view = (model: Model, h: HtmlBuilder<typeof App.Message.Type>): Html =>
  h.form(
    [
      h.Id('form'),
      h.Style({ padding: '2rem', display: 'grid', gap: '12rem', inlineSize: '20rem' }),
    ],
    [
      Listbox.view(
        {
          model: model.cityBox,
          onMessage: message => App.Message.GotCityBoxMessage({ message }),
          label: 'City',
          choice: One,
          value: model.city,
          option: option(h),
          placeholder: 'Pick a city',
          clear: { onClear: App.Message.ClearedCity() },
          name: 'city',
          anchor,
          style,
        },
        h,
      ),
      Listbox.view(
        {
          model: model.stopsBox,
          onMessage: message => App.Message.GotStopsBoxMessage({ message }),
          label: 'Stops',
          choice: Two,
          value: model.stops,
          option: option(h),
          placeholder: 'Pick stops',
          anchor,
          style,
        },
        h,
      ),
      h.output(
        [h.Id('held')],
        [`${Option.getOrElse(model.city, () => 'none')} | ${model.stops.join(',')}`],
      ),
    ],
  )

let handle: { dispose: () => void } | undefined

afterEach(() => {
  handle?.dispose()
  handle = undefined
  document.head.querySelectorAll('style[data-test]').forEach(element => element.remove())
  document.body.replaceChildren()
})

const mount = () => {
  const sheet = document.createElement('style')
  sheet.dataset['test'] = ''
  sheet.textContent =
    Style.stylesheet(
      Layers.standard.declare,
      Layers.standard.in('reset', Defaults.reset),
      Layers.standard.in('theme', Theme.root(theme)),
    ) + style.css
  document.head.append(sheet)
  const container = document.createElement('div')
  container.id = 'listbox-options-browser'
  document.body.append(container)
  handle = Runtime.embed(
    Runtime.makeElement({
      ...App.placements.runtime({
        Model: App.Model,
        initial: { city: Option.none(), stops: [] },
        update: App.placements.update(model => ({
          model: { ...model, city: One.picked(model.city, ChoiceChange.ClearedSelection()) },
        })),
        view,
      }),
      container,
    }),
  )
}

const button = (id: string) => {
  const found = document.getElementById(`${id}-button`)
  if (!(found instanceof HTMLElement)) throw new Error(`no trigger ${id}`)
  return found
}
const held = () => document.getElementById('held')?.textContent
const rowsOf = (id: string) => [
  ...document.querySelectorAll<HTMLElement>(`#${id}-items [role="option"]`),
]
const ready = () => vi.waitFor(() => expect(document.getElementById('city-button')).not.toBeNull())
const submitted = () => [...new FormData(document.querySelector<HTMLFormElement>('#form')!)]

test('a press opens the list and chooses a row: the application’s field follows, and the form submits it closed', async () => {
  mount()
  await ready()
  expect(submitted()).toEqual([['city', '']])
  await userEvent.click(button('city'))
  await vi.waitFor(() => expect(rowsOf('city')).toHaveLength(4))
  await userEvent.click(rowsOf('city').find(row => row.textContent?.includes('Porto'))!)
  await vi.waitFor(() => expect(held()).toBe('opo | '))
  await vi.waitFor(() => expect(rowsOf('city')).toHaveLength(0))
  expect(button('city').textContent).toContain('Porto')
  expect(submitted()).toEqual([['city', 'opo']])
})

test('the keys choose the row they are on', async () => {
  mount()
  await ready()
  button('city').focus()
  await userEvent.keyboard('{Enter}{ArrowDown}{ArrowDown}{Enter}')
  await vi.waitFor(() => expect(held()).toBe('fao | '))
})

test('the clear button sits inside the trigger, clear of its text and chevron, and empties the choice', async () => {
  mount()
  await ready()
  expect(document.querySelector('[aria-label="Clear"]')).toBeNull()
  await userEvent.click(button('city'))
  await vi.waitFor(() => expect(rowsOf('city')).toHaveLength(4))
  await userEvent.click(rowsOf('city')[1]!)
  await vi.waitFor(() => expect(document.querySelector('[aria-label="Clear"]')).not.toBeNull())
  const clear = document.querySelector<HTMLElement>('[aria-label="Clear"]')!
  for (const stroke of ['::before', '::after']) {
    const drawn = getComputedStyle(clear, stroke)
    expect(drawn.content).not.toBe('none')
    expect(parseFloat(drawn.width)).toBeGreaterThan(4)
  }
  const box = button('city').getBoundingClientRect()
  const at = clear.getBoundingClientRect()
  expect(at.left).toBeGreaterThan(box.left)
  expect(at.right).toBeLessThan(box.right)
  expect(at.top).toBeGreaterThanOrEqual(box.top)
  expect(at.bottom).toBeLessThanOrEqual(box.bottom)
  // Clear of the text, which ends before the button, and of the chevron, which starts after it.
  const text = button('city').querySelector<HTMLElement>('[data-placeholder]')!
  const range = document.createRange()
  range.selectNodeContents(text)
  expect(range.getBoundingClientRect().right).toBeLessThanOrEqual(at.left)
  const chevron = button('city').querySelector<HTMLElement>('[aria-hidden="true"]')!
  expect(at.right).toBeLessThanOrEqual(chevron.getBoundingClientRect().left)
  // Concentric: its corners are rounded and tighter than the trigger's.
  const corner = parseFloat(getComputedStyle(clear).borderStartStartRadius)
  expect(corner).toBeGreaterThan(0)
  expect(corner).toBeLessThan(parseFloat(getComputedStyle(button('city')).borderStartStartRadius))
  await userEvent.click(clear)
  await vi.waitFor(() => expect(held()).toBe('none | '))
  expect(document.querySelector('[aria-label="Clear"]')).toBeNull()
  expect(button('city').textContent).toContain('Pick a city')
})

test('a row’s trailing part stands at the row’s end, after its label', async () => {
  mount()
  await ready()
  await userEvent.click(button('city'))
  await vi.waitFor(() => expect(rowsOf('city')).toHaveLength(4))
  const row = rowsOf('city')[0]!
  const trailing = row.querySelector<HTMLElement>('[data-code="lis"]')!.getBoundingClientRect()
  const box = row.getBoundingClientRect()
  expect(box.right - trailing.right).toBeLessThan(box.width / 3)
  expect(trailing.left).toBeGreaterThan(box.left + box.width / 3)
})

test('a choice the application wrote folds through the same view: no third stop', async () => {
  mount()
  await ready()
  await userEvent.click(button('stops'))
  await vi.waitFor(() => expect(rowsOf('stops')).toHaveLength(4))
  for (const name of ['Lisbon', 'Faro', 'Braga']) {
    await userEvent.click(rowsOf('stops').find(row => row.textContent?.includes(name))!)
  }
  await vi.waitFor(() => expect(held()).toBe('none | lis,fao'))
  // Choosing leaves a list of several open, and the trigger names the chosen.
  expect(rowsOf('stops')).toHaveLength(4)
  expect(button('stops').textContent).toContain('Lisbon, Faro')
})
