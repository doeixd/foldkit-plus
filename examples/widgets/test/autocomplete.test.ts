import { describe, expect, it } from 'vitest'
import { Attributes, SlotView } from 'foldkit-mixins'
import { Inert } from 'foldkit-mixins/testing'
import { DismissLayer } from 'foldkit-primitives/interaction'
import { Stack, initial, matching, update, type Message } from '../src/autocomplete/app.js'
import {
  Autocomplete,
  AutocompleteOverlay,
  AutocompleteSlots,
  runDemo,
} from '../src/autocomplete/view.js'

const dismissOpen = (model: typeof initial.model) =>
  update(
    model,
    Stack.wrapper.make(
      DismissLayer.Message.PressedAt({
        layers: [{ id: 'fruit-popup', outside: true, escape: true }],
        inside: [],
      }),
    ),
  ).model

describe('update flows', () => {
  it('starts shut with the whole orchard', () => {
    expect(initial.model.open).toBe(false)
    expect(initial.model.picked).toBe(null)
    expect(matching(initial.model.query)).toHaveLength(8)
  })

  it('typing opens and narrows', () => {
    const model = update(initial.model, { _tag: 'Queried', text: 'berry' }).model
    expect(model.open).toBe(true)
    expect(matching(model.query)).toEqual(['blackberry', 'blueberry'])
  })

  it('picking fills the query, records, and closes', () => {
    const typed = update(initial.model, { _tag: 'Queried', text: 'ap' }).model
    const picked = update(typed, { _tag: 'PickedOption', id: 'apricot' }).model
    expect(picked.query).toBe('apricot')
    expect(picked.picked).toBe('apricot')
    expect(picked.open).toBe(false)
    expect(picked.fruitPick.selected).toEqual(['apricot'])
  })

  it('dismissing closes without picking', () => {
    const typed = update(initial.model, { _tag: 'Queried', text: 'ap' }).model
    const shut = dismissOpen(typed)
    expect(shut.open).toBe(false)
    expect(shut.picked).toBe(null)
    expect(shut.query).toBe('ap')
  })
})

describe('view structure', () => {
  it('ties the input to its label and hides the popup when shut', () => {
    const page = Inert.draw(Autocomplete, initial.model)
    const input =
      page !== null && page !== undefined ? Inert.byRole(page, 'combobox')[0] : undefined
    expect(Inert.value(input, 'aria-labelledby')).toBe('fruit-label')
    expect(Inert.byRole(page, 'listbox')).toHaveLength(0)
  })

  it('draws the matching options and the pick', () => {
    const typed = update(initial.model, { _tag: 'Queried', text: 'berry' }).model
    const page = Inert.draw(Autocomplete, typed)
    expect(Inert.byTag(page, 'button')).toHaveLength(2)
    const repicked = update(typed, { _tag: 'PickedOption', id: 'blueberry' }).model
    expect(Inert.text(Inert.draw(Autocomplete, repicked))).toContain('Picked: blueberry.')
  })

  it('the popup carries the nonModal policy mounts and no opt-outs', () => {
    const h = SlotView.inertBuilder<Message>()
    const builders = SlotView.buildersFor(
      AutocompleteSlots,
      AutocompleteOverlay.map(behavior => behavior.mixin),
      { input: update(initial.model, { _tag: 'Queried', text: 'a' }).model, h },
    )
    const mount = Attributes.find(builders.list.attrs([]), 'OnMount') as unknown as {
      readonly action?: { readonly name?: string }
    }
    expect(mount?.action?.name).toContain('FocusScope')
    expect(mount?.action?.name).not.toContain('ScrollLock')
    expect(mount?.action?.name).not.toContain('HideOutside')
    const text = JSON.stringify(builders.list.attrs([]))
    expect(text).not.toContain('data-foldkit-plus-layer-outside')
    expect(text).not.toContain('data-foldkit-plus-layer-escape')
  })
})

describe('demo', () => {
  it('traces type and pick', () => {
    expect(runDemo()).toEqual([
      'start: shown=8 picked=null',
      'typed ap: shown=2 open=true',
      'picked apricot: query=apricot open=false picked=apricot',
    ])
  })
})
