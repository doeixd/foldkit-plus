import { Array, Option } from 'effect'
import { Submodel } from 'foldkit'
import { type Html, type HtmlBuilder, childAttributes } from 'foldkit/html'

import { Combobox } from '@foldkit/ui'
import type { AnchorConfig } from '@foldkit/ui/combobox'
import { SlotView, Style, type SlotBuilders } from 'foldkit-mixins'

import * as Icon from '../../icon.js'
import { Message as UiMessage } from '../message.js'
import type { City, UiModel } from '../model.js'
import { ComboboxPageSlots, ComboboxPageStyle, type comboboxSlots } from '../style/combobox.js'

export const CityCombobox = Combobox.create<City>()
export const CityMultiCombobox = Combobox.Multi.create<City>()

const CITIES: ReadonlyArray<City> = [
  'Johannesburg',
  'Kyiv',
  'Oxford',
  'Plymouth',
  'Quito',
  'Wellington',
  'Zurich',
]

const COMBOBOX_ANCHOR: AnchorConfig = {
  placement: 'bottom-start',
  gap: 8,
  padding: 8,
}

const filterCities = (inputValue: string): ReadonlyArray<City> =>
  inputValue === ''
    ? CITIES
    : Array.filter(CITIES, city => city.toLowerCase().includes(inputValue.toLowerCase()))

/** The Slots a city combobox draws with, which the Combobox and Dialog pages both publish. */
export type ComboboxSlots = SlotBuilders<typeof comboboxSlots, UiMessage>

/**
 * A city combobox's view inputs, drawn with the page's Slots. An option's check
 * shows while it is `data-selected`, which the check's Style reads.
 */
export const comboboxInputs = (
  {
    inputValue,
    restingInputValue,
    anchor = COMBOBOX_ANCHOR,
    wrapper,
  }: Readonly<{
    inputValue: string
    restingInputValue: string
    anchor?: AnchorConfig
    wrapper: ComboboxSlots['combobox' | 'fieldCombobox']
  }>,
  slots: ComboboxSlots,
  h: HtmlBuilder<UiMessage>,
): Omit<Combobox.ViewInputs<City>, 'maybeSelectedValue'> => ({
  items: filterCities(inputValue),
  restingInputValue,
  itemToConfig: city => ({
    content: h.div(slots.itemContent.attrs(), [
      Icon.check(slots.checkIcon.attrs(), h),
      h.span(slots.itemLabel.attrs(), [city]),
    ]),
  }),
  itemToValue: city => city,
  itemToDisplayText: city => city,
  inputAttributes: childAttributes(slots.input.attrs([h.Placeholder('Search cities...')])),
  itemsAttributes: childAttributes(slots.items.attrs()),
  backdropAttributes: childAttributes(slots.backdrop.attrs()),
  attributes: childAttributes(wrapper.attrs()),
  inputWrapperAttributes: childAttributes(slots.inputWrapper.attrs()),
  buttonContent: Icon.chevronDown(slots.chevron.attrs(), h),
  buttonAttributes: childAttributes(slots.button.attrs()),
  anchor,
})

type Slots = SlotBuilders<typeof ComboboxPageSlots, UiMessage>

type SingleDemo = Readonly<{
  combobox: Combobox.Model
  maybeSelectedCity: Option.Option<City>
  anchor: AnchorConfig
  openOnFocus: boolean
  toParentMessage: (message: Combobox.Message) => UiMessage
}>

const cityLabel = (
  combobox: Combobox.Model,
  label: string,
  slots: Slots,
  h: HtmlBuilder<UiMessage>,
): Html => h.label(slots.fieldLabel.attrs([h.For(Combobox.inputId(combobox.id))]), [label])

const singleDemo = (
  demo: SingleDemo,
  slots: Slots,
  h: HtmlBuilder<UiMessage>,
): ReadonlyArray<Html> => [
  cityLabel(demo.combobox, 'City', slots, h),
  h.div(slots.anchor.attrs(), [
    h.submodel({
      slotId: demo.combobox.id,
      model: demo.combobox,
      view: CityCombobox.view,
      viewInputs: {
        ...comboboxInputs(
          {
            inputValue: demo.combobox.inputValue,
            restingInputValue: Option.getOrElse(demo.maybeSelectedCity, () => ''),
            anchor: demo.anchor,
            wrapper: slots.combobox,
          },
          slots,
          h,
        ),
        maybeSelectedValue: demo.maybeSelectedCity,
        openOnFocus: demo.openOnFocus,
      },
      toParentMessage: demo.toParentMessage,
    }),
  ]),
]

const ComboboxPage = SlotView.forMessages<UiMessage>()
  .define(ComboboxPageSlots, (model: UiModel, slots, h) =>
    h.div(slots.page.attrs(), [
      h.h2(slots.title.attrs(), ['Combobox']),

      h.h3(slots.section.attrs(), ['Single-Select']),
      ...singleDemo(
        {
          combobox: model.comboboxDemo,
          maybeSelectedCity: model.maybeComboboxDemoSelectedCity,
          anchor: COMBOBOX_ANCHOR,
          openOnFocus: false,
          toParentMessage: message => UiMessage.GotComboboxDemoMessage({ message }),
        },
        slots,
        h,
      ),

      h.h3(slots.hintedSection.attrs(), ['Locked Placement']),
      h.p(slots.hint.attrs(), [
        'The panel keeps the side chosen when it opens as filtering changes its height.',
      ]),
      ...singleDemo(
        {
          combobox: model.comboboxPlacementLockDemo,
          maybeSelectedCity: model.maybeComboboxPlacementLockDemoSelectedCity,
          anchor: { ...COMBOBOX_ANCHOR, isPlacementLocked: true },
          openOnFocus: true,
          toParentMessage: message => UiMessage.GotComboboxPlacementLockDemoMessage({ message }),
        },
        slots,
        h,
      ),

      h.h3(slots.section.attrs(), ['Nullable']),
      ...singleDemo(
        {
          combobox: model.comboboxNullableDemo,
          maybeSelectedCity: model.maybeComboboxNullableDemoSelectedCity,
          anchor: COMBOBOX_ANCHOR,
          openOnFocus: false,
          toParentMessage: message => UiMessage.GotComboboxNullableDemoMessage({ message }),
        },
        slots,
        h,
      ),

      h.h3(slots.section.attrs(), ['Select on Focus']),
      ...singleDemo(
        {
          combobox: model.comboboxSelectOnFocusDemo,
          maybeSelectedCity: model.maybeComboboxSelectOnFocusDemoSelectedCity,
          anchor: COMBOBOX_ANCHOR,
          openOnFocus: false,
          toParentMessage: message => UiMessage.GotComboboxSelectOnFocusDemoMessage({ message }),
        },
        slots,
        h,
      ),

      h.h3(slots.section.attrs(), ['Multi-Select']),
      cityLabel(model.comboboxMultiDemo, 'Cities', slots, h),
      h.div(slots.anchor.attrs(), [
        h.div(
          slots.tags.attrs(),
          Array.match(model.comboboxMultiDemoSelectedCities, {
            onEmpty: () => [h.span(slots.emptyTag.attrs(), ['No selection'])],
            onNonEmpty: selectedCities =>
              selectedCities.map(city => h.span(slots.tag.attrs(), [city])),
          }),
        ),
        h.submodel({
          slotId: model.comboboxMultiDemo.id,
          model: model.comboboxMultiDemo,
          view: CityMultiCombobox.view,
          viewInputs: {
            ...comboboxInputs(
              {
                inputValue: model.comboboxMultiDemo.inputValue,
                restingInputValue: '',
                wrapper: slots.combobox,
              },
              slots,
              h,
            ),
            selectedValues: model.comboboxMultiDemoSelectedCities,
          },
          toParentMessage: message => UiMessage.GotComboboxMultiDemoMessage({ message }),
        }),
      ]),
    ]),
  )
  .pipe(Style.attach(ComboboxPageStyle))

export const view = Submodel.defineView<UiModel, UiMessage>(ComboboxPage)
