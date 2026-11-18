/**
 * The state of the component previews that have some: each `@foldkit/ui`
 * component's own Model beside the value it reports, so the component owns
 * focus, a drag or an open popup and this Model owns the choice. The site
 * holds one of these and folds `Message` into it.
 */
import { Match, Option } from 'effect'
import { Subscription, Update } from 'foldkit'
import * as Command from 'foldkit/command'
import { makeModifyFieldsFor, modifyFields } from 'foldkit/struct'
import { Calendar as UiCalendar, Dialog as UiDialog } from '@foldkit/ui'
import {
  CheckboxGroup,
  Menubar,
  Calendar as DateSelection,
  Menu,
  Nav,
  Command as CommandMenu,
  AngleSlider,
  Chart,
} from 'foldkit-mixins-ui'
import * as Fields from './fields.js'

import { MENUBAR, ViewOptions, HEADING_LAYOUT, ROTATION_LAYOUT } from '../snippets/components.js'
import { Message, Model, NavExample, type Step } from './widgets.js'

/**
 * Whether `message` closes a menu only because the reader looked away: a
 * press elsewhere on the page, or focus leaving its rows. The gallery's menu
 * ignores them, so it stays shown until it is answered.
 */
const dismisses = (message: Menu.Message): boolean =>
  Match.value(message).pipe(
    Match.tags({
      PressedAway: () => true,
      GotMenu: ({ message: inner }) => inner._tag === 'BlurredItems',
    }),
    Match.orElse(() => false),
  )

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

const dialogOut = UiDialog.OutMessage.match<Step>({ Opened: () => same, Closed: () => same })

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

const foldNav = Update.foldChildAt({
  update: Nav.update,
  readAt: (model: Model, example: NavExample) => Option.some(model.navs[example]),
  writeAt: (model, example, nav) =>
    modifyFields(model, { navs: navs => ({ ...navs, [example]: nav }) }),
  toParentMessage: (example, message) => Message.GotNav({ example, message }),
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

const foldHeading = Update.foldChild({
  ...own('heading', Message.GotHeading),
  update: AngleSlider.update(HEADING_LAYOUT),
})
const foldRotation = Update.foldChild({
  ...own('rotation', Message.GotRotation),
  update: AngleSlider.update(ROTATION_LAYOUT),
})

export const update = (model: Model, message: Message): Update.Return<Model, Message> =>
  Message.match(message, {
    TurnedVolume: ({ value }) =>
      value === model.volume ? { model } : { model: modifyFields(model, { volume: () => value }) },
    GotFileMenu: ({ message }) => foldFileMenu(model, message),
    TypedCommand: ({ query }) => ({
      model: modifyFields(model, { commandQuery: () => query }),
    }),
    HighlightedCommand: ({ value }) => ({
      model: modifyFields(model, { commandActive: () => Option.some(value) }),
    }),
    ChoseViewMode: ({ mode }) =>
      mode === model.viewMode
        ? { model }
        : { model: modifyFields(model, { viewMode: () => mode }) },
    GotNav: ({ example, message }) => foldNav(model, example, message),
    RanCommand: ({ value }) => ({
      model: modifyFields(model, { commandRan: () => Option.some(value) }),
    }),
    GotPageMenu: ({ message }) => (dismisses(message) ? { model } : foldPageMenu(model, message)),
    GotMenubar: ({ message }) => foldMenubar(model, message),
    MovedPriceRange: ({ value }) =>
      value.low === model.priceRange.low && value.high === model.priceRange.high
        ? { model }
        : { model: modifyFields(model, { priceRange: () => value }) },
    GotTripCalendar: ({ message }) => foldTripCalendar(model, message),
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
    GotHeading: ({ message }) => foldHeading(model, message),
    GotRotation: ({ message }) => foldRotation(model, message),
    GotChart: ({ example, message }) => {
      const chart = Chart.update(model.charts[example], message).model
      // The same Model when the chart's is: a pointer over the lit band changes nothing.
      return chart === model.charts[example]
        ? { model }
        : { model: modifyFields(model, { charts: all => ({ ...all, [example]: chart }) }) }
    },
    TurnedLevel: ({ value }) =>
      value === model.level ? { model } : { model: modifyFields(model, { level: () => value }) },
    MovedBudget: ({ value }) =>
      value.low === model.budget.low && value.high === model.budget.high
        ? { model }
        : { model: modifyFields(model, { budget: () => value }) },
    GotFields: ({ message }) => {
      const next = Fields.update(model.fields, message)
      return {
        model:
          next.model === model.fields ? model : modifyFields(model, { fields: () => next.model }),
        commands: Command.mapMessages(next.commands ?? [], inner =>
          Message.GotFields({ message: inner }),
        ),
      }
    },
    ChoseRange: ({ range }) =>
      range === model.range ? { model } : { model: modifyFields(model, { range: () => range }) },
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
  })

/**
 * ⌘K or Ctrl+K opens the command menu's dialog: the site lifts `palette`
 * only while the Command page shows.
 */
export const subscriptions = Subscription.make<Model, Message>()(() => ({
  palette: Subscription.persistentEntry(CommandMenu.hotkey(Message.OpenedPalette())),
}))
