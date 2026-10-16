/**
 * The state of the component previews that have some: each `@foldkit/ui`
 * component's own Model beside the value it reports, so the component owns
 * focus, a drag or an open popup and this Model owns the choice. The site
 * holds one of these and folds `Message` into it.
 */
import { Effect, Option, Schema } from 'effect'
import { Calendar, Subscription, Update } from 'foldkit'
import * as Command from 'foldkit/command'
import { defineMessageUnion } from 'foldkit/message'
import { makeModifyFieldsFor, modifyFields } from 'foldkit/struct'
import {
  Calendar as UiCalendar,
  Combobox as UiCombobox,
  DatePicker as UiDatePicker,
  Dialog as UiDialog,
  HoverIntent as UiHoverIntent,
  Listbox as UiListbox,
  Popover as UiPopover,
  RadioGroup as UiRadioGroup,
  Tabs as UiTabs,
} from '@foldkit/ui'
import {
  Accordion,
  CheckboxGroup,
  DatePicker,
  Dialog,
  Menubar,
  Resizable,
  InputCopy,
  Sidebar,
  TagsInput,
  Calendar as DateSelection,
  ColorPicker,
  TreeView,
  Carousel,
  Menu,
} from 'foldkit-mixins-ui'
import * as UiTooltip from '@foldkit/ui/tooltip'
import * as UiVirtualList from '@foldkit/ui/virtualList'
import { ClipboardMessage } from 'foldkit-primitives/dom'

import {
  Billing,
  BillingGroup,
  CityBox,
  FILE_MENU,
  Format,
  Frequency,
  FrequencyBox,
  MENUBAR,
  PAGE_MENU,
  TREE_FILES,
  Notices,
  Range,
  Section,
  SectionTabs,
  Toppings,
} from '../snippets/components.js'

/** The pagination examples, each on a page of its own. */
export const PaginationExample = Schema.Literals([
  'numbered',
  'simple',
  'ends',
  'range',
  'siblings',
  'compact',
])
export type PaginationExample = typeof PaginationExample.Type

/** The checkbox group examples, each with alerts of its own. */
export const AlertsExample = Schema.Literals(['alerts', 'described', 'select-all', 'invalid'])
export type AlertsExample = typeof AlertsExample.Type

export const Model = Schema.Struct({
  tabs: UiTabs.Model,
  section: Section,
  billingGroup: UiRadioGroup.Model,
  billingRow: UiRadioGroup.Model,
  billingCards: UiRadioGroup.Model,
  billing: Billing,
  /** The slider's volume. */
  volume: Schema.Number,
  dialog: UiDialog.Model,
  alertDialog: UiDialog.Model,
  sheet: UiDialog.Model,
  popover: UiPopover.Model,
  tooltip: UiTooltip.Model,
  /** The menu a button opens and the one a right press opens, and what each last chose. */
  fileMenu: Menu.Model,
  fileChoice: Schema.Option(Schema.String),
  pageMenu: Menu.Model,
  pageChoice: Schema.Option(Schema.String),
  listbox: UiListbox.Model,
  frequency: Schema.Option(Frequency),
  combobox: UiCombobox.Model,
  city: Schema.Option(Schema.String),
  calendar: UiCalendar.Model,
  /** The day picked on the calendar. */
  selection: DateSelection.Selection,
  picker: UiDatePicker.Model,
  due: Schema.Option(Calendar.CalendarDate),
  /** The range picker, and the nights it holds. */
  stayPicker: UiDatePicker.Model,
  stayDates: DateSelection.Selection,
  notices: Notices.Model,
  range: Range,
  /** The accordion's open sections. */
  faq: Schema.Array(Schema.String),
  /** The checkboxes': the terms accepted, how many toppings, and the card's plan. */
  terms: Schema.Boolean,
  toppings: Toppings,
  teamPlan: Schema.Boolean,
  /** Whether the long breadcrumb trail was unfolded. */
  trailExpanded: Schema.Boolean,
  /** The toggle buttons' formats that are on. */
  formats: Schema.Array(Format),
  /** The page each pagination example shows, and the rows a page holds in the range one. */
  pages: Schema.Record(PaginationExample, Schema.Number),
  perPage: Schema.Number,
  /** Each checkbox group example's checked alerts. */
  alerts: Schema.Record(AlertsExample, Schema.Array(Schema.String)),
  /** The number field's servings. */
  servings: Schema.Number,
  /** The one-time code typed so far. */
  code: Schema.String,
  hoverCard: UiHoverIntent.Model,
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
  /** The carousel's slide. */
  slide: Schema.Number,
  /** The range slider's price range. */
  priceRange: Schema.Struct({ low: Schema.Number, high: Schema.Number }),
  /** The file tree's open, current and chosen rows. */
  treeView: TreeView.Model,
  /** The color picker's accent, in OKLCH. */
  accent: ColorPicker.Oklch,
  /** The trip calendar, and the range picked on it. */
  trip: UiCalendar.Model,
  tripDates: DateSelection.Selection,
  /** Whether the API key was copied. */
  inputCopied: Schema.Boolean,
  /** The tags input's tags and draft. */
  tags: TagsInput.Model,
  /** The password field's text, and whether it shows. */
  password: Schema.String,
  passwordShown: Schema.Boolean,
  /** The rating's stars, none before any are given. */
  stay: Schema.Option(Schema.Number),
})
export type Model = typeof Model.Type

export const Message = defineMessageUnion({
  GotTabs: { message: UiTabs.Message },
  GotBillingGroup: { message: UiRadioGroup.Message },
  GotBillingRow: { message: UiRadioGroup.Message },
  GotBillingCards: { message: UiRadioGroup.Message },
  TurnedVolume: { value: Schema.Number },
  GotDialog: { message: UiDialog.Message },
  OpenedDialog: {},
  ClosedDialog: {},
  GotAlertDialog: { message: UiDialog.Message },
  OpenedAlertDialog: {},
  ClosedAlertDialog: {},
  GotPopover: { message: UiPopover.Message },
  GotTooltip: { message: UiTooltip.Message },
  GotPageMenu: { message: Menu.Message },
  GotListbox: { message: UiListbox.Message },
  GotCombobox: { message: UiCombobox.Message },
  GotCalendar: { message: UiCalendar.Message },
  GotDatePicker: { message: UiDatePicker.Message },
  GotStayPicker: { message: UiDatePicker.Message },
  GotNotices: { message: Notices.Message },
  SavedDraft: {},
  ChoseRange: { range: Range },
  ToggledFaq: { id: Schema.String },
  ToggledTerms: { checked: Schema.Boolean },
  ToggledToppings: { checked: Schema.Boolean },
  ToggledTeamPlan: { checked: Schema.Boolean },
  ExpandedTrail: {},
  ToggledFormat: { format: Format },
  ChosePage: { example: PaginationExample, page: Schema.Number },
  ChosePerPage: { perPage: Schema.Number },
  ToggledAlert: { example: AlertsExample, value: Schema.String },
  SetAlerts: { example: AlertsExample, values: Schema.Array(Schema.String) },
  ChangedServings: { value: Schema.Number },
  TypedCode: { code: Schema.String },
  GotHoverCard: { message: UiHoverIntent.Message },
  GotFileMenu: { message: Menu.Message },
  TypedCommand: { query: Schema.String },
  HighlightedCommand: { value: Schema.String },
  RanCommand: { value: Schema.String },
  GotSplit: { message: Resizable.Message },
  ToggledSidebarSection: { id: Schema.String },
  ToggledSidebar: {},
  GotMenubar: { message: Menubar.Message },
  GotVirtualList: { message: UiVirtualList.Message },
  ChoseSlide: { index: Schema.Number },
  ShowedSlide: {},
  MovedPriceRange: { value: Schema.Struct({ low: Schema.Number, high: Schema.Number }) },
  GotTreeView: { message: TreeView.Message },
  PickedAccent: { value: ColorPicker.Oklch },
  GotTripCalendar: { message: UiCalendar.Message },
  GotSheet: { message: UiDialog.Message },
  OpenedSheet: {},
  ClosedSheet: {},
  PressedCopy: { text: Schema.String },
  GotCopy: { message: ClipboardMessage },
  GotTags: { message: TagsInput.Message },
  TypedPassword: { value: Schema.String },
  ToggledPassword: {},
  RatedStay: { value: Schema.Number },
})
export type Message = typeof Message.Type

// The day the page was loaded; a picker that shows another opens on the wrong month.
const today = Effect.runSync(Calendar.today.local)

export const initial: Model = {
  tabs: UiTabs.init({ id: 'preview-tabs' }),
  section: 'overview',
  billingGroup: UiRadioGroup.init({ id: 'preview-billing' }),
  billingRow: UiRadioGroup.init({ id: 'preview-billing-row' }),
  billingCards: UiRadioGroup.init({ id: 'preview-billing-cards' }),
  billing: 'yearly',
  volume: 60,
  dialog: UiDialog.init({ id: 'preview-dialog', isAnimated: true }),
  alertDialog: UiDialog.init({ id: 'preview-alert-dialog', isAnimated: true }),
  sheet: UiDialog.init({ id: 'preview-sheet', isAnimated: true }),
  popover: UiPopover.init({ id: 'preview-popover' }),
  tooltip: UiTooltip.init({ id: 'preview-tooltip' }),
  pageMenu: Menu.init('preview-page-menu', PAGE_MENU, { isAnimated: true }),
  pageChoice: Option.none(),
  listbox: UiListbox.init({ id: 'preview-frequency', isAnimated: true }),
  frequency: Option.some('Daily'),
  combobox: UiCombobox.init({ id: 'preview-city', isAnimated: true }),
  city: Option.none(),
  calendar: UiCalendar.init({ id: 'preview-calendar', today }),
  selection: DateSelection.empty('Single'),
  picker: UiDatePicker.init({
    id: 'preview-due',
    today,
    minDate: Calendar.subtractYears(today, 5),
    maxDate: Calendar.addYears(today, 5),
  }),
  due: Option.none(),
  stayPicker: UiDatePicker.init({
    id: 'preview-stay',
    today,
    minDate: today,
    maxDate: Calendar.addYears(today, 1),
  }),
  stayDates: DateSelection.empty('Range'),
  notices: Notices.init({ id: 'preview-notices' }),
  range: 'week',
  faq: ['billing'],
  terms: false,
  toppings: 'some',
  teamPlan: false,
  trailExpanded: false,
  formats: ['bold'],
  pages: { numbered: 4, simple: 2, ends: 9, range: 2, siblings: 18, compact: 5 },
  perPage: 10,
  alerts: {
    alerts: ['mentions', 'replies'],
    described: ['mentions', 'replies'],
    'select-all': ['mentions', 'offers'],
    invalid: [],
  },
  servings: 4,
  code: '',
  hoverCard: UiHoverIntent.init(),
  fileMenu: Menu.init('preview-file-menu', FILE_MENU, { isAnimated: true }),
  fileChoice: Option.none(),
  commandQuery: '',
  commandActive: Option.none(),
  commandRan: Option.none(),
  split: Resizable.init(0.35),
  sidebarOpen: ['workspace'],
  sidebarCollapsed: false,
  menubar: Menubar.init(MENUBAR.map(menu => `preview-menubar-${menu.label.toLowerCase()}`)),
  menubarChoice: Option.none(),
  virtualList: UiVirtualList.init({ id: 'preview-virtual-list', rowHeightPx: 36 }),
  slide: 0,
  priceRange: { low: 100, high: 350 },
  treeView: TreeView.init({ id: 'preview-tree', open: ['src'] }),
  accent: { l: 62.5, c: 0.15, h: 250 },
  trip: UiCalendar.init({ id: 'preview-trip', today }),
  tripDates: DateSelection.empty('Range'),
  inputCopied: false,
  tags: TagsInput.init({ id: 'preview-tags', tags: ['effect', 'foldkit'] }),
  password: '',
  passwordShown: false,
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

const billingOut = UiRadioGroup.OutMessage.match<Step, UiRadioGroup.OutMessage<Billing>>({
  Selected:
    ({ value }) =>
    model =>
      value === model.billing
        ? { model }
        : { model: modifyFields(model, { billing: () => value }) },
})

const foldBillingGroup = Update.foldChild({
  ...own('billingGroup', Message.GotBillingGroup),
  update: BillingGroup.update,
  foldOutMessage: billingOut,
})

const foldBillingRow = Update.foldChild({
  ...own('billingRow', Message.GotBillingRow),
  update: BillingGroup.update,
  foldOutMessage: billingOut,
})

const foldBillingCards = Update.foldChild({
  ...own('billingCards', Message.GotBillingCards),
  update: BillingGroup.update,
  foldOutMessage: billingOut,
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

/** What each menu last chose is the Model's; the menu has already closed. */
const chosenOf = ({
  value,
  submenu,
}: {
  readonly value: string
  readonly submenu: Option.Option<string>
}) =>
  Option.some(
    Option.match(submenu, {
      onNone: () => value,
      onSome: within => `${within} › ${value}`,
    }),
  )

const foldFileMenu = Update.foldChild({
  ...own('fileMenu', Message.GotFileMenu),
  update: Menu.update,
  foldOutMessage: Menu.OutMessage.match<Step>({
    Selected: chosen => model => ({
      model: modifyFields(model, { fileChoice: () => chosenOf(chosen) }),
    }),
  }),
})

const foldPageMenu = Update.foldChild({
  ...own('pageMenu', Message.GotPageMenu),
  update: Menu.update,
  foldOutMessage: Menu.OutMessage.match<Step>({
    Selected: chosen => model => ({
      model: modifyFields(model, { pageChoice: () => chosenOf(chosen) }),
    }),
  }),
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

const foldTags = Update.foldChild({
  ...own('tags', Message.GotTags),
  update: TagsInput.update,
})

const sheetField = own('sheet', Message.GotSheet)
const foldSheet = Update.foldChild({
  ...sheetField,
  update: UiDialog.update,
  foldOutMessage: dialogOut,
})
const openSheet = Update.foldChildStep({
  ...sheetField,
  update: UiDialog.open,
  foldOutMessage: dialogOut,
})
const closeSheet = Update.foldChildStep({
  ...sheetField,
  update: UiDialog.close,
  foldOutMessage: dialogOut,
})

const foldTripCalendar = Update.foldChild({
  ...own('trip', Message.GotTripCalendar),
  update: UiCalendar.update,
  foldOutMessage: UiCalendar.OutMessage.match<Step>({
    SelectedDate:
      ({ date }) =>
      model => ({
        model: modifyFields(model, {
          tripDates: () => DateSelection.picked(model.tripDates, date),
        }),
      }),
    ChangedViewMonth: () => same,
  }),
})

const foldTreeView = Update.foldChild({
  ...own('treeView', Message.GotTreeView),
  update: TreeView.update(TREE_FILES),
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
      model => ({
        model: modifyFields(model, {
          selection: () => DateSelection.picked(model.selection, date),
        }),
      }),
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

// The range is read when the Message arrives: it decides whether a day closes the panel.
const foldStayPicker = (model: Model, message: UiDatePicker.Message) =>
  Update.foldChild({
    ...own('stayPicker', Message.GotStayPicker),
    update: DatePicker.update(model.stayDates),
    foldOutMessage: UiDatePicker.OutMessage.match<Step>({
      SelectedDate:
        ({ date }) =>
        model => ({
          model: modifyFields(model, {
            stayDates: () => DateSelection.picked(model.stayDates, date),
          }),
        }),
      ClearedDate: () => model => ({
        model: modifyFields(model, { stayDates: () => DateSelection.empty('Range') }),
      }),
      ChangedViewMonth: () => same,
    }),
  })(model, message)

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
    GotBillingRow: ({ message }) => foldBillingRow(model, message),
    GotBillingCards: ({ message }) => foldBillingCards(model, message),
    TurnedVolume: ({ value }) =>
      value === model.volume ? { model } : { model: modifyFields(model, { volume: () => value }) },
    GotDialog: ({ message }) => foldDialog(model, message),
    OpenedDialog: () => openDialog(model),
    ClosedDialog: () => closeDialog(model),
    // An alert dialog answers only to its buttons: Escape and the backdrop do nothing.
    GotAlertDialog: ({ message }) =>
      Dialog.isDismissal(message) ? { model } : foldAlertDialog(model, message),
    OpenedAlertDialog: () => openAlertDialog(model),
    ClosedAlertDialog: () => closeAlertDialog(model),
    GotSheet: ({ message }) => foldSheet(model, message),
    OpenedSheet: () => openSheet(model),
    ClosedSheet: () => closeSheet(model),
    GotPopover: ({ message }) => foldPopover(model, message),
    GotTooltip: ({ message }) => foldTooltip(model, message),
    GotHoverCard: ({ message }) => foldHoverCard(model, message),
    GotFileMenu: ({ message }) => foldFileMenu(model, message),
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
    GotPageMenu: ({ message }) => foldPageMenu(model, message),
    GotMenubar: ({ message }) => foldMenubar(model, message),
    GotVirtualList: ({ message }) => foldVirtualList(model, message),
    ChoseSlide: ({ index }) => ({
      model: index === model.slide ? model : modifyFields(model, { slide: () => index }),
      commands: Command.mapMessages([Carousel.ShowSlide({ id: 'preview-carousel', index })], () =>
        Message.ShowedSlide(),
      ),
    }),
    ShowedSlide: () => ({ model }),
    MovedPriceRange: ({ value }) =>
      value.low === model.priceRange.low && value.high === model.priceRange.high
        ? { model }
        : { model: modifyFields(model, { priceRange: () => value }) },
    GotTreeView: ({ message }) => foldTreeView(model, message),
    PickedAccent: ({ value }) =>
      value.l === model.accent.l && value.c === model.accent.c && value.h === model.accent.h
        ? { model }
        : { model: modifyFields(model, { accent: () => value }) },
    GotTripCalendar: ({ message }) => foldTripCalendar(model, message),
    PressedCopy: ({ text }) => ({
      model,
      commands: Command.mapMessages([InputCopy.Copy({ text })], message =>
        Message.GotCopy({ message }),
      ),
    }),
    GotCopy: ({ message }) => {
      const copied = ClipboardMessage.match(message, {
        Copied: () => true,
        CopyFailed: () => false,
      })
      return copied === model.inputCopied
        ? { model }
        : { model: modifyFields(model, { inputCopied: () => copied }) }
    },
    GotTags: ({ message }) => foldTags(model, message),
    TypedPassword: ({ value }) =>
      value === model.password
        ? { model }
        : { model: modifyFields(model, { password: () => value }) },
    ToggledPassword: () => ({
      model: modifyFields(model, { passwordShown: () => !model.passwordShown }),
    }),
    RatedStay: ({ value }) =>
      Option.contains(model.stay, value)
        ? { model }
        : { model: modifyFields(model, { stay: () => Option.some(value) }) },
    GotListbox: ({ message }) => foldListbox(model, message),
    GotCombobox: ({ message }) => foldCombobox(model, message),
    GotCalendar: ({ message }) => foldCalendar(model, message),
    GotDatePicker: ({ message }) => foldDatePicker(model, message),
    GotStayPicker: ({ message }) => foldStayPicker(model, message),
    GotNotices: ({ message }) => foldNotices(model, message),
    ChoseRange: ({ range }) =>
      range === model.range ? { model } : { model: modifyFields(model, { range: () => range }) },
    ToggledFaq: ({ id }) => ({
      model: modifyFields(model, { faq: () => Accordion.toggled(model.faq, id) }),
    }),
    ToggledTerms: ({ checked }) =>
      checked === model.terms
        ? { model }
        : { model: modifyFields(model, { terms: () => checked }) },
    // A press on the dash chooses every topping, and the next none: there is
    // no way back to some from here, as a select-all box has none.
    ToggledToppings: ({ checked }) => {
      const toppings = checked ? 'all' : 'none'
      return toppings === model.toppings
        ? { model }
        : { model: modifyFields(model, { toppings: () => toppings }) }
    },
    ToggledTeamPlan: ({ checked }) =>
      checked === model.teamPlan
        ? { model }
        : { model: modifyFields(model, { teamPlan: () => checked }) },
    ExpandedTrail: () =>
      model.trailExpanded
        ? { model }
        : { model: modifyFields(model, { trailExpanded: () => true }) },
    ToggledFormat: ({ format }) => ({
      model: modifyFields(model, {
        formats: formats =>
          formats.includes(format) ? formats.filter(on => on !== format) : [...formats, format],
      }),
    }),
    ChosePage: ({ example, page }) =>
      page === model.pages[example]
        ? { model }
        : { model: modifyFields(model, { pages: pages => ({ ...pages, [example]: page }) }) },
    // The page that keeps the first row shown in view, at the new size.
    ChosePerPage: ({ perPage }) =>
      perPage === model.perPage
        ? { model }
        : {
            model: modifyFields(model, {
              perPage: () => perPage,
              pages: pages => ({
                ...pages,
                range: Math.floor(((pages.range - 1) * model.perPage) / perPage) + 1,
              }),
            }),
          },
    ToggledAlert: ({ example, value }) => ({
      model: modifyFields(model, {
        alerts: alerts => ({
          ...alerts,
          [example]: CheckboxGroup.toggled(alerts[example], value),
        }),
      }),
    }),
    SetAlerts: ({ example, values }) => {
      const now = model.alerts[example]
      return values.length === now.length && values.every((value, i) => value === now[i])
        ? { model }
        : { model: modifyFields(model, { alerts: alerts => ({ ...alerts, [example]: values }) }) }
    },
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

/** Each toast's timer dismisses it. */
export const subscriptions = Subscription.aggregate(
  Subscription.lift(Notices.subscriptions)<Model, Message>({
    read: model => Option.some(model.notices),
    toParentMessage: message => Message.GotNotices({ message }),
  }),
)
