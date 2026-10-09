import { Option } from 'effect'
import { describe, expect, it } from 'vitest'
import { SlotView } from 'foldkit-mixins'
import { Inert } from 'foldkit-mixins/testing'
import { DismissLayer } from 'foldkit-primitives/interaction'
import {
  NAMES,
  Stack,
  Message,
  initial,
  linksOf,
  triggerId,
  update,
} from '../src/navigation-menu/app.js'
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
        layers: [{ id: 'navigation-menu-section-Products', outside: true, escape: true }],
      }),
    ),
  ).model

describe('update flows', () => {
  it('starts shut with nothing followed', () => {
    expect(initial.model.openSection).toEqual(Option.none())
    expect(initial.model.followed).toEqual(Option.none())
    expect(initial.model.openedByPointer).toBe(false)
  })

  it('hovers open, leaves shut, and a click after the hover stays open', () => {
    const open = update(initial.model, Message.EnteredSection({ section: 'Products' })).model
    expect(open.openSection).toEqual(Option.some('Products'))
    expect(open.openedByPointer).toBe(true)
    expect(update(open, Message.EnteredSection({ section: 'Products' })).model).toBe(open)
    expect(update(open, Message.LeftBar()).model.openSection).toEqual(Option.none())
    const stayed = update(open, Message.ToggledSection({ section: 'Products' })).model
    expect(stayed.openSection).toEqual(Option.some('Products'))
    expect(stayed.openedByPointer).toBe(false)
    expect(
      update(stayed, Message.ToggledSection({ section: 'Products' })).model.openSection,
    ).toEqual(Option.none())
    expect(
      update(initial.model, Message.ToggledSection({ section: 'Company' })).model.openSection,
    ).toEqual(Option.some('Company'))
  })

  it('following records section/link and shuts, and reopening keeps the selection', () => {
    const open = update(initial.model, Message.EnteredSection({ section: 'Products' })).model
    const followed = update(open, Message.FollowedLink({ link: 'Pricing' })).model
    expect(followed.openSection).toEqual(Option.none())
    expect(followed.followed).toEqual(Option.some('Products/Pricing'))
    const again = update(followed, Message.EnteredSection({ section: 'Products' })).model
    const nav = Inert.draw(NavigationMenu, again)
    expect(Inert.value(Inert.byLabel(nav, 'Pricing')[0], 'aria-selected')).toBe('true')
  })

  it('escape dismisses through the stack', () => {
    const open = update(initial.model, Message.EnteredSection({ section: 'Products' })).model
    expect(dismissOpen(open).openSection).toEqual(Option.none())
  })

  it('links come from the open section', () => {
    expect(linksOf(Option.none())).toEqual([])
    expect(linksOf(Option.some('Resources'))).toEqual(['Docs', 'Blog', 'Status'])
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
    expect(text).toContain('KeepWithin')
    expect(text).toContain('PlaceAt')
    expect(text).toContain(triggerId('Products'))
  })
})

describe('demo', () => {
  it('traces hover and follow', () => {
    expect(runDemo()).toEqual([
      'start: open=none followed=none',
      'hovered Products: open=Products followed=none',
      'followed Pricing: open=none followed=Products/Pricing',
    ])
  })
})
