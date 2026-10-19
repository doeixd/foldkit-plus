/**
 * Tabs drawn with their indicator and highlight, on a real runtime: the
 * indicator sits under the chosen tab and goes to a new choice, the hover
 * lands on the tab the pointer is on, and until `Tabs.fluid` runs the chosen
 * tab marks itself and the indicator shows nothing.
 */
import { Schema } from 'effect'
import { Tabs as UiTabs } from '@foldkit/ui'
import type { HtmlBuilder } from 'foldkit/html'
import * as Runtime from 'foldkit/runtime'
import { Layers, Style } from 'foldkit-mixins'
import { Theme } from 'foldkit-mixins/theme'
import { afterEach, expect, test, vi } from 'vitest'
import { userEvent } from 'vitest/browser'
import { Recipes, Tabs, TabsSlots } from '../src/index.js'

const theme = Theme.standard(Theme.make({ accent: { hue: 265, chroma: 0.16 } }))
const style = Style.forSlots(TabsSlots)(Recipes.Tabs({}))
const Model = Schema.Struct({ tabs: UiTabs.Model, value: Schema.String })
type Model = typeof Model.Type
const values = ['overview', 'activity', 'settings']
const Project = UiTabs.create()

afterEach(() => {
  document.head.querySelectorAll('style[data-test]').forEach(element => element.remove())
  document.body.replaceChildren()
})

const mount = (fluid: boolean, direction: 'ltr' | 'rtl' = 'ltr', look = style) => {
  const sheet = document.createElement('style')
  sheet.dataset['test'] = ''
  sheet.textContent =
    Style.stylesheet(Layers.standard.declare, Layers.standard.in('theme', Theme.root(theme))) +
    look.css
  document.head.append(sheet)
  const container = document.createElement('div')
  container.id = 'tabs-browser'
  document.body.dir = direction
  document.body.appendChild(container)
  const view = (model: Model, h: HtmlBuilder<UiTabs.Message>) =>
    Project.view(
      model.tabs,
      {
        tabs: values,
        selectedValue: model.value,
        ariaLabel: 'Project',
        toView: Tabs.toView(
          [look.mixin, ...(fluid ? Tabs.fluid : [])],
          { h },
          ({ tablist, indicator, highlight, tabs }) =>
            h.div(tablist, [
              h.div(indicator),
              h.div(highlight),
              ...tabs.map(tab => h.button(tab.tab, [tab.value])),
            ]),
        ),
      },
      h,
    )
  return Runtime.embed(
    Runtime.makeElement({
      Model,
      container,
      init: () => ({ model: { tabs: UiTabs.init({ id: 'project' }), value: 'overview' } }),
      update: (model: Model, message: UiTabs.Message) => {
        const next = Project.update(model.tabs, message)
        return {
          model: { tabs: next.model, value: next.outMessage?.value ?? model.value },
          ...(next.commands === undefined ? {} : { commands: next.commands }),
        }
      },
      view,
    }),
  )
}

const tab = (name: string) =>
  Array.from(document.querySelectorAll<HTMLElement>('[role="tab"]')).find(
    each => each.textContent === name,
  )!
const part = (index: number) =>
  document.querySelector('[role="tablist"]')!.children[index] as HTMLElement

/** Whether `overlay` spans `target` across, to the pixel. */
const spans = (overlay: HTMLElement, target: HTMLElement) => {
  const over = overlay.getBoundingClientRect()
  const under = target.getBoundingClientRect()
  return Math.abs(over.left - under.left) < 1 && Math.abs(over.width - under.width) < 1
}

test('the indicator sits under the chosen tab and goes to a new choice', async () => {
  const handle = mount(true)
  try {
    await vi.waitFor(() => expect(spans(part(0), tab('overview'))).toBe(true))
    // The tab's own marker goes (it transitions) once the indicator moves.
    await vi.waitFor(() => expect(getComputedStyle(tab('overview')).boxShadow).toBe('none'))
    await userEvent.click(tab('settings'))
    await vi.waitFor(() => expect(spans(part(0), tab('settings'))).toBe(true))
  } finally {
    handle.dispose()
  }
})

test('the hover lands on the tab the pointer is on', async () => {
  const handle = mount(true)
  try {
    await vi.waitFor(() => expect(tab('activity')).toBeTruthy())
    await userEvent.hover(tab('activity'))
    await vi.waitFor(() => {
      expect(getComputedStyle(part(1)).opacity).toBe('1')
      expect(spans(part(1), tab('activity'))).toBe(true)
    })
  } finally {
    handle.dispose()
  }
})

test('without Tabs.fluid the chosen tab marks itself and the indicator shows nothing', async () => {
  const handle = mount(false)
  try {
    await vi.waitFor(() => expect(tab('overview')).toBeTruthy())
    expect(getComputedStyle(tab('overview')).boxShadow).not.toBe('none')
    expect(getComputedStyle(tab('activity')).boxShadow).toBe('none')
    expect(getComputedStyle(part(0)).display).toBe('none')
    expect(getComputedStyle(part(1)).display).toBe('none')
  } finally {
    handle.dispose()
  }
})

test('right to left, the indicator still sits under the chosen tab', async () => {
  const handle = mount(true, 'rtl')
  try {
    await vi.waitFor(() => expect(spans(part(0), tab('overview'))).toBe(true))
  } finally {
    handle.dispose()
    document.body.dir = ''
  }
})

/**
 * Nothing else that would measure again: no transition (a logical side that
 * flips runs one), and items of a fixed width, since their words shaped right
 * to left can differ by a fraction of a pixel and resize them.
 */
const stillAll = () => {
  const still = document.createElement('style')
  still.dataset['test'] = ''
  still.textContent = '* { transition: none !important; } [role="tab"] { inline-size: 6rem; }'
  document.head.append(still)
}

const settled = async () => {
  for (let frame = 0; frame < 3; frame++) await new Promise(done => requestAnimationFrame(done))
}

test('when the page turns right to left, the indicator follows the chosen tab', async () => {
  stillAll()
  const handle = mount(true)
  // The page's direction, not the body's, which the fixture sets.
  document.body.removeAttribute('dir')
  try {
    await vi.waitFor(() => expect(spans(part(0), tab('overview'))).toBe(true))
    // Past the frames its first measures are asked for in.
    await settled()
    const before = tab('overview').getBoundingClientRect().left
    document.documentElement.dir = 'rtl'
    await vi.waitFor(() => {
      expect(tab('overview').getBoundingClientRect().left).not.toBe(before)
      expect(spans(part(0), tab('overview'))).toBe(true)
    })
  } finally {
    handle.dispose()
    document.documentElement.removeAttribute('dir')
  }
})

test('a scrolling row draws its rule above its bar, and shows a mouse the thumb only while hovered', async () => {
  const runtime = mount(
    false,
    'ltr',
    Style.forSlots(TabsSlots)(Recipes.Tabs({ overflow: 'scroll' })),
  )
  try {
    await vi.waitFor(() => expect(document.querySelector('[role="tablist"]')).not.toBeNull())
    const list = document.querySelector<HTMLElement>('[role="tablist"]')!
    await userEvent.hover(document.body, { position: { x: 600, y: 400 } })
    const row = getComputedStyle(list)
    // A background at the foot of the padding box, which ends above a scrollbar;
    // an inset shadow is drawn at the border, under the bar.
    expect(row.backgroundImage).toContain('linear-gradient')
    expect(row.backgroundOrigin).toBe('padding-box')
    expect(row.backgroundPositionY).toBe('100%')
    expect(row.boxShadow).toBe('none')
    const thumb = () => getComputedStyle(list).scrollbarColor.split(/\s(?![^(]*\))/)[0]
    expect(thumb()).toBe('rgba(0, 0, 0, 0)')
    await userEvent.hover(list)
    await vi.waitFor(() => expect(thumb()).not.toBe('rgba(0, 0, 0, 0)'))
  } finally {
    runtime.dispose()
  }
})
