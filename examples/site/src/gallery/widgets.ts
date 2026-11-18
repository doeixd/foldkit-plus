/**
 * The state of the component previews that have some: each `@foldkit/ui`
 * component's own Model beside the value it reports, so the component owns
 * focus, a drag or an open popup and this Model owns the choice. The site
 * holds one of these and folds `Message` into it.
 */
import { Effect, Option, Schema } from 'effect'
import { Calendar, Update } from 'foldkit'
import { defineMessageUnion } from 'foldkit/message'
import {
  Calendar as UiCalendar,
  Dialog as UiDialog,
  HoverIntent as UiHoverIntent,
  Popover as UiPopover,
} from '@foldkit/ui'
import {
  Menubar,
  Resizable,
  InputCopy,
  Sidebar,
  Calendar as DateSelection,
  ColorPicker,
  TreeView,
  Carousel,
  Menu,
  Nav,
  Sheet,
  Drawer,
  Toast,
  FileDrop,
  MessageScroller,
  Questionnaire,
  AngleSlider,
  Timer,
  Marquee,
  ImageCropper,
  SignaturePad,
  QrCode,
  Chart,
  FloatingPanel,
  Tour,
} from 'foldkit-mixins-ui'
import * as UiFileDrop from '@foldkit/ui/fileDrop'
import * as UiTooltip from '@foldkit/ui/tooltip'
import * as UiVirtualList from '@foldkit/ui/virtualList'
import { ClipboardMessage } from 'foldkit-primitives/dom'
import * as Fields from './fields.js'

import {
  FILE_MENU,
  MENUBAR,
  PAGE_MENU,
  ACCOUNT,
  appSidebar,
  floatingSidebar,
  insetSidebar,
  sectionsSidebar,
  sidebarResizableModel,
  switcherSidebar,
  TEAMS,
  ViewMode,
  ViewOptions,
  viewRows,
  Notices,
  Range,
  ChatEntry,
  TRIP_QUESTIONS,
} from '../snippets/components.js'

/** The chart examples, each lighting a point of its own. */
export const ChartExample = Schema.Literals(['bar', 'line', 'area', 'donut', 'table', 'colors'])
export type ChartExample = typeof ChartExample.Type

/** The conversation's first messages; `Send` and `Load older` add to either end. */
const CHAT: ReadonlyArray<ChatEntry> = [
  'What is a recipe?',
  'Pieces of style for each slot of a component, picked by its axes.',
  'And a slot?',
  'A named part of the component, which a style or a Mixin reaches.',
  'Can I change one?',
  'Extend the recipe, or add a rule in your app layer.',
  'Which layer wins?',
  'The app layer, after components and variants.',
].map((text, at) => ({ id: `chat-${at}`, from: at % 2 === 0 ? 'user' : 'assistant', text }))

/** The Sidebar page's examples beyond its first, each with a sidebar of its own. */
export const SidebarExample = Schema.Literals([
  'resizable',
  'floating',
  'inset',
  'sections',
  'switcher',
])
export type SidebarExample = typeof SidebarExample.Type

export const NavExample = Schema.Literals(['panels', 'pill', 'vertical'])
export type NavExample = typeof NavExample.Type

/** The carousel examples. */
export const CarouselExample = Schema.Literals(['places', 'autoplay', 'thumbnails', 'perView'])
export type CarouselExample = typeof CarouselExample.Type

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

/** A menu drawn open from the start, its enter already over: the gallery shows its rows unasked. */
const shownMenu = (menu: Menu.Model): Menu.Model => ({
  ...menu,
  menu: { ...menu.menu, isOpen: true, animation: { ...menu.menu.animation, isShowing: true } },
})

/** A file the drop zone took. */
export const Attachment = Schema.Struct({ name: Schema.String, size: Schema.Number })
export type Attachment = typeof Attachment.Type

export const Model = Schema.Struct({
  /** The drop zone's, and what it has taken: names and sizes, never the files. */
  drop: UiFileDrop.Model,
  attachments: Schema.Array(Attachment),
  /** The slider's volume. */
  volume: Schema.Number,
  dialog: UiDialog.Model,
  alertDialog: UiDialog.Model,
  dialogs: Schema.Record(DialogExample, UiDialog.Model),
  sheets: Schema.Record(SheetExample, Sheet.Model),
  /** The drawer docked inside its preview frame. */
  drawer: Drawer.Model,
  popovers: Schema.Record(PopoverExample, UiPopover.Model),
  tooltips: Schema.Record(TooltipExample, UiTooltip.Model),
  /** The menu a button opens and the one a right press opens, and what each last chose. */
  fileMenu: Menu.Model,
  fileChoice: Schema.Option(Schema.String),
  pageMenu: Menu.Model,
  pageChoice: Schema.Option(Schema.String),
  notices: Notices.Model,
  range: Range,
  /** Each checkbox group example's checked alerts. */
  alerts: Schema.Record(AlertsExample, Schema.Array(Schema.String)),
  hoverCard: UiHoverIntent.Model,
  /** The command menu's query, highlighted row and last command run. */
  commandQuery: Schema.String,
  commandActive: Schema.Option(Schema.String),
  commandRan: Schema.Option(Schema.String),
  /** The resizable split. */
  split: Resizable.Model,
  /** The sidebar's open groups, whether it is collapsed, its tooltips and phone Sheet. */
  sidebar: Sidebar.Model,
  /** Each further example's sidebar. */
  sidebars: Schema.Record(SidebarExample, Sidebar.Model),
  /** What a sidebar's action last did. */
  sidebarActed: Schema.Option(Schema.String),
  /** The switcher's team, and the menus at its ends. */
  team: Schema.String,
  teamMenu: Menu.Model,
  userMenu: Menu.Model,
  viewMode: ViewMode,
  navs: Schema.Record(NavExample, Nav.Model),
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
  /** The collapsible split and the nested ones. */
  collapsibleSplit: Resizable.Model,
  outerSplit: Resizable.Model,
  innerSplit: Resizable.Model,
  /** The vertical slider's level and the marked one's budget. */
  level: Schema.Number,
  budget: Schema.Struct({ low: Schema.Number, high: Schema.Number }),
  /** The color picker in a popover, and the popover. */
  brand: ColorPicker.Model,
  brandPopover: UiPopover.Model,
  /** The search fields, the toolbar and the file pickers. */
  fields: Fields.Model,
  /** The chat previews: the answer liked, the failed message retried, the words streamed. */
  answerLiked: Schema.Boolean,
  chatRetried: Schema.Boolean,
  streamed: Schema.Number,
  /** The conversation, whether it follows its end, and how many were sent and loaded. */
  chatScroller: MessageScroller.Model,
  chatEntries: Schema.Array(ChatEntry),
  chatSent: Schema.Number,
  chatLoaded: Schema.Number,
  /** Thinking Steps' openness: none follows the work. */
  thought: Schema.Option(Schema.Boolean),
  thinking: Schema.Option(Schema.Boolean),
  toolsOpen: Schema.Option(Schema.Boolean),
  /** The tool calls whose input and output are open. */
  toolSteps: Schema.Array(Schema.String),
  tripQuestions: Questionnaire.Model,
  tripQuestionsPaged: Questionnaire.Model,
  heading: AngleSlider.Model,
  rotation: AngleSlider.Model,
  tea: Timer.Model,
  lap: Timer.Model,
  customers: Marquee.Model,
  news: Marquee.Model,
  photo: ImageCropper.Model,
  avatarCrop: ImageCropper.Model,
  /** The avatar cropper's last export, shown beside it. */
  avatarUrl: Schema.Option(Schema.String),
  signature: SignaturePad.Model,
  charts: Schema.Record(ChartExample, Chart.Model),
  /** The notes panel and the order the page's panels stack in. */
  panels: Schema.Struct({ notes: FloatingPanel.Model, order: Schema.Array(Schema.String) }),
  tour: Tour.Model,
})
export type Model = typeof Model.Type

export const Message = defineMessageUnion({
  GotDrop: { message: FileDrop.Message },
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
  GotNotices: { message: Notices.Message },
  SavedDraft: {},
  ChoseRange: { range: Range },
  ToggledAlert: { example: AlertsExample, value: Schema.String },
  SetAlerts: { example: AlertsExample, values: Schema.Array(Schema.String) },
  GotHoverCard: { message: UiHoverIntent.Message },
  GotFileMenu: { message: Menu.Message },
  TypedCommand: { query: Schema.String },
  HighlightedCommand: { value: Schema.String },
  RanCommand: { value: Schema.String },
  GotSplit: { message: Resizable.Message },
  GotSidebar: { message: Sidebar.Message },
  GotSidebarOf: { example: SidebarExample, message: Sidebar.Message },
  ActedInSidebar: { action: Schema.String },
  GotTeamMenu: { message: Menu.Message },
  GotUserMenu: { message: Menu.Message },
  ChoseViewMode: { mode: ViewMode },
  GotNav: { example: NavExample, message: Nav.Message },
  GotMenubar: { message: Menubar.Message },
  GotVirtualList: { message: UiVirtualList.Message },
  GotCarousel: { example: CarouselExample, message: Carousel.Message },
  GotTreeIcons: { message: TreeView.Message },
  GotTreeChecks: { message: TreeView.Message },
  MovedPriceRange: { value: Schema.Struct({ low: Schema.Number, high: Schema.Number }) },
  GotTreeView: { message: TreeView.Message },
  GotAccent: { message: ColorPicker.Message },
  GotTripCalendar: { message: UiCalendar.Message },
  GotSheet: { example: SheetExample, message: Sheet.Message },
  GotDrawer: { message: Drawer.Message },
  OpenedSheet: { example: SheetExample },
  ClosedSheet: { example: SheetExample },
  GotCopy: { message: ClipboardMessage },
  TurnedLevel: { value: Schema.Number },
  MovedBudget: { value: Schema.Struct({ low: Schema.Number, high: Schema.Number }) },
  GotBrand: { message: ColorPicker.Message },
  GotBrandPopover: { message: UiPopover.Message },
  GotFields: { message: Fields.Message },
  SortedInvoices: { column: Schema.String },
  ChoseInvoice: { id: Schema.String, selected: Schema.Boolean },
  ChoseInvoices: { ids: Schema.Array(Schema.String) },
  OpenedInvoice: { id: Schema.String, expanded: Schema.Boolean },
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
  GotInputCopy: { message: InputCopy.Message },
  CopiedAnswer: {},
  LikedAnswer: {},
  RetriedChat: {},
  StreamedWords: {},
  GotChatScroller: { message: MessageScroller.Message },
  SentChat: {},
  LoadedOlderChat: {},
  ToggledThought: { open: Schema.Boolean },
  ToggledThinking: { open: Schema.Boolean },
  ToggledTools: { open: Schema.Boolean },
  ToggledToolStep: { id: Schema.String },
  GotTripQuestions: { message: Questionnaire.Message },
  GotTripQuestionsPaged: { message: Questionnaire.Message },
  GotHeading: { message: AngleSlider.Message },
  GotRotation: { message: AngleSlider.Message },
  GotTea: { message: Timer.Message },
  GotLap: { message: Timer.Message },
  GotCustomers: { message: Marquee.Message },
  GotNews: { message: Marquee.Message },
  GotPhoto: { message: ImageCropper.Message },
  GotAvatarCrop: { message: ImageCropper.Message },
  GotSignature: { message: SignaturePad.Message },
  GotChart: { example: ChartExample, message: Chart.Message },
  PressedQrDownload: { format: QrCode.Format },
  GotQrDownload: { message: QrCode.Message },
  GotPanel: { message: FloatingPanel.Message },
  OpenedPanel: {},
  GotTour: { message: Tour.Message },
  StartedTour: {},
})
export type Message = typeof Message.Type

const initialViewOptions: ViewOptions = {
  grid: false,
  rulers: true,
  zoom: 'Fit',
  chosen: Option.none(),
}

// The day the page was loaded; a picker that shows another opens on the wrong month.
const today = Effect.runSync(Calendar.today.local)

export const initial: Model = {
  drop: UiFileDrop.init({ id: 'preview-drop' }),
  attachments: [],
  volume: 60,
  dialog: UiDialog.init({ id: 'preview-dialog', isAnimated: true }),
  alertDialog: UiDialog.init({ id: 'preview-alert-dialog', isAnimated: true }),
  dialogs: {
    terms: UiDialog.init({ id: 'preview-terms', isAnimated: true }),
    form: UiDialog.init({ id: 'preview-rename-dialog', isAnimated: true }),
    nested: UiDialog.init({ id: 'preview-share', isAnimated: true }),
    'nested-inner': UiDialog.init({ id: 'preview-share-link', isAnimated: true }),
  },
  drawer: Drawer.init({ id: 'preview-drawer' }),
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
  pageMenu: shownMenu(Menu.init('preview-page-menu', PAGE_MENU, { isAnimated: true })),
  pageChoice: Option.none(),
  notices: Notices.init({ id: 'preview-notices' }),
  range: 'week',
  alerts: {
    alerts: ['mentions', 'replies'],
    described: ['mentions', 'replies'],
    'select-all': ['mentions', 'offers'],
    invalid: [],
  },
  hoverCard: UiHoverIntent.init(),
  fileMenu: Menu.init('preview-file-menu', FILE_MENU, { isAnimated: true }),
  fileChoice: Option.none(),
  commandQuery: '',
  commandActive: Option.none(),
  commandRan: Option.none(),
  split: Resizable.init(0.35),
  sidebar: appSidebar,
  sidebars: {
    resizable: sidebarResizableModel,
    floating: floatingSidebar,
    inset: insetSidebar,
    sections: sectionsSidebar,
    switcher: switcherSidebar,
  },
  sidebarActed: Option.none(),
  team: 'Acme Inc',
  teamMenu: Menu.init('preview-team-menu', TEAMS, { isAnimated: true }),
  userMenu: Menu.init('preview-user-menu', ACCOUNT, { isAnimated: true }),
  viewMode: 'board',
  navs: {
    panels: Nav.init('preview-site-nav'),
    pill: Nav.init('preview-pill-nav'),
    vertical: Nav.init('preview-side-nav'),
  },
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
  priceRange: { low: 100, high: 350 },
  treeView: TreeView.init({ id: 'preview-tree', open: ['src'] }),
  accent: ColorPicker.init({ id: 'preview-accent', color: ColorPicker.color('#3b82f6') }),
  trip: UiCalendar.init({ id: 'preview-trip', today }),
  tripDates: DateSelection.empty('Range'),
  inputCopy: InputCopy.init({ resetAfter: 2000 }),
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
  collapsibleSplit: Resizable.init(0.3),
  outerSplit: Resizable.init(0.3),
  innerSplit: Resizable.init(0.6),
  level: 40,
  budget: { low: 100, high: 350 },
  brand: ColorPicker.init({
    id: 'preview-brand',
    color: ColorPicker.color('#14b8a6'),
    format: 'oklch',
  }),
  brandPopover: UiPopover.init({ id: 'preview-brand-popover', contentFocus: true }),
  fields: Fields.init(),
  answerLiked: false,
  chatRetried: false,
  streamed: 6,
  chatScroller: MessageScroller.init({ id: 'preview-chat' }),
  chatEntries: CHAT,
  chatSent: 0,
  chatLoaded: 0,
  thought: Option.none(),
  thinking: Option.none(),
  // Done, so shut unless the reader opened it: the gallery shows it open.
  toolsOpen: Option.some(true),
  toolSteps: ['weather'],
  tripQuestions: Questionnaire.init({ id: 'preview-trip', questions: TRIP_QUESTIONS }),
  tripQuestionsPaged: Questionnaire.init({
    id: 'preview-trip-paged',
    questions: TRIP_QUESTIONS,
    layout: 'paged',
  }),
  heading: AngleSlider.init({ id: 'preview-heading', value: 45 }),
  rotation: AngleSlider.init({ id: 'preview-rotation', value: 90 }),
  tea: Timer.init({ id: 'preview-tea', countdown: true, duration: 3 * 60_000 }),
  lap: Timer.init({ id: 'preview-lap', interval: 10 }),
  customers: Marquee.init({ id: 'preview-customers' }),
  news: Marquee.init({ id: 'preview-news' }),
  photo: ImageCropper.init({ id: 'preview-photo' }),
  avatarCrop: ImageCropper.init({ id: 'preview-avatar-crop', shape: 'round', aspect: 1 }),
  avatarUrl: Option.none(),
  signature: SignaturePad.init({ id: 'preview-signature' }),
  charts: {
    bar: Chart.init(),
    line: Chart.init(),
    area: Chart.init(),
    donut: Chart.init(),
    table: Chart.init(),
    colors: Chart.init(),
  },
  panels: {
    notes: FloatingPanel.init({
      id: 'preview-panel',
      rect: { x: 80, y: 120, width: 320, height: 220 },
    }),
    order: ['preview-panel'],
  },
  tour: Tour.init({ id: 'preview-tour' }),
}

/** A step of the update, shared with the update file. */
export type Step = Update.Step<Model, Message>
