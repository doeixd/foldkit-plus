/// <reference types="@vitest/browser-playwright" />
/**
 * `Picker.view` on a real runtime at a phone's width, over a placed
 * `Bundles.Picker` and a value the application owns: the Sheet draws the
 * groups under their headings, a row's description and trailing part, and a
 * disabled row that a press does not choose; a choice in it reaches the
 * application through the `Choice`; and the clear button stands beside the
 * opener, inside its box, and empties the choice.
 */
import { Option, Schema } from 'effect'
import { Bundle } from 'foldkit-bundle'
import type { Html, HtmlBuilder } from 'foldkit/html'
import * as Runtime from 'foldkit/runtime'
import { Layers, Style } from 'foldkit-mixins'
import { Defaults } from 'foldkit-mixins/defaults'
import { Theme } from 'foldkit-mixins/theme'
import { afterEach, expect, test, vi } from 'vitest'
import { page, userEvent } from 'vitest/browser'
import {
  Bundles,
  ChoiceChange,
  DialogSlots,
  ListboxSlots,
  Picker,
  PickerSlots,
  Recipes,
  type RowContent,
} from '../src/index.js'

const theme = Theme.standard(Theme.make({ accent: { hue: 265, chroma: 0.16 } }))
const style = Style.forSlots(PickerSlots)(Recipes.Picker({}))
const listbox = Style.forSlots(ListboxSlots)(Recipes.Listbox({ width: 'trigger' }))
const sheet = Style.forSlots(DialogSlots)(Recipes.Sheet({}))

const sorts = ['relevance', 'price', 'name', 'rating'] as const
type Sort = (typeof sorts)[number]
const Sort = Picker.one(sorts)

const App = Bundle.compose({ sort: Schema.Option(Schema.Literals(sorts)) }).pipe(
  Bundle.withMessages({ Cleared: {} }),
  Bundle.withChild('box', Bundles.Picker, {
    args: { id: 'sort', animated: false },
    onOut: out => model => ({ model: { ...model, sort: Sort.picked(model.sort, out) } }),
  }),
)
type Model = typeof App.Model.Type
type Message = typeof App.Message.Type

const rowOf =
  (h: HtmlBuilder<Message>) =>
  (item: Sort): RowContent =>
    ({
      relevance: { label: 'Most relevant', description: 'The default' },
      price: { label: 'Lowest price', trailing: h.span([h.DataAttribute('tag', 'price')], ['£']) },
      name: { label: 'Name' },
      rating: { label: 'Rating', disabled: true },
    })[item]

let off = false

const view = (model: Model, h: HtmlBuilder<Message>): Html =>
  Picker.view(
    {
      model: model.box,
      onMessage: message => App.Message.GotBoxMessage({ message }),
      label: 'Sort',
      choice: Sort,
      value: model.sort,
      option: rowOf(h),
      groupBy: item => (item === 'relevance' || item === 'price' ? 'Quick' : 'Other'),
      heading: group => h.span([], [group]),
      placeholder: 'Sort by',
      disabled: off,
      clear: { onClear: App.Message.Cleared() },
      style,
      listbox: [listbox.mixin],
      sheet: [sheet.mixin],
    },
    h,
  )

let handle: { dispose: () => void } | undefined

afterEach(async () => {
  handle?.dispose()
  handle = undefined
  document.head.querySelectorAll('style[data-test]').forEach(element => element.remove())
  document.body.replaceChildren()
  await page.viewport(1440, 900)
})

const mount = async (sort: Option.Option<Sort> = Option.none(), disabled = false, width = 390) => {
  off = disabled
  await page.viewport(width, 800)
  const css = document.createElement('style')
  css.dataset['test'] = ''
  css.textContent =
    Style.stylesheet(
      Layers.standard.declare,
      Layers.standard.in('reset', Defaults.reset),
      Layers.standard.in('theme', Theme.root(theme)),
    ) +
    style.css +
    listbox.css +
    sheet.css
  document.head.append(css)
  const container = document.createElement('div')
  container.id = 'picker-options-browser'
  document.body.append(container)
  handle = Runtime.embed(
    Runtime.makeElement({
      ...App.placements.runtime({
        Model: App.Model,
        initial: { sort },
        update: App.placements.update(model => ({
          model: { ...model, sort: Sort.picked(model.sort, ChoiceChange.ClearedSelection()) },
        })),
        view,
      }),
      container,
    }),
  )
  await vi.waitFor(() => expect(opener()).not.toBeNull())
}

const opener = () => document.querySelector<HTMLElement>('button[aria-haspopup="dialog"]')!
const options = () => [
  ...document.querySelectorAll<HTMLElement>('#sort-sheet-panel [role="option"]'),
]

test('the Sheet draws the groups under their headings, with each row’s own content', async () => {
  await mount()
  await userEvent.click(opener())
  await vi.waitFor(() => expect(options()).toHaveLength(4))
  const groups = [...document.querySelectorAll('#sort-sheet-panel [role="group"]')]
  expect(groups.map(group => group.firstElementChild?.textContent)).toEqual(['Quick', 'Other'])
  expect(groups.map(group => group.querySelectorAll('[role="option"]').length)).toEqual([2, 2])
  expect(groups.every(group => group.getAttribute('aria-labelledby') !== null)).toBe(true)
  expect(options()[0]?.textContent).toContain('The default')
  const trailing = options()[1]!
    .querySelector<HTMLElement>('[data-tag="price"]')!
    .getBoundingClientRect()
  expect(options()[1]!.getBoundingClientRect().right - trailing.right).toBeLessThan(60)
})

test('a press chooses a row, but not a disabled one', async () => {
  await mount()
  await userEvent.click(opener())
  await vi.waitFor(() => expect(options()).toHaveLength(4))
  expect(options()[3]?.getAttribute('aria-disabled')).toBe('true')
  // Playwright refuses an `aria-disabled` element: the press is the DOM's own.
  options()[3]!.click()
  await new Promise(done => setTimeout(done, 100))
  expect(options()).toHaveLength(4)
  await userEvent.click(options()[1]!)
  await vi.waitFor(() => expect(opener().getAttribute('aria-label')).toBe('Sort: Lowest price'))
  await vi.waitFor(() => expect(options()).toHaveLength(0))
})

test('the clear button stands inside the opener’s box, and empties the choice', async () => {
  await mount(Option.some('name'))
  const clear = await vi.waitFor(() => {
    const found = document.querySelector<HTMLElement>(
      'button[aria-haspopup="dialog"] + [aria-label="Clear"]',
    )
    expect(found).not.toBeNull()
    return found!
  })
  const box = opener().getBoundingClientRect()
  const at = clear.getBoundingClientRect()
  expect(at.left).toBeGreaterThan(box.left)
  expect(at.right).toBeLessThan(box.right)
  expect(at.top).toBeGreaterThanOrEqual(box.top)
  expect(at.bottom).toBeLessThanOrEqual(box.bottom)
  await userEvent.click(clear)
  await vi.waitFor(() => expect(opener().getAttribute('aria-label')).toBe('Sort: Sort by'))
})

test('a disabled picker’s opener opens nothing', async () => {
  await mount(Option.none(), true)
  // Playwright refuses an `aria-disabled` element: the press is the DOM's own.
  opener().click()
  await new Promise(done => setTimeout(done, 100))
  expect(opener().getAttribute('aria-expanded')).toBe('false')
  expect(options()).toHaveLength(0)
})

test.each([
  [1280, 0],
  [390, 1],
] as const)('at %ipx the half that is not shown takes no room', async (width, shown) => {
  await mount(Option.some('name'), false, width)
  const root = document.body.firstElementChild!
  await vi.waitFor(() => expect(root.children.length).toBeGreaterThan(1))
  const half = root.children[shown]!
  // The root is as tall as the half that is drawn: an empty box left by the other would add a line.
  expect(root.getBoundingClientRect().height).toBeCloseTo(half.getBoundingClientRect().height, 0)
  expect(root.children[1 - shown]!.getBoundingClientRect().height).toBe(0)
})
