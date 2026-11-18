/**
 * Label: one Container slot, a view naming its control through `for`, and
 * a variant-free recipe (one label look; the look is chosen once).
 */
import { describe, expect, it } from 'vitest'
import { Capability, SlotView, Style } from 'foldkit-mixins'
import { Theme } from 'foldkit-mixins/theme'
import { Inert } from 'foldkit-mixins/testing'
import { LabelSlots, view } from '../src/label.js'
import { Recipes } from '../src/index.js'

const h = SlotView.inertBuilder<never>()

describe('LabelSlots', () => {
  it('publishes containers and nothing stateful', () => {
    expect(Object.keys(LabelSlots)).toEqual(['label', 'marker', 'trailing', 'root'])
    for (const slot of Object.values(LabelSlots)) {
      expect(slot.capability).toBe(Capability.Container)
    }
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
  it('sets a semibold label in the body role over its control', () => {
    const sheet = Style.forSlots(LabelSlots)(Recipes.Label({})).css
    expect(sheet).toContain('font-weight:var(--fk-weight-semibold)')
    expect(sheet).toContain(`font-size:${Theme.role('body').fontSize}`)
  })
})

describe('Label view: marker, states and trailing', () => {
  it('marks a required field with a hidden star after the text', () => {
    const [drawn] = Inert.byTag(view({ for: 'a', text: 'Email', required: true }, h), 'label')
    expect(Inert.text(drawn)).toBe('Email *')
    const [marker] = Inert.byTag(drawn, 'span')
    expect(Inert.value(marker, 'aria-hidden')).toBe('true')
    expect(Inert.value(marker, 'data-kind')).toBe('required')
  })

  it('marks an optional field with words that are read, after a space', () => {
    const [drawn] = Inert.byTag(view({ for: 'a', text: 'Email', optional: true }, h), 'label')
    expect(Inert.text(drawn)).toBe('Email (optional)')
    const [marker] = Inert.byTag(drawn, 'span')
    expect(Inert.value(marker, 'aria-hidden')).toBeUndefined()
    expect(Inert.value(marker, 'data-kind')).toBe('optional')
  })

  it('takes the marker words from `words`, key by key', () => {
    const [drawn] = Inert.byTag(
      view({ for: 'a', text: 'Email', optional: true, words: { optional: '(facultatif)' } }, h),
      'label',
    )
    expect(Inert.text(drawn)).toBe('Email (facultatif)')
    const [required] = Inert.byTag(
      view({ for: 'a', text: 'Email', required: true, words: { optional: 'x' } }, h),
      'label',
    )
    expect(Inert.text(required)).toBe('Email *')
  })

  it('writes data-disabled and data-invalid for the recipe, and nothing for a plain label', () => {
    const [off] = Inert.byTag(
      view({ for: 'a', text: 'T', disabled: true, invalid: true }, h),
      'label',
    )
    expect(Inert.value(off, 'data-disabled')).toBe('')
    expect(Inert.value(off, 'data-invalid')).toBe('')
    const [plain] = Inert.byTag(view({ for: 'a', text: 'T' }, h), 'label')
    expect(Inert.value(plain, 'data-disabled')).toBeUndefined()
    expect(Inert.value(plain, 'data-invalid')).toBeUndefined()
    expect(Inert.value(plain, 'aria-disabled')).toBeUndefined()
  })

  it('draws a trailing drawing beside the label, not inside it', () => {
    const drawn = view({ for: 'a', text: 'Email', trailing: h.button([], ['?']) }, h)
    const [inside] = Inert.byTag(drawn, 'label')
    expect(Inert.byTag(inside, 'button')).toHaveLength(0)
    expect(Inert.text(inside)).toBe('Email')
    expect(Inert.byTag(drawn, 'button')).toHaveLength(1)
    expect(Inert.byTag(view({ for: 'a', text: 'Email' }, h), 'div')).toHaveLength(0)
  })
})
