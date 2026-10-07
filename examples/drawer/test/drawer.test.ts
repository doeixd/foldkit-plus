import { describe, expect, it } from 'vitest'
import { Attributes, SlotView } from 'foldkit-mixins'
import { Inert } from 'foldkit-mixins/testing'
import { DismissLayer } from 'foldkit-primitives/interaction'
import { Stack, initial, update, type Message, type Model } from '../src/app.js'
import { Drawer, DrawerOverlay, DrawerSlots } from '../src/view.js'
import { runDemo } from '../src/demo.js'

const drawerLayer = { id: 'drawer', outside: true, escape: true } as const

const open = update(initial.model, { _tag: 'Opened' }).model

describe('update flows', () => {
  it('starts closed', () => {
    expect(initial.model.open).toBe(false)
  })

  it('toggles open and shut', () => {
    expect(update(initial.model, { _tag: 'Toggled' }).model.open).toBe(true)
    expect(update(open, { _tag: 'Toggled' }).model.open).toBe(false)
    expect(update(open, { _tag: 'Closed' }).model.open).toBe(false)
  })

  it('escape dismisses through the stack', () => {
    const dismissed = update(
      open,
      Stack.wrapper.make(DismissLayer.Message.PressedEscape({ layers: [drawerLayer] })),
    ).model
    expect(dismissed.open).toBe(false)
  })

  it('an outside press dismisses, an inside press does not', () => {
    const outside = update(
      open,
      Stack.wrapper.make(DismissLayer.Message.PressedAt({ layers: [drawerLayer], inside: [] })),
    ).model
    expect(outside.open).toBe(false)
    const inside = update(
      open,
      Stack.wrapper.make(
        DismissLayer.Message.PressedAt({ layers: [drawerLayer], inside: ['drawer'] }),
      ),
    ).model
    expect(inside.open).toBe(true)
  })

  it('a dismissal naming another layer leaves it open', () => {
    const other = update(
      open,
      Stack.wrapper.make(
        DismissLayer.Message.PressedEscape({
          layers: [{ id: 'other', outside: true, escape: true }],
        }),
      ),
    ).model
    expect(other.open).toBe(true)
  })
})

describe('view structure', () => {
  it('hides the panel when closed', () => {
    const page = Inert.draw(Drawer, initial.model)
    expect(Inert.byLabel(page, 'Open settings')).toHaveLength(1)
    expect(Inert.byRole(page, 'dialog')).toHaveLength(0)
  })

  it('draws the dialog panel when open', () => {
    const page = Inert.draw(Drawer, open)
    const panel = Inert.byRole(page, 'dialog')
    expect(panel).toHaveLength(1)
    expect(Inert.value(panel[0], 'aria-modal')).toBe('true')
    expect(Inert.byLabel(page, 'Close')).toHaveLength(1)
  })

  it('the panel carries the modal policy mounts', () => {
    const h = SlotView.inertBuilder<Message>()
    const builders = SlotView.buildersFor(
      DrawerSlots,
      DrawerOverlay.map(behavior => behavior.mixin),
      {
        input: open,
        h,
      },
    )
    const mount = Attributes.find(builders.panel.attrs([]), 'OnMount') as unknown as {
      readonly action?: { readonly name?: string }
    }
    expect(mount?.action?.name).toContain('FocusScope')
    expect(mount?.action?.name).toContain('ScrollLock')
    expect(mount?.action?.name).toContain('HideOutside')
  })
})

describe('demo', () => {
  it('traces closed, open, and dismissed', () => {
    expect(runDemo()).toEqual([
      '[page] [drawer closed]',
      '[page] [drawer open: Settings]',
      '[page] [drawer closed] (escape dismissed it)',
    ])
  })
})
