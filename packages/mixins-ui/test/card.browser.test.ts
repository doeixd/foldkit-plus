/**
 * Cards on a real runtime, with the shipped recipes installed: a press
 * anywhere on a pressable card is the card's, a press on its action is the
 * action's alone, the dismiss button shows on hover, and a group's one
 * highlight lands on the card the pointer is nearest.
 */
import { Schema } from 'effect'
import type { HtmlBuilder } from 'foldkit/html'
import { defineMessageUnion } from 'foldkit/message'
import * as Runtime from 'foldkit/runtime'
import { Layers, Style } from 'foldkit-mixins'
import { Theme } from 'foldkit-mixins/theme'
import { afterEach, expect, test, vi } from 'vitest'
import { userEvent } from 'vitest/browser'
import { Card, CardGroupSlots, CardSlots, Recipes } from '../src/index.js'
import { unitKnobs } from './fixture.js'

const Message = defineMessageUnion({
  Pressed: { key: Schema.String },
  Acted: { key: Schema.String },
  Dismissed: { key: Schema.String },
})
type Message = typeof Message.Type
const Model = Schema.Struct({ log: Schema.Array(Schema.String) })
type Model = typeof Model.Type

const cardStyle = Style.forSlots(CardSlots)(Recipes.Card({}))
const plainStyle = Style.forSlots(CardSlots)(Recipes.Card({ surface: 'plain' }))
const groupStyle = Style.forSlots(CardGroupSlots)(Recipes.CardGroup({}))
// At unit knobs: what is measured here is the scale's nominal size or time.
const theme = Theme.standard(Theme.make({ ...unitKnobs, accent: { hue: 265, chroma: 0.16 } }))
const L = Layers.standard

afterEach(() => {
  document.head.querySelectorAll('style[data-test]').forEach(element => element.remove())
  document.body.replaceChildren()
})

const view = (_: Model, h: HtmlBuilder<Message>) =>
  h.div(
    [h.Style({ display: 'grid', gap: '2rem', width: '360px', padding: '16px' })],
    [
      Card.view(
        {
          title: 'Solo',
          description: 'One card on its own',
          press: { onClick: Message.Pressed({ key: 'solo' }) },
          action: h.button([h.Type('button'), h.OnClick(Message.Acted({ key: 'solo' }))], ['Edit']),
          dismiss: { onDismiss: Message.Dismissed({ key: 'solo' }) },
          style: cardStyle,
        },
        h,
      ),
      Card.view(
        {
          title: 'With an icon',
          media: h.svg([h.Id('icon'), h.ViewBox('0 0 16 16'), h.AriaHidden(true)], []),
          style: cardStyle,
        },
        h,
      ),
      Card.view(
        {
          title: 'With an avatar',
          // An avatar's shape: a circle of its own size, wider than an icon's tile.
          media: h.span(
            [
              h.Id('avatar'),
              h.Style({ display: 'block', width: '56px', height: '56px', borderRadius: '50%' }),
            ],
            [],
          ),
          style: cardStyle,
        },
        h,
      ),
      Card.group(
        {
          cards: ['a', 'b', 'c'].map(key => ({
            key,
            title: `Card ${key}`,
            selected: key === 'c',
            press: { onClick: Message.Pressed({ key }) },
          })),
          label: 'Choices',
          style: groupStyle,
          cardStyle: plainStyle,
        },
        h,
      ),
    ],
  )

const mount = () => {
  const style = document.createElement('style')
  style.dataset['test'] = ''
  style.textContent =
    Style.stylesheet(L.declare, L.in('theme', Theme.root(theme))) +
    cardStyle.css +
    plainStyle.css +
    groupStyle.css
  document.head.append(style)
  let latest: Model = { log: [] }
  const container = document.createElement('div')
  container.id = 'card-browser'
  document.body.appendChild(container)
  const handle = Runtime.embed(
    Runtime.makeElement({
      Model,
      container,
      init: () => ({ model: latest }),
      update: (model: Model, message: Message) => {
        latest = { log: [...model.log, `${message._tag}:${message.key}`] }
        return { model: latest }
      },
      view,
    }),
  )
  return { handle, log: () => latest.log }
}

const byName = (name: string) =>
  document.querySelector<HTMLElement>(`[aria-label="${name}"]`) ??
  Array.from(document.querySelectorAll<HTMLElement>('button')).find(
    button => button.textContent === name,
  )!

test('a press anywhere on a card is the card, and on its action only the action', async () => {
  const { handle, log } = mount()
  try {
    await vi.waitFor(() => expect(byName('Solo')).toBeTruthy())
    const card = byName('Solo').parentElement!
    // On the description, far from the title: the overlay covers the whole card.
    const description = Array.from(card.querySelectorAll('p')).find(
      p => p.textContent === 'One card on its own',
    )!
    // Forced: the overlay is on top there, which is the claim, and a plain click waits for it to clear.
    await userEvent.click(description, { force: true })
    await vi.waitFor(() => expect(log()).toEqual(['Pressed:solo']))
    await userEvent.click(byName('Edit'))
    await vi.waitFor(() => expect(log()).toEqual(['Pressed:solo', 'Acted:solo']))
  } finally {
    handle.dispose()
  }
})

test('the dismiss button shows on hover and dismisses alone', async () => {
  const { handle, log } = mount()
  try {
    await vi.waitFor(() => expect(byName('Dismiss Solo')).toBeTruthy())
    const dismiss = byName('Dismiss Solo')
    // The header keeps its action clear of the button in the corner.
    expect(byName('Edit').getBoundingClientRect().right).toBeLessThanOrEqual(
      dismiss.getBoundingClientRect().left,
    )
    expect(getComputedStyle(dismiss).opacity).toBe('0')
    await userEvent.hover(byName('Solo'))
    await vi.waitFor(() => expect(getComputedStyle(dismiss).opacity).toBe('1'))
    await userEvent.click(dismiss)
    await vi.waitFor(() => expect(log()).toEqual(['Dismissed:solo']))
  } finally {
    handle.dispose()
  }
})

test('a chosen card in a group keeps a fill of its own', async () => {
  const { handle } = mount()
  try {
    await vi.waitFor(() => expect(byName('Card c')).toBeTruthy())
    const fill = (name: string) => getComputedStyle(byName(name).parentElement!).backgroundColor
    // A pointer an earlier test left over a card would hover it.
    await userEvent.hover(document.body, { position: { x: 600, y: 600 } })
    expect(fill('Card a')).toBe('rgba(0, 0, 0, 0)')
    expect(fill('Card c')).not.toBe('rgba(0, 0, 0, 0)')
  } finally {
    handle.dispose()
  }
})

test("a group's highlight lands on the card the pointer is over, and the card is pressed", async () => {
  const { handle, log } = mount()
  try {
    await vi.waitFor(() => expect(byName('Card b')).toBeTruthy())
    const list = document.querySelector('[aria-label="Choices"]')!
    const highlight = list.parentElement!.firstElementChild as HTMLElement
    const item = byName('Card b').closest('li')!
    await userEvent.hover(byName('Card b'))
    await vi.waitFor(() => {
      const placed = highlight.getBoundingClientRect()
      const target = item.getBoundingClientRect()
      expect(getComputedStyle(highlight).opacity).toBe('1')
      expect(Math.abs(placed.top - target.top)).toBeLessThan(1)
      expect(Math.abs(placed.height - target.height)).toBeLessThan(1)
    })
    await userEvent.click(byName('Card b'))
    await vi.waitFor(() => expect(log()).toEqual(['Pressed:b']))
  } finally {
    handle.dispose()
  }
})

test('media that is a bare icon sits in a tile, and anything else at its own size at the start', async () => {
  const { handle } = mount()
  try {
    await vi.waitFor(() => expect(document.getElementById('avatar')).not.toBeNull())
    const icon = document.getElementById('icon')!.parentElement!
    expect(icon.getBoundingClientRect().width).toBe(32)
    expect(getComputedStyle(icon).backgroundColor).not.toBe('rgba(0, 0, 0, 0)')
    const avatar = document.getElementById('avatar')!.parentElement!
    const card = avatar.parentElement!
    expect(avatar.getBoundingClientRect().width).toBe(56)
    expect(getComputedStyle(avatar).backgroundColor).toBe('rgba(0, 0, 0, 0)')
    expect(getComputedStyle(avatar).overflow).toBe('visible')
    // At the card's start, past its edge and padding, not centred across it.
    expect(avatar.getBoundingClientRect().left).toBe(
      card.getBoundingClientRect().left +
        card.clientLeft +
        Number.parseFloat(getComputedStyle(card).paddingLeft),
    )
  } finally {
    handle.dispose()
  }
})
