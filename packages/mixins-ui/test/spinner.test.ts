/**
 * Spinner: a wheel that reports through `status`, or words beside it that
 * are the status's text; three parts always drawn, so the kind is the
 * style's; and a recipe whose movements take a travel's time and hold
 * still under reduced motion.
 */
import { describe, expect, it } from 'vitest'
import { Capability, SlotView, Style } from 'foldkit-mixins'
import { Inert } from 'foldkit-mixins/testing'
import { SpinnerSlots, view } from '../src/spinner.js'
import { Recipes } from '../src/index.js'

const h = SlotView.inertBuilder<never>()

describe('SpinnerSlots', () => {
  it('publishes containers and nothing stateful', () => {
    expect(Object.keys(SpinnerSlots)).toEqual(['wheel', 'part', 'root', 'text'])
    for (const slot of Object.values(SpinnerSlots)) {
      expect(slot.capability).toBe(Capability.Container)
    }
  })
})

describe('Spinner view', () => {
  it('reports what is loading, the wheel holding three parts', () => {
    const wheel = view({ label: 'Saving' }, h)
    expect(Inert.byRole(wheel, 'status')).toHaveLength(1)
    expect(Inert.value(wheel, 'aria-label')).toBe('Saving')
    expect(Inert.children(wheel)).toHaveLength(3)
  })

  it('shows the label beside the wheel as the status’s words', () => {
    const drawn = view({ label: 'Saving', showLabel: true }, h)
    expect(Inert.value(drawn, 'role')).toBe('status')
    // Read from the words, not said twice by a label as well.
    expect(Inert.value(drawn, 'aria-label')).toBeUndefined()
    expect(Inert.text(drawn)).toBe('Saving')
    const [wheel] = Inert.children(drawn)
    expect(Inert.value(wheel, 'aria-hidden')).toBe('true')
  })
})

describe('Spinner recipe', () => {
  const css = (selection: Parameters<typeof Recipes.Spinner>[0]): string =>
    Style.stylesheet(Style.forSlots(SpinnerSlots)(Recipes.Spinner(selection)))

  it('turns a ring through a keyframed rotation, for a travel’s time', () => {
    const sheet = css({})
    expect(sheet).toContain('rotate:360deg')
    expect(sheet).toContain('linear infinite')
    expect(sheet).toContain('var(--fk-knob-travel)')
  })

  it('holds every kind still under reduced motion', () => {
    for (const kind of ['ring', 'dots', 'bars', 'pulse', 'orbit'] as const) {
      expect(css({ kind }), kind).toMatch(/prefers-reduced-motion: reduce\)\{[^}]*\{animation:none/)
    }
  })
})
