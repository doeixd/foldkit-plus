/**
 * A Listbox whose panel matches its trigger (`width: 'trigger'`) keeps that
 * width against a base rule of the application's for the same panel: the
 * selection is a variant, and a variant beats every base.
 */
import * as UpstreamListbox from '@foldkit/ui/listbox'
import { Option } from 'effect'
import type { HtmlBuilder } from 'foldkit/html'
import * as Runtime from 'foldkit/runtime'
import { Layers, Style } from 'foldkit-mixins'
import { Defaults } from 'foldkit-mixins/defaults'
import { Theme } from 'foldkit-mixins/theme'
import { afterEach, expect, test, vi } from 'vitest'
import { Listbox, ListboxSlots, ListboxView, Recipes } from '../src/index.js'

const theme = Theme.standard(Theme.make({ accent: { hue: 265, chroma: 0.16 } }))
const style = Style.forSlots(ListboxSlots)(Recipes.Listbox({ width: 'trigger' }))
// Another base for the panel, later in the sheet: in the same layer as the
// recipe's bases, it would win over a selection placed there too.
const base = Style.forSlots(ListboxSlots)({
  items: Layers.standard.in('components', Style.self({ minInlineSize: '0' })),
  // Far wider than the rows, so a panel sized to them falls short.
  button: Style.inline({ inlineSize: '30rem' }),
})
const Frequencies = ListboxView.create<string>()

afterEach(() => {
  document.head.querySelectorAll('style[data-test]').forEach(element => element.remove())
  document.body.replaceChildren()
})

test("a panel set to its trigger's width keeps it against a later base rule", async () => {
  const sheet = document.createElement('style')
  sheet.dataset['test'] = ''
  sheet.textContent =
    Style.stylesheet(
      Layers.standard.declare,
      Layers.standard.in('reset', Defaults.reset),
      Layers.standard.in('theme', Theme.root(theme)),
    ) +
    style.css +
    base.css
  document.head.append(sheet)
  const container = document.createElement('div')
  container.id = 'popup-width'
  document.body.appendChild(container)
  const handle = Runtime.embed(
    Runtime.makeElement({
      Model: UpstreamListbox.Model,
      container,
      init: () => ({ model: { ...UpstreamListbox.init({ id: 'frequency' }), isOpen: true } }),
      update: (model: UpstreamListbox.Model) => ({ model }),
      view: (model: UpstreamListbox.Model, h: HtmlBuilder<UpstreamListbox.Message>) =>
        Frequencies.view(
          model,
          {
            anchor: { placement: 'bottom-start', gap: 4, padding: 8, portal: false },
            items: ['Hourly', 'Daily'],
            maybeSelectedValue: Option.none(),
            itemToConfig: (frequency: string) => ({ content: h.span([], [frequency]) }),
            buttonContent: h.span([], ['Frequency']),
            toView: Listbox.toView([style.mixin, base.mixin], { h }),
          },
          h,
        ),
    }),
  )
  try {
    await vi.waitFor(() => {
      const panel = document.getElementById('frequency-items')
      expect(panel?.style.getPropertyValue('--button-width')).not.toBe('')
      const trigger = document.getElementById('frequency-button')!.getBoundingClientRect()
      expect(panel!.getBoundingClientRect().width).toBeGreaterThanOrEqual(trigger.width - 1)
    })
  } finally {
    handle.dispose()
  }
})
