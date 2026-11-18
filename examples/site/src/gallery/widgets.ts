/**
 * The state of the component previews that have some: each `@foldkit/ui`
 * component's own Model beside the value it reports, so the component owns
 * focus, a drag or an open popup and this Model owns the choice. The site
 * holds one of these and folds `Message` into it.
 */
import { Effect, Option, Schema } from 'effect'
import { Calendar, Update } from 'foldkit'
import { defineMessageUnion } from 'foldkit/message'
import { Calendar as UiCalendar, Dialog as UiDialog } from '@foldkit/ui'
import {
  Menubar,
  Calendar as DateSelection,
  Menu,
  Nav,
  AngleSlider,
  Chart,
} from 'foldkit-mixins-ui'
import * as Fields from './fields.js'

import {
  FILE_MENU,
  MENUBAR,
  PAGE_MENU,
  ViewMode,
  ViewOptions,
  viewRows,
  Range,
} from '../snippets/components.js'

/** The chart examples, each lighting a point of its own. */
export const ChartExample = Schema.Literals(['bar', 'line', 'area', 'donut', 'table', 'colors'])
export type ChartExample = typeof ChartExample.Type

export const NavExample = Schema.Literals(['panels', 'pill', 'vertical'])
export type NavExample = typeof NavExample.Type

/** The checkbox group examples, each with alerts of its own. */
export const AlertsExample = Schema.Literals(['alerts', 'described', 'select-all', 'invalid'])
export type AlertsExample = typeof AlertsExample.Type

/** A menu drawn open from the start, its enter already over: the gallery shows its rows unasked. */
const shownMenu = (menu: Menu.Model): Menu.Model => ({
  ...menu,
  menu: { ...menu.menu, isOpen: true, animation: { ...menu.menu.animation, isShowing: true } },
})

export const Model = Schema.Struct({
  /** The slider's volume. */
  volume: Schema.Number,
  /** The menu a button opens and the one a right press opens, and what each last chose. */
  fileMenu: Menu.Model,
  fileChoice: Schema.Option(Schema.String),
  pageMenu: Menu.Model,
  pageChoice: Schema.Option(Schema.String),
  range: Range,
  /** Each checkbox group example's checked alerts. */
  alerts: Schema.Record(AlertsExample, Schema.Array(Schema.String)),
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
  /** The trip calendar, and the range picked on it. */
  trip: UiCalendar.Model,
  tripDates: DateSelection.Selection,
  /** The View menu, and what its rows set. */
  viewMenu: Menu.Model,
  viewOptions: ViewOptions,
  /** The command menu in a dialog: the dialog, its query and highlight, the pages stepped into. */
  palette: UiDialog.Model,
  paletteQuery: Schema.String,
  paletteActive: Schema.Option(Schema.String),
  palettePages: Schema.Array(Schema.String),
  paletteRan: Schema.Option(Schema.String),
  /** The vertical slider's level and the marked one's budget. */
  level: Schema.Number,
  budget: Schema.Struct({ low: Schema.Number, high: Schema.Number }),
  /** The search fields, the toolbar and the file pickers. */
  fields: Fields.Model,
  heading: AngleSlider.Model,
  rotation: AngleSlider.Model,
  charts: Schema.Record(ChartExample, Chart.Model),
})
export type Model = typeof Model.Type

export const Message = defineMessageUnion({
  TurnedVolume: { value: Schema.Number },
  GotPageMenu: { message: Menu.Message },
  ChoseRange: { range: Range },
  ToggledAlert: { example: AlertsExample, value: Schema.String },
  SetAlerts: { example: AlertsExample, values: Schema.Array(Schema.String) },
  GotFileMenu: { message: Menu.Message },
  TypedCommand: { query: Schema.String },
  HighlightedCommand: { value: Schema.String },
  RanCommand: { value: Schema.String },
  ChoseViewMode: { mode: ViewMode },
  GotNav: { example: NavExample, message: Nav.Message },
  GotMenubar: { message: Menubar.Message },
  MovedPriceRange: { value: Schema.Struct({ low: Schema.Number, high: Schema.Number }) },
  GotTripCalendar: { message: UiCalendar.Message },
  TurnedLevel: { value: Schema.Number },
  MovedBudget: { value: Schema.Struct({ low: Schema.Number, high: Schema.Number }) },
  GotFields: { message: Fields.Message },
  GotViewMenu: { message: Menu.Message },
  OpenedPalette: {},
  GotPalette: { message: UiDialog.Message },
  TypedPalette: { query: Schema.String },
  HighlightedPalette: { value: Schema.String },
  RanPalette: { value: Schema.String },
  LeftPalettePage: {},
  GotHeading: { message: AngleSlider.Message },
  GotRotation: { message: AngleSlider.Message },
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
  volume: 60,
  pageMenu: shownMenu(Menu.init('preview-page-menu', PAGE_MENU, { isAnimated: true })),
  pageChoice: Option.none(),
  range: 'week',
  alerts: {
    alerts: ['mentions', 'replies'],
    described: ['mentions', 'replies'],
    'select-all': ['mentions', 'offers'],
    invalid: [],
  },
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
  trip: UiCalendar.init({ id: 'preview-trip', today }),
  tripDates: DateSelection.empty('Range'),
  viewMenu: Menu.init('preview-view-menu', viewRows(initialViewOptions), { isAnimated: true }),
  viewOptions: initialViewOptions,
  palette: UiDialog.init({ id: 'preview-palette-dialog', isAnimated: true }),
  paletteQuery: '',
  paletteActive: Option.none(),
  palettePages: [],
  paletteRan: Option.none(),
  level: 40,
  budget: { low: 100, high: 350 },
  fields: Fields.init(),
  heading: AngleSlider.init({ id: 'preview-heading', value: 45 }),
  rotation: AngleSlider.init({ id: 'preview-rotation', value: 90 }),
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
