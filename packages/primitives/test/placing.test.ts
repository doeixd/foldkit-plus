import { describe, expect, it } from 'vitest'
import { Attributes, Capability, Slot, Slots, SlotView } from 'foldkit-mixins'
import { Placing } from '../src/interaction/index.js'

const PanelSlots = Slots.define({
  panel: Slot.make({ capability: Capability.Container }),
})

const h = SlotView.inertBuilder<never>()

const panelOf = () => {
  const builders = SlotView.buildersFor(
    PanelSlots,
    [Placing.keepWithin(PanelSlots)<Record<string, never>, never>({ panel: 'panel' }).mixin],
    {
      input: {},
      h,
    },
  )
  return builders.panel.attrs([])
}

describe('placeFor', () => {
  it('holds still inside the window', () => {
    expect(
      Placing.placeFor(
        { top: 100, right: 800, bottom: 300, height: 200 },
        { width: 1024, height: 768 },
      ),
    ).toEqual({ dx: 0, flip: false })
  })

  it('moves left by the overflow plus a breath', () => {
    expect(
      Placing.placeFor(
        { top: 100, right: 1100, bottom: 300, height: 200 },
        { width: 1024, height: 768 },
      ),
    ).toEqual({ dx: -84, flip: false })
  })

  it('flips above when the bottom clears and the room overhead fits', () => {
    expect(
      Placing.placeFor(
        { top: 600, right: 400, bottom: 800, height: 200 },
        { width: 1024, height: 768 },
      ),
    ).toEqual({ dx: 0, flip: true })
  })

  it('stays below when nothing overhead fits', () => {
    expect(
      Placing.placeFor(
        { top: 100, right: 400, bottom: 800, height: 700 },
        { width: 1024, height: 768 },
      ),
    ).toEqual({ dx: 0, flip: false })
  })
})

describe('keepWithin', () => {
  it('mounts the panel for edge avoidance', () => {
    const mount = Attributes.find(panelOf(), 'OnMount') as unknown as {
      readonly action?: { readonly name?: string }
    }
    expect(mount?.action?.name).toContain('KeepWithin')
  })
})
