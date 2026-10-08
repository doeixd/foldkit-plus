/**
 * `Recipes.InputGroup`: pieces for the application's own group, affix and
 * control slots, drawn as one field. The group carries the border, its hover
 * and the focus ring (while the control inside has focus); the control goes
 * borderless in the variants layer, so it wins over the field's own look.
 */
import { describe, expect, it } from 'vitest'
import { Slots, Slot, Capability, Style } from 'foldkit-mixins'
import { Recipes } from '../src/index.js'

/** The slots the pieces are for, as `foldkit-mixins-form` publishes them. */
const GroupSlots = Slots.define({
  group: Slot.make({ capability: Capability.Container }),
  affix: Slot.make({ capability: Capability.Container }),
  text: Slot.make({ capability: Capability.Container }),
})

describe('InputGroup', () => {
  it('rings the group while its control has focus and marks it invalid', () => {
    const sheet = Style.forSlots(GroupSlots)({
      group: Recipes.InputGroup.group,
      affix: Recipes.InputGroup.affix,
    }).css
    expect(sheet).toMatch(/:focus-within\{[^}]*outline:[^}]*var\(--fk-outline-focus\)/)
    expect(sheet).toMatch(
      /:has\(\[aria-invalid="true"\]\)\{[^}]*border-color:[^}]*var\(--fk-error-outline\)/,
    )
    expect(sheet).toContain('color:var(--fk-text-muted)')
  })

  it('keeps the control borderless in the variants layer', () => {
    const sheet = Style.forSlots(GroupSlots)({
      text: Style.compose(Style.self({ border: '1px solid red' }), Recipes.InputGroup.control),
    }).css
    expect(sheet).toMatch(/@layer variants\{[^}]*border:0/)
    expect(sheet).toContain('background:transparent')
  })
})
