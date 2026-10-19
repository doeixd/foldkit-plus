/// <reference types="@vitest/browser-playwright" />
/**
 * The Combobox's own parts in a real browser: the panel is as wide as the
 * field by default, an option marks the text typed, a search with no match
 * shows the empty panel in the top layer, the chosen values are chips the
 * remove button takes back, and the clear button empties the field while
 * the field keeps the focus.
 */
import { Schema } from 'effect'
import * as UpstreamCombobox from '@foldkit/ui/combobox'
import * as Command from 'foldkit/command'
import type { HtmlBuilder } from 'foldkit/html'
import { defineMessageUnion } from 'foldkit/message'
import * as Runtime from 'foldkit/runtime'
import { modifyFields } from 'foldkit/struct'
import { Layers, Style } from 'foldkit-mixins'
import { Defaults } from 'foldkit-mixins/defaults'
import { Theme } from 'foldkit-mixins/theme'
import { afterEach, expect, test, vi } from 'vitest'
import { userEvent } from 'vitest/browser'
import { Combobox, ComboboxSlots, ComboboxView, Recipes } from '../src/index.js'

const theme = Theme.standard(Theme.make({ accent: { hue: 265, chroma: 0.16 } }))
const style = Style.forSlots(ComboboxSlots)(Recipes.Combobox({}))
const Cities = ComboboxView.Multi.create<string>()
const cities = ['Kyiv', 'Lagos', 'Lima', 'Oslo', 'Osaka']

const Model = Schema.Struct({
  combobox: UpstreamCombobox.Multi.Model,
  chosen: Schema.Array(Schema.String),
})
type Model = typeof Model.Type
const Message = defineMessageUnion({ Got: { message: UpstreamCombobox.Message } })
type Message = typeof Message.Type

let handle: { dispose: () => void } | undefined

afterEach(() => {
  handle?.dispose()
  handle = undefined
  document.head.querySelectorAll('style[data-test]').forEach(element => element.remove())
  document.body.replaceChildren()
})

const mount = (chosen: ReadonlyArray<string> = []) => {
  const sheet = document.createElement('style')
  sheet.dataset['test'] = ''
  sheet.textContent =
    Style.stylesheet(
      Layers.standard.declare,
      Layers.standard.in('reset', Defaults.reset),
      Layers.standard.in('theme', Theme.root(theme)),
    ) + style.css
  document.head.append(sheet)
  const container = document.createElement('div')
  container.id = 'combobox-parts-browser'
  // A clipping box the panels must paint past: they are in the top layer.
  const box = document.createElement('div')
  box.style.overflow = 'hidden'
  box.style.blockSize = '5rem'
  box.style.inlineSize = '20rem'
  box.append(container)
  document.body.append(box)
  const view = (model: Model, h: HtmlBuilder<Message>) =>
    h.submodel({
      slotId: model.combobox.id,
      model: model.combobox,
      view: Cities.view,
      viewInputs: {
        anchor: { placement: 'bottom-start', gap: 4, padding: 8, portal: false },
        items: cities.filter(city =>
          city.toLowerCase().includes(model.combobox.inputValue.toLowerCase()),
        ),
        restingInputValue: '',
        selectedValues: model.chosen,
        itemToConfig: (city: string) => ({
          content: Combobox.parts([style.mixin], { h }).option(
            { label: city },
            model.combobox.inputValue,
          ),
        }),
        itemToValue: (city: string) => city,
        itemToDisplayText: (city: string) => city,
        ariaLabel: 'City',
        empty: h.span([], ['No cities match']),
        clearContent: h.span([], ['×']),
        chips: {},
        toView: Combobox.toView([style.mixin], { h }),
      },
      toParentMessage: message => Message.Got({ message }),
    })
  handle = Runtime.embed(
    Runtime.makeElement({
      Model,
      container,
      init: () => ({
        model: { combobox: UpstreamCombobox.Multi.init({ id: 'city' }), chosen },
      }),
      update: (model: Model, message: Message) =>
        Message.match(message, {
          Got: ({ message }) => {
            const next = Cities.update(model.combobox, message)
            const chosenNow =
              next.outMessage === undefined
                ? model.chosen
                : UpstreamCombobox.OutMessage.match(next.outMessage, {
                    Selected: ({ value }) =>
                      model.chosen.includes(value)
                        ? model.chosen.filter(each => each !== value)
                        : [...model.chosen, value],
                    ClearedSelection: () => [],
                  })
            return {
              model: modifyFields(model, {
                combobox: () => next.model,
                chosen: () => chosenNow,
              }),
              commands: Command.mapMessages(next.commands ?? [], message =>
                Message.Got({ message }),
              ),
            }
          },
        }),
      view,
    }),
  )
}

const input = () => document.getElementById('city-input') as HTMLInputElement

test('an option-less search shows the empty panel in the top layer, as wide as the field', async () => {
  mount()
  await vi.waitFor(() => expect(document.getElementById('city-input')).not.toBeNull())
  input().focus()
  await userEvent.keyboard('zz')
  await vi.waitFor(() =>
    expect(document.getElementById('city-empty')?.textContent).toBe('No cities match'),
  )
  const empty = document.getElementById('city-empty')!
  expect(empty.getAttribute('role')).toBe('status')
  expect(empty.matches(':popover-open')).toBe(true)
  const field = document.getElementById('city-input-wrapper')!.getBoundingClientRect()
  await vi.waitFor(() =>
    expect(empty.getBoundingClientRect().width).toBeGreaterThanOrEqual(field.width - 0.5),
  )
})

test('an option marks the text typed, whatever its case', async () => {
  mount()
  await vi.waitFor(() => expect(document.getElementById('city-input')).not.toBeNull())
  input().focus()
  await userEvent.keyboard('OS')
  await vi.waitFor(() => expect(document.querySelectorAll('[role="option"]')).toHaveLength(3))
  expect(
    [...document.querySelectorAll('[role="option"] mark')].map(mark => mark.textContent),
  ).toEqual(['os', 'Os', 'Os'])
  // The list is at least as wide as the field, by default.
  const field = document.getElementById('city-input-wrapper')!.getBoundingClientRect()
  await vi.waitFor(() =>
    expect(
      document.getElementById('city-items')!.getBoundingClientRect().width,
    ).toBeGreaterThanOrEqual(field.width - 0.5),
  )
  const mark = document.querySelector('[role="option"] mark')!
  expect(getComputedStyle(mark).fontWeight).not.toBe(
    getComputedStyle(mark.parentElement!).fontWeight,
  )
})

test('the chosen values are chips, and a remove button takes one back', async () => {
  mount(['Lima', 'Oslo'])
  await vi.waitFor(() => expect(document.querySelectorAll('li')).toHaveLength(2))
  expect([...document.querySelectorAll('li')].map(chip => chip.firstChild?.textContent)).toEqual([
    'Lima',
    'Oslo',
  ])
  // The chips sit in the field, before the input.
  const field = document.getElementById('city-input-wrapper')!
  expect(field.contains(document.querySelector('ul'))).toBe(true)
  await userEvent.click(document.querySelector('[aria-label="Remove Lima"]')!)
  await vi.waitFor(() =>
    expect([...document.querySelectorAll('li')].map(chip => chip.firstChild?.textContent)).toEqual([
      'Oslo',
    ]),
  )
})

test('the clear button shows while there is text, and empties the field keeping its focus', async () => {
  mount()
  await vi.waitFor(() => expect(document.getElementById('city-input')).not.toBeNull())
  expect(document.querySelector('[aria-label="Clear"]')).toBeNull()
  input().focus()
  await userEvent.keyboard('Os')
  await vi.waitFor(() => expect(document.querySelector('[aria-label="Clear"]')).not.toBeNull())
  await userEvent.click(document.querySelector('[aria-label="Clear"]')!)
  await vi.waitFor(() => expect(input().value).toBe(''))
  expect(document.activeElement).toBe(input())
  await vi.waitFor(() => expect(document.querySelector('[aria-label="Clear"]')).toBeNull())
})
