/**
 * An interactive showcase of the `foldkit-mixins` + `foldkit-mixins-ui`
 * design system, styled to read like shadcn: zinc-like surfaces, hairline
 * borders, roomy corners, black primary buttons, and a red destructive tone.
 *
 * The application state is ordinary local UI state (hue, scheme, tabs, form
 * drafts, toggles, a click counter); every control draws through a shipped
 * recipe, so the page is the documentation.
 */
import { Match, Option, Schema } from 'effect'
import { Calendar as FoldkitCalendar, File, Update } from 'foldkit'
import type { Document, Html, HtmlBuilder } from 'foldkit/html'
import { childAttributes } from 'foldkit/html'
import { defineMessageUnion } from 'foldkit/message'
import { modifyFields } from 'foldkit/struct'
import {
  Combobox as UiCombobox,
  DatePicker as UiDatePicker,
  Dialog as UiDialog,
  FileDrop as UiFileDrop,
  HoverIntent as UiHoverIntent,
  Listbox as UiListbox,
  Menu as UiMenu,
  Popover as UiPopover,
  RadioGroup as UiRadioGroup,
  Tabs as UiTabs,
} from '@foldkit/ui'
import type { CalendarAttributes } from '@foldkit/ui/calendar'
import type { EntryHandlers } from '@foldkit/ui/toast'
import * as UiCheckbox from '@foldkit/ui/checkbox'
import * as UiDisclosure from '@foldkit/ui/disclosure'
import * as UiFieldset from '@foldkit/ui/fieldset'
import * as UiSelect from '@foldkit/ui/select'
import * as UiSlider from '@foldkit/ui/slider'
import * as UiSwitch from '@foldkit/ui/switch'
import * as UiTooltip from '@foldkit/ui/tooltip'
import { SlotView, Style, type SlotBuilders } from 'foldkit-mixins'
import {
  Anchor,
  Button,
  Calendar,
  CalendarSlots,
  CardSlots,
  Checkbox,
  Combobox,
  ComboboxView,
  Dialog,
  Disclosure,
  Fieldset,
  FileDrop,
  HoverIntent,
  HoverIntentSlots,
  Input,
  Listbox,
  ListboxView,
  Menu,
  MenuView,
  Patterns,
  Popover,
  RadioGroup,
  SegmentedSlots,
  Select,
  Slider,
  Switch,
  Tabs,
  Textarea,
  Toast,
  ToastView,
  Tooltip,
} from 'foldkit-mixins-ui'
import type {
  ResolvedComboboxGroup,
  ResolvedListboxGroup,
  ResolvedMenuGroup,
} from 'foldkit-mixins-ui'
import {
  AreaStyle,
  BadgeSlots,
  CalendarStyle,
  CardStyle,
  CheckStyle,
  ComboBoxStyle,
  DateChromeSlots,
  DateChromeStyle,
  DestructiveButtonStyle,
  DialogActionsSlots,
  DialogActionsStyle,
  DialogPreviewStyle,
  DisclosureStyle,
  FieldStyle,
  FieldsetStyle,
  FilledFieldStyle,
  FileDropStyle,
  FileTextSlots,
  FileTextStyle,
  GhostButtonStyle,
  HoverCardStyle,
  IconSlots,
  IconStyle,
  InputGroupSlots,
  InputGroupStyle,
  LargeButtonStyle,
  LineTabsStyle,
  ListboxStyle,
  MenuStyle,
  OutlineButtonStyle,
  PageSlots,
  PageStyle,
  PillTabsStyle,
  PlanStyle,
  PopoverStyle,
  PrimaryButtonStyle,
  RadioRowSlots,
  RadioRowStyle,
  RadioStyle,
  SecondaryButtonStyle,
  SelectStyle,
  SliderStyle,
  SmallButtonStyle,
  StatusStyle,
  ToastEntrySlots,
  ToastEntryStyle,
  ToastStyle,
  ToggleStyle,
  TooltipStyle,
} from './style.js'

// --- model -------------------------------------------------------------------

const Scheme = Schema.Union([
  Schema.Literal('system'),
  Schema.Literal('light'),
  Schema.Literal('dark'),
])
type Scheme = typeof Scheme.Type

const LineTab = Schema.Union([
  Schema.Literal('overview'),
  Schema.Literal('account'),
  Schema.Literal('settings'),
])
type LineTab = typeof LineTab.Type

const PillTab = Schema.Union([
  Schema.Literal('day'),
  Schema.Literal('week'),
  Schema.Literal('month'),
])
type PillTab = typeof PillTab.Type

const Plan = Schema.Union([
  Schema.Literal('starter'),
  Schema.Literal('pro'),
  Schema.Literal('enterprise'),
])
type Plan = typeof Plan.Type

const Contact = Schema.Union([
  Schema.Literal('email'),
  Schema.Literal('phone'),
  Schema.Literal('none'),
])
type Contact = typeof Contact.Type

const ContactGroup = UiRadioGroup.create<Contact>()
const SectionsTabs = UiTabs.create<LineTab>()
const RangeTabs = UiTabs.create<PillTab>()

const MenuAction = Schema.Union([
  Schema.Literal('Reply'),
  Schema.Literal('Forward'),
  Schema.Literal('Archive'),
  Schema.Literal('Delete'),
])
type MenuAction = typeof MenuAction.Type

const Frequency = Schema.Union([
  Schema.Literal('Daily'),
  Schema.Literal('Weekly'),
  Schema.Literal('Monthly'),
])
type Frequency = typeof Frequency.Type

const ToastPayload = Schema.Struct({
  title: Schema.String,
  maybeDescription: Schema.Option(Schema.String),
})
export type ToastPayload = typeof ToastPayload.Type

const ActionMenu = MenuView.create<MenuAction>()
const FrequencyBox = ListboxView.create<Frequency>()
const CityBox = ComboboxView.create<string>()
// Annotated: the inferred type names a foldkit internal module, which a
// composite project cannot emit a declaration for.
export const ToastStack: ReturnType<
  typeof ToastView.make<ToastPayload, typeof ToastPayload.Encoded>
> = ToastView.make(ToastPayload)

export const Model = Schema.Struct({
  hue: Schema.Number,
  scheme: Scheme,
  lineTab: LineTab,
  pillTab: PillTab,
  plan: Plan,
  name: Schema.String,
  bio: Schema.String,
  marketing: Schema.Boolean,
  notifications: Schema.Boolean,
  clicks: Schema.Number,
  country: Schema.String,
  detailsOpen: Schema.Boolean,
  contact: Contact,
  volume: Schema.Number,
  volumeSlider: UiSlider.Model,
  tooltip: UiTooltip.Model,
  contactGroup: UiRadioGroup.Model,
  sectionsTabs: UiTabs.Model,
  rangeTabs: UiTabs.Model,
  dialog: UiDialog.Model,
  hoverCard: UiHoverIntent.Model,
  menu: UiMenu.Model,
  menuChoice: Schema.String,
  listbox: UiListbox.Model,
  maybeFrequency: Schema.Option(Frequency),
  combobox: UiCombobox.Model,
  maybeCity: Schema.Option(Schema.String),
  picker: UiDatePicker.Model,
  maybeDue: Schema.Option(FoldkitCalendar.CalendarDate),
  toast: ToastStack.Model,
  drop: UiFileDrop.Model,
  files: Schema.Array(File.File),
  popover: UiPopover.Model,
  address: Schema.String,
})
export type Model = typeof Model.Type

export const Message = defineMessageUnion({
  HueSelected: { hue: Schema.Number },
  SchemeSelected: { scheme: Scheme },
  PlanSelected: { plan: Plan },
  NameTyped: { value: Schema.String },
  BioTyped: { value: Schema.String },
  MarketingToggled: { value: Schema.Boolean },
  NotificationsToggled: { value: Schema.Boolean },
  ButtonClicked: {},
  CountrySelected: { value: Schema.String },
  DetailsToggled: { value: Schema.Boolean },
  VolumeSlider: { message: UiSlider.Message },
  Tooltip: { message: UiTooltip.Message },
  ContactGroup: { message: UiRadioGroup.Message },
  SectionsTabs: { message: UiTabs.Message },
  RangeTabs: { message: UiTabs.Message },
  OpenDeleteDialog: {},
  CloseDeleteDialog: {},
  DeleteDialog: { message: UiDialog.Message },
  HoverCard: { message: UiHoverIntent.Message },
  Menu: { message: UiMenu.Message },
  Listbox: { message: UiListbox.Message },
  Combobox: { message: UiCombobox.Message },
  DatePicker: { message: UiDatePicker.Message },
  Toast: { message: ToastStack.Message },
  NotifyPressed: {},
  DropFiles: { message: UiFileDrop.Message },
  RemoveFile: { index: Schema.Number },
  Popover: { message: UiPopover.Message },
  AddressTyped: { value: Schema.String },
})
export type Message = typeof Message.Type

export type CalendarDate = typeof FoldkitCalendar.CalendarDate.Type

/** The initial Model for a day: the date picker opens on it. Tests pass a fixed date. */
export const initModel = (today: CalendarDate): Model => ({
  hue: 222,
  scheme: 'system',
  lineTab: 'overview',
  pillTab: 'week',
  plan: 'pro',
  name: '',
  bio: '',
  marketing: true,
  notifications: false,
  clicks: 0,
  country: 'us',
  detailsOpen: false,
  contact: 'email',
  volume: 60,
  volumeSlider: UiSlider.init({ id: 'volume-slider', min: 0, max: 100, step: 5 }),
  tooltip: UiTooltip.init({ id: 'hint-tooltip' }),
  contactGroup: UiRadioGroup.init({ id: 'contact-group' }),
  sectionsTabs: UiTabs.init({ id: 'sections-tabs' }),
  rangeTabs: UiTabs.init({ id: 'range-tabs' }),
  dialog: UiDialog.init({ id: 'delete-dialog' }),
  hoverCard: UiHoverIntent.init(),
  menu: UiMenu.init({ id: 'row-actions' }),
  menuChoice: '',
  listbox: UiListbox.init({ id: 'backup-frequency' }),
  maybeFrequency: Option.none(),
  combobox: UiCombobox.init({ id: 'home-city' }),
  maybeCity: Option.none(),
  picker: UiDatePicker.init({
    id: 'due-date',
    today,
    minDate: FoldkitCalendar.subtractYears(today, 5),
    maxDate: FoldkitCalendar.addYears(today, 5),
  }),
  maybeDue: Option.none(),
  toast: ToastStack.init({ id: 'notify-toast' }),
  drop: UiFileDrop.init({ id: 'attachments' }),
  files: [],
  popover: UiPopover.init({ id: 'details-popover' }),
  address: 'about',
})

export const update = (model: Model, message: Message) =>
  Message.match(message, {
    HueSelected: ({ hue }) => ({ model: modifyFields(model, { hue: () => hue }) }),
    SchemeSelected: ({ scheme }) => ({ model: modifyFields(model, { scheme: () => scheme }) }),
    PlanSelected: ({ plan }) => ({ model: modifyFields(model, { plan: () => plan }) }),
    NameTyped: ({ value }) => ({ model: modifyFields(model, { name: () => value }) }),
    BioTyped: ({ value }) => ({ model: modifyFields(model, { bio: () => value }) }),
    MarketingToggled: ({ value }) => ({
      model: modifyFields(model, { marketing: () => value }),
    }),
    NotificationsToggled: ({ value }) => ({
      model: modifyFields(model, { notifications: () => value }),
    }),
    ButtonClicked: () => ({ model: modifyFields(model, { clicks: clicks => clicks + 1 }) }),
    CountrySelected: ({ value }) => ({ model: modifyFields(model, { country: () => value }) }),
    DetailsToggled: ({ value }) => ({
      model: modifyFields(model, { detailsOpen: () => value }),
    }),
    VolumeSlider: ({ message }) => foldVolumeSlider(model, message),
    Tooltip: ({ message }) => foldTooltip(model, message),
    ContactGroup: ({ message }) => foldContactGroup(model, message),
    SectionsTabs: ({ message }) => foldSectionsTabs(model, message),
    RangeTabs: ({ message }) => foldRangeTabs(model, message),
    OpenDeleteDialog: () => foldDeleteDialogOpen(model),
    CloseDeleteDialog: () => foldDeleteDialogClose(model),
    DeleteDialog: ({ message }) => foldDeleteDialog(model, message),
    HoverCard: ({ message }) => foldHoverCard(model, message),
    Menu: ({ message }) => foldMenu(model, message),
    Listbox: ({ message }) => foldListbox(model, message),
    Combobox: ({ message }) => foldCombobox(model, message),
    DatePicker: ({ message }) => foldDatePicker(model, message),
    Toast: ({ message }) => foldToast(model, message),
    NotifyPressed: () =>
      foldToastShow(model, {
        variant: 'Success',
        payload: {
          title: 'Saved',
          maybeDescription: Option.some('Your changes are live.'),
        },
      }),
    DropFiles: ({ message }) => foldDropFiles(model, message),
    RemoveFile: ({ index }) => ({
      model: modifyFields(model, { files: files => files.filter((_, at) => at !== index) }),
    }),
    Popover: ({ message }) => foldPopover(model, message),
    AddressTyped: ({ value }) => ({ model: modifyFields(model, { address: () => value }) }),
  })

/**
 * The volume slider's interaction state lives beside the value it writes:
 * the child owns the drag, the parent owns the number, and each
 * `ChangedValue` the drag or keyboard produces becomes the value (already
 * snapped and clamped by the component).
 */
const foldVolumeSlider = Update.foldChild({
  update: UiSlider.update,
  read: (model: Model) => Option.some(model.volumeSlider),
  write: (model, volumeSlider) => modifyFields(model, { volumeSlider: () => volumeSlider }),
  toParentMessage: message => Message.VolumeSlider({ message }),
  foldOutMessage: UiSlider.OutMessage.match<Update.Step<Model, Message>>({
    ChangedValue:
      ({ value }) =>
      model => ({
        model: modifyFields(model, { volume: () => value }),
      }),
  }),
})

/** Visibility notifications need no parent state: showing is the child's own fact. */
const foldTooltip = Update.foldChild({
  update: UiTooltip.update,
  read: (model: Model) => Option.some(model.tooltip),
  write: (model, tooltip) => modifyFields(model, { tooltip: () => tooltip }),
  toParentMessage: message => Message.Tooltip({ message }),
  foldOutMessage: UiTooltip.OutMessage.match<Update.Step<Model, Message>>({
    Shown: () => model => ({ model }),
    Hidden: () => model => ({ model }),
  }),
})

/** The contact preference lives in the parent; the group owns focus only. */
const foldContactGroup = Update.foldChild({
  update: ContactGroup.update,
  read: (model: Model) => Option.some(model.contactGroup),
  write: (model, contactGroup) => modifyFields(model, { contactGroup: () => contactGroup }),
  toParentMessage: message => Message.ContactGroup({ message }),
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

const foldSectionsTabs = Update.foldChild({
  update: SectionsTabs.update,
  read: (model: Model) => Option.some(model.sectionsTabs),
  write: (model, sectionsTabs) => modifyFields(model, { sectionsTabs: () => sectionsTabs }),
  toParentMessage: message => Message.SectionsTabs({ message }),
  foldOutMessage: UiTabs.OutMessage.match<Update.Step<Model, Message>, UiTabs.OutMessage<LineTab>>({
    Selected:
      ({ value }) =>
      model => ({
        model: modifyFields(model, { lineTab: () => value }),
      }),
  }),
})

const foldRangeTabs = Update.foldChild({
  update: RangeTabs.update,
  read: (model: Model) => Option.some(model.rangeTabs),
  write: (model, rangeTabs) => modifyFields(model, { rangeTabs: () => rangeTabs }),
  toParentMessage: message => Message.RangeTabs({ message }),
  foldOutMessage: UiTabs.OutMessage.match<Update.Step<Model, Message>, UiTabs.OutMessage<PillTab>>({
    Selected:
      ({ value }) =>
      model => ({
        model: modifyFields(model, { pillTab: () => value }),
      }),
  }),
})

const foldDeleteDialogOut = UiDialog.OutMessage.match<Update.Step<Model, Message>>({
  Opened: () => model => ({ model }),
  Closed: () => model => ({ model }),
})

const foldDeleteDialog = Update.foldChild({
  update: UiDialog.update,
  read: (model: Model) => Option.some(model.dialog),
  write: (model, dialog) => modifyFields(model, { dialog: () => dialog }),
  toParentMessage: message => Message.DeleteDialog({ message }),
  foldOutMessage: foldDeleteDialogOut,
})

const foldDeleteDialogOpen = Update.foldChildStep({
  update: UiDialog.open,
  read: (model: Model) => Option.some(model.dialog),
  write: (model, dialog) => modifyFields(model, { dialog: () => dialog }),
  toParentMessage: message => Message.DeleteDialog({ message }),
  foldOutMessage: foldDeleteDialogOut,
})

const foldDeleteDialogClose = Update.foldChildStep({
  update: UiDialog.close,
  read: (model: Model) => Option.some(model.dialog),
  write: (model, dialog) => modifyFields(model, { dialog: () => dialog }),
  toParentMessage: message => Message.DeleteDialog({ message }),
  foldOutMessage: foldDeleteDialogOut,
})

const foldHoverCard = Update.foldChild({
  update: UiHoverIntent.update,
  read: (model: Model) => Option.some(model.hoverCard),
  write: (model, hoverCard) => modifyFields(model, { hoverCard: () => hoverCard }),
  toParentMessage: message => Message.HoverCard({ message }),
  foldOutMessage: UiHoverIntent.OutMessage.match<Update.Step<Model, Message>>({
    Opened: () => model => ({ model }),
    Closed: () => model => ({ model }),
  }),
})

const foldPopover = Update.foldChild({
  update: UiPopover.update,
  read: (model: Model) => Option.some(model.popover),
  write: (model, popover) => modifyFields(model, { popover: () => popover }),
  toParentMessage: message => Message.Popover({ message }),
  foldOutMessage: UiPopover.OutMessage.match<Update.Step<Model, Message>>({
    Opened: () => model => ({ model }),
    Closed: () => model => ({ model }),
  }),
})

/** The chosen action is the parent's fact; the menu already closed itself. */
const foldMenu = Update.foldChild({
  update: ActionMenu.update,
  read: (model: Model) => Option.some(model.menu),
  write: (model, menu) => modifyFields(model, { menu: () => menu }),
  toParentMessage: message => Message.Menu({ message }),
  foldOutMessage: UiMenu.OutMessage.match<
    Update.Step<Model, Message>,
    UiMenu.OutMessage<MenuAction>
  >({
    Selected:
      ({ value }) =>
      model => ({
        model: modifyFields(model, { menuChoice: () => value }),
      }),
  }),
})

const foldListbox = Update.foldChild({
  update: FrequencyBox.update,
  read: (model: Model) => Option.some(model.listbox),
  write: (model, listbox) => modifyFields(model, { listbox: () => listbox }),
  toParentMessage: message => Message.Listbox({ message }),
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
  update: CityBox.update,
  read: (model: Model) => Option.some(model.combobox),
  write: (model, combobox) => modifyFields(model, { combobox: () => combobox }),
  toParentMessage: message => Message.Combobox({ message }),
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

const foldDatePicker = Update.foldChild({
  update: UiDatePicker.update,
  read: (model: Model) => Option.some(model.picker),
  write: (model, picker) => modifyFields(model, { picker: () => picker }),
  toParentMessage: message => Message.DatePicker({ message }),
  foldOutMessage: UiDatePicker.OutMessage.match<Update.Step<Model, Message>>({
    SelectedDate:
      ({ date }) =>
      model => ({
        model: modifyFields(model, { maybeDue: () => Option.some(date) }),
      }),
    ClearedDate: () => model => ({ model: modifyFields(model, { maybeDue: () => Option.none() }) }),
    ChangedViewMonth: () => model => ({ model }),
  }),
})

const foldToast = Update.foldChild({
  update: ToastStack.update,
  read: (model: Model) => Option.some(model.toast),
  write: (model, toast) => modifyFields(model, { toast: () => toast }),
  toParentMessage: message => Message.Toast({ message }),
  foldOutMessage: ToastStack.OutMessage.match<Update.Step<Model, Message>>({
    DismissedToast: () => model => ({ model }),
  }),
})

const foldToastShow = Update.foldChild({
  update: ToastStack.show,
  read: (model: Model) => Option.some(model.toast),
  write: (model, toast) => modifyFields(model, { toast: () => toast }),
  toParentMessage: message => Message.Toast({ message }),
  foldOutMessage: ToastStack.OutMessage.match<Update.Step<Model, Message>>({
    DismissedToast: () => model => ({ model }),
  }),
})

const foldDropFiles = Update.foldChild({
  update: UiFileDrop.update,
  read: (model: Model) => Option.some(model.drop),
  write: (model, drop) => modifyFields(model, { drop: () => drop }),
  toParentMessage: message => Message.DropFiles({ message }),
  foldOutMessage: UiFileDrop.OutMessage.match<Update.Step<Model, Message>>({
    ReceivedFiles:
      ({ files }) =>
      model => ({
        model: modifyFields(model, { files: current => [...current, ...files] }),
      }),
    RejectedNonFiles: () => model => ({ model }),
  }),
})

// --- views -------------------------------------------------------------------

type PageBuilders = SlotBuilders<typeof PageSlots, Message>

const hues: ReadonlyArray<{ readonly label: string; readonly hue: number }> = [
  { label: 'Slate', hue: 222 },
  { label: 'Violet', hue: 270 },
  { label: 'Teal', hue: 172 },
  { label: 'Amber', hue: 38 },
  { label: 'Rose', hue: 336 },
]

const schemes: ReadonlyArray<{ readonly label: string; readonly scheme: Scheme }> = [
  { label: 'System', scheme: 'system' },
  { label: 'Light', scheme: 'light' },
  { label: 'Dark', scheme: 'dark' },
]

const lineTabs: ReadonlyArray<{ readonly value: LineTab; readonly label: string }> = [
  { value: 'overview', label: 'Overview' },
  { value: 'account', label: 'Account' },
  { value: 'settings', label: 'Settings' },
]

const pillTabs: ReadonlyArray<{ readonly value: PillTab; readonly label: string }> = [
  { value: 'day', label: 'Day' },
  { value: 'week', label: 'Week' },
  { value: 'month', label: 'Month' },
]

const plans: ReadonlyArray<{ readonly value: Plan; readonly label: string }> = [
  { value: 'starter', label: 'Starter' },
  { value: 'pro', label: 'Pro' },
  { value: 'enterprise', label: 'Enterprise' },
]

/**
 * The section tabs, live: the component owns focus and arrow-key movement,
 * the Model owns which tab shows. Only the active panel renders.
 */
const tabPanels: Record<LineTab, string> = {
  overview: 'Overview: everything, one screen.',
  account: 'Account: who pays and who belongs.',
  settings: 'Settings: knobs for the whole page.',
}

const LineTabsView = (
  model: Pick<Model, 'lineTab' | 'sectionsTabs'>,
  h: HtmlBuilder<Message>,
): Html =>
  h.submodel({
    slotId: model.sectionsTabs.id,
    model: model.sectionsTabs,
    view: SectionsTabs.view,
    viewInputs: {
      tabs: lineTabs.map(tab => tab.value),
      selectedValue: model.lineTab,
      ariaLabel: 'Sections',
      toView: render => {
        const resolved = Tabs.resolve(render, [LineTabsStyle.mixin], { input: undefined, h })
        return h.div(resolved.tablist, [
          ...resolved.tabs.map(tab => h.button(tab.tab, [lineTabs[tab.index]?.label ?? tab.value])),
          ...resolved.tabs
            .filter(tab => tab.index === resolved.activeIndex)
            .map(tab => h.div(tab.panel, [tabPanels[tab.value]])),
        ])
      },
    },
    toParentMessage: message => Message.SectionsTabs({ message }),
  })

const PillTabsView = (model: Pick<Model, 'pillTab' | 'rangeTabs'>, h: HtmlBuilder<Message>): Html =>
  h.submodel({
    slotId: model.rangeTabs.id,
    model: model.rangeTabs,
    view: RangeTabs.view,
    viewInputs: {
      tabs: pillTabs.map(tab => tab.value),
      selectedValue: model.pillTab,
      ariaLabel: 'Range',
      toView: render => {
        const resolved = Tabs.resolve(render, [PillTabsStyle.mixin], { input: undefined, h })
        return h.div(resolved.tablist, [
          ...resolved.tabs.map(tab => h.button(tab.tab, [pillTabs[tab.index]?.label ?? tab.value])),
        ])
      },
    },
    toParentMessage: message => Message.RangeTabs({ message }),
  })

const PlanView = SlotView.forMessages<Message>()
  .define(SegmentedSlots, (active: Plan, slots, h) =>
    h.div(slots.group.attrs([h.Role('group'), h.AriaLabel('Plan')]), [
      ...plans.map(plan =>
        h.button(
          slots.option.attrs([
            h.Type('button'),
            h.AriaPressed(active === plan.value ? 'true' : 'false'),
            h.OnClick(Message.PlanSelected({ plan: plan.value })),
          ]),
          [plan.label],
        ),
      ),
    ]),
  )
  .pipe(Style.attach(PlanStyle))

const BadgesView = SlotView.forMessages<Message>()
  .define(BadgeSlots, (_input: unknown, slots, h) =>
    h.div(slots.row.attrs(), [
      ...(
        [
          ['plain', 'Draft'],
          ['ok', 'Live'],
          ['warn', 'Expiring'],
          ['info', 'New'],
          ['bad', 'Failed'],
        ] as const
      ).map(([state, label]) =>
        h.span(slots.badge.attrs([h.DataAttribute('state', state)]), [label]),
      ),
    ]),
  )
  .pipe(Style.attach(StatusStyle.style))

/**
 * The delete confirmation, live: a real modal with focus trap, Escape to
 * cancel, and backdrop click. Nothing is actually deleted. The recipe's
 * close bundle draws the corner X; the actions dispatch a parent message
 * that runs the close step, so each keeps its own button styling.
 */
const DialogDemo = (model: Pick<Model, 'dialog'>, h: HtmlBuilder<Message>): Html =>
  h.submodel({
    slotId: model.dialog.id,
    model: model.dialog,
    view: UiDialog.view,
    viewInputs: {
      hasDescription: true,
      toView: render => {
        const dialog = Dialog.resolve(render, [DialogPreviewStyle.mixin], { input: undefined, h })
        const actions = SlotView.buildersFor(DialogActionsSlots, [DialogActionsStyle.style.mixin], {
          input: undefined,
          h,
        })
        return h.dialog(
          dialog.dialog,
          dialog.isVisible
            ? [
                h.div(dialog.backdrop),
                h.div(dialog.panel, [
                  h.button(dialog.closeButton, [h.span([], ['×'])]),
                  h.h2(dialog.title, ['Delete this project?']),
                  h.p(dialog.description, [
                    'It goes for good, with its history. This dialog is a live modal: focus is trapped, Escape cancels.',
                  ]),
                  h.div(actions.actions.attrs(), [
                    Button.view(
                      {
                        label: 'Delete',
                        style: DestructiveButtonStyle,
                        onClick: Message.CloseDeleteDialog(),
                      },
                      h,
                    ),
                    Button.view(
                      {
                        label: 'Cancel',
                        style: GhostButtonStyle,
                        onClick: Message.CloseDeleteDialog(),
                      },
                      h,
                    ),
                  ]),
                ]),
              ]
            : [],
        )
      },
    },
    toParentMessage: message => Message.DeleteDialog({ message }),
  })

const CardView = SlotView.forMessages<Message>()
  .define(CardSlots, (clicks: number, slots, h) =>
    h.article(slots.root.attrs(), [
      h.div(slots.header.attrs(), [
        h.h3(slots.title.attrs(), ['Usage this month']),
        h.p(slots.description.attrs(), ['Synced just now']),
      ]),
      h.p(slots.content.attrs(), [
        `The team pressed a button ${clicks} ${clicks === 1 ? 'time' : 'times'}. A card is page slots plus a recipe: no new CSS.`,
      ]),
      h.div(slots.footer.attrs(), [
        Button.view(
          { label: 'View report', style: PrimaryButtonStyle, onClick: Message.ButtonClicked() },
          h,
        ),
        Button.view({ label: 'Dismiss', style: GhostButtonStyle }, h),
      ]),
    ]),
  )
  .pipe(Style.attach(CardStyle))

const countries: ReadonlyArray<readonly [value: string, label: string]> = [
  ['us', 'United States'],
  ['ca', 'Canada'],
  ['gb', 'United Kingdom'],
  ['au', 'Australia'],
]

const menuItems: ReadonlyArray<MenuAction> = ['Reply', 'Forward', 'Archive', 'Delete']

const itemGroupKey = (item: MenuAction): string =>
  item === 'Archive' || item === 'Delete' ? 'Manage' : 'Respond'

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

const formatIsoDate = (date: CalendarDate): string =>
  `${date.year}-${String(date.month).padStart(2, '0')}-${String(date.day).padStart(2, '0')}`

const formatFileSize = (bytes: number): string =>
  bytes < 1024
    ? `${bytes} B`
    : bytes < 1024 * 1024
      ? `${(bytes / 1024).toFixed(1)} KB`
      : `${(bytes / (1024 * 1024)).toFixed(1)} MB`

const drawMenuGroups = (
  groups: ReadonlyArray<ResolvedMenuGroup<Message>>,
  h: HtmlBuilder<Message>,
): ReadonlyArray<Html> =>
  groups.flatMap(group => {
    const drawn = group.items.map(item => h.keyed('div')(item.key, item.attributes, [item.content]))
    if (group.group === undefined) return drawn
    const headed =
      group.heading === undefined
        ? []
        : [h.keyed('div')(group.heading.id, group.heading.attributes, [group.heading.content])]
    return [
      ...(group.separator === undefined
        ? []
        : [h.keyed('div')(group.separator.key, group.separator.attributes)]),
      h.keyed('div')(group.group.key, group.group.attributes, [...headed, ...drawn]),
    ]
  })

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
 * The live volume slider: the component owns the drag and keyboard
 * interaction (through its drag subscriptions), the Model owns the value,
 * and the style attaches through the Slot contract in `toView`.
 */
const SliderDemo = (model: Pick<Model, 'volume' | 'volumeSlider'>, h: HtmlBuilder<Message>): Html =>
  h.submodel({
    slotId: model.volumeSlider.id,
    model: model.volumeSlider,
    view: UiSlider.view,
    viewInputs: {
      value: model.volume,
      ariaLabel: 'Volume',
      formatValue: (value: number) => `${Math.round(value)} percent`,
      toView: attributes => {
        const slider = Slider.resolve(attributes, [SliderStyle.mixin], { input: undefined, h })
        return h.div(slider.root, [
          h.label(slider.label, [`Volume: ${model.volume}`]),
          h.div(slider.track, [h.div(slider.filledTrack, []), h.div(slider.thumb, [])]),
        ])
      },
    },
    toParentMessage: message => Message.VolumeSlider({ message }),
  })

/**
 * A row-action menu: grouped items, one disabled, the choice reported back.
 * The draw mirrors the fork's default markup with the resolved bundles.
 */
const MenuDemo = (model: Pick<Model, 'menu' | 'menuChoice'>, h: HtmlBuilder<Message>): Html =>
  h.submodel({
    slotId: model.menu.id,
    model: model.menu,
    view: ActionMenu.view,
    viewInputs: {
      anchor: { placement: 'bottom-start', gap: 4, padding: 8 },
      items: menuItems,
      itemToConfig: (item: MenuAction) => ({ content: h.span([], [item]) }),
      buttonContent: h.span([], ['Actions']),
      isItemDisabled: (item: MenuAction) => item === 'Archive',
      itemGroupKey,
      groupToHeading: (groupKey: string) =>
        groupKey === 'Manage' ? { content: h.span([], ['Manage']) } : undefined,
      toView: Menu.toView([MenuStyle.mixin], { h }, resolved =>
        h.div(resolved.wrapper, [
          h.keyed('button')(`${resolved.id}-button`, resolved.button, [resolved.buttonContent]),
          ...(resolved.backdrop === undefined
            ? []
            : [h.keyed('div')(resolved.backdrop.key, resolved.backdrop.attributes)]),
          ...(resolved.items === undefined
            ? []
            : [
                h.keyed('div')(
                  resolved.items.key,
                  resolved.items.attributes,
                  resolved.scroll === undefined
                    ? drawMenuGroups(resolved.groups, h)
                    : [h.div(resolved.scroll, drawMenuGroups(resolved.groups, h))],
                ),
              ]),
        ]),
      ),
    },
    toParentMessage: message => Message.Menu({ message }),
  })

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
      toView: Listbox.toView([ListboxStyle.mixin], { h }, resolved =>
        h.div(resolved.wrapper, [
          h.keyed('button')(`${resolved.id}-button`, resolved.button, [resolved.buttonContent]),
          ...(resolved.backdrop === undefined
            ? []
            : [h.keyed('div')(resolved.backdrop.key, resolved.backdrop.attributes)]),
          ...(resolved.items === undefined
            ? []
            : [
                h.keyed('div')(
                  resolved.items.key,
                  resolved.items.attributes,
                  resolved.scroll === undefined
                    ? drawListboxGroups(resolved.groups, h)
                    : [h.div(resolved.scroll, drawListboxGroups(resolved.groups, h))],
                ),
              ]),
          ...resolved.hiddenInputs,
        ]),
      ),
    },
    toParentMessage: message => Message.Listbox({ message }),
  })
}

const drawListboxGroups = (
  groups: ReadonlyArray<ResolvedListboxGroup<Message>>,
  h: HtmlBuilder<Message>,
): ReadonlyArray<Html> =>
  groups.flatMap(group => {
    const drawn = group.items.map(item => h.keyed('div')(item.key, item.attributes, [item.content]))
    if (group.group === undefined) return drawn
    const headed =
      group.heading === undefined
        ? []
        : [h.keyed('div')(group.heading.id, group.heading.attributes, [group.heading.content])]
    return [
      ...(group.separator === undefined
        ? []
        : [h.keyed('div')(group.separator.key, group.separator.attributes)]),
      h.keyed('div')(group.group.key, group.group.attributes, [...headed, ...drawn]),
    ]
  })

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
      toView: Combobox.toView([ComboBoxStyle.mixin], { h }, resolved =>
        h.div(resolved.wrapper, [
          h.div(resolved.inputWrapper, [
            h.input([...resolved.input, h.Placeholder('Search cities…')]),
            ...(resolved.toggleButton === undefined
              ? []
              : [
                  h.keyed('button')(resolved.toggleButton.key, resolved.toggleButton.attributes, [
                    resolved.toggleButton.content,
                  ]),
                ]),
          ]),
          ...(resolved.backdrop === undefined
            ? []
            : [h.keyed('div')(resolved.backdrop.key, resolved.backdrop.attributes)]),
          ...(resolved.items === undefined
            ? []
            : [
                h.keyed('div')(
                  resolved.items.key,
                  resolved.items.attributes,
                  resolved.scroll === undefined
                    ? drawComboboxGroups(resolved.groups, h)
                    : [h.div(resolved.scroll, drawComboboxGroups(resolved.groups, h))],
                ),
              ]),
          ...resolved.hiddenInputs,
        ]),
      ),
    },
    toParentMessage: message => Message.Combobox({ message }),
  })

const drawComboboxGroups = (
  groups: ReadonlyArray<ResolvedComboboxGroup<Message>>,
  h: HtmlBuilder<Message>,
): ReadonlyArray<Html> =>
  groups.flatMap(group => {
    const drawn = group.items.map(item => h.keyed('div')(item.key, item.attributes, [item.content]))
    if (group.group === undefined) return drawn
    const headed =
      group.heading === undefined
        ? []
        : [h.keyed('div')(group.heading.id, group.heading.attributes, [group.heading.content])]
    return [
      ...(group.separator === undefined
        ? []
        : [h.keyed('div')(group.separator.key, group.separator.attributes)]),
      h.keyed('div')(group.group.key, group.group.attributes, [...headed, ...drawn]),
    ]
  })

/** The month grid any calendar draws through, here in the picker's panel. */
const drawCalendarGrid = (
  attributes: CalendarAttributes,
  chrome: SlotBuilders<typeof DateChromeSlots, Message>,
  h: HtmlBuilder<Message>,
): Html => {
  const calendar = Calendar.resolve(attributes, [CalendarStyle.mixin], { input: undefined, h })
  return Match.value(calendar).pipe(
    Match.tagsExhaustive({
      Days: days =>
        h.div(days.root, [
          h.div(chrome.header.attrs(), [
            h.button(days.previousMonthButton, ['‹']),
            h.button(days.headingButton, [days.heading.text]),
            h.button(days.nextMonthButton, ['›']),
          ]),
          h.div(days.grid, [
            h.div(days.headerRow, [
              ...days.columnHeaders.map(header => h.div(header.attributes, [header.name])),
            ]),
            ...days.weeks.map(week =>
              h.div(week.attributes, [
                ...week.cells.map(cell =>
                  h.div(cell.cellAttributes, [h.button(cell.buttonAttributes, [cell.label])]),
                ),
              ]),
            ),
          ]),
        ]),
      Months: months =>
        h.div(months.root, [
          h.div(chrome.monthHeader.attrs(), [
            h.button(months.headingButton, [months.heading.text]),
          ]),
          h.div(
            months.grid,
            months.cells.map(cell =>
              h.div(cell.cellAttributes, [h.button(cell.buttonAttributes, [cell.shortLabel])]),
            ),
          ),
        ]),
      Years: years =>
        h.div(years.root, [
          h.div(chrome.header.attrs(), [
            h.button(years.previousPageButton, ['«']),
            h.span([], [years.heading.text]),
            h.button(years.nextPageButton, ['»']),
          ]),
          h.div(
            years.grid,
            years.cells.map(cell =>
              h.div(cell.cellAttributes, [h.button(cell.buttonAttributes, [cell.label])]),
            ),
          ),
        ]),
    }),
  )
}

/**
 * A due-date picker: the shell rides attribute bundles (the adapter resolves
 * in the child's own universe), while the month grid inside draws through
 * CalendarSlots like the preview above.
 */
const DatePickerDemo = (
  model: Pick<Model, 'picker' | 'maybeDue'>,
  h: HtmlBuilder<Message>,
): Html => {
  const chrome = SlotView.buildersFor(DateChromeSlots, [DateChromeStyle.style.mixin], {
    input: model,
    h,
  })
  return h.submodel({
    slotId: model.picker.id,
    model: model.picker,
    view: UiDatePicker.view,
    viewInputs: {
      // Locked: paging months and years resizes the panel, which must not
      // flip it to the other side of the trigger mid-use.
      anchor: { placement: 'bottom-start', gap: 4, padding: 8, isPlacementLocked: true },
      maybeSelectedDate: model.maybeDue,
      triggerContent: maybeDue =>
        h.span(
          [],
          [Option.match(maybeDue, { onNone: () => 'Pick a date', onSome: formatIsoDate })],
        ),
      attributes: childAttributes(chrome.picker.attrs()),
      triggerAttributes: childAttributes(chrome.trigger.attrs()),
      panelAttributes: childAttributes(chrome.panel.attrs()),
      backdropAttributes: childAttributes(chrome.backdrop.attrs()),
      toCalendarView: attributes => drawCalendarGrid(attributes, chrome, h),
    },
    toParentMessage: message => Message.DatePicker({ message }),
  })
}

/** A notify button and the stack it feeds: entries auto-dismiss. */
const ToastDemo = (model: Pick<Model, 'toast'>, h: HtmlBuilder<Message>): Html => {
  const entry = SlotView.buildersFor(ToastEntrySlots, [ToastEntryStyle.style.mixin], {
    input: model,
    h,
  })
  // A bare wrapper: the section's stack layout forces `inline-size: 100%` on
  // its direct children, which would stretch the fixed container full-width.
  // The wrapper takes that rule instead, and the container keeps its size.
  return h.div(
    [],
    [
      h.submodel({
        slotId: model.toast.id,
        model: model.toast,
        view: ToastStack.view,
        viewInputs: {
          position: 'BottomRight',
          entryToView: (toastEntry, handlers: EntryHandlers) =>
            h.div(
              [],
              [
                h.p(entry.title.attrs(), [toastEntry.payload.title]),
                ...Option.match(toastEntry.payload.maybeDescription, {
                  onNone: () => [],
                  onSome: text => [h.p(entry.text.attrs(), [text])],
                }),
                h.button(entry.dismiss.attrs(handlers.dismiss), ['Dismiss']),
              ],
            ),
          toView: Toast.toView([ToastStyle.mixin], { h }, resolved =>
            h.div(
              resolved.container,
              resolved.entries.map(entryView =>
                h.keyed('div')(entryView.id, entryView.attributes, [entryView.content]),
              ),
            ),
          ),
        },
        toParentMessage: message => Message.Toast({ message }),
      }),
    ],
  )
}

/** An attachment drop zone with the files it collected. */
const FileDropDemo = (
  model: Pick<Model, 'drop' | 'files'>,
  slots: PageBuilders,
  h: HtmlBuilder<Message>,
): Html => {
  const text = SlotView.buildersFor(FileTextSlots, [FileTextStyle.style.mixin], { input: model, h })
  return h.div(
    [],
    [
      h.submodel({
        slotId: model.drop.id,
        model: model.drop,
        view: UiFileDrop.view,
        viewInputs: {
          multiple: true,
          toView: attributes => {
            const resolved = FileDrop.resolve(attributes, [FileDropStyle.mixin], { h })
            return h.label(resolved.root, [
              h.p(text.primary.attrs(), ['Drop files or click to browse']),
              h.p(text.secondary.attrs(), [
                model.files.length === 0
                  ? 'Any file type. This demo just lists them.'
                  : `${model.files.length} attached.`,
              ]),
              h.input(resolved.input),
            ])
          },
        },
        toParentMessage: message => Message.DropFiles({ message }),
      }),
      ...model.files.map((file, index) =>
        h.div(slots.row.attrs([h.Key(`${File.name(file)}:${File.size(file)}`)]), [
          h.span(text.fileName.attrs(), [
            `${File.name(file)} (${formatFileSize(File.size(file))})`,
          ]),
          Button.view(
            {
              label: 'Remove',
              style: GhostButtonStyle,
              onClick: Message.RemoveFile({ index }),
            },
            h,
          ),
        ]),
      ),
    ],
  )
}

const weekDays: ReadonlyArray<string> = ['S', 'M', 'T', 'W', 'T', 'F', 'S']
const monthDays: ReadonlyArray<number> = [12, 13, 14, 15, 16, 17, 18]

const CalendarPreview = SlotView.forMessages<Message>()
  .define(CalendarSlots, (selected: number, slots, h) => {
    const card = SlotView.buildersFor(CardSlots, [CardStyle.mixin], { input: selected, h })
    // The recipe pads content, not the root: the calendar rides the content
    // slot so the preview card breathes.
    return h.div(card.root.attrs(), [
      h.div(card.content.attrs(), [
        h.div(slots.root.attrs(), [
          h.div(
            slots.grid.attrs([h.Role('grid'), h.AriaLabel('October 2026'), h.AriaRowcount(1)]),
            [
              h.div(slots.headerRow.attrs([h.Role('row')]), [
                ...weekDays.map(day =>
                  h.span(slots.columnHeader.attrs([h.Role('columnheader')]), [day]),
                ),
              ]),
              h.div(slots.weekRow.attrs([h.Role('row')]), [
                ...monthDays.map(day =>
                  h.span(slots.dayCell.attrs([h.Role('gridcell')]), [
                    h.button(
                      slots.dayButton.attrs([
                        h.Type('button'),
                        ...(day === selected ? [h.DataAttribute('selected', 'true')] : []),
                        h.AriaLabel(`October ${day}`),
                      ]),
                      [String(day)],
                    ),
                  ]),
                ),
              ]),
            ],
          ),
        ]),
      ]),
    ])
  })
  .pipe(Style.attach(CalendarStyle))

/**
 * A live details popover: anchored against its trigger, dismissed on escape
 * or outside press. The draw places the resolved bundles; the backdrop only
 * exists while open.
 */
const PopoverDemo = (model: Pick<Model, 'popover'>, h: HtmlBuilder<Message>): Html =>
  h.submodel({
    slotId: model.popover.id,
    model: model.popover,
    view: UiPopover.view,
    viewInputs: {
      anchor: { placement: 'bottom-start', gap: 4, padding: 8 },
      toView: attributes => {
        const resolved = Popover.resolve(attributes, [PopoverStyle.mixin], {
          input: undefined,
          h,
        })
        return h.div(
          [],
          [
            h.button(resolved.button, ['Show details']),
            ...(resolved.isVisible
              ? [
                  h.div(resolved.backdrop, []),
                  h.div(resolved.panel, [
                    'Project details, anchored live: six people, three open milestones, and one demo that keeps growing.',
                  ]),
                ]
              : []),
          ],
        )
      },
    },
    toParentMessage: message => Message.Popover({ message }),
  })

/**
 * The live hint tooltip: the panel renders only while the component is
 * visible — after the hover delay, or on keyboard focus — and positions
 * itself against the trigger through the anchor.
 */
const TooltipDemo = (model: Pick<Model, 'tooltip'>, h: HtmlBuilder<Message>): Html =>
  h.submodel({
    slotId: model.tooltip.id,
    model: model.tooltip,
    view: UiTooltip.view,
    viewInputs: {
      anchor: { placement: 'top', gap: 6, padding: 8 },
      toView: attributes => {
        const { trigger, panel, isVisible } = Tooltip.resolve(attributes, [TooltipStyle.mixin], {
          input: undefined,
          h,
        })
        return h.div(
          [],
          [
            h.button(trigger, ['Hover or focus me']),
            ...(isVisible ? [h.span(panel, ['A helpful hint'])] : []),
          ],
        )
      },
    },
    toParentMessage: message => Message.Tooltip({ message }),
  })

/**
 * A team-member hover card, live: open and close delays keep it from
 * flickering, and the Anchor behavior positions the panel against the
 * trigger. The panel renders only while open.
 */
const AnchorCard = Anchor.behavior(HoverIntentSlots)<unknown, Message>({
  floating: 'panel',
  config: () => ({
    buttonId: 'teammate-button',
    anchor: { placement: 'bottom-start', gap: 4, padding: 8 },
  }),
})

const HoverDemo = (model: Pick<Model, 'hoverCard'>, h: HtmlBuilder<Message>): Html =>
  h.submodel({
    slotId: 'teammate-card',
    model: model.hoverCard,
    view: UiHoverIntent.view,
    viewInputs: {
      focusTriggerSelector: '#teammate-button',
      toView: render => {
        const resolved = HoverIntent.resolve(render, [HoverCardStyle.mixin, AnchorCard.mixin], {
          input: undefined,
          h,
        })
        return h.div(
          [],
          [
            h.button(
              [...resolved.trigger, h.Type('button'), h.Id('teammate-button')],
              ['A team member'],
            ),
            ...(resolved.isVisible
              ? [
                  h.div(resolved.panel, [
                    'Wren Quan, design engineer. Moving into the card keeps it open; leaving either side starts the close delay.',
                  ]),
                ]
              : []),
          ],
        )
      },
    },
    toParentMessage: message => Message.HoverCard({ message }),
  })

const InputGroupDemo = SlotView.forMessages<Message>()
  .define(InputGroupSlots, (value: string, slots, h) =>
    h.div(
      [],
      [
        h.div(slots.group.attrs(), [
          h.span(slots.affix.attrs(), ['/']),
          h.input(
            slots.control.attrs([
              h.Type('text'),
              h.Value(value),
              h.AriaLabel('Site path'),
              h.OnInput((typed: string) => Message.AddressTyped({ value: typed })),
            ]),
          ),
        ]),
      ],
    ),
  )
  .pipe(Style.attach(InputGroupStyle.style))

const IconsDemo = SlotView.forMessages<Message>()
  .define(IconSlots, (_input: unknown, slots, h) =>
    h.div(slots.row.attrs(), [
      h.span(slots.chip.attrs([h.DataAttribute('icon', 'dot')]), ['Status']),
      h.span(slots.chip.attrs([h.DataAttribute('icon', 'star')]), ['Featured']),
    ]),
  )
  .pipe(Style.attach(IconStyle.style))

/**
 * The `:root` override the view renders from the Model. The hue knob and
 * color scheme must be set on `:root`, not on the page: derived tokens
 * (`--fk-hue-accent`, every `light-dark()` color) are computed at `:root`
 * and inherited already resolved, so a knob overridden on a subtree never
 * re-derives them. Unlayered, this wins over the layered token declarations.
 */
export const rootOverrideOf = (model: Pick<Model, 'hue' | 'scheme'>): string =>
  `:root{--fk-knob-accent-h:${model.hue};color-scheme:${model.scheme === 'system' ? 'light dark' : model.scheme}}`

const fillSwatch = (
  slots: PageBuilders,
  h: HtmlBuilder<Message>,
  group: string,
  name: string,
): Html =>
  h.div(slots.swatch.attrs(), [
    h.div(slots.chip.attrs([h.Style({ background: `var(--fk-${group}-${name})` })]), []),
    h.p(slots.swatchName.attrs(), [`${name}`]),
  ])

const textSwatch = (slots: PageBuilders, h: HtmlBuilder<Message>, name: string): Html =>
  h.div(slots.swatch.attrs(), [
    h.div(
      slots.chip.attrs([
        h.Style({
          background: 'var(--fk-surface-base)',
          color: `var(--fk-text-${name})`,
          display: 'grid',
          placeItems: 'center',
          fontWeight: '600',
        }),
      ]),
      ['Aa'],
    ),
    h.p(slots.swatchName.attrs(), [`${name}`]),
  ])

export const view = (model: Model, h: HtmlBuilder<Message>): Document => {
  const slots = SlotView.buildersFor(PageSlots, [PageStyle.style.mixin], { input: model, h })
  const rootOverride = rootOverrideOf(model)
  const tokensCode = [
    'palette = Theme.oklch((',
    '  accent: { h: 222, c: 0.09, l: 52% },',
    '  surfaceSaturation: 0.003,',
    ')) with radius-factor 1.4',
    '',
    'Default     -> Button variant primary',
    'Secondary   -> tone neutral, solid',
    'Outline     -> tone neutral, outline',
    'Ghost       -> tone neutral, ghost',
    'Destructive -> tone danger, solid',
  ].join('\n')
  return {
    title: 'Design system · Foldkit Plus',
    body: h.main(
      slots.root.attrs([
        h.Style({
          background: 'var(--fk-surface-base)',
          color: 'var(--fk-text-default)',
        }),
      ]),
      [
        h.style([], [rootOverride]),
        h.header(slots.header.attrs(), [
          h.p(slots.eyebrow.attrs(), ['Foldkit Plus · Design system']),
          h.h1(slots.title.attrs(), ['Components in a shadcn skin']),
          h.p(slots.lede.attrs(), [
            'Every control below draws through a shipped foldkit-mixins-ui recipe over Theme.oklch tokens. The shadcn look is two decisions: near-zero surfaceSaturation with a larger radius-factor, and one recipe selection per intent.',
          ]),
        ]),
        h.div(slots.controls.attrs(), [
          h.div(slots.controlGroup.attrs(), [
            h.p(slots.controlLabel.attrs(), ['Accent hue (re-derives live)']),
            h.div(slots.row.attrs(), [
              ...hues.map(preset =>
                Button.view(
                  {
                    label: preset.label,
                    style: model.hue === preset.hue ? SecondaryButtonStyle : GhostButtonStyle,
                    onClick: Message.HueSelected({ hue: preset.hue }),
                  },
                  h,
                ),
              ),
            ]),
          ]),
          h.div(slots.controlGroup.attrs(), [
            h.p(slots.controlLabel.attrs(), ['Scheme']),
            h.div(slots.row.attrs(), [
              ...schemes.map(entry =>
                Button.view(
                  {
                    label: entry.label,
                    style: model.scheme === entry.scheme ? SecondaryButtonStyle : GhostButtonStyle,
                    onClick: Message.SchemeSelected({ scheme: entry.scheme }),
                  },
                  h,
                ),
              ),
            ]),
          ]),
        ]),
        h.nav(slots.nav.attrs([h.AriaLabel('Sections')]), [
          ...(
            [
              ['colors', 'Colors'],
              ['buttons', 'Buttons'],
              ['form', 'Form'],
              ['choice', 'Choice'],
              ['menu', 'Menu'],
              ['feedback', 'Feedback'],
              ['overlays', 'Overlays'],
              ['navigation', 'Navigation'],
              ['calendar', 'Date'],
              ['card', 'Card'],
              ['utilities', 'Utilities'],
              ['tokens', 'Tokens'],
            ] as const
          ).map(([id, label]) => h.a(slots.navLink.attrs([h.Href(`#${id}`)]), [label])),
        ]),
        h.section(slots.section.attrs([h.Id('colors')]), [
          h.h2(slots.sectionTitle.attrs(), ['Colors']),
          h.p(slots.sectionText.attrs(), [
            'Token families, as var(--fk-group-name) references. Picking a hue above rewrites one knob and every family follows.',
          ]),
          h.div(slots.swatchGrid.attrs(), [
            ...['bedrock', 'base', 'subtle', 'muted', 'default', 'overt'].map(name =>
              fillSwatch(slots, h, 'surface', name),
            ),
          ]),
          h.div(slots.swatchGrid.attrs(), [
            ...['subtle', 'default', 'overt', 'focus'].map(name =>
              fillSwatch(slots, h, 'outline', name),
            ),
            ...['overt', 'default', 'muted', 'subtle', 'link'].map(name =>
              textSwatch(slots, h, name),
            ),
          ]),
          ...['accent', 'secondary', 'tertiary', 'success', 'warning', 'error', 'info'].map(
            family =>
              h.div(slots.swatchGrid.attrs(), [
                ...['subtle', 'default', 'hover', 'outline', 'ink'].map(name =>
                  fillSwatch(slots, h, family, name),
                ),
              ]),
          ),
        ]),
        h.section(slots.section.attrs([h.Id('buttons')]), [
          h.h2(slots.sectionTitle.attrs(), ['Buttons']),
          h.p(slots.sectionText.attrs(), [
            `Default is primary ink, Secondary a neutral fill, then Outline, Ghost, and Destructive. Pressed ${model.clicks} ${model.clicks === 1 ? 'time' : 'times'} — every button dispatches.`,
          ]),
          h.div(slots.row.attrs(), [
            Button.view(
              { label: 'Default', style: PrimaryButtonStyle, onClick: Message.ButtonClicked() },
              h,
            ),
            Button.view(
              {
                label: 'Secondary',
                style: SecondaryButtonStyle,
                onClick: Message.ButtonClicked(),
              },
              h,
            ),
            Button.view(
              { label: 'Outline', style: OutlineButtonStyle, onClick: Message.ButtonClicked() },
              h,
            ),
            Button.view(
              { label: 'Ghost', style: GhostButtonStyle, onClick: Message.ButtonClicked() },
              h,
            ),
            Button.view(
              {
                label: 'Destructive',
                style: DestructiveButtonStyle,
                onClick: Message.ButtonClicked(),
              },
              h,
            ),
          ]),
          h.div(slots.row.attrs(), [
            Button.view(
              { label: 'Small', style: SmallButtonStyle, onClick: Message.ButtonClicked() },
              h,
            ),
            Button.view(
              { label: 'Large', style: LargeButtonStyle, onClick: Message.ButtonClicked() },
              h,
            ),
            Button.view({ label: 'Disabled', style: PrimaryButtonStyle, disabled: true }, h),
          ]),
        ]),
        h.section(slots.section.attrs([h.Id('form')]), [
          h.h2(slots.sectionTitle.attrs(), ['Form']),
          h.p(slots.sectionText.attrs(), [
            'Input, Textarea, Checkbox, and Switch, each a headless component resolved through its slot contract — plus a drop zone for attachments.',
          ]),
          Input.view(
            {
              id: 'name',
              value: model.name,
              onInput: (value: string) => Message.NameTyped({ value }),
              placeholder: 'Ada Lovelace',
              style: FieldStyle,
              described: true,
              draw: (resolved, h) =>
                h.div(
                  [],
                  [
                    h.label(resolved.label, ['Name']),
                    h.input(resolved.input),
                    h.span(resolved.description, [
                      `Hello${model.name === '' ? '' : `, ${model.name}`}.`,
                    ]),
                  ],
                ),
            },
            h,
          ),
          Input.view(
            {
              id: 'slug',
              value: 'design-system',
              placeholder: 'slug',
              style: FilledFieldStyle,
              draw: (resolved, h) =>
                h.div(
                  [],
                  [h.label(resolved.label, ['Slug (filled, read-only)']), h.input(resolved.input)],
                ),
            },
            h,
          ),
          Textarea.view(
            {
              id: 'bio',
              value: model.bio,
              onInput: (value: string) => Message.BioTyped({ value }),
              placeholder: 'What is this space for?',
              rows: 3,
              style: AreaStyle,
              draw: (resolved, h) =>
                h.div([], [h.label(resolved.label, ['Bio']), h.textarea(resolved.textarea)]),
            },
            h,
          ),
          UiCheckbox.view(
            {
              id: 'marketing',
              isChecked: model.marketing,
              onToggle: (value: boolean) => Message.MarketingToggled({ value }),
              toView: Checkbox.toView([CheckStyle.mixin], { h }, resolved =>
                h.div(slots.row.attrs(), [
                  h.button(resolved.checkbox, []),
                  h.label(resolved.label, ['Marketing emails']),
                  h.span(resolved.description, ['Product news, monthly.']),
                ]),
              ),
            },
            h,
          ),
          UiSwitch.view(
            {
              id: 'notifications',
              isChecked: model.notifications,
              onToggle: (value: boolean) => Message.NotificationsToggled({ value }),
              toView: Switch.toView([ToggleStyle.mixin], { h }, resolved =>
                h.div(slots.row.attrs(), [
                  h.button(resolved.button, []),
                  h.label(resolved.label, ['Email notifications']),
                  h.span(resolved.description, [
                    model.notifications ? 'On: digests on Monday.' : 'Off.',
                  ]),
                ]),
              ),
            },
            h,
          ),
          FileDropDemo(model, slots, h),
        ]),
        h.section(slots.section.attrs([h.Id('choice')]), [
          h.h2(slots.sectionTitle.attrs(), ['Choice']),
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
        ]),
        h.section(slots.section.attrs([h.Id('menu')]), [
          h.h2(slots.sectionTitle.attrs(), ['Menu']),
          h.p(slots.sectionText.attrs(), [
            model.menuChoice === ''
              ? 'Grouped actions with one disabled. Open it and pick one.'
              : `Chose ${model.menuChoice}.`,
          ]),
          MenuDemo(model, h),
        ]),
        h.section(slots.section.attrs([h.Id('feedback')]), [
          h.h2(slots.sectionTitle.attrs(), ['Feedback']),
          h.p(slots.sectionText.attrs(), [
            'One badge style serves every tone through data-state; toasts stack bottom-right and dismiss themselves.',
          ]),
          BadgesView(undefined, h),
          h.div(slots.row.attrs(), [
            Button.view(
              {
                label: 'Delete this project?',
                style: DestructiveButtonStyle,
                onClick: Message.OpenDeleteDialog(),
              },
              h,
            ),
          ]),
          DialogDemo(model, h),
          h.div(slots.row.attrs(), [
            Button.view(
              { label: 'Notify', style: PrimaryButtonStyle, onClick: Message.NotifyPressed() },
              h,
            ),
          ]),
          ToastDemo(model, h),
        ]),
        h.section(slots.section.attrs([h.Id('overlays')]), [
          h.h2(slots.sectionTitle.attrs(), ['Overlays']),
          h.p(slots.sectionText.attrs(), [
            'Floating UI with real state: a popover that anchors, a tooltip that shows on hover or focus, and a hover card. Escape or an outside press dismisses them.',
          ]),
          PopoverDemo(model, h),
          TooltipDemo(model, h),
          HoverDemo(model, h),
        ]),
        h.section(slots.section.attrs([h.Id('navigation')]), [
          h.h2(slots.sectionTitle.attrs(), ['Navigation']),
          h.p(slots.sectionText.attrs(), [
            'Tabs in line and pill variants, and a Segmented plan picker — all driven by this page\u2019s own tab state.',
          ]),
          LineTabsView(model, h),
          PillTabsView(model, h),
          PlanView(model.plan, h),
          h.p(slots.sectionText.attrs(), [
            `Showing ${model.lineTab}, ${model.pillTab} view, ${model.plan} plan.`,
          ]),
        ]),
        h.section(slots.section.attrs([h.Id('calendar')]), [
          h.h2(slots.sectionTitle.attrs(), ['Date']),
          h.p(slots.sectionText.attrs(), [
            'A month grid preview through the Calendar slots, and a live picker that writes the due date. The picker shell rides attribute bundles; its grid draws through the same Calendar slots as the preview.',
          ]),
          CalendarPreview(15, h),
          DatePickerDemo(model, h),
          h.p(slots.sectionText.attrs(), [
            Option.match(model.maybeDue, {
              onNone: () => 'No due date yet.',
              onSome: date => `Due ${formatIsoDate(date)}.`,
            }),
          ]),
        ]),
        h.section(slots.section.attrs([h.Id('card')]), [
          h.h2(slots.sectionTitle.attrs(), ['Card']),
          h.p(slots.sectionText.attrs(), [
            'The shadcn card: base surface, hairline border, large radius, soft shadow.',
          ]),
          CardView(model.clicks, h),
        ]),
        h.section(slots.section.attrs([h.Id('utilities')]), [
          h.h2(slots.sectionTitle.attrs(), ['Utilities']),
          h.p(slots.sectionText.attrs(), [
            'Mechanisms, not components: an InputGroup address field, attribute-dispatched icons with coarse-pointer touch targets, and the accessibility pattern catalog every adapter is gated against.',
          ]),
          InputGroupDemo(model.address, h),
          h.p(slots.sectionText.attrs(), [`Previewing “/${model.address}”.`]),
          IconsDemo(undefined, h),
          h.div(slots.code.attrs(), [
            Patterns.catalog
              .map(
                entry =>
                  `${entry.name} (${entry.tier}): roles [${entry.roles.join(', ')}] floor [${entry.floor.join(', ') || 'none'}]`,
              )
              .join('\n'),
          ]),
        ]),
        h.section(slots.section.attrs([h.Id('tokens')]), [
          h.h2(slots.sectionTitle.attrs(), ['Tokens']),
          h.p(slots.sectionText.attrs(), [
            'The whole skin, as application code. No forked CSS: knobs plus selections.',
          ]),
          h.div(slots.code.attrs(), [tokensCode]),
        ]),
        h.p(slots.footer.attrs(), [
          'Recipes, tokens, and the full specimen page live in foldkit-mixins-ui. This demo is local state plus selections.',
        ]),
      ],
    ),
  }
}
