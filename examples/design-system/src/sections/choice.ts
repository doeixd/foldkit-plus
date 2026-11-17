/**
 * The Choice section as an island: one value from many, with the state it needs of its own.
 */
import { Option, Schema } from 'effect'
import { Runtime, Update } from 'foldkit'
import type { Html, HtmlBuilder } from 'foldkit/html'
import { defineMessageUnion } from 'foldkit/message'
import { modifyFields } from 'foldkit/struct'
import {
  Combobox as UiCombobox,
  Listbox as UiListbox,
  RadioGroup as UiRadioGroup,
} from '@foldkit/ui'
import * as UiDisclosure from '@foldkit/ui/disclosure'
import * as UiFieldset from '@foldkit/ui/fieldset'
import * as UiSelect from '@foldkit/ui/select'
import { SlotView } from 'foldkit-mixins'
import {
  Combobox,
  ComboboxView,
  Disclosure,
  Fieldset,
  Listbox,
  ListboxView,
  RadioGroup,
  Select,
  Slider,
} from 'foldkit-mixins-ui'
import {
  ComboBoxStyle,
  DisclosureStyle,
  FieldsetStyle,
  ListboxStyle,
  PageStyle,
  RadioRowStyle,
  RadioStyle,
  SelectStyle,
  SliderStyle,
} from '../style.js'
import { PageSlots, RadioRowSlots } from '../slots.js'
import { foldsFor } from '../fold.js'

const Contact = Schema.Union([
  Schema.Literal('email'),
  Schema.Literal('phone'),
  Schema.Literal('none'),
])

type Contact = typeof Contact.Type

const ContactGroup = UiRadioGroup.create<Contact>()

const Frequency = Schema.Union([
  Schema.Literal('Daily'),
  Schema.Literal('Weekly'),
  Schema.Literal('Monthly'),
])

type Frequency = typeof Frequency.Type

const FrequencyBox = ListboxView.create<Frequency>()

const CityBox = ComboboxView.create<string>()

export const Model = Schema.Struct({
  country: Schema.String,
  detailsOpen: Schema.Boolean,
  contact: Contact,
  contactGroup: UiRadioGroup.Model,
  volume: Schema.Number,
  listbox: UiListbox.Model,
  maybeFrequency: Schema.Option(Frequency),
  combobox: UiCombobox.Model,
  maybeCity: Schema.Option(Schema.String),
})
export type Model = typeof Model.Type

export const Message = defineMessageUnion({
  CountrySelected: { value: Schema.String },
  DetailsToggled: { value: Schema.Boolean },
  VolumeChanged: { value: Schema.Number },
  ContactGroup: { message: UiRadioGroup.Message },
  Listbox: { message: UiListbox.Message },
  Combobox: { message: UiCombobox.Message },
})
export type Message = typeof Message.Type

export const initModel = (): Model => ({
  country: 'us',
  detailsOpen: false,
  contact: 'email',
  contactGroup: UiRadioGroup.init({ id: 'contact-group' }),
  volume: 60,
  listbox: UiListbox.init({ id: 'backup-frequency' }),
  maybeFrequency: Option.none(),
  combobox: UiCombobox.init({ id: 'home-city' }),
  maybeCity: Option.none(),
})

const own = foldsFor<Model, Message>()

/** The contact preference lives in the parent; the group owns focus only. */
const foldContactGroup = Update.foldChild({
  ...own('contactGroup', Message.ContactGroup),
  update: ContactGroup.update,
  foldOutMessage: UiRadioGroup.OutMessage.match<
    Update.Step<Model, Message>,
    UiRadioGroup.OutMessage<Contact>
  >({
    Selected:
      ({ value }) =>
      model => ({
        model: modifyFields(model, { contact: () => value }),
      }),
  }),
})

const foldListbox = Update.foldChild({
  ...own('listbox', Message.Listbox),
  update: FrequencyBox.update,
  foldOutMessage: UiListbox.OutMessage.match<
    Update.Step<Model, Message>,
    UiListbox.OutMessage<Frequency>
  >({
    Selected:
      ({ value }) =>
      model => ({
        model: modifyFields(model, { maybeFrequency: () => Option.some(value) }),
      }),
  }),
})

const foldCombobox = Update.foldChild({
  ...own('combobox', Message.Combobox),
  update: CityBox.update,
  foldOutMessage: UiCombobox.OutMessage.match<
    Update.Step<Model, Message>,
    UiCombobox.OutMessage<string>
  >({
    Selected:
      ({ value }) =>
      model => ({
        model: modifyFields(model, { maybeCity: () => Option.some(value) }),
      }),
    ClearedSelection: () => model => ({
      model: modifyFields(model, { maybeCity: () => Option.none() }),
    }),
  }),
})

export const update = (model: Model, message: Message) =>
  Message.match(message, {
    CountrySelected: ({ value }) => ({ model: modifyFields(model, { country: () => value }) }),
    DetailsToggled: ({ value }) => ({ model: modifyFields(model, { detailsOpen: () => value }) }),
    VolumeChanged: ({ value }) => ({ model: modifyFields(model, { volume: () => value }) }),
    ContactGroup: ({ message }) => foldContactGroup(model, message),
    Listbox: ({ message }) => foldListbox(model, message),
    Combobox: ({ message }) => foldCombobox(model, message),
  })

const countries: ReadonlyArray<readonly [value: string, label: string]> = [
  ['us', 'United States'],
  ['ca', 'Canada'],
  ['gb', 'United Kingdom'],
  ['au', 'Australia'],
]

const frequencies: ReadonlyArray<Frequency> = ['Daily', 'Weekly', 'Monthly']

const cities: ReadonlyArray<string> = [
  'Johannesburg',
  'Kyiv',
  'Oxford',
  'Plymouth',
  'Quito',
  'Wellington',
  'Zurich',
]

const filterCities = (inputValue: string): ReadonlyArray<string> =>
  inputValue === ''
    ? cities
    : cities.filter(city => city.toLowerCase().includes(inputValue.toLowerCase()))

const contacts: ReadonlyArray<{ readonly value: Contact; readonly label: string }> = [
  { value: 'email', label: 'Email' },
  { value: 'phone', label: 'Phone' },
  { value: 'none', label: 'None' },
]

const contactDescriptions: Record<Contact, string> = {
  email: 'Receipts and news, most weeks.',
  phone: 'Only when something is on fire.',
  none: 'No contact at all.',
}

/**
 * The contact preference, live: radio semantics with arrow keys, the choice
 * in the Model. Replaces the static pills that used to sit here.
 */
const RadioDemo = (model: Pick<Model, 'contact' | 'contactGroup'>, h: HtmlBuilder<Message>): Html =>
  h.submodel({
    slotId: model.contactGroup.id,
    model: model.contactGroup,
    view: ContactGroup.view,
    viewInputs: {
      selectedValue: Option.some(model.contact),
      options: contacts.map(contact => contact.value),
      ariaLabel: 'Preferred contact',
      hasOptionDescription: () => true,
      toView: render => {
        const resolved = RadioGroup.resolve(render, [RadioStyle.mixin], { input: undefined, h })
        const rows = SlotView.buildersFor(RadioRowSlots, [RadioRowStyle.style.mixin], {
          input: undefined,
          h,
        })
        return h.div(resolved.group, [
          ...resolved.options.map(option => {
            const known = contacts.find(contact => contact.value === option.value)
            // The label and description select too: they dispatch the
            // option's own selection through the group, exactly as the
            // circle's click does — but only when the option takes input.
            const select =
              option.isDisabled || option.isReadOnly
                ? []
                : [
                    h.OnClick(
                      Message.ContactGroup({
                        message: UiRadioGroup.Message.SelectedOption({
                          index: option.index,
                          value: option.value,
                        }),
                      }),
                    ),
                  ]
            return h.div(rows.row.attrs(), [
              h.button(option.option, []),
              h.div(rows.text.attrs(select), [
                h.label(option.label, [known?.label ?? option.value]),
                h.span(option.description, [contactDescriptions[option.value]]),
              ]),
            ])
          }),
        ])
      },
    },
    toParentMessage: message => Message.ContactGroup({ message }),
  })

/**
 * The live volume slider: a native range input owns the drag and the keys,
 * the Model owns the value, and each move arrives as `VolumeChanged`,
 * already on the step.
 */
const SliderDemo = (model: Pick<Model, 'volume'>, h: HtmlBuilder<Message>): Html =>
  Slider.view(
    {
      id: 'volume-slider',
      label: 'Volume',
      value: model.volume,
      step: 5,
      format: value => `${value}%`,
      showValue: true,
      onChange: value => Message.VolumeChanged({ value }),
      style: SliderStyle,
    },
    h,
  )

/** A backup-frequency listbox: the button shows the choice. */
const ListboxDemo = (
  model: Pick<Model, 'listbox' | 'maybeFrequency'>,
  h: HtmlBuilder<Message>,
): Html => {
  const label = Option.getOrElse(model.maybeFrequency, () => 'Select frequency')
  return h.submodel({
    slotId: model.listbox.id,
    model: model.listbox,
    view: FrequencyBox.view,
    viewInputs: {
      anchor: { placement: 'bottom-start', gap: 4, padding: 8 },
      items: frequencies,
      maybeSelectedValue: model.maybeFrequency,
      itemToConfig: (frequency: Frequency) => ({ content: h.span([], [frequency]) }),
      buttonContent: h.span([], [label]),
      toView: Listbox.toView([ListboxStyle.mixin], { h }),
    },
    toParentMessage: message => Message.Listbox({ message }),
  })
}

/** A city combobox: type to filter, pick to fill. */
const ComboboxDemo = (
  model: Pick<Model, 'combobox' | 'maybeCity'>,
  h: HtmlBuilder<Message>,
): Html =>
  h.submodel({
    slotId: model.combobox.id,
    model: model.combobox,
    view: CityBox.view,
    viewInputs: {
      anchor: { placement: 'bottom-start', gap: 8, padding: 8 },
      items: filterCities(model.combobox.inputValue),
      restingInputValue: Option.getOrElse(model.maybeCity, () => ''),
      itemToConfig: (city: string) => ({ content: h.span([], [city]) }),
      itemToValue: (city: string) => city,
      itemToDisplayText: (city: string) => city,
      buttonContent: h.span([], ['▾']),
      maybeSelectedValue: model.maybeCity,
      inputPlaceholder: 'Search cities…',
      toView: Combobox.toView([ComboBoxStyle.mixin], { h }),
    },
    toParentMessage: message => Message.Combobox({ message }),
  })

export const view = (model: Model, h: HtmlBuilder<Message>): Html => {
  const slots = SlotView.buildersFor(PageSlots, [PageStyle.style.mixin], { input: model, h })
  return h.div(slots.body.attrs(), [
    h.p(slots.sectionText.attrs(), [
      'One value from many: a native Select, radio circles, a live slider — drag it or use the arrow keys — a listbox, a filtering combobox, and a Disclosure, each through its slot contract.',
    ]),
    UiSelect.view(
      {
        id: 'country',
        value: model.country,
        onChange: (value: string) => Message.CountrySelected({ value }),
        hasDescription: true,
        toView: Select.toView([SelectStyle.mixin], { h }, resolved =>
          h.div(
            [],
            [
              h.label(resolved.label, ['Country']),
              h.select(
                resolved.select,
                countries.map(([value, label]) => h.option([h.Value(value)], [label])),
              ),
              h.span(resolved.description, ['Where you currently reside.']),
            ],
          ),
        ),
      },
      h,
    ),
    UiDisclosure.view(
      {
        id: 'details',
        isOpen: model.detailsOpen,
        onToggle: (value: boolean) => Message.DetailsToggled({ value }),
        toView: Disclosure.toView([DisclosureStyle.mixin], { h }, resolved =>
          h.div(
            [],
            [
              h.button(resolved.button, [
                model.detailsOpen ? 'Hide project details' : 'Show project details',
              ]),
              model.detailsOpen
                ? h.div(resolved.panel, [
                    'Six people, three open milestones, and one demo that keeps growing.',
                  ])
                : h.empty,
            ],
          ),
        ),
      },
      h,
    ),
    UiFieldset.view(
      {
        id: 'contact-prefs',
        hasDescription: true,
        toView: Fieldset.toView([FieldsetStyle.mixin], { h }, resolved =>
          h.fieldset(resolved.fieldset, [
            h.legend(resolved.legend, ['Preferred contact']),
            RadioDemo(model, h),
            h.span(resolved.description, [
              `Currently ${model.contact}. The group is a live radio: arrow keys move, the choice stays in the Model.`,
            ]),
          ]),
        ),
      },
      h,
    ),
    SliderDemo(model, h),
    ListboxDemo(model, h),
    ComboboxDemo(model, h),
  ])
}

export const mount = (container: HTMLElement): void => {
  Runtime.embed(
    Runtime.makeElement({
      Model,
      container,
      init: () => ({ model: initModel() }),
      update,
      view,
    }),
  )
}
