/**
 * `Conformance.listbox` against the shipped Listbox and against a listbox
 * assembled from primitives, vertical and, right to left, horizontal.
 */
import { Option, Schema } from 'effect'
import type { HtmlBuilder } from 'foldkit/html'
import * as Runtime from 'foldkit/runtime'
import { Layers, Style } from 'foldkit-mixins'
import { Defaults } from 'foldkit-mixins/defaults'
import { Conformance } from 'foldkit-mixins/testing'
import { Theme } from 'foldkit-mixins/theme'
import { afterEach, expect, test, vi } from 'vitest'
import { Listbox, ListboxSlots, ListboxView, Recipes } from '../../src/index.js'
import * as UpstreamListbox from '@foldkit/ui/listbox'
import { harness } from './harness.js'
import * as HandBuilt from './listbox.handBuilt.js'

const theme = Theme.standard(Theme.make({ accent: { hue: 265, chroma: 0.16 } }))
const style = Style.forSlots(ListboxSlots)(Recipes.Listbox({}))
const Frequencies = ListboxView.create<string>()
const Model = Schema.Struct({
  listbox: UpstreamListbox.Model,
  chosen: Schema.Option(Schema.String),
})
type Model = typeof Model.Type
type Message = UpstreamListbox.Message

const OPTIONS = ['Hourly', 'Daily', 'Overnight', 'Weekly']

afterEach(() => {
  document.head.querySelectorAll('style[data-test]').forEach(element => element.remove())
  document.body.replaceChildren()
})

const mountShipped = (orientation: 'Vertical' | 'Horizontal', direction: 'ltr' | 'rtl') => {
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
  container.id = 'conformance-listbox'
  document.body.appendChild(container)
  return Runtime.embed(
    Runtime.makeElement({
      Model,
      container,
      init: () => ({
        model: {
          listbox: UpstreamListbox.init({ id: 'frequency', orientation, isAnimated: false }),
          chosen: Option.none(),
        },
      }),
      update: (model: Model, message: Message) => {
        const next = Frequencies.update(model.listbox, message)
        return {
          model: {
            listbox: next.model,
            chosen:
              next.outMessage === undefined ? model.chosen : Option.some(next.outMessage.value),
          },
          commands: next.commands === undefined ? [] : next.commands,
        }
      },
      view: (model: Model, h: HtmlBuilder<Message>) =>
        Frequencies.view(
          model.listbox,
          {
            anchor: { placement: 'bottom-start', gap: 4, padding: 8, portal: false },
            items: OPTIONS,
            maybeSelectedValue: model.chosen,
            isItemDisabled: item => item === 'Daily',
            itemToConfig: (frequency: string) => ({ content: h.span([], [frequency]) }),
            buttonContent: h.span([], ['Frequency']),
            toView: Listbox.toView([style.mixin], { h }),
            direction,
          },
          h,
        ),
    }),
  )
}

const openShipped = async () => {
  const button = await vi.waitFor(() => {
    const found = document.getElementById('frequency-button')
    expect(found).not.toBeNull()
    return found!
  })
  button.focus()
  await harness.press('{Enter}')
  await vi.waitFor(() => expect(document.querySelector('[role="listbox"]')).not.toBeNull())
}

test.each([
  ['Vertical', 'ltr'],
  ['Horizontal', 'ltr'],
  ['Horizontal', 'rtl'],
] as const)('the shipped Listbox conforms (%s, %s)', async (orientation, direction) => {
  const handle = mountShipped(orientation, direction)
  try {
    const result = await Conformance.listbox(harness, {
      name: 'Frequency',
      options: OPTIONS,
      disabled: 'Daily',
      orientation: orientation === 'Vertical' ? 'vertical' : 'horizontal',
      direction,
      enter: openShipped,
    })
    expect(Conformance.failures(result)).toEqual([])
    expect(result.length).toBeGreaterThan(8)
  } finally {
    handle.dispose()
  }
})

const FRUITS = [
  { id: 'hourly', label: 'Hourly' },
  { id: 'daily', label: 'Daily', disabled: true },
  { id: 'overnight', label: 'Overnight' },
  { id: 'weekly', label: 'Weekly' },
]

test.each([
  ['vertical', 'ltr'],
  ['horizontal', 'ltr'],
  ['horizontal', 'rtl'],
] as const)(
  'a listbox assembled from primitives conforms (%s, %s)',
  async (orientation, direction) => {
    const handle = HandBuilt.mount(FRUITS, orientation, direction)
    try {
      const result = await Conformance.listbox(harness, {
        name: 'Frequency',
        options: FRUITS.map(option => option.label),
        disabled: 'Daily',
        orientation,
        direction,
        enter: async () => {
          await vi.waitFor(() => expect(document.querySelector('[role="option"]')).not.toBeNull())
          document.querySelector<HTMLElement>('[role="option"]:not([aria-disabled])')!.focus()
        },
      })
      expect(Conformance.failures(result)).toEqual([])
      expect(result.length).toBeGreaterThan(8)
    } finally {
      handle.dispose()
    }
  },
)
