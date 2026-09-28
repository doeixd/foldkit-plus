import { Array, Effect, Equal, Match, Option, Schema, pipe } from 'effect'
import { Calendar, Command, Route, type Runtime, Submodel, Subscription, Update } from 'foldkit'
import type { Document, Html, HtmlBuilder } from 'foldkit/html'
import { defineMessageUnion } from 'foldkit/message'
import { UrlRequest, load, pushUrl } from 'foldkit/navigation'
import { defineRouteUnion, literal } from 'foldkit/route'
import { modifyFields } from 'foldkit/struct'
import { Url, toString as urlToString } from 'foldkit/url'

import { Dialog as UiDialog, Nav } from '@foldkit/ui'
import { SlotView, Style, type SlotBuilders } from 'foldkit-mixins'
import { Dialog } from 'foldkit-mixins-ui'

import * as Icon from './icon.js'
import { uiInit } from './ui/init.js'
import { Message as UiMessage } from './ui/message.js'
import { UiModel } from './ui/model.js'
import * as UiSubscriptions from './ui/subscriptions.js'
import { closeMobileMenu, openMobileMenu, uiUpdate } from './ui/update.js'
import * as View from './ui/view/index.js'
import {
  MobileMenuDialogStyle,
  MobileMenuSlots,
  MobileMenuStyle,
  ShellSlots,
  ShellStyle,
} from './style.js'

// ROUTE

export const AppRoute = defineRouteUnion({
  Home: {},
  Button: {},
  Calendar: {},
  Checkbox: {},
  Combobox: {},
  DatePicker: {},
  Dialog: {},
  Disclosure: {},
  DragAndDrop: {},
  Fieldset: {},
  FileDrop: {},
  HoverIntent: {},
  Input: {},
  Listbox: {},
  Menu: {},
  Meter: {},
  Popover: {},
  Progress: {},
  RadioGroup: {},
  Select: {},
  Slider: {},
  Switch: {},
  Tabs: {},
  Textarea: {},
  Toast: {},
  Tooltip: {},
  Animation: {},
  VirtualList: {},
  NotFound: { path: Schema.String },
})

export type AppRoute = typeof AppRoute.Type

const homeRouter = pipe(Route.root, Route.mapTo(AppRoute.Home))
const buttonRouter = pipe(literal('button'), Route.mapTo(AppRoute.Button))
const calendarRouter = pipe(literal('calendar'), Route.mapTo(AppRoute.Calendar))
const checkboxRouter = pipe(literal('checkbox'), Route.mapTo(AppRoute.Checkbox))
const comboboxRouter = pipe(literal('combobox'), Route.mapTo(AppRoute.Combobox))
const datePickerRouter = pipe(literal('date-picker'), Route.mapTo(AppRoute.DatePicker))
const dialogRouter = pipe(literal('dialog'), Route.mapTo(AppRoute.Dialog))
const disclosureRouter = pipe(literal('disclosure'), Route.mapTo(AppRoute.Disclosure))
const dragAndDropRouter = pipe(literal('drag-and-drop'), Route.mapTo(AppRoute.DragAndDrop))
const fieldsetRouter = pipe(literal('fieldset'), Route.mapTo(AppRoute.Fieldset))
const fileDropRouter = pipe(literal('file-drop'), Route.mapTo(AppRoute.FileDrop))
const hoverIntentRouter = pipe(literal('hover-intent'), Route.mapTo(AppRoute.HoverIntent))
const inputRouter = pipe(literal('input'), Route.mapTo(AppRoute.Input))
const listboxRouter = pipe(literal('listbox'), Route.mapTo(AppRoute.Listbox))
const menuRouter = pipe(literal('menu'), Route.mapTo(AppRoute.Menu))
const meterRouter = pipe(literal('meter'), Route.mapTo(AppRoute.Meter))
const popoverRouter = pipe(literal('popover'), Route.mapTo(AppRoute.Popover))
const progressRouter = pipe(literal('progress'), Route.mapTo(AppRoute.Progress))
const radioGroupRouter = pipe(literal('radio-group'), Route.mapTo(AppRoute.RadioGroup))
const selectRouter = pipe(literal('select'), Route.mapTo(AppRoute.Select))
const sliderRouter = pipe(literal('slider'), Route.mapTo(AppRoute.Slider))
const switchRouter = pipe(literal('switch'), Route.mapTo(AppRoute.Switch))
const tabsRouter = pipe(literal('tabs'), Route.mapTo(AppRoute.Tabs))
const textareaRouter = pipe(literal('textarea'), Route.mapTo(AppRoute.Textarea))
const toastRouter = pipe(literal('toast'), Route.mapTo(AppRoute.Toast))
const tooltipRouter = pipe(literal('tooltip'), Route.mapTo(AppRoute.Tooltip))
const animationRouter = pipe(literal('animation'), Route.mapTo(AppRoute.Animation))
const virtualListRouter = pipe(literal('virtual-list'), Route.mapTo(AppRoute.VirtualList))

const routeParser = Route.oneOf(
  buttonRouter,
  calendarRouter,
  checkboxRouter,
  comboboxRouter,
  datePickerRouter,
  dialogRouter,
  disclosureRouter,
  dragAndDropRouter,
  fieldsetRouter,
  fileDropRouter,
  hoverIntentRouter,
  inputRouter,
  listboxRouter,
  menuRouter,
  meterRouter,
  popoverRouter,
  progressRouter,
  radioGroupRouter,
  selectRouter,
  sliderRouter,
  switchRouter,
  tabsRouter,
  textareaRouter,
  toastRouter,
  tooltipRouter,
  animationRouter,
  virtualListRouter,
  homeRouter,
)

const urlToAppRoute = Route.parseUrlWithFallback(routeParser, AppRoute.NotFound)

// MODEL

export const Model = Schema.Struct({
  route: AppRoute,
  uiModel: UiModel,
})

export type Model = typeof Model.Type

// MESSAGE

export const Message = defineMessageUnion({
  CompletedNavigateInternal: {},
  CompletedLoadExternal: {},
  ClickedLink: { request: UrlRequest },
  ChangedUrl: { url: Url },
  ClickedOpenMobileMenu: {},
  GotUiMessage: { message: UiMessage },
})

export type Message = typeof Message.Type

// COMMAND

const NavigateInternal = Command.define('NavigateInternal', {
  args: { url: Schema.String },
  messages: [Message.CompletedNavigateInternal],
  execute: ({ url }) => pushUrl(url).pipe(Effect.as(Message.CompletedNavigateInternal())),
})

const LoadExternal = Command.define('LoadExternal', {
  args: { href: Schema.String },
  messages: [Message.CompletedLoadExternal],
  execute: ({ href }) => load(href).pipe(Effect.as(Message.CompletedLoadExternal())),
})

// INIT

export const Flags = Schema.Struct({
  today: Calendar.CalendarDate,
})

export type Flags = typeof Flags.Type

export const flags: Effect.Effect<Flags> = Effect.gen(function* () {
  const today = yield* Calendar.today.local
  return { today }
})

export const init: Runtime.RoutingApplicationInit<Model, Message, Flags> = (
  flags: Flags,
  url: Url,
) => {
  return Update.foldChildInit(uiInit(flags.today), {
    toParentModel: uiModel => ({ route: urlToAppRoute(url), uiModel }),
    toParentMessage: message => Message.GotUiMessage({ message }),
  })
}

// UPDATE

const toUiMessage = (message: UiMessage): Message => Message.GotUiMessage({ message })

const foldUi = Update.foldChild({
  update: uiUpdate,
  read: (model: Model) => Option.some(model.uiModel),
  write: (model, nextUiModel) => modifyFields(model, { uiModel: () => nextUiModel }),
  toParentMessage: toUiMessage,
})

const foldUiOpenMobileMenu = Update.foldChildStep({
  update: openMobileMenu,
  read: (model: Model) => Option.some(model.uiModel),
  write: (model, nextUiModel) => modifyFields(model, { uiModel: () => nextUiModel }),
  toParentMessage: toUiMessage,
})

const foldUiCloseMobileMenu = Update.foldChildStep({
  update: closeMobileMenu,
  read: (model: Model) => Option.some(model.uiModel),
  write: (model, nextUiModel) => modifyFields(model, { uiModel: () => nextUiModel }),
  toParentMessage: toUiMessage,
})

type UpdateReturn = Update.Return<Model, Message>

export const update = (model: Model, message: Message) =>
  Message.match<UpdateReturn>(message, {
    CompletedNavigateInternal: () => ({ model }),
    CompletedLoadExternal: () => ({ model }),

    ClickedLink: ({ request }) =>
      UrlRequest.match<UpdateReturn>(request, {
        Internal: ({ url }) => ({
          model,
          commands: [NavigateInternal({ url: urlToString(url) })],
        }),
        External: ({ href }) => ({
          model,
          commands: [LoadExternal({ href })],
        }),
      }),

    ChangedUrl: ({ url }) =>
      Update.combine(model, [
        stepModel => {
          const nextRoute = urlToAppRoute(url)

          return {
            model: Equal.equals(nextRoute, stepModel.route)
              ? stepModel
              : modifyFields(stepModel, { route: () => nextRoute }),
          }
        },
        // Closing a closed dialog still copies its Model, which would redraw
        // the page for a URL it already shows.
        stepModel =>
          stepModel.uiModel.mobileMenuDialog.isOpen
            ? foldUiCloseMobileMenu(stepModel)
            : { model: stepModel },
      ]),

    ClickedOpenMobileMenu: () => foldUiOpenMobileMenu(model),

    GotUiMessage: ({ message }) => foldUi(model, message),
  })

// VIEW

type NavItem = Readonly<{
  label: string
  routeTag: string
  href: string
}>

const NAV_ITEMS: ReadonlyArray<NavItem> = [
  { label: 'Animation', routeTag: 'Animation', href: animationRouter() },
  { label: 'Button', routeTag: 'Button', href: buttonRouter() },
  { label: 'Calendar', routeTag: 'Calendar', href: calendarRouter() },
  { label: 'Checkbox', routeTag: 'Checkbox', href: checkboxRouter() },
  { label: 'Combobox', routeTag: 'Combobox', href: comboboxRouter() },
  { label: 'Date Picker', routeTag: 'DatePicker', href: datePickerRouter() },
  { label: 'Dialog', routeTag: 'Dialog', href: dialogRouter() },
  { label: 'Disclosure', routeTag: 'Disclosure', href: disclosureRouter() },
  {
    label: 'Drag and Drop',
    routeTag: 'DragAndDrop',
    href: dragAndDropRouter(),
  },
  { label: 'Fieldset', routeTag: 'Fieldset', href: fieldsetRouter() },
  { label: 'File Drop', routeTag: 'FileDrop', href: fileDropRouter() },
  {
    label: 'Hover Intent',
    routeTag: 'HoverIntent',
    href: hoverIntentRouter(),
  },
  { label: 'Input', routeTag: 'Input', href: inputRouter() },
  { label: 'Listbox', routeTag: 'Listbox', href: listboxRouter() },
  { label: 'Menu', routeTag: 'Menu', href: menuRouter() },
  { label: 'Meter', routeTag: 'Meter', href: meterRouter() },
  { label: 'Popover', routeTag: 'Popover', href: popoverRouter() },
  { label: 'Progress', routeTag: 'Progress', href: progressRouter() },
  { label: 'Radio Group', routeTag: 'RadioGroup', href: radioGroupRouter() },
  { label: 'Select', routeTag: 'Select', href: selectRouter() },
  { label: 'Slider', routeTag: 'Slider', href: sliderRouter() },
  { label: 'Switch', routeTag: 'Switch', href: switchRouter() },
  { label: 'Tabs', routeTag: 'Tabs', href: tabsRouter() },
  { label: 'Textarea', routeTag: 'Textarea', href: textareaRouter() },
  { label: 'Toast', routeTag: 'Toast', href: toastRouter() },
  { label: 'Tooltip', routeTag: 'Tooltip', href: tooltipRouter() },
  {
    label: 'Virtual List',
    routeTag: 'VirtualList',
    href: virtualListRouter(),
  },
]

const NAV_ROUTE_TAGS: ReadonlyArray<string> = Array.map(NAV_ITEMS, navItem => navItem.routeTag)

const navItemHref = (index: number): string =>
  pipe(
    NAV_ITEMS,
    Array.get(index),
    Option.map(navItem => navItem.href),
    Option.getOrElse(() => homeRouter()),
  )

const componentNav = (currentRoute: AppRoute, toView: (render: Nav.RenderInfo) => Html): Html =>
  Nav.view({
    items: NAV_ROUTE_TAGS,
    ariaLabel: 'Components',
    toHref: (_routeTag, index) => navItemHref(index),
    isItemCurrent: routeTag => currentRoute._tag === routeTag,
    toView,
  })

/** The Slots a nav list draws with, which the sidebar and the mobile menu both publish. */
type NavListSlots<Message> = SlotBuilders<
  Pick<typeof ShellSlots, 'navList' | 'navItem' | 'navLink'>,
  Message
>

/** `Nav` marks the current link `aria-current="page"`, which the link's Style reads. */
const navListView = <Message>(
  items: ReadonlyArray<Nav.ItemInfo>,
  slots: NavListSlots<Message>,
  h: HtmlBuilder<Message>,
): Html =>
  h.ul(
    slots.navList.attrs(),
    pipe(
      NAV_ITEMS,
      Array.zip(items),
      Array.map(([navItem, item]) =>
        h.li(slots.navItem.attrs(), [h.a(slots.navLink.attrs(item.link), [navItem.label])]),
      ),
    ),
  )

type Slots = SlotBuilders<typeof ShellSlots, Message>

const brandView = <Message>(
  slots: SlotBuilders<
    Pick<typeof ShellSlots, 'homeLink' | 'brand' | 'brandName' | 'brandTagline'>,
    Message
  >,
  h: HtmlBuilder<Message>,
): Html =>
  h.a(slots.homeLink.attrs([h.Href(homeRouter())]), [
    h.div(slots.brand.attrs(), [
      h.span(slots.brandName.attrs(), ['Foldkit UI']),
      h.span(slots.brandTagline.attrs(), ['Component Showcase']),
    ]),
  ])

const sidebarView = (currentRoute: AppRoute, slots: Slots, h: HtmlBuilder<Message>): Html =>
  componentNav(currentRoute, ({ nav, items }) =>
    h.nav(slots.sidebar.attrs(nav), [
      h.div(slots.sidebarBrand.attrs(), [
        h.a(slots.homeLink.attrs([h.Href(homeRouter())]), [
          h.h1(slots.sidebarTitle.attrs(), ['Foldkit UI']),
        ]),
        h.span(slots.brandTagline.attrs(), ['Component Showcase']),
      ]),
      navListView(items, slots, h),
    ]),
  )

type MobileMenuInput = Readonly<{
  mobileMenuDialog: UiDialog.Model
  currentRoute: AppRoute
}>

/**
 * The full-screen menu below `md`. `@foldkit/ui`'s Dialog owns opening, focus
 * and Escape; its bundles take the page's look through the Dialog adapter.
 */
const MobileMenu = SlotView.forMessages<UiMessage>()
  .define(MobileMenuSlots, (input: MobileMenuInput, slots, h) =>
    h.submodel({
      slotId: input.mobileMenuDialog.id,
      model: input.mobileMenuDialog,
      view: UiDialog.view,
      viewInputs: {
        toView: render => {
          const dialog = Dialog.resolve(render, [MobileMenuDialogStyle.mixin], {
            input: undefined,
            h,
          })

          return h.dialog(
            dialog.dialog,
            render.isVisible
              ? [
                  h.div(dialog.backdrop),
                  h.div(dialog.panel, [
                    h.div(slots.menu.attrs(), [
                      h.div(slots.menuHeader.attrs(), [
                        brandView(slots, h),
                        h.button(
                          [...dialog.closeButton, h.AriaLabel('Close menu')],
                          [Icon.xMark(slots.closeIcon.attrs(), h)],
                        ),
                      ]),
                      componentNav(input.currentRoute, ({ nav, items }) =>
                        h.nav(slots.nav.attrs([...nav, h.Tabindex(-1), h.Autofocus(true)]), [
                          navListView(items, slots, h),
                        ]),
                      ),
                    ]),
                  ]),
                ]
              : [],
          )
        },
      },
      toParentMessage: message => UiMessage.GotMobileMenuDialogMessage({ message }),
    }),
  )
  .pipe(Style.attach(MobileMenuStyle))

type MobileMenuViewInputs = Readonly<{
  currentRoute: AppRoute
}>

const mobileMenuDialogView = Submodel.defineView<UiModel, UiMessage, MobileMenuViewInputs>(
  (model, { currentRoute }, h): Html =>
    MobileMenu({ mobileMenuDialog: model.mobileMenuDialog, currentRoute }, h),
)

const mobileHeaderView = (model: Model, slots: Slots, h: HtmlBuilder<Message>): Html =>
  h.header(slots.mobileHeader.attrs(), [
    brandView(slots, h),
    h.button(
      slots.menuButton.attrs([
        h.AriaExpanded(model.uiModel.mobileMenuDialog.isOpen),
        h.AriaLabel('Toggle menu'),
        h.OnClick(Message.ClickedOpenMobileMenu()),
      ]),
      [Icon.menu(slots.menuIcon.attrs(), h)],
    ),
  ])

const mobileMenuView = (model: Model, h: HtmlBuilder<Message>): Html =>
  h.submodel({
    slotId: 'mobile-menu',
    model: model.uiModel,
    view: mobileMenuDialogView,
    viewInputs: { currentRoute: model.route },
    toParentMessage: toUiMessage,
  })

const homeView = (slots: Slots, h: HtmlBuilder<Message>): Html =>
  h.div(slots.content.attrs(), [
    h.h1(slots.heading.attrs(), ['Foldkit UI Showcase']),
    h.p(slots.lead.attrs(), [
      'This is a showcase of every Foldkit UI component. Select a component from the menu to see it in action.',
    ]),
    h.p(slots.lead.attrs(), [
      'Each component is headless. You provide the markup and styling via a callback, and Foldkit handles accessibility, keyboard navigation, and state management.',
    ]),
  ])

const notFoundView = (path: string, slots: Slots, h: HtmlBuilder<Message>): Html =>
  h.div(slots.content.attrs(), [
    h.h1(slots.errorHeading.attrs(), ['404 — Page Not Found']),
    h.p(slots.lead.attrs(), [`The path "${path}" was not found.`]),
    h.a(slots.link.attrs([h.Href(homeRouter())]), ['Go Home']),
  ])

const contentView = (model: Model, slots: Slots, h: HtmlBuilder<Message>): Html => {
  const embedUi = (id: string, view: Submodel.View<UiModel, UiMessage>): Html =>
    h.submodel({
      slotId: id,
      model: model.uiModel,
      view,
      toParentMessage: toUiMessage,
    })

  return AppRoute.match(model.route, {
    Home: () => homeView(slots, h),
    Button: () => embedUi('ui-button', View.button),
    Calendar: () => embedUi('ui-calendar', View.calendar),
    Checkbox: () => embedUi('ui-checkbox', View.checkbox),
    Combobox: () => embedUi('ui-combobox', View.combobox),
    DatePicker: () => embedUi('ui-date-picker', View.datePicker),
    Dialog: () => embedUi('ui-dialog', View.dialog),
    Disclosure: () => embedUi('ui-disclosure', View.disclosure),
    DragAndDrop: () => embedUi('ui-drag-and-drop', View.dragAndDrop),
    Fieldset: () => embedUi('ui-fieldset', View.fieldset),
    FileDrop: () => embedUi('ui-file-drop', View.fileDrop),
    HoverIntent: () => embedUi('ui-hover-intent', View.hoverIntent),
    Input: () => embedUi('ui-input', View.input),
    Listbox: () => embedUi('ui-listbox', View.listbox),
    Menu: () => embedUi('ui-menu', View.menu),
    Meter: () => embedUi('ui-meter', View.meter),
    Popover: () => embedUi('ui-popover', View.popover),
    Progress: () => embedUi('ui-progress', View.progress),
    RadioGroup: () => embedUi('ui-radio-group', View.radioGroup),
    Select: () => embedUi('ui-select', View.select),
    Slider: () => embedUi('ui-slider', View.slider),
    Switch: () => embedUi('ui-switch', View.switch_),
    Tabs: () => embedUi('ui-tabs', View.tabs),
    Textarea: () => embedUi('ui-textarea', View.textarea),
    Toast: () => embedUi('ui-toast', View.toast),
    Tooltip: () => embedUi('ui-tooltip', View.tooltip),
    Animation: () => embedUi('ui-animation', View.animation),
    VirtualList: () => embedUi('ui-virtual-list', View.virtualList),
    NotFound: ({ path }) => notFoundView(path, slots, h),
  })
}

const routeTitle = (route: Model['route']): string =>
  Match.value(route).pipe(
    Match.tag('Home', () => 'Foldkit UI Showcase'),
    Match.orElse(({ _tag }) => `${_tag} | Foldkit UI Showcase`),
  )

const Shell = SlotView.forMessages<Message>()
  .define(ShellSlots, (model: Model, slots, h) =>
    h.div(slots.layout.attrs(), [
      mobileHeaderView(model, slots, h),
      mobileMenuView(model, h),
      sidebarView(model.route, slots, h),
      h.main(slots.main.attrs(), [contentView(model, slots, h)]),
    ]),
  )
  .pipe(Style.attach(ShellStyle))

export const view = (model: Model, h: HtmlBuilder<Message>): Document => ({
  title: routeTitle(model.route),
  body: Shell(model, h),
})

// SUBSCRIPTION

export const subscriptions = Subscription.lift(UiSubscriptions.subscriptions)<Model, Message>({
  toChildModel: model => model.uiModel,
  toParentMessage: message => Message.GotUiMessage({ message }),
})
