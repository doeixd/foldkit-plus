/**
 * A horizontal listbox in a real browser: right to left, ArrowLeft moves to
 * the next item and ArrowRight moves back.
 */
import { Option } from 'effect'
import type { HtmlBuilder } from 'foldkit/html'
import * as Runtime from 'foldkit/runtime'
import { Layers, Style } from 'foldkit-mixins'
import { Defaults } from 'foldkit-mixins/defaults'
import { Theme } from 'foldkit-mixins/theme'
import { afterEach, expect, test, vi } from 'vitest'
import { userEvent } from 'vitest/browser'
import { Listbox, ListboxSlots, ListboxView, Recipes } from '../src/index.js'
import * as UpstreamListbox from '@foldkit/ui/listbox'

const theme = Theme.compose(Theme.tokens, Theme.oklch({ accent: { h: 265, c: 0.16, l: '52%' } }))
const style = Style.forSlots(ListboxSlots)(Recipes.Listbox({}))
const Frequencies = ListboxView.create<string>()
const Model = UpstreamListbox.Model
type Model = typeof Model.Type
type Message = UpstreamListbox.Message

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
  container.id = 'listbox-rtl-browser'
  document.body.appendChild(container)
  const view = (model: Model, h: HtmlBuilder<Message>) =>
    h.div(
      [h.Dir('rtl')],
      [
        Frequencies.view(
          model,
          {
            anchor: { placement: 'bottom-start', gap: 4, padding: 8, portal: false },
            items: ['Hourly', 'Daily', 'Overnight'],
            maybeSelectedValue: Option.none(),
            itemToConfig: (frequency: string) => ({ content: h.span([], [frequency]) }),
            buttonContent: h.span([], ['Frequency']),
            toView: Listbox.toView([style.mixin], { h }),
            direction: 'rtl',
          },
          h,
        ),
      ],
    )
  return Runtime.embed(
    Runtime.makeElement({
      Model,
      container,
      init: () => ({
        model: {
          ...UpstreamListbox.init({ id: 'ladder', orientation: 'Horizontal' as const }),
        },
      }),
      update: (model: Model, message: Message) => {
        const next = Frequencies.update(model, message)
        return {
          model: next.model,
          commands: next.commands === undefined ? [] : next.commands,
        }
      },
      view,
    }),
  )
}

test('right to left, ArrowLeft moves to the next item and ArrowRight moves back', async () => {
  const handle = mount()
  try {
    await vi.waitFor(() => expect(document.querySelector('button[aria-haspopup]')).not.toBeNull())
    document.querySelector<HTMLElement>('button[aria-haspopup]')!.focus()
    await userEvent.keyboard('{Enter}')
    await vi.waitFor(() =>
      expect(
        document.querySelector('[role="listbox"]')?.getAttribute('aria-activedescendant'),
      ).toBe('ladder-item-0'),
    )
    await userEvent.keyboard('{ArrowLeft}')
    await vi.waitFor(() =>
      expect(
        document.querySelector('[role="listbox"]')?.getAttribute('aria-activedescendant'),
      ).toBe('ladder-item-1'),
    )
    await userEvent.keyboard('{ArrowRight}')
    await vi.waitFor(() =>
      expect(
        document.querySelector('[role="listbox"]')?.getAttribute('aria-activedescendant'),
      ).toBe('ladder-item-0'),
    )
  } finally {
    handle.dispose()
  }
})
