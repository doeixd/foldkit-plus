/**
 * The components the site shows: each a shipped recipe, the variant axes a
 * reader can pick from (read from the recipe itself), and the function in
 * `src/snippets/components.ts` that draws it. A selection the recipe does
 * not know never reaches it: every value is checked against the recipe's own
 * axes first.
 */
import { Option } from 'effect'
import type {
  Tabs as UiTabs,
  Combobox as UiCombobox,
  Listbox as UiListbox,
  Popover as UiPopover,
} from '@foldkit/ui'
import type * as UiTooltip from '@foldkit/ui/tooltip'
import type { Html, HtmlBuilder } from 'foldkit/html'
import { SlotView, type NamedStyle, type StylePieces } from 'foldkit-mixins'
import {
  AccordionSlots,
  AlertSlots,
  AvatarSlots,
  BreadcrumbSlots,
  ButtonSlots,
  CalendarSlots,
  CardGroupSlots,
  CardSlots,
  CheckboxGroupSlots,
  CheckboxSlots,
  CommandSlots,
  HoverIntentSlots,
  MenubarSlots,
  MeterSlots,
  NavSlots,
  ProgressSlots,
  CarouselSlots,
  TreeViewSlots,
  ColorPickerSlots,
  InputCopySlots,
  TagsInputSlots,
  PasswordInputSlots,
  RatingSlots,
  StepsSlots,
  VirtualListSlots,
  NumberFieldSlots,
  OtpFieldSlots,
  ResizableSlots,
  SidebarSlots,
  ComboboxSlots,
  DatePickerSlots,
  DialogSlots,
  EmptySlots,
  InputSlots,
  ItemSlots,
  ListboxSlots,
  MenuSlots,
  PaginationSlots,
  PopoverSlots,
  RadioGroupSlots,
  Recipes,
  SegmentedSlots,
  SelectSlots,
  SeparatorSlots,
  SkeletonSlots,
  SliderSlots,
  SpinnerSlots,
  SwitchSlots,
  TabsSlots,
  TextareaSlots,
  ToastSlots,
  TooltipSlots,
  TableSlots,
  ChatMessageSlots,
  MessageScrollerSlots,
  ThinkingIndicatorSlots,
  ThinkingStepsSlots,
  QuestionnaireSlots,
  AngleSliderSlots,
  TimerSlots,
  MarqueeSlots,
  ImageCropperSlots,
  SignaturePadSlots,
  QrCodeSlots,
  ChartSlots,
  CascadeSelectSlots,
  FloatingPanelSlots,
  TourSlots,
  type Nav,
  type Carousel,
} from 'foldkit-mixins-ui'

import * as Snippet from '../snippets/components.js'
import { forSlots } from '../snippets/theme.js'
import * as Widgets from './widgets.js'

/** One variant axis of a recipe, and the value it takes when none is picked. */
export interface Axis {
  readonly name: string
  readonly values: ReadonlyArray<string>
  readonly initial: string
}

/** What the reader picked, by axis name. */
export type Selection = Readonly<Record<string, string>>

/** The state a preview controls, held in the page's Model, and the Messages that change it. */
export interface Live<Message> {
  readonly switched: boolean
  readonly onSwitch: (on: boolean) => Message
  readonly chosen: string
  readonly onChoose: (key: string) => Message
  readonly dismissed: boolean
  readonly onDismiss: Message
  readonly onRestore: Message
  /** The reader's direction, for views that place or key off it. */
  readonly direction: 'ltr' | 'rtl'
  readonly widgets: Widgets.Model
  readonly onWidget: (message: Widgets.Message) => Message
  readonly h: HtmlBuilder<Message>
}

export interface Showcase {
  readonly slug: string
  readonly title: string
  readonly summary: string
  /** The recipe's name under `Recipes`, its file under `packages/mixins-ui/src/recipes`, and its slot contract's name. */
  readonly recipe: string
  readonly file: string
  readonly contract: string
  readonly axes: ReadonlyArray<Axis>
  readonly preview: <Message>(selection: Selection, live: Live<Message>) => Html
  /**
   * Named examples drawn with the picked style, each with its own snippet
   * region (`${slug}-${name}`) and a link to it (`#${name}`); empty until the
   * showcase is migrated, while the page shows one preview and one snippet.
   */
  readonly examples: ReadonlyArray<ShowcaseExample>
}

/** One named example of a showcase, drawn with the picked style. */
export interface ShowcaseExample {
  readonly name: string
  readonly title: string
  readonly render: <Message>(selection: Selection, live: Live<Message>) => Html
}

/** The value `axis` takes under `selection`: what was picked, if the recipe has it. */
export const valueOf = (axis: Axis, selection: Selection): string => {
  const picked = Object.hasOwn(selection, axis.name) ? selection[axis.name] : undefined
  return picked !== undefined && axis.values.includes(picked) ? picked : axis.initial
}

/** `Recipes.Button({ tone: 'neutral' })`: the selection as code, naming only what differs from the defaults. */
export const selectionCode = (showcase: Showcase, selection: Selection): string => {
  const picked = showcase.axes.flatMap(axis => {
    const value = valueOf(axis, selection)
    return value === axis.initial ? [] : [`${axis.name}: '${value}'`]
  })
  const argument = picked.length === 0 ? '{}' : `{ ${picked.join(', ')} }`
  return `forSlots(${showcase.contract})(Recipes.${showcase.recipe}(${argument}))`
}

const inert = SlotView.inertBuilder<never>()

/** The value of an axis the recipe sets nothing for until one is picked. */
const UNSET = 'unset'

interface RecipeOf<Slots> {
  readonly def: {
    readonly variants: Readonly<Record<string, object>>
    readonly defaults?: Readonly<Record<string, string | undefined>>
  }
}

/**
 * A showcase from a recipe. `only` names the axes a reader may pick from,
 * when a value of another would need different markup (a vertical rule).
 * A selection's style is built once and kept: a reader goes back and forth.
 * `examples` names the page's examples; each draws with the picked style, so
 * the axes switch every example at once, except the values an example `pins`:
 * a vertical stepper stays vertical whatever orientation is picked.
 */
const fromRecipe = <Slots>(
  about: Omit<Showcase, 'axes' | 'preview' | 'examples'>,
  contract: Slots,
  recipe: RecipeOf<Slots> & ((selection: never) => StylePieces<Slots>),
  draw: <Message>(style: NamedStyle<Slots>, live: Live<Message>) => Html,
  only?: ReadonlyArray<string>,
  examples: ReadonlyArray<{
    readonly name: string
    readonly title: string
    readonly draw: <Message>(style: NamedStyle<Slots>, live: Live<Message>) => Html
    readonly pins?: Selection
  }> = [],
): Showcase => {
  const axes = Object.entries(recipe.def.variants)
    .filter(([name]) => only === undefined || only.includes(name))
    .map(([name, values]): Axis => {
      const names = Object.keys(values)
      const initial = recipe.def.defaults?.[name]
      if (initial !== undefined) return { name, values: names, initial }
      // An axis the recipe leaves unset follows the page, as a size follows
      // the ladder's step, which is the default one on this page. One with no
      // such step (a lone `overflow: 'scroll'`, a `width: 'fill'`) can be left
      // unset, and is at first: picking its only value would force it on.
      return names.includes('md')
        ? { name, values: names, initial: 'md' }
        : { name, values: [UNSET, ...names], initial: UNSET }
    })
  // Every value passed was checked against the recipe's own axes by `valueOf`.
  const select = recipe as unknown as (selection: Selection) => StylePieces<Slots>
  const styles = new Map<string, NamedStyle<Slots>>()
  const styleOf = (selection: Selection): NamedStyle<Slots> => {
    const chosen = Object.fromEntries(
      axes.flatMap(axis => {
        const value = valueOf(axis, selection)
        return value === UNSET ? [] : [[axis.name, value]]
      }),
    )
    const key = axes.map(axis => valueOf(axis, selection)).join('/')
    const known = styles.get(key)
    if (known !== undefined) return known
    const style = forSlots(contract)(select(chosen))
    styles.set(key, style)
    return style
  }
  for (const { name, pins = {} } of examples)
    for (const [axis, value] of Object.entries(pins))
      if (
        !(
          recipe.def.variants[axis] !== undefined && Object.hasOwn(recipe.def.variants[axis], value)
        )
      )
        throw new Error(
          `${about.slug}#${name} pins ${axis}: '${value}', which ${about.recipe} lacks`,
        )
  return {
    ...about,
    axes,
    preview: (selection, live) => draw(styleOf(selection), live),
    examples: examples.map(({ name, title, draw: drawExample, pins = {} }) => ({
      name,
      title,
      render: (selection, live) => drawExample(styleOf({ ...selection, ...pins }), live),
    })),
  }
}

/** A showcase whose look has no axes to pick from. */
const fixed = (
  about: Omit<Showcase, 'axes' | 'preview' | 'examples'>,
  draw: <Message>(live: Live<Message>) => Html,
  examples: ReadonlyArray<{
    readonly name: string
    readonly title: string
    readonly draw: <Message>(live: Live<Message>) => Html
  }> = [],
): Showcase => ({
  ...about,
  axes: [],
  preview: (_, live) => draw(live),
  examples: examples.map(({ name, title, draw: drawExample }) => ({
    name,
    title,
    render: (_, live) => drawExample(live),
  })),
})

/** A pagination example on its own page of the widgets' Model. */
const paged =
  (
    draw: <Message>(
      style: NamedStyle<typeof PaginationSlots>,
      page: number,
      onPage: (page: number) => Message,
      h: HtmlBuilder<Message>,
    ) => Html,
    example: Widgets.PaginationExample,
  ) =>
  <Message>(style: NamedStyle<typeof PaginationSlots>, live: Live<Message>): Html =>
    draw(
      style,
      live.widgets.pages[example],
      page => live.onWidget(Widgets.Message.ChosePage({ example, page })),
      live.h,
    )

/** A checkbox group example on its own alerts of the widgets' Model. */
const alertsOf =
  (
    draw: <Message>(
      style: NamedStyle<typeof CheckboxGroupSlots>,
      checked: ReadonlyArray<string>,
      onToggle: (value: string) => Message,
      h: HtmlBuilder<Message>,
    ) => Html,
    example: Widgets.AlertsExample,
  ) =>
  <Message>(style: NamedStyle<typeof CheckboxGroupSlots>, live: Live<Message>): Html =>
    draw(
      style,
      live.widgets.alerts[example],
      value => live.onWidget(Widgets.Message.ToggledAlert({ example, value })),
      live.h,
    )

const cardBasic = <Message>(style: NamedStyle<typeof CardSlots>, live: Live<Message>) =>
  Snippet.card(
    style,
    { dismissed: live.dismissed, onDismiss: live.onDismiss, onRestore: live.onRestore },
    live.h,
  )

const cardPlans = <Message>(style: NamedStyle<typeof CardGroupSlots>, live: Live<Message>) =>
  Snippet.cardGroup(style, { chosen: live.chosen, onChoose: live.onChoose }, live.h)

type FruitDraw = <Message>(
  style: NamedStyle<typeof ListboxSlots>,
  state: Snippet.FruitState,
  toMessage: (message: UiListbox.Message) => Message,
  direction: 'ltr' | 'rtl',
  h: HtmlBuilder<Message>,
) => Html

/** A custom select example on its own list and fruit of the widgets' Model, in its own style. */
const custom = (
  name: string,
  title: string,
  style: NamedStyle<typeof ListboxSlots>,
  draw: FruitDraw,
  example: Widgets.SelectExample = 'custom',
) => ({
  name,
  title,
  draw: <Message>(_style: NamedStyle<typeof SelectSlots>, live: Live<Message>) =>
    draw(
      style,
      live.widgets.selects[example],
      message => live.onWidget(Widgets.Message.GotSelect({ example, message })),
      live.direction,
      live.h,
    ),
})

const cityMessage =
  <Message>(live: Live<Message>, example: Widgets.CityExample) =>
  (message: UiCombobox.Message) =>
    live.onWidget(Widgets.Message.GotCityBox({ example, message }))

const comboboxBasic = <Message>(style: NamedStyle<typeof ComboboxSlots>, live: Live<Message>) =>
  Snippet.combobox(
    style,
    live.widgets,
    message => live.onWidget(Widgets.Message.GotCombobox({ message })),
    live.h,
  )

const passwordBasic = <Message>(
  style: NamedStyle<typeof PasswordInputSlots>,
  live: Live<Message>,
) =>
  Snippet.passwordInput(
    style,
    {
      value: live.widgets.password,
      visible: live.widgets.passwordShown,
      onInput: value => live.onWidget(Widgets.Message.TypedPassword({ value })),
      onToggle: live.onWidget(Widgets.Message.ToggledPassword()),
    },
    live.h,
  )

const tagsBasic = <Message>(style: NamedStyle<typeof TagsInputSlots>, live: Live<Message>) =>
  Snippet.tagsInput(
    style,
    live.widgets.tags,
    message => live.onWidget(Widgets.Message.GotTags({ message })),
    live.h,
  )

const commandBasic = <Message>(style: NamedStyle<typeof CommandSlots>, live: Live<Message>) =>
  Snippet.command(
    style,
    {
      query: live.widgets.commandQuery,
      active: live.widgets.commandActive,
      ran: live.widgets.commandRan,
    },
    {
      onQuery: query => live.onWidget(Widgets.Message.TypedCommand({ query })),
      onActive: value => live.onWidget(Widgets.Message.HighlightedCommand({ value })),
      onRun: value => live.onWidget(Widgets.Message.RanCommand({ value })),
    },
    live.h,
  )

const menuActions = <Message>(style: NamedStyle<typeof MenuSlots>, live: Live<Message>) =>
  Snippet.menu(
    style,
    {
      pageMenu: live.widgets.pageMenu,
      pageChoice: live.widgets.pageChoice,
      fileMenu: live.widgets.fileMenu,
      fileChoice: live.widgets.fileChoice,
    },
    message => live.onWidget(Widgets.Message.GotPageMenu({ message })),
    message => live.onWidget(Widgets.Message.GotFileMenu({ message })),
    live.direction,
    live.h,
  )

/** One toast example's stack of the widgets' Model, named for its landmark. */
const toastStack = <Message>(
  live: Live<Message>,
  example: Widgets.ToastExample,
  label: string,
): Snippet.ToastStack<Message> => ({
  model: live.widgets.toasts[example],
  onMessage: message => live.onWidget(Widgets.Message.GotToast({ example, message })),
  label,
})

const toastTypes =
  (example: 'types' | 'rich') =>
  <Message>(style: NamedStyle<typeof ToastSlots>, live: Live<Message>) =>
    Snippet.toastTypes(
      style,
      toastStack(live, example, example === 'rich' ? 'Notifications, rich' : 'Notifications'),
      type => live.onWidget(Widgets.Message.RaisedToast({ example, type })),
      live.h,
    )

const popoverAt =
  (
    example: Widgets.PopoverExample,
    draw: <Message>(
      style: NamedStyle<typeof PopoverSlots>,
      model: UiPopover.Model,
      toMessage: (message: UiPopover.Message) => Message,
      h: HtmlBuilder<Message>,
    ) => Html,
  ) =>
  <Message>(style: NamedStyle<typeof PopoverSlots>, live: Live<Message>) =>
    draw(
      style,
      live.widgets.popovers[example],
      message => live.onWidget(Widgets.Message.GotPopover({ example, message })),
      live.h,
    )

const tooltipAt =
  (
    example: Widgets.TooltipExample,
    draw: <Message>(
      style: NamedStyle<typeof TooltipSlots>,
      model: UiTooltip.Model,
      toMessage: (message: UiTooltip.Message) => Message,
      h: HtmlBuilder<Message>,
    ) => Html,
  ) =>
  <Message>(live: Live<Message>) =>
    draw(
      Snippet.TooltipStyle,
      live.widgets.tooltips[example],
      message => live.onWidget(Widgets.Message.GotTooltip({ example, message })),
      live.h,
    )

const dialogMessages = <Message>(
  live: Live<Message>,
  example: Widgets.DialogExample,
): Snippet.DialogMessages<Message> => ({
  onOpen: live.onWidget(Widgets.Message.OpenedDialogAt({ example })),
  onClose: live.onWidget(Widgets.Message.ClosedDialogAt({ example })),
  toMessage: message => live.onWidget(Widgets.Message.GotDialogAt({ example, message })),
})

const dialogConfirm = <Message>(style: NamedStyle<typeof DialogSlots>, live: Live<Message>) =>
  Snippet.dialog(
    style,
    { dialog: live.widgets.dialog, alert: live.widgets.alertDialog },
    {
      dialog: {
        onOpen: live.onWidget(Widgets.Message.OpenedDialog()),
        onClose: live.onWidget(Widgets.Message.ClosedDialog()),
        toMessage: message => live.onWidget(Widgets.Message.GotDialog({ message })),
      },
      alert: {
        onOpen: live.onWidget(Widgets.Message.OpenedAlertDialog()),
        onClose: live.onWidget(Widgets.Message.ClosedAlertDialog()),
        toMessage: message => live.onWidget(Widgets.Message.GotAlertDialog({ message })),
      },
    },
    live.h,
  )

const sheetMessages = <Message>(
  live: Live<Message>,
  example: Widgets.SheetExample,
): Snippet.SheetMessages<Message> => ({
  onOpen: live.onWidget(Widgets.Message.OpenedSheet({ example })),
  onClose: live.onWidget(Widgets.Message.ClosedSheet({ example })),
  toMessage: message => live.onWidget(Widgets.Message.GotSheet({ example, message })),
})

const sheetDrawer = <Message>(style: NamedStyle<typeof DialogSlots>, live: Live<Message>) =>
  Snippet.sheetDrawer(style, live.widgets.sheets.drawer, sheetMessages(live, 'drawer'), live.h)

const tabsUnderline = <Message>(style: NamedStyle<typeof TabsSlots>, live: Live<Message>) =>
  Snippet.tabs(
    style,
    live.widgets,
    message => live.onWidget(Widgets.Message.GotTabs({ message })),
    live.h,
  )

const inboxMessage =
  <Message>(live: Live<Message>, example: Widgets.InboxExample) =>
  (message: UiTabs.Message) =>
    live.onWidget(Widgets.Message.GotInboxTabs({ example, message }))

const fileMessages = <Message>(live: Live<Message>, example: Widgets.FilesExample) => ({
  toMessage: (message: UiTabs.Message) =>
    live.onWidget(Widgets.Message.GotFileTabs({ example, message })),
  onClose: (file: string) => live.onWidget(Widgets.Message.ClosedFile({ example, file })),
})

const segmentedBasic = <Message>(style: NamedStyle<typeof SegmentedSlots>, live: Live<Message>) =>
  Snippet.segmented(
    style,
    live.widgets.range,
    range => live.onWidget(Widgets.Message.ChoseRange({ range })),
    live.h,
  )

const segmentedIcons =
  (iconOnly: boolean) =>
  <Message>(style: NamedStyle<typeof SegmentedSlots>, live: Live<Message>) =>
    Snippet.segmentedIcons(
      style,
      live.widgets.viewMode,
      mode => live.onWidget(Widgets.Message.ChoseViewMode({ mode })),
      iconOnly,
      live.h,
    )

const navMessage =
  <Message>(live: Live<Message>, example: Widgets.NavExample) =>
  (message: Nav.Message) =>
    live.onWidget(Widgets.Message.GotNav({ example, message }))

const sidebarRail = <Message>(style: NamedStyle<typeof SidebarSlots>, live: Live<Message>) =>
  Snippet.sidebar(
    style,
    live.widgets.sidebar,
    message => live.onWidget(Widgets.Message.GotSidebar({ message })),
    live.h,
  )

const carouselAt =
  (
    example: Widgets.CarouselExample,
    draw: <Message>(
      style: NamedStyle<typeof CarouselSlots>,
      model: Carousel.Model,
      onMessage: (message: Carousel.Message) => Message,
      h: HtmlBuilder<Message>,
    ) => Html,
  ) =>
  <Message>(style: NamedStyle<typeof CarouselSlots>, live: Live<Message>) =>
    draw(
      style,
      live.widgets.carousels[example],
      message => live.onWidget(Widgets.Message.GotCarousel({ example, message })),
      live.h,
    )

const treeBasic = <Message>(style: NamedStyle<typeof TreeViewSlots>, live: Live<Message>) =>
  Snippet.treeView(
    style,
    live.widgets.treeView,
    message => live.onWidget(Widgets.Message.GotTreeView({ message })),
    live.direction,
    live.h,
  )

const accordionBasic = <Message>(style: NamedStyle<typeof AccordionSlots>, live: Live<Message>) =>
  Snippet.accordion(
    style,
    live.widgets.faq,
    id => live.onWidget(Widgets.Message.ToggledFaq({ id })),
    live.h,
  )

const ratingBasic = <Message>(style: NamedStyle<typeof RatingSlots>, live: Live<Message>) =>
  Snippet.rating(
    style,
    live.widgets.stay,
    value => live.onWidget(Widgets.Message.RatedStay({ value })),
    live.h,
  )

const resizableBasic = <Message>(style: NamedStyle<typeof ResizableSlots>, live: Live<Message>) =>
  Snippet.resizable(
    style,
    live.widgets.split,
    message => live.onWidget(Widgets.Message.GotSplit({ message })),
    live.direction,
    live.h,
  )

const sliderBasic = <Message>(style: NamedStyle<typeof SliderSlots>, live: Live<Message>) =>
  Snippet.slider(
    style,
    { volume: live.widgets.volume, price: live.widgets.priceRange },
    {
      onVolume: value => live.onWidget(Widgets.Message.TurnedVolume({ value })),
      onPrice: value => live.onWidget(Widgets.Message.MovedPriceRange({ value })),
    },
    live.h,
  )

const calendarBasic = <Message>(style: NamedStyle<typeof CalendarSlots>, live: Live<Message>) =>
  Snippet.calendar(
    style,
    {
      calendar: live.widgets.calendar,
      selection: live.widgets.selection,
      trip: live.widgets.trip,
      tripDates: live.widgets.tripDates,
    },
    message => live.onWidget(Widgets.Message.GotCalendar({ message })),
    message => live.onWidget(Widgets.Message.GotTripCalendar({ message })),
    live.h,
  )

const colorInline = <Message>(style: NamedStyle<typeof ColorPickerSlots>, live: Live<Message>) =>
  Snippet.colorPicker(
    style,
    live.widgets.accent,
    message => live.onWidget(Widgets.Message.GotAccent({ message })),
    live.h,
  )

// Each checkbox example holds its own state: one press toggles one box.
const checkboxBasic = <Message>(style: NamedStyle<typeof CheckboxSlots>, live: Live<Message>) =>
  Snippet.checkbox(
    style,
    live.widgets.terms,
    checked => live.onWidget(Widgets.Message.ToggledTerms({ checked })),
    live.h,
  )

const chatBasic = <Message>(style: NamedStyle<typeof ChatMessageSlots>, live: Live<Message>) =>
  Snippet.chatMessage(
    style,
    live.widgets.answerLiked,
    {
      onCopy: live.onWidget(Widgets.Message.CopiedAnswer()),
      onLike: live.onWidget(Widgets.Message.LikedAnswer()),
    },
    live.h,
  )

const scrollerBasic = <Message>(
  style: NamedStyle<typeof MessageScrollerSlots>,
  live: Live<Message>,
) =>
  Snippet.messageScroller(
    style,
    live.widgets.chatScroller,
    live.widgets.chatEntries,
    {
      onMessage: message => live.onWidget(Widgets.Message.GotChatScroller({ message })),
      onSend: live.onWidget(Widgets.Message.SentChat()),
      onLoadOlder: live.onWidget(Widgets.Message.LoadedOlderChat()),
    },
    live.h,
  )

const thinkingBasic = (style: NamedStyle<typeof ThinkingIndicatorSlots>) =>
  Snippet.thinkingIndicator(style, inert)

const thoughtSteps = <Message>(style: NamedStyle<typeof ThinkingStepsSlots>, live: Live<Message>) =>
  Snippet.thinkingSteps(
    style,
    live.widgets.thought,
    open => live.onWidget(Widgets.Message.ToggledThought({ open })),
    live.h,
  )

const tripAll = <Message>(style: NamedStyle<typeof QuestionnaireSlots>, live: Live<Message>) =>
  Snippet.questionnaire(
    style,
    live.widgets.tripQuestions,
    message => live.onWidget(Widgets.Message.GotTripQuestions({ message })),
    live.h,
  )

const angleBasic = <Message>(style: NamedStyle<typeof AngleSliderSlots>, live: Live<Message>) =>
  Snippet.angleSlider(
    style,
    live.widgets.heading,
    message => live.onWidget(Widgets.Message.GotHeading({ message })),
    live.h,
  )

const timerCountdown = <Message>(style: NamedStyle<typeof TimerSlots>, live: Live<Message>) =>
  Snippet.timerCountdown(
    style,
    live.widgets.tea,
    message => live.onWidget(Widgets.Message.GotTea({ message })),
    live.h,
  )

const marqueeBasic = <Message>(style: NamedStyle<typeof MarqueeSlots>, live: Live<Message>) =>
  Snippet.marquee(
    style,
    live.widgets.customers,
    message => live.onWidget(Widgets.Message.GotCustomers({ message })),
    live.h,
  )

const cropperBasic = <Message>(style: NamedStyle<typeof ImageCropperSlots>, live: Live<Message>) =>
  Snippet.imageCropper(
    style,
    live.widgets.photo,
    message => live.onWidget(Widgets.Message.GotPhoto({ message })),
    live.h,
  )

const signatureBasic = <Message>(
  style: NamedStyle<typeof SignaturePadSlots>,
  live: Live<Message>,
) =>
  Snippet.signaturePad(
    style,
    live.widgets.signature,
    message => live.onWidget(Widgets.Message.GotSignature({ message })),
    live.h,
  )

const qrBasic = (style: NamedStyle<typeof QrCodeSlots>) => Snippet.qrCode(style, inert)

/** A chart example on its own lit point of the widgets' Model. */
const chartOf =
  (example: Widgets.ChartExample, draw: typeof Snippet.chartBar) =>
  <Message>(style: NamedStyle<typeof ChartSlots>, live: Live<Message>) =>
    draw(
      style,
      live.widgets.charts[example],
      message => live.onWidget(Widgets.Message.GotChart({ example, message })),
      live.h,
    )

const cascadeColumns = <Message>(
  style: NamedStyle<typeof CascadeSelectSlots>,
  live: Live<Message>,
) =>
  Snippet.cascadeSelect(
    style,
    live.widgets.cascade,
    message => live.onWidget(Widgets.Message.GotCascade({ message })),
    live.h,
  )

const panelBasic = <Message>(style: NamedStyle<typeof FloatingPanelSlots>, live: Live<Message>) =>
  Snippet.floatingPanel(
    style,
    live.widgets.panels,
    message => live.onWidget(Widgets.Message.GotPanel({ message })),
    live.onWidget(Widgets.Message.OpenedPanel()),
    live.h,
  )

const tourBasic = <Message>(style: NamedStyle<typeof TourSlots>, live: Live<Message>) =>
  Snippet.tour(
    style,
    live.widgets.tour,
    message => live.onWidget(Widgets.Message.GotTour({ message })),
    live.onWidget(Widgets.Message.StartedTour()),
    live.h,
  )

export const showcases: ReadonlyArray<Showcase> = [
  fromRecipe(
    {
      slug: 'button',
      title: 'Button',
      summary: 'An action, in three tones, five treatments and three sizes.',
      recipe: 'Button',
      file: 'button',
      contract: 'ButtonSlots',
    },
    ButtonSlots,
    Recipes.Button,
    style => Snippet.button(style, inert),
    undefined,
    [
      { name: 'basic', title: 'Basic', draw: style => Snippet.button(style, inert) },
      {
        name: 'toggle',
        title: 'Toggle',
        draw: (style, live) =>
          Snippet.toggleButtons(
            style,
            live.widgets.formats,
            format => live.onWidget(Widgets.Message.ToggledFormat({ format })),
            live.h,
          ),
      },
    ],
  ),
  fixed(
    {
      slug: 'button-group',
      title: 'Button group',
      summary: 'Related buttons joined into one control.',
      recipe: 'ButtonGroup',
      file: 'buttonGroup',
      contract: 'ButtonGroupSlots',
    },
    () => Snippet.buttonGroup(Snippet.ButtonGroupStyle, inert),
  ),
  fixed(
    {
      slug: 'badge',
      title: 'Badge',
      summary: 'A status pill toned by the value it carries.',
      recipe: 'Badge',
      file: 'badge',
      contract: 'BadgeSlots',
    },
    () => Snippet.badgesTinted(Snippet.BadgeStyle, inert),
    [
      {
        name: 'tinted',
        title: 'Tinted',
        draw: () => Snippet.badgesTinted(Snippet.BadgeStyle, inert),
      },
      { name: 'dot', title: 'Dot', draw: () => Snippet.badgesDot(Snippet.BadgeDotStyle, inert) },
      {
        name: 'outline',
        title: 'Outline',
        draw: () => Snippet.badgesOutline(Snippet.BadgeOutlineStyle, inert),
      },
      {
        name: 'solid',
        title: 'Solid',
        draw: () => Snippet.badgesSolid(Snippet.BadgeSolidStyle, inert),
      },
    ],
  ),
  fromRecipe(
    {
      slug: 'alert',
      title: 'Alert',
      summary:
        'A notice in four tones, tinted or bold: inline in the content, or a banner across the page.',
      recipe: 'Alert',
      file: 'alert',
      contract: 'AlertSlots',
    },
    AlertSlots,
    Recipes.Alert,
    // One alert in a tile; the banner has its own example.
    style => Snippet.alertInline(style, inert),
    undefined,
    [
      {
        name: 'inline',
        title: 'Inline',
        draw: (style, _live) => Snippet.alertInline(style, inert),
      },
      {
        name: 'banner',
        title: 'Banner',
        draw: (style, _live) => Snippet.alertBanner(style, inert),
      },
    ],
  ),
  fromRecipe(
    {
      slug: 'card',
      title: 'Card',
      summary: 'A surface with media, a title, content and actions, pressable and dismissible.',
      recipe: 'Card',
      file: 'card',
      contract: 'CardSlots',
    },
    CardSlots,
    Recipes.Card,
    cardBasic,
    undefined,
    [
      { name: 'basic', title: 'Basic', draw: cardBasic },
      { name: 'stat', title: 'A figure', draw: style => Snippet.cardStat(style, inert) },
      { name: 'media', title: 'Media', draw: style => Snippet.cardMedia(style, inert) },
      { name: 'profile', title: 'A person', draw: style => Snippet.cardProfile(style, inert) },
      {
        name: 'link',
        title: 'A link',
        draw: style => Snippet.cardLink(style, inert),
        pins: { lift: 'hover' },
      },
      { name: 'elevation', title: 'Elevation', draw: () => Snippet.cardElevation(inert) },
    ],
  ),
  fromRecipe(
    {
      slug: 'card-group',
      title: 'Card group',
      summary: 'Cards as one choice, with a highlight that follows the pointer between them.',
      recipe: 'CardGroup',
      file: 'card',
      contract: 'CardGroupSlots',
    },
    CardGroupSlots,
    Recipes.CardGroup,
    cardPlans,
    undefined,
    [
      { name: 'plans', title: 'Plans', draw: cardPlans },
      {
        name: 'grid',
        title: 'A grid',
        draw: (style, live) =>
          Snippet.cardGroupGrid(
            style,
            {
              chosen: live.widgets.region,
              onChoose: region => live.onWidget(Widgets.Message.ChoseRegion({ region })),
            },
            live.h,
          ),
        pins: { layout: 'separated' },
      },
    ],
  ),
  fromRecipe(
    {
      slug: 'input',
      title: 'Input',
      summary: 'A labelled text field with a description.',
      recipe: 'Input',
      file: 'field',
      contract: 'InputSlots',
    },
    InputSlots,
    Recipes.Input,
    style => Snippet.input(style, inert),
  ),
  fromRecipe(
    {
      slug: 'textarea',
      title: 'Textarea',
      summary: 'A field for more than one line.',
      recipe: 'Textarea',
      file: 'field',
      contract: 'TextareaSlots',
    },
    TextareaSlots,
    Recipes.Textarea,
    style => Snippet.textarea(style, inert),
  ),
  fromRecipe(
    {
      slug: 'select',
      title: 'Select',
      summary:
        'The native select, styled like the fields beside it, and a custom one drawn over Listbox with icons, descriptions and groups.',
      recipe: 'Select',
      file: 'select',
      contract: 'SelectSlots',
    },
    SelectSlots,
    Recipes.Select,
    (style, _live) => Snippet.selectBasic(style, inert),
    undefined,
    [
      { name: 'basic', title: 'Basic', draw: (style, _live) => Snippet.selectBasic(style, inert) },
      {
        name: 'placeholder',
        title: 'Placeholder',
        draw: (style, _live) => Snippet.selectPlaceholder(style, inert),
      },
      {
        name: 'groups',
        title: 'Groups',
        draw: (style, _live) => Snippet.selectGroups(style, inert),
      },
      {
        name: 'disabled',
        title: 'Disabled option',
        draw: (style, _live) => Snippet.selectDisabled(style, inert),
      },
      {
        name: 'invalid',
        title: 'Invalid',
        draw: (style, _live) => Snippet.selectInvalid(style, inert),
      },
      // Drawn over Listbox: the native select's style does not reach them.
      custom('custom', 'Custom', Snippet.SelectMenuStyle, Snippet.selectCustom),
      custom(
        'custom-icons',
        'Custom, with icons',
        Snippet.SelectMenuStyle,
        Snippet.selectIcons,
        'icons',
      ),
      custom(
        'custom-descriptions',
        'Custom, with descriptions',
        Snippet.SelectMenuStyle,
        Snippet.selectDescriptions,
        'descriptions',
      ),
      custom(
        'custom-groups',
        'Custom, in groups',
        Snippet.SelectMenuStyle,
        Snippet.selectCustomGroups,
        'groups',
      ),
      custom(
        'custom-placeholder',
        'Custom, with a placeholder',
        Snippet.SelectMenuStyle,
        Snippet.selectPrompt,
        'placeholder',
      ),
      custom(
        'custom-disabled',
        'Custom, with a disabled option',
        Snippet.SelectMenuStyle,
        Snippet.selectDisabledOption,
        'disabled',
      ),
      custom(
        'custom-check-start',
        'Custom, the check first',
        Snippet.SelectCheckStartStyle,
        Snippet.selectCustom,
        'check-start',
      ),
      custom(
        'custom-trigger-filled',
        'Custom, a filled trigger',
        Snippet.SelectFilledStyle,
        Snippet.selectCustom,
        'trigger-filled',
      ),
      custom(
        'custom-trigger-ghost',
        'Custom, a ghost trigger',
        Snippet.SelectGhostStyle,
        Snippet.selectCustom,
        'trigger-ghost',
      ),
      {
        name: 'custom-sizes',
        title: 'Custom, in three sizes',
        draw: (_style, live) =>
          Snippet.selectSizes(
            live.widgets.selects,
            (example, message) => live.onWidget(Widgets.Message.GotSelect({ example, message })),
            live.direction,
            live.h,
          ),
      },
    ],
  ),
  fromRecipe(
    {
      slug: 'checkbox',
      title: 'Checkbox',
      summary: 'A choice that is on or off, its state in your Model.',
      recipe: 'Checkbox',
      file: 'toggle',
      contract: 'CheckboxSlots',
    },
    CheckboxSlots,
    Recipes.Checkbox,
    checkboxBasic,
    undefined,
    [
      {
        name: 'basic',
        title: 'Basic',
        draw: checkboxBasic,
      },
      {
        name: 'indeterminate',
        title: 'Indeterminate',
        draw: (style, live) =>
          Snippet.checkboxIndeterminate(
            style,
            live.widgets.toppings,
            checked => live.onWidget(Widgets.Message.ToggledToppings({ checked })),
            live.h,
          ),
      },
      {
        name: 'card',
        title: 'Card',
        draw: (style, live) =>
          Snippet.checkboxCard(
            style,
            live.widgets.teamPlan,
            checked => live.onWidget(Widgets.Message.ToggledTeamPlan({ checked })),
            live.h,
          ),
      },
    ],
  ),
  fromRecipe(
    {
      slug: 'switch',
      title: 'Switch',
      summary: 'A setting that takes effect at once.',
      recipe: 'Switch',
      file: 'toggle',
      contract: 'SwitchSlots',
    },
    SwitchSlots,
    Recipes.Switch,
    (style, live) => Snippet.toggle(style, live.switched, live.onSwitch, live.h),
  ),
  fromRecipe(
    {
      slug: 'avatar',
      title: 'Avatar',
      summary: 'A picture of someone, or their initials when it does not load.',
      recipe: 'Avatar',
      file: 'avatar',
      contract: 'AvatarSlots',
    },
    AvatarSlots,
    Recipes.Avatar,
    style => Snippet.avatars(style, inert),
    undefined,
    [
      { name: 'pictures', title: 'Pictures', draw: style => Snippet.avatars(style, inert) },
      {
        name: 'initials',
        title: 'Initials',
        draw: style => Snippet.avatarInitials(style, inert),
        pins: { color: 'name' },
      },
      { name: 'status', title: 'Status', draw: style => Snippet.avatarStatus(style, inert) },
      { name: 'group', title: 'A group', draw: style => Snippet.avatarGroup(style, inert) },
      { name: 'shapes', title: 'Shapes', draw: () => Snippet.avatarShapes(inert) },
      { name: 'named', title: 'With a name', draw: style => Snippet.avatarNamed(style, inert) },
    ],
  ),
  fixed(
    {
      slug: 'kbd',
      title: 'Kbd',
      summary: 'A key on the keyboard.',
      recipe: 'Kbd',
      file: 'kbd',
      contract: 'KbdSlots',
    },
    () => Snippet.kbdCombo(Snippet.KbdStyle, inert),
    [
      { name: 'key', title: 'A key', draw: () => Snippet.kbdKey(Snippet.KbdStyle, inert) },
      {
        name: 'combo',
        title: 'A combination',
        draw: () => Snippet.kbdCombo(Snippet.KbdStyle, inert),
      },
      {
        name: 'joined',
        title: 'Joined by words',
        draw: () => Snippet.kbdJoined(Snippet.KbdStyle, inert),
      },
    ],
  ),
  fromRecipe(
    {
      slug: 'separator',
      title: 'Separator',
      summary: 'A rule between groups of content.',
      recipe: 'Separator',
      file: 'separator',
      contract: 'SeparatorSlots',
    },
    SeparatorSlots,
    Recipes.Separator,
    style => Snippet.separator(style, inert),
    undefined,
    [
      { name: 'basic', title: 'Basic', draw: style => Snippet.separator(style, inert) },
      { name: 'label', title: 'A label', draw: style => Snippet.separatorLabel(style, inert) },
      {
        name: 'vertical',
        title: 'Vertical',
        draw: style => Snippet.separatorVertical(style, inert),
        pins: { orientation: 'vertical' },
      },
      {
        name: 'dashed',
        title: 'Dashed',
        draw: style => Snippet.separatorDashed(style, inert),
        pins: { line: 'dashed', thickness: 'thick', spacing: 'md', inset: 'md' },
      },
    ],
  ),
  fromRecipe(
    {
      slug: 'skeleton',
      title: 'Skeleton',
      summary: 'A placeholder where content is still loading.',
      recipe: 'Skeleton',
      file: 'skeleton',
      contract: 'SkeletonSlots',
    },
    SkeletonSlots,
    Recipes.Skeleton,
    style => Snippet.skeleton(style, inert),
    undefined,
    [
      { name: 'basic', title: 'Basic', draw: style => Snippet.skeleton(style, inert) },
      { name: 'lines', title: 'Lines', draw: style => Snippet.skeletonLines(style, inert) },
      { name: 'shapes', title: 'Shapes', draw: style => Snippet.skeletonShapes(style, inert) },
      {
        name: 'shimmer',
        title: 'Shimmer',
        draw: style => Snippet.skeletonShimmer(style, inert),
        pins: { animation: 'shimmer' },
      },
    ],
  ),
  fromRecipe(
    {
      slug: 'spinner',
      title: 'Spinner',
      summary: 'Work in progress, announced politely.',
      recipe: 'Spinner',
      file: 'spinner',
      contract: 'SpinnerSlots',
    },
    SpinnerSlots,
    Recipes.Spinner,
    style => Snippet.spinner(style, inert),
    undefined,
    [
      { name: 'basic', title: 'Basic', draw: style => Snippet.spinner(style, inert) },
      { name: 'kinds', title: 'Kinds', draw: () => Snippet.spinnerKinds(inert) },
      { name: 'label', title: 'A label', draw: style => Snippet.spinnerLabel(style, inert) },
      { name: 'sizes', title: 'Sizes', draw: () => Snippet.spinnerSizes(inert) },
    ],
  ),
  fromRecipe(
    {
      slug: 'table',
      title: 'Table',
      summary:
        'Rows and columns, numbers aligned to the end; sorted, chosen and opened by the application.',
      recipe: 'Table',
      file: 'table',
      contract: 'TableSlots',
    },
    TableSlots,
    Recipes.Table,
    style => Snippet.table(style, inert),
    undefined,
    [
      { name: 'basic', title: 'Basic', draw: style => Snippet.table(style, inert) },
      {
        name: 'sortable',
        title: 'Sortable headings',
        draw: (style, live) =>
          Snippet.tableSortable(
            style,
            live.widgets.invoiceSort,
            column => live.onWidget(Widgets.Message.SortedInvoices({ column })),
            live.h,
          ),
      },
      {
        name: 'selection',
        title: 'Row selection',
        draw: (style, live) =>
          Snippet.tableSelection(
            style,
            live.widgets.invoicesChosen,
            (id, selected) => live.onWidget(Widgets.Message.ChoseInvoice({ id, selected })),
            ids => live.onWidget(Widgets.Message.ChoseInvoices({ ids })),
            live.h,
          ),
      },
      {
        name: 'expandable',
        title: 'Expandable rows',
        draw: (style, live) =>
          Snippet.tableExpandable(
            style,
            live.widgets.invoicesOpen,
            (id, expanded) => live.onWidget(Widgets.Message.OpenedInvoice({ id, expanded })),
            live.h,
          ),
      },
      { name: 'empty', title: 'Empty', draw: style => Snippet.tableEmpty(style, inert) },
      {
        name: 'sticky',
        title: 'Sticky header, striped',
        draw: style => Snippet.tableSticky(style, inert),
        pins: { header: 'sticky', rows: 'striped', density: 'compact' },
      },
    ],
  ),
  fromRecipe(
    {
      slug: 'breadcrumb',
      title: 'Breadcrumb',
      summary: 'Where a page sits, and the way back up.',
      recipe: 'Breadcrumb',
      file: 'breadcrumb',
      contract: 'BreadcrumbSlots',
    },
    BreadcrumbSlots,
    Recipes.Breadcrumb,
    style => Snippet.breadcrumb(style, inert),
    undefined,
    [
      { name: 'basic', title: 'Basic', draw: style => Snippet.breadcrumb(style, inert) },
      { name: 'icons', title: 'Icons', draw: style => Snippet.breadcrumbIcons(style, inert) },
      {
        name: 'custom',
        title: 'A separator of your own',
        draw: style => Snippet.breadcrumbCustom(style, inert),
      },
      {
        name: 'collapsed',
        title: 'Collapsed',
        draw: (style, live) =>
          Snippet.breadcrumbCollapsed(
            style,
            live.widgets.trailExpanded,
            live.onWidget(Widgets.Message.ExpandedTrail()),
            live.h,
          ),
      },
      {
        name: 'menu',
        title: 'The hidden steps in a menu',
        draw: (style, live) =>
          Snippet.breadcrumbMenu(
            style,
            live.widgets.trailMenu,
            message => live.onWidget(Widgets.Message.GotTrailMenu({ message })),
            live.h,
          ),
      },
    ],
  ),
  fromRecipe(
    {
      slug: 'pagination',
      title: 'Pagination',
      summary: 'Pages of a long list, the current one in your Model.',
      recipe: 'Pagination',
      file: 'pagination',
      contract: 'PaginationSlots',
    },
    PaginationSlots,
    Recipes.Pagination,
    paged(Snippet.pagination, 'numbered'),
    undefined,
    [
      { name: 'numbered', title: 'Numbered', draw: paged(Snippet.pagination, 'numbered') },
      {
        name: 'simple',
        title: 'Previous and next',
        draw: paged(Snippet.paginationSimple, 'simple'),
      },
      { name: 'ends', title: 'First and last', draw: paged(Snippet.paginationEnds, 'ends') },
      {
        name: 'range',
        title: 'Rows and page size',
        draw: (style, live) =>
          Snippet.paginationRange(
            style,
            { page: live.widgets.pages.range, perPage: live.widgets.perPage },
            page => live.onWidget(Widgets.Message.ChosePage({ example: 'range', page })),
            perPage => live.onWidget(Widgets.Message.ChosePerPage({ perPage })),
            live.h,
          ),
      },
      {
        name: 'siblings',
        title: 'Siblings and boundaries',
        draw: paged(Snippet.paginationSiblings, 'siblings'),
      },
      {
        name: 'compact',
        title: 'Compact',
        pins: { compact: 'always' },
        draw: paged(Snippet.paginationCompact, 'compact'),
      },
    ],
  ),
  fromRecipe(
    {
      slug: 'item',
      title: 'Item',
      summary: 'A row of a list: media, a title, a line and actions.',
      recipe: 'Item',
      file: 'item',
      contract: 'ItemSlots',
    },
    ItemSlots,
    Recipes.Item,
    style => Snippet.item(style, inert),
    undefined,
    [
      { name: 'basic', title: 'Basic', draw: style => Snippet.item(style, inert) },
      {
        name: 'settings',
        title: 'Settings',
        draw: style => Snippet.itemSettings(style, inert),
        pins: { media: 'icon' },
      },
      {
        name: 'selectable',
        title: 'A choice',
        draw: (style, live) =>
          Snippet.itemSelectable(
            style,
            {
              chosen: live.widgets.plan,
              onChoose: plan => live.onWidget(Widgets.Message.ChosePlan({ plan })),
            },
            live.h,
          ),
      },
    ],
  ),
  fromRecipe(
    {
      slug: 'empty',
      title: 'Empty',
      summary: 'What a list shows before it has anything in it.',
      recipe: 'Empty',
      file: 'empty',
      contract: 'EmptySlots',
    },
    EmptySlots,
    Recipes.Empty,
    style => Snippet.emptyResults(style, inert),
    undefined,
    [
      { name: 'results', title: 'No results', draw: style => Snippet.emptyResults(style, inert) },
      {
        name: 'first-use',
        title: 'First use',
        draw: style => Snippet.emptyFirstUse(style, inert),
        pins: { frame: 'dashed' },
      },
      {
        name: 'error',
        title: 'An error',
        draw: style => Snippet.emptyError(style, inert),
        pins: { tone: 'danger', frame: 'filled' },
      },
    ],
  ),
  fromRecipe(
    {
      slug: 'accordion',
      title: 'Accordion',
      summary: 'Sections that open under their headings, one at a time or several.',
      recipe: 'Accordion',
      file: 'accordion',
      contract: 'AccordionSlots',
    },
    AccordionSlots,
    Recipes.Accordion,
    accordionBasic,
    undefined,
    [
      { name: 'basic', title: 'Basic', draw: accordionBasic },
      {
        name: 'plus',
        title: 'Cards with a plus',
        pins: { variant: 'separated', indicator: 'plus', indicatorPosition: 'start' },
        draw: (style, live) =>
          Snippet.accordionPlus(
            style,
            live.widgets.faqPlus,
            id => live.onWidget(Widgets.Message.ToggledFaqPlus({ id })),
            live.h,
          ),
      },
      {
        name: 'active',
        title: 'Ghost, the open one tinted',
        pins: { variant: 'ghost', separators: 'off', active: 'item' },
        draw: (style, live) =>
          Snippet.accordionActive(
            style,
            live.widgets.faqActive,
            id => live.onWidget(Widgets.Message.ToggledFaqActive({ id })),
            live.h,
          ),
      },
    ],
  ),
  fromRecipe(
    {
      slug: 'checkbox-group',
      title: 'Checkbox group',
      summary: 'A question answered with any number of options, under its legend.',
      recipe: 'CheckboxGroup',
      file: 'checkboxGroup',
      contract: 'CheckboxGroupSlots',
    },
    CheckboxGroupSlots,
    Recipes.CheckboxGroup,
    alertsOf(Snippet.checkboxGroup, 'alerts'),
    undefined,
    [
      { name: 'alerts', title: 'Alerts', draw: alertsOf(Snippet.checkboxGroup, 'alerts') },
      {
        name: 'described',
        title: 'Descriptions',
        draw: alertsOf(Snippet.checkboxGroupDescribed, 'described'),
      },
      {
        name: 'select-all',
        title: 'Select all',
        draw: (style, live) =>
          Snippet.checkboxGroupSelectAll(
            style,
            live.widgets.alerts['select-all'],
            value => live.onWidget(Widgets.Message.ToggledAlert({ example: 'select-all', value })),
            values => live.onWidget(Widgets.Message.SetAlerts({ example: 'select-all', values })),
            live.h,
          ),
      },
      {
        name: 'invalid',
        title: 'Invalid',
        draw: alertsOf(Snippet.checkboxGroupInvalid, 'invalid'),
      },
    ],
  ),
  fromRecipe(
    {
      slug: 'number-field',
      title: 'Number field',
      summary: 'A number typed or stepped, inside its bounds and on its step.',
      recipe: 'NumberField',
      file: 'numberField',
      contract: 'NumberFieldSlots',
    },
    NumberFieldSlots,
    Recipes.NumberField,
    (style, live) =>
      Snippet.numberField(
        style,
        live.widgets.servings,
        value => live.onWidget(Widgets.Message.ChangedServings({ value })),
        live.h,
      ),
  ),
  fromRecipe(
    {
      slug: 'otp-field',
      title: 'Input OTP',
      summary: 'A one-time code in cells, typed, pasted or filled from a text message.',
      recipe: 'OtpField',
      file: 'otpField',
      contract: 'OtpFieldSlots',
    },
    OtpFieldSlots,
    Recipes.OtpField,
    (style, live) =>
      Snippet.otpField(
        style,
        live.widgets.code,
        code => live.onWidget(Widgets.Message.TypedCode({ code })),
        live.h,
      ),
  ),
  fromRecipe(
    {
      slug: 'hover-card',
      title: 'Hover card',
      summary: 'A card of more about a link, shown while the pointer or focus rests on it.',
      recipe: 'HoverCard',
      file: 'hoverCard',
      contract: 'HoverIntentSlots',
    },
    HoverIntentSlots,
    Recipes.HoverCard,
    (style, live) =>
      Snippet.hoverCard(
        style,
        live.widgets.hoverCard,
        message => live.onWidget(Widgets.Message.GotHoverCard({ message })),
        live.h,
      ),
  ),
  fromRecipe(
    {
      slug: 'command',
      title: 'Command',
      summary: 'A search field over every command, filtered as you type and run by Enter.',
      recipe: 'Command',
      file: 'command',
      contract: 'CommandSlots',
    },
    CommandSlots,
    Recipes.Command,
    commandBasic,
    undefined,
    [
      { name: 'basic', title: 'Basic', draw: commandBasic },
      {
        name: 'dialog',
        title: 'In a dialog (⌘K)',
        draw: (style, live) =>
          Snippet.commandDialog(
            style,
            {
              dialog: live.widgets.palette,
              query: live.widgets.paletteQuery,
              active: live.widgets.paletteActive,
              pages: live.widgets.palettePages,
              ran: live.widgets.paletteRan,
            },
            {
              onOpen: live.onWidget(Widgets.Message.OpenedPalette()),
              toDialog: message => live.onWidget(Widgets.Message.GotPalette({ message })),
              onQuery: query => live.onWidget(Widgets.Message.TypedPalette({ query })),
              onActive: value => live.onWidget(Widgets.Message.HighlightedPalette({ value })),
              onRun: value => live.onWidget(Widgets.Message.RanPalette({ value })),
              onBack: live.onWidget(Widgets.Message.LeftPalettePage()),
            },
            live.h,
          ),
        pins: { frame: 'bare' },
      },
    ],
  ),
  fromRecipe(
    {
      slug: 'resizable',
      title: 'Resizable',
      summary:
        'Two panels and a handle between them, dragged or stepped by the arrow keys, collapsed and nested.',
      recipe: 'Resizable',
      file: 'resizable',
      contract: 'ResizableSlots',
    },
    ResizableSlots,
    Recipes.Resizable,
    resizableBasic,
    undefined,
    [
      { name: 'basic', title: 'Side by side', draw: resizableBasic },
      {
        name: 'collapsible',
        title: 'A collapsible sidebar',
        draw: (style, live) =>
          Snippet.resizableCollapsible(
            style,
            live.widgets.collapsibleSplit,
            message => live.onWidget(Widgets.Message.GotCollapsibleSplit({ message })),
            live.h,
          ),
        pins: { handle: 'grip' },
      },
      {
        name: 'nested',
        title: 'Nested both ways',
        draw: (style, live) =>
          Snippet.resizableNested(
            style,
            live.widgets.outerSplit,
            live.widgets.innerSplit,
            message => live.onWidget(Widgets.Message.GotOuterSplit({ message })),
            message => live.onWidget(Widgets.Message.GotInnerSplit({ message })),
            live.h,
          ),
      },
    ],
  ),
  fromRecipe(
    {
      slug: 'sidebar',
      title: 'Sidebar',
      summary:
        'The navigation of an application in groups, collapsed off the page or to a rail of icons, and in a sheet on a phone.',
      recipe: 'Sidebar',
      file: 'sidebar',
      contract: 'SidebarSlots',
    },
    SidebarSlots,
    Recipes.Sidebar,
    sidebarRail,
    undefined,
    [
      { name: 'rail', title: 'A rail of icons', draw: sidebarRail },
      {
        name: 'resizable',
        title: 'Resizable',
        draw: (_style, live) =>
          live.h.div(
            // A box of its own size: the preview centres what it holds, which a split would shrink to nothing.
            [live.h.Style({ blockSize: '24rem', inlineSize: 'min(40rem, 100%)' })],
            [
              Snippet.sidebarResizable(
                live.widgets.sidebarResizable,
                live.widgets.sidebarSplit,
                {
                  onSidebar: message =>
                    live.onWidget(Widgets.Message.GotSidebarResizable({ message })),
                  onSplit: message => live.onWidget(Widgets.Message.GotSidebarSplit({ message })),
                },
                live.h,
              ),
            ],
          ),
      },
    ],
  ),
  fromRecipe(
    {
      slug: 'menubar',
      title: 'Menubar',
      summary:
        'A row of menus with one tab stop, the arrows moving from one open menu to the next.',
      recipe: 'Menubar',
      file: 'menubar',
      contract: 'MenubarSlots',
    },
    MenubarSlots,
    Recipes.Menubar,
    (style, live) =>
      Snippet.menubar(
        style,
        { bar: live.widgets.menubar, chosen: live.widgets.menubarChoice },
        message => live.onWidget(Widgets.Message.GotMenubar({ message })),
        live.direction,
        live.h,
      ),
  ),
  fromRecipe(
    {
      slug: 'progress',
      title: 'Progress',
      summary:
        'How far work has gone, as a bar or a ring, sliding or turning while the end is unknown.',
      recipe: 'Progress',
      file: 'progress',
      contract: 'ProgressSlots',
    },
    ProgressSlots,
    Recipes.Progress,
    (style, live) => Snippet.progress(style, live.h),
    undefined,
    [
      { name: 'basic', title: 'Basic', draw: (style, live) => Snippet.progress(style, live.h) },
      {
        name: 'value',
        title: 'With its value',
        draw: style => Snippet.progressValue(style, inert),
      },
      {
        name: 'stacked',
        title: 'Stacked',
        draw: style => Snippet.progressStacked(style, inert),
        pins: { shape: 'bar' },
      },
      {
        name: 'buffer',
        title: 'Buffered',
        draw: style => Snippet.progressBuffer(style, inert),
        pins: { shape: 'bar' },
      },
      {
        name: 'striped',
        title: 'Striped and moving',
        draw: style => Snippet.progressStriped(style, inert),
        pins: { shape: 'bar', stripes: 'moving', size: 'lg' },
      },
      {
        name: 'ring',
        title: 'A ring with its value',
        draw: style => Snippet.progressRing(style, inert),
        pins: { shape: 'ring', size: 'lg' },
      },
      {
        name: 'steps',
        title: 'Steps as progress',
        draw: style => Snippet.progressSteps(style, inert),
        pins: { shape: 'bar' },
      },
    ],
  ),
  fromRecipe(
    {
      slug: 'meter',
      title: 'Meter',
      summary: 'A measurement within its range, coloured by how near it sits to the best value.',
      recipe: 'Meter',
      file: 'meter',
      contract: 'MeterSlots',
    },
    MeterSlots,
    Recipes.Meter,
    (style, live) => Snippet.meter(style, live.h),
  ),
  fixed(
    {
      slug: 'scroll-area',
      title: 'Scroll area',
      summary: 'A box that scrolls instead of the page, its bars thin or drawn over it.',
      recipe: 'ScrollArea',
      file: 'scrollArea',
      contract: 'ScrollAreaSlots',
    },
    () => Snippet.scrollArea(Snippet.ScrollAreaStyle, inert),
    [
      {
        name: 'native',
        title: "The browser's bars",
        draw: () => Snippet.scrollArea(Snippet.ScrollAreaStyle, inert),
      },
      {
        name: 'overlay',
        title: 'Overlay bars',
        draw: () => Snippet.scrollAreaOverlay(Snippet.ScrollAreaStyle, inert),
      },
    ],
  ),
  fromRecipe(
    {
      slug: 'virtual-list',
      title: 'Virtual list',
      summary: 'Ten thousand rows that scroll as thirty, since only the rows in view are drawn.',
      recipe: 'VirtualList',
      file: 'virtualList',
      contract: 'VirtualListSlots',
    },
    VirtualListSlots,
    Recipes.VirtualList,
    (style, live) =>
      Snippet.virtualList(
        style,
        live.widgets.virtualList,
        message => live.onWidget(Widgets.Message.GotVirtualList({ message })),
        live.h,
      ),
  ),
  fromRecipe(
    {
      slug: 'steps',
      title: 'Steps',
      summary:
        'An ordered list of steps, those done checked, the current one marked, joined by a line.',
      recipe: 'Steps',
      file: 'steps',
      contract: 'StepsSlots',
    },
    StepsSlots,
    Recipes.Steps,
    (style, live) => Snippet.steps(style, live.h),
    undefined,
    [
      { name: 'basic', title: 'Basic', draw: (style, live) => Snippet.steps(style, live.h) },
      { name: 'icons', title: 'Icons', draw: (style, live) => Snippet.stepsIcons(style, live.h) },
      {
        name: 'vertical',
        title: 'Vertical, with content',
        pins: { orientation: 'vertical' },
        draw: (style, live) => Snippet.stepsVertical(style, live.h),
      },
      {
        name: 'progress',
        title: 'A progress connector',
        pins: { connector: 'progress' },
        draw: (style, live) => Snippet.stepsProgress(style, live.h),
      },
      {
        name: 'dots',
        title: 'Dots',
        pins: { marker: 'dot' },
        draw: (style, live) => Snippet.stepsDots(style, live.h),
      },
    ],
  ),
  fromRecipe(
    {
      slug: 'rating',
      title: 'Rating',
      summary:
        'A score out of five stars, halves or hearts, chosen with a press or the arrows, or shown read-only to any fraction.',
      recipe: 'Rating',
      file: 'rating',
      contract: 'RatingSlots',
    },
    RatingSlots,
    Recipes.Rating,
    ratingBasic,
    undefined,
    [
      { name: 'basic', title: 'Basic', draw: ratingBasic },
      {
        name: 'half',
        title: 'Half stars, cleared by a second press',
        draw: (style, live) =>
          Snippet.ratingHalf(
            style,
            live.widgets.film,
            value => live.onWidget(Widgets.Message.RatedFilm({ value })),
            () => live.onWidget(Widgets.Message.ClearedFilm()),
            live.h,
          ),
      },
      {
        name: 'fraction',
        title: 'A read-only average',
        draw: style => Snippet.ratingFraction(style, inert),
      },
      {
        name: 'hearts',
        title: 'Hearts',
        draw: (style, live) =>
          Snippet.ratingHearts(
            style,
            live.widgets.hearts,
            value => live.onWidget(Widgets.Message.RatedHearts({ value })),
            live.h,
          ),
        pins: { glyph: 'heart', tone: 'error', size: 'lg' },
      },
      {
        name: 'labels',
        title: 'A word per value',
        draw: (style, live) =>
          Snippet.ratingLabels(
            style,
            live.widgets.support,
            value => live.onWidget(Widgets.Message.RatedSupport({ value })),
            live.h,
          ),
      },
    ],
  ),
  fromRecipe(
    {
      slug: 'password-input',
      title: 'Password input',
      summary: 'A password field with a toggle that shows it as text.',
      recipe: 'PasswordInput',
      file: 'passwordInput',
      contract: 'PasswordInputSlots',
    },
    PasswordInputSlots,
    Recipes.PasswordInput,
    passwordBasic,
    undefined,
    [
      { name: 'basic', title: 'Basic', draw: passwordBasic },
      {
        name: 'new',
        title: 'A new password',
        draw: (style, live) =>
          Snippet.passwordInputNew(
            style,
            {
              value: live.widgets.newPassword,
              visible: live.widgets.newPasswordShown,
              capsLock: live.widgets.capsLock,
              onInput: value => live.onWidget(Widgets.Message.TypedNewPassword({ value })),
              onToggle: live.onWidget(Widgets.Message.ToggledNewPassword()),
              onCapsLock: reading => live.onWidget(Widgets.Message.ReadCapsLock({ reading })),
            },
            live.h,
          ),
      },
    ],
  ),
  fromRecipe(
    {
      slug: 'tags-input',
      title: 'Tags input',
      summary: 'A list of tags as removable chips, added with Enter or a comma.',
      recipe: 'TagsInput',
      file: 'tagsInput',
      contract: 'TagsInputSlots',
    },
    TagsInputSlots,
    Recipes.TagsInput,
    tagsBasic,
    undefined,
    [
      { name: 'basic', title: 'Basic', draw: tagsBasic },
      {
        name: 'max',
        title: 'A maximum',
        draw: (style, live) =>
          Snippet.tagsInputMax(
            style,
            live.widgets.tagsMax,
            message => live.onWidget(Widgets.Message.GotTagsMax({ message })),
            live.h,
          ),
      },
      {
        name: 'refusals',
        title: 'Refusals',
        draw: (style, live) =>
          Snippet.tagsInputRefusals(
            style,
            live.widgets.tagsRefusals,
            message => live.onWidget(Widgets.Message.GotTagsRefusals({ message })),
            live.h,
          ),
      },
    ],
  ),
  fromRecipe(
    {
      slug: 'input-copy',
      title: 'Input copy',
      summary: 'A read-only value with a button that copies it, and says it did.',
      recipe: 'InputCopy',
      file: 'inputCopy',
      contract: 'InputCopySlots',
    },
    InputCopySlots,
    Recipes.InputCopy,
    (style, live) =>
      Snippet.inputCopy(
        style,
        live.widgets.inputCopy.copied,
        text => live.onWidget(Widgets.Message.PressedCopy({ text })),
        live.h,
      ),
  ),
  fromRecipe(
    {
      slug: 'sheet',
      title: 'Sheet',
      summary:
        'A dialog from an edge of the screen whose handle drags it between resting points and away, a drawer as on a phone.',
      recipe: 'Sheet',
      file: 'sheet',
      contract: 'DialogSlots',
    },
    DialogSlots,
    Recipes.Sheet,
    sheetDrawer,
    undefined,
    [
      { name: 'drawer', title: 'A drawer', draw: sheetDrawer },
      {
        name: 'right',
        title: 'From the side',
        draw: (style, live) =>
          Snippet.sheetSide(style, live.widgets.sheets.right, sheetMessages(live, 'right'), live.h),
        pins: { handle: 'none' },
      },
      {
        name: 'fixed',
        title: 'Not dismissible',
        draw: (style, live) =>
          Snippet.sheetFixed(
            style,
            live.widgets.sheets.fixed,
            sheetMessages(live, 'fixed'),
            live.h,
          ),
      },
      {
        name: 'nested',
        title: 'Nested',
        draw: (style, live) =>
          Snippet.sheetNested(
            style,
            {
              outer: live.widgets.sheets.nested,
              inner: live.widgets.sheets['nested-inner'],
              outerMessages: sheetMessages(live, 'nested'),
              innerMessages: sheetMessages(live, 'nested-inner'),
            },
            live.h,
          ),
      },
    ],
  ),
  fromRecipe(
    {
      slug: 'color-picker',
      title: 'Color picker',
      summary:
        'A color from a saturation and brightness area, hue and alpha tracks, typed in hex, rgb, hsl or oklch, or picked from the screen.',
      recipe: 'ColorPicker',
      file: 'colorPicker',
      contract: 'ColorPickerSlots',
    },
    ColorPickerSlots,
    Recipes.ColorPicker,
    colorInline,
    undefined,
    [
      { name: 'inline', title: 'Inline', draw: colorInline },
      {
        name: 'popover',
        title: 'In a popover',
        draw: (style, live) =>
          Snippet.colorPickerPopover(
            style,
            { picker: live.widgets.brand, popover: live.widgets.brandPopover },
            message => live.onWidget(Widgets.Message.GotBrand({ message })),
            message => live.onWidget(Widgets.Message.GotBrandPopover({ message })),
            live.h,
          ),
      },
    ],
  ),
  fromRecipe(
    {
      slug: 'tree-view',
      title: 'Tree view',
      summary:
        'Nested rows that open and shut, one tab stop, the arrows moving through what shows.',
      recipe: 'TreeView',
      file: 'treeView',
      contract: 'TreeViewSlots',
    },
    TreeViewSlots,
    Recipes.TreeView,
    treeBasic,
    undefined,
    [
      { name: 'basic', title: 'Basic', draw: treeBasic },
      {
        name: 'icons',
        title: 'Icons and guides',
        draw: (style, live) =>
          Snippet.treeViewIcons(
            style,
            live.widgets.treeIcons,
            message => live.onWidget(Widgets.Message.GotTreeIcons({ message })),
            live.h,
          ),
        pins: { guides: 'lines' },
      },
      {
        name: 'checkboxes',
        title: 'Checkboxes',
        draw: (style, live) =>
          Snippet.treeViewCheckboxes(
            style,
            live.widgets.treeChecks,
            message => live.onWidget(Widgets.Message.GotTreeChecks({ message })),
            live.h,
          ),
      },
    ],
  ),
  fromRecipe(
    {
      slug: 'carousel',
      title: 'Carousel',
      summary:
        'Slides in a track that snaps, with previous, next, dots or thumbnails, several at once, and a rotation that pauses.',
      recipe: 'Carousel',
      file: 'carousel',
      contract: 'CarouselSlots',
    },
    CarouselSlots,
    Recipes.Carousel,
    carouselAt('places', Snippet.carousel),
    undefined,
    [
      { name: 'basic', title: 'Basic', draw: carouselAt('places', Snippet.carousel) },
      {
        name: 'autoplay',
        title: 'Autoplay',
        draw: carouselAt('autoplay', Snippet.carouselAutoplay),
      },
      {
        name: 'thumbnails',
        title: 'Thumbnails',
        draw: carouselAt('thumbnails', Snippet.carouselThumbnails),
      },
      {
        name: 'per-view',
        title: 'Two per view',
        draw: carouselAt('perView', Snippet.carouselPerView),
        pins: { peek: 'none' },
      },
    ],
  ),
  fromRecipe(
    {
      slug: 'navigation-menu',
      title: 'Navigation menu',
      summary:
        'The links of a site in a row or a column, the current page marked by a line that glides to it, and panels of links under its triggers.',
      recipe: 'Nav',
      file: 'nav',
      contract: 'NavSlots',
    },
    NavSlots,
    Recipes.Nav,
    (style, live) => Snippet.nav(style, live.h),
    undefined,
    [
      { name: 'links', title: 'Links', draw: (style, live) => Snippet.nav(style, live.h) },
      {
        name: 'panels',
        title: 'Panels',
        draw: (style, live) =>
          Snippet.navPanels(style, live.widgets.navs.panels, navMessage(live, 'panels'), live.h),
      },
      {
        name: 'pill',
        title: 'A pill',
        draw: (style, live) =>
          Snippet.navPanels(style, live.widgets.navs.pill, navMessage(live, 'pill'), live.h),
        pins: { indicator: 'pill' },
      },
      {
        name: 'vertical',
        title: 'Vertical',
        draw: (style, live) =>
          Snippet.navVertical(
            style,
            live.widgets.navs.vertical,
            navMessage(live, 'vertical'),
            live.h,
          ),
      },
    ],
  ),
  fromRecipe(
    {
      slug: 'segmented',
      title: 'Segmented',
      summary: 'A few options in a tray, one pressed, with a pill that slides to a new press.',
      recipe: 'Segmented',
      file: 'segmented',
      contract: 'SegmentedSlots',
    },
    SegmentedSlots,
    Recipes.Segmented,
    segmentedBasic,
    undefined,
    [
      { name: 'basic', title: 'Basic', draw: segmentedBasic },
      { name: 'icons', title: 'Icons', draw: segmentedIcons(false) },
      { name: 'icon-only', title: 'Icons alone', draw: segmentedIcons(true) },
      {
        name: 'sizes',
        title: 'Sizes',
        draw: (_style, live) =>
          Snippet.segmentedSizes(
            live.widgets.range,
            range => live.onWidget(Widgets.Message.ChoseRange({ range })),
            live.h,
          ),
      },
      {
        name: 'full',
        title: 'Full width',
        // As wide as the box it is in, which here is the preview's width.
        draw: (style, live) =>
          live.h.div(
            [live.h.Style({ inlineSize: 'min(28rem, 100%)' })],
            [segmentedBasic(style, live)],
          ),
        pins: { width: 'fill' },
      },
      { name: 'underline', title: 'Underline', draw: segmentedBasic, pins: { tray: 'underline' } },
    ],
  ),
  fromRecipe(
    {
      slug: 'tabs',
      title: 'Tabs',
      summary:
        'Panels of one place, one shown at a time, moved between by the arrow keys; with icons, counts, a scrolling row and tabs that close.',
      recipe: 'Tabs',
      file: 'tabs',
      contract: 'TabsSlots',
    },
    TabsSlots,
    Recipes.Tabs,
    tabsUnderline,
    undefined,
    [
      { name: 'underline', title: 'Underline', draw: tabsUnderline },
      {
        name: 'pill',
        title: 'Pill',
        draw: (style, live) =>
          Snippet.tabs(
            style,
            live.widgets.pillTabs,
            message => live.onWidget(Widgets.Message.GotPillTabs({ message })),
            live.h,
          ),
        pins: { variant: 'pill' },
      },
      {
        name: 'icons',
        title: 'Icons and counts',
        draw: (style, live) =>
          Snippet.tabsIcons(style, live.widgets.inboxes.icons, inboxMessage(live, 'icons'), live.h),
      },
      {
        name: 'vertical',
        title: 'Vertical',
        draw: (style, live) =>
          Snippet.tabsVertical(
            style,
            live.widgets.inboxes.vertical,
            inboxMessage(live, 'vertical'),
            live.h,
          ),
      },
      {
        name: 'closable',
        title: 'Closable',
        draw: (style, live) =>
          Snippet.tabsClosable(
            style,
            live.widgets.files.closable,
            fileMessages(live, 'closable'),
            live.h,
          ),
      },
      {
        name: 'scrolling',
        title: 'Scrolling',
        draw: (style, live) =>
          Snippet.tabsScrolling(
            style,
            live.widgets.files.scrolling,
            fileMessages(live, 'scrolling'),
            live.h,
          ),
        pins: { overflow: 'scroll' },
      },
    ],
  ),
  fromRecipe(
    {
      slug: 'radio-group',
      title: 'Radio group',
      summary: 'One choice of a few, each with a line that explains it.',
      recipe: 'RadioGroup',
      file: 'radio',
      contract: 'RadioGroupSlots',
    },
    RadioGroupSlots,
    Recipes.RadioGroup,
    (style, live) =>
      Snippet.radioGroup(
        style,
        { group: live.widgets.billingGroup, billing: live.widgets.billing },
        message => live.onWidget(Widgets.Message.GotBillingGroup({ message })),
        live.h,
      ),
    undefined,
    [
      {
        name: 'descriptions',
        title: 'Descriptions',
        draw: (style, live) =>
          Snippet.radioGroup(
            style,
            { group: live.widgets.billingGroup, billing: live.widgets.billing },
            message => live.onWidget(Widgets.Message.GotBillingGroup({ message })),
            live.h,
          ),
      },
      {
        name: 'horizontal',
        title: 'Horizontal',
        draw: (style, live) =>
          Snippet.radioGroupHorizontal(
            style,
            { group: live.widgets.billingRow, billing: live.widgets.billing },
            message => live.onWidget(Widgets.Message.GotBillingRow({ message })),
            live.h,
          ),
      },
      {
        name: 'cards',
        title: 'Cards',
        pins: { variant: 'card' },
        draw: (style, live) =>
          Snippet.radioGroup(
            style,
            { group: live.widgets.billingCards, billing: live.widgets.billing },
            message => live.onWidget(Widgets.Message.GotBillingCards({ message })),
            live.h,
          ),
      },
    ],
  ),
  fromRecipe(
    {
      slug: 'slider',
      title: 'Slider',
      summary:
        'A number, or a low and a high one that cannot pass each other, across or upright, with marks, ticks and its value shown.',
      recipe: 'Slider',
      file: 'slider',
      contract: 'SliderSlots',
    },
    SliderSlots,
    Recipes.Slider,
    sliderBasic,
    undefined,
    [
      { name: 'basic', title: 'A number and a range', draw: sliderBasic },
      {
        name: 'vertical',
        title: 'Vertical',
        draw: (style, live) =>
          Snippet.sliderVertical(
            style,
            live.widgets.level,
            value => live.onWidget(Widgets.Message.TurnedLevel({ value })),
            live.h,
          ),
      },
      {
        name: 'marks',
        title: 'Marks and ticks',
        pins: { value: 'end' },
        draw: (style, live) =>
          Snippet.sliderMarks(
            style,
            live.widgets.budget,
            value => live.onWidget(Widgets.Message.MovedBudget({ value })),
            live.h,
          ),
      },
    ],
  ),
  fromRecipe(
    {
      slug: 'dialog',
      title: 'Dialog',
      summary:
        'A modal that holds focus until it is answered or Escape dismisses it; as an alert dialog, only an answer closes it.',
      recipe: 'Dialog',
      file: 'dialog',
      contract: 'DialogSlots',
    },
    DialogSlots,
    Recipes.Dialog,
    dialogConfirm,
    undefined,
    [
      { name: 'confirm', title: 'Confirm', draw: dialogConfirm },
      {
        name: 'terms',
        title: 'A long body',
        draw: (style, live) =>
          Snippet.dialogTerms(
            style,
            live.widgets.dialogs.terms,
            dialogMessages(live, 'terms'),
            live.h,
          ),
      },
      {
        name: 'form',
        title: 'A form',
        draw: (style, live) =>
          Snippet.dialogForm(
            style,
            live.widgets.dialogs.form,
            dialogMessages(live, 'form'),
            live.h,
          ),
      },
      {
        name: 'nested',
        title: 'Nested',
        draw: (style, live) =>
          Snippet.dialogNested(
            style,
            {
              outer: live.widgets.dialogs.nested,
              inner: live.widgets.dialogs['nested-inner'],
              outerMessages: dialogMessages(live, 'nested'),
              innerMessages: dialogMessages(live, 'nested-inner'),
            },
            live.h,
          ),
      },
    ],
  ),
  fromRecipe(
    {
      slug: 'popover',
      title: 'Popover',
      summary: 'A panel placed beside its button, closed by Escape or a press outside.',
      recipe: 'Popover',
      file: 'popover',
      contract: 'PopoverSlots',
    },
    PopoverSlots,
    Recipes.Popover,
    popoverAt('below', Snippet.popover),
    undefined,
    [
      { name: 'below', title: 'Below', draw: popoverAt('below', Snippet.popover) },
      {
        name: 'top-start',
        title: 'Top start',
        draw: popoverAt('top-start', Snippet.popoverTopStart),
      },
      {
        name: 'no-arrow',
        title: 'No arrow',
        draw: popoverAt('no-arrow', Snippet.popover),
        pins: { arrow: 'none' },
      },
      {
        name: 'clipped',
        title: 'In a clipped card',
        draw: popoverAt('clipped', Snippet.popoverClipped),
      },
    ],
  ),
  fixed(
    {
      slug: 'tooltip',
      title: 'Tooltip',
      summary: 'A hint on hover or focus, after a short wait.',
      recipe: 'Tooltip',
      file: 'tooltip',
      contract: 'TooltipSlots',
    },
    tooltipAt('above', Snippet.tooltip),
    [
      { name: 'above', title: 'Above', draw: tooltipAt('above', Snippet.tooltip) },
      { name: 'right', title: 'Right', draw: tooltipAt('right', Snippet.tooltipRight) },
      { name: 'edge', title: 'At the edge', draw: tooltipAt('edge', Snippet.tooltipEdge) },
    ],
  ),
  fromRecipe(
    {
      slug: 'menu',
      title: 'Menu',
      summary:
        'Actions behind a button, at the point a right press lands, or down a submenu beside its row.',
      recipe: 'Menu',
      file: 'menu',
      contract: 'MenuSlots',
    },
    MenuSlots,
    Recipes.Menu,
    menuActions,
    undefined,
    [
      { name: 'actions', title: 'Actions', draw: menuActions },
      {
        name: 'view-options',
        title: 'View options',
        draw: (style, live) =>
          Snippet.viewOptionsMenu(
            style,
            { menu: live.widgets.viewMenu, options: live.widgets.viewOptions },
            message => live.onWidget(Widgets.Message.GotViewMenu({ message })),
            live.direction,
            live.h,
          ),
      },
    ],
  ),
  fromRecipe(
    {
      slug: 'listbox',
      title: 'Listbox',
      summary: 'One value from a list that opens under its button.',
      recipe: 'Listbox',
      file: 'listbox',
      contract: 'ListboxSlots',
    },
    ListboxSlots,
    Recipes.Listbox,
    (style, live) =>
      Snippet.listbox(
        style,
        live.widgets,
        message => live.onWidget(Widgets.Message.GotListbox({ message })),
        live.direction,
        live.h,
      ),
  ),
  fromRecipe(
    {
      slug: 'combobox',
      title: 'Combobox',
      summary:
        'A field that suggests as you type, and keeps one suggestion or several as chips, with a clear button and an empty panel.',
      recipe: 'Combobox',
      file: 'combobox',
      contract: 'ComboboxSlots',
    },
    ComboboxSlots,
    Recipes.Combobox,
    comboboxBasic,
    undefined,
    [
      { name: 'basic', title: 'Basic', draw: comboboxBasic },
      {
        name: 'multiple',
        title: 'Several, as chips',
        draw: (style, live) =>
          Snippet.comboboxMultiple(
            style,
            live.widgets.cityTags,
            message => live.onWidget(Widgets.Message.GotCityTags({ message })),
            live.h,
          ),
      },
      {
        name: 'empty',
        title: 'Empty and loading',
        draw: (style, live) =>
          Snippet.comboboxEmpty(
            style,
            live.widgets.cityBoxes.empty,
            {
              on: live.widgets.cityLoading,
              onToggle: live.onWidget(Widgets.Message.ToggledCityLoading()),
            },
            cityMessage(live, 'empty'),
            live.h,
          ),
      },
      {
        name: 'clear',
        title: 'A clear button',
        draw: (style, live) =>
          Snippet.comboboxClear(
            style,
            live.widgets.cityBoxes.clear,
            cityMessage(live, 'clear'),
            live.h,
          ),
      },
      {
        name: 'groups',
        title: 'Groups',
        draw: (style, live) =>
          Snippet.comboboxGroups(
            style,
            live.widgets.cityBoxes.groups,
            cityMessage(live, 'groups'),
            live.h,
          ),
      },
      {
        name: 'creatable',
        title: 'Creatable',
        draw: (style, live) =>
          Snippet.comboboxCreatable(
            style,
            live.widgets.cityBoxes.creatable,
            live.widgets.createdCities,
            cityMessage(live, 'creatable'),
            live.h,
          ),
      },
    ],
  ),
  fromRecipe(
    {
      slug: 'calendar',
      title: 'Calendar',
      summary:
        'A month of days to pick from, one day or a start and an end, with its months and years a press away.',
      recipe: 'Calendar',
      file: 'calendar',
      contract: 'CalendarSlots',
    },
    CalendarSlots,
    Recipes.Calendar,
    (style, live) =>
      Snippet.calendar(
        style,
        {
          calendar: live.widgets.calendar,
          selection: live.widgets.selection,
          trip: live.widgets.trip,
          tripDates: live.widgets.tripDates,
        },
        message => live.onWidget(Widgets.Message.GotCalendar({ message })),
        message => live.onWidget(Widgets.Message.GotTripCalendar({ message })),
        live.h,
      ),
    undefined,
    [
      { name: 'single-range', title: 'A day and a range', draw: calendarBasic },
      {
        name: 'two-months',
        title: 'Two months and presets',
        draw: (style, live) =>
          Snippet.calendarTwoMonths(
            style,
            live.widgets.twoMonths,
            {
              onFirst: message => live.onWidget(Widgets.Message.GotTripFirst({ message })),
              onSecond: message => live.onWidget(Widgets.Message.GotTripSecond({ message })),
              onPreview: date => live.onWidget(Widgets.Message.PreviewedTrip({ date })),
              onPreset: selection => live.onWidget(Widgets.Message.PickedTripPreset({ selection })),
            },
            live.h,
          ),
      },
      {
        name: 'dropdowns',
        title: 'Month and year selects, week numbers',
        draw: (style, live) =>
          Snippet.calendarDropdowns(
            style,
            { calendar: live.widgets.dropdownCalendar, selection: live.widgets.dropdownDay },
            message => live.onWidget(Widgets.Message.GotDropdownCalendar({ message })),
            shown => live.onWidget(Widgets.Message.ShowedCalendar({ shown })),
            live.h,
          ),
      },
    ],
  ),
  fromRecipe(
    {
      slug: 'date-picker',
      title: 'Date picker',
      summary: 'A date behind a button, picked from a calendar that opens under it.',
      recipe: 'DatePicker',
      file: 'datePicker',
      contract: 'DatePickerSlots',
    },
    DatePickerSlots,
    Recipes.DatePicker,
    (style, live) =>
      Snippet.datePicker(
        style,
        live.widgets,
        message => live.onWidget(Widgets.Message.GotDatePicker({ message })),
        live.h,
      ),
    undefined,
    [
      {
        name: 'single',
        title: 'A day',
        draw: (style, live) =>
          Snippet.datePicker(
            style,
            live.widgets,
            message => live.onWidget(Widgets.Message.GotDatePicker({ message })),
            live.h,
          ),
      },
      {
        name: 'range',
        title: 'A range',
        draw: (style, live) =>
          Snippet.datePickerRange(
            style,
            { picker: live.widgets.stayPicker, range: live.widgets.stayDates },
            message => live.onWidget(Widgets.Message.GotStayPicker({ message })),
            live.h,
          ),
      },
    ],
  ),
  fromRecipe(
    {
      slug: 'toast',
      title: 'Toast',
      summary: 'A notice in the corner that goes by itself, or when dismissed.',
      recipe: 'Toast',
      file: 'toast',
      contract: 'ToastSlots',
    },
    ToastSlots,
    Recipes.Toast,
    toastTypes('types'),
    undefined,
    [
      { name: 'types', title: 'Types', draw: toastTypes('types') },
      {
        name: 'promise',
        title: 'A promise',
        draw: (style, live) =>
          Snippet.toastPromise(
            style,
            toastStack(live, 'promise', 'Uploads'),
            live.onWidget(Widgets.Message.StartedUpload()),
            live.h,
          ),
      },
      {
        name: 'action',
        title: 'An action',
        draw: (style, live) =>
          Snippet.toastAction(
            style,
            toastStack(live, 'action', 'Archive'),
            live.onWidget(Widgets.Message.Archived()),
            live.h,
          ),
      },
      { name: 'rich', title: 'Rich colors', draw: toastTypes('rich'), pins: { tone: 'rich' } },
      {
        name: 'positions',
        title: 'Positions',
        draw: (style, live) =>
          Snippet.toastPositions(
            style,
            live.widgets.toasts,
            (example, message) => live.onWidget(Widgets.Message.GotToast({ example, message })),
            example => live.onWidget(Widgets.Message.RaisedToast({ example, type: 'success' })),
            live.h,
          ),
      },
      {
        name: 'payload',
        title: 'Your own payload',
        draw: (_style, live) =>
          Snippet.toast(
            Snippet.ToastStyle,
            live.widgets.notices,
            {
              onNotify: live.onWidget(Widgets.Message.SavedDraft()),
              toMessage: message => live.onWidget(Widgets.Message.GotNotices({ message })),
            },
            live.h,
          ),
      },
    ],
  ),
  fromRecipe(
    {
      slug: 'chat-message',
      title: 'Chat message',
      summary:
        'A message with its sender, time, status and actions: the user’s in a bubble, an answer as text, a sender’s run grouped, and a streamed body that never re-wraps.',
      recipe: 'ChatMessage',
      file: 'chatMessage',
      contract: 'ChatMessageSlots',
    },
    ChatMessageSlots,
    Recipes.ChatMessage,
    chatBasic,
    undefined,
    [
      { name: 'basic', title: 'Basic', draw: chatBasic },
      {
        name: 'status',
        title: 'Status and retry',
        draw: (style, live) =>
          Snippet.chatMessageStatus(
            style,
            live.widgets.chatRetried,
            live.onWidget(Widgets.Message.RetriedChat()),
            live.h,
          ),
      },
      {
        name: 'thread',
        title: 'A thread',
        draw: (style, live) => Snippet.chatMessageThread(style, live.h),
        pins: { layout: 'thread' },
      },
      {
        name: 'streaming',
        title: 'Streaming',
        draw: (style, live) =>
          Snippet.chatMessageStreaming(
            style,
            live.widgets.streamed,
            live.onWidget(Widgets.Message.StreamedWords()),
            live.h,
          ),
      },
    ],
  ),
  fromRecipe(
    {
      slug: 'message-scroller',
      title: 'Message scroller',
      summary:
        'A conversation that follows the newest message while you are at the end, stops when you scroll up, counts what arrives, and holds its place as older messages load.',
      recipe: 'MessageScroller',
      file: 'messageScroller',
      contract: 'MessageScrollerSlots',
    },
    MessageScrollerSlots,
    Recipes.MessageScroller,
    scrollerBasic,
    undefined,
    [{ name: 'basic', title: 'Basic', draw: scrollerBasic }],
  ),
  fromRecipe(
    {
      slug: 'thinking-indicator',
      title: 'Thinking indicator',
      summary:
        'An assistant at work, announced politely: dots, a pulse or an icon beside words a band of light sweeps.',
      recipe: 'ThinkingIndicator',
      file: 'thinkingIndicator',
      contract: 'ThinkingIndicatorSlots',
    },
    ThinkingIndicatorSlots,
    Recipes.ThinkingIndicator,
    thinkingBasic,
    undefined,
    [
      { name: 'basic', title: 'Basic', draw: thinkingBasic },
      { name: 'kinds', title: 'Kinds', draw: () => Snippet.thinkingIndicatorKinds(inert) },
      { name: 'accent', title: 'Accent', draw: thinkingBasic, pins: { tone: 'accent' } },
    ],
  ),
  fromRecipe(
    {
      slug: 'thinking-steps',
      title: 'Thinking steps',
      summary:
        'An assistant’s reasoning and tool calls as a trace that opens while it runs and says how long it took.',
      recipe: 'ThinkingSteps',
      file: 'thinkingSteps',
      contract: 'ThinkingStepsSlots',
    },
    ThinkingStepsSlots,
    Recipes.ThinkingSteps,
    thoughtSteps,
    undefined,
    [
      { name: 'basic', title: 'Done', draw: thoughtSteps },
      {
        name: 'running',
        title: 'Running',
        draw: (style, live) =>
          Snippet.thinkingStepsRunning(
            style,
            live.widgets.thinking,
            open => live.onWidget(Widgets.Message.ToggledThinking({ open })),
            live.h,
          ),
      },
      {
        name: 'tools',
        title: 'Tool calls',
        pins: { variant: 'card' },
        draw: (style, live) =>
          Snippet.thinkingStepsTools(
            style,
            live.widgets.toolsOpen,
            open => live.onWidget(Widgets.Message.ToggledTools({ open })),
            live.widgets.toolSteps,
            id => live.onWidget(Widgets.Message.ToggledToolStep({ id })),
            live.h,
          ),
      },
    ],
  ),
  fromRecipe(
    {
      slug: 'questionnaire',
      title: 'Questionnaire',
      summary: 'An assistant’s questions, answered in the chat and sent as one Message.',
      recipe: 'Questionnaire',
      file: 'questionnaire',
      contract: 'QuestionnaireSlots',
    },
    QuestionnaireSlots,
    Recipes.Questionnaire,
    tripAll,
    undefined,
    [
      { name: 'basic', title: 'All at once', draw: tripAll },
      {
        name: 'paged',
        title: 'One at a time, in a card',
        pins: { variant: 'card' },
        draw: (style, live) =>
          Snippet.questionnairePaged(
            style,
            live.widgets.tripQuestionsPaged,
            message => live.onWidget(Widgets.Message.GotTripQuestionsPaged({ message })),
            live.h,
          ),
      },
    ],
  ),
  fromRecipe(
    {
      slug: 'angle-slider',
      title: 'Angle slider',
      summary: 'An angle in degrees from a dial, dragged round or stepped by the keys, with marks.',
      recipe: 'AngleSlider',
      file: 'angleSlider',
      contract: 'AngleSliderSlots',
    },
    AngleSliderSlots,
    Recipes.AngleSlider,
    angleBasic,
    undefined,
    [
      { name: 'basic', title: 'Basic', draw: angleBasic },
      {
        name: 'marks',
        title: 'Kept to marks',
        draw: (style, live) =>
          Snippet.angleSliderMarks(
            style,
            live.widgets.rotation,
            message => live.onWidget(Widgets.Message.GotRotation({ message })),
            live.h,
          ),
      },
    ],
  ),
  fromRecipe(
    {
      slug: 'timer',
      title: 'Timer',
      summary:
        'A countdown or a stopwatch, started, paused, resumed and reset, each unit its own part.',
      recipe: 'Timer',
      file: 'timer',
      contract: 'TimerSlots',
    },
    TimerSlots,
    Recipes.Timer,
    timerCountdown,
    undefined,
    [
      { name: 'countdown', title: 'Countdown', draw: timerCountdown },
      {
        name: 'stopwatch',
        title: 'Stopwatch',
        draw: (style, live) =>
          Snippet.timerStopwatch(
            style,
            live.widgets.lap,
            message => live.onWidget(Widgets.Message.GotLap({ message })),
            live.h,
          ),
      },
    ],
  ),
  fromRecipe(
    {
      slug: 'marquee',
      title: 'Marquee',
      summary:
        'Content that scrolls on without a seam, held by a pointer, by focus or by its press.',
      recipe: 'Marquee',
      file: 'marquee',
      contract: 'MarqueeSlots',
    },
    MarqueeSlots,
    Recipes.Marquee,
    marqueeBasic,
    undefined,
    [
      { name: 'basic', title: 'Basic', draw: marqueeBasic },
      {
        name: 'vertical',
        title: 'Vertical',
        draw: (style, live) =>
          Snippet.marqueeVertical(
            style,
            live.widgets.news,
            message => live.onWidget(Widgets.Message.GotNews({ message })),
            live.h,
          ),
      },
    ],
  ),
  fromRecipe(
    {
      slug: 'image-cropper',
      title: 'Image cropper',
      summary:
        'A crop of an image dragged and resized by handles and keys, zoomed, turned, locked to an aspect or round, and exported from a canvas.',
      recipe: 'ImageCropper',
      file: 'imageCropper',
      contract: 'ImageCropperSlots',
    },
    ImageCropperSlots,
    Recipes.ImageCropper,
    cropperBasic,
    undefined,
    [
      { name: 'basic', title: 'Free crop', draw: cropperBasic },
      {
        name: 'avatar',
        title: 'Round, square, exported',
        pins: { viewport: 'square', handles: 'corners' },
        draw: (style, live) =>
          Snippet.avatarCropper(
            style,
            live.widgets.avatarCrop,
            live.widgets.avatarUrl,
            message => live.onWidget(Widgets.Message.GotAvatarCrop({ message })),
            live.h,
          ),
      },
    ],
  ),
  fromRecipe(
    {
      slug: 'signature-pad',
      title: 'Signature pad',
      summary:
        'Strokes drawn with a pointer or a pen and its pressure, smoothed, undone and cleared, with a typed name for whoever cannot draw.',
      recipe: 'SignaturePad',
      file: 'signaturePad',
      contract: 'SignaturePadSlots',
    },
    SignaturePadSlots,
    Recipes.SignaturePad,
    signatureBasic,
    undefined,
    [{ name: 'basic', title: 'Draw or type', draw: signatureBasic }],
  ),
  fromRecipe(
    {
      slug: 'qr-code',
      title: 'QR code',
      summary:
        'Text as a QR code: one SVG path in a quiet zone, a logo over its centre, saved as a PNG or an SVG.',
      recipe: 'QrCode',
      file: 'qrCode',
      contract: 'QrCodeSlots',
    },
    QrCodeSlots,
    Recipes.QrCode,
    qrBasic,
    undefined,
    [
      { name: 'basic', title: 'Basic', draw: qrBasic },
      {
        name: 'logo',
        title: 'A logo over the centre',
        draw: style => Snippet.qrCodeLogo(style, inert),
      },
      {
        name: 'download',
        title: 'Saved as a PNG or an SVG',
        draw: (style, live) =>
          Snippet.qrCodeDownload(
            style,
            format => live.onWidget(Widgets.Message.PressedQrDownload({ format })),
            live.h,
          ),
      },
    ],
  ),
  fromRecipe(
    {
      slug: 'chart',
      title: 'Chart',
      summary:
        'Bars, a line, an area or a donut drawn to scale, with a tooltip, a legend, keys through the points and its data as a table.',
      recipe: 'Chart',
      file: 'chart',
      contract: 'ChartSlots',
    },
    ChartSlots,
    Recipes.Chart,
    chartOf('bar', Snippet.chartBar),
    undefined,
    [
      { name: 'bar', title: 'Bars', draw: chartOf('bar', Snippet.chartBar) },
      { name: 'line', title: 'A line', draw: chartOf('line', Snippet.chartLine) },
      {
        name: 'area',
        title: 'An area',
        draw: chartOf('area', Snippet.chartArea),
        pins: { height: 'sm', grid: 'zero' },
      },
      { name: 'donut', title: 'A donut', draw: chartOf('donut', Snippet.chartDonut) },
      { name: 'table', title: 'Its data, shown', draw: chartOf('table', Snippet.chartTable) },
      {
        name: 'colors',
        title: 'A series keeps its color',
        draw: chartOf('colors', Snippet.chartColors),
      },
    ],
  ),
  fromRecipe(
    {
      slug: 'cascade-select',
      title: 'Cascade select',
      summary:
        'One value chosen as a path through nested options, from a column per level or one level at a time, by the pointer or the arrows.',
      recipe: 'CascadeSelect',
      file: 'cascadeSelect',
      contract: 'CascadeSelectSlots',
    },
    CascadeSelectSlots,
    Recipes.CascadeSelect,
    cascadeColumns,
    undefined,
    [
      { name: 'columns', title: 'Columns', draw: cascadeColumns },
      {
        name: 'drill',
        title: 'One level at a time',
        draw: (style, live) =>
          Snippet.cascadeSelectDrill(
            style,
            live.widgets.cascadeDrill,
            message => live.onWidget(Widgets.Message.GotCascadeDrill({ message })),
            live.h,
          ),
      },
    ],
  ),
  fromRecipe(
    {
      slug: 'floating-panel',
      title: 'Floating panel',
      summary:
        'A window over the page that its header drags and its edges resize, kept within the viewport, minimized, maximized, and stacked among others.',
      recipe: 'FloatingPanel',
      file: 'floatingPanel',
      contract: 'FloatingPanelSlots',
    },
    FloatingPanelSlots,
    Recipes.FloatingPanel,
    panelBasic,
    undefined,
    [{ name: 'basic', title: 'Notes', draw: panelBasic }],
  ),
  fromRecipe(
    {
      slug: 'tour',
      title: 'Tour',
      summary:
        'A guided walk through steps beside the elements they explain, the page dimmed around each, with its place, next, back and skip.',
      recipe: 'Tour',
      file: 'tour',
      contract: 'TourSlots',
    },
    TourSlots,
    Recipes.Tour,
    tourBasic,
    undefined,
    [{ name: 'basic', title: 'Basic', draw: tourBasic }],
  ),
]

const bySlug = new Map(showcases.map(showcase => [showcase.slug, showcase]))

export const showcaseOf = (slug: string): Option.Option<Showcase> =>
  Option.fromNullishOr(bySlug.get(slug))
