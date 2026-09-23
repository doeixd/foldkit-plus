/**
 * Selection: single replaces (and deselects only with allowEmpty), multiple
 * toggles, none ignores, a range extends from the anchor in the given order
 * and keeps other picks, Replaced and Cleared; the Behavior writes
 * aria-selected and aria-multiselectable and wires a click on enabled items.
 */
import { Option, Schema } from 'effect'
import { defineMessageUnion } from 'foldkit/message'
import { Bundle } from 'foldkit-bundle'
import { Attributes, Behaviors, Capability, Slot, Slots, SlotView } from 'foldkit-mixins'
import { describe, expect, it } from 'vitest'
import { Selection } from '../src/interaction/index.js'

const Picks = Bundle.declare(Selection.bundle, 'picks')
const Model = Schema.Struct({ ...Picks.fields })
type Model = typeof Model.Type
const Message = defineMessageUnion({ ...Picks.cases })
type Message = typeof Message.Type
const Page = Bundle.parent({ Model, Message })
const place = (args: Selection.Args) => Page.at(Picks, { args })
const fresh: Model = { picks: { selected: [], anchor: null } }
const M = Selection.Message
const order = ['a', 'b', 'c', 'd']

const run = (args: Selection.Args, model: Model, ...messages: ReadonlyArray<Selection.Message>) => {
  const placed = place(args)
  return messages.reduce(
    (state, message) => Option.getOrThrow(placed.update(state, Picks.wrapper.make(message))).model,
    model,
  ).picks
}

describe('Selection.between', () => {
  it('spans anchor to target inclusive in the order given, either direction', () => {
    expect(Selection.between(order, 'b', 'd')).toEqual(['b', 'c', 'd'])
    expect(Selection.between(order, 'd', 'b')).toEqual(['b', 'c', 'd'])
    expect(Selection.between(order, null, 'c')).toEqual(['c'])
    expect(Selection.between(order, 'gone', 'c')).toEqual(['c'])
    expect(Selection.between(order, 'a', 'gone')).toEqual([])
  })
})

describe('Selection placement', () => {
  it('single mode replaces, and deselects only with allowEmpty', () => {
    const strict = { mode: 'single', allowEmpty: false } as const
    expect(run(strict, fresh, M.Activated({ id: 'a' }), M.Activated({ id: 'b' }))).toEqual({
      selected: ['b'],
      anchor: 'b',
    })
    expect(run(strict, fresh, M.Activated({ id: 'a' }), M.Activated({ id: 'a' })).selected).toEqual(
      ['a'],
    )
    const loose = { mode: 'single', allowEmpty: true } as const
    expect(run(loose, fresh, M.Activated({ id: 'a' }), M.Activated({ id: 'a' })).selected).toEqual(
      [],
    )
  })

  it('multiple mode toggles and ranges from the anchor, keeping other picks', () => {
    const multi = { mode: 'multiple', allowEmpty: true } as const
    expect(run(multi, fresh, M.Activated({ id: 'a' }), M.Activated({ id: 'c' })).selected).toEqual([
      'a',
      'c',
    ])
    expect(run(multi, fresh, M.Activated({ id: 'a' }), M.Activated({ id: 'a' })).selected).toEqual(
      [],
    )
    const ranged = run(
      multi,
      fresh,
      M.Activated({ id: 'd' }),
      M.Activated({ id: 'b' }),
      M.Ranged({ id: 'c', order }),
    )
    expect(ranged).toEqual({ selected: ['d', 'b', 'c'], anchor: 'b' })
    expect(run(multi, fresh, M.Ranged({ id: 'c', order })).selected).toEqual(['c'])
  })

  it('none mode selects nothing, and Replaced and Cleared apply', () => {
    const none = { mode: 'none', allowEmpty: true } as const
    expect(run(none, fresh, M.Activated({ id: 'a' }), M.Replaced({ ids: ['a'] })).selected).toEqual(
      [],
    )
    const multi = { mode: 'multiple', allowEmpty: true } as const
    expect(run(multi, fresh, M.Replaced({ ids: ['b', 'b', 'a'] })).selected).toEqual(['b', 'a'])
    expect(run(multi, fresh, M.Replaced({ ids: ['b'] }), M.Cleared()).selected).toEqual([])
    expect(
      run({ mode: 'single', allowEmpty: false }, fresh, M.Ranged({ id: 'c', order })).selected,
    ).toEqual([])
  })
})

describe('Selection.behavior', () => {
  interface Fruit {
    readonly id: string
    readonly disabled?: boolean
  }
  const fruits: ReadonlyArray<Fruit> = [{ id: 'a' }, { id: 'b', disabled: true }, { id: 'c' }]
  const describe_ = (items: ReadonlyArray<Fruit>) =>
    Behaviors.Collection.of(items, { id: f => f.id, disabled: f => f.disabled === true })
  const ListSlots = Slots.define({
    list: Slot.make({ capability: Capability.Container }),
    option: Slot.make({ capability: Capability.Interactive }),
  })
  interface ListInput extends Model {
    readonly fruits: ReadonlyArray<Fruit>
  }
  const h = SlotView.inertBuilder<Message>()
  const wire = (args: Selection.Args, click?: boolean) =>
    Selection.behavior(Picks, args)(ListSlots)<ListInput, Message>({
      container: 'list',
      item: 'option',
      items: input => describe_(input.fruits),
      ...(click === undefined ? {} : { click }),
    })
  const input: ListInput = { picks: { selected: ['c'], anchor: 'c' }, fruits }
  const items = describe_(fruits)

  it('says the selection in ARIA and wires a click on enabled items', () => {
    const b = SlotView.buildersFor(
      ListSlots,
      [wire({ mode: 'multiple', allowEmpty: true }).mixin],
      { input, h },
    )
    expect(Attributes.find(b.list.attrs(), 'AriaMultiSelectable')?.value).toBe(true)
    const a = b.option.attrs([], items.slotItem(0))
    expect(Attributes.find(a, 'AriaSelected')?.value).toBe(false)
    expect(Attributes.find(a, 'OnClick')?.message).toEqual(
      Picks.wrapper.make(M.Activated({ id: 'a' })),
    )
    const disabled = b.option.attrs([], items.slotItem(1))
    expect(Attributes.find(disabled, 'OnClick')).toBeUndefined()
    expect(Attributes.find(b.option.attrs([], items.slotItem(2)), 'AriaSelected')?.value).toBe(true)
  })

  it('single mode is not multiselectable, and click can be left to the view', () => {
    const b = SlotView.buildersFor(
      ListSlots,
      [wire({ mode: 'single', allowEmpty: false }, false).mixin],
      { input, h },
    )
    expect(Attributes.find(b.list.attrs(), 'AriaMultiSelectable')?.value).toBe(false)
    expect(Attributes.find(b.option.attrs([], items.slotItem(0)), 'OnClick')).toBeUndefined()
  })
})
