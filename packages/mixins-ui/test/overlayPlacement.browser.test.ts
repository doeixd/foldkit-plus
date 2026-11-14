/**
 * Anchored popups on a real page: a panel portaled out of a themed region
 * still reads that region's tokens, and under `dir="rtl"` a popup placed at
 * `bottom-start` lines up with the trigger's right edge.
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
import { Listbox, ListboxSlots, ListboxView, Menu, MenuSlots, Recipes } from '../src/index.js'
import { unitKnobs } from './fixture.js'

const theme = Theme.standard(Theme.make({ ...unitKnobs, accent: { hue: 265, chroma: 0.16 } }))
const Model = Schema.Struct({ listbox: UiListbox.Model })
type Model = typeof Model.Type
const Frequencies = ListboxView.create<string>()

afterEach(() => {
  document.head.querySelectorAll('style[data-test]').forEach(element => element.remove())
  document.querySelectorAll('#foldkit-portal-root').forEach(element => element.remove())
  document.body.replaceChildren()
})

interface Setup {
  /** Unset, the application passes none and the widget's default stands. */
  readonly portal?: boolean
  /** A region that sets the step knob compact around the page the runtime draws. */
  readonly compact?: boolean
  readonly direction?: 'rtl'
}

const mount = ({ portal, compact = false, direction }: Setup) => {
  const style = Style.forSlots(ListboxSlots)(Recipes.Listbox({}))
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
  region.id = 'overlay-page'
  region.style.cssText = 'padding: 120px 300px'
  if (compact) region.dataset['region'] = 'compact'
  const container = document.createElement('div')
  container.id = 'overlay-placement'
  region.appendChild(container)
  document.body.appendChild(region)
  const view = (model: Model, h: HtmlBuilder<UiListbox.Message>) =>
    Frequencies.view(
      model.listbox,
      {
        anchor: {
          placement: 'bottom-start',
          gap: 4,
          padding: 8,
          ...(portal === undefined ? {} : { portal }),
        },
        items: ['Hourly', 'A much longer frequency name'],
        maybeSelectedValue: Option.none(),
        itemToConfig: (frequency: string) => ({ content: h.span([], [frequency]) }),
        buttonContent: h.span([], ['Every']),
        toView: Listbox.toView([style.mixin], { h }),
        ...(direction === undefined ? {} : { direction }),
      },
      h,
    )
  return Runtime.embed(
    Runtime.makeElement({
      Model,
      container,
      slow: false,
      init: () => ({ model: { listbox: UiListbox.init({ id: 'placement' }) } }),
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

/** Opens the listbox and reads the trigger's and the first row's boxes once the panel is placed. */
const opened = async (panelSelector = '[role="listbox"]') => {
  const button = await vi.waitFor(() => {
    const found = document.querySelector<HTMLElement>('button[aria-haspopup]')
    expect(found).not.toBeNull()
    return found!
  })
  await userEvent.click(button)
  const panel = await vi.waitFor(() => {
    const found = document.querySelector<HTMLElement>(panelSelector)
    expect(found?.getBoundingClientRect().height).toBeGreaterThan(0)
    expect(getComputedStyle(found!).visibility).toBe('visible')
    return found!
  })
  const row = document.querySelector<HTMLElement>('[role="option"], [role="menuitem"]')
  if (row === null) throw new Error('the open popup drew no rows')
  return { button: button.getBoundingClientRect(), panel: panel.getBoundingClientRect(), row }
}

const regionReachesRows = async (portal: boolean | undefined, rowHeight: number) => {
  const handle = mount({ ...(portal === undefined ? {} : { portal }), compact: true })
  try {
    const { row } = await opened()
    const inPlace = document
      .getElementById('overlay-page')!
      .contains(document.querySelector('[role="option"]'))
    expect(inPlace).toBe(portal !== true)
    expect(row.getBoundingClientRect().height).toBe(rowHeight)
  } finally {
    handle.dispose()
  }
}

test('a region set compact reaches the rows of a panel the application gave no portal option', () =>
  regionReachesRows(undefined, 28))

test('a region set compact reaches the rows of a panel kept in place', () =>
  regionReachesRows(false, 28))

// A cascade fact, not a defect: a panel the application asks to portal leaves
// the region, so a knob set on the region does not reach it: the root's step (36px rows).
test('a panel the application portals reads the root knobs, not those of its region', () =>
  regionReachesRows(true, 36))

const mirrorsUnderRtl = async (portal: boolean) => {
  const handle = mount({ portal, direction: 'rtl' })
  try {
    const { button, panel } = await opened()
    expect(panel.width).toBeGreaterThan(button.width + 20)
    expect(Math.abs(panel.right - button.right)).toBeLessThan(2)
    expect(Math.abs(panel.left - button.left)).toBeGreaterThan(20)
  } finally {
    handle.dispose()
  }
}

test("under direction rtl on a page with no dir, a bottom-start popup lines up with the trigger's right edge", () =>
  mirrorsUnderRtl(false))

// `direction` writes `dir` on the panel as well as the wrapper: a portaled
// panel is no longer inside the wrapper.
test("under direction rtl a portaled bottom-start popup lines up with the trigger's right edge", () =>
  mirrorsUnderRtl(true))

test.each([true, false])(
  "under left to right a bottom-start popup lines up with the trigger's left edge, portaled %s",
  async portal => {
    const handle = mount({ portal })
    try {
      const { button, panel } = await opened()
      expect(Math.abs(panel.left - button.left)).toBeLessThan(2)
      expect(Math.abs(panel.right - button.right)).toBeGreaterThan(20)
    } finally {
      handle.dispose()
    }
  },
)

// The Menu draws its panel in place, inside the wrapper that carries `dir`:
// no gap for a portaled panel to fall through, but the placement is pinned.
test("under direction rtl a Menu's bottom-start panel lines up with the trigger's right edge", async () => {
  const MenuModel = Schema.Struct({ menu: Menu.Model })
  const rows: ReadonlyArray<Menu.Row> = [{ label: 'Rename' }, { label: 'A much longer menu row' }]
  const style = Style.forSlots(MenuSlots)(Recipes.Menu({}))
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
  container.id = 'overlay-menu'
  const region = document.createElement('div')
  region.style.cssText = 'padding: 120px 300px'
  region.appendChild(container)
  document.body.appendChild(region)
  const handle = Runtime.embed(
    Runtime.makeElement({
      Model: MenuModel,
      container,
      slow: false,
      init: () => ({ model: { menu: Menu.init('menu', rows) } }),
      update: (model: typeof MenuModel.Type, message: Menu.Message) => {
        const next = Menu.update(model.menu, message)
        return {
          model: { menu: next.model },
          ...(next.commands === undefined ? {} : { commands: next.commands }),
        }
      },
      view: (model: typeof MenuModel.Type, h: HtmlBuilder<Menu.Message>) =>
        Menu.view(
          {
            model: model.menu,
            rows,
            buttonContent: h.span([], ['Actions']),
            onMessage: message => message,
            direction: 'rtl',
            mixins: [style.mixin],
          },
          h,
        ),
    }),
  )
  try {
    const { button, panel } = await opened('[role="menu"]')
    expect(panel.width).toBeGreaterThan(button.width + 20)
    expect(Math.abs(panel.right - button.right)).toBeLessThan(2)
  } finally {
    handle.dispose()
  }
})
