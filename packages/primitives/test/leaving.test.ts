// @vitest-environment jsdom
/**
 * `leaving` writes the attribute the `Leaving` Mount reads, and the Behavior
 * mounts that Mount on the named container.
 */
import { type Attribute, inertHtml as h } from 'foldkit/html'
import { Attributes, Capability, Slot, Slots, SlotView } from 'foldkit-mixins'
import { describe, expect, it } from 'vitest'
import { LEAVING, leaving } from '../src/dom/leaving.js'
import { Leaving } from '../src/interaction/index.js'

const attributesOf = (attributes: ReadonlyArray<Attribute<never>>) => {
  const node = h.li(attributes, [])
  return { ...node?.data?.attrs, ...node?.data?.props }
}

describe('leaving', () => {
  it('marks the element with the attribute the Mount reads', () => {
    expect(LEAVING).toBe('data-fk-leaving')
    expect(attributesOf(leaving<never>(h))).toEqual({ [LEAVING]: '' })
  })
})

describe('Leaving behavior', () => {
  const SlotsFor = Slots.define({
    list: Slot.make({ capability: Capability.Container }),
  })
  type Message = { readonly _tag: 'Closed' }

  it('mounts Leaving on the slot named', () => {
    const mounted = Leaving.behavior(SlotsFor)<unknown, Message>({ container: 'list' })
    const builders = SlotView.buildersFor(SlotsFor, [mounted.mixin], {
      input: undefined,
      h: SlotView.inertBuilder<Message>(),
    })
    expect(Attributes.find(builders.list.attrs(), 'OnMount')?.action.name).toContain('Leaving')
  })
})
