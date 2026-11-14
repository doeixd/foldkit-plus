/**
 * SearchField as markup: a native search input named by the label, a clear
 * button only while there is text, Escape and the application's keys through
 * one keydown owner, and a disabled field sending nothing.
 */
import { Option, Schema } from 'effect'
import type { HtmlBuilder } from 'foldkit/html'
import { defineMessageUnion } from 'foldkit/message'
import { Scene } from 'foldkit/test'
import { describe, expect, it } from 'vitest'
import { A11y, SlotView, Style } from 'foldkit-mixins'
import { Inert } from 'foldkit-mixins/testing'
import { Recipes, SearchField, SearchFieldSlots } from '../src/index.js'
import { SearchFieldPattern } from '../src/searchField.js'
import { diagnosticFrom, h, message, sends, type TestMessage } from './fixture.js'

const Searched = defineMessageUnion({
  Typed: { text: Schema.String },
  Cleared: {},
  Opened: {},
})
type Searched = typeof Searched.Type

const style = Style.forSlots(SearchFieldSlots)(Recipes.SearchField({}))

const drawn = (value: string, extra: Partial<SearchField.SearchFieldView<TestMessage>> = {}) =>
  SearchField.view(
    {
      id: 'find',
      label: 'Search products',
      value,
      onInput: () => message('Other'),
      onClear: message('Clicked'),
      style,
      ...extra,
    },
    h,
  )

const bound = (
  h: HtmlBuilder<Searched>,
  value: string,
  extra: Partial<SearchField.SearchFieldView<Searched>> = {},
) =>
  SearchField.view(
    {
      id: 'find',
      label: 'Search products',
      value,
      onInput: text => Searched.Typed({ text }),
      onClear: Searched.Cleared(),
      ...extra,
    },
    h,
  )

const open: SearchField.Route<Searched> = {
  name: 'Open results',
  key: 'ArrowDown',
  toMessage: value => (value === '' ? Option.none() : Option.some(Searched.Opened())),
}

describe('SearchField.view', () => {
  it('meets the search field pattern', () => {
    expect(A11y.validate(SearchFieldPattern, SearchFieldSlots)).toEqual([])
  })

  it('draws a native search input named by the label, holding the text', () => {
    const [input] = Inert.byTag(drawn('lamp'), 'input')
    expect(Inert.value(input, 'type')).toBe('search')
    expect(Inert.value(input, 'id')).toBe('find-input')
    expect(Inert.value(input, 'aria-label')).toBe('Search products')
    expect(Inert.value(input, 'value')).toBe('lamp')
    expect(SearchField.inputId('find')).toBe('find-input')
  })

  it.each([
    ['', 0],
    ['lamp', 1],
  ])('draws the clear button for the text %j %i times', (value, count) => {
    expect(Inert.byTag(drawn(value), 'button')).toHaveLength(count)
  })

  it('names the clear button, in the words given', () => {
    const [clear] = Inert.byTag(drawn('lamp'), 'button')
    expect(Inert.value(clear, 'aria-label')).toBe('Clear search')
    expect(Inert.value(clear, 'type')).toBe('button')
    const [other] = Inert.byTag(drawn('lamp', { words: { clear: 'Effacer' } }), 'button')
    expect(Inert.value(other, 'aria-label')).toBe('Effacer')
  })

  it('says it is invalid, and has a placeholder, only when told', () => {
    const [plain] = Inert.byTag(drawn(''), 'input')
    expect(Inert.value(plain, 'aria-invalid')).toBeUndefined()
    expect(Inert.value(plain, 'placeholder')).toBeUndefined()
    const [told] = Inert.byTag(drawn('', { invalid: true, placeholder: 'Lamps' }), 'input')
    expect(Inert.value(told, 'aria-invalid')).toBe('true')
    expect(Inert.value(told, 'placeholder')).toBe('Lamps')
  })

  it('sends the text typed, and clears by the button', () => {
    sends(
      (h: HtmlBuilder<Searched>) => bound(h, 'lamp'),
      Scene.type(Scene.label('Search products'), 'lampshade'),
      Scene.expectOutMessage(Searched.Typed({ text: 'lampshade' })),
      Scene.click(Scene.role('button', { name: 'Clear search' })),
      Scene.expectOutMessage(Searched.Cleared()),
    )
  })

  it('clears on Escape while there is text', () => {
    sends(
      (h: HtmlBuilder<Searched>) => bound(h, 'lamp'),
      Scene.keydown(Scene.label('Search products'), 'Escape'),
      Scene.expectOutMessage(Searched.Cleared()),
    )
  })

  it('leaves Escape alone on an empty field, and any other key native', () => {
    sends(
      (h: HtmlBuilder<Searched>) => bound(h, ''),
      Scene.keydown(Scene.label('Search products'), 'Escape'),
      Scene.expectIgnored(),
    )
    sends(
      (h: HtmlBuilder<Searched>) => bound(h, 'lamp'),
      Scene.keydown(Scene.label('Search products'), 'a'),
      Scene.expectIgnored(),
    )
  })

  it("answers the application's routes through the same owner", () => {
    sends(
      (h: HtmlBuilder<Searched>) => bound(h, 'lamp', { routes: [open] }),
      Scene.keydown(Scene.label('Search products'), 'ArrowDown'),
      Scene.expectOutMessage(Searched.Opened()),
      Scene.keydown(Scene.label('Search products'), 'Escape'),
      Scene.expectOutMessage(Searched.Cleared()),
    )
  })

  it.each([
    ['a built-in', { ...open, name: 'Dismiss', key: 'Escape' }, ['Clear', 'Dismiss']],
    ['another route', { ...open, name: 'Also open' }, ['Open results', 'Also open']],
  ])('names both routes when one overlaps %s', (_, extra, names) => {
    const routes = names[0] === 'Clear' ? [extra] : [open, extra]
    const diagnostic = diagnosticFrom(() =>
      bound(SlotView.inertBuilder<Searched>(), 'lamp', { routes }),
    )
    expect(diagnostic?.code).toBe('mixins:event-conflict')
    expect(diagnostic?.details?.['contributors']).toEqual(names)
  })

  it('sends nothing once disabled, and draws no clear button', () => {
    const tree = drawn('lamp', { disabled: true })
    const [input] = Inert.byTag(tree, 'input')
    expect(Inert.value(input, 'disabled')).toBe(true)
    expect(input?.data?.on?.['input']).toBeUndefined()
    expect(input?.data?.on?.['keydown']).toBeUndefined()
    expect(Inert.byTag(tree, 'button')).toHaveLength(0)
  })

  it('is styled in its own slots', () => {
    expect(style.css).toContain('::-webkit-search-cancel-button')
  })
})
