import { describe, expect, it } from 'vitest'
import { Attributes, Capability, Slot, Slots, SlotView } from 'foldkit-mixins'
import { Anchor } from '../src/index.js'
import { h, type TestMessage } from './fixture.js'

describe('Anchor adapter', () => {
  const MenuSlots = Slots.define({
    button: Slot.make({ capability: Capability.Interactive }),
    panel: Slot.make({ capability: Capability.Container }),
  })
  interface Input {
    readonly id: string
  }

  it('mounts the anchor on the floating slot with the config the input gives', () => {
    const Position = Anchor.behavior(MenuSlots)<Input, TestMessage>({
      floating: 'panel',
      config: input => ({
        buttonId: `${input.id}-button`,
        anchor: { placement: 'bottom-start', gap: 4 },
      }),
    })
    const b = SlotView.buildersFor(MenuSlots, [Position.mixin], { input: { id: 'file' }, h })
    const mount = Attributes.find(b.panel.attrs(), 'OnMount')
    expect(mount?.action.name).toContain('Anchor')
    expect(mount?.action.args).toEqual({
      buttonId: 'file-button',
      anchor: { placement: 'bottom-start', gap: 4 },
    })
    expect(b.button.attrs()).toEqual([])
  })

  it('refuses a slot that is not a container', () => {
    expect(() =>
      Anchor.behavior(MenuSlots)<Input, TestMessage>({
        floating: 'button',
        config: () => ({ buttonId: 'x', anchor: {} }),
      }),
    ).toThrow(/capability/)
  })
})
