/**
 * A hover card on a real runtime, over `@foldkit/ui`'s HoverIntent: focus on
 * its trigger opens the card at once, raised as a popover is, and leaving
 * closes it.
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
import { HoverIntent, HoverIntentSlots, Recipes } from '../src/index.js'

const theme = Theme.compose(Theme.tokens, Theme.oklch({ accent: { h: 265, c: 0.16, l: '52%' } }))
const style = Style.forSlots(HoverIntentSlots)(Recipes.HoverCard({}))
const Model = Schema.Struct({ card: UiHoverIntent.Model })
type Model = typeof Model.Type
type Message = { readonly _tag: 'Got'; readonly message: UiHoverIntent.Message }

afterEach(() => {
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
        toView: HoverIntent.toView([style.mixin], { h }, ({ trigger, panel, isVisible }) =>
          h.div(
            [],
            [
              h.button([...trigger, h.Type('button')], ['@ada']),
              ...(isVisible ? [h.div([...panel, h.AriaLabel('card')], ['Ada Lovelace'])] : []),
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
    expect(getComputedStyle(open).position).toBe('absolute')
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
