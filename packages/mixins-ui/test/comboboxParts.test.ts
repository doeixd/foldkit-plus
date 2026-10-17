/**
 * Combobox.parts: an option's label with each stretch matching the typed
 * text marked, ignoring case, every element in a Slot.
 */
import { describe, expect, it } from 'vitest'
import { Style, SlotView } from 'foldkit-mixins'
import { Inert } from 'foldkit-mixins/testing'
import { Combobox, ComboboxSlots, Recipes } from '../src/index.js'
import { h, type TestMessage } from './fixture.js'

describe('Combobox.parts', () => {
  const style = Style.forSlots(ComboboxSlots)(Recipes.Combobox({}))
  const label = (text: string, query: string) =>
    Inert.byTag(Combobox.parts([style.mixin], { h }).option({ label: text }, query), 'span')[2]

  it.each([
    ['nothing while nothing is typed', 'Banana', '', []],
    ['each stretch that matches, ignoring case', 'Banana', 'AN', ['an', 'an']],
    ['the typed text trimmed', 'Oslo', ' os ', ['Os']],
    ['nothing that does not match', 'Oslo', 'x', []],
  ])('marks %s', (_, text, query, marks) => {
    const drawn = label(text, query)
    expect(Inert.byTag(drawn, 'mark').map(Inert.text)).toEqual(marks)
    expect(Inert.text(drawn)).toBe(text)
  })

  it('draws every element of an option in a Slot', () => {
    const Drawn = SlotView.forMessages<TestMessage>().define(ComboboxSlots, (_: undefined, __, h) =>
      Combobox.parts([style.mixin], { h }).option({ label: 'Oslo', description: 'Norway' }, 'os'),
    )
    expect(Inert.unslotted(Inert.draw(Drawn, undefined))).toEqual([])
  })
})
