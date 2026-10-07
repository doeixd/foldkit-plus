import { describe, expect, it } from 'vitest'
import { Attributes, Capability, Slot, Slots, SlotView } from 'foldkit-mixins'
import { Overlay } from '../src/interaction/index.js'
import { bundle as stackBundle } from '../src/interaction/dismiss-layer.js'
import { Bundle } from 'foldkit-bundle'

const Stack = Bundle.declare(stackBundle, 'layers')

const OverlaySlots = Slots.define({
  layer: Slot.make({ capability: Capability.Container }),
  trigger: Slot.make({ capability: Capability.Interactive }),
})

interface Input {
  readonly open: boolean
}

const h = SlotView.inertBuilder<never>()

const layerOf = (policy: Overlay.Policy, input: Input = { open: true }) => {
  const builders = SlotView.buildersFor(
    OverlaySlots,
    Overlay.behaviors(OverlaySlots)<Input, never, 'layers'>({
      stack: Stack,
      layer: 'layer',
      trigger: 'trigger',
      id: () => 'panel',
      policy,
    }).map(behavior => behavior.mixin),
    { input, h },
  )
  return builders.layer.attrs([])
}

describe('Overlay policy', () => {
  it('marks the layer and its trigger for the stack', () => {
    const layer = layerOf(Overlay.modal)
    expect(Attributes.find(layer, 'Attribute')).toBeDefined()
  })

  it('modal mounts focus, scroll lock, and inertness', () => {
    const layer = layerOf(Overlay.modal)
    const mount = Attributes.find(layer, 'OnMount') as unknown as {
      readonly action?: { readonly name?: string }
    }
    expect(mount?.action?.name).toContain('FocusScope')
    expect(mount?.action?.name).toContain('ScrollLock')
    expect(mount?.action?.name).toContain('HideOutside')
    expect(JSON.stringify(mount)).toContain('"contain":true')
  })

  it('nonModal mounts focus but neither scroll lock nor inertness', () => {
    const layer = layerOf(Overlay.nonModal)
    const mount = Attributes.find(layer, 'OnMount') as unknown as {
      readonly action?: { readonly name?: string }
    }
    expect(mount?.action?.name).toContain('FocusScope')
    expect(mount?.action?.name).not.toContain('ScrollLock')
    expect(mount?.action?.name).not.toContain('HideOutside')
    expect(JSON.stringify(mount)).toContain('"contain":false')
  })

  it('a policy that dismisses on nothing marks both opt-outs', () => {
    const layer = layerOf({
      dismiss: { outside: false, escape: false },
      focus: { contain: false, restore: true },
      scroll: { lock: false },
      inert: false,
    })
    const text = JSON.stringify(layer)
    expect(text).toContain('data-foldkit-plus-layer-outside')
    expect(text).toContain('data-foldkit-plus-layer-escape')
  })
})
