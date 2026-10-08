/**
 * Badge: one Container slot, a view carrying its tone in `data-tone`, over
 * the option-driven recipe that maps values to families.
 */
import { describe, expect, it } from 'vitest'
import { Capability, SlotView, Style } from 'foldkit-mixins'
import { Inert } from 'foldkit-mixins/testing'
import { BadgeSlots, view } from '../src/badge.js'
import { Recipes } from '../src/index.js'

const h = SlotView.inertBuilder<never>()

const tones = { info: 'info', success: 'success', warning: 'warning', error: 'error' } as const

describe('BadgeSlots', () => {
  it('publishes one container and nothing stateful', () => {
    expect(Object.keys(BadgeSlots)).toEqual(['badge'])
    expect(BadgeSlots.badge?.capability).toBe(Capability.Container)
  })
})

describe('Badge view', () => {
  it('carries its tone in data-tone, or nothing without one', () => {
    const toned = view(
      {
        text: 'Live',
        tone: 'success',
        style: Style.forSlots(BadgeSlots)(Recipes.Badge({ attribute: 'data-tone', tones })),
      },
      h,
    )
    expect(Inert.byTag(toned, 'span')).toHaveLength(1)
    expect(Inert.value(Inert.byTag(toned, 'span')[0], 'data-tone')).toBe('success')
    expect(Inert.text(toned)).toBe('Live')
    const plain = view({ text: 'New' }, h)
    expect(Inert.value(Inert.byTag(plain, 'span')[0], 'data-tone')).toBeUndefined()
  })
})

describe('Badge recipe', () => {
  it('tones mapped values, keeps the base for the rest', () => {
    const sheet = Style.forSlots(BadgeSlots)(Recipes.Badge({ attribute: 'data-tone', tones })).css
    expect(sheet).toContain('[data-tone="success"]')
    expect(sheet).toContain('background:var(--fk-success-subtle)')
    expect(sheet).toContain('border-radius:var(--fk-radius-full)')
  })
})
