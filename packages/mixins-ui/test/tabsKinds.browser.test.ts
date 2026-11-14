/**
 * Closable, vertical and scrolling tabs on a real runtime: Delete on a tab
 * and a press on its close button close it, focus going to the tab after
 * it; an upright tablist's underline stands at the chosen tab's inline end,
 * either direction; and a long scrolling row stays one line.
 */
import { Option, Schema } from 'effect'
import { Tabs as UiTabs } from '@foldkit/ui'
import * as Command from 'foldkit/command'
import type { HtmlBuilder } from 'foldkit/html'
import type { Return } from 'foldkit/update'
import { defineMessageUnion } from 'foldkit/message'
import * as Runtime from 'foldkit/runtime'
import { modifyFields } from 'foldkit/struct'
import { Layers, Style } from 'foldkit-mixins'
import { Theme } from 'foldkit-mixins/theme'
import { afterEach, expect, test, vi } from 'vitest'
import { userEvent } from 'vitest/browser'
import { Recipes, Tabs, TabsSlots } from '../src/index.js'

const theme = Theme.standard(Theme.make({ accent: { hue: 265, chroma: 0.16 } }))
const Model = Schema.Struct({
  tabs: UiTabs.Model,
  values: Schema.Array(Schema.String),
  value: Schema.String,
})
type Model = typeof Model.Type
const Message = defineMessageUnion({
  GotTabs: { message: UiTabs.Message },
  Closed: { value: Schema.String },
})
type Message = typeof Message.Type
const Bundle = UiTabs.create()

afterEach(() => {
  document.head.querySelectorAll('style[data-test]').forEach(element => element.remove())
  document.body.replaceChildren()
  document.documentElement.removeAttribute('dir')
})

interface Fixture {
  readonly values: ReadonlyArray<string>
  readonly recipe?: Parameters<typeof Recipes.Tabs>[0]
  readonly closable?: boolean
  readonly orientation?: UiTabs.Orientation
  /** The tablist's width, to make a row overflow. */
  readonly width?: string
  /** `--_fk-tab-min`, which a wrapping row's columns are no narrower than. */
  readonly tabMin?: string
  readonly scheme?: 'light' | 'dark'
}

const sheetOf = (css: string) => {
  const sheet = document.createElement('style')
  sheet.dataset['test'] = ''
  sheet.textContent = css
  document.head.append(sheet)
}

const mount = (fixture: Fixture) => {
  const recipe =
    fixture.tabMin === undefined
      ? Recipes.Tabs
      : Recipes.Tabs.extend({
          base: { tablist: Style.self({ '--_fk-tab-min': fixture.tabMin }) },
        })
  const style = Style.forSlots(TabsSlots)(recipe(fixture.recipe ?? {}))
  sheetOf(
    Style.stylesheet(
      Layers.standard.declare,
      Layers.standard.in('theme', Theme.root(theme, { colorScheme: fixture.scheme ?? 'light' })),
    ) +
      style.css +
      // Nothing else that would measure again, so only the change under test moves anything.
      '* { transition: none !important; }',
  )
  // The runtime draws in place of its container, so the width goes on a box around it.
  const box = document.createElement('div')
  if (fixture.width !== undefined) box.style.width = fixture.width
  const container = document.createElement('div')
  container.id = 'tabs-kinds'
  box.appendChild(container)
  document.body.appendChild(box)
  const view = (model: Model, h: HtmlBuilder<Message>) =>
    h.submodel({
      slotId: model.tabs.id,
      model: model.tabs,
      view: Bundle.view,
      viewInputs: {
        tabs: model.values,
        selectedValue: model.value,
        ariaLabel: 'Files',
        ...(fixture.orientation === undefined ? {} : { orientation: fixture.orientation }),
        toView: Tabs.toView<string, Message>(
          [style.mixin, ...Tabs.fluid],
          {
            h,
            ...(fixture.closable === true
              ? { close: { onClose: value => Message.Closed({ value }) } }
              : {}),
          },
          ({ tablist, indicator, highlight, label, tabs }) =>
            h.div(tablist, [
              h.div(indicator),
              h.div(highlight),
              ...tabs.map(tab =>
                h.div(tab.item, [
                  h.button(tab.tab, [h.span(label, [tab.value])]),
                  ...Option.match(tab.close, {
                    onNone: () => [],
                    onSome: close => [h.button(close, [])],
                  }),
                ]),
              ),
            ]),
        ),
      },
      toParentMessage: message => Message.GotTabs({ message }),
    })
  return Runtime.embed(
    Runtime.makeElement({
      Model,
      container,
      init: () => ({
        model: {
          tabs: UiTabs.init({ id: 'files' }),
          values: fixture.values,
          value: fixture.values[0]!,
        },
      }),
      update: (model: Model, message: Message): Return<Model, Message> =>
        Message.match(message, {
          GotTabs: ({ message }) => {
            const next = Bundle.update(model.tabs, message)
            return {
              model: modifyFields(model, {
                tabs: () => next.model,
                value: value => next.outMessage?.value ?? value,
              }),
              commands: Command.mapMessages(next.commands, message => Message.GotTabs({ message })),
            }
          },
          Closed: ({ value }) => {
            const after = Tabs.closing(model.values, model.value, value)
            return {
              model: modifyFields(model, {
                values: () => after.tabs,
                value: current => Option.getOrElse(after.selected, () => current),
              }),
              // The focused tab left the page: the one after it takes focus.
              commands: Command.mapMessages(
                Option.toArray(
                  Option.map(after.focus, index => UiTabs.FocusTab({ id: model.tabs.id, index })),
                ),
                message => Message.GotTabs({ message }),
              ),
            }
          },
        }),
      view,
    }),
  )
}

const tab = (name: string) =>
  Array.from(document.querySelectorAll<HTMLElement>('[role="tab"]')).find(
    each => each.textContent === name,
  )
const names = () =>
  Array.from(document.querySelectorAll<HTMLElement>('[role="tab"]')).map(each => each.textContent)
const indicator = () => document.querySelector('[role="tablist"]')!.children[0] as HTMLElement

test('Delete on a tab closes it, and focus goes to the tab after it', async () => {
  const handle = mount({ values: ['one', 'two', 'three'], closable: true })
  try {
    await vi.waitFor(() => expect(tab('one')).toBeTruthy())
    // On its words, clear of the close button over its end.
    await userEvent.click(tab('two')!, { position: { x: 12, y: 12 } })
    await vi.waitFor(() => expect(document.activeElement).toBe(tab('two')))
    await userEvent.keyboard('{Delete}')
    await vi.waitFor(() => {
      expect(names()).toEqual(['one', 'three'])
      expect(document.activeElement).toBe(tab('three'))
      expect(tab('three')!.getAttribute('aria-selected')).toBe('true')
    })
  } finally {
    handle.dispose()
  }
})

test('a press on a close button closes its tab and leaves the chosen one chosen', async () => {
  const handle = mount({ values: ['one', 'two', 'three'], closable: true })
  try {
    await vi.waitFor(() => expect(tab('one')).toBeTruthy())
    // Under Tabs.fluid the indicator marks the chosen tab; it does not mark itself too.
    await vi.waitFor(() => expect(edges(tab('one')!).width).toBeGreaterThan(10))
    expect(getComputedStyle(tab('one')!).boxShadow).toBe('none')
    const close = tab('three')!.parentElement!.querySelector<HTMLElement>('[title="Close three"]')!
    // The cross lies inside the tab it closes, so the tab's marker covers it, past its words.
    const over = close.getBoundingClientRect()
    const under = tab('three')!.getBoundingClientRect()
    expect(over.left).toBeGreaterThanOrEqual(
      tab('three')!.firstElementChild!.getBoundingClientRect().right,
    )
    expect(over.right).toBeLessThanOrEqual(under.right + 0.5)
    close.click()
    await vi.waitFor(() => {
      expect(names()).toEqual(['one', 'two'])
      expect(tab('one')!.getAttribute('aria-selected')).toBe('true')
    })
  } finally {
    handle.dispose()
  }
})

/** Where the indicator stands against `target`: its left and right edges, in pixels. */
const edges = (target: HTMLElement) => {
  const over = indicator().getBoundingClientRect()
  const under = target.getBoundingClientRect()
  return {
    left: over.left - under.left,
    right: under.right - over.right,
    top: over.top - under.top,
    bottom: under.bottom - over.bottom,
    width: over.width,
  }
}

test.each(['ltr', 'rtl'] as const)(
  'upright, the underline stands at the chosen tab’s inline end (%s)',
  async direction => {
    document.documentElement.dir = direction
    const handle = mount({ values: ['Profile', 'Billing'], orientation: 'Vertical' })
    try {
      await vi.waitFor(() => {
        const at = edges(tab('Profile')!)
        expect(at.width).toBeLessThan(4)
        // Flush with the end the reading runs to, not the start.
        expect(Math.abs(direction === 'ltr' ? at.right : at.left)).toBeLessThan(1)
      })
      expect(tab('Billing')!.getBoundingClientRect().top).toBeGreaterThan(
        tab('Profile')!.getBoundingClientRect().bottom - 1,
      )
    } finally {
      handle.dispose()
    }
  },
)

test('a scrolling row stays one line and the indicator follows a tab scrolled to', async () => {
  const values = Array.from({ length: 12 }, (_, index) => `Document ${index + 1}`)
  const handle = mount({ values, recipe: { overflow: 'scroll' }, width: '20rem' })
  try {
    await vi.waitFor(() => expect(tab('Document 12')).toBeTruthy())
    const list = document.querySelector<HTMLElement>('[role="tablist"]')!
    expect(list.scrollWidth).toBeGreaterThan(list.clientWidth)
    expect(tab('Document 12')!.getBoundingClientRect().top).toBe(
      tab('Document 1')!.getBoundingClientRect().top,
    )
    tab('Document 1')!.focus()
    await userEvent.keyboard('{End}')
    await vi.waitFor(() => {
      expect(tab('Document 12')!.getAttribute('aria-selected')).toBe('true')
      // Scrolled to, inside the row's own width.
      expect(tab('Document 12')!.getBoundingClientRect().right).toBeLessThanOrEqual(
        list.getBoundingClientRect().right + 0.5,
      )
      const at = edges(tab('Document 12')!)
      expect(Math.abs(at.left)).toBeLessThan(1)
      expect(Math.abs(at.right)).toBeLessThan(1)
    })
  } finally {
    handle.dispose()
  }
})

test.each(['light', 'dark'] as const)(
  'a raised pill stands apart from its tray in a %s scheme',
  async scheme => {
    const values = ['One', 'Two', 'Three']
    const handle = mount({ values, scheme, recipe: { variant: 'pill' } })
    try {
      await vi.waitFor(() => expect(tab('Two')).toBeTruthy())
      const list = document.querySelector<HTMLElement>('[role="tablist"]')!
      const tray = getComputedStyle(list)
      const pill = getComputedStyle(indicator())
      console.log(
        scheme,
        'tray',
        tray.backgroundColor,
        'pill',
        pill.backgroundColor,
        pill.boxShadow,
      )
      expect(pill.backgroundColor).not.toBe(tray.backgroundColor)
      expect(pill.boxShadow).not.toBe('none')
    } finally {
      handle.dispose()
    }
  },
)

test('a tint pill keeps the accent tint and no shadow', async () => {
  const handle = mount({ values: ['One', 'Two'], recipe: { variant: 'pill', selection: 'tint' } })
  try {
    await vi.waitFor(() => expect(tab('Two')).toBeTruthy())
    const pill = getComputedStyle(indicator())
    expect(pill.boxShadow).toBe('none')
    // The accent's tint: painted, in the accent's hue (265), not the raised white.
    expect(pill.backgroundColor).toMatch(/^oklch\([\d.]+ [\d.]+ 265\)$/)
    expect(pill.backgroundColor).not.toBe('oklch(1 0 265)')
  } finally {
    handle.dispose()
  }
})

const tabBoxes = () =>
  Array.from(document.querySelectorAll<HTMLElement>('[role="tab"]')).map(each =>
    each.getBoundingClientRect(),
  )
/** The tabs' count on each row, top to bottom. */
const rowSizes = () => {
  const counts = new Map<number, number>()
  for (const at of tabBoxes())
    counts.set(Math.round(at.top), (counts.get(Math.round(at.top)) ?? 0) + 1)
  return [...counts.entries()].sort((a, b) => a[0] - b[0]).map(([, count]) => count)
}
const panes = ['Themes', 'Color', 'Shape', 'Type', 'Icons', 'Motion']

test.each([
  ['330px', [3, 3]],
  ['600px', [6]],
  ['200px', [2, 2, 2]],
] as const)(
  'a wrapping row of six is equal columns that fill it: at %s, rows of %j',
  async (width, rows) => {
    const handle = mount({
      values: panes,
      recipe: { variant: 'pill', size: 'sm', overflow: 'wrap' },
      width,
    })
    try {
      await vi.waitFor(() => expect(tab('Motion')).toBeTruthy())
      const list = document.querySelector<HTMLElement>('[role="tablist"]')!
      expect(rowSizes()).toEqual(rows)
      expect(list.scrollWidth).toBeLessThanOrEqual(list.clientWidth)
      const boxes = tabBoxes()
      const first = boxes[0]!
      for (const at of boxes) expect(Math.abs(at.width - first.width)).toBeLessThan(1)
      // The columns fill the row: the last tab ends at the tray's padding edge.
      const box = list.getBoundingClientRect()
      const padding = parseFloat(getComputedStyle(list).paddingLeft)
      expect(Math.abs(box.right - padding - Math.max(...boxes.map(at => at.right)))).toBeLessThan(1)
      expect(Math.abs(first.left - box.left - padding)).toBeLessThan(1)
    } finally {
      handle.dispose()
    }
  },
)

test("--_fk-tab-min sets how narrow a wrapping row's tabs go", async () => {
  const handle = mount({
    values: panes,
    recipe: { variant: 'pill', size: 'sm', overflow: 'wrap' },
    width: '330px',
    tabMin: '150px',
  })
  try {
    await vi.waitFor(() => expect(tab('Motion')).toBeTruthy())
    expect(rowSizes()).toEqual([2, 2, 2])
  } finally {
    handle.dispose()
  }
})

test('the indicator follows a tab on the last row of a wrapping row, and the labels are centred', async () => {
  const values = Array.from({ length: 8 }, (_, index) => `Section ${index + 1}`)
  const handle = mount({
    values,
    recipe: { variant: 'pill', size: 'sm', overflow: 'wrap' },
    width: '20rem',
  })
  try {
    await vi.waitFor(() => expect(tab('Section 8')).toBeTruthy())
    expect(rowSizes()).toEqual([3, 3, 2])
    tab('Section 1')!.focus()
    await userEvent.keyboard('{End}')
    await vi.waitFor(() => {
      expect(tab('Section 8')!.getAttribute('aria-selected')).toBe('true')
      const at = edges(tab('Section 8')!)
      expect(Math.abs(at.left)).toBeLessThan(1)
      expect(Math.abs(at.right)).toBeLessThan(1)
      expect(Math.abs(at.top)).toBeLessThan(1)
      expect(Math.abs(at.bottom)).toBeLessThan(1)
    })
    for (const each of document.querySelectorAll<HTMLElement>('[role="tab"]')) {
      const label = each.firstElementChild!.getBoundingClientRect()
      const at = each.getBoundingClientRect()
      expect(Math.abs(label.left + label.width / 2 - (at.left + at.width / 2))).toBeLessThan(1)
    }
  } finally {
    handle.dispose()
  }
})

test.each(['light', 'dark'] as const)(
  'the chosen pill is a rounded chip inset in its tray, with a lift, in a %s scheme',
  async scheme => {
    const handle = mount({
      values: panes,
      scheme,
      recipe: { variant: 'pill', size: 'sm', overflow: 'wrap' },
      width: '330px',
    })
    try {
      await vi.waitFor(() => expect(tab('Motion')).toBeTruthy())
      const list = document.querySelector<HTMLElement>('[role="tablist"]')!
      const tray = getComputedStyle(list)
      const padding = parseFloat(tray.paddingLeft)
      const outer = parseFloat(tray.borderTopLeftRadius)
      const chip = getComputedStyle(indicator())
      expect(padding).toBeGreaterThan(3)
      // Concentric: the tray's corner less its padding, and not square.
      expect(parseFloat(chip.borderTopLeftRadius)).toBeGreaterThan(1)
      expect(Math.abs(parseFloat(chip.borderTopLeftRadius) - (outer - padding))).toBeLessThan(0.5)
      // Inset by the padding on the three sides the first tab touches.
      const box = list.getBoundingClientRect()
      const at = indicator().getBoundingClientRect()
      expect(Math.abs(at.left - box.left - padding)).toBeLessThan(1)
      expect(Math.abs(at.top - box.top - padding)).toBeLessThan(1)
      // The tray's second row is under it, so the bottom is the row's, not the tray's.
      tab('Motion')!.focus()
      await userEvent.keyboard('{End}')
      await vi.waitFor(() => expect(tab('Motion')!.getAttribute('aria-selected')).toBe('true'))
      const last = indicator().getBoundingClientRect()
      expect(Math.abs(box.right - last.right - padding)).toBeLessThan(1)
      expect(Math.abs(box.bottom - last.bottom - padding)).toBeLessThan(1)
      // A contact shadow that is not transparent (the theme's own shadow is, at strength 0), and a ring.
      expect(chip.boxShadow).toMatch(/\/ 0\.[1-9]\d*\) 0px 1px 2px/)
      expect(chip.boxShadow).toMatch(/\) 0px 0px 0px 1px$/)
      expect(chip.backgroundColor).not.toBe(tray.backgroundColor)
      // In a dark scheme the chip's fill is near its tray's, so its ring is a step stronger.
      const ring = /ok(?:lch|lab)\(([\d.]+) [^)]*\) 0px 0px 0px 1px$/.exec(chip.boxShadow)
      expect(Number(ring?.[1])).toBeGreaterThan(scheme === 'dark' ? 0.4 : 0.8)
    } finally {
      handle.dispose()
    }
  },
)

test('a click on a close button, which takes the focus, hands it to the tab after it', async () => {
  const handle = mount({ values: ['one', 'two', 'three'], closable: true })
  try {
    await vi.waitFor(() => expect(tab('one')).toBeTruthy())
    const close = tab('two')!.parentElement!.querySelector<HTMLElement>('[title="Close two"]')!
    await userEvent.click(close)
    await vi.waitFor(() => {
      expect(names()).toEqual(['one', 'three'])
      expect(document.activeElement).toBe(tab('three'))
    })
  } finally {
    handle.dispose()
  }
})
