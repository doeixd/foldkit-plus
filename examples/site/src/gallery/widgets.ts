/**
 * The state of the component previews that have some: each `@foldkit/ui`
 * component's own Model beside the value it reports, so the component owns
 * focus, a drag or an open popup and this Model owns the choice. The site
 * holds one of these and folds `Message` into it.
 */
import { Effect, Option, Schema } from 'effect'
import { Calendar, Subscription, Update } from 'foldkit'
import { defineMessageUnion } from 'foldkit/message'
import { makeModifyFieldsFor, modifyFields } from 'foldkit/struct'
import {
  Calendar as UiCalendar,
  Combobox as UiCombobox,
  DatePicker as UiDatePicker,
  Dialog as UiDialog,
  Listbox as UiListbox,
  Menu as UiMenu,
  Popover as UiPopover,
  RadioGroup as UiRadioGroup,
  Tabs as UiTabs,
} from '@foldkit/ui'
import * as UiSlider from '@foldkit/ui/slider'
import * as UiTooltip from '@foldkit/ui/tooltip'

import {
  Action,
  ActionMenu,
  Billing,
  BillingGroup,
  CityBox,
  Frequency,
  FrequencyBox,
  Notices,
  Range,
  Section,
  SectionTabs,
} from '../snippets/components.js'

export const Model = Schema.Struct({
  tabs: UiTabs.Model,
  section: Section,
  billingGroup: UiRadioGroup.Model,
  billing: Billing,
  slider: UiSlider.Model,
  volume: Schema.Number,
  dialog: UiDialog.Model,
  popover: UiPopover.Model,
  tooltip: UiTooltip.Model,
  menu: UiMenu.Model,
  action: Schema.Option(Action),
  listbox: UiListbox.Model,
  frequency: Schema.Option(Frequency),
  combobox: UiCombobox.Model,
  city: Schema.Option(Schema.String),
  calendar: UiCalendar.Model,
  date: Schema.Option(Calendar.CalendarDate),
  picker: UiDatePicker.Model,
  due: Schema.Option(Calendar.CalendarDate),
  notices: Notices.Model,
  range: Range,
})
export type Model = typeof Model.Type

export const Message = defineMessageUnion({
  GotTabs: { message: UiTabs.Message },
  GotBillingGroup: { message: UiRadioGroup.Message },
  GotSlider: { message: UiSlider.Message },
  GotDialog: { message: UiDialog.Message },
  OpenedDialog: {},
  ClosedDialog: {},
  GotPopover: { message: UiPopover.Message },
  GotTooltip: { message: UiTooltip.Message },
  GotMenu: { message: UiMenu.Message },
  GotListbox: { message: UiListbox.Message },
  GotCombobox: { message: UiCombobox.Message },
  GotCalendar: { message: UiCalendar.Message },
  GotDatePicker: { message: UiDatePicker.Message },
  GotNotices: { message: Notices.Message },
  SavedDraft: {},
  ChoseRange: { range: Range },
})
export type Message = typeof Message.Type

// The day the page was loaded; a picker that shows another opens on the wrong month.
const today = Effect.runSync(Calendar.today.local)

export const initial: Model = {
  tabs: UiTabs.init({ id: 'preview-tabs' }),
  section: 'overview',
  billingGroup: UiRadioGroup.init({ id: 'preview-billing' }),
  billing: 'yearly',
  slider: UiSlider.init({ id: 'preview-volume', min: 0, max: 100, step: 5 }),
  volume: 60,
  dialog: UiDialog.init({ id: 'preview-dialog' }),
  popover: UiPopover.init({ id: 'preview-popover' }),
  tooltip: UiTooltip.init({ id: 'preview-tooltip' }),
  menu: UiMenu.init({ id: 'preview-menu' }),
  action: Option.none(),
  listbox: UiListbox.init({ id: 'preview-frequency' }),
  frequency: Option.some('Daily'),
  combobox: UiCombobox.init({ id: 'preview-city' }),
  city: Option.none(),
  calendar: UiCalendar.init({ id: 'preview-calendar', today }),
  date: Option.none(),
  picker: UiDatePicker.init({
    id: 'preview-due',
    today,
    minDate: Calendar.subtractYears(today, 5),
    maxDate: Calendar.addYears(today, 5),
  }),
  due: Option.none(),
  notices: Notices.init({ id: 'preview-notices' }),
  range: 'week',
}

type Step = Update.Step<Model, Message>

const modifyModel = makeModifyFieldsFor<Model>()

/** Reads and writes one child field, and wraps the child's Messages. */
const own = <K extends keyof Model, ChildMessage>(
  field: K,
  wrap: (args: { readonly message: ChildMessage }) => Message,
): {
  readonly read: (model: Model) => Option.Option<Model[K]>
  readonly write: (model: Model, child: Model[K]) => Model
  readonly toParentMessage: (message: ChildMessage) => Message
} => ({
  read: model => Option.some(model[field]),
  // The computed key keeps its association to the field through the mapped type.
  write: (model, child) =>
    modifyModel(model, { [field]: () => child } as { readonly [P in K]: () => Model[P] }),
  toParentMessage: message => wrap({ message }),
})

const same: Step = model => ({ model })

const foldTabs = Update.foldChild({
  ...own('tabs', Message.GotTabs),
  update: SectionTabs.update,
  foldOutMessage: UiTabs.OutMessage.match<Step, UiTabs.OutMessage<Section>>({
    Selected:
      ({ value }) =>
      model =>
        value === model.section
          ? { model }
          : { model: modifyFields(model, { section: () => value }) },
  }),
})

const foldBillingGroup = Update.foldChild({
  ...own('billingGroup', Message.GotBillingGroup),
  update: BillingGroup.update,
  foldOutMessage: UiRadioGroup.OutMessage.match<Step, UiRadioGroup.OutMessage<Billing>>({
    Selected:
      ({ value }) =>
      model =>
        value === model.billing
          ? { model }
          : { model: modifyFields(model, { billing: () => value }) },
  }),
})

const foldSlider = Update.foldChild({
  ...own('slider', Message.GotSlider),
  update: UiSlider.update,
  foldOutMessage: UiSlider.OutMessage.match<Step>({
    ChangedValue:
      ({ value }) =>
      model =>
        value === model.volume
          ? { model }
          : { model: modifyFields(model, { volume: () => value }) },
  }),
})

const dialogOut = UiDialog.OutMessage.match<Step>({ Opened: () => same, Closed: () => same })
const dialogField = own('dialog', Message.GotDialog)
const foldDialog = Update.foldChild({
  ...dialogField,
  update: UiDialog.update,
  foldOutMessage: dialogOut,
})
const openDialog = Update.foldChildStep({
  ...dialogField,
  update: UiDialog.open,
  foldOutMessage: dialogOut,
})
const closeDialog = Update.foldChildStep({
  ...dialogField,
  update: UiDialog.close,
  foldOutMessage: dialogOut,
})

const foldPopover = Update.foldChild({
  ...own('popover', Message.GotPopover),
  update: UiPopover.update,
  foldOutMessage: UiPopover.OutMessage.match<Step>({ Opened: () => same, Closed: () => same }),
})

const foldTooltip = Update.foldChild({
  ...own('tooltip', Message.GotTooltip),
  update: UiTooltip.update,
  foldOutMessage: UiTooltip.OutMessage.match<Step>({ Shown: () => same, Hidden: () => same }),
})

/** The action chosen is the Model's; the menu has already closed. */
const foldMenu = Update.foldChild({
  ...own('menu', Message.GotMenu),
  update: ActionMenu.update,
  foldOutMessage: UiMenu.OutMessage.match<Step, UiMenu.OutMessage<Action>>({
    Selected:
      ({ value }) =>
      model => ({ model: modifyFields(model, { action: () => Option.some(value) }) }),
  }),
})

const foldListbox = Update.foldChild({
  ...own('listbox', Message.GotListbox),
  update: FrequencyBox.update,
  foldOutMessage: UiListbox.OutMessage.match<Step, UiListbox.OutMessage<Frequency>>({
    Selected:
      ({ value }) =>
      model => ({ model: modifyFields(model, { frequency: () => Option.some(value) }) }),
  }),
})

const foldCombobox = Update.foldChild({
  ...own('combobox', Message.GotCombobox),
  update: CityBox.update,
  foldOutMessage: UiCombobox.OutMessage.match<Step, UiCombobox.OutMessage<string>>({
    Selected:
      ({ value }) =>
      model => ({ model: modifyFields(model, { city: () => Option.some(value) }) }),
    ClearedSelection: () => model => ({
      model: modifyFields(model, { city: () => Option.none() }),
    }),
  }),
})

const foldCalendar = Update.foldChild({
  ...own('calendar', Message.GotCalendar),
  update: UiCalendar.update,
  foldOutMessage: UiCalendar.OutMessage.match<Step>({
    SelectedDate:
      ({ date }) =>
      model => ({ model: modifyFields(model, { date: () => Option.some(date) }) }),
    ChangedViewMonth: () => same,
  }),
})

const foldDatePicker = Update.foldChild({
  ...own('picker', Message.GotDatePicker),
  update: UiDatePicker.update,
  foldOutMessage: UiDatePicker.OutMessage.match<Step>({
    SelectedDate:
      ({ date }) =>
      model => ({ model: modifyFields(model, { due: () => Option.some(date) }) }),
    ClearedDate: () => model => ({ model: modifyFields(model, { due: () => Option.none() }) }),
    ChangedViewMonth: () => same,
  }),
})

const noticesField = own('notices', Message.GotNotices)
const noticesOut = Notices.OutMessage.match<Step>({ DismissedToast: () => same })
const foldNotices = Update.foldChild({
  ...noticesField,
  update: Notices.update,
  foldOutMessage: noticesOut,
})
const notify = Update.foldChild({
  ...noticesField,
  update: Notices.show,
  foldOutMessage: noticesOut,
})

export const update = (model: Model, message: Message): Update.Return<Model, Message> =>
  Message.match(message, {
    GotTabs: ({ message }) => foldTabs(model, message),
    GotBillingGroup: ({ message }) => foldBillingGroup(model, message),
    GotSlider: ({ message }) => foldSlider(model, message),
    GotDialog: ({ message }) => foldDialog(model, message),
    OpenedDialog: () => openDialog(model),
    ClosedDialog: () => closeDialog(model),
    GotPopover: ({ message }) => foldPopover(model, message),
    GotTooltip: ({ message }) => foldTooltip(model, message),
    GotMenu: ({ message }) => foldMenu(model, message),
    GotListbox: ({ message }) => foldListbox(model, message),
    GotCombobox: ({ message }) => foldCombobox(model, message),
    GotCalendar: ({ message }) => foldCalendar(model, message),
    GotDatePicker: ({ message }) => foldDatePicker(model, message),
    GotNotices: ({ message }) => foldNotices(model, message),
    ChoseRange: ({ range }) =>
      range === model.range ? { model } : { model: modifyFields(model, { range: () => range }) },
    SavedDraft: () =>
      notify(model, {
        variant: 'Success',
        payload: { title: 'Draft saved', text: 'Every edit since noon is safe.' },
      }),
  })

/**
 * The slider's drag reaches it through the page's pointer, outside the
 * slider, and each toast's timer dismisses it.
 */
export const subscriptions = Subscription.aggregate(
  Subscription.lift({
    previewSliderPointer: UiSlider.subscriptions.dragPointer,
    previewSliderEscape: UiSlider.subscriptions.dragEscape,
  })<Model, Message>({
    read: model => Option.some(model.slider),
    toParentMessage: message => Message.GotSlider({ message }),
  }),
  Subscription.lift(Notices.subscriptions)<Model, Message>({
    read: model => Option.some(model.notices),
    toParentMessage: message => Message.GotNotices({ message }),
  }),
)
