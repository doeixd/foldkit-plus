/**
 * Touch targets and attribute-dispatched icons: the coarse-pointer floor and
 * the icon custom property land in the CSS.
 */
import { Capability, Slot, Slots, Style } from 'foldkit-mixins'
import { describe, expect, it } from 'vitest'
import { Icons, Touch } from '../src/index.js'

const TestSlots = Slots.define({
  control: Slot.make({ capability: Capability.Container }),
  region: Slot.make({ capability: Capability.Container }),
})

describe('Touch', () => {
  it('floors controls at 44px only where the pointer is coarse', () => {
    const css = Style.forSlots(TestSlots)({ control: Touch.target }).css
    expect(css).toContain('(pointer: coarse)')
    expect(css).toContain('min-height:2.75rem')
    expect(css).toContain('min-width:2.75rem')
  })

  it('floors every boxed control a region draws', () => {
    const css = Style.forSlots(TestSlots)({ region: Touch.targets }).css
    expect(css).toContain('(pointer: coarse)')
    expect(css).toContain(':is(a, button, summary, select)')
    expect(css).toContain('min-height:2.75rem')
  })
})

describe('Icons', () => {
  it('draws the icon in --icon over the text color', () => {
    const css = Style.forSlots(TestSlots)({ control: Icons.glyph('1rem') }).css
    expect(css).toContain('::before')
    expect(css).toContain('var(--icon)')
    expect(css).toContain('height:1rem')
  })

  it('sets --icon by an attribute value', () => {
    const css = Style.forSlots(TestSlots)({
      control: Icons.byAttribute('data-block', { Hero: 'url("hero")', Text: 'url("text")' }),
    }).css
    expect(css).toContain('[data-block="Hero"]')
    expect(css).toContain('--icon:url("hero")')
    expect(css).toContain('[data-block="Text"]')
    expect(css).not.toContain('[data-block="Section"]')
  })
})
