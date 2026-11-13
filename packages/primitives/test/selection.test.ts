/**
 * Selection: single replaces (and deselects only with allowEmpty), multiple
 * toggles, none ignores, a range extends from the anchor in the given order
 * and takes back what the previous range added, Replaced and Cleared; the Behavior writes
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
const fresh: Model = { picks: { selected: [], anchor: null, ranged: [] } }
const M = Selection.Message
const order = ['a', 'b', 'c', 'd', 'e']

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
      ranged: [],
    })
    expect(run(strict, fresh, M.Activated({ id: 'a' }), M.Activated({ id: 'a' })).selected).toEqual(
      ['a'],
    )
    const loose = { mode: 'single', allowEmpty: true } as const
    expect(run(loose, fresh, M.Activated({ id: 'a' }), M.Activated({ id: 'a' })).selected).toEqual(
      [],
    )
  })

  it('refuses replacing a single selection with more than one distinct id, keeping the Model', () => {
    const args = { mode: 'single', allowEmpty: false } as const
    const initial = { selected: ['a'], anchor: 'a', ranged: [] }
    const replace = Bundle.helpersOf(Selection.bundle, args).replace

    expect(Selection.bundle.update(initial, M.Replaced({ ids: ['a', 'b'] }), args).model).toBe(
      initial,
    )
    expect(replace(initial, ['a', 'b']).model).toBe(initial)
    expect(replace(initial, ['a', 'a']).model).toBe(initial)
    expect(replace(initial, []).model).toEqual({ selected: [], anchor: 'a', ranged: [] })
    expect(Selection.bundle.update(initial, M.Cleared(), args).model.selected).toEqual([])
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
    expect(run(multi, fresh, M.Ranged({ id: 'c', order })).selected).toEqual(['c'])
  })

  describe('ranges', () => {
    const multi = { mode: 'multiple', allowEmpty: true } as const
    const from = (id: string) => M.Activated({ id })
    const to = (id: string) => M.Ranged({ id, order })

    it('shrinks: a shorter range from the same anchor takes back what the last added', () => {
      expect(run(multi, fresh, from('a'), to('d'), to('b'))).toEqual({
        selected: ['a', 'b'],
        anchor: 'a',
        ranged: ['b'],
      })
    })

    it('grows: a longer range adds the rest', () => {
      expect(run(multi, fresh, from('a'), to('b'), to('d'))).toEqual({
        selected: ['a', 'b', 'c', 'd'],
        anchor: 'a',
        ranged: ['b', 'c', 'd'],
      })
    })

    it('crossing the anchor swaps sides', () => {
      expect(run(multi, fresh, from('c'), to('e'), to('a')).selected).toEqual(['c', 'a', 'b'])
    })

    it('keeps an id picked before the range, even inside it', () => {
      const picked = run(multi, fresh, from('e'), from('c'), to('d'))
      expect(picked).toEqual({ selected: ['e', 'c', 'd'], anchor: 'c', ranged: ['d'] })
      expect(run(multi, fresh, from('e'), from('b'), from('c'), to('e'), to('c')).selected).toEqual(
        ['e', 'b', 'c'],
      )
    })

    it('a non-range transition forgets the range, so a later one keeps it', () => {
      const ranged = [from('a'), to('c')]
      expect(run(multi, fresh, ...ranged, from('e')).ranged).toEqual([])
      expect(run(multi, fresh, ...ranged, M.Replaced({ ids: ['a', 'b', 'c'] })).ranged).toEqual([])
      expect(run(multi, fresh, ...ranged, M.Cleared()).ranged).toEqual([])
      // Activating e starts a new anchor; the first range's ids are ordinary picks now.
      expect(run(multi, fresh, ...ranged, from('e'), to('d')).selected).toEqual([
        'a',
        'b',
        'c',
        'e',
        'd',
      ])
    })

    it('select all is Replaced with every id', () => {
      expect(run(multi, fresh, from('b'), to('c'), M.Replaced({ ids: order })).selected).toEqual(
        order,
      )
    })

    it('Replaced with the same ids still forgets the range, and a repeat range is a no-op', () => {
      const placed = Selection.bundle
      const state = { selected: ['a', 'b'], anchor: 'a', ranged: ['b'] }
      const replaced = placed.update(state, M.Replaced({ ids: ['a', 'b'] }), multi).model
      expect(replaced).toEqual({ selected: ['a', 'b'], anchor: 'a', ranged: [] })
      expect(placed.update(state, M.Ranged({ id: 'b', order }), multi).model).toBe(state)
      expect(placed.update(fresh.picks, M.Cleared(), multi).model).toBe(fresh.picks)
    })

    it('a range outside multiple mode changes nothing', () => {
      const single = { mode: 'single', allowEmpty: false } as const
      expect(run(single, fresh, from('a'), to('c'))).toEqual({
        selected: ['a'],
        anchor: 'a',
        ranged: [],
      })
      expect(run({ mode: 'none', allowEmpty: true }, fresh, to('c'))).toEqual(fresh.picks)
    })
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
  const input: ListInput = { picks: { selected: ['c'], anchor: 'c', ranged: [] }, fruits }
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
