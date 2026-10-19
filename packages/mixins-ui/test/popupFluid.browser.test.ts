/**
 * A listbox drawn with `Listbox.fluid`, on a real runtime: one highlight
 * follows the pointer and the keys, the indicator sits under the chosen row,
 * and the rows draw no fill of their own.
 */
import { Option, Schema } from 'effect'
import { Listbox as UiListbox, Menu as UiMenu } from '@foldkit/ui'
import type { HtmlBuilder } from 'foldkit/html'
import * as Runtime from 'foldkit/runtime'
import { Layers, Style } from 'foldkit-mixins'
import { Theme } from 'foldkit-mixins/theme'
import { afterEach, expect, test, vi } from 'vitest'
import { userEvent } from 'vitest/browser'
import {
  Listbox,
  ListboxSlots,
  ListboxView,
  Menu,
  MenuSlots,
  MenuView,
  Recipes,
} from '../src/index.js'

const theme = Theme.compose(Theme.tokens, Theme.oklch({ accent: { h: 265, c: 0.16, l: '52%' } }))
const style = Style.forSlots(ListboxSlots)(Recipes.Listbox({}))
const Model = Schema.Struct({ listbox: UiListbox.Model, value: Schema.Option(Schema.String) })
type Model = typeof Model.Type
const Frequencies = ListboxView.create<string>()
const frequencies = ['Hourly', 'Daily', 'Weekly', 'Monthly']

afterEach(() => {
  document.head.querySelectorAll('style[data-test]').forEach(element => element.remove())
  document.body.replaceChildren()
})

const mount = (listboxStyle = style) => {
  const sheet = document.createElement('style')
  sheet.dataset['test'] = ''
  sheet.textContent =
    Style.stylesheet(Layers.standard.declare, Layers.standard.in('theme', Theme.root(theme))) +
    listboxStyle.css
  document.head.append(sheet)
  const container = document.createElement('div')
  container.id = 'popup-fluid'
  document.body.appendChild(container)
  const view = (model: Model, h: HtmlBuilder<UiListbox.Message>) =>
    Frequencies.view(
      model.listbox,
      {
        anchor: { placement: 'bottom-start', gap: 4, padding: 8, portal: false },
        items: frequencies,
        maybeSelectedValue: model.value,
        itemToConfig: (frequency: string) => ({ content: h.span([], [frequency]) }),
        buttonContent: h.span([], ['Frequency']),
        toView: Listbox.toView([listboxStyle.mixin, ...Listbox.fluid], { h }),
      },
      h,
    )
  return Runtime.embed(
    Runtime.makeElement({
      Model,
      container,
      init: () => ({
        model: { listbox: UiListbox.init({ id: 'frequency' }), value: Option.some('Weekly') },
      }),
      update: (model: Model, message: UiListbox.Message) => {
        const next = Frequencies.update(model.listbox, message)
        return {
          model: {
            listbox: next.model,
            value: next.outMessage === undefined ? model.value : Option.some(next.outMessage.value),
          },
          ...(next.commands === undefined ? {} : { commands: next.commands }),
        }
      },
      view,
    }),
  )
}

const row = (name: string) =>
  Array.from(document.querySelectorAll<HTMLElement>('[role="option"]')).find(
    each => each.textContent === name,
  )!
const panel = () => document.querySelector<HTMLElement>('[role="listbox"]')!
/** The rows' box, which `fluid` runs on, first in the panel. */
const rows = () => panel().firstElementChild as HTMLElement
const overlay = (index: number) => rows().children[index] as HTMLElement

/** Whether `over` covers `under`'s row, to the pixel. */
const covers = (over: HTMLElement, under: HTMLElement) => {
  const a = over.getBoundingClientRect()
  const b = under.getBoundingClientRect()
  return Math.abs(a.top - b.top) < 1 && Math.abs(a.height - b.height) < 1
}

test('one highlight follows the pointer and the keys, over rows that draw no fill', async () => {
  const handle = mount()
  try {
    await vi.waitFor(() => expect(document.querySelector('button')).toBeTruthy())
    await userEvent.click(document.querySelector('button')!)
    await vi.waitFor(() => expect(rows().getAttribute('data-fluid-hover')).toBe('popup-hover'))
    // Upstream shows the panel once its anchor has placed it.
    await vi.waitFor(() => expect(getComputedStyle(row('Hourly')).visibility).toBe('visible'), 3000)
    // The indicator, then the highlight, lead the rows.
    await vi.waitFor(() => expect(covers(overlay(0), row('Weekly'))).toBe(true))
    expect(getComputedStyle(row('Weekly')).backgroundColor).toBe('rgba(0, 0, 0, 0)')
    await userEvent.hover(row('Hourly'))
    await vi.waitFor(() => {
      expect(getComputedStyle(overlay(1)).opacity).toBe('1')
      expect(covers(overlay(1), row('Hourly'))).toBe(true)
    })
    expect(getComputedStyle(row('Hourly')).backgroundColor).toBe('rgba(0, 0, 0, 0)')
    await userEvent.unhover(row('Hourly'))
    await userEvent.keyboard('{ArrowDown}')
    await vi.waitFor(() => {
      const active = document.querySelector<HTMLElement>('[role="option"][data-active]')!
      expect(covers(overlay(1), active)).toBe(true)
      expect(getComputedStyle(overlay(1)).opacity).toBe('1')
    })
  } finally {
    handle.dispose()
  }
})

test("the chosen row's marker keeps to its row while a trigger-wide panel opens", async () => {
  // Narrower than the panel's fallback width, which it has until the anchor reads the trigger.
  const handle = mount(Style.forSlots(ListboxSlots)(Recipes.Listbox({ width: 'trigger' })))
  try {
    await vi.waitFor(() => expect(document.querySelector('button')).toBeTruthy())
    const wides: Array<string> = []
    let sampling = true
    // After each frame is drawn: what the reader saw.
    const channel = new MessageChannel()
    channel.port1.onmessage = () => {
      // Upstream draws the panel only once it opens.
      const listbox = document.querySelector<HTMLElement>('[role="listbox"]')
      if (listbox !== null && listbox.scrollWidth > listbox.clientWidth)
        wides.push(`${listbox.scrollWidth} > ${listbox.clientWidth}`)
      if (sampling) requestAnimationFrame(() => channel.port2.postMessage(0))
    }
    requestAnimationFrame(() => channel.port2.postMessage(0))
    await userEvent.click(document.querySelector('button')!)
    await vi.waitFor(() => expect(getComputedStyle(row('Hourly')).visibility).toBe('visible'), 3000)
    await vi.waitFor(() => expect(covers(overlay(0), row('Weekly'))).toBe(true))
    await vi.waitFor(() => expect(panel().getAnimations({ subtree: true })).toEqual([]))
    sampling = false
    channel.port1.close()
    expect(wides).toEqual([])
    // Measured again a frame after the panel resizes, which a loaded run can draw late.
    await vi.waitFor(() =>
      expect(overlay(0).getBoundingClientRect().width).toBeCloseTo(
        row('Weekly').getBoundingClientRect().width,
        0,
      ),
    )
  } finally {
    handle.dispose()
  }
})

const Actions = MenuView.create<string>()
const menuStyle = Style.forSlots(MenuSlots)(Recipes.Menu({}))

test("a menu's keys move its one highlight", async () => {
  const sheet = document.createElement('style')
  sheet.dataset['test'] = ''
  sheet.textContent =
    Style.stylesheet(Layers.standard.declare, Layers.standard.in('theme', Theme.root(theme))) +
    menuStyle.css
  document.head.append(sheet)
  const container = document.createElement('div')
  container.id = 'menu-fluid'
  document.body.appendChild(container)
  const MenuModel = Schema.Struct({ menu: UiMenu.Model })
  const handle = Runtime.embed(
    Runtime.makeElement({
      Model: MenuModel,
      container,
      init: () => ({ model: { menu: UiMenu.init({ id: 'actions' }) } }),
      update: (model: typeof MenuModel.Type, message: UiMenu.Message) => {
        const next = Actions.update(model.menu, message)
        return {
          model: { menu: next.model },
          ...(next.commands === undefined ? {} : { commands: next.commands }),
        }
      },
      view: (model, h: HtmlBuilder<UiMenu.Message>) =>
        Actions.view(
          model.menu,
          {
            anchor: { placement: 'bottom-start', gap: 4, padding: 8, portal: false },
            items: ['Rename', 'Duplicate', 'Delete'],
            itemToConfig: (action: string) => ({ content: h.span([], [action]) }),
            buttonContent: h.span([], ['Actions']),
            toView: Menu.toView([menuStyle.mixin, ...Menu.fluid], { h }),
          },
          h,
        ),
    }),
  )
  try {
    await vi.waitFor(() => expect(document.querySelector('button')).toBeTruthy())
    document.querySelector<HTMLElement>('button')!.focus()
    await userEvent.keyboard('{Enter}')
    const menuRows = () =>
      document.querySelector<HTMLElement>('[role="menu"]')!.firstElementChild as HTMLElement
    await vi.waitFor(() => expect(menuRows().getAttribute('data-fluid-hover')).toBe('popup-hover'))
    await userEvent.keyboard('{ArrowDown}')
    await vi.waitFor(() => {
      const active = document.querySelector<HTMLElement>('[role="menuitem"][data-active]')!
      const highlight = menuRows().firstElementChild as HTMLElement
      expect(covers(highlight, active)).toBe(true)
      expect(getComputedStyle(highlight).opacity).toBe('1')
    })
  } finally {
    handle.dispose()
  }
})
