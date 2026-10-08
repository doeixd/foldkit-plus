import { describe, expect, it } from 'vitest'
import { Attributes, SlotView } from 'foldkit-mixins'
import { Inert } from 'foldkit-mixins/testing'
import { DismissLayer } from 'foldkit-primitives/interaction'
import { ACTIONS, FILES, Stack, Message, initial, update } from '../src/context-menu/app.js'
import {
  ContextMenu,
  ContextMenuOverlay,
  ContextMenuSlots,
  runDemo,
} from '../src/context-menu/view.js'

const dismissOpen = (model: typeof initial.model) =>
  update(
    model,
    Stack.wrapper.make(
      DismissLayer.Message.PressedAt({
        layers: [{ id: 'file-menu', outside: true, escape: true }],
        inside: [],
      }),
    ),
  ).model

describe('update flows', () => {
  it('starts shut with no action', () => {
    expect(initial.model.openFor).toBe(null)
    expect(initial.model.action).toBe(null)
  })

  it('opens for a row and chooses through the menu', () => {
    const open = update(initial.model, Message.OpenedFor({ id: 'notes.txt' })).model
    expect(open.openFor).toBe('notes.txt')
    const chose = update(open, Message.ChoseAction({ action: 'Rename' })).model
    expect(chose.openFor).toBe(null)
    expect(chose.action).toBe('Rename notes.txt')
    expect(chose.filePick.selected).toEqual(['Rename'])
  })

  it('an outside press closes without choosing', () => {
    const open = update(initial.model, Message.OpenedFor({ id: 'photo.png' })).model
    const shut = dismissOpen(open)
    expect(shut.openFor).toBe(null)
    expect(shut.action).toBe(null)
  })
})

describe('view structure', () => {
  it('draws the rows and the menu only while open', () => {
    const shut = Inert.draw(ContextMenu, initial.model)
    expect(Inert.byRole(shut, 'list')).toHaveLength(1)
    expect(Inert.byRole(shut, 'menu')).toHaveLength(0)
    const open = update(initial.model, Message.OpenedFor({ id: 'report.pdf' })).model
    const menu = Inert.draw(ContextMenu, open)
    const popup = Inert.byRole(menu, 'menu')
    expect(popup).toHaveLength(1)
    expect(Inert.value(popup[0], 'aria-label')).toBe('Actions for report.pdf')
    expect(Inert.text(menu)).toContain('Rename')
  })

  it('the popup carries the nonModal mounts', () => {
    const h = SlotView.inertBuilder<Message>()
    const builders = SlotView.buildersFor(ContextMenuSlots, ContextMenu.mixins, {
      input: update(initial.model, Message.OpenedFor({ id: 'notes.txt' })).model,
      h,
    })
    const text = JSON.stringify(builders.popup.attrs([]))
    expect(text).toContain('FocusScope')
    expect(text).not.toContain('ScrollLock')
    expect(text).toContain('KeepWithin')
  })

  it('every action draws and every row takes a right-click', () => {
    const open = update(initial.model, Message.OpenedFor({ id: FILES[0]! })).model
    const menu = Inert.draw(ContextMenu, open)
    for (const action of ACTIONS) {
      expect(Inert.byLabel(menu, action)).toHaveLength(1)
    }
    const shut = Inert.draw(ContextMenu, initial.model)
    const rows = Inert.byTag(shut, 'div').filter(node => FILES.includes(Inert.text(node)))
    expect(rows.length).toBeGreaterThan(0)
    for (const row of rows) {
      expect(
        (row as { readonly data?: { readonly on?: { readonly contextmenu?: unknown } } })?.data?.on
          ?.contextmenu,
      ).toBeTypeOf('function')
    }
  })
})

describe('demo', () => {
  it('traces right-click and choice', () => {
    expect(runDemo()).toEqual([
      'start: openFor=null action=null',
      'right-clicked notes: openFor=notes.txt action=null',
      'chose Rename: openFor=null action=Rename notes.txt',
    ])
  })
})
