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
  document.body.appendChild(container)
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

const card = () => document.querySelector<HTMLElement>('[aria-label="card"]')

test('focus on the trigger opens the card, raised, and blur closes it', async () => {
  const handle = mount()
  try {
    const trigger = await vi.waitFor(() => {
      const found = document.querySelector<HTMLButtonElement>('button')
      expect(found).not.toBeNull()
      return found!
    })
    trigger.focus()
    await vi.waitFor(() => expect(card()).not.toBeNull())
    expect(getComputedStyle(card()!).boxShadow).not.toBe('none')
    trigger.blur()
    await vi.waitFor(() => expect(card()).toBeNull())
  } finally {
    handle.dispose()
  }
})
