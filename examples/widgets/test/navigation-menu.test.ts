import { describe, expect, it } from 'vitest'
import { Attributes, SlotView } from 'foldkit-mixins'
import { Inert } from 'foldkit-mixins/testing'
import { DismissLayer } from 'foldkit-primitives/interaction'
import { NAMES, Stack, Message, initial, linksOf, update } from '../src/navigation-menu/app.js'
import {
  NavigationMenu,
  NavigationMenuSlots,
  NavigationOverlay,
  runDemo,
} from '../src/navigation-menu/view.js'

const dismissOpen = (model: typeof initial.model) =>
  update(
    model,
    Stack.wrapper.make(
      DismissLayer.Message.PressedEscape({
        layers: [{ id: 'section-Products', outside: true, escape: true }],
      }),
    ),
  ).model

describe('update flows', () => {
  it('starts shut with nothing followed', () => {
    expect(initial.model.openSection).toBe(null)
    expect(initial.model.followed).toBe(null)
  })

  it('hovers open, leaves shut, clicks toggle', () => {
    const open = update(initial.model, Message.EnteredSection({ section: 'Products' })).model
    expect(open.openSection).toBe('Products')
    expect(update(open, Message.EnteredSection({ section: 'Products' })).model).toBe(open)
    expect(update(open, Message.LeftBar()).model.openSection).toBe(null)
    expect(update(open, Message.ToggledSection({ section: 'Products' })).model.openSection).toBe(
      null,
    )
    expect(
      update(initial.model, Message.ToggledSection({ section: 'Company' })).model.openSection,
    ).toBe('Company')
  })

  it('following records section/link and shuts', () => {
    const open = update(initial.model, Message.EnteredSection({ section: 'Products' })).model
    const followed = update(open, Message.FollowedLink({ link: 'Pricing' })).model
    expect(followed.openSection).toBe(null)
    expect(followed.followed).toBe('Products/Pricing')
  })

  it('escape dismisses through the stack', () => {
    const open = update(initial.model, Message.EnteredSection({ section: 'Products' })).model
    expect(dismissOpen(open).openSection).toBe(null)
  })

  it('links come from the open section', () => {
    expect(linksOf(null)).toEqual([])
    expect(linksOf('Resources')).toEqual(['Docs', 'Blog', 'Status'])
  })
})

describe('view structure', () => {
  it('draws the triggers and the open popup', () => {
    const shut = Inert.draw(NavigationMenu, initial.model)
    expect(Inert.byTag(shut, 'nav')).toHaveLength(1)
    expect(Inert.byRole(shut, 'menu')).toHaveLength(0)
    const open = update(initial.model, Message.EnteredSection({ section: 'Company' })).model
    const nav = Inert.draw(NavigationMenu, open)
    expect(Inert.byRole(nav, 'menu')).toHaveLength(1)
    expect(Inert.value(Inert.byLabel(nav, 'Company')[0], 'aria-expanded')).toBe('true')
    for (const name of NAMES) {
      expect(Inert.byLabel(nav, name).length).toBeGreaterThan(0)
    }
  })

  it('the popup carries the nonModal mounts and watches its edge', () => {
    const h = SlotView.inertBuilder<Message>()
    const builders = SlotView.buildersFor(NavigationMenuSlots, NavigationMenu.mixins, {
      input: update(initial.model, Message.EnteredSection({ section: 'Products' })).model,
      h,
    })
    const text = JSON.stringify(builders.popup.attrs([]))
    expect(text).toContain('FocusScope')
    expect(text).not.toContain('ScrollLock')
    expect(text).toContain('KeepInView')
  })
})

describe('demo', () => {
  it('traces hover and follow', () => {
    expect(runDemo()).toEqual([
      'start: open=null followed=null',
      'hovered Products: open=Products followed=null',
      'followed Pricing: open=null followed=Products/Pricing',
    ])
  })
})
