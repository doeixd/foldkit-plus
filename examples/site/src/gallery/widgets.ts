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
  HoverIntent as UiHoverIntent,
  Listbox as UiListbox,
  Menu as UiMenu,
  Popover as UiPopover,
  RadioGroup as UiRadioGroup,
  Tabs as UiTabs,
} from '@foldkit/ui'
import { Accordion, CheckboxGroup, Dialog, Menubar, Resizable, Sidebar } from 'foldkit-mixins-ui'
import * as UiSlider from '@foldkit/ui/slider'
import * as UiTooltip from '@foldkit/ui/tooltip'
import * as UiVirtualList from '@foldkit/ui/virtualList'

import {
  Action,
  ActionMenu,
  Billing,
  BillingGroup,
  CityBox,
  Frequency,
  FrequencyBox,
  MENUBAR,
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
  alertDialog: UiDialog.Model,
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
  /** The accordion's open sections. */
  faq: Schema.Array(Schema.String),
  /** The checkbox group's checked alerts. */
  alerts: Schema.Array(Schema.String),
  /** The number field's servings. */
  servings: Schema.Number,
  /** The one-time code typed so far. */
  code: Schema.String,
  hoverCard: UiHoverIntent.Model,
  /** The context menu, the point a right press opened it at, and what it last did. */
  fileMenu: UiMenu.Model,
  filePoint: Schema.Option(Schema.Struct({ x: Schema.Number, y: Schema.Number })),
  fileAction: Schema.Option(Action),
  /** The command menu's query, highlighted row and last command run. */
  commandQuery: Schema.String,
  commandActive: Schema.Option(Schema.String),
  commandRan: Schema.Option(Schema.String),
  /** The resizable split. */
  split: Resizable.Model,
  /** The sidebar's open sections, and whether it is collapsed. */
  sidebarOpen: Schema.Array(Schema.String),
  sidebarCollapsed: Schema.Boolean,
  /** The menu bar's menus, and the command last chosen from it. */
  menubar: Menubar.Model,
  menubarChoice: Schema.Option(Schema.String),
  /** The virtual list's scroll and measurements. */
  virtualList: UiVirtualList.Model,
  /** The rating's stars, none before any are given. */
  stay: Schema.Option(Schema.Number),
})
export type Model = typeof Model.Type

export const Message = defineMessageUnion({
  GotTabs: { message: UiTabs.Message },
  GotBillingGroup: { message: UiRadioGroup.Message },
  GotSlider: { message: UiSlider.Message },
  GotDialog: { message: UiDialog.Message },
  OpenedDialog: {},
  ClosedDialog: {},
  GotAlertDialog: { message: UiDialog.Message },
  OpenedAlertDialog: {},
  ClosedAlertDialog: {},
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
  ToggledFaq: { id: Schema.String },
  ToggledAlert: { value: Schema.String },
  ChangedServings: { value: Schema.Number },
  TypedCode: { code: Schema.String },
  GotHoverCard: { message: UiHoverIntent.Message },
  GotFileMenu: { message: UiMenu.Message },
  PointedFile: { x: Schema.Number, y: Schema.Number },
  OpenedFileMenu: {},
  TypedCommand: { query: Schema.String },
  HighlightedCommand: { value: Schema.String },
  RanCommand: { value: Schema.String },
  GotSplit: { message: Resizable.Message },
  ToggledSidebarSection: { id: Schema.String },
  ToggledSidebar: {},
  GotMenubar: { message: Menubar.Message },
  GotVirtualList: { message: UiVirtualList.Message },
  RatedStay: { value: Schema.Number },
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
  dialog: UiDialog.init({ id: 'preview-dialog', isAnimated: true }),
  alertDialog: UiDialog.init({ id: 'preview-alert-dialog', isAnimated: true }),
  popover: UiPopover.init({ id: 'preview-popover' }),
  tooltip: UiTooltip.init({ id: 'preview-tooltip' }),
  menu: UiMenu.init({ id: 'preview-menu', isAnimated: true }),
  action: Option.none(),
  listbox: UiListbox.init({ id: 'preview-frequency', isAnimated: true }),
  frequency: Option.some('Daily'),
  combobox: UiCombobox.init({ id: 'preview-city', isAnimated: true }),
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
  faq: ['billing'],
  alerts: ['mentions', 'replies'],
  servings: 4,
  code: '',
  hoverCard: UiHoverIntent.init(),
  fileMenu: UiMenu.init({ id: 'preview-file-menu', isAnimated: true }),
  filePoint: Option.none(),
  fileAction: Option.none(),
  commandQuery: '',
  commandActive: Option.none(),
  commandRan: Option.none(),
  split: Resizable.init(0.35),
  sidebarOpen: ['workspace'],
  sidebarCollapsed: false,
  menubar: Menubar.init(MENUBAR.map(menu => `preview-menubar-${menu.label.toLowerCase()}`)),
  menubarChoice: Option.none(),
  virtualList: UiVirtualList.init({ id: 'preview-virtual-list', rowHeightPx: 36 }),
  stay: Option.none(),
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

const alertField = own('alertDialog', Message.GotAlertDialog)
const foldAlertDialog = Update.foldChild({
  ...alertField,
  update: UiDialog.update,
  foldOutMessage: dialogOut,
})
const openAlertDialog = Update.foldChildStep({
  ...alertField,
  update: UiDialog.open,
  foldOutMessage: dialogOut,
})
const closeAlertDialog = Update.foldChildStep({
  ...alertField,
  update: UiDialog.close,
  foldOutMessage: dialogOut,
})

const foldPopover = Update.foldChild({
  ...own('popover', Message.GotPopover),
  update: UiPopover.update,
  foldOutMessage: UiPopover.OutMessage.match<Step>({ Opened: () => same, Closed: () => same }),
})

const foldHoverCard = Update.foldChild({
  ...own('hoverCard', Message.GotHoverCard),
  update: UiHoverIntent.update,
  foldOutMessage: UiHoverIntent.OutMessage.match<Step>({ Opened: () => same, Closed: () => same }),
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

const fileMenuOut = UiMenu.OutMessage.match<Step, UiMenu.OutMessage<Action>>({
  Selected:
    ({ value }) =>
    model => ({ model: modifyFields(model, { fileAction: () => Option.some(value) }) }),
})
const fileMenuField = own('fileMenu', Message.GotFileMenu)
const foldFileMenu = Update.foldChild({
  ...fileMenuField,
  update: ActionMenu.update,
  foldOutMessage: fileMenuOut,
})

const foldMenubar = Update.foldChild({
  ...own('menubar', Message.GotMenubar),
  update: Menubar.update,
  foldOutMessage: Menubar.OutMessage.match<Step>({
    Selected:
      ({ menu, value }) =>
      model => ({
        model: modifyFields(model, {
          menubarChoice: () =>
            Option.map(Option.fromNullishOr(MENUBAR[menu]), shown => `${shown.label} › ${value}`),
        }),
      }),
  }),
})

const foldVirtualList = Update.foldChild({
  ...own('virtualList', Message.GotVirtualList),
  update: UiVirtualList.update,
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
    // An alert dialog answers only to its buttons: Escape and the backdrop do nothing.
    GotAlertDialog: ({ message }) =>
      Dialog.isDismissal(message) ? { model } : foldAlertDialog(model, message),
    OpenedAlertDialog: () => openAlertDialog(model),
    ClosedAlertDialog: () => closeAlertDialog(model),
    GotPopover: ({ message }) => foldPopover(model, message),
    GotTooltip: ({ message }) => foldTooltip(model, message),
    GotHoverCard: ({ message }) => foldHoverCard(model, message),
    GotFileMenu: ({ message }) => foldFileMenu(model, message),
    PointedFile: ({ x, y }) => ({
      model: modifyFields(model, { filePoint: () => Option.some({ x, y }) }),
    }),
    // The Menu's own Opened, with its first row active, as a key opening it does.
    TypedCommand: ({ query }) => ({
      model: modifyFields(model, { commandQuery: () => query }),
    }),
    HighlightedCommand: ({ value }) => ({
      model: modifyFields(model, { commandActive: () => Option.some(value) }),
    }),
    ToggledSidebarSection: ({ id }) => ({
      model: modifyFields(model, { sidebarOpen: () => Sidebar.toggled(model.sidebarOpen, id) }),
    }),
    ToggledSidebar: () => ({
      model: modifyFields(model, { sidebarCollapsed: () => !model.sidebarCollapsed }),
    }),
    GotSplit: ({ message }) => {
      const split = Resizable.update(model.split, message, { min: 0.2, max: 0.8 })
      return split === model.split
        ? { model }
        : { model: modifyFields(model, { split: () => split }) }
    },
    RanCommand: ({ value }) => ({
      model: modifyFields(model, { commandRan: () => Option.some(value) }),
    }),
    OpenedFileMenu: () =>
      foldFileMenu(model, UiMenu.Message.Opened({ maybeActiveItemIndex: Option.some(0) })),
    GotMenu: ({ message }) => foldMenu(model, message),
    GotMenubar: ({ message }) => foldMenubar(model, message),
    GotVirtualList: ({ message }) => foldVirtualList(model, message),
    RatedStay: ({ value }) =>
      Option.contains(model.stay, value)
        ? { model }
        : { model: modifyFields(model, { stay: () => Option.some(value) }) },
    GotListbox: ({ message }) => foldListbox(model, message),
    GotCombobox: ({ message }) => foldCombobox(model, message),
    GotCalendar: ({ message }) => foldCalendar(model, message),
    GotDatePicker: ({ message }) => foldDatePicker(model, message),
    GotNotices: ({ message }) => foldNotices(model, message),
    ChoseRange: ({ range }) =>
      range === model.range ? { model } : { model: modifyFields(model, { range: () => range }) },
    ToggledFaq: ({ id }) => ({
      model: modifyFields(model, { faq: () => Accordion.toggled(model.faq, id) }),
    }),
    ToggledAlert: ({ value }) => ({
      model: modifyFields(model, { alerts: () => CheckboxGroup.toggled(model.alerts, value) }),
    }),
    TypedCode: ({ code }) =>
      code === model.code ? { model } : { model: modifyFields(model, { code: () => code }) },
    ChangedServings: ({ value }) =>
      value === model.servings
        ? { model }
        : { model: modifyFields(model, { servings: () => value }) },
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
