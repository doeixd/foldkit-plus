/**
 * A hover card on a real runtime, over `@foldkit/ui`'s HoverIntent: focus on
 * its trigger opens the card at once, raised as a popover is, and leaving
 * closes it. Anchored, the card draws in the top layer below its trigger,
 * outside the box that clips it, its arrow pointing at the trigger.
 */
import { Schema } from 'effect'
import { HoverIntent as UiHoverIntent } from '@foldkit/ui'
import { mapMessages } from 'foldkit/command'
import type { HtmlBuilder } from 'foldkit/html'
import * as Runtime from 'foldkit/runtime'
import { Layers, Style } from 'foldkit-mixins'
import { Theme } from 'foldkit-mixins/theme'
import { afterEach, expect, test, vi } from 'vitest'
import { userEvent } from 'vitest/browser'
// Not the index: a test loads only what it tests.
import * as HoverIntent from '../src/hoverIntent.js'
import { HoverIntentSlots } from '../src/hoverIntent.js'
import { HoverCard } from '../src/recipes/hoverCard.js'

const theme = Theme.standard(Theme.make({ accent: { hue: 265, chroma: 0.16 } }))
const style = Style.forSlots(HoverIntentSlots)(HoverCard({}))
const Model = Schema.Struct({ card: UiHoverIntent.Model })
type Model = typeof Model.Type
type Message = { readonly _tag: 'Got'; readonly message: UiHoverIntent.Message }

afterEach(() => {
  window.scrollTo(0, 0)
  document.head.querySelectorAll('style[data-test]').forEach(element => element.remove())
  document.body.replaceChildren()
})

const mount = () => {
  const sheet = document.createElement('style')
  sheet.dataset['test'] = ''
  sheet.textContent =
    Style.stylesheet(Layers.standard.declare, Layers.standard.in('theme', Theme.root(theme))) +
    style.css
  document.head.append(sheet)
  const container = document.createElement('div')
  container.id = 'hover-card'
  // An empty spot below the trigger, to move the pointer off it.
  const spot = document.createElement('div')
  spot.style.blockSize = '200px'
  document.body.append(container, spot)
  const view = (model: Model, h: HtmlBuilder<Message>) =>
    h.submodel({
      slotId: 'card',
      model: model.card,
      view: UiHoverIntent.view,
      viewInputs: {
        toView: HoverIntent.toView(
          [style.mixin],
          // Start-aligned, so the arrow at the trigger is not the card's middle.
          { h, anchored: { id: 'ada', anchor: { placement: 'bottom-start' } } },
          ({ trigger, panel, arrow, isVisible }) =>
            // Centred in a short clipping row, so a card standing in the flow
            // beside the trigger would push it aside (at the left edge it
            // would not), and one not in the top layer would be cut off.
            h.div(
              [
                h.Style({
                  display: 'flex',
                  justifyContent: 'center',
                  overflow: 'hidden',
                  contain: 'paint',
                }),
              ],
              [
                h.button([...trigger, h.Type('button')], ['@ada']),
                ...(isVisible
                  ? [h.div([...panel, h.AriaLabel('card')], [h.div(arrow, []), 'Ada Lovelace'])]
                  : []),
              ],
            ),
        ),
      },
      toParentMessage: (message: UiHoverIntent.Message): Message => ({ _tag: 'Got', message }),
    })
  return Runtime.embed(
    Runtime.makeElement({
      Model,
      container,
      init: () => ({ model: { card: UiHoverIntent.init() } }),
      update: (model: Model, message: Message) => {
        const next = UiHoverIntent.update(model.card, message.message)
        return {
          model: { card: next.model },
          commands: mapMessages(next.commands, (inner): Message => ({
            _tag: 'Got',
            message: inner,
          })),
        }
      },
      view,
    }),
  )
}

const away = () => document.body.lastElementChild!
const card = () => document.querySelector<HTMLElement>('[aria-label="card"]')

test('the open card shows below its trigger, outside the row that clips it, its arrow at the trigger', async () => {
  const handle = mount()
  try {
    const trigger = await vi.waitFor(() => {
      const found = document.getElementById(HoverIntent.triggerId('ada'))
      expect(found).not.toBeNull()
      return found!
    })
    await userEvent.hover(away())
    // A scrolled page: the anchor's coordinates are the document's, so the
    // card must be placed as the document's, not the viewport's.
    const above = document.createElement('div')
    above.style.blockSize = '300px'
    document.body.prepend(above)
    away().setAttribute('style', 'block-size: 2000px')
    window.scrollTo(0, 120)
    trigger.focus({ preventScroll: true })
    const open = await vi.waitFor(() => {
      expect(card()).not.toBeNull()
      expect(getComputedStyle(card()!).visibility).toBe('visible')
      return card()!
    })
    // It slides in 4px as it fades: measure where it comes to rest.
    await vi.waitFor(() => expect(open.getAnimations()).toEqual([]))
    const from = trigger.getBoundingClientRect()
    const box = open.getBoundingClientRect()
    expect(box.top - from.bottom).toBeCloseTo(8, 0)
    const row = trigger.parentElement!.getBoundingClientRect()
    expect(box.bottom).toBeGreaterThan(row.bottom + 4)
    expect(open.contains(document.elementFromPoint(box.left + 8, box.bottom - 4))).toBe(true)
    const arrow = open.firstElementChild!.getBoundingClientRect()
    expect(Math.abs(arrow.left + arrow.width / 2 - (from.left + from.width / 2))).toBeLessThan(1.5)
    expect(Math.abs(arrow.top + arrow.height / 2 - box.top)).toBeLessThan(1.5)
    // Nothing clips the half outside.
    expect(getComputedStyle(open).overflowY).toBe('visible')
  } finally {
    handle.dispose()
  }
})

test('the open card stands outside the flow: its trigger stays where it was', async () => {
  const handle = mount()
  try {
    const trigger = await vi.waitFor(() => {
      const found = document.querySelector<HTMLButtonElement>('button')
      expect(found).not.toBeNull()
      return found!
    })
    await userEvent.hover(away())
    const before = trigger.getBoundingClientRect()
    trigger.focus()
    const open = await vi.waitFor(() => {
      expect(card()).not.toBeNull()
      return card()!
    })
    expect(open.getBoundingClientRect().width).toBeGreaterThan(0)
    const after = trigger.getBoundingClientRect()
    expect([after.x, after.y]).toEqual([before.x, before.y])
  } finally {
    handle.dispose()
  }
})

test('focus on the trigger opens the card, raised, and blur closes it', async () => {
  const handle = mount()
  try {
    const trigger = await vi.waitFor(() => {
      const found = document.querySelector<HTMLButtonElement>('button')
      expect(found).not.toBeNull()
      return found!
    })
    // A pointer an earlier test file left over the trigger hovers it, and a
    // hovered trigger rightly keeps the card open through the blur.
    await userEvent.hover(away())
    trigger.focus()
    await vi.waitFor(() => expect(card()).not.toBeNull())
    expect(getComputedStyle(card()!).boxShadow).not.toBe('none')
    trigger.blur()
    await vi.waitFor(() => expect(card()).toBeNull())
  } finally {
    handle.dispose()
  }
})
