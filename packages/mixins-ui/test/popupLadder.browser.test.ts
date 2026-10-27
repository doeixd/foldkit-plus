/**
 * A real Listbox on the size ladder, opened: a chosen size reaches the rows
 * whether upstream portals the panel out of the page or not, and a region
 * set compact reaches a panel kept in place (`portal: false`).
 */
import { Option, Schema } from 'effect'
import { Listbox as UiListbox } from '@foldkit/ui'
import type { HtmlBuilder } from 'foldkit/html'
import * as Runtime from 'foldkit/runtime'
import { Layers, Style } from 'foldkit-mixins'
import { Defaults } from 'foldkit-mixins/defaults'
import { Theme } from 'foldkit-mixins/theme'
import { afterEach, expect, test, vi } from 'vitest'
import { userEvent } from 'vitest/browser'
import { Listbox, ListboxSlots, ListboxView, Recipes } from '../src/index.js'
import { unitKnobs } from './fixture.js'

// At unit knobs: what is measured here is the scale's nominal size or time.
const theme = Theme.standard(Theme.make({ ...unitKnobs, accent: { hue: 265, chroma: 0.16 } }))
const Model = Schema.Struct({ listbox: UiListbox.Model })
type Model = typeof Model.Type
const Frequencies = ListboxView.create<string>()

afterEach(() => {
  document.head.querySelectorAll('style[data-test]').forEach(element => element.remove())
  document.querySelectorAll('#foldkit-portal-root').forEach(element => element.remove())
  document.body.replaceChildren()
})

const mount = (options: { size?: 'sm'; portal: boolean; region?: boolean }) => {
  const style = Style.forSlots(ListboxSlots)(
    Recipes.Listbox(options.size === undefined ? {} : { size: options.size }),
  )
  const sheet = document.createElement('style')
  sheet.dataset['test'] = ''
  sheet.textContent =
    Style.stylesheet(
      Layers.standard.declare,
      Layers.standard.in('reset', Defaults.reset),
      Layers.standard.in('theme', Theme.root(theme)),
    ) +
    style.css +
    '[data-region="compact"]{--fk-knob-step:1}'
  document.head.append(sheet)
  const region = document.createElement('div')
  // The page the runtime draws into: `embed` replaces its own container.
  region.id = 'popup-page'
  if (options.region === true) region.dataset['region'] = 'compact'
  const container = document.createElement('div')
  container.id = 'popup-ladder'
  region.appendChild(container)
  document.body.appendChild(region)
  const view = (model: Model, h: HtmlBuilder<UiListbox.Message>) =>
    Frequencies.view(
      model.listbox,
      {
        anchor: { placement: 'bottom-start', gap: 4, padding: 8, portal: options.portal },
        items: ['Hourly', 'Daily'],
        maybeSelectedValue: Option.none(),
        itemToConfig: (frequency: string) => ({ content: h.span([], [frequency]) }),
        buttonContent: h.span([], ['Frequency']),
        toView: Listbox.toView([style.mixin], { h }),
      },
      h,
    )
  return Runtime.embed(
    Runtime.makeElement({
      Model,
      container,
      init: () => ({ model: { listbox: UiListbox.init({ id: 'ladder' }) } }),
      update: (model: Model, message: UiListbox.Message) => {
        const next = Frequencies.update(model.listbox, message)
        return {
          model: { listbox: next.model },
          ...(next.commands === undefined ? {} : { commands: next.commands }),
        }
      },
      view,
    }),
  )
}

const heights = async () => {
  const button = await vi.waitFor(() => {
    const found = document.querySelector<HTMLElement>('button[aria-haspopup]')
    expect(found).not.toBeNull()
    return found!
  })
  await userEvent.click(button)
  const row = await vi.waitFor(() => {
    const found = document.querySelector<HTMLElement>('[role="option"]')
    expect(found?.getBoundingClientRect().height).toBeGreaterThan(0)
    return found!
  })
  return [button.getBoundingClientRect().height, row.getBoundingClientRect().height]
}

test.each([true, false])('a chosen compact size reaches the rows, portaled %s', async portal => {
  const handle = mount({ size: 'sm', portal })
  try {
    expect(await heights()).toEqual([28, 28])
    // The case is only worth having where the panel really left the page.
    const inPlace = document
      .getElementById('popup-page')!
      .contains(document.querySelector('[role="option"]'))
    expect(inPlace).toBe(!portal)
  } finally {
    handle.dispose()
  }
})

test('a region set compact reaches a panel kept in place', async () => {
  const handle = mount({ portal: false, region: true })
  try {
    expect(await heights()).toEqual([28, 28])
  } finally {
    handle.dispose()
  }
})
