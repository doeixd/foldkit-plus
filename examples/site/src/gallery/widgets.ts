/**
 * The state of the component previews that have some: each `@foldkit/ui`
 * component's own Model beside the value it reports, so the component owns
 * focus, a drag or an open popup and this Model owns the choice. The site
 * holds one of these and folds `Message` into it.
 */
import { Duration, Effect, Match, Option, Schema } from 'effect'
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
  Nav,
  Table,
  Sheet,
  Command as CommandMenu,
  Toast,
} from 'foldkit-mixins-ui'
import * as UiTooltip from '@foldkit/ui/tooltip'
import * as UiVirtualList from '@foldkit/ui/virtualList'
import { ClipboardMessage } from 'foldkit-primitives/dom'

import {
  Billing,
  BillingGroup,
  CAROUSEL_LAYOUT,
  AUTOPLAY_LAYOUT,
  THUMBNAILS_LAYOUT,
  PER_VIEW_LAYOUT,
  TREE_ICONS,
  CityBox,
  CityTags,
  Fruit,
  FruitBox,
  FILE_MENU,
  Format,
  Frequency,
  FrequencyBox,
  MENUBAR,
  PAGE_MENU,
  appSidebar,
  FileTabs,
  InboxTabs,
  type InboxState,
  OpenFiles,
  TRAIL_MAX,
  trail,
  trailMenu,
  closeFile,
  ViewMode,
  Inbox,
  ViewOptions,
  viewRows,
  cities,
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

/** The tab examples each with tabs of their own, and the navigation menus. */
export const InboxExample = Schema.Literals(['icons', 'vertical'])
export type InboxExample = typeof InboxExample.Type
export const FilesExample = Schema.Literals(['closable', 'scrolling'])
export type FilesExample = typeof FilesExample.Type
export const NavExample = Schema.Literals(['panels', 'pill', 'vertical'])
export type NavExample = typeof NavExample.Type

const InboxModel = Schema.Struct({ tabs: UiTabs.Model, folder: Inbox })

/** The carousel examples. */
export const CarouselExample = Schema.Literals(['places', 'autoplay', 'thumbnails', 'perView'])
export type CarouselExample = typeof CarouselExample.Type

/** The custom select examples, each with a list and a fruit of its own. */
export const SelectExample = Schema.Literals([
  'custom',
  'icons',
  'descriptions',
  'groups',
  'placeholder',
  'disabled',
  'check-start',
  'trigger-filled',
  'trigger-ghost',
  'sm',
  'md',
  'lg',
])
export type SelectExample = typeof SelectExample.Type

const FruitState = Schema.Struct({ listbox: UiListbox.Model, fruit: Schema.Option(Fruit) })

/** The single combobox examples past the first, each with a field and a city of its own. */
export const CityExample = Schema.Literals(['empty', 'clear', 'groups', 'creatable'])
export type CityExample = typeof CityExample.Type

const CityState = Schema.Struct({ combobox: UiCombobox.Model, city: Schema.Option(Schema.String) })

/** The popover, tooltip, dialog and sheet examples, each with a Model of its own. */
export const PopoverExample = Schema.Literals(['below', 'top-start', 'no-arrow', 'clipped'])
export type PopoverExample = typeof PopoverExample.Type
export const TooltipExample = Schema.Literals(['above', 'right', 'edge'])
export type TooltipExample = typeof TooltipExample.Type
export const DialogExample = Schema.Literals(['terms', 'form', 'nested', 'nested-inner'])
export type DialogExample = typeof DialogExample.Type
export const SheetExample = Schema.Literals(['drawer', 'right', 'fixed', 'nested', 'nested-inner'])
export type SheetExample = typeof SheetExample.Type

/** The toast examples, each with a stack of its own, and a stack at each place. */
export const ToastExample = Schema.Union([
  Schema.Literals(['types', 'promise', 'action', 'rich']),
  Toast.Position,
])
export type ToastExample = typeof ToastExample.Type

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
  dialogs: Schema.Record(DialogExample, UiDialog.Model),
  sheets: Schema.Record(SheetExample, Sheet.Model),
  popovers: Schema.Record(PopoverExample, UiPopover.Model),
  tooltips: Schema.Record(TooltipExample, UiTooltip.Model),
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
  /** The sidebar's open groups, whether it is collapsed, its tooltips and phone Sheet. */
  sidebar: Sidebar.Model,
  /** The resizable sidebar's own Model, and its split. */
  sidebarResizable: Sidebar.Model,
  sidebarSplit: Resizable.Model,
  /** The pill tabs' own tabs and section. */
  pillTabs: Schema.Struct({ tabs: UiTabs.Model, section: Section }),
  inboxes: Schema.Record(InboxExample, InboxModel),
  files: Schema.Record(FilesExample, OpenFiles),
  viewMode: ViewMode,
  navs: Schema.Record(NavExample, Nav.Model),
  /** The breadcrumb's menu of the steps it folds away. */
  trailMenu: Menu.Model,
  /** The menu bar's menus, and the command last chosen from it. */
  menubar: Menubar.Model,
  menubarChoice: Schema.Option(Schema.String),
  /** The virtual list's scroll and measurements. */
  virtualList: UiVirtualList.Model,
  /** Each carousel example's slide and rotation. */
  carousels: Schema.Record(CarouselExample, Carousel.Model),
  /** The tree with icons and the one with checkboxes. */
  treeIcons: TreeView.Model,
  treeChecks: TreeView.Model,
  /** The open sections of the plus and the tinted accordions. */
  faqPlus: Schema.Array(Schema.String),
  faqActive: Schema.Array(Schema.String),
  /** The range slider's price range. */
  priceRange: Schema.Struct({ low: Schema.Number, high: Schema.Number }),
  /** The file tree's open, current and chosen rows. */
  treeView: TreeView.Model,
  /** The color picker's accent, its format and its draft. */
  accent: ColorPicker.Model,
  /** The trip calendar, and the range picked on it. */
  trip: UiCalendar.Model,
  tripDates: DateSelection.Selection,
  /** Whether the API key shows as copied, until its reset. */
  inputCopy: InputCopy.Model,
  /** The tags input's tags and draft. */
  tags: TagsInput.Model,
  /** The password field's text, and whether it shows. */
  password: Schema.String,
  passwordShown: Schema.Boolean,
  selects: Schema.Record(SelectExample, FruitState),
  cityBoxes: Schema.Record(CityExample, CityState),
  /** The multiple combobox's field, and the cities it holds. */
  cityTags: Schema.Struct({
    combobox: UiCombobox.Multi.Model,
    cities: Schema.Array(Schema.String),
  }),
  /** Whether the empty combobox's cities are still loading, and the cities added in the creatable one. */
  cityLoading: Schema.Boolean,
  createdCities: Schema.Array(Schema.String),
  tagsMax: TagsInput.Model,
  tagsRefusals: TagsInput.Model,
  /** The new password field's text, whether it shows, and whether Caps Lock was on. */
  newPassword: Schema.String,
  newPasswordShown: Schema.Boolean,
  capsLock: Schema.Boolean,
  /** The View menu, and what its rows set. */
  viewMenu: Menu.Model,
  viewOptions: ViewOptions,
  /** The command menu in a dialog: the dialog, its query and highlight, the pages stepped into. */
  palette: UiDialog.Model,
  paletteQuery: Schema.String,
  paletteActive: Schema.Option(Schema.String),
  palettePages: Schema.Array(Schema.String),
  paletteRan: Schema.Option(Schema.String),
  toasts: Schema.Record(ToastExample, Toast.Model),
  /** The invoices table's sort, chosen rows and open rows. */
  invoiceSort: Schema.Option(
    Schema.Struct({
      column: Schema.String,
      direction: Schema.Literals(['ascending', 'descending']),
    }),
  ),
  invoicesChosen: Schema.Array(Schema.String),
  invoicesOpen: Schema.Array(Schema.String),
  /** The half-star, heart and worded ratings. */
  film: Schema.Option(Schema.Number),
  hearts: Schema.Option(Schema.Number),
  support: Schema.Option(Schema.Number),
  /** The collapsible split and the nested ones. */
  collapsibleSplit: Resizable.Model,
  outerSplit: Resizable.Model,
  innerSplit: Resizable.Model,
  /** The region chosen in the card grid, and the plan chosen in the item list. */
  region: Schema.String,
  plan: Schema.String,
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
  GotPopover: { example: PopoverExample, message: UiPopover.Message },
  GotTooltip: { example: TooltipExample, message: UiTooltip.Message },
  GotDialogAt: { example: DialogExample, message: UiDialog.Message },
  OpenedDialogAt: { example: DialogExample },
  ClosedDialogAt: { example: DialogExample },
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
  GotSidebar: { message: Sidebar.Message },
  GotSidebarResizable: { message: Sidebar.Message },
  GotSidebarSplit: { message: Resizable.Message },
  GotPillTabs: { message: UiTabs.Message },
  GotInboxTabs: { example: InboxExample, message: UiTabs.Message },
  GotFileTabs: { example: FilesExample, message: UiTabs.Message },
  ClosedFile: { example: FilesExample, file: Schema.String },
  ChoseViewMode: { mode: ViewMode },
  GotNav: { example: NavExample, message: Nav.Message },
  GotTrailMenu: { message: Menu.Message },
  GotMenubar: { message: Menubar.Message },
  GotVirtualList: { message: UiVirtualList.Message },
  GotCarousel: { example: CarouselExample, message: Carousel.Message },
  GotTreeIcons: { message: TreeView.Message },
  GotTreeChecks: { message: TreeView.Message },
  ToggledFaqPlus: { id: Schema.String },
  ToggledFaqActive: { id: Schema.String },
  MovedPriceRange: { value: Schema.Struct({ low: Schema.Number, high: Schema.Number }) },
  GotTreeView: { message: TreeView.Message },
  GotAccent: { message: ColorPicker.Message },
  GotTripCalendar: { message: UiCalendar.Message },
  GotSheet: { example: SheetExample, message: Sheet.Message },
  OpenedSheet: { example: SheetExample },
  ClosedSheet: { example: SheetExample },
  PressedCopy: { text: Schema.String },
  GotCopy: { message: ClipboardMessage },
  GotTags: { message: TagsInput.Message },
  TypedPassword: { value: Schema.String },
  ToggledPassword: {},
  RatedStay: { value: Schema.Number },
  ChoseRegion: { region: Schema.String },
  SortedInvoices: { column: Schema.String },
  ChoseInvoice: { id: Schema.String, selected: Schema.Boolean },
  ChoseInvoices: { ids: Schema.Array(Schema.String) },
  OpenedInvoice: { id: Schema.String, expanded: Schema.Boolean },
  RatedFilm: { value: Schema.Number },
  ClearedFilm: {},
  RatedHearts: { value: Schema.Number },
  RatedSupport: { value: Schema.Number },
  GotCollapsibleSplit: { message: Resizable.Message },
  GotOuterSplit: { message: Resizable.Message },
  GotInnerSplit: { message: Resizable.Message },
  GotViewMenu: { message: Menu.Message },
  OpenedPalette: {},
  GotPalette: { message: UiDialog.Message },
  TypedPalette: { query: Schema.String },
  HighlightedPalette: { value: Schema.String },
  RanPalette: { value: Schema.String },
  LeftPalettePage: {},
  GotToast: { example: ToastExample, message: Toast.Message },
  RaisedToast: { example: ToastExample, type: Toast.Type },
  StartedUpload: {},
  FinishedUpload: { id: Schema.String },
  Archived: {},
  GotSelect: { example: SelectExample, message: UiListbox.Message },
  GotCityBox: { example: CityExample, message: UiCombobox.Message },
  GotCityTags: { message: UiCombobox.Message },
  ToggledCityLoading: {},
  GotTagsMax: { message: TagsInput.Message },
  GotTagsRefusals: { message: TagsInput.Message },
  TypedNewPassword: { value: Schema.String },
  ToggledNewPassword: {},
  ReadCapsLock: { reading: Schema.Option(Schema.Boolean) },
  GotInputCopy: { message: InputCopy.Message },
  ChosePlan: { plan: Schema.String },
})
export type Message = typeof Message.Type

const fruitState = (example: SelectExample, fruit: Option.Option<Fruit>) => ({
  listbox: UiListbox.init({ id: `preview-select-${example}`, isAnimated: true }),
  fruit,
})

const cityState = (example: CityExample, city: Option.Option<string> = Option.none()) => ({
  combobox: UiCombobox.init({ id: `preview-city-${example}`, isAnimated: true }),
  city,
})

const initialViewOptions: ViewOptions = {
  grid: false,
  rulers: true,
  zoom: 'Fit',
  chosen: Option.none(),
}

const openFiles = (id: string): OpenFiles => ({
  tabs: UiTabs.init({ id }),
  files: ['index.ts', 'tabs.ts', 'nav.ts', 'sidebar.ts', 'menu.ts', 'sheet.ts', 'badge.ts'],
  chosen: 'tabs.ts',
})

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
  dialogs: {
    terms: UiDialog.init({ id: 'preview-terms', isAnimated: true }),
    form: UiDialog.init({ id: 'preview-rename-dialog', isAnimated: true }),
    nested: UiDialog.init({ id: 'preview-share', isAnimated: true }),
    'nested-inner': UiDialog.init({ id: 'preview-share-link', isAnimated: true }),
  },
  sheets: {
    drawer: Sheet.init({ id: 'preview-sheet', side: 'bottom', points: [0.5, 1] }),
    right: Sheet.init({ id: 'preview-sheet-right', side: 'right' }),
    fixed: Sheet.init({ id: 'preview-sheet-fixed', points: [0.4, 0.8], dismissible: false }),
    nested: Sheet.init({ id: 'preview-sheet-plans' }),
    'nested-inner': Sheet.init({ id: 'preview-sheet-compare', points: [0.6] }),
  },
  popovers: {
    below: UiPopover.init({ id: 'preview-popover' }),
    'top-start': UiPopover.init({ id: 'preview-popover-top-start' }),
    'no-arrow': UiPopover.init({ id: 'preview-popover-no-arrow' }),
    clipped: UiPopover.init({ id: 'preview-popover-clipped' }),
  },
  tooltips: {
    above: UiTooltip.init({ id: 'preview-tooltip' }),
    right: UiTooltip.init({ id: 'preview-tooltip-right' }),
    edge: UiTooltip.init({ id: 'preview-tooltip-edge' }),
  },
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
  sidebar: appSidebar,
  sidebarResizable: Sidebar.init({
    id: 'app-sidebar-resizable',
    rows: ['inbox', 'projects', 'calendar', 'members', 'billing'],
    open: ['settings'],
  }),
  sidebarSplit: Resizable.init(0.3),
  pillTabs: { tabs: UiTabs.init({ id: 'preview-tabs-pill' }), section: 'overview' },
  inboxes: {
    icons: { tabs: UiTabs.init({ id: 'preview-inbox' }), folder: 'inbox' },
    vertical: { tabs: UiTabs.init({ id: 'preview-inbox-vertical' }), folder: 'inbox' },
  },
  files: { closable: openFiles('preview-files'), scrolling: openFiles('preview-files-scroll') },
  viewMode: 'board',
  navs: {
    panels: Nav.init('preview-site-nav'),
    pill: Nav.init('preview-pill-nav'),
    vertical: Nav.init('preview-side-nav'),
  },
  trailMenu,
  menubar: Menubar.init(
    MENUBAR.map(menu => `preview-menubar-${menu.label.toLowerCase()}`),
    { isAnimated: true },
  ),
  menubarChoice: Option.none(),
  virtualList: UiVirtualList.init({ id: 'preview-virtual-list', rowHeightPx: 36 }),
  carousels: {
    places: Carousel.init({ id: 'preview-carousel' }),
    autoplay: Carousel.init({ id: 'preview-carousel-autoplay', autoplay: true }),
    thumbnails: Carousel.init({ id: 'preview-carousel-thumbs' }),
    perView: Carousel.init({ id: 'preview-carousel-two' }),
  },
  treeIcons: TreeView.init({ id: 'preview-tree-icons', open: ['src'] }),
  treeChecks: TreeView.init({ id: 'preview-tree-checks', open: ['src'], checked: ['index'] }),
  faqPlus: ['refunds'],
  faqActive: ['billing'],
  priceRange: { low: 100, high: 350 },
  treeView: TreeView.init({ id: 'preview-tree', open: ['src'] }),
  accent: ColorPicker.init({ id: 'preview-accent', color: ColorPicker.color('#3b82f6') }),
  trip: UiCalendar.init({ id: 'preview-trip', today }),
  tripDates: DateSelection.empty('Range'),
  inputCopy: InputCopy.init({ resetAfter: 2000 }),
  tags: TagsInput.init({ id: 'preview-tags', tags: ['effect', 'foldkit'] }),
  password: '',
  passwordShown: false,
  stay: Option.none(),
  selects: {
    custom: fruitState('custom', Option.some('Apple')),
    icons: fruitState('icons', Option.some('Cherry')),
    descriptions: fruitState('descriptions', Option.some('Banana')),
    groups: fruitState('groups', Option.some('Cherry')),
    placeholder: fruitState('placeholder', Option.none()),
    disabled: fruitState('disabled', Option.some('Apple')),
    'check-start': fruitState('check-start', Option.some('Banana')),
    'trigger-filled': fruitState('trigger-filled', Option.some('Apple')),
    'trigger-ghost': fruitState('trigger-ghost', Option.some('Apple')),
    sm: fruitState('sm', Option.some('Apple')),
    md: fruitState('md', Option.some('Apple')),
    lg: fruitState('lg', Option.some('Apple')),
  },
  cityBoxes: {
    empty: cityState('empty'),
    clear: cityState('clear', Option.some('Oslo')),
    groups: cityState('groups'),
    creatable: cityState('creatable'),
  },
  cityTags: {
    combobox: UiCombobox.Multi.init({ id: 'preview-cities', isAnimated: true }),
    cities: ['Lima', 'Seoul'],
  },
  cityLoading: false,
  createdCities: [],
  tagsMax: TagsInput.init({ id: 'preview-tags-max', tags: ['urgent', 'design'], max: 3 }),
  tagsRefusals: TagsInput.init({ id: 'preview-tags-refusals', tags: ['effect', 'foldkit'] }),
  newPassword: '',
  newPasswordShown: false,
  capsLock: false,
  viewMenu: Menu.init('preview-view-menu', viewRows(initialViewOptions), { isAnimated: true }),
  viewOptions: initialViewOptions,
  palette: UiDialog.init({ id: 'preview-palette-dialog', isAnimated: true }),
  paletteQuery: '',
  paletteActive: Option.none(),
  palettePages: [],
  paletteRan: Option.none(),
  toasts: {
    types: Toast.init('preview-toasts-types'),
    promise: Toast.init('preview-toasts-promise'),
    action: Toast.init('preview-toasts-action'),
    rich: Toast.init('preview-toasts-rich'),
    'top-start': Toast.init('preview-toasts-top-start', { position: 'top-start' }),
    'top-center': Toast.init('preview-toasts-top-center', { position: 'top-center' }),
    'top-end': Toast.init('preview-toasts-top-end', { position: 'top-end' }),
    'bottom-start': Toast.init('preview-toasts-bottom-start', { position: 'bottom-start' }),
    'bottom-center': Toast.init('preview-toasts-bottom-center', { position: 'bottom-center' }),
    'bottom-end': Toast.init('preview-toasts-bottom-end', { position: 'bottom-end' }),
  },
  invoiceSort: Option.none(),
  invoicesChosen: ['INV-002'],
  invoicesOpen: [],
  film: Option.some(3.5),
  hearts: Option.some(4),
  support: Option.none(),
  collapsibleSplit: Resizable.init(0.3),
  outerSplit: Resizable.init(0.3),
  innerSplit: Resizable.init(0.6),
  region: 'Frankfurt',
  plan: 'Team',
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

const foldPopover = Update.foldChildAt({
  update: UiPopover.update,
  readAt: (model: Model, example: PopoverExample) => Option.some(model.popovers[example]),
  writeAt: (model, example, popover) =>
    modifyFields(model, { popovers: popovers => ({ ...popovers, [example]: popover }) }),
  toParentMessage: (example, message) => Message.GotPopover({ example, message }),
  foldOutMessage: () =>
    UiPopover.OutMessage.match<Step>({ Opened: () => same, Closed: () => same }),
})

/** One dialog example stepped: by its own Message, or opened or closed. */
const foldDialogAt = Update.foldChildAt({
  update: (
    dialog: UiDialog.Model,
    step: (dialog: UiDialog.Model) => ReturnType<typeof UiDialog.update>,
  ) => step(dialog),
  readAt: (model: Model, example: DialogExample) => Option.some(model.dialogs[example]),
  writeAt: (model, example, dialog) =>
    modifyFields(model, { dialogs: dialogs => ({ ...dialogs, [example]: dialog }) }),
  toParentMessage: (example, message) => Message.GotDialogAt({ example, message }),
  foldOutMessage: () => dialogOut,
})

/** One sheet example stepped: by its own Message, or opened or closed. */
const foldSheet = Update.foldChildAt({
  update: (sheet: Sheet.Model, step: (sheet: Sheet.Model) => Sheet.Return) => step(sheet),
  readAt: (model: Model, example: SheetExample) => Option.some(model.sheets[example]),
  writeAt: (model, example, sheet) =>
    modifyFields(model, { sheets: sheets => ({ ...sheets, [example]: sheet }) }),
  toParentMessage: (example, message) => Message.GotSheet({ example, message }),
  foldOutMessage: () => dialogOut,
})

const foldHoverCard = Update.foldChild({
  ...own('hoverCard', Message.GotHoverCard),
  update: UiHoverIntent.update,
  foldOutMessage: UiHoverIntent.OutMessage.match<Step>({ Opened: () => same, Closed: () => same }),
})

const foldTooltip = Update.foldChildAt({
  update: UiTooltip.update,
  readAt: (model: Model, example: TooltipExample) => Option.some(model.tooltips[example]),
  writeAt: (model, example, tooltip) =>
    modifyFields(model, { tooltips: tooltips => ({ ...tooltips, [example]: tooltip }) }),
  toParentMessage: (example, message) => Message.GotTooltip({ example, message }),
  foldOutMessage: () => UiTooltip.OutMessage.match<Step>({ Shown: () => same, Hidden: () => same }),
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

const foldSelect = Update.foldChildAt({
  update: FruitBox.update,
  readAt: (model: Model, example: SelectExample) => Option.some(model.selects[example].listbox),
  writeAt: (model, example, listbox) =>
    modifyFields(model, {
      selects: selects => ({ ...selects, [example]: { ...selects[example], listbox } }),
    }),
  toParentMessage: (example, message) => Message.GotSelect({ example, message }),
  foldOutMessage: example =>
    UiListbox.OutMessage.match<Step, UiListbox.OutMessage<Fruit>>({
      Selected:
        ({ value }) =>
        model =>
          Option.contains(model.selects[example].fruit, value)
            ? { model }
            : {
                model: modifyFields(model, {
                  selects: selects => ({
                    ...selects,
                    [example]: { ...selects[example], fruit: Option.some(value) },
                  }),
                }),
              },
    }),
})

/** Sets one city example's choice. */
const choseCity = (model: Model, example: CityExample, city: Option.Option<string>): Model =>
  modifyFields(model, {
    cityBoxes: boxes => ({ ...boxes, [example]: { ...boxes[example], city } }),
  })

const foldCityBox = Update.foldChildAt({
  update: CityBox.update,
  readAt: (model: Model, example: CityExample) => Option.some(model.cityBoxes[example].combobox),
  writeAt: (model, example, combobox) =>
    modifyFields(model, {
      cityBoxes: boxes => ({ ...boxes, [example]: { ...boxes[example], combobox } }),
    }),
  toParentMessage: (example, message) => Message.GotCityBox({ example, message }),
  foldOutMessage: example =>
    UiCombobox.OutMessage.match<Step, UiCombobox.OutMessage<string>>({
      // A city the lists do not hold was typed into the creatable one: it is added.
      Selected:
        ({ value }) =>
        model => {
          const chosen = choseCity(model, example, Option.some(value))
          return cities.includes(value) || model.createdCities.includes(value)
            ? { model: chosen }
            : {
                model: modifyFields(chosen, { createdCities: created => [...created, value] }),
              }
        },
      ClearedSelection: () => model => ({ model: choseCity(model, example, Option.none()) }),
    }),
})

const foldCityTags = Update.foldChild({
  read: (model: Model) => Option.some(model.cityTags.combobox),
  write: (model, combobox) => modifyFields(model, { cityTags: tags => ({ ...tags, combobox }) }),
  toParentMessage: message => Message.GotCityTags({ message }),
  update: CityTags.update,
  foldOutMessage: UiCombobox.OutMessage.match<Step, UiCombobox.OutMessage<string>>({
    // Choosing a chosen city again takes it back off.
    Selected:
      ({ value }) =>
      model => ({
        model: modifyFields(model, {
          cityTags: tags => ({
            ...tags,
            cities: tags.cities.includes(value)
              ? tags.cities.filter(city => city !== value)
              : [...tags.cities, value],
          }),
        }),
      }),
    ClearedSelection: () => model => ({
      model: modifyFields(model, { cityTags: tags => ({ ...tags, cities: [] }) }),
    }),
  }),
})

const foldAccent = Update.foldChild({
  ...own('accent', Message.GotAccent),
  update: ColorPicker.update,
})

/** Each carousel example's update, over the layout its view draws. */
const carouselUpdates: Readonly<Record<CarouselExample, ReturnType<typeof Carousel.update>>> = {
  places: Carousel.update(CAROUSEL_LAYOUT),
  autoplay: Carousel.update(AUTOPLAY_LAYOUT),
  thumbnails: Carousel.update(THUMBNAILS_LAYOUT),
  perView: Carousel.update(PER_VIEW_LAYOUT),
}

const foldCarousel = Update.foldChildAt({
  update: (
    carousel: Carousel.Model,
    step: (carousel: Carousel.Model) => ReturnType<ReturnType<typeof Carousel.update>>,
  ) => step(carousel),
  readAt: (model: Model, example: CarouselExample) => Option.some(model.carousels[example]),
  writeAt: (model, example, carousel) =>
    modifyFields(model, { carousels: carousels => ({ ...carousels, [example]: carousel }) }),
  toParentMessage: (example, message) => Message.GotCarousel({ example, message }),
})

const foldTreeIcons = Update.foldChild({
  ...own('treeIcons', Message.GotTreeIcons),
  update: TreeView.update(TREE_ICONS),
})

const foldTreeChecks = Update.foldChild({
  ...own('treeChecks', Message.GotTreeChecks),
  update: TreeView.update(TREE_ICONS, { checkable: true }),
})

const foldSidebar = Update.foldChild({
  ...own('sidebar', Message.GotSidebar),
  update: Sidebar.update,
})

const foldSidebarResizable = Update.foldChild({
  ...own('sidebarResizable', Message.GotSidebarResizable),
  update: Sidebar.update,
})

const foldPillTabs = Update.foldChild({
  read: (model: Model) => Option.some(model.pillTabs.tabs),
  write: (model, tabs) => modifyFields(model, { pillTabs: pill => ({ ...pill, tabs }) }),
  toParentMessage: message => Message.GotPillTabs({ message }),
  update: SectionTabs.update,
  foldOutMessage: UiTabs.OutMessage.match<Step, UiTabs.OutMessage<Section>>({
    Selected:
      ({ value }) =>
      model =>
        value === model.pillTabs.section
          ? { model }
          : { model: modifyFields(model, { pillTabs: pill => ({ ...pill, section: value }) }) },
  }),
})

const foldInboxTabs = Update.foldChildAt({
  update: InboxTabs.update,
  readAt: (model: Model, example: InboxExample) => Option.some(model.inboxes[example].tabs),
  writeAt: (model, example, tabs) =>
    modifyFields(model, {
      inboxes: inboxes => ({ ...inboxes, [example]: { ...inboxes[example], tabs } }),
    }),
  toParentMessage: (example, message) => Message.GotInboxTabs({ example, message }),
  foldOutMessage: example =>
    UiTabs.OutMessage.match<Step, UiTabs.OutMessage<Inbox>>({
      Selected:
        ({ value }) =>
        model =>
          value === model.inboxes[example].folder
            ? { model }
            : {
                model: modifyFields(model, {
                  inboxes: inboxes => ({
                    ...inboxes,
                    [example]: { ...inboxes[example], folder: value },
                  }),
                }),
              },
    }),
})

const writeFiles = (model: Model, example: FilesExample, files: OpenFiles): Model =>
  modifyFields(model, { files: all => ({ ...all, [example]: files }) })

const foldFileTabs = Update.foldChildAt({
  update: FileTabs.update,
  readAt: (model: Model, example: FilesExample) => Option.some(model.files[example].tabs),
  writeAt: (model, example, tabs) => writeFiles(model, example, { ...model.files[example], tabs }),
  toParentMessage: (example, message) => Message.GotFileTabs({ example, message }),
  foldOutMessage: example =>
    UiTabs.OutMessage.match<Step, UiTabs.OutMessage<string>>({
      Selected:
        ({ value }) =>
        model =>
          value === model.files[example].chosen
            ? { model }
            : { model: writeFiles(model, example, { ...model.files[example], chosen: value }) },
    }),
})

const foldNav = Update.foldChildAt({
  update: Nav.update,
  readAt: (model: Model, example: NavExample) => Option.some(model.navs[example]),
  writeAt: (model, example, nav) =>
    modifyFields(model, { navs: navs => ({ ...navs, [example]: nav }) }),
  toParentMessage: (example, message) => Message.GotNav({ example, message }),
})

// The gallery's steps lead to `#`, so a step chosen from the menu only closes it.
const foldTrailMenu = Update.foldChild({
  ...own('trailMenu', Message.GotTrailMenu),
  update: Menu.update,
  foldOutMessage: Menu.OutMessage.match<Step>({ Selected: () => same }),
})

/** `ids` with `id` in or out; the same array when it already is. */
const including = (ids: ReadonlyArray<string>, id: string, on: boolean): ReadonlyArray<string> =>
  ids.includes(id) === on ? ids : on ? [...ids, id] : ids.filter(each => each !== id)

const foldTagsMax = Update.foldChild({
  ...own('tagsMax', Message.GotTagsMax),
  update: TagsInput.update,
})

const foldTagsRefusals = Update.foldChild({
  ...own('tagsRefusals', Message.GotTagsRefusals),
  update: TagsInput.update,
})

const foldInputCopy = Update.foldChild({
  ...own('inputCopy', Message.GotInputCopy),
  update: InputCopy.update,
})

/** The View menu's answer to a chosen row: a check flips, a radio picks, any other is chosen. */
const viewChose = (options: ViewOptions, value: string): ViewOptions =>
  Match.value(value).pipe(
    Match.withReturnType<ViewOptions>(),
    Match.when('Grid', () => ({ ...options, grid: !options.grid })),
    Match.when('Rulers', () => ({ ...options, rulers: !options.rulers })),
    Match.when('Fit', () => ({ ...options, zoom: 'Fit' })),
    Match.when('Actual size', () => ({ ...options, zoom: 'Actual size' })),
    Match.orElse(() => ({ ...options, chosen: Option.some(value) })),
  )

const foldViewMenu = Update.foldChild({
  ...own('viewMenu', Message.GotViewMenu),
  update: Menu.update,
  foldOutMessage: Menu.OutMessage.match<Step>({
    Selected:
      ({ value }) =>
      model => ({
        model: modifyFields(model, { viewOptions: options => viewChose(options, value) }),
      }),
  }),
})

const paletteField = own('palette', Message.GotPalette)
const foldPalette = Update.foldChild({
  ...paletteField,
  update: UiDialog.update,
  foldOutMessage: dialogOut,
})
const openPalette = Update.foldChildStep({
  ...paletteField,
  update: UiDialog.open,
  foldOutMessage: dialogOut,
})
const closePalette = Update.foldChildStep({
  ...paletteField,
  update: UiDialog.close,
  foldOutMessage: dialogOut,
})

/** The toasts' Commands, as this Model's Messages for the stack they came from. */
const toastCommands = (
  example: ToastExample,
  commands: ReadonlyArray<Command.Command<Toast.Message>> | undefined,
) => Command.mapMessages(commands ?? [], message => Message.GotToast({ example, message }))

/** `input` shown on one example's stack. */
const showToast = (
  model: Model,
  example: ToastExample,
  input: Toast.ToastInput,
): Update.Return<Model, Message> & { readonly id: string } => {
  const shown = Toast.show(model.toasts[example], input)
  return {
    id: shown.id,
    model: modifyFields(model, { toasts: toasts => ({ ...toasts, [example]: shown.model }) }),
    commands: toastCommands(example, shown.commands),
  }
}

const TOAST_TITLES: ReadonlyMap<Toast.Type, string> = new Map([
  ['default', 'Event created'],
  ['info', 'A new version is out'],
  ['success', 'Changes saved'],
  ['warning', 'Your session ends in 5 minutes'],
  ['error', 'The file could not be read'],
])

/** Waits as an upload would, then says it is done. */
const FinishUpload = Command.define('FinishUpload', {
  args: { id: Schema.String },
  messages: [Message.FinishedUpload],
  execute: ({ id }) =>
    Effect.sleep(Duration.millis(1500)).pipe(Effect.as(Message.FinishedUpload({ id }))),
})

const foldToast = Update.foldChildAt({
  update: Toast.update,
  readAt: (model: Model, example: ToastExample) => Option.some(model.toasts[example]),
  writeAt: (model, example, stack) =>
    modifyFields(model, { toasts: toasts => ({ ...toasts, [example]: stack }) }),
  toParentMessage: (example, message) => Message.GotToast({ example, message }),
  // The archive's Undo: the thread is back, and a toast says so.
  foldOutMessage: example =>
    Toast.OutMessage.match<Step>({
      Acted: () => model => showToast(model, example, { type: 'info', title: 'Thread restored' }),
    }),
})

const foldTags = Update.foldChild({
  ...own('tags', Message.GotTags),
  update: TagsInput.update,
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
    GotSheet: ({ example, message }) =>
      foldSheet(model, example, sheet => Sheet.update(sheet, message)),
    OpenedSheet: ({ example }) => foldSheet(model, example, Sheet.open),
    ClosedSheet: ({ example }) => foldSheet(model, example, Sheet.close),
    GotDialogAt: ({ example, message }) =>
      foldDialogAt(model, example, dialog => UiDialog.update(dialog, message)),
    OpenedDialogAt: ({ example }) => foldDialogAt(model, example, UiDialog.open),
    ClosedDialogAt: ({ example }) => foldDialogAt(model, example, UiDialog.close),
    GotPopover: ({ example, message }) => foldPopover(model, example, message),
    GotTooltip: ({ example, message }) => foldTooltip(model, example, message),
    GotHoverCard: ({ message }) => foldHoverCard(model, message),
    GotFileMenu: ({ message }) => foldFileMenu(model, message),
    TypedCommand: ({ query }) => ({
      model: modifyFields(model, { commandQuery: () => query }),
    }),
    HighlightedCommand: ({ value }) => ({
      model: modifyFields(model, { commandActive: () => Option.some(value) }),
    }),
    GotSidebar: ({ message }) => foldSidebar(model, message),
    GotSidebarResizable: ({ message }) => foldSidebarResizable(model, message),
    GotSidebarSplit: ({ message }) => {
      const split = Resizable.update(model.sidebarSplit, message, { min: 0.2, max: 0.5 })
      return split === model.sidebarSplit
        ? { model }
        : { model: modifyFields(model, { sidebarSplit: () => split }) }
    },
    GotPillTabs: ({ message }) => foldPillTabs(model, message),
    GotInboxTabs: ({ example, message }) => foldInboxTabs(model, example, message),
    GotFileTabs: ({ example, message }) => foldFileTabs(model, example, message),
    ClosedFile: ({ example, file }) => {
      const closed = closeFile(model.files[example], file, message =>
        Message.GotFileTabs({ example, message }),
      )
      return { model: writeFiles(model, example, closed.state), commands: closed.commands }
    },
    ChoseViewMode: ({ mode }) =>
      mode === model.viewMode
        ? { model }
        : { model: modifyFields(model, { viewMode: () => mode }) },
    GotNav: ({ example, message }) => foldNav(model, example, message),
    GotTrailMenu: ({ message }) => foldTrailMenu(model, message),
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
    GotCarousel: ({ example, message }) =>
      foldCarousel(model, example, carousel => carouselUpdates[example](carousel, message)),
    GotTreeIcons: ({ message }) => foldTreeIcons(model, message),
    GotTreeChecks: ({ message }) => foldTreeChecks(model, message),
    ToggledFaqPlus: ({ id }) => ({
      model: modifyFields(model, {
        faqPlus: () => Accordion.toggled(model.faqPlus, id, { multiple: true }),
      }),
    }),
    ToggledFaqActive: ({ id }) => ({
      model: modifyFields(model, { faqActive: () => Accordion.toggled(model.faqActive, id) }),
    }),
    MovedPriceRange: ({ value }) =>
      value.low === model.priceRange.low && value.high === model.priceRange.high
        ? { model }
        : { model: modifyFields(model, { priceRange: () => value }) },
    GotTreeView: ({ message }) => foldTreeView(model, message),
    GotAccent: ({ message }) => foldAccent(model, message),
    GotTripCalendar: ({ message }) => foldTripCalendar(model, message),
    PressedCopy: ({ text }) => ({
      model,
      commands: Command.mapMessages([InputCopy.Copy({ text })], message =>
        Message.GotCopy({ message }),
      ),
    }),
    // A refused copy leaves the button as it was: there is nothing to say was copied.
    GotCopy: ({ message }) =>
      ClipboardMessage.match(message, {
        Copied: () => foldInputCopy(model, InputCopy.Message.Copied()),
        CopyFailed: () => ({ model }),
      }),
    GotInputCopy: ({ message }) => foldInputCopy(model, message),
    GotSelect: ({ example, message }) => foldSelect(model, example, message),
    GotViewMenu: ({ message }) => foldViewMenu(model, message),
    OpenedPalette: () => openPalette(model),
    GotPalette: ({ message }) => foldPalette(model, message),
    TypedPalette: ({ query }) => ({ model: modifyFields(model, { paletteQuery: () => query }) }),
    HighlightedPalette: ({ value }) => ({
      model: modifyFields(model, { paletteActive: () => Option.some(value) }),
    }),
    // "Change theme" steps into its page; any other row runs, and the dialog closes.
    RanPalette: ({ value }) =>
      value === 'theme'
        ? {
            model: modifyFields(model, {
              palettePages: pages => [...pages, 'Theme'],
              paletteQuery: () => '',
              paletteActive: () => Option.none(),
            }),
          }
        : closePalette(
            modifyFields(model, {
              paletteRan: () => Option.some(value),
              palettePages: () => [],
              paletteQuery: () => '',
            }),
          ),
    LeftPalettePage: () =>
      model.palettePages.length === 0
        ? { model }
        : { model: modifyFields(model, { palettePages: pages => pages.slice(0, -1) }) },
    GotToast: ({ example, message }) => foldToast(model, example, message),
    RaisedToast: ({ example, type }) =>
      showToast(model, example, {
        type,
        title: TOAST_TITLES.get(type) ?? type,
        description: 'Just now',
      }),
    StartedUpload: () => {
      const shown = showToast(model, 'promise', { type: 'loading', title: 'Uploading report.pdf…' })
      return {
        model: shown.model,
        commands: [...(shown.commands ?? []), FinishUpload({ id: shown.id })],
      }
    },
    FinishedUpload: ({ id }) => {
      const settled = Toast.settle(model.toasts.promise, id, {
        type: 'success',
        title: 'Uploaded',
        description: 'report.pdf is in your files.',
      })
      return {
        model: modifyFields(model, { toasts: toasts => ({ ...toasts, promise: settled.model }) }),
        commands: toastCommands('promise', settled.commands),
      }
    },
    Archived: () =>
      showToast(model, 'action', {
        title: 'Thread archived',
        action: { label: 'Undo', value: 'undo' },
      }),
    GotCityBox: ({ example, message }) => foldCityBox(model, example, message),
    GotCityTags: ({ message }) => foldCityTags(model, message),
    ToggledCityLoading: () => ({
      model: modifyFields(model, { cityLoading: () => !model.cityLoading }),
    }),
    GotTagsMax: ({ message }) => foldTagsMax(model, message),
    GotTagsRefusals: ({ message }) => foldTagsRefusals(model, message),
    TypedNewPassword: ({ value }) =>
      value === model.newPassword
        ? { model }
        : { model: modifyFields(model, { newPassword: () => value }) },
    ToggledNewPassword: () => ({
      model: modifyFields(model, { newPasswordShown: () => !model.newPasswordShown }),
    }),
    // A key that says nothing of Caps Lock, such as a digit, keeps what was read last.
    ReadCapsLock: ({ reading }) => {
      const on = Option.getOrElse(reading, () => model.capsLock)
      return on === model.capsLock
        ? { model }
        : { model: modifyFields(model, { capsLock: () => on }) }
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
    ChoseRegion: ({ region }) =>
      region === model.region
        ? { model }
        : { model: modifyFields(model, { region: () => region }) },
    ChosePlan: ({ plan }) =>
      plan === model.plan ? { model } : { model: modifyFields(model, { plan: () => plan }) },
    SortedInvoices: ({ column }) => ({
      model: modifyFields(model, { invoiceSort: () => Table.nextSort(model.invoiceSort, column) }),
    }),
    ChoseInvoice: ({ id, selected }) => {
      const chosen = including(model.invoicesChosen, id, selected)
      return chosen === model.invoicesChosen
        ? { model }
        : { model: modifyFields(model, { invoicesChosen: () => chosen }) }
    },
    ChoseInvoices: ({ ids }) => ({ model: modifyFields(model, { invoicesChosen: () => ids }) }),
    OpenedInvoice: ({ id, expanded }) => {
      const open = including(model.invoicesOpen, id, expanded)
      return open === model.invoicesOpen
        ? { model }
        : { model: modifyFields(model, { invoicesOpen: () => open }) }
    },
    RatedFilm: ({ value }) => ({ model: modifyFields(model, { film: () => Option.some(value) }) }),
    ClearedFilm: () =>
      Option.isNone(model.film)
        ? { model }
        : { model: modifyFields(model, { film: () => Option.none() }) },
    RatedHearts: ({ value }) => ({
      model: modifyFields(model, { hearts: () => Option.some(value) }),
    }),
    RatedSupport: ({ value }) => ({
      model: modifyFields(model, { support: () => Option.some(value) }),
    }),
    // The bounds the collapsible example's view takes, which must agree with these.
    GotCollapsibleSplit: ({ message }) => {
      const split = Resizable.update(model.collapsibleSplit, message, {
        min: 0.2,
        max: 0.6,
        collapsible: 'first',
      })
      return split === model.collapsibleSplit
        ? { model }
        : { model: modifyFields(model, { collapsibleSplit: () => split }) }
    },
    GotOuterSplit: ({ message }) => {
      const split = Resizable.update(model.outerSplit, message)
      return split === model.outerSplit
        ? { model }
        : { model: modifyFields(model, { outerSplit: () => split }) }
    },
    GotInnerSplit: ({ message }) => {
      const split = Resizable.update(model.innerSplit, message)
      return split === model.innerSplit
        ? { model }
        : { model: modifyFields(model, { innerSplit: () => split }) }
    },
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

/**
 * Each toast's timer dismisses it, and ⌘K or Ctrl+K opens the command
 * menu's dialog: the site lifts `palette` only while the Command page shows.
 */
export const subscriptions = Subscription.aggregate(
  Subscription.make<Model, Message>()(() => ({
    palette: Subscription.persistentEntry(CommandMenu.hotkey(Message.OpenedPalette())),
  })),
  Subscription.lift(Notices.subscriptions)<Model, Message>({
    read: model => Option.some(model.notices),
    toParentMessage: message => Message.GotNotices({ message }),
  }),
)
