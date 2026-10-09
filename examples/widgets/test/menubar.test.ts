import { Option } from 'effect'
import { describe, expect, it } from 'vitest'
import { SlotView } from 'foldkit-mixins'
import { Inert } from 'foldkit-mixins/testing'
import { DismissLayer, RovingTabindex } from 'foldkit-primitives/interaction'
import {
  NAMES,
  Roving,
  Stack,
  Message,
  initial,
  itemsOf,
  triggerId,
  update,
} from '../src/menubar/app.js'
import { Menubar, MenubarOverlay, MenubarSlots, runDemo } from '../src/menubar/view.js'

const dismissOpen = (model: typeof initial.model) =>
  update(
    model,
    Stack.wrapper.make(
      DismissLayer.Message.PressedEscape({
        layers: [{ id: 'menubar-menu-Edit', outside: true, escape: true }],
      }),
    ),
  ).model

describe('update flows', () => {
  it('starts shut with no choice', () => {
    expect(initial.model.openMenu).toEqual(Option.none())
    expect(initial.model.choice).toEqual(Option.none())
  })

  it('toggles one menu at a time', () => {
    const open = update(initial.model, Message.OpenedMenu({ menu: 'Edit' })).model
    expect(open.openMenu).toEqual(Option.some('Edit'))
    expect(update(open, Message.OpenedMenu({ menu: 'Edit' })).model.openMenu).toEqual(Option.none())
    expect(update(open, Message.OpenedMenu({ menu: 'View' })).model.openMenu).toEqual(
      Option.some('View'),
    )
  })

  it('choosing records menu/item and shuts, and reopening keeps the selection', () => {
    const open = update(initial.model, Message.OpenedMenu({ menu: 'Edit' })).model
    const chose = update(open, Message.ChoseItem({ item: 'Copy' })).model
    expect(chose.openMenu).toEqual(Option.none())
    expect(chose.choice).toEqual(Option.some('Edit/Copy'))
    const again = update(chose, Message.OpenedMenu({ menu: 'Edit' })).model
    const bar = Inert.draw(Menubar, again)
    expect(Inert.value(Inert.byLabel(bar, 'Copy')[0], 'aria-selected')).toBe('true')
  })

  it('escape dismisses through the stack', () => {
    const open = update(initial.model, Message.OpenedMenu({ menu: 'Edit' })).model
    expect(dismissOpen(open).openMenu).toEqual(Option.none())
  })

  it('roving moves across the triggers', () => {
    const moved = update(
      initial.model,
      Roving.wrapper.make(RovingTabindex.Message.Focused({ id: triggerId('View') })),
    ).model
    expect(moved.menuFocus.current).toBe(triggerId('View'))
  })

  it('items come from the open menu', () => {
    expect(itemsOf(Option.none())).toEqual([])
    expect(itemsOf(Option.some('File'))).toEqual(['New', 'Open', 'Save'])
  })
})

describe('view structure', () => {
  it('draws the bar and the open popup', () => {
    const shut = Inert.draw(Menubar, initial.model)
    expect(Inert.byRole(shut, 'menubar')).toHaveLength(1)
    expect(Inert.byRole(shut, 'menu')).toHaveLength(0)
    const open = update(initial.model, Message.OpenedMenu({ menu: 'File' })).model
    const bar = Inert.draw(Menubar, open)
    expect(Inert.byRole(bar, 'menu')).toHaveLength(1)
    expect(Inert.value(Inert.byLabel(bar, 'File')[0], 'aria-expanded')).toBe('true')
    for (const name of NAMES) {
      expect(Inert.byLabel(bar, name).length).toBeGreaterThan(0)
    }
  })

  it('the popup carries the nonModal mounts', () => {
    const h = SlotView.inertBuilder<Message>()
    const full = SlotView.buildersFor(MenubarSlots, Menubar.mixins, {
      input: update(initial.model, Message.OpenedMenu({ menu: 'Edit' })).model,
      h,
    })
    const text = JSON.stringify(full.popup.attrs([]))
    expect(text).toContain('FocusScope')
    expect(text).not.toContain('ScrollLock')
    expect(text).toContain('PlaceAt')
    expect(text).toContain(triggerId('Edit'))
  })
})

describe('demo', () => {
  it('traces open and choose', () => {
    expect(runDemo()).toEqual([
      'start: open=none choice=none',
      'opened Edit: open=Edit choice=none',
      'chose Copy: open=none choice=Edit/Copy',
    ])
  })
})
