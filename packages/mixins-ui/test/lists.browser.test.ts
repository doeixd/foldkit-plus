/// <reference types="@vitest/browser-playwright" />
/**
 * Command and VirtualList on a real page. With their `overlayBars` beside the
 * style, the browser's bar gives way to a thumb as long as the view is of the
 * list and moving with its scroll, while a coarse pointer keeps the browser's
 * bar. A VirtualList in a box sized by its content keeps one width as rows of
 * other widths scroll in. A Command's shortcut reads left to right on a right
 * to left page.
 */
import * as UiVirtualList from '@foldkit/ui/virtualList'
import { Option, Schema } from 'effect'
import type { HtmlBuilder } from 'foldkit/html'
import * as Runtime from 'foldkit/runtime'
import { Layers, Style } from 'foldkit-mixins'
import { Defaults } from 'foldkit-mixins/defaults'
import { Theme } from 'foldkit-mixins/theme'
import { afterEach, describe, expect, test, vi } from 'vitest'
import { cdp, userEvent } from 'vitest/browser'
import { Command, CommandSlots, Recipes, VirtualList, VirtualListSlots } from '../src/index.js'

const theme = Theme.compose(Theme.tokens, Theme.oklch({ accent: { h: 265, c: 0.16, l: '52%' } }))
const commandStyle = Style.forSlots(CommandSlots)(Recipes.Command({}))
const listStyle = Style.forSlots(VirtualListSlots)(Recipes.VirtualList({}))

afterEach(async () => {
  await userEvent.hover(document.getElementById('away') ?? document.body)
  document.head.querySelectorAll('style[data-test]').forEach(element => element.remove())
  document.body.replaceChildren()
  document.documentElement.removeAttribute('dir')
})

/** Installs the theme and both styles, and a container for the runtime. */
const page = (id: string) => {
  const sheet = document.createElement('style')
  sheet.dataset['test'] = ''
  sheet.textContent =
    Style.stylesheet(
      Layers.standard.declare,
      Layers.standard.in('reset', Defaults.reset),
      Layers.standard.in('theme', Theme.root(theme)),
    ) +
    commandStyle.css +
    listStyle.css
  document.head.append(sheet)
  const container = document.createElement('div')
  container.id = id
  document.body.appendChild(container)
  return container
}

/** Where the pointer is put, away from the lists: every test file shares it. */
const away = <Message>(h: HtmlBuilder<Message>) =>
  h.div([h.Id('away'), h.Style({ height: '40px', marginBlockEnd: '40px' })], [])

type Noop = { readonly _tag: 'Noop' }
const noop: Noop = { _tag: 'Noop' }

const COMMANDS = Array.from({ length: 30 }, (_, index) => ({
  value: `run-${index}`,
  label: `Command ${index}`,
}))

const mountCommand = (options: { readonly bars: boolean }) =>
  Runtime.embed(
    Runtime.makeElement({
      Model: Schema.Struct({}),
      container: page('command'),
      init: () => ({ model: {} }),
      update: (model: {}) => ({ model }),
      view: (_: unknown, h: HtmlBuilder<Noop>) =>
        h.div(
          [],
          [
            away(h),
            Command.view<string, Noop>(
              {
                id: 'palette',
                label: 'Search commands',
                groups: [
                  {
                    heading: 'File',
                    items: [{ value: 'new', label: 'New page', shortcut: ['⌘', 'N'] }],
                  },
                  { items: COMMANDS },
                ],
                query: '',
                onQuery: () => noop,
                active: Option.none(),
                onActive: () => noop,
                onRun: () => noop,
                style: commandStyle,
                ...(options.bars ? { mixins: Command.overlayBars } : {}),
              },
              h,
            ),
          ],
        ),
    }),
  )

/** Rows of many widths, so a box sized by the rows drawn would change width as they scroll. */
const FILES = Array.from(
  { length: 1000 },
  (_, index) => `file-${index}${'-wide'.repeat(index % 9)}.pdf`,
)

const mountList = (options: { readonly bars: boolean; readonly holder?: 'inline-block' }) =>
  Runtime.embed(
    Runtime.makeElement({
      Model: UiVirtualList.Model,
      container: page('list'),
      init: () => ({ model: UiVirtualList.init({ id: 'files', rowHeightPx: 36 }) }),
      update: (model: UiVirtualList.Model, message: UiVirtualList.Message) =>
        UiVirtualList.update(model, message),
      view: (model: UiVirtualList.Model, h: HtmlBuilder<UiVirtualList.Message>) =>
        h.div(
          [],
          [
            away(h),
            h.div(
              [
                h.Id('holder'),
                h.Style(options.holder === undefined ? {} : { display: options.holder }),
              ],
              [
                VirtualList.view<string, UiVirtualList.Message>(
                  {
                    model,
                    items: FILES,
                    itemToKey: file => file,
                    itemToView: file => h.span([], [file]),
                    onMessage: message => message,
                    style: listStyle,
                    ...(options.bars ? { mixins: VirtualList.overlayBars } : {}),
                  },
                  h,
                ),
              ],
            ),
          ],
        ),
    }),
  )

/** Each component with its overlay bars, and where its scroller is. */
const scrollers = {
  Command: { mount: mountCommand, scroller: '[role="listbox"]' },
  VirtualList: { mount: mountList, scroller: 'ul' },
} as const

const partsOf = (selector: string) => {
  const scroller = document.querySelector<HTMLElement>(selector)!
  const bar = document.querySelector<HTMLElement>('[data-scroll-bar="block"]')!
  return { scroller, bar, thumb: bar.firstElementChild! }
}

describe.each(Object.entries(scrollers))('%s overlayBars', (_, { mount, scroller }) => {
  test('give the browser bar way to a thumb as long as the view is of the list', async () => {
    const handle = mount({ bars: true })
    try {
      await vi.waitFor(() =>
        expect(document.querySelector(`${scroller}[data-scroll-overlaid]`)).not.toBeNull(),
      )
      const parts = partsOf(scroller)
      expect(getComputedStyle(parts.scroller).scrollbarWidth).toBe('none')
      expect(parts.scroller.scrollHeight).toBeGreaterThan(parts.scroller.clientHeight)
      const length =
        (parts.bar.clientHeight * parts.scroller.clientHeight) / parts.scroller.scrollHeight
      await vi.waitFor(() =>
        expect(parts.thumb.getBoundingClientRect().height).toBeCloseTo(Math.max(20, length), 1),
      )
      // Over the scroller's edge.
      expect(parts.bar.getBoundingClientRect().right).toBeCloseTo(
        parts.scroller.getBoundingClientRect().right,
        1,
      )
    } finally {
      handle.dispose()
    }
  })

  test('show the bar while the list scrolls, and move the thumb with it', async () => {
    const handle = mount({ bars: true })
    try {
      await vi.waitFor(() =>
        expect(document.querySelector(`${scroller}[data-scroll-overlaid]`)).not.toBeNull(),
      )
      const parts = partsOf(scroller)
      await userEvent.hover(document.getElementById('away')!)
      await vi.waitFor(() => expect(getComputedStyle(parts.bar).opacity).toBe('0'), {
        timeout: 3000,
      })
      const top = parts.thumb.getBoundingClientRect().top
      const room = parts.scroller.scrollHeight - parts.scroller.clientHeight
      parts.scroller.scrollTop = room / 2
      await vi.waitFor(() => expect(getComputedStyle(parts.bar).opacity).toBe('1'))
      const travel = parts.bar.clientHeight - parts.thumb.getBoundingClientRect().height
      await vi.waitFor(() =>
        expect(parts.thumb.getBoundingClientRect().top - top).toBeCloseTo(travel / 2, 0),
      )
    } finally {
      handle.dispose()
    }
  })

  test('leave a coarse pointer the browser bar', async () => {
    // Chrome's touch emulation makes the primary pointer coarse, as on a phone.
    await cdp().send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 })
    const handle = mount({ bars: true })
    try {
      expect(matchMedia('(pointer: coarse)').matches).toBe(true)
      await vi.waitFor(() => expect(document.querySelector(scroller)).not.toBeNull())
      // Long past the frame a Mount that ran would have marked the scroller in.
      await new Promise(resolve => setTimeout(resolve, 100))
      const parts = partsOf(scroller)
      expect(parts.scroller.hasAttribute('data-scroll-overlaid')).toBe(false)
      expect(getComputedStyle(parts.scroller).scrollbarWidth).not.toBe('none')
      expect(getComputedStyle(parts.bar).display).toBe('none')
    } finally {
      handle.dispose()
      await cdp().send('Emulation.setTouchEmulationEnabled', { enabled: false })
    }
  })
})

test('a VirtualList sized by its container keeps one width as rows of other widths scroll in', async () => {
  const handle = mountList({ bars: false, holder: 'inline-block' })
  try {
    await vi.waitFor(() => expect(document.querySelectorAll('ul li').length).toBeGreaterThan(5))
    const list = document.querySelector<HTMLElement>('ul')!
    const root = list.parentElement!
    const widths = new Set<number>()
    for (const top of [0, 1000, 2000, 5000, 9000, 20000]) {
      list.scrollTop = top
      // Drawn once the list has followed the scroll: the row at its top is among the rows.
      await vi.waitFor(() =>
        expect(Array.from(list.querySelectorAll('li span'), span => span.textContent)).toContain(
          FILES[Math.floor(top / 36)],
        ),
      )
      widths.add(root.getBoundingClientRect().width)
    }
    expect([...widths]).toHaveLength(1)
    // A width of its own, not none: the rows' text has room.
    expect([...widths][0]).toBeGreaterThan(200)
  } finally {
    handle.dispose()
  }
})

test("a Command's shortcut reads left to right on a right to left page", async () => {
  document.documentElement.dir = 'rtl'
  const handle = mountCommand({ bars: false })
  try {
    await vi.waitFor(() => expect(document.getElementById('palette-new')).not.toBeNull())
    const keys = [...document.querySelectorAll('#palette-new kbd kbd')]
    const at = (index: number) => keys[index]!.getBoundingClientRect().left
    expect(keys.map(key => key.textContent)).toEqual(['⌘', 'N'])
    expect(at(0)).toBeLessThan(at(1))
    // Still at the row's end, which right to left is its left.
    const row = document.getElementById('palette-new')!.getBoundingClientRect()
    expect(at(0) - row.left).toBeLessThan(row.width / 2)
  } finally {
    handle.dispose()
  }
})
