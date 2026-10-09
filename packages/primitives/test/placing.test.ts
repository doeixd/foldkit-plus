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

describe('placeAt', () => {
  const trigger = { left: 180, top: 40, bottom: 72, width: 64, height: 32 }
  const origin = { left: 20, top: 16 }

  it('sits under the trigger, a gap below its left edge', () => {
    expect(Placing.placeAt(trigger, origin)).toEqual({ left: 160, top: 60 })
  })

  it('uses the gap it is given', () => {
    expect(Placing.placeAt(trigger, origin, 8).top).toBe(64)
  })

  it('stays at the origin when the trigger has no size', () => {
    expect(
      Placing.placeAt({ left: 0, top: 0, bottom: 0, width: 0, height: 0 }, { left: 0, top: 0 }),
    ).toEqual({ left: 0, top: 0 })
  })
})

const placedPanel = () => {
  const builders = SlotView.buildersFor(
    PanelSlots,
    [
      Placing.placeAtTrigger(PanelSlots)<{ readonly triggerId: string }, never>({
        panel: 'panel',
        triggerId: input => input.triggerId,
      }).mixin,
    ],
    { input: { triggerId: 'edit' }, h },
  )
  return builders.panel.attrs([])
}

describe('keepWithin', () => {
  it('mounts the panel for edge avoidance', () => {
    const mount = Attributes.find(panelOf(), 'OnMount') as unknown as {
      readonly action?: { readonly name?: string }
    }
    expect(mount?.action?.name).toContain('KeepWithin')
  })
})

describe('placeAtTrigger', () => {
  it('mounts the panel against the open trigger', () => {
    const mount = Attributes.find(placedPanel(), 'OnMount') as unknown as {
      readonly action?: { readonly name?: string; readonly args?: { readonly triggerId?: string } }
    }
    expect(mount?.action?.name).toContain('PlaceAt')
    expect(mount?.action?.args?.triggerId).toBe('edit')
  })
})
