/// <reference types="@vitest/browser-playwright" />
/**
 * Keys of the widgets that open something or hold a grid: popover, hover card,
 * combobox, date picker and its calendar grid, file drop and radio group, typed
 * with a real keyboard and read back as what moved (focus or state) and whether
 * the page's own handling was kept (`defaultPrevented`).
 */
import { Option, Schema } from 'effect'
import * as UpstreamCombobox from '@foldkit/ui/combobox'
import * as UpstreamDatePicker from '@foldkit/ui/datePicker'
import * as UpstreamFileDrop from '@foldkit/ui/fileDrop'
import * as RadioGroupUi from '@foldkit/ui/radioGroup'
import { HoverIntent as UiHoverIntent, Popover as UiPopover } from '@foldkit/ui'
import * as Dates from 'foldkit/calendar'
import { mapMessages } from 'foldkit/command'
import type { HtmlBuilder } from 'foldkit/html'
import * as Runtime from 'foldkit/runtime'
import { modifyFields } from 'foldkit/struct'
import type { MixinValue } from 'foldkit-mixins'
import { afterEach, expect, test, vi } from 'vitest'
import { userEvent } from 'vitest/browser'
import {
  Calendar,
  Combobox,
  ComboboxView,
  DatePicker,
  DatePickerView,
  FileDrop,
  HoverIntent,
  Popover,
  RadioGroup,
} from '../src/index.js'

type Mixin = MixinValue<UpstreamDatePicker.Message> | MixinValue<never>

let handle: { readonly dispose: () => void } | undefined

afterEach(() => {
  handle?.dispose()
  handle = undefined
  document.documentElement.removeAttribute('dir')
  document.body.replaceChildren()
})

const container = (id: string) => {
  const element = document.createElement('div')
  element.id = id
  document.body.append(element)
  return element
}

const byId = (id: string) => document.getElementById(id)!
const active = () => document.activeElement?.id ?? document.activeElement?.tagName ?? ''
/** A loaded machine can take longer than `waitFor`'s second to draw a popup. */
const LONG = { timeout: 5000 }
const frames = () => new Promise(done => requestAnimationFrame(() => requestAnimationFrame(done)))

/** Whether anything had prevented each keydown's default by the time it reached the window. */
const typed = async (keys: string): Promise<ReadonlyArray<boolean>> => {
  const seen: Array<boolean> = []
  const listen = (event: KeyboardEvent) => seen.push(event.defaultPrevented)
  window.addEventListener('keydown', listen)
  try {
    await userEvent.keyboard(keys)
  } finally {
    window.removeEventListener('keydown', listen)
  }
  return seen
}

// Popover --------------------------------------------------------------------------

const PopoverModel = Schema.Struct({ popover: UiPopover.Model })
type PopoverModel = typeof PopoverModel.Type
type PopoverMessage = { readonly _tag: 'Got'; readonly message: UiPopover.Message }

test.each([['{Enter}'], [' ']] as const)(
  'a popover opens on %j, Escape shuts it and focus returns to its button',
  async open => {
    handle = Runtime.embed(
      Runtime.makeElement({
        Model: PopoverModel,
        container: container('popover-host'),
        init: () => ({ model: { popover: UiPopover.init({ id: 'share', isAnimated: false }) } }),
        update: (model: PopoverModel, message: PopoverMessage) => {
          const next = UiPopover.update(model.popover, message.message)
          return {
            model: { popover: next.model },
            commands: mapMessages(next.commands, (inner): PopoverMessage => ({
              _tag: 'Got',
              message: inner,
            })),
          }
        },
        view: (model: PopoverModel, h: HtmlBuilder<PopoverMessage>) =>
          h.submodel({
            slotId: 'share',
            model: model.popover,
            view: UiPopover.view,
            viewInputs: {
              anchor: Popover.anchor(),
              toView: Popover.toView([], { h }, popover =>
                h.div(
                  [],
                  [
                    h.button(popover.button, ['Share']),
                    ...(popover.isVisible
                      ? [
                          h.div(popover.layer, [
                            h.div(popover.panel, [
                              h.a([h.Id('inside'), h.Href('#x')], ['Copy link']),
                            ]),
                          ]),
                        ]
                      : []),
                  ],
                ),
              ),
            },
            toParentMessage: (message: UiPopover.Message): PopoverMessage => ({
              _tag: 'Got',
              message,
            }),
          }),
      }),
    )
    await vi.waitFor(() => expect(byId('share-button')).not.toBeNull())
    byId('share-button').focus()
    await userEvent.keyboard(open)
    await vi.waitFor(() => expect(byId('share-panel')).not.toBeNull())
    await userEvent.keyboard('{Escape}')
    await vi.waitFor(() => expect(document.getElementById('share-panel')).toBeNull())
    await vi.waitFor(() => expect(active()).toBe('share-button'))
    // Shut, the button holds focus and says so.
    expect(byId('share-button').getAttribute('aria-expanded')).toBe('false')
  },
)

// Hover card -----------------------------------------------------------------------

const CardModel = Schema.Struct({ card: UiHoverIntent.Model })
type CardModel = typeof CardModel.Type
type CardMessage = { readonly _tag: 'Got'; readonly message: UiHoverIntent.Message }

test('a hover card opens when its trigger takes focus, and Escape closes it with focus kept', async () => {
  handle = Runtime.embed(
    Runtime.makeElement({
      Model: CardModel,
      container: container('card-host'),
      init: () => ({ model: { card: UiHoverIntent.init() } }),
      update: (model: CardModel, message: CardMessage) => {
        const next = UiHoverIntent.update(model.card, message.message)
        return {
          model: { card: next.model },
          commands: mapMessages(next.commands, (inner): CardMessage => ({
            _tag: 'Got',
            message: inner,
          })),
        }
      },
      view: (model: CardModel, h: HtmlBuilder<CardMessage>) =>
        h.submodel({
          slotId: 'card',
          model: model.card,
          view: UiHoverIntent.view,
          viewInputs: {
            toView: HoverIntent.toView(
              [],
              { h, anchored: { id: 'ada', anchor: { placement: 'bottom-start' } } },
              ({ trigger, panel, isVisible }) =>
                h.div(
                  [],
                  [
                    h.button([...trigger, h.Type('button')], ['@ada']),
                    ...(isVisible
                      ? [h.div([...panel, h.AriaLabel('card')], ['Ada Lovelace'])]
                      : []),
                  ],
                ),
            ),
          },
          toParentMessage: (message: UiHoverIntent.Message): CardMessage => ({
            _tag: 'Got',
            message,
          }),
        }),
    }),
  )
  const trigger = await vi.waitFor(() => {
    const found = document.getElementById(HoverIntent.triggerId('ada'))
    expect(found).not.toBeNull()
    return found!
  })
  expect(document.querySelector('[aria-label="card"]')).toBeNull()
  await userEvent.tab()
  expect(document.activeElement).toBe(trigger)
  await vi.waitFor(() => expect(document.querySelector('[aria-label="card"]')).not.toBeNull())
  await userEvent.keyboard('{Escape}')
  await vi.waitFor(() => expect(document.querySelector('[aria-label="card"]')).toBeNull())
  expect(document.activeElement).toBe(trigger)
})

// Combobox -------------------------------------------------------------------------

const FRUITS = ['Apple', 'Banana', 'Cherry']
const Fruits = ComboboxView.create<string>()
const ComboModel = Schema.Struct({
  combobox: UpstreamCombobox.Model,
  chosen: Schema.Option(Schema.String),
})
type ComboModel = typeof ComboModel.Type

const mountCombobox = () =>
  Runtime.embed(
    Runtime.makeElement({
      Model: ComboModel,
      container: container('combo-host'),
      init: () => ({
        model: {
          combobox: UpstreamCombobox.init({ id: 'fruit', isAnimated: false }),
          chosen: Option.none(),
        },
      }),
      update: (model: ComboModel, message: UpstreamCombobox.Message) => {
        const next = Fruits.update(model.combobox, message)
        return {
          model: {
            combobox: next.model,
            chosen:
              next.outMessage === undefined
                ? model.chosen
                : UpstreamCombobox.OutMessage.match(next.outMessage, {
                    Selected: ({ value }) => Option.some(value),
                    ClearedSelection: () => Option.none(),
                  }),
          },
          commands: next.commands ?? [],
        }
      },
      view: (model: ComboModel, h: HtmlBuilder<UpstreamCombobox.Message>) =>
        h.div(
          [],
          [
            Fruits.view(
              model.combobox,
              {
                anchor: { placement: 'bottom-start', gap: 4, padding: 8, portal: false },
                items: FRUITS,
                restingInputValue: Option.getOrElse(model.chosen, () => ''),
                itemToConfig: (fruit: string) => ({ content: h.span([], [fruit]) }),
                itemToValue: (fruit: string) => fruit,
                itemToDisplayText: (fruit: string) => fruit,
                buttonContent: h.span([], ['v']),
                maybeSelectedValue: model.chosen,
                toView: Combobox.toView([], { h }),
              },
              h,
            ),
            h.p([h.Id('picked')], [Option.getOrElse(model.chosen, () => '')]),
          ],
        ),
    }),
  )

const activeOption = () => {
  const id = byId('fruit-input').getAttribute('aria-activedescendant')
  return id === null ? '' : (document.getElementById(id)?.textContent ?? '')
}

/**
 * Holds `requestAnimationFrame`, as a loaded page does, so keys typed meanwhile meet the
 * view the last frame drew; `release` runs what was asked for.
 */
const holdFrames = () => {
  const real = window.requestAnimationFrame.bind(window)
  const held: Array<FrameRequestCallback> = []
  window.requestAnimationFrame = callback => held.push(callback)
  return () => {
    window.requestAnimationFrame = real
    for (const callback of held.splice(0)) real(callback)
  }
}

test('a combobox opens on ArrowDown, ArrowDown and ArrowUp move the active option, Enter chooses, focus stays in the field', async () => {
  handle = mountCombobox()
  await vi.waitFor(() => expect(byId('fruit-input')).not.toBeNull())
  byId('fruit-input').focus()
  expect(await typed('{ArrowDown}')).toEqual([true])
  await vi.waitFor(() => expect(byId('fruit-input').getAttribute('aria-expanded')).toBe('true'))
  await vi.waitFor(() => expect(activeOption()).toBe('Apple'))
  expect(await typed('{ArrowDown}')).toEqual([true])
  await vi.waitFor(() => expect(activeOption()).toBe('Banana'))
  expect(await typed('{ArrowUp}')).toEqual([true])
  await vi.waitFor(() => expect(activeOption()).toBe('Apple'))
  await userEvent.keyboard('{ArrowDown}')
  await vi.waitFor(() => expect(activeOption()).toBe('Banana'))
  await userEvent.keyboard('{ArrowDown}')
  await vi.waitFor(() => expect(activeOption()).toBe('Cherry'))
  expect(await typed('{Enter}')).toEqual([true])
  await vi.waitFor(() => expect(byId('picked').textContent).toBe('Cherry'))
  await vi.waitFor(() => expect(byId('fruit-input').getAttribute('aria-expanded')).toBe('false'))
  expect(active()).toBe('fruit-input')
})

// Finding: the active option is worked out from the drawn view's active index
// (`comboboxShared.ts` `resolveActiveIndex`, which reads `maybeActiveItemIndex` of the last
// render), so a second ArrowDown before the next frame computes the same target as the first
// and one press is lost. A held key repeating on a busy page does this.
test.fails('two ArrowDowns before the next frame move the active option two places', async () => {
  handle = mountCombobox()
  await vi.waitFor(() => expect(byId('fruit-input')).not.toBeNull())
  byId('fruit-input').focus()
  await userEvent.keyboard('{ArrowDown}')
  await vi.waitFor(() => expect(activeOption()).toBe('Apple'))
  const release = holdFrames()
  try {
    await userEvent.keyboard('{ArrowDown}{ArrowDown}')
  } finally {
    release()
  }
  await vi.waitFor(() => expect(activeOption()).toBe('Cherry'))
})

test('Escape shuts an open combobox and keeps focus in the field', async () => {
  handle = mountCombobox()
  await vi.waitFor(() => expect(byId('fruit-input')).not.toBeNull())
  byId('fruit-input').focus()
  await userEvent.keyboard('{ArrowDown}')
  await vi.waitFor(() => expect(byId('fruit-input').getAttribute('aria-expanded')).toBe('true'))
  await userEvent.keyboard('{Escape}')
  await vi.waitFor(() => expect(byId('fruit-input').getAttribute('aria-expanded')).toBe('false'))
  expect(active()).toBe('fruit-input')
  expect(byId('picked').textContent).toBe('')
})

test('Home and End in a combobox field move its caret, which is the text field’s own, and the active option stays', async () => {
  handle = mountCombobox()
  await vi.waitFor(() => expect(byId('fruit-input')).not.toBeNull())
  const field = byId('fruit-input') as HTMLInputElement
  field.focus()
  await userEvent.keyboard('an')
  await vi.waitFor(() => expect(byId('fruit-input').getAttribute('aria-expanded')).toBe('true'))
  await userEvent.keyboard('{ArrowDown}')
  await vi.waitFor(() => expect(activeOption()).toBe('Banana'))
  expect(await typed('{Home}')).toEqual([false])
  expect(field.selectionStart).toBe(0)
  expect(await typed('{End}')).toEqual([false])
  expect(field.selectionStart).toBe(2)
  expect(activeOption()).toBe('Banana')
})

// Date picker and its grid ---------------------------------------------------------

const DateModel = Schema.Struct({
  picker: UpstreamDatePicker.Model,
  selection: Calendar.Selection,
})
type DateModel = typeof DateModel.Type

const mountDates = (mixins: ReadonlyArray<Mixin>) =>
  Runtime.embed(
    Runtime.makeElement({
      Model: DateModel,
      container: container('date-host'),
      init: () => ({
        model: {
          picker: UpstreamDatePicker.init({ id: 'trip', today: Dates.make(2026, 3, 11) }),
          selection: Calendar.empty('Single'),
        },
      }),
      update: (model: DateModel, message: UpstreamDatePicker.Message) => {
        const next = DatePicker.update(model.selection)(model.picker, message)
        const selection = Option.match(Option.fromNullishOr(next.outMessage), {
          onNone: () => model.selection,
          onSome: out =>
            UpstreamDatePicker.OutMessage.match<Calendar.Selection>(out, {
              SelectedDate: ({ date }) => Calendar.picked(model.selection, date),
              ClearedDate: () => Calendar.empty('Single'),
              ChangedViewMonth: () => model.selection,
            }),
        })
        return {
          model: modifyFields(model, { picker: () => next.model, selection: () => selection }),
          commands: next.commands ?? [],
        }
      },
      view: (model: DateModel, h: HtmlBuilder<UpstreamDatePicker.Message>) =>
        DatePickerView.view(
          model.picker,
          {
            anchor: { placement: 'bottom-start' },
            selection: model.selection,
            triggerContent: () => h.span([], ['Pick a day']),
            toCalendarView: Calendar.toView(model.selection, mixins, { h }),
            name: 'trip',
          },
          h,
        ),
    }),
  )

/** The day the grid names as active, as `year-month-day`: focus stays on the grid itself. */
const focusedDay = () =>
  (
    document.getElementById('trip-calendar-grid')?.getAttribute('aria-activedescendant') ?? ''
  ).replace('trip-calendar-cell-', '')

const openGrid = async (mixins: ReadonlyArray<Mixin> = []) => {
  handle = mountDates(mixins)
  await vi.waitFor(() => expect(byId('trip-popover-button')).not.toBeNull())
  byId('trip-popover-button').focus()
  await userEvent.keyboard('{Enter}')
  await vi.waitFor(() => expect(byId('trip-popover-panel')).not.toBeNull(), LONG)
  await vi.waitFor(() => expect(focusedDay()).toBe('2026-3-11'), LONG)
  // The day is named before focus reaches the grid; a key pressed in between goes to the button.
  await vi.waitFor(() => expect(active()).toBe('trip-calendar-grid'), LONG)
}

// From the 11th of March 2026, a Wednesday.
const GRID_KEYS: ReadonlyArray<readonly [string, string]> = [
  ['{ArrowRight}', '2026-3-12'],
  ['{ArrowLeft}', '2026-3-10'],
  ['{ArrowDown}', '2026-3-18'],
  ['{ArrowUp}', '2026-3-4'],
  ['{PageDown}', '2026-4-11'],
  ['{PageUp}', '2026-2-11'],
  ['{Home}', '2026-3-8'],
  ['{End}', '2026-3-14'],
]

test.each(GRID_KEYS)('in the date grid from 11 March, %s lands on %s', async (key, lands) => {
  await openGrid()
  await userEvent.keyboard(key)
  await vi.waitFor(() => expect(focusedDay()).toBe(lands), LONG)
})

test.each(GRID_KEYS.map(([key]) => key))(
  'the date grid keeps %s from also scrolling the page',
  async key => {
    await openGrid()
    expect(await typed(key)).toEqual([true])
  },
)

test('Enter in the date grid chooses the active day and submits it', async () => {
  await openGrid()
  await userEvent.keyboard('{ArrowRight}')
  await vi.waitFor(() => expect(focusedDay()).toBe('2026-3-12'), LONG)
  await userEvent.keyboard('{Enter}')
  await vi.waitFor(() =>
    expect(document.querySelector<HTMLInputElement>('input[name="trip"]')?.value).toBe(
      '2026-03-12',
    ),
  )
})

// Right to left: the grid's own keys read the arrows left to right, so `Calendar.readingKeys`
// beside the style is what makes the visual side the side the key goes to.
test.each([
  ['{ArrowRight}', '2026-3-10'],
  ['{ArrowLeft}', '2026-3-12'],
] as const)('with readingKeys, right to left, %s lands on %s', async (key, lands) => {
  document.documentElement.dir = 'rtl'
  await openGrid([Calendar.readingKeys])
  await userEvent.keyboard(key)
  await vi.waitFor(() => expect(focusedDay()).toBe(lands), LONG)
})

test.each([
  ['{ArrowRight}', '2026-3-12'],
  ['{ArrowLeft}', '2026-3-10'],
] as const)(
  'without readingKeys, right to left, %s still reads left to right: %s',
  async (key, lands) => {
    document.documentElement.dir = 'rtl'
    await openGrid()
    await userEvent.keyboard(key)
    await vi.waitFor(() => expect(focusedDay()).toBe(lands), LONG)
  },
)

// File drop ------------------------------------------------------------------------

test.each([['{Enter}'], [' ']] as const)(
  'a file drop’s input is a tab stop and %j asks it to open the picker',
  async press => {
    handle = Runtime.embed(
      Runtime.makeElement({
        Model: UpstreamFileDrop.Model,
        container: container('drop-host'),
        init: () => ({ model: UpstreamFileDrop.init({ id: 'upload' }) }),
        update: (model: UpstreamFileDrop.Model, message: UpstreamFileDrop.Message) => ({
          model: UpstreamFileDrop.update(model, message).model,
        }),
        view: (model: UpstreamFileDrop.Model, h: HtmlBuilder<UpstreamFileDrop.Message>) =>
          UpstreamFileDrop.view(
            model,
            {
              toView: render => {
                const { root, input } = FileDrop.resolve(render, [], { input: undefined, h })
                return h.label(
                  [...root, h.Id('zone')],
                  [h.input([...input, h.Id('files')]), 'Drop files here'],
                )
              },
            },
            h,
          ),
      }),
    )
    await vi.waitFor(() => expect(byId('files')).not.toBeNull())
    let opened = 0
    byId('files').addEventListener('click', event => {
      // The native dialog would hold the test: count the request and refuse it.
      opened += 1
      event.preventDefault()
    })
    await userEvent.tab()
    expect(active()).toBe('files')
    await userEvent.keyboard(press)
    await vi.waitFor(() => expect(opened).toBe(1))
  },
)

// Radio group, without the reading keys ----------------------------------------------

type Choice = 'a' | 'b' | 'c' | 'd'
const Choices = RadioGroupUi.create<Choice>()
const RadioModel = Schema.Struct({
  radio: RadioGroupUi.Model,
  value: Schema.Literals(['a', 'b', 'c', 'd']),
})
type RadioModel = typeof RadioModel.Type

const mountRadio = (orientation: 'Horizontal' | 'Vertical', dir: 'ltr' | 'rtl') => {
  document.documentElement.dir = dir
  return Runtime.embed(
    Runtime.makeElement({
      Model: RadioModel,
      container: container('radio-host'),
      init: () => ({ model: { radio: RadioGroupUi.init({ id: 'pick' }), value: 'a' as const } }),
      update: (model: RadioModel, message: RadioGroupUi.Message) => {
        const next = Choices.update(model.radio, message)
        return {
          model: { radio: next.model, value: next.outMessage?.value ?? model.value },
          commands: next.commands ?? [],
        }
      },
      view: (model: RadioModel, h: HtmlBuilder<RadioGroupUi.Message>) =>
        Choices.view(
          model.radio,
          {
            options: ['a', 'b', 'c', 'd'],
            selectedValue: Option.some(model.value),
            ariaLabel: 'Pick',
            orientation,
            toView: RadioGroup.toView([], { h }, ({ group, options }) =>
              h.div(
                group,
                options.map(option => h.button(option.option, [option.value])),
              ),
            ),
          },
          h,
        ),
    }),
  )
}

// Upstream's handler binds one pair per orientation and knows no direction: the same
// keys move the same way left to right and right to left.
test.each([
  ['Horizontal', 'ltr', '{ArrowRight}', 'pick-option-1'],
  ['Horizontal', 'rtl', '{ArrowRight}', 'pick-option-1'],
  ['Horizontal', 'ltr', '{ArrowLeft}', 'pick-option-3'],
  ['Vertical', 'ltr', '{ArrowDown}', 'pick-option-1'],
  ['Vertical', 'rtl', '{ArrowUp}', 'pick-option-3'],
] as const)(
  'without readingKeys a %s %s group moves %s to %s',
  async (orientation, dir, key, lands) => {
    handle = mountRadio(orientation, dir)
    await vi.waitFor(() => expect(byId('pick-option-0')).not.toBeNull())
    byId('pick-option-0').focus()
    await userEvent.keyboard(key)
    await vi.waitFor(() => expect(active()).toBe(lands))
    expect(byId(lands).getAttribute('aria-checked')).toBe('true')
  },
)

test('without readingKeys the other axis is left to the page', async () => {
  handle = mountRadio('Horizontal', 'ltr')
  await vi.waitFor(() => expect(byId('pick-option-0')).not.toBeNull())
  byId('pick-option-0').focus()
  expect(await typed('{ArrowDown}')).toEqual([false])
  await frames()
  expect(active()).toBe('pick-option-0')
})
