/**
 * The state of the component previews that have some: each `@foldkit/ui`
 * component's own Model beside the value it reports, so the component owns
 * focus, a drag or an open popup and this Model owns the choice. The site
 * holds one of these and folds `Message` into it.
 */
import { Duration, Effect, Match, Option, Schema } from 'effect'
import { Subscription, Update } from 'foldkit'
import * as Command from 'foldkit/command'
import { makeModifyFieldsFor, modifyFields } from 'foldkit/struct'
import {
  Calendar as UiCalendar,
  Dialog as UiDialog,
  HoverIntent as UiHoverIntent,
  Popover as UiPopover,
} from '@foldkit/ui'
import {
  Accordion,
  CheckboxGroup,
  Dialog,
  Menubar,
  InputCopy,
  Sidebar,
  Calendar as DateSelection,
  ColorPicker,
  Carousel,
  Menu,
  Nav,
  Sheet,
  Drawer,
  Command as CommandMenu,
  Toast,
  MessageScroller,
  Questionnaire,
  AngleSlider,
  Timer,
  Marquee,
  ImageCropper,
  SignaturePad,
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
  CAROUSEL_LAYOUT,
  AUTOPLAY_LAYOUT,
  THUMBNAILS_LAYOUT,
  PER_VIEW_LAYOUT,
  MENUBAR,
  ViewOptions,
  Notices,
  ANSWER,
  ChatEntry,
  HEADING_LAYOUT,
  ROTATION_LAYOUT,
  TOUR,
  downloadQr,
} from '../snippets/components.js'

/** The chart examples, each lighting a point of its own. */
import {
  Attachment,
  CarouselExample,
  DialogExample,
  Message,
  Model,
  NavExample,
  PopoverExample,
  SheetExample,
  SidebarExample,
  ToastExample,
  TooltipExample,
  type Step,
} from './widgets.js'

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

const foldDrop = Update.foldChild({
  ...own('drop', Message.GotDrop),
  update: UiFileDrop.update,
  foldOutMessage: UiFileDrop.OutMessage.match<Step>({
    ReceivedFiles:
      ({ files }) =>
      model => ({
        model: modifyFields(model, {
          attachments: current => [
            ...current,
            ...files.map(({ name, size }): Attachment => ({ name, size })),
          ],
        }),
      }),
    RejectedNonFiles: () => same,
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

const foldSidebar = Update.foldChild({
  ...own('sidebar', Message.GotSidebar),
  update: Sidebar.update,
})

const foldSidebarOf = Update.foldChildAt({
  update: Sidebar.update,
  readAt: (model: Model, example: SidebarExample) => Option.some(model.sidebars[example]),
  writeAt: (model, example, sidebar) =>
    modifyFields(model, { sidebars: sidebars => ({ ...sidebars, [example]: sidebar }) }),
  toParentMessage: (example, message) => Message.GotSidebarOf({ example, message }),
})

const foldTeamMenu = Update.foldChild({
  ...own('teamMenu', Message.GotTeamMenu),
  update: Menu.update,
  foldOutMessage: Menu.OutMessage.match<Step>({
    Selected:
      ({ value }) =>
      model => ({ model: modifyFields(model, { team: () => value }) }),
  }),
})

// The account's rows lead nowhere in the gallery: choosing one only closes the menu.
const foldUserMenu = Update.foldChild({
  ...own('userMenu', Message.GotUserMenu),
  update: Menu.update,
  foldOutMessage: Menu.OutMessage.match<Step>({ Selected: () => same }),
})

const foldNav = Update.foldChildAt({
  update: Nav.update,
  readAt: (model: Model, example: NavExample) => Option.some(model.navs[example]),
  writeAt: (model, example, nav) =>
    modifyFields(model, { navs: navs => ({ ...navs, [example]: nav }) }),
  toParentMessage: (example, message) => Message.GotNav({ example, message }),
})

const foldBrand = Update.foldChild({
  ...own('brand', Message.GotBrand),
  update: ColorPicker.update,
})

const foldBrandPopover = Update.foldChild({
  ...own('brandPopover', Message.GotBrandPopover),
  update: UiPopover.update,
  foldOutMessage: UiPopover.OutMessage.match<Step>({ Opened: () => same, Closed: () => same }),
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

const foldChatScroller = Update.foldChild({
  ...own('chatScroller', Message.GotChatScroller),
  update: MessageScroller.update,
})

// A chat would send the answers as the user's reply; the summary drawn says them here.
const tripOut = Questionnaire.OutMessage.match<Step>({ Answered: () => same })
const foldTripQuestions = Update.foldChild({
  ...own('tripQuestions', Message.GotTripQuestions),
  update: Questionnaire.update,
  foldOutMessage: tripOut,
})
const foldTripQuestionsPaged = Update.foldChild({
  ...own('tripQuestionsPaged', Message.GotTripQuestionsPaged),
  update: Questionnaire.update,
  foldOutMessage: tripOut,
})

const foldHeading = Update.foldChild({
  ...own('heading', Message.GotHeading),
  update: AngleSlider.update(HEADING_LAYOUT),
})
const foldRotation = Update.foldChild({
  ...own('rotation', Message.GotRotation),
  update: AngleSlider.update(ROTATION_LAYOUT),
})
const foldTea = Update.foldChild({ ...own('tea', Message.GotTea), update: Timer.update })
const foldLap = Update.foldChild({ ...own('lap', Message.GotLap), update: Timer.update })
const foldCustomers = Update.foldChild({
  ...own('customers', Message.GotCustomers),
  update: Marquee.update,
})
const foldNews = Update.foldChild({ ...own('news', Message.GotNews), update: Marquee.update })
const foldPhoto = Update.foldChild({
  ...own('photo', Message.GotPhoto),
  update: ImageCropper.update,
})
const foldAvatarCrop = Update.foldChild({
  ...own('avatarCrop', Message.GotAvatarCrop),
  update: ImageCropper.update,
})
const foldSignature = Update.foldChild({
  ...own('signature', Message.GotSignature),
  update: SignaturePad.update,
})
const tourField = own('tour', Message.GotTour)
// An application would remember the tour was seen; the gallery starts it again on a press.
const tourOut = (_ended: Tour.Ended): Step => same
const foldTour = Update.foldChild({
  ...tourField,
  update: Tour.update(TOUR),
  foldOutMessage: tourOut,
})
const startTour = Update.foldChildStep({
  ...tourField,
  update: (tour: Tour.Model) => Tour.start(tour, TOUR),
  foldOutMessage: tourOut,
})

const updatePanel = FloatingPanel.update()
/** The panel's step, its `Raised` lifting it to the top of the order. */
const panelStep = (model: Model, step: FloatingPanel.Return): Update.Return<Model, Message> => {
  const order = Option.match(Option.fromNullishOr(step.outMessage), {
    onNone: () => model.panels.order,
    onSome: ({ id }) => FloatingPanel.raise(model.panels.order, id),
  })
  return {
    model:
      step.model === model.panels.notes && order === model.panels.order
        ? model
        : modifyFields(model, { panels: () => ({ notes: step.model, order }) }),
    commands: Command.mapMessages(step.commands ?? [], message => Message.GotPanel({ message })),
  }
}

export const update = (model: Model, message: Message): Update.Return<Model, Message> =>
  Message.match(message, {
    GotDrop: ({ message }) => foldDrop(model, message),
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
    GotDrawer: ({ message }) => {
      const drawer = Drawer.update(model.drawer, message)
      return drawer === model.drawer
        ? { model }
        : { model: modifyFields(model, { drawer: () => drawer }) }
    },
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
    GotSidebarOf: ({ example, message }) => foldSidebarOf(model, example, message),
    ActedInSidebar: ({ action }) => ({
      model: modifyFields(model, { sidebarActed: () => Option.some(action) }),
    }),
    GotTeamMenu: ({ message }) => foldTeamMenu(model, message),
    GotUserMenu: ({ message }) => foldUserMenu(model, message),
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
    GotVirtualList: ({ message }) => foldVirtualList(model, message),
    GotCarousel: ({ example, message }) =>
      foldCarousel(model, example, carousel => carouselUpdates[example](carousel, message)),
    MovedPriceRange: ({ value }) =>
      value.low === model.priceRange.low && value.high === model.priceRange.high
        ? { model }
        : { model: modifyFields(model, { priceRange: () => value }) },
    GotAccent: ({ message }) => foldAccent(model, message),
    GotTripCalendar: ({ message }) => foldTripCalendar(model, message),
    GotCopy: ({ message }) =>
      ClipboardMessage.match(message, {
        Copied: () => foldInputCopy(model, InputCopy.Message.Copied()),
        CopyFailed: () => foldInputCopy(model, InputCopy.Message.Failed()),
      }),
    GotInputCopy: ({ message }) => foldInputCopy(model, message),
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
        actions: [{ label: 'Undo', value: 'undo' }],
      }),
    CopiedAnswer: () => ({
      model,
      commands: Command.mapMessages([InputCopy.Copy({ text: ANSWER.join(' ') })], message =>
        Message.GotCopy({ message }),
      ),
    }),
    LikedAnswer: () => ({ model: modifyFields(model, { answerLiked: liked => !liked }) }),
    RetriedChat: () =>
      model.chatRetried ? { model } : { model: modifyFields(model, { chatRetried: () => true }) },
    // A few words at a time, as a stream lands; once whole, the next press starts over.
    StreamedWords: () => ({
      model: modifyFields(model, {
        streamed: shown => (shown >= ANSWER.length ? 3 : Math.min(shown + 4, ANSWER.length)),
      }),
    }),
    GotChatScroller: ({ message }) => foldChatScroller(model, message),
    SentChat: () => {
      const sent = model.chatSent + 1
      const appended = modifyFields(model, {
        chatSent: () => sent,
        chatEntries: entries => [
          ...entries,
          { id: `sent-${sent}`, from: 'user', text: `Message ${sent}` },
          { id: `reply-${sent}`, from: 'assistant', text: `Reply ${sent}` },
        ],
      })
      return foldChatScroller(appended, MessageScroller.Message.Appended({ count: 2 }))
    },
    // Older messages land above: the scroller holds its place and counts nothing.
    LoadedOlderChat: () => {
      const loaded = model.chatLoaded + 1
      const older = Array.from({ length: 4 }, (_, at): ChatEntry => ({
        id: `older-${loaded}-${at}`,
        from: at % 2 === 0 ? 'user' : 'assistant',
        text: `An older message, ${loaded}.${at + 1}`,
      }))
      return {
        model: modifyFields(model, {
          chatLoaded: () => loaded,
          chatEntries: entries => [...older, ...entries],
        }),
      }
    },
    ToggledThought: ({ open }) => ({
      model: modifyFields(model, { thought: () => Option.some(open) }),
    }),
    ToggledThinking: ({ open }) => ({
      model: modifyFields(model, { thinking: () => Option.some(open) }),
    }),
    ToggledTools: ({ open }) => ({
      model: modifyFields(model, { toolsOpen: () => Option.some(open) }),
    }),
    ToggledToolStep: ({ id }) => ({
      model: modifyFields(model, {
        toolSteps: open => Accordion.toggled(open, id, { multiple: true }),
      }),
    }),
    GotTripQuestions: ({ message }) => foldTripQuestions(model, message),
    GotTripQuestionsPaged: ({ message }) => foldTripQuestionsPaged(model, message),
    GotHeading: ({ message }) => foldHeading(model, message),
    GotRotation: ({ message }) => foldRotation(model, message),
    GotTea: ({ message }) => foldTea(model, message),
    GotLap: ({ message }) => foldLap(model, message),
    GotCustomers: ({ message }) => foldCustomers(model, message),
    GotNews: ({ message }) => foldNews(model, message),
    GotPhoto: ({ message }) => foldPhoto(model, message),
    // The export comes back as the cropper's own Message, which the page keeps to show.
    GotAvatarCrop: ({ message }) => {
      const folded = foldAvatarCrop(model, message)
      return Match.value(message).pipe(
        Match.withReturnType<Update.Return<Model, Message>>(),
        Match.tag('Exported', ({ url }) => ({
          ...folded,
          model: modifyFields(folded.model, { avatarUrl: () => Option.some(url) }),
        })),
        Match.orElse(() => folded),
      )
    },
    GotSignature: ({ message }) => foldSignature(model, message),
    GotChart: ({ example, message }) => {
      const chart = Chart.update(model.charts[example], message).model
      // The same Model when the chart's is: a pointer over the lit band changes nothing.
      return chart === model.charts[example]
        ? { model }
        : { model: modifyFields(model, { charts: all => ({ ...all, [example]: chart }) }) }
    },
    PressedQrDownload: ({ format }) => ({
      model,
      commands: Command.mapMessages([downloadQr(format)], message =>
        Message.GotQrDownload({ message }),
      ),
    }),
    // A saved file needs no word from the page, and a refused one has nowhere to go here.
    GotQrDownload: () => ({ model }),
    GotPanel: ({ message }) => panelStep(model, updatePanel(model.panels.notes, message)),
    OpenedPanel: () => panelStep(model, FloatingPanel.open(model.panels.notes)),
    GotTour: ({ message }) => foldTour(model, message),
    StartedTour: () => startTour(model),
    TurnedLevel: ({ value }) =>
      value === model.level ? { model } : { model: modifyFields(model, { level: () => value }) },
    MovedBudget: ({ value }) =>
      value.low === model.budget.low && value.high === model.budget.high
        ? { model }
        : { model: modifyFields(model, { budget: () => value }) },
    GotBrand: ({ message }) => foldBrand(model, message),
    GotBrandPopover: ({ message }) => foldBrandPopover(model, message),
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
    GotNotices: ({ message }) => foldNotices(model, message),
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
