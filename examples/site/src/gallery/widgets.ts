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
  InputCopy,
  Calendar as DateSelection,
  ColorPicker,
  Menu,
  Nav,
  Sheet,
  Drawer,
  Toast,
  FileDrop,
  AngleSlider,
  Timer,
  Marquee,
  ImageCropper,
  SignaturePad,
  Chart,
} from 'foldkit-mixins-ui'
import * as UiFileDrop from '@foldkit/ui/fileDrop'
import * as UiTooltip from '@foldkit/ui/tooltip'
import { ClipboardMessage } from 'foldkit-primitives/dom'
import * as Fields from './fields.js'

import {
  FILE_MENU,
  MENUBAR,
  PAGE_MENU,
  ViewMode,
  ViewOptions,
  viewRows,
  Notices,
  Range,
} from '../snippets/components.js'

/** The chart examples, each lighting a point of its own. */
export const ChartExample = Schema.Literals(['bar', 'line', 'area', 'donut', 'table', 'colors'])
export type ChartExample = typeof ChartExample.Type

export const NavExample = Schema.Literals(['panels', 'pill', 'vertical'])
export type NavExample = typeof NavExample.Type

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
  viewMode: ViewMode,
  navs: Schema.Record(NavExample, Nav.Model),
  /** The menu bar's menus, and the command last chosen from it. */
  menubar: Menubar.Model,
  menubarChoice: Schema.Option(Schema.String),
  /** The virtual list's scroll and measurements. */
  /** The range slider's price range. */
  priceRange: Schema.Struct({ low: Schema.Number, high: Schema.Number }),
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
  /** The vertical slider's level and the marked one's budget. */
  level: Schema.Number,
  budget: Schema.Struct({ low: Schema.Number, high: Schema.Number }),
  /** The color picker in a popover, and the popover. */
  brand: ColorPicker.Model,
  brandPopover: UiPopover.Model,
  /** The search fields, the toolbar and the file pickers. */
  fields: Fields.Model,
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
  ChoseViewMode: { mode: ViewMode },
  GotNav: { example: NavExample, message: Nav.Message },
  GotMenubar: { message: Menubar.Message },
  MovedPriceRange: { value: Schema.Struct({ low: Schema.Number, high: Schema.Number }) },
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
  priceRange: { low: 100, high: 350 },
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
  level: 40,
  budget: { low: 100, high: 350 },
  brand: ColorPicker.init({
    id: 'preview-brand',
    color: ColorPicker.color('#14b8a6'),
    format: 'oklch',
  }),
  brandPopover: UiPopover.init({ id: 'preview-brand-popover', contentFocus: true }),
  fields: Fields.init(),
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
}

/** A step of the update, shared with the update file. */
export type Step = Update.Step<Model, Message>
