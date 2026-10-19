/**
 * The popups' top-layer panels on a page read right to left: Menu, Listbox
 * and Combobox each open under their trigger, start edge to start edge,
 * with `dir` on the document itself. The top layer's containing block is the
 * viewport, which takes the document's direction, so a `dir` on a wrapper
 * does not show where a panel lands.
 */
import * as UpstreamCombobox from '@foldkit/ui/combobox'
import * as UpstreamListbox from '@foldkit/ui/listbox'
import { Option, Schema } from 'effect'
import type { Html, HtmlBuilder } from 'foldkit/html'
import * as Runtime from 'foldkit/runtime'
import { Layers, Style } from 'foldkit-mixins'
import { Defaults } from 'foldkit-mixins/defaults'
import { Theme } from 'foldkit-mixins/theme'
import { afterEach, expect, test, vi } from 'vitest'
import {
  Combobox,
  ComboboxSlots,
  ComboboxView,
  Listbox,
  ListboxSlots,
  ListboxView,
  Menu,
  MenuSlots,
  Recipes,
} from '../src/index.js'

const theme = Theme.standard(Theme.make({ accent: { hue: 265, chroma: 0.16 } }))
const menuStyle = Style.forSlots(MenuSlots)(Recipes.Menu({}))
const listboxStyle = Style.forSlots(ListboxSlots)(Recipes.Listbox({}))
const comboboxStyle = Style.forSlots(ComboboxSlots)(Recipes.Combobox({}))
const anchor = { placement: 'bottom-start', gap: 4, padding: 8, portal: false } as const

afterEach(() => {
  document.documentElement.removeAttribute('dir')
  document.head.querySelectorAll('style[data-test]').forEach(element => element.remove())
  document.body.replaceChildren()
})

/** The page, right to left, and a container in it whose content is centred, far from either edge. */
const stage = (id: string): HTMLElement => {
  document.documentElement.dir = 'rtl'
  const sheet = document.createElement('style')
  sheet.dataset['test'] = ''
  sheet.textContent =
    Style.stylesheet(
      Layers.standard.declare,
      Layers.standard.in('reset', Defaults.reset),
      Layers.standard.in('theme', Theme.root(theme)),
    ) +
    menuStyle.css +
    listboxStyle.css +
    comboboxStyle.css
  document.head.append(sheet)
  const container = document.createElement('div')
  container.id = id
  document.body.appendChild(container)
  return container
}

const centred = <Message>(h: HtmlBuilder<Message>, content: Html): Html =>
  h.div([h.Style({ display: 'flex', justifyContent: 'center', paddingBlock: '40px' })], [content])

/** The trigger's and the open panel's boxes, once the anchor has placed the panel. */
const placed = (triggerId: string, panelId: string) =>
  vi.waitFor(() => {
    const panel = document.getElementById(panelId)
    expect(panel).not.toBeNull()
    expect(getComputedStyle(panel!).visibility).toBe('visible')
    const trigger = document.getElementById(triggerId)!.getBoundingClientRect()
    return { trigger, panel: panel!.getBoundingClientRect() }
  })

/** Right to left, the start edge is the right one: the panel's meets its trigger's. */
const expectUnderTrigger = ({ trigger, panel }: { trigger: DOMRect; panel: DOMRect }) => {
  expect(Math.abs(panel.right - trigger.right)).toBeLessThan(2)
  expect(panel.top).toBeGreaterThanOrEqual(trigger.bottom)
  expect(panel.top - trigger.bottom).toBeLessThan(16)
}

test('a Menu opens under its trigger right to left', async () => {
  const rows: ReadonlyArray<Menu.Row> = [{ label: 'New tab' }, { label: 'Print' }]
  const initial = Menu.init('file', rows)
  const handle = Runtime.embed(
    Runtime.makeElement({
      Model: Menu.Model,
      container: stage('menu-rtl'),
      init: () => ({ model: { ...initial, menu: { ...initial.menu, isOpen: true } } }),
      update: (model: Menu.Model) => ({ model }),
      view: (model: Menu.Model, h: HtmlBuilder<Menu.Message>) =>
        centred(
          h,
          Menu.view(
            {
              model,
              rows,
              buttonContent: h.span([], ['File']),
              onMessage: message => message,
              direction: 'rtl',
              mixins: [menuStyle.mixin],
            },
            h,
          ),
        ),
    }),
  )
  try {
    expectUnderTrigger(await placed('file-button', 'file-items'))
  } finally {
    handle.dispose()
  }
})

test('a Listbox opens under its trigger right to left', async () => {
  const Frequencies = ListboxView.create<string>()
  const handle = Runtime.embed(
    Runtime.makeElement({
      Model: UpstreamListbox.Model,
      container: stage('listbox-rtl'),
      init: () => ({ model: { ...UpstreamListbox.init({ id: 'frequency' }), isOpen: true } }),
      update: (model: UpstreamListbox.Model) => ({ model }),
      view: (model: UpstreamListbox.Model, h: HtmlBuilder<UpstreamListbox.Message>) =>
        centred(
          h,
          Frequencies.view(
            model,
            {
              anchor,
              items: ['Hourly', 'Daily'],
              maybeSelectedValue: Option.none(),
              itemToConfig: (frequency: string) => ({ content: h.span([], [frequency]) }),
              buttonContent: h.span([], ['Frequency']),
              toView: Listbox.toView([listboxStyle.mixin], { h }),
            },
            h,
          ),
        ),
    }),
  )
  try {
    expectUnderTrigger(await placed('frequency-button', 'frequency-items'))
  } finally {
    handle.dispose()
  }
})

test('a Combobox opens under its field right to left', async () => {
  const Fruits = ComboboxView.create<string>()
  const Model = Schema.Struct({ combobox: UpstreamCombobox.Model })
  type Model = typeof Model.Type
  const handle = Runtime.embed(
    Runtime.makeElement({
      Model,
      container: stage('combobox-rtl'),
      init: () => ({
        model: { combobox: { ...UpstreamCombobox.init({ id: 'fruit' }), isOpen: true } },
      }),
      update: (model: Model) => ({ model }),
      view: (model: Model, h: HtmlBuilder<UpstreamCombobox.Message>) =>
        centred(
          h,
          Fruits.view(
            model.combobox,
            {
              anchor,
              items: ['Apple', 'Banana'],
              restingInputValue: '',
              itemToConfig: (fruit: string) => ({ content: h.span([], [fruit]) }),
              itemToValue: (fruit: string) => fruit,
              itemToDisplayText: (fruit: string) => fruit,
              buttonContent: h.span([], ['v']),
              maybeSelectedValue: Option.none(),
              toView: Combobox.toView([comboboxStyle.mixin], { h }),
            },
            h,
          ),
        ),
    }),
  )
  try {
    expectUnderTrigger(await placed('fruit-input-wrapper', 'fruit-items'))
  } finally {
    handle.dispose()
  }
})
