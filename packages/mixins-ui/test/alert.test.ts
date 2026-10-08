/**
 * Alert: four Container slots with no state behind them, a view that speaks
 * through `status` or `alert` by urgency, and a recipe whose tone axis maps
 * each feedback family to its subtle fill and ink.
 */
import { describe, expect, it } from 'vitest'
import { Capability, SlotView, Style } from 'foldkit-mixins'
import { Inert } from 'foldkit-mixins/testing'
import { AlertSlots, view } from '../src/alert.js'
import { Recipes } from '../src/index.js'

const h = SlotView.inertBuilder<never>()

describe('AlertSlots', () => {
  it('publishes four containers and nothing stateful', () => {
    expect(Object.keys(AlertSlots)).toEqual(['root', 'icon', 'title', 'description'])
    for (const slot of Object.values(AlertSlots)) {
      expect(slot.capability).toBe(Capability.Container)
    }
  })
})

describe('Alert view', () => {
  it('reports by default and interrupts when assertive', () => {
    const quiet = view({ title: 'Saved', description: 'All changes kept.' }, h)
    expect(Inert.byRole(quiet, 'status')).toHaveLength(1)
    expect(Inert.byRole(quiet, 'alert')).toHaveLength(0)
    expect(Inert.text(quiet)).toContain('Saved')
    const loud = view({ title: 'Failed', assertive: true }, h)
    expect(Inert.byRole(loud, 'alert')).toHaveLength(1)
    expect(Inert.byRole(loud, 'status')).toHaveLength(0)
  })

  it('skips the icon and description it is not given', () => {
    const bare = view({ title: 'Hi', style: Style.forSlots(AlertSlots)(Recipes.Alert({})) }, h)
    expect(Inert.text(bare)).toBe('Hi')
  })
})

describe('Alert recipe', () => {
  const css = (selection: Parameters<typeof Recipes.Alert>[0]): string =>
    Style.forSlots(AlertSlots)(Recipes.Alert(selection)).css

  it('tints every tone with its family, info by default', () => {
    expect(css({})).toContain('background:var(--fk-info-subtle)')
    expect(css({ tone: 'error' })).toContain('background:var(--fk-error-subtle)')
    expect(css({ tone: 'error' })).toContain('color:var(--fk-error-ink)')
    expect(css({ tone: 'success' })).toContain('background:var(--fk-success-subtle)')
    expect(css({ tone: 'warning' })).toContain('background:var(--fk-warning-subtle)')
  })
})
