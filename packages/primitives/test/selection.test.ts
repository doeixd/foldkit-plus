/**
 * SelectionSet: select, deselect, toggle, replace-all, and clear over string
 * ids, first-selection order, deduped. Pure logic, no streams.
 */
import { Option, Schema } from 'effect'
import { defineMessageUnion } from 'foldkit/message'
import { Bundle } from 'foldkit-bundle'
import { describe, expect, it } from 'vitest'
import { isSelected, SelectionSet, SelectionSetMessage } from '../src/state/index.js'

const Picked = Bundle.declare(SelectionSet, 'picked')
const Model = Schema.Struct({ ...Picked.fields })
type Model = typeof Model.Type
const Message = defineMessageUnion({ ...Picked.cases })
type Message = typeof Message.Type
const Page = Bundle.parent({ Model, Message })
const placed = Page.at(Picked)
const empty: Model = { picked: { selected: [] } }

const fold = (model: Model, message: Parameters<typeof Picked.wrapper.make>[0]) =>
  Option.getOrThrow(placed.update(model, Picked.wrapper.make(message))).model.picked

describe('SelectionSet transitions', () => {
  it('starts empty and selects in first-selection order', () => {
    expect(placed.init(empty).model.picked).toEqual({ selected: [] })
    const ab = fold(
      { picked: fold(empty, SelectionSetMessage.Select({ id: 'a' })) },
      SelectionSetMessage.Select({ id: 'b' }),
    )
    expect(ab).toEqual({ selected: ['a', 'b'] })
    // Re-selecting keeps position; toggling moves to the end.
    expect(fold({ picked: ab }, SelectionSetMessage.Select({ id: 'a' }))).toEqual(ab)
    expect(isSelected(ab, 'a')).toBe(true)
    expect(isSelected(ab, 'z')).toBe(false)
  })

  it('toggles off and back on', () => {
    const ab = { picked: { selected: ['a', 'b'] } }
    expect(fold(ab, SelectionSetMessage.Toggle({ id: 'a' }))).toEqual({ selected: ['b'] })
    expect(fold(ab, SelectionSetMessage.Toggle({ id: 'z' }))).toEqual({ selected: ['a', 'b', 'z'] })
  })

  it('replaces whole (deduped) and clears', () => {
    const ab = { picked: { selected: ['a', 'b'] } }
    expect(fold(ab, SelectionSetMessage.ReplaceAll({ ids: ['b', 'b', 'c'] }))).toEqual({
      selected: ['b', 'c'],
    })
    expect(fold(ab, SelectionSetMessage.Deselect({ id: 'a' }))).toEqual({ selected: ['b'] })
    expect(fold(ab, SelectionSetMessage.Clear())).toEqual({ selected: [] })
  })
})

describe('SelectionSet in an assembly', () => {
  it('routes its Messages', () => {
    const assembly = Page.assemble(Page.at(Picked))
    const update = assembly.update(model => ({ model }))
    const toggled = update(empty, Picked.wrapper.make(SelectionSetMessage.Toggle({ id: 'a' })))
    expect(toggled.model.picked).toEqual({ selected: ['a'] })
  })
})
