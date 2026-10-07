import { describe, expect, it } from 'vitest'
import * as UiSlider from '@foldkit/ui/slider'
import { Message, initialModel, rootOverrideOf, update } from '../src/main.js'

describe('design-system update', () => {
  it('selects a hue, scheme, tab, and plan', () => {
    const hue = update(initialModel, Message.HueSelected({ hue: 172 }))
    expect(hue.model.hue).toBe(172)
    const scheme = update(hue.model, Message.SchemeSelected({ scheme: 'dark' }))
    expect(scheme.model.scheme).toBe('dark')
    const tab = update(scheme.model, Message.LineTabSelected({ tab: 'settings' }))
    expect(tab.model.lineTab).toBe('settings')
    const plan = update(tab.model, Message.PlanSelected({ plan: 'enterprise' }))
    expect(plan.model.plan).toBe('enterprise')
  })

  it('types drafts, toggles options, and counts button presses', () => {
    const named = update(initialModel, Message.NameTyped({ value: 'Ada' }))
    expect(named.model.name).toBe('Ada')
    const bio = update(named.model, Message.BioTyped({ value: 'Analytical engines.' }))
    expect(bio.model.bio).toBe('Analytical engines.')
    const toggled = update(bio.model, Message.NotificationsToggled({ value: true }))
    expect(toggled.model.notifications).toBe(true)
    const untoggled = update(toggled.model, Message.MarketingToggled({ value: false }))
    expect(untoggled.model.marketing).toBe(false)
    const clicked = update(untoggled.model, Message.ButtonClicked())
    expect(clicked.model.clicks).toBe(1)
  })

  it('selects a country, contact, and disclosure, drives the live slider, and toggles the popover', () => {
    const country = update(initialModel, Message.CountrySelected({ value: 'ca' }))
    expect(country.model.country).toBe('ca')
    const details = update(country.model, Message.DetailsToggled({ value: true }))
    expect(details.model.detailsOpen).toBe(true)
    const contact = update(details.model, Message.ContactSelected({ contact: 'phone' }))
    expect(contact.model.contact).toBe('phone')
    // Arrow keys step through the child's keyboard navigation.
    const stepped = update(
      contact.model,
      Message.VolumeSlider({
        message: UiSlider.Message.PressedKeyboardNavigation({
          direction: 'StepIncrement',
          value: 60,
        }),
      }),
    )
    expect(stepped.model.volume).toBe(65)
    const steppedDown = update(
      stepped.model,
      Message.VolumeSlider({
        message: UiSlider.Message.PressedKeyboardNavigation({
          direction: 'StepDecrement',
          value: 65,
        }),
      }),
    )
    expect(steppedDown.model.volume).toBe(60)
    // A press starts the drag and each stop writes through ChangedValue.
    const pressed = update(
      steppedDown.model,
      Message.VolumeSlider({
        message: UiSlider.Message.PressedPointer({ value: 70, originValue: 60 }),
      }),
    )
    expect(pressed.model.volume).toBe(70)
    expect(pressed.model.volumeSlider.dragState._tag).toBe('Dragging')
    const dragged = update(
      pressed.model,
      Message.VolumeSlider({ message: UiSlider.Message.MovedDragPointer({ value: 80 }) }),
    )
    expect(dragged.model.volume).toBe(80)
    // A move with no drag in flight is ignored.
    const idle = update(
      initialModel,
      Message.VolumeSlider({ message: UiSlider.Message.MovedDragPointer({ value: 80 }) }),
    )
    expect(idle.model.volume).toBe(60)
    const popover = update(dragged.model, Message.PopoverToggled())
    expect(popover.model.popoverOpen).toBe(true)
    const address = update(popover.model, Message.AddressTyped({ value: 'pricing' }))
    expect(address.model.address).toBe('pricing')
  })

  it('declares the hue knob and scheme on :root, where derived tokens compute', () => {
    expect(rootOverrideOf({ hue: 172, scheme: 'system' })).toBe(
      ':root{--fk-knob-accent-h:172;color-scheme:light dark}',
    )
    expect(rootOverrideOf({ hue: 222, scheme: 'dark' })).toBe(
      ':root{--fk-knob-accent-h:222;color-scheme:dark}',
    )
    expect(rootOverrideOf({ hue: 38, scheme: 'light' })).toBe(
      ':root{--fk-knob-accent-h:38;color-scheme:light}',
    )
  })
})
