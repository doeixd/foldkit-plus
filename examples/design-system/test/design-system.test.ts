import { describe, expect, it } from 'vitest'
import { SlotView } from 'foldkit-mixins'
import { Message, initialModel, update, view } from '../src/main.js'

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

  it('renders every section without a resolver conflict', () => {
    const h = SlotView.inertBuilder<Message>()
    const document = view(initialModel, h)
    expect(document.title).toBe('Design system · Foldkit Plus')
    expect(document.body).toBeDefined()
  })
})
