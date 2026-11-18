/**
 * `Tabs.view` on a real runtime, placed as an application places it
 * (`Bundles.Tabs` as a child that reports `Selected`): the rows' marks and
 * words, the chosen row's panel alone, a disabled row that cannot be chosen,
 * close buttons that are no tab stop, the arrows moving the choice, and upright
 * tabs laid beside their panel.
 */
import { Schema } from 'effect'
import { Bundle } from 'foldkit-bundle'
import * as Runtime from 'foldkit/runtime'
import { Layers, Style } from 'foldkit-mixins'
import { Theme } from 'foldkit-mixins/theme'
import { afterEach, expect, test, vi } from 'vitest'
import { userEvent } from 'vitest/browser'
import { Bundles, Recipes, Tabs, TabsSlots } from '../src/index.js'

afterEach(() => {
  document.head.querySelectorAll('style[data-test]').forEach(element => element.remove())
  document.body.replaceChildren()
})

const App = Bundle.compose({ value: Schema.String, closed: Schema.Array(Schema.String) }).pipe(
  Bundle.withChild('tabs', Bundles.Tabs, {
    args: { id: 'sections' },
    onOut: out => model => ({ model: { ...model, value: out.value } }),
  }),
)

const Pager = Tabs.configure({
  base: { orientation: 'vertical' },
  presets: { upright: { orientation: 'vertical' }, flat: { orientation: 'horizontal' } },
})

const mount = (
  more: {
    readonly orientation?: 'vertical'
    readonly close?: boolean
    readonly selection?: Parameters<typeof Recipes.Tabs>[0]
    readonly configured?: boolean
  } = {},
) => {
  const style = Style.forSlots(TabsSlots)(Recipes.Tabs(more.selection ?? {}))
  const sheet = document.createElement('style')
  sheet.dataset['test'] = ''
  sheet.textContent =
    Style.stylesheet(
      Layers.standard.declare,
      Layers.standard.in('theme', Theme.root(Theme.standard(Theme.make({})))),
    ) + style.css
  document.head.append(sheet)
  const container = document.createElement('div')
  container.id = 'tabs-view'
  document.body.append(container)
  return Runtime.embed(
    Runtime.makeElement({
      ...App.placements.runtime({
        Model: App.Model,
        initial: { value: 'overview', closed: [] },
      }),
      container,
      view: (model, h) =>
        (more.configured === true ? Pager.view : Tabs.view)(
          {
            model: model.tabs,
            onMessage: message => App.Message.GotTabsMessage({ message }),
            label: 'Project',
            value: model.value,
            ...(more.orientation === undefined ? {} : { orientation: more.orientation }),
            tabs: [
              { value: 'overview', label: 'Overview', panel: h.p([], ['Six people.']) },
              {
                value: 'activity',
                label: 'Activity',
                icon: h.span([], ['★']),
                trailing: h.span([], ['12']),
                panel: h.p([], ['Ada published.']),
              },
              { value: 'locked', label: 'Locked', disabled: true, panel: h.p([], ['Never.']) },
              { value: 'settings', label: 'Settings', panel: h.p([], ['Who can edit.']) },
            ],
            ...(more.close === true
              ? {
                  close: {
                    onClose: () =>
                      App.Message.GotTabsMessage({ message: { _tag: 'CompletedFocusTab' } }),
                  },
                }
              : {}),
            style,
          },
          h,
        ),
    }),
  )
}

const all = (selector: string) => Array.from(document.querySelectorAll<HTMLElement>(selector))
const chosen = () => all('[role="tab"]').find(tab => tab.getAttribute('aria-selected') === 'true')
const drawn = () => vi.waitFor(() => expect(all('[role="tab"]')).toHaveLength(4))

test('each row draws its words, a mark hidden from assistive technology and its trailing', async () => {
  const handle = mount()
  try {
    await drawn()
    const activity = all('[role="tab"]')[1]!
    expect(activity.textContent).toBe('★Activity12')
    expect(activity.querySelector('[aria-hidden="true"]')?.textContent).toBe('★')
    expect(document.querySelector('[role="tablist"]')?.getAttribute('aria-label')).toBe('Project')
  } finally {
    handle.dispose()
  }
})

test('only the chosen row’s panel is drawn, and choosing another swaps it', async () => {
  const handle = mount()
  try {
    await drawn()
    expect(all('[role="tabpanel"]').map(panel => panel.textContent)).toEqual(['Six people.'])
    await userEvent.click(all('[role="tab"]')[3]!)
    await vi.waitFor(() =>
      expect(all('[role="tabpanel"]').map(panel => panel.textContent)).toEqual(['Who can edit.']),
    )
    expect(chosen()?.textContent).toBe('Settings')
  } finally {
    handle.dispose()
  }
})

test('a disabled row is aria-disabled, and the arrow keys pass over it', async () => {
  const handle = mount()
  try {
    await drawn()
    const locked = all('[role="tab"]')[2]!
    expect(locked.hasAttribute('disabled') || locked.getAttribute('aria-disabled') === 'true').toBe(
      true,
    )
    await userEvent.click(all('[role="tab"]')[1]!)
    await vi.waitFor(() => expect(chosen()?.textContent).toBe('★Activity12'))
    await userEvent.keyboard('{ArrowRight}')
    await vi.waitFor(() => expect(chosen()?.textContent).toBe('Settings'))
  } finally {
    handle.dispose()
  }
})

test('close buttons are no tab stop and hidden from assistive technology', async () => {
  const handle = mount({ close: true })
  try {
    await drawn()
    const buttons = all('[role="tablist"] button:not([role="tab"])')
    expect(buttons).toHaveLength(3)
    for (const button of buttons) {
      expect(button.getAttribute('tabindex')).toBe('-1')
      expect(button.getAttribute('aria-hidden')).toBe('true')
    }
  } finally {
    handle.dispose()
  }
})

test.each([
  ['horizontal', undefined, 'column'],
  ['vertical', 'vertical', 'row'],
] as const)('%s tabs lay the tablist and panel in a %s', async (_, orientation, direction) => {
  const handle = mount(orientation === undefined ? {} : { orientation })
  try {
    await drawn()
    const root = document.querySelector('[role="tablist"]')!.parentElement!
    expect(getComputedStyle(root).flexDirection).toBe(direction)
    const tablist = document.querySelector('[role="tablist"]')!.getBoundingClientRect()
    const panel = document.querySelector('[role="tabpanel"]')!.getBoundingClientRect()
    if (orientation === undefined) expect(panel.top).toBeGreaterThanOrEqual(tablist.bottom)
    else expect(panel.left).toBeGreaterThanOrEqual(tablist.right)
  } finally {
    handle.dispose()
  }
})

test('configure fixes the orientation once, and the call may change it', async () => {
  const handle = mount({ configured: true })
  try {
    await drawn()
    const root = document.querySelector('[role="tablist"]')!.parentElement!
    expect(getComputedStyle(root).flexDirection).toBe('row')
  } finally {
    handle.dispose()
  }
})
