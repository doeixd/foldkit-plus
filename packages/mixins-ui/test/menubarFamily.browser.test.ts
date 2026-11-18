/**
 * A Menubar placed as an application places it (`Bundles.Menubar` as a child
 * that reports `Selected` with the menu's index), with a menu's header and
 * footer, an anchor for every menu, and `configure`.
 */
import { Schema } from 'effect'
import { Bundle } from 'foldkit-bundle'
import * as Runtime from 'foldkit/runtime'
import { Layers, Style } from 'foldkit-mixins'
import { Theme } from 'foldkit-mixins/theme'
import { afterEach, expect, test, vi } from 'vitest'
import { userEvent } from 'vitest/browser'
import { Bundles, Menubar, MenubarSlots, MenuSlots, Recipes } from '../src/index.js'

afterEach(() => {
  document.head.querySelectorAll('style[data-test]').forEach(element => element.remove())
  document.body.replaceChildren()
})

const App = Bundle.compose({ last: Schema.String }).pipe(
  Bundle.withChild('bar', Bundles.Menubar, {
    args: { ids: ['file', 'edit'], isAnimated: true },
    onOut: out => model => ({ model: { ...model, last: `${out.menu}:${out.value}` } }),
  }),
)

const bar = Style.forSlots(MenubarSlots)(Recipes.Menubar({}))
const menus = Style.forSlots(MenuSlots)(Recipes.MenubarMenu({}))
const Configured = Menubar.configure({
  base: { style: bar, menuMixins: [menus.mixin] },
  presets: { low: { anchor: { gap: 30 } } },
})

const mount = (more: { readonly configured?: boolean; readonly anchor?: boolean } = {}) => {
  const sheet = document.createElement('style')
  sheet.dataset['test'] = ''
  sheet.textContent =
    Style.stylesheet(
      Layers.standard.declare,
      Layers.standard.in('theme', Theme.root(Theme.standard(Theme.make({})))),
    ) +
    bar.css +
    menus.css
  document.head.append(sheet)
  const container = document.createElement('div')
  container.id = 'menubar-family'
  document.body.append(container)
  return Runtime.embed(
    Runtime.makeElement({
      ...App.placements.runtime({ Model: App.Model, initial: { last: '' } }),
      container,
      view: (model, h) =>
        h.div(
          [],
          [
            h.p([h.Id('last')], [model.last]),
            (more.configured === true ? Configured.view : Menubar.view)(
              {
                label: 'Application',
                model: model.bar,
                onMessage: message => App.Message.GotBarMessage({ message }),
                ...(more.configured === true
                  ? { preset: 'low' as const }
                  : { style: bar, menuMixins: [menus.mixin] }),
                ...(more.anchor === true ? { anchor: { gap: 30 } } : {}),
                menus: [
                  {
                    label: 'File',
                    rows: [
                      { value: 'new', label: 'New' },
                      { value: 'open', label: 'Open' },
                    ],
                    header: h.span([h.Id('head')], ['Recent']),
                    footer: h.span([h.Id('foot')], ['3 files']),
                  },
                  { label: 'Edit', rows: [{ value: 'undo', label: 'Undo' }] },
                ],
              },
              h,
            ),
          ],
        ),
    }),
  )
}

const openFile = async () => {
  await vi.waitFor(() => expect(document.querySelector('[role="menubar"] button')).not.toBeNull())
  await userEvent.click(document.querySelector('[role="menubar"] button')!)
  await vi.waitFor(() =>
    expect(
      document.querySelectorAll('[role="menuitem"]:not([aria-haspopup])').length,
    ).toBeGreaterThan(0),
  )
}

test('a menu’s header and footer stand above and below its rows', async () => {
  const handle = mount()
  try {
    await openFile()
    const head = document.getElementById('head')!.getBoundingClientRect()
    const foot = document.getElementById('foot')!.getBoundingClientRect()
    const items = Array.from(document.querySelectorAll('[role="menu"] [role="menuitem"]'))
    expect(items).toHaveLength(2)
    expect(head.bottom).toBeLessThanOrEqual(items[0]!.getBoundingClientRect().top)
    expect(foot.top).toBeGreaterThanOrEqual(items[1]!.getBoundingClientRect().bottom)
  } finally {
    handle.dispose()
  }
})

test.each([
  ['the anchor option', { anchor: true }],
  ['a configured preset', { configured: true }],
] as const)('%s moves every menu away from its trigger by the gap', async (_, more) => {
  const handle = mount(more)
  try {
    await openFile()
    const trigger = document.querySelector('[role="menubar"] button')!.getBoundingClientRect()
    const panel = document.querySelector('[role="menu"]')!.getBoundingClientRect()
    expect(panel.top - trigger.bottom).toBeGreaterThan(24)
  } finally {
    handle.dispose()
  }
})

test('choosing a row reports the menu’s index and the row’s value to the application', async () => {
  const handle = mount()
  try {
    await openFile()
    await userEvent.click(document.querySelectorAll('[role="menu"] [role="menuitem"]')[1]!)
    await vi.waitFor(() => expect(document.getElementById('last')?.textContent).toBe('0:open'))
  } finally {
    handle.dispose()
  }
})
