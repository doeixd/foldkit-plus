import { describe, expect, it } from 'vitest'
import { Attributes, SlotView } from 'foldkit-mixins'
import { Inert } from 'foldkit-mixins/testing'
import { DismissLayer } from 'foldkit-primitives/interaction'
import { Stack, Message, initial, update } from '../src/hover-card/app.js'
import { HoverCard, HoverCardSlots, HoverOverlay, runDemo } from '../src/hover-card/view.js'

const dismissOpen = (model: typeof initial.model) =>
  update(
    model,
    Stack.wrapper.make(
      DismissLayer.Message.PressedEscape({
        layers: [{ id: 'hover-card', outside: true, escape: true }],
      }),
    ),
  ).model

describe('update flows', () => {
  it('starts shut', () => {
    expect(initial.model.open).toBe(false)
  })

  it('opens on entry and focus, closes on leave and blur', () => {
    expect(update(initial.model, Message.Entered()).model.open).toBe(true)
    expect(update(initial.model, Message.Focused()).model.open).toBe(true)
    const open = update(initial.model, Message.Entered()).model
    expect(update(open, Message.Left()).model.open).toBe(false)
    expect(update(open, Message.Blurred()).model.open).toBe(false)
  })

  it('toggles for touch, and a click after a hover stays open', () => {
    expect(update(initial.model, Message.Toggled()).model.open).toBe(true)
    const open = update(initial.model, Message.Entered()).model
    const stayed = update(open, Message.Toggled()).model
    expect(stayed.open).toBe(true)
    expect(stayed.openedByPointer).toBe(false)
    expect(update(stayed, Message.Toggled()).model.open).toBe(false)
    const keyed = update(initial.model, Message.Focused()).model
    expect(update(keyed, Message.Toggled()).model.open).toBe(false)
  })

  it('escape dismisses through the stack', () => {
    const open = update(initial.model, Message.Entered()).model
    expect(dismissOpen(open).open).toBe(false)
  })
})

describe('view structure', () => {
  it('draws the card only while open', () => {
    expect(Inert.byRole(Inert.draw(HoverCard, initial.model), 'dialog')).toHaveLength(0)
    const open = update(initial.model, Message.Entered()).model
    const card = Inert.draw(HoverCard, open)
    expect(Inert.byRole(card, 'dialog')).toHaveLength(1)
    expect(Inert.text(card)).toContain('Ada Lovelace')
  })

  it('the card carries the nonModal policy mounts and watches its edge', () => {
    const h = SlotView.inertBuilder<Message>()
    const builders = SlotView.buildersFor(HoverCardSlots, HoverCard.mixins, {
      input: update(initial.model, Message.Entered()).model,
      h,
    })
    const mount = Attributes.find(builders.card.attrs([]), 'OnMount') as unknown as {
      readonly action?: { readonly name?: string }
    }
    expect(mount?.action?.name).toContain('FocusScope')
    expect(mount?.action?.name).not.toContain('ScrollLock')
    expect(mount?.action?.name).not.toContain('HideOutside')
    expect(mount?.action?.name).toContain('KeepWithin')
  })
})

describe('demo', () => {
  it('traces hover and leave', () => {
    expect(runDemo()).toEqual(['start: open=false', 'hovered: open=true', 'left: open=false'])
  })
})
