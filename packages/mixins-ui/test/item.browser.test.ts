/**
 * Rows on a real runtime over the shipped palette: a press anywhere on a
 * pressable row is the row's and a press on its action the action's alone;
 * a chosen row keeps a film of its text that steps away from the page as the
 * text does, in both schemes; a list divides its rows by a hairline between
 * them; and an icon sits in a tinted tile.
 */
import { Schema } from 'effect'
import type { HtmlBuilder } from 'foldkit/html'
import { defineMessageUnion } from 'foldkit/message'
import * as Runtime from 'foldkit/runtime'
import { Layers, Style } from 'foldkit-mixins'
import { Theme } from 'foldkit-mixins/theme'
import { afterEach, expect, test, vi } from 'vitest'
import { userEvent } from 'vitest/browser'
import { Item, ItemGroupSlots, ItemSlots, Recipes } from '../src/index.js'

const Message = defineMessageUnion({ Pressed: { key: Schema.String }, Acted: {} })
type Message = typeof Message.Type
const Model = Schema.Struct({ log: Schema.Array(Schema.String) })
type Model = typeof Model.Type

const theme = Theme.compose(Theme.tokens, Theme.oklch({ accent: { h: 265, c: 0.16, l: '52%' } }))
const L = Layers.standard
const rowStyle = Style.forSlots(ItemSlots)(Recipes.Item({ media: 'icon' }))
const listStyle = Style.forSlots(ItemGroupSlots)(Recipes.ItemGroup({}))

afterEach(() => {
  document.head.querySelectorAll('style[data-test]').forEach(element => element.remove())
  document.body.replaceChildren()
})

const view = (_: Model, h: HtmlBuilder<Message>) =>
  h.div(
    [h.Style({ width: '360px', padding: '16px' })],
    [
      Item.group(
        {
          label: 'Settings',
          items: ['wifi', 'bluetooth', 'sound'].map(key => ({
            key,
            title: key,
            description: 'On',
            media: h.span([], ['◎']),
            selected: key === 'bluetooth',
            press: { onClick: Message.Pressed({ key }) },
            actions: h.button([h.Type('button'), h.OnClick(Message.Acted())], [`Edit ${key}`]),
          })),
          style: listStyle,
          itemStyle: rowStyle,
        },
        h,
      ),
    ],
  )

const mount = async (scheme: 'light' | 'dark') => {
  const sheet = document.createElement('style')
  sheet.dataset['test'] = ''
  sheet.textContent =
    Style.stylesheet(L.declare, L.in('theme', Theme.root(theme, { colorScheme: scheme }))) +
    rowStyle.css +
    listStyle.css
  document.head.append(sheet)
  document.body.style.background = 'var(--fk-surface-base)'
  let latest: Model = { log: [] }
  const container = document.createElement('div')
  container.id = `item-${scheme}`
  document.body.appendChild(container)
  const handle = Runtime.embed(
    Runtime.makeElement({
      Model,
      container,
      init: () => ({ model: latest }),
      update: (model: Model, message: Message) => {
        latest = { log: [...model.log, message._tag] }
        return { model: latest }
      },
      view,
    }),
  )
  await vi.waitFor(() => expect(document.querySelector('[aria-label="sound"]')).not.toBeNull())
  return { handle, log: () => latest.log }
}

const control = (name: string) => document.querySelector<HTMLElement>(`[aria-label="${name}"]`)!
const rowOf = (name: string) => control(name).parentElement!

test('a press anywhere on a row is the row, and on its action only the action', async () => {
  const { handle, log } = await mount('light')
  try {
    const description = Array.from(rowOf('wifi').querySelectorAll('div')).find(
      div => div.textContent === 'On',
    )!
    // Forced: the overlay is on top there, which is the claim.
    await userEvent.click(description, { force: true })
    await vi.waitFor(() => expect(log()).toEqual(['Pressed']))
    await userEvent.click(document.querySelector<HTMLElement>('button:not([aria-label])')!)
    await vi.waitFor(() => expect(log()).toEqual(['Pressed', 'Acted']))
  } finally {
    handle.dispose()
  }
})

/** The lightness the browser paints a pixel of `element`'s background over the page. */
const painted = (element: Element) => {
  const canvas = document.createElement('canvas')
  const context = canvas.getContext('2d')!
  context.fillStyle = getComputedStyle(document.body).backgroundColor
  context.fillRect(0, 0, 1, 1)
  const image = getComputedStyle(element).backgroundImage
  // The film is a gradient of one color: paint that color.
  const color = /linear-gradient\((.+?\)), /.exec(image)
  if (color !== null) {
    context.fillStyle = color[1]!
    context.fillRect(0, 0, 1, 1)
  }
  const [r, g, b] = context.getImageData(0, 0, 1, 1).data
  return (r! + g! + b!) / 3
}

test.each(['light', 'dark'] as const)(
  'in a %s scheme, a chosen row steps away from the page as its text does',
  async scheme => {
    const { handle } = await mount(scheme)
    try {
      // A pointer an earlier test left over a row would hover it.
      await userEvent.hover(document.body, { position: { x: 900, y: 600 } })
      const page = painted(document.body)
      const chosen = painted(rowOf('bluetooth'))
      if (scheme === 'dark') expect(chosen - page).toBeGreaterThan(5)
      else expect(page - chosen).toBeGreaterThan(5)
      expect(painted(rowOf('wifi'))).toBe(page)
    } finally {
      handle.dispose()
    }
  },
)

test('a list draws a hairline between rows, and an icon sits in a tinted tile', async () => {
  const { handle } = await mount('light')
  try {
    const [first, second] = Array.from(document.querySelectorAll('li'))
    expect(getComputedStyle(first!).borderTopWidth).toBe('0px')
    expect(getComputedStyle(second!).borderTopWidth).toBe('1px')
    const tile = rowOf('wifi').firstElementChild!
    expect(getComputedStyle(tile).backgroundColor).not.toBe('rgba(0, 0, 0, 0)')
    expect(tile.getBoundingClientRect().width).toBe(40)
  } finally {
    handle.dispose()
  }
})
