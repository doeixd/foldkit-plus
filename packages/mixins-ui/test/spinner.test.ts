/**
 * Spinner: one Container slot, a view that reports through `status`, and a
 * recipe spinning a bordered ring — still under reduced motion, where the
 * wheel holds instead of turning.
 */
import { describe, expect, it } from 'vitest'
import { Capability, SlotView, Style } from 'foldkit-mixins'
import { Inert } from 'foldkit-mixins/testing'
import { SpinnerSlots, view } from '../src/spinner.js'
import { Recipes } from '../src/index.js'

const h = SlotView.inertBuilder<never>()

describe('SpinnerSlots', () => {
  it('publishes one container and nothing stateful', () => {
    expect(Object.keys(SpinnerSlots)).toEqual(['wheel'])
    expect(SpinnerSlots.wheel?.capability).toBe(Capability.Container)
  })
})

describe('Spinner view', () => {
  it('reports what is loading', () => {
    const wheel = view({ label: 'Saving' }, h)
    expect(Inert.byRole(wheel, 'status')).toHaveLength(1)
    expect(Inert.value(Inert.byRole(wheel, 'status')[0], 'aria-label')).toBe('Saving')
  })
})

describe('Spinner recipe', () => {
  const css = (selection: Parameters<typeof Recipes.Spinner>[0]): string =>
    Style.stylesheet(Style.forSlots(SpinnerSlots)(Recipes.Spinner(selection)))

  it('turns a bordered ring through a keyframed rotation', () => {
    const sheet = css({})
    expect(sheet).toContain('@keyframes')
    expect(sheet).toContain('rotate(360deg)')
    expect(sheet).toContain('linear infinite')
    expect(sheet).toContain('var(--fk-motion-normal)')
  })

  it('holds still under reduced motion, and sizes per selection', () => {
    const sheet = css({})
    expect(sheet).toContain('prefers-reduced-motion')
    expect(sheet).toContain('animation:none')
    expect(css({ size: 'sm' })).toContain('1rem')
  })
})
