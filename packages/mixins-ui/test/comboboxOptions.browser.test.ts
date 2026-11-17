/// <reference types="@vitest/browser-playwright" />
/**
 * `Combobox.view` on a real runtime, over placed `Bundles.Combobox` and
 * values the application owns: real typing filters the rows, a press or the
 * keys choose one and the application's field follows through its `Choice`;
 * the default clear button draws its cross and empties the field keeping the
 * focus; a row's trailing part stands at the row's end; and a choice the
 * application wrote (at most two) refuses a third through the same view.
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
  Combobox,
  ComboboxSlots,
  Popover,
  Recipes,
  type Choice,
  type RowContent,
} from '../src/index.js'

const theme = Theme.standard(Theme.make({ accent: { hue: 265, chroma: 0.16 } }))
const style = Style.forSlots(ComboboxSlots)(Recipes.Combobox({}))

const cities = ['lis', 'opo', 'fao', 'bgz'] as const
type City = (typeof cities)[number]
const names: Readonly<Record<City, string>> = {
  lis: 'Lisbon',
  opo: 'Porto',
  fao: 'Faro',
  bgz: 'Braga',
}
const One = Combobox.one(cities)

/** A rule of the application's own: at most two, over the shipped `many`. */
const upToTwo = <Item extends string>(
  items: ReadonlyArray<Item>,
): Choice<Item, ReadonlyArray<Item>> => {
  const many = Combobox.many(items)
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
  Bundle.withChild('cityBox', Bundles.Combobox, {
    args: { id: 'city' },
    onOut: out => model => ({ model: { ...model, city: One.picked(model.city, out) } }),
  }),
  Bundle.withChild('stopsBox', Bundles.Combobox, {
    args: { id: 'stops', multiple: true },
    onOut: out => model => ({ model: { ...model, stops: Two.picked(model.stops, out) } }),
  }),
)
type Model = typeof App.Model.Type
type Message = typeof App.Message.Type

const anchor = Popover.anchor({ portal: false })
const option =
  (h: HtmlBuilder<Message>) =>
  (item: City): RowContent => ({
    label: names[item],
    trailing: h.span([h.DataAttribute('code', item)], [item.toUpperCase()]),
  })

const view = (model: Model, h: HtmlBuilder<Message>): Html =>
  h.div(
    [h.Style({ padding: '2rem', display: 'grid', gap: '12rem', inlineSize: '20rem' })],
    [
      Combobox.view(
        {
          model: model.cityBox,
          onMessage: message => App.Message.GotCityBoxMessage({ message }),
          label: 'City',
          choice: One,
          value: model.city,
          option: option(h),
          filter: Combobox.contains,
          clear: true,
          anchor,
          style,
        },
        h,
      ),
      Combobox.view(
        {
          model: model.stopsBox,
          onMessage: message => App.Message.GotStopsBoxMessage({ message }),
          label: 'Stops',
          choice: Two,
          value: model.stops,
          option: option(h),
          chips: true,
          anchor,
          style,
        },
        h,
      ),
      // What the application holds, drawn so the page shows its own fields.
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
  container.id = 'combobox-options-browser'
  document.body.append(container)
  handle = Runtime.embed(
    Runtime.makeElement({
      ...App.placements.runtime({
        Model: App.Model,
        initial: { city: Option.none(), stops: [] },
        update: App.placements.update(model => ({ model })),
        view,
      }),
      container,
    }),
  )
}

const field = (id: string) => {
  const found = document.getElementById(`${id}-input`)
  if (!(found instanceof HTMLInputElement)) throw new Error(`no field ${id}`)
  return found
}
const held = () => document.getElementById('held')?.textContent
const rowsOf = (id: string) => [
  ...document.querySelectorAll<HTMLElement>(`#${id}-items [role="option"]`),
]
const ready = () => vi.waitFor(() => expect(document.getElementById('city-input')).not.toBeNull())

test('typing filters the rows by label, and a press chooses: the application’s field follows', async () => {
  mount()
  await ready()
  field('city').focus()
  await userEvent.keyboard('r')
  await vi.waitFor(() =>
    expect(
      rowsOf('city').map(row => row.getAttribute('aria-label') ?? row.textContent),
    ).toHaveLength(3),
  )
  expect(rowsOf('city').some(row => row.textContent?.includes('Lisbon'))).toBe(false)
  const porto = rowsOf('city').find(row => row.textContent?.includes('Porto'))
  expect(porto).toBeDefined()
  await userEvent.click(porto!)
  await vi.waitFor(() => expect(held()).toBe('opo | '))
  await vi.waitFor(() => expect(field('city').value).toBe('Porto'))
  await vi.waitFor(() => expect(rowsOf('city')).toHaveLength(0))
})

test('the keys choose the row they are on', async () => {
  mount()
  await ready()
  field('city').focus()
  await userEvent.keyboard('fa')
  await vi.waitFor(() => expect(rowsOf('city')).toHaveLength(1))
  await userEvent.keyboard('{ArrowDown}{Enter}')
  await vi.waitFor(() => expect(held()).toBe('fao | '))
  expect(field('city').value).toBe('Faro')
  // Text typed and abandoned gives way to the chosen row's label: the field rests on it.
  await userEvent.keyboard('zz')
  await vi.waitFor(() => expect(field('city').value).toBe('Farozz'))
  await userEvent.keyboard('{Escape}')
  await vi.waitFor(() => expect(field('city').value).toBe('Faro'))
  expect(held()).toBe('fao | ')
})

test('the default clear button draws a cross, and empties the field keeping its focus', async () => {
  mount()
  await ready()
  expect(document.querySelector('[aria-label="Clear"]')).toBeNull()
  field('city').focus()
  await userEvent.keyboard('br')
  await vi.waitFor(() => expect(document.querySelector('[aria-label="Clear"]')).not.toBeNull())
  const clear = document.querySelector<HTMLElement>('[aria-label="Clear"]')!
  for (const stroke of ['::before', '::after']) {
    const drawn = getComputedStyle(clear, stroke)
    expect(drawn.content).not.toBe('none')
    expect(parseFloat(drawn.width)).toBeGreaterThan(4)
    expect(parseFloat(drawn.height)).toBeGreaterThan(0)
    expect(drawn.backgroundColor).not.toBe('rgba(0, 0, 0, 0)')
  }
  // The two strokes cross: one turned each way.
  expect(getComputedStyle(clear, '::before').rotate).not.toBe(
    getComputedStyle(clear, '::after').rotate,
  )
  await userEvent.click(clear)
  await vi.waitFor(() => expect(field('city').value).toBe(''))
  expect(document.activeElement).toBe(field('city'))
})

test('a row’s trailing part stands at the row’s end, after its label', async () => {
  mount()
  await ready()
  field('city').focus()
  await userEvent.keyboard('lis')
  await vi.waitFor(() => expect(rowsOf('city')).toHaveLength(1))
  const [row] = rowsOf('city')
  const trailing = row!.querySelector<HTMLElement>('[data-code="lis"]')!.getBoundingClientRect()
  const label = row!.querySelector('mark')!.getBoundingClientRect()
  const box = row!.getBoundingClientRect()
  expect(trailing.left).toBeGreaterThan(label.right)
  expect(box.right - trailing.right).toBeLessThan(box.width / 3)
  expect(trailing.left - label.right).toBeGreaterThan(box.width / 4)
  expect(
    Math.abs((trailing.top + trailing.bottom) / 2 - (label.top + label.bottom) / 2),
  ).toBeLessThan(2)
})

test('a choice the application wrote folds through the same view: no third stop', async () => {
  mount()
  await ready()
  field('stops').focus()
  await userEvent.keyboard('{ArrowDown}')
  await vi.waitFor(() => expect(rowsOf('stops')).toHaveLength(4))
  for (const name of ['Lisbon', 'Faro', 'Braga']) {
    await userEvent.click(rowsOf('stops').find(row => row.textContent?.includes(name))!)
  }
  await vi.waitFor(() => expect(held()).toBe('none | lis,fao'))
  // Choosing leaves a list of several open, and the chosen are chips by their labels.
  expect(rowsOf('stops')).toHaveLength(4)
  expect(
    [...document.querySelectorAll('#stops-input-wrapper li')].map(
      chip => chip.firstChild?.textContent,
    ),
  ).toEqual(['Lisbon', 'Faro'])
  await userEvent.click(document.querySelector('[aria-label="Remove Lisbon"]')!)
  await vi.waitFor(() => expect(held()).toBe('none | fao'))
})
