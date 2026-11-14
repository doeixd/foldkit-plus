/**
 * `FocusRecovery.behavior`: the marks it draws (which a server render carries,
 * since they are attributes), its Mount on the owner, and what it refuses.
 */
import { Option } from 'effect'
import { Attributes, Capability, Slot, SlotView, Slots } from 'foldkit-mixins'
import { describe, expect, it } from 'vitest'
import { FocusRecovery } from '../src/interaction/index.js'

const SearchSlots = Slots.define({
  root: Slot.make({ capability: Capability.Container }),
  input: Slot.make({ capability: Capability.TextInput }),
  row: Slot.make({ capability: Capability.Focusable }),
})
interface SearchInput {
  readonly parents: Record<string, string>
}
const h = SlotView.inertBuilder<never>()

const wire = () =>
  FocusRecovery.behavior(SearchSlots)<SearchInput, never>({
    owner: 'root',
    parts: { input: [], row: ['next', { part: 'input' }] },
    parent: (input, item) =>
      Option.fromNullishOr(
        Object.hasOwn(input.parents, item.id ?? '') ? input.parents[item.id ?? ''] : undefined,
      ),
  })

const builders = (input: SearchInput) =>
  SlotView.buildersFor(SearchSlots, [wire().mixin], { input, h })

/** The `data-` attributes a slot drew, by name. */
const marks = (attributes: Parameters<typeof Attributes.filter>[0]) =>
  Object.fromEntries(
    Attributes.filter(attributes, 'DataAttribute').map(attribute => [
      attribute.key,
      attribute.value,
    ]),
  )

describe('FocusRecovery behavior', () => {
  const input: SearchInput = { parents: { child: 'parent' } }

  it('marks the owner', () => {
    expect(marks(builders(input).root.attrs())).toEqual({ 'fk-focus-owner': '' })
  })

  it('marks each part with its slot, and a row with its key and parent', () => {
    const b = builders(input)
    expect(marks(b.input.attrs())).toEqual({ 'fk-focus-part': 'input' })
    expect(marks(b.row.attrs([], { index: 1, id: 'child' }))).toEqual({
      'fk-focus-part': 'row',
      'fk-focus-key': 'child',
      'fk-focus-parent': 'parent',
    })
    expect(marks(b.row.attrs([], { index: 0, id: 'parent' }))).toEqual({
      'fk-focus-part': 'row',
      'fk-focus-key': 'parent',
    })
  })

  it('marks a slot with no steps as a part, and a slot it was not given as nothing', () => {
    const only = FocusRecovery.behavior(SearchSlots)<SearchInput, never>({
      owner: 'root',
      parts: { input: [] },
    })
    const b = SlotView.buildersFor(SearchSlots, [only.mixin], { input, h })
    expect(marks(b.input.attrs())).toEqual({ 'fk-focus-part': 'input' })
    expect(marks(b.row.attrs([], { index: 0, id: 'a' }))).toEqual({})
  })

  it('refuses an owner that is also a part', () => {
    expect(() =>
      FocusRecovery.behavior(SearchSlots)<SearchInput, never>({
        owner: 'root',
        parts: { root: [] },
      }),
    ).toThrow(/owner/)
  })

  it("attaches the Mount to the owner, with each part slot's steps, and to nothing else", () => {
    const b = builders(input)
    const mount = Attributes.find(b.root.attrs(), 'OnMount')
    expect(mount?.action.name).toContain('FocusRecovery')
    expect(mount?.action.args).toEqual({
      fallback: { input: [], row: ['next', { part: 'input' }] },
    })
    expect(Attributes.find(b.row.attrs([], { index: 0, id: 'a' }), 'OnMount')).toBeUndefined()
    expect(Attributes.find(b.input.attrs(), 'OnMount')).toBeUndefined()
  })
})
