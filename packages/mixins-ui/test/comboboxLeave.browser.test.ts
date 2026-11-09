/**
 * A Combobox's panel leaving keeps its fade on a loaded page, where a render
 * frame is put off behind its queue (#400), as Menu's and Listbox's do.
 */
import * as UpstreamCombobox from '@foldkit/ui/combobox'
import { Option, Schema } from 'effect'
import type { HtmlBuilder } from 'foldkit/html'
import * as Runtime from 'foldkit/runtime'
import { Layers, Style } from 'foldkit-mixins'
import { Defaults } from 'foldkit-mixins/defaults'
import { Theme } from 'foldkit-mixins/theme'
import { afterEach, expect, test, vi } from 'vitest'
import { userEvent } from 'vitest/browser'
import { Combobox, ComboboxSlots, ComboboxView, Recipes } from '../src/index.js'
import { renderBehindTheQueue } from './frames.js'
import { marksThrough } from './observe.js'

const theme = Theme.standard(Theme.make({ accent: { hue: 265, chroma: 0.16 } }))
const style = Style.forSlots(ComboboxSlots)(Recipes.Combobox({}))
const Fruits = ComboboxView.create<string>()
const Model = Schema.Struct({ combobox: UpstreamCombobox.Model })
type Model = typeof Model.Type
type Message = UpstreamCombobox.Message

afterEach(() => {
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
  container.id = 'combobox-leave'
  document.body.appendChild(container)
  return Runtime.embed(
    Runtime.makeElement({
      Model,
      container,
      init: () => ({
        model: { combobox: UpstreamCombobox.init({ id: 'fruit', isAnimated: true }) },
      }),
      update: (model: Model, message: Message) => {
        const next = Fruits.update(model.combobox, message)
        return { model: { combobox: next.model }, commands: next.commands ?? [] }
      },
      view: (model: Model, h: HtmlBuilder<Message>) =>
        Fruits.view(
          model.combobox,
          {
            anchor: { placement: 'bottom-start', gap: 4, padding: 8, portal: false },
            items: ['Apple', 'Banana'],
            restingInputValue: '',
            itemToConfig: (fruit: string) => ({ content: h.span([], [fruit]) }),
            itemToValue: (fruit: string) => fruit,
            itemToDisplayText: (fruit: string) => fruit,
            buttonContent: h.span([], ['v']),
            maybeSelectedValue: Option.none(),
            toView: Combobox.toView([style.mixin], { h }),
          },
          h,
        ),
    }),
  )
}

test("a combobox's panel leaving draws its fade though a render frame is put off (#400)", async () => {
  const handle = mount()
  try {
    const input = await vi.waitFor(() => {
      const found = document.getElementById('fruit-input')
      expect(found).not.toBeNull()
      return found!
    })
    input.focus()
    await userEvent.keyboard('{ArrowDown}')
    const panel = await vi.waitFor(() => {
      const found = document.getElementById('fruit-items')
      expect(found).not.toBeNull()
      expect(found!.hasAttribute('data-closed')).toBe(false)
      return found!
    })
    const restore = renderBehindTheQueue('fruit-items')
    try {
      const states = await marksThrough(
        panel,
        ['closed', 'leave'],
        () => userEvent.keyboard('{Escape}'),
        () => vi.waitFor(() => expect(document.getElementById('fruit-items')).toBeNull()),
      )
      expect(states).toContain('closed leave')
    } finally {
      restore()
    }
  } finally {
    handle.dispose()
  }
})
