/// <reference types="@vitest/browser-playwright" />
/**
 * The Listbox's trigger and the Combobox's field in the states a form puts
 * them in: invalid reads in the edge and is announced, a disabled one shows no
 * hover, the Combobox steps through all three sizes, its clear button keeps
 * the touch floor, and Home and End move the caret while its list is open.
 */
import { Option, Schema } from 'effect'
import { Listbox as UiListbox } from '@foldkit/ui'
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
import {
  Combobox,
  ComboboxSlots,
  ComboboxView,
  Listbox,
  ListboxSlots,
  ListboxView,
  Recipes,
} from '../src/index.js'
import { ref } from '../src/recipes/design.js'
import { unitKnobs } from './fixture.js'

const theme = Theme.standard(Theme.make({ ...unitKnobs, accent: { hue: 265, chroma: 0.16 } }))

let handle: { dispose: () => void } | undefined

afterEach(() => {
  handle?.dispose()
  handle = undefined
  document.documentElement.style.removeProperty('--fk-touch-floor')
  document.head.querySelectorAll('style[data-test]').forEach(element => element.remove())
  document.body.replaceChildren()
})

const install = (css: string) => {
  const sheet = document.createElement('style')
  sheet.dataset['test'] = ''
  sheet.textContent =
    Style.stylesheet(
      Layers.standard.declare,
      Layers.standard.in('reset', Defaults.reset),
      Layers.standard.in('theme', Theme.root(theme)),
    ) + css
  document.head.append(sheet)
}

/** A page with room around the field, for the pointer to rest elsewhere. */
const container = (id: string) => {
  const region = document.createElement('div')
  region.style.cssText = 'padding: 120px 300px'
  const box = document.createElement('div')
  box.id = id
  region.append(box)
  document.body.append(region)
  return box
}

/** The colour a probe element draws `ref.error.outline` as. */
const errorEdge = () => {
  const probe = document.createElement('div')
  probe.style.borderColor = ref.error.outline
  probe.style.borderStyle = 'solid'
  document.body.append(probe)
  const colour = getComputedStyle(probe).borderTopColor
  probe.remove()
  return colour
}

const settle = (element: Element) =>
  vi.waitFor(() => expect(element.getAnimations({ subtree: false })).toEqual([]))

// Listbox

const ListboxModel = Schema.Struct({ listbox: UiListbox.Model })
type ListboxModel = typeof ListboxModel.Type
const Frequencies = ListboxView.create<string>()

interface ListboxSetup {
  readonly trigger?: 'outline' | 'filled' | 'ghost'
  readonly isInvalid?: boolean
  readonly isDisabled?: boolean
  readonly direction?: 'rtl'
}

const mountListbox = ({ trigger = 'outline', isInvalid, isDisabled, direction }: ListboxSetup) => {
  const style = Style.forSlots(ListboxSlots)(Recipes.Listbox({ trigger }))
  install(style.css)
  handle = Runtime.embed(
    Runtime.makeElement({
      Model: ListboxModel,
      container: container('states-listbox'),
      slow: false,
      init: () => ({ model: { listbox: UiListbox.init({ id: 'states' }) } }),
      update: (model: ListboxModel, message: UiListbox.Message) => {
        const next = Frequencies.update(model.listbox, message)
        return {
          model: { listbox: next.model },
          ...(next.commands === undefined ? {} : { commands: next.commands }),
        }
      },
      view: (model: ListboxModel, h: HtmlBuilder<UiListbox.Message>) =>
        Frequencies.view(
          model.listbox,
          {
            items: ['Hourly', 'Daily'],
            maybeSelectedValue: Option.none(),
            itemToConfig: (frequency: string) => ({ content: h.span([], [frequency]) }),
            buttonContent: h.span([], ['Every']),
            toView: Listbox.toView([style.mixin], { h }),
            ...(isInvalid === undefined ? {} : { isInvalid }),
            ...(isDisabled === undefined ? {} : { isDisabled }),
            ...(direction === undefined ? {} : { direction }),
          },
          h,
        ),
    }),
  )
  return vi.waitFor(() => {
    const found = document.querySelector<HTMLElement>('button[aria-haspopup]')
    expect(found).not.toBeNull()
    return found!
  })
}

test.each(['outline', 'filled', 'ghost'] as const)(
  'an invalid %s Listbox trigger is announced and draws the error edge',
  async trigger => {
    const button = await mountListbox({ trigger, isInvalid: true })
    expect(button.getAttribute('aria-invalid')).toBe('true')
    expect(getComputedStyle(button).borderTopColor).toBe(errorEdge())
  },
)

test('a valid Listbox trigger is not announced invalid and draws no error edge', async () => {
  const button = await mountListbox({})
  expect(button.hasAttribute('aria-invalid')).toBe(false)
  expect(getComputedStyle(button).borderTopColor).not.toBe(errorEdge())
})

test('a disabled Listbox trigger draws no hover', async () => {
  const button = await mountListbox({ isDisabled: true })
  expect(button.getAttribute('aria-disabled')).toBe('true')
  const resting = getComputedStyle(button).borderTopColor
  await userEvent.hover(button)
  await settle(button)
  expect(getComputedStyle(button).borderTopColor).toBe(resting)
})

test('an enabled Listbox trigger draws its hover, so the disabled case is a real guard', async () => {
  const button = await mountListbox({})
  const resting = getComputedStyle(button).borderTopColor
  await userEvent.hover(button)
  await vi.waitFor(() => expect(getComputedStyle(button).borderTopColor).not.toBe(resting))
})

test('an invalid Listbox trigger keeps its error edge under the pointer', async () => {
  const button = await mountListbox({ isInvalid: true })
  await userEvent.hover(button)
  await settle(button)
  expect(getComputedStyle(button).borderTopColor).toBe(errorEdge())
})

test("a Listbox given direction rtl draws its trigger right to left, as its panel's keys read", async () => {
  const button = await mountListbox({ direction: 'rtl' })
  expect(getComputedStyle(button).direction).toBe('rtl')
})

// Combobox

const ComboboxModel = Schema.Struct({
  combobox: UpstreamCombobox.Multi.Model,
  chosen: Schema.Array(Schema.String),
})
type ComboboxModel = typeof ComboboxModel.Type
const ComboboxMessage = defineMessageUnion({ Got: { message: UpstreamCombobox.Message } })
type ComboboxMessage = typeof ComboboxMessage.Type
const Cities = ComboboxView.Multi.create<string>()
const cities = ['Kyiv', 'Lagos', 'Lima', 'Oslo', 'Osaka']

interface ComboboxSetup {
  readonly size?: 'sm' | 'md' | 'lg'
  readonly isInvalid?: boolean
  readonly isDisabled?: boolean
  readonly chosen?: ReadonlyArray<string>
}

const mountCombobox = ({ size, isInvalid, isDisabled, chosen = [] }: ComboboxSetup) => {
  const style = Style.forSlots(ComboboxSlots)(
    // The recipe's own type refuses the size it has not got yet.
    Recipes.Combobox(size === undefined ? {} : { size }),
  )
  install(style.css)
  handle = Runtime.embed(
    Runtime.makeElement({
      Model: ComboboxModel,
      container: container('states-combobox'),
      slow: false,
      init: () => ({ model: { combobox: UpstreamCombobox.Multi.init({ id: 'city' }), chosen } }),
      update: (model: ComboboxModel, message: ComboboxMessage) =>
        ComboboxMessage.match(message, {
          Got: ({ message }) => {
            const next = Cities.update(model.combobox, message)
            return {
              model: modifyFields(model, { combobox: () => next.model }),
              commands: Command.mapMessages(next.commands ?? [], message =>
                ComboboxMessage.Got({ message }),
              ),
            }
          },
        }),
      view: (model: ComboboxModel, h: HtmlBuilder<ComboboxMessage>) =>
        h.submodel({
          slotId: model.combobox.id,
          model: model.combobox,
          view: Cities.view,
          viewInputs: {
            anchor: { placement: 'bottom-start', gap: 4, padding: 8 },
            items: cities.filter(city =>
              city.toLowerCase().includes(model.combobox.inputValue.toLowerCase()),
            ),
            restingInputValue: '',
            selectedValues: model.chosen,
            itemToConfig: (city: string) => ({ content: h.span([], [city]) }),
            itemToValue: (city: string) => city,
            itemToDisplayText: (city: string) => city,
            ariaLabel: 'City',
            empty: h.span([], ['No cities match']),
            clearContent: h.span([], ['×']),
            chips: {},
            toView: Combobox.toView([style.mixin], { h }),
            ...(isInvalid === undefined ? {} : { isInvalid }),
            ...(isDisabled === undefined ? {} : { isDisabled }),
          },
          toParentMessage: message => ComboboxMessage.Got({ message }),
        }),
    }),
  )
  return vi.waitFor(() => {
    const field = document.getElementById('city-input-wrapper')
    const input = document.getElementById('city-input')
    expect(field).not.toBeNull()
    expect(input).not.toBeNull()
    return { field: field!, input: input! as HTMLInputElement }
  })
}

test('an invalid Combobox is announced and draws the error edge on its field', async () => {
  const { field, input } = await mountCombobox({ isInvalid: true })
  expect(input.getAttribute('aria-invalid')).toBe('true')
  expect(getComputedStyle(field).borderTopColor).toBe(errorEdge())
})

test('an invalid Combobox field keeps its error edge under the pointer', async () => {
  const { field } = await mountCombobox({ isInvalid: true })
  await userEvent.hover(field)
  await settle(field)
  expect(getComputedStyle(field).borderTopColor).toBe(errorEdge())
})

test('a valid Combobox draws no error edge', async () => {
  const { field } = await mountCombobox({})
  expect(getComputedStyle(field).borderTopColor).not.toBe(errorEdge())
})

test('a disabled Combobox field draws no hover', async () => {
  const { field, input } = await mountCombobox({ isDisabled: true })
  expect(input.getAttribute('aria-disabled')).toBe('true')
  const resting = getComputedStyle(field).borderTopColor
  await userEvent.hover(field)
  await settle(field)
  expect(getComputedStyle(field).borderTopColor).toBe(resting)
})

test('an enabled Combobox field draws its hover, so the disabled case is a real guard', async () => {
  const { field } = await mountCombobox({})
  const resting = getComputedStyle(field).borderTopColor
  await userEvent.hover(field)
  await vi.waitFor(() => expect(getComputedStyle(field).borderTopColor).not.toBe(resting))
})

test.each([
  ['sm', 28],
  ['md', 36],
  ['lg', 40],
] as const)('a %s Combobox is %spx tall', async (size, height) => {
  const { field } = await mountCombobox({ size })
  expect(field.getBoundingClientRect().height).toBe(height)
})

test('the clear button keeps the touch floor where the pointer is coarse', async () => {
  document.documentElement.style.setProperty('--fk-touch-floor', '2.75rem')
  const { input } = await mountCombobox({})
  input.focus()
  await userEvent.keyboard('Os')
  const clear = await vi.waitFor(() => {
    const found = document.querySelector<HTMLElement>('[aria-label="Clear"]')
    expect(found).not.toBeNull()
    return found!
  })
  const box = clear.getBoundingClientRect()
  expect(Math.min(box.width, box.height)).toBeGreaterThanOrEqual(44)
})

test('Home and End move the caret in the text while the list is open', async () => {
  const { input } = await mountCombobox({})
  input.focus()
  await userEvent.keyboard('Os')
  const options = () => document.querySelectorAll('[role="option"]')
  await vi.waitFor(() => expect(options()).toHaveLength(3))
  const highlighted = input.getAttribute('aria-activedescendant')
  await userEvent.keyboard('{Home}')
  expect(input.selectionStart).toBe(0)
  await userEvent.keyboard('{End}')
  expect(input.selectionStart).toBe(2)
  // The list stays open, and the keys did not move the highlight.
  expect(options()).toHaveLength(3)
  expect(input.getAttribute('aria-activedescendant')).toBe(highlighted)
})
