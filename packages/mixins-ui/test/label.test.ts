/**
 * Label: one Container slot, a view naming its control through `for`, and
 * a variant-free recipe (one label look; the look is chosen once).
 */
import { describe, expect, it } from 'vitest'
import { Capability, SlotView, Style } from 'foldkit-mixins'
import { Inert } from 'foldkit-mixins/testing'
import { LabelSlots, view } from '../src/label.js'
import { Recipes } from '../src/index.js'

const h = SlotView.inertBuilder<never>()

describe('LabelSlots', () => {
  it('publishes one container and nothing stateful', () => {
    expect(Object.keys(LabelSlots)).toEqual(['label'])
    expect(LabelSlots.label?.capability).toBe(Capability.Container)
  })
})

describe('Label view', () => {
  it('names its control', () => {
    const label = view(
      {
        for: 'quantity',
        text: 'Quantity',
        style: Style.forSlots(LabelSlots)(Recipes.Label({})),
      },
      h,
    )
    expect(Inert.byTag(label, 'label')).toHaveLength(1)
    expect(Inert.value(Inert.byTag(label, 'label')[0], 'for')).toBe('quantity')
    expect(Inert.text(label)).toBe('Quantity')
  })
})

describe('Label recipe', () => {
  it('sets a semibold small label over its control', () => {
    const sheet = Style.forSlots(LabelSlots)(Recipes.Label({})).css
    expect(sheet).toContain('font-weight:var(--fk-weight-semibold)')
    expect(sheet).toContain('font-size:var(--fk-size-sm)')
  })
})
