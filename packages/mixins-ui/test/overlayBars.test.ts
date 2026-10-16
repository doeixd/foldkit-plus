/**
 * Where the overlay scroll bar is wired: a Command, a VirtualList or a popup
 * draws its bar beside the scroller, and runs `ScrollBars` only when its
 * `overlayBars` is passed beside the style; a popup with no scroll region
 * draws no bar. The bar itself is
 * `foldkit-primitives`' `scroll-bars.browser.test.ts`; its look,
 * `scrollBars.browser.test.ts`.
 */
import { Option } from 'effect'
import type { Html } from 'foldkit/html'
import { describe, expect, it } from 'vitest'
import { Inert } from 'foldkit-mixins/testing'
import {
  Combobox,
  Command,
  Listbox,
  ListboxSlots,
  Menu,
  MenuSlots,
  VirtualList,
  VirtualListSlots,
} from '../src/index.js'
import { buildersOf } from '../src/resolve.js'
import { scrollBarOf } from '../src/popupScroll.js'
import { drawMenu } from '../src/popupView.js'
import { h, message } from './fixture.js'

const command = (mixins?: typeof Command.overlayBars) =>
  Command.view(
    {
      id: 'palette',
      label: 'Search commands',
      groups: [{ items: [{ value: 'new', label: 'New page' }] }],
      query: '',
      onQuery: () => message('Other'),
      active: Option.none(),
      onActive: () => message('Other'),
      onRun: () => message('Clicked'),
      ...(mixins === undefined ? {} : { mixins }),
    },
    h,
  )

const listOf = (root: Html) => Inert.byRole(root, 'listbox')[0]
const barsOf = (root: Html) =>
  Inert.all(root).filter(node => Inert.value(node, 'data-scroll-bar') !== undefined)

describe('Command overlayBars', () => {
  it('runs nothing unasked', () => {
    expect(listOf(command())?.data?.foldkitMount).toBeUndefined()
  })

  it('frames the list beside a hidden bar, and runs the bars on the list', () => {
    const root = command(Command.overlayBars)
    const list = listOf(root)
    expect(list?.data?.foldkitMount).toEqual({ name: 'ScrollBars', args: {} })
    const [bar] = barsOf(root)
    expect(Inert.value(bar, 'data-scroll-bar')).toBe('block')
    expect(Inert.value(bar, 'aria-hidden')).toBe('true')
    expect(Inert.children(bar)).toHaveLength(1)
    // The bar is the list's sibling, in the frame: the Mount drives its scroller's siblings.
    const frame = Inert.all(root).find(node => Inert.children(node).includes(list!))
    expect(Inert.children(frame)).toEqual([list, bar])
  })
})

describe('VirtualList overlayBars', () => {
  it("runs the bars from the root on upstream's list, which holds a Mount of its own", () => {
    const root = h.div(
      buildersOf(VirtualListSlots, VirtualList.overlayBars, { h }).root.attrs([]),
      [],
    )
    expect(root?.data?.foldkitMount).toEqual({
      name: 'ScrollBars',
      args: { scroller: ':scope > ul' },
    })
  })
})

describe('popup overlayBars', () => {
  it('runs ScrollBars on the scroll region of each popup', () => {
    for (const [slots, mixins] of [
      [MenuSlots, Menu.overlayBars],
      [ListboxSlots, Listbox.overlayBars],
    ] as const) {
      const scroll = h.div(buildersOf(slots, mixins, { h }).scroll.attrs([]), [])
      expect(scroll?.data?.foldkitMount).toEqual({ name: 'ScrollBars', args: {} })
    }
    const combobox = h.div(
      buildersOf(Combobox.ComboboxSlots, Combobox.overlayBars, { h }).scroll.attrs([]),
      [],
    )
    expect(combobox?.data?.foldkitMount).toEqual({ name: 'ScrollBars', args: {} })
  })

  it('gives a bar and its thumb only to a panel that scrolls', () => {
    const builders = buildersOf(MenuSlots, [], { h })
    expect(scrollBarOf(false, builders, h)).toEqual({
      scrollBar: undefined,
      scrollThumb: undefined,
    })
    const { scrollBar, scrollThumb } = scrollBarOf(true, builders, h)
    const bar = h.div(scrollBar!, [])
    expect(Inert.value(bar, 'data-scroll-bar')).toBe('block')
    expect(Inert.value(bar, 'aria-hidden')).toBe('true')
    expect(scrollThumb).toBeDefined()
  })

  it('draws the bar beside the scroll region, in the panel', () => {
    const scrolled = drawMenu(
      {
        id: 'm',
        wrapper: [],
        button: [],
        buttonContent: h.span([], ['Open']),
        backdrop: undefined,
        items: { key: 'items', attributes: [h.Id('panel')] },
        scroll: [h.Id('scroll')],
        groups: [],
        scrollBar: [h.Id('bar')],
        scrollThumb: [h.Id('thumb')],
      },
      h,
    )
    const panel = Inert.all(scrolled).find(node => Inert.value(node, 'id') === 'panel')
    expect(Inert.children(panel).map(node => Inert.value(node, 'id'))).toEqual(['scroll', 'bar'])
    const bar = Inert.children(panel)[1]
    expect(Inert.children(bar).map(node => Inert.value(node, 'id'))).toEqual(['thumb'])
  })
})
