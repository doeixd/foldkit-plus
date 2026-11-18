/**
 * Each shipped component as an application draws it, over the theme module
 * `/create` hands out (`./theme.ts`). A component's page shows its region,
 * and its previews call the function the region defines with the style the
 * reader selected, so the code on the page is the code that drew it.
 */
import { Option, Schema } from 'effect'
import {
  Dialog as UiDialog,
  HoverIntent as UiHoverIntent,
  Nav as UiNav,
  Popover as UiPopover,
} from '@foldkit/ui'
import * as UiFileDrop from '@foldkit/ui/fileDrop'
import * as UiTooltip from '@foldkit/ui/tooltip'
import type * as UiVirtualList from '@foldkit/ui/virtualList'
import type { AnchorConfig } from '@foldkit/ui/anchor'
import type { Html, HtmlBuilder } from 'foldkit/html'
import { SlotView, type NamedStyle } from 'foldkit-mixins'
import { Theme } from 'foldkit-mixins/theme'
import { Utilities } from 'foldkit-mixins/utilities'
import {
  AppShell,
  AppShellSlots,
  Drawer,
  DrawerSlots,
  HoverIntent,
  HoverIntentSlots,
  AlertSlots,
  Avatar,
  AvatarGroupSlots,
  AvatarSlots,
  Badge,
  BadgeSlots,
  Button,
  ButtonSlots,
  CalendarSlots,
  Card,
  CardSlots,
  CheckboxGroup,
  CheckboxGroupSlots,
  Command,
  CommandSlots,
  FileDrop,
  FileDropSlots,
  type CommandGroup,
  Menubar,
  MenubarSlots,
  Nav,
  NavSlots,
  ColorPicker,
  ColorPickerSlots,
  VirtualList,
  VirtualListSlots,
  ScrollArea,
  ScrollAreaSlots,
  Sidebar,
  SidebarSlots,
  CheckboxSlots,
  Dialog,
  DialogSlots,
  Empty,
  EmptySlots,
  Input,
  InputSlots,
  Item,
  ItemSlots,
  Kbd,
  KbdSlots,
  Menu,
  MenuSlots,
  Popover,
  PopoverSlots,
  RadioGroupSlots,
  Recipes,
  Segmented,
  SegmentedSlots,
  SelectSlots,
  Sheet,
  Slider,
  SliderSlots,
  Spinner,
  SpinnerSlots,
  TableSlots,
  TextareaSlots,
  Toast,
  ToastSlots,
  ToastView,
  Tooltip,
  TooltipSlots,
  ChatMessage,
  ChatMessageGroupSlots,
  ChatMessageSlots,
  MessageScroller,
  MessageScrollerSlots,
  ThinkingIndicator,
  ThinkingIndicatorSlots,
  ThinkingSteps,
  ThinkingStepsSlots,
  type ThinkingStep,
  Questionnaire,
  QuestionnaireSlots,
  AngleSlider,
  AngleSliderSlots,
  Timer,
  TimerSlots,
  Marquee,
  MarqueeSlots,
  ImageCropper,
  ImageCropperSlots,
  SignaturePad,
  SignaturePadSlots,
  QrCode,
  QrCodeSlots,
  Chart,
  ChartSlots,
  Tour,
  TourSlots,
  FileInput,
  FileInputSlots,
  CodeBlock,
  CodeBlockSlots,
} from 'foldkit-mixins-ui'

import { outline } from './icon.js'
import { forSlots, slots } from './theme.js'

// The Button page's examples are modules of their own (`src/examples/button`).
export const ButtonStyle = forSlots(ButtonSlots)(Recipes.Button({}))

/** The outlined neutral button the other pages' examples draw their triggers with. */
const GroupedStyle = forSlots(ButtonSlots)(Recipes.Button({ tone: 'neutral', variant: 'outline' }))

/** The badge the specimen's plan card carries. */
export const BadgeStyle = forSlots(BadgeSlots)(Recipes.Badge())

export const AlertStyle = forSlots(AlertSlots)(Recipes.Alert({}))

export const CardStyle = forSlots(CardSlots)(Recipes.Card({}))

export const InputStyle = forSlots(InputSlots)(Recipes.Input({}))
export const TextareaStyle = forSlots(TextareaSlots)(Recipes.Textarea({}))

// #region select-basic
export const SelectStyle = forSlots(SelectSlots)(Recipes.Select({}))
// #endregion

/** A head and shoulders in `hue`, standing in for a photo. */
const portrait = (hue: number): string =>
  `data:image/svg+xml,${encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40"><rect width="40" height="40" fill="hsl(${hue} 45% 78%)"/><circle cx="20" cy="16" r="7" fill="hsl(${hue} 30% 45%)"/><ellipse cx="20" cy="39" rx="13" ry="11" fill="hsl(${hue} 30% 45%)"/></svg>`,
  )}`

/** The avatar the specimens draw: the avatar page's examples are modules (`src/examples/avatar`). */
export const AvatarStyle = forSlots(AvatarSlots)(Recipes.Avatar({}))

// #region kbd-key
export const KbdStyle = forSlots(KbdSlots)(Recipes.Kbd({}))

export const kbdKey = (style: NamedStyle<typeof KbdSlots>, h: HtmlBuilder<never>): Html =>
  h.p([], ['Press ', Kbd.view({ key: 'Enter', style }, h), ' to send.'])
// #endregion

// #region kbd-combo
// Keys pressed together are one `kbd` holding a `kbd` per key.
export const kbdCombo = (style: NamedStyle<typeof KbdSlots>, h: HtmlBuilder<never>): Html =>
  h.p([], ['Search with ', Kbd.combo({ keys: ['⌘', 'K'], style }, h), '.'])
// #endregion

// #region kbd-joined
// A joiner between keys whose names run together without one.
export const kbdJoined = (style: NamedStyle<typeof KbdSlots>, h: HtmlBuilder<never>): Html =>
  h.p(
    [],
    [
      'Open the command palette with ',
      Kbd.combo({ keys: ['Ctrl', 'Shift', 'P'], joiner: '+', style }, h),
      '.',
    ],
  )
// #endregion

export const SpinnerStyle = forSlots(SpinnerSlots)(Recipes.Spinner({}))

export const TableStyle = forSlots(TableSlots)(Recipes.Table({}))

export const RadioGroupStyle = forSlots(RadioGroupSlots)(Recipes.RadioGroup({}))

// #region file-drop-basic
export const FileDropStyle = forSlots(FileDropSlots)(Recipes.FileDrop({}))

/** What the zone has taken: names and sizes, since a Model holds no `File`. */
export interface Attachments {
  readonly drop: UiFileDrop.Model
  readonly attached: ReadonlyArray<{ readonly name: string; readonly size: number }>
}

/** A zone that takes any number of files; `accept` narrows what the picker offers. */
export const fileDrop = <Message>(
  style: NamedStyle<typeof FileDropSlots>,
  state: Attachments,
  toMessage: (message: UiFileDrop.Message) => Message,
  h: HtmlBuilder<Message>,
  accept: ReadonlyArray<string> = [],
): Html =>
  h.submodel({
    slotId: state.drop.id,
    model: state.drop,
    view: UiFileDrop.view,
    viewInputs: {
      multiple: true,
      accept,
      toView: FileDrop.toView<Message>([style.mixin], { h }, ({ root, input }) =>
        h.label(root, [
          h.span([], ['Drop files or click to browse']),
          h.span(
            [],
            [
              state.attached.length === 0
                ? 'Nothing attached yet.'
                : `${state.attached.length} attached: ${state.attached.map(file => file.name).join(', ')}`,
            ],
          ),
          h.input(input),
        ]),
      ),
    },
    toParentMessage: toMessage,
  })
// #endregion

// #region slider-basic
export const SliderStyle = forSlots(SliderSlots)(Recipes.Slider({}))

/** Both values are the Model's: one number, and a range of two. */
export interface SliderValues {
  readonly volume: number
  readonly price: Slider.Range
}

/** The Message for each next value, of the kind its slider holds. */
export interface SliderMessages<Message> {
  readonly onVolume: (value: number) => Message
  readonly onPrice: (value: Slider.Range) => Message
}

export const slider = <Message>(
  style: NamedStyle<typeof SliderSlots>,
  values: SliderValues,
  messages: SliderMessages<Message>,
  h: HtmlBuilder<Message>,
): Html =>
  h.div(
    [h.Style({ display: 'grid', gap: '2rem', inlineSize: 'min(20rem, 100%)' })],
    [
      Slider.view(
        {
          id: 'preview-volume',
          label: 'Volume',
          description: 'Applies to this device only.',
          value: values.volume,
          onChange: messages.onVolume,
          step: 5,
          format: value => `${value}%`,
          showValue: true,
          style,
        },
        h,
      ),
      Slider.view(
        {
          id: 'preview-price',
          label: 'Price',
          value: values.price,
          onChange: messages.onPrice,
          max: 500,
          step: 10,
          marks: [0, 100, 200, 300, 400, 500],
          format: amount => `$${amount}`,
          words: { low: 'Minimum price', high: 'Maximum price' },
          style,
        },
        h,
      ),
    ],
  )
// #endregion

// #region slider-commit
/** The value as it moves, and the one last let go of. */
export interface SliderCommit {
  readonly value: number
  readonly saved: number
}

// `onChange` sends every step on the way, so a drag sends dozens; `onCommit`
// sends once, when the reader lets go (and on each key press), which is the
// moment to save or ask a server.
export const sliderCommit = <Message>(
  style: NamedStyle<typeof SliderSlots>,
  state: SliderCommit,
  messages: {
    readonly onChange: (value: number) => Message
    readonly onCommit: (value: number) => Message
  },
  h: HtmlBuilder<Message>,
): Html =>
  h.div(
    [h.Style({ display: 'grid', gap: '0.75rem', inlineSize: 'min(20rem, 100%)' })],
    [
      Slider.view(
        {
          id: 'preview-brightness',
          label: 'Brightness',
          value: state.value,
          onChange: messages.onChange,
          onCommit: messages.onCommit,
          step: 5,
          format: value => `${value}%`,
          showValue: true,
          style,
        },
        h,
      ),
      h.p([h.AriaLive('polite')], [`Saved: ${state.saved}%`]),
    ],
  )
// #endregion

// #region slider-vertical
/** A level on a vertical track, a dot at every step and words at the ends. */
export const sliderVertical = <Message>(
  style: NamedStyle<typeof SliderSlots>,
  level: number,
  onLevel: (value: number) => Message,
  h: HtmlBuilder<Message>,
): Html =>
  Slider.view(
    {
      id: 'preview-level',
      label: 'Level',
      value: level,
      onChange: onLevel,
      orientation: 'vertical',
      step: 10,
      ticks: true,
      marks: [
        { value: 0, label: 'Off' },
        { value: 100, label: 'Max' },
      ],
      showValue: true,
      format: value => `${value}%`,
      style,
    },
    h,
  )
// #endregion

// #region slider-marks
/** A range with labelled marks, its values at the end of the label's row. */
export const sliderMarks = <Message>(
  style: NamedStyle<typeof SliderSlots>,
  price: Slider.Range,
  onPrice: (value: Slider.Range) => Message,
  h: HtmlBuilder<Message>,
): Html =>
  Slider.view(
    {
      id: 'preview-budget',
      label: 'Budget',
      value: price,
      onChange: onPrice,
      max: 500,
      step: 50,
      ticks: true,
      marks: [
        { value: 0, label: '$0' },
        { value: 250, label: '$250' },
        { value: 500, label: '$500' },
      ],
      showValue: true,
      format: amount => `$${amount}`,
      words: { low: 'Minimum budget', high: 'Maximum budget' },
      style,
    },
    h,
  )
// #endregion

// #region menu-actions
export const MenuStyle = forSlots(MenuSlots)(Recipes.Menu({}))

/** An icon in a row, drawn with the inert builder: a row is data the Menu was given, drawn later. */
const rowIcon = (d: string): Html => outline(SlotView.inertBuilder<never>(), d)

// An `icon` before the label, a quiet `hint` and a `shortcut` at its end, and
// a `tone` for what cannot be undone. Two rows may share a label: a row is
// named by its `value`, so these two Share rows are told apart.
/** The rows of the menu a button opens. */
export const PAGE_MENU: ReadonlyArray<Menu.Row> = [
  {
    value: 'Rename',
    label: 'Rename',
    icon: rowIcon('M2.5 13.5l.5-3 7-7 2.5 2.5-7 7zM9 5l2 2'),
    shortcut: ['F2'],
  },
  { value: 'Duplicate', label: 'Duplicate', icon: rowIcon('M5.5 5.5h8v8h-8zM10.5 5.5v-3h-8v8h3') },
  { value: 'Move', label: 'Move', icon: rowIcon('M2.5 8h11M10 4.5L13.5 8 10 11.5') },
  { value: 'Share link', label: 'Share', hint: 'link' },
  { value: 'Share email', label: 'Share', hint: 'email' },
  {
    value: 'Delete',
    label: 'Delete',
    icon: rowIcon('M2.5 4.5h11M6 4.5v-2h4v2M4 4.5l.75 9h6.5l.75-9'),
    tone: 'destructive',
  },
]

/** The rows of the menu a right press opens, two opening submenus beside them. */
export const FILE_MENU: ReadonlyArray<Menu.Row> = [
  { value: 'New tab', label: 'New tab' },
  {
    value: 'Share',
    label: 'Share',
    items: [
      { value: 'Email', label: 'Email' },
      { value: 'Messages', label: 'Messages' },
      { value: 'Copy link', label: 'Copy link' },
    ],
  },
  {
    value: 'Export',
    label: 'Export',
    items: [
      { value: 'PDF', label: 'PDF' },
      { value: 'PNG', label: 'PNG' },
      { value: 'SVG', label: 'SVG' },
    ],
    isItemDisabled: item => item === 'SVG',
  },
  { value: 'Print', label: 'Print' },
]

/** Each open menu is the component's; what each last chose is the Model's. */
export interface MenuState {
  readonly pageMenu: Menu.Model
  readonly pageChoice: Option.Option<string>
  readonly fileMenu: Menu.Model
  readonly fileChoice: Option.Option<string>
}

export const menu = <Message>(
  style: NamedStyle<typeof MenuSlots>,
  state: MenuState,
  toPage: (message: Menu.Message) => Message,
  toFile: (message: Menu.Message) => Message,
  direction: 'ltr' | 'rtl',
  h: HtmlBuilder<Message>,
): Html => {
  const chosen = (choice: Option.Option<string>) =>
    h.p(
      [],
      [
        Option.match(choice, {
          onNone: () => 'Nothing chosen yet.',
          onSome: value => `Chose ${value}.`,
        }),
      ],
    )
  return h.div(
    [h.Style({ display: 'grid', gap: '0.75rem', justifyItems: 'start' })],
    [
      Menu.view(
        {
          model: state.pageMenu,
          rows: PAGE_MENU,
          buttonContent: h.span([], ['Page actions']),
          isRowDisabled: value => value === 'Move',
          onMessage: toPage,
          direction,
          mixins: [style.mixin, ...Menu.fluid],
        },
        h,
      ),
      chosen(state.pageChoice),
      h.div(
        [
          ...Menu.target(toFile, h),
          h.Tabindex(0),
          h.AriaLabel('report.pdf, right-click or Shift+F10 for its actions'),
          h.Style({
            padding: '2rem 3rem',
            border: '1px dashed currentColor',
            borderRadius: '0.5rem',
            cursor: 'context-menu',
          }),
        ],
        ['report.pdf'],
      ),
      Menu.view(
        {
          model: state.fileMenu,
          rows: FILE_MENU,
          buttonContent: h.span([], ['Actions for report.pdf']),
          opensAt: 'point',
          onMessage: toFile,
          direction,
          mixins: [style.mixin],
          // The highlight must not chase the submenus' rows: they hold the menu's own rows.
          submenuMixins: [style.mixin, ...Menu.fluid],
        },
        h,
      ),
      chosen(state.fileChoice),
    ],
  )
}
// #endregion

// #region menu-view-options
export const Zoom = Schema.Literals(['Fit', 'Actual size'])

/** What the View menu sets: the application keeps it, and builds the rows from it. */
export const ViewOptions = Schema.Struct({
  grid: Schema.Boolean,
  rulers: Schema.Boolean,
  zoom: Zoom,
  chosen: Schema.Option(Schema.String),
})
export type ViewOptions = typeof ViewOptions.Type

// Checkbox and radio rows send `Selected` and keep the menu open; rows of one
// group stand under its heading; a shortcut is drawn as keys at the row's end.
export const viewRows = (options: ViewOptions): ReadonlyArray<Menu.Row> => [
  {
    value: 'Grid',
    label: 'Grid',
    check: 'checkbox',
    checked: options.grid,
    group: 'Show',
    shortcut: ['⌘', 'G'],
  },
  { value: 'Rulers', label: 'Rulers', check: 'checkbox', checked: options.rulers, group: 'Show' },
  { value: 'Fit', label: 'Fit', check: 'radio', checked: options.zoom === 'Fit', group: 'Zoom' },
  {
    value: 'Actual size',
    label: 'Actual size',
    check: 'radio',
    checked: options.zoom === 'Actual size',
    group: 'Zoom',
  },
  { value: 'Delete', label: 'Delete', tone: 'destructive', shortcut: ['⌫'] },
]

export const viewOptionsMenu = <Message>(
  style: NamedStyle<typeof MenuSlots>,
  state: { readonly menu: Menu.Model; readonly options: ViewOptions },
  onMessage: (message: Menu.Message) => Message,
  direction: 'ltr' | 'rtl',
  h: HtmlBuilder<Message>,
): Html =>
  h.div(
    [h.Style({ display: 'grid', gap: '0.75rem', justifyItems: 'start' })],
    [
      Menu.view(
        {
          model: state.menu,
          rows: viewRows(state.options),
          buttonContent: h.span([], ['View']),
          onMessage,
          direction,
          mixins: [style.mixin, ...Menu.fluid],
          kbd: KbdStyle,
        },
        h,
      ),
      h.p(
        [],
        [
          `Grid ${state.options.grid ? 'on' : 'off'}, rulers ${state.options.rulers ? 'on' : 'off'}, ${state.options.zoom}.`,
          ...Option.match(state.options.chosen, {
            onNone: () => [],
            onSome: value => [` Chose ${value}.`],
          }),
        ],
      ),
    ],
  )
// #endregion

// #region command-basic
export const CommandStyle = forSlots(CommandSlots)(Recipes.Command({}))

/** The command menu's query and highlighted row, and the Messages that move them. */
export interface CommandState {
  readonly query: string
  readonly active: Option.Option<string>
  readonly ran: Option.Option<string>
}

export interface CommandMessages<Message> {
  readonly onQuery: (query: string) => Message
  readonly onActive: (value: string) => Message
  readonly onRun: (value: string) => Message
}

export const command = <Message>(
  style: NamedStyle<typeof CommandSlots>,
  state: CommandState,
  messages: CommandMessages<Message>,
  h: HtmlBuilder<Message>,
): Html =>
  h.div(
    [
      h.Style({
        display: 'grid',
        gridTemplateColumns: 'minmax(0, 1fr)',
        gap: '0.75rem',
        justifyItems: 'start',
        inlineSize: 'min(32rem, 100%)',
      }),
    ],
    [
      Command.view(
        {
          id: 'palette',
          label: 'Search commands',
          placeholder: 'Type a command or search…',
          groups: [
            {
              heading: 'Suggestions',
              items: [
                {
                  value: 'calendar',
                  label: 'Calendar',
                  icon: outline(h, 'M2 4h12v10H2zM2 7h12M5 2v3M11 2v3'),
                },
                {
                  value: 'emoji',
                  label: 'Search emoji',
                  keywords: ['smiley'],
                  icon: outline(
                    h,
                    'M8 14.5a6.5 6.5 0 1 0 0-13 6.5 6.5 0 0 0 0 13zM5.5 9.5s1 1.5 2.5 1.5 2.5-1.5 2.5-1.5M6 6h.01M10 6h.01',
                  ),
                },
                {
                  value: 'calculator',
                  label: 'Calculator',
                  disabled: true,
                  icon: outline(
                    h,
                    'M3 1.5h10v13H3zM5 4h6v2.5H5zM5.5 9.5h.01M8 9.5h.01M10.5 9.5h.01M5.5 12h.01M8 12h.01M10.5 12h.01',
                  ),
                },
              ],
            },
            {
              heading: 'Settings',
              items: [
                {
                  value: 'profile',
                  label: 'Profile',
                  shortcut: ['⌘', 'P'],
                  icon: outline(
                    h,
                    'M8 7a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5zM3 14c0-2.8 2.2-5 5-5s5 2.2 5 5',
                  ),
                },
                {
                  value: 'billing',
                  label: 'Billing',
                  shortcut: ['⌘', 'B'],
                  icon: outline(h, 'M1.5 3.5h13v9h-13zM1.5 6.5h13M4 10h2'),
                },
                {
                  value: 'settings',
                  label: 'Settings',
                  keywords: ['preferences'],
                  shortcut: ['⌘', 'S'],
                  icon: outline(h, 'M2 4h6M11 4h3M2 12h2M7 12h7M9.5 2.5v3M5.5 10.5v3'),
                },
              ],
            },
            {
              heading: 'Help',
              items: [
                {
                  value: 'shortcuts',
                  label: 'Keyboard shortcuts',
                  shortcut: ['⌘', '/'],
                  icon: outline(
                    h,
                    'M1.5 4h13v8h-13zM4 6.5h.01M6.5 6.5h.01M9 6.5h.01M11.5 6.5h.01M5 9.5h6',
                  ),
                },
                {
                  value: 'docs',
                  label: 'Documentation',
                  keywords: ['guide'],
                  icon: outline(
                    h,
                    'M2 3h4a2 2 0 0 1 2 2v9a1.5 1.5 0 0 0-1.5-1.5H2zM14 3h-4a2 2 0 0 0-2 2v9a1.5 1.5 0 0 1 1.5-1.5H14z',
                  ),
                },
                {
                  value: 'support',
                  label: 'Contact support',
                  keywords: ['help'],
                  icon: outline(h, 'M2 3h12v8H6l-3 3v-3H2z'),
                },
              ],
            },
          ],
          query: state.query,
          onQuery: messages.onQuery,
          active: state.active,
          onActive: messages.onActive,
          onRun: messages.onRun,
          empty: 'No commands found.',
          hints: [
            { keys: ['↑', '↓'], label: 'to navigate' },
            { keys: ['↵'], label: 'to select' },
          ],
          style,
          kbd: KbdStyle,
        },
        h,
      ),
      h.p(
        [],
        [
          Option.match(state.ran, {
            onNone: () => 'Nothing run yet',
            onSome: value => `Ran ${value}`,
          }),
        ],
      ),
    ],
  )
// #endregion

// #region command-dialog
// The menu meets the panel's edges, and its title is for assistive technology alone.
export const PaletteDialogStyle = forSlots(DialogSlots)(
  Recipes.Dialog.extend({
    base: { panel: { padding: '0', gap: '0' }, title: Utilities.srOnly },
  })({}),
)

const palette = <Message>(h: HtmlBuilder<Message>): ReadonlyArray<CommandGroup<string>> => [
  {
    heading: 'Pages',
    items: [
      {
        value: 'new-page',
        label: 'New page',
        shortcut: ['⌘', 'N'],
        icon: outline(h, 'M3 1h7l3 3v11H3zM8 7v5M5.5 9.5h5'),
      },
      {
        value: 'search',
        label: 'Search pages',
        description: 'Titles and text',
        keywords: ['find'],
        icon: outline(h, 'M7 12.5a5.5 5.5 0 1 0 0-11 5.5 5.5 0 0 0 0 11zM14.5 14.5l-3.6-3.6'),
      },
    ],
  },
  {
    heading: 'Settings',
    items: [
      {
        value: 'theme',
        label: 'Change theme',
        keywords: ['dark', 'light'],
        opensPage: true,
        icon: outline(h, 'M8 14.5a6.5 6.5 0 0 1 0-13zM8 1.5a6.5 6.5 0 0 1 0 13'),
      },
    ],
  },
]

const THEMES: ReadonlyArray<CommandGroup<string>> = [
  {
    items: [
      { value: 'light', label: 'Light' },
      { value: 'dark', label: 'Dark' },
      { value: 'system', label: 'As the system' },
    ],
  },
]

/** The dialog is the component's; the query, the highlight and the pages stepped into are the Model's. */
export interface PaletteState {
  readonly dialog: UiDialog.Model
  readonly query: string
  readonly active: Option.Option<string>
  readonly pages: ReadonlyArray<string>
  readonly ran: Option.Option<string>
}

export interface PaletteMessages<Message> {
  readonly onOpen: Message
  readonly toDialog: (message: UiDialog.Message) => Message
  readonly onQuery: (query: string) => Message
  readonly onActive: (value: string) => Message
  readonly onRun: (value: string) => Message
  readonly onBack: Message
}

// ⌘K or Ctrl+K opens it from anywhere on this page: the application lifts
// `Command.hotkey(onOpen)` into its subscriptions. "Change theme" steps
// into a page, and Backspace in the empty field steps back out.
export const commandDialog = <Message>(
  style: NamedStyle<typeof CommandSlots>,
  state: PaletteState,
  messages: PaletteMessages<Message>,
  h: HtmlBuilder<Message>,
): Html =>
  h.div(
    [h.Style({ display: 'grid', gap: '0.75rem', justifyItems: 'start' })],
    [
      h.p(
        [],
        [
          Button.view({ label: 'Open the menu', onClick: messages.onOpen, style: ButtonStyle }, h),
          ' or press ',
          Kbd.combo({ keys: ['⌘', 'K'], style: KbdStyle }, h),
        ],
      ),
      h.submodel({
        slotId: state.dialog.id,
        model: state.dialog,
        view: UiDialog.view,
        viewInputs: {
          toView: Dialog.toView([PaletteDialogStyle.mixin], { h }, dialog =>
            h.dialog(
              dialog.dialog,
              dialog.isVisible
                ? [
                    h.div(dialog.backdrop),
                    h.div(dialog.panel, [
                      h.h2(dialog.title, ['Command menu']),
                      Command.view(
                        {
                          id: 'preview-palette',
                          label: 'Search commands',
                          placeholder: 'Type a command or search…',
                          groups: state.pages.length === 0 ? palette(h) : THEMES,
                          query: state.query,
                          onQuery: messages.onQuery,
                          active: state.active,
                          onActive: messages.onActive,
                          onRun: messages.onRun,
                          page: { trail: state.pages, onBack: messages.onBack },
                          hints: [
                            { keys: ['↑', '↓'], label: 'to navigate' },
                            { keys: ['↵'], label: 'to select' },
                            { keys: ['esc'], label: 'to close' },
                          ],
                          style,
                          kbd: KbdStyle,
                        },
                        h,
                      ),
                    ]),
                  ]
                : [],
            ),
          ),
        },
        toParentMessage: messages.toDialog,
      }),
      h.p(
        [],
        [
          Option.match(state.ran, {
            onNone: () => 'Nothing run yet',
            onSome: value => `Ran ${value}`,
          }),
        ],
      ),
    ],
  )
// #endregion

export const CalendarStyle = forSlots(CalendarSlots)(Recipes.Calendar({}))

// The Sidebar's rail names its rows in tooltips of this look.
export const TooltipStyle = forSlots(TooltipSlots)(Recipes.Tooltip({}))

// #region toast-payload
export const ToastStyle = forSlots(ToastSlots)(Recipes.Toast({}))
// The toast's card pads the notice, so the row adds none of its own.
const NoticeStyle = forSlots(ItemSlots)(
  Recipes.Item.extend({ variants: { density: { comfortable: { root: { padding: '0' } } } } })({}),
)
const DismissStyle = forSlots(ButtonSlots)(
  Recipes.Button({ tone: 'neutral', variant: 'ghost', size: 'sm' }),
)

export const Notice = Schema.Struct({ title: Schema.String, text: Schema.String })
// Annotated: the inferred type names a foldkit internal module.
export const Notices: ReturnType<typeof ToastView.make<typeof Notice.Type, typeof Notice.Encoded>> =
  ToastView.make(Notice)

/** The stack and each entry's timer are the component's; what was said is the Message's. */
export interface ToastMessages<Message> {
  readonly onNotify: Message
  readonly toMessage: (message: typeof Notices.Message.Type) => Message
}

export const toast = <Message>(
  style: NamedStyle<typeof ToastSlots>,
  model: typeof Notices.Model.Type,
  messages: ToastMessages<Message>,
  h: HtmlBuilder<Message>,
): Html =>
  h.div(
    [],
    [
      Button.view({ label: 'Save draft', onClick: messages.onNotify, style: ButtonStyle }, h),
      h.submodel({
        slotId: model.id,
        model,
        view: Notices.view,
        viewInputs: {
          position: 'BottomRight',
          entryToView: (entry, handlers) =>
            Item.view(
              {
                title: entry.payload.title,
                description: entry.payload.text,
                actions: h.button(
                  SlotView.buildersFor(ButtonSlots, [DismissStyle.mixin], {
                    input: undefined,
                    h,
                  }).button.attrs([...handlers.dismiss, h.Type('button'), h.AriaLabel('Dismiss')]),
                  ['✕'],
                ),
                style: NoticeStyle,
              },
              h,
            ),
          toView: Toast.toView([style.mixin], { h }, ({ container, entries }) =>
            h.div(
              container,
              entries.map(entry => h.keyed('div')(entry.id, entry.attributes, [entry.content])),
            ),
          ),
        },
        toParentMessage: messages.toMessage,
      }),
    ],
  )
// #endregion

// #region checkbox-group-alerts
export const CheckboxGroupStyle = forSlots(CheckboxGroupSlots)(Recipes.CheckboxGroup({}))

export const checkboxGroup = <Message>(
  style: NamedStyle<typeof CheckboxGroupSlots>,
  checked: ReadonlyArray<string>,
  onToggle: (value: string) => Message,
  h: HtmlBuilder<Message>,
): Html =>
  CheckboxGroup.view(
    {
      id: 'alerts',
      legend: 'Email me about',
      options: [
        { value: 'mentions', label: 'Mentions', description: 'When someone names you.' },
        { value: 'replies', label: 'Replies to my comments' },
        { value: 'digest', label: 'A weekly digest' },
        { value: 'offers', label: 'Offers', disabled: true },
      ],
      checked,
      onToggle,
      style,
    },
    h,
  )
// #endregion

// #region checkbox-group-described
export const checkboxGroupDescribed = <Message>(
  style: NamedStyle<typeof CheckboxGroupSlots>,
  checked: ReadonlyArray<string>,
  onToggle: (value: string) => Message,
  h: HtmlBuilder<Message>,
): Html =>
  CheckboxGroup.view(
    {
      id: 'alerts-described',
      legend: 'Email me about',
      options: [
        { value: 'mentions', label: 'Mentions', description: 'When someone names you.' },
        { value: 'replies', label: 'Replies', description: 'When someone answers you.' },
        { value: 'digest', label: 'A weekly digest', description: 'Monday, a short one.' },
      ],
      checked,
      onToggle,
      style,
    },
    h,
  )
// #endregion

// #region checkbox-group-select-all
// A first row that checks every option or none; Offers is locked on, and
// stays on through both.
export const checkboxGroupSelectAll = <Message>(
  style: NamedStyle<typeof CheckboxGroupSlots>,
  checked: ReadonlyArray<string>,
  onToggle: (value: string) => Message,
  onSet: (values: ReadonlyArray<string>) => Message,
  h: HtmlBuilder<Message>,
): Html =>
  CheckboxGroup.view(
    {
      id: 'alerts-choices',
      legend: 'Email me about',
      options: [
        { value: 'mentions', label: 'Mentions' },
        { value: 'replies', label: 'Replies' },
        { value: 'digest', label: 'A weekly digest' },
        { value: 'offers', label: 'Offers', disabled: true },
      ],
      checked,
      onToggle,
      selectAll: { label: 'Select all', onSet },
      style,
    },
    h,
  )
// #endregion

// #region checkbox-group-invalid
export const checkboxGroupInvalid = <Message>(
  style: NamedStyle<typeof CheckboxGroupSlots>,
  checked: ReadonlyArray<string>,
  onToggle: (value: string) => Message,
  h: HtmlBuilder<Message>,
): Html =>
  CheckboxGroup.view(
    {
      id: 'alerts-invalid',
      legend: 'Email me about',
      options: [
        { value: 'mentions', label: 'Mentions' },
        { value: 'replies', label: 'Replies' },
        { value: 'digest', label: 'A weekly digest' },
      ],
      checked,
      onToggle,
      // Invalid until one is checked: the error says what would make it valid.
      ...(checked.length === 0 ? { error: 'Pick at least one.' } : {}),
      style,
    },
    h,
  )
// #endregion

// #region app-shell-basic
// The page's frame, with no state and no Message: a skip link, the header (the banner) with its
// status and actions, the main region and the footer. `side` takes a `Sidebar`'s view for a column.
export const appShell = <Message>(
  style: NamedStyle<typeof AppShellSlots>,
  h: HtmlBuilder<Message>,
): Html =>
  AppShell.view(
    {
      title: 'Acme',
      status: [Badge.view({ text: 'Live', tone: 'live', style: BadgeStyle }, h)],
      actions: [Button.view({ label: 'Sign out', style: ButtonStyle }, h)],
      footer: [h.span([], ['Acme, 2026'])],
      style,
    },
    [h.h2([], ['Orders']), h.p([], ['Nothing is waiting for you.'])],
    h,
  )
// #endregion

// #region sidebar-icons
export const SidebarStyle = forSlots(SidebarSlots)(Recipes.Sidebar({}))
export const SidebarSheetStyle = forSlots(DialogSlots)(Recipes.Sheet({}))
const SidebarLogoStyle = forSlots(AvatarSlots)(
  Recipes.Avatar({ size: 'sm', shape: 'rounded', color: 'name' }),
)
const SidebarAvatarStyle = forSlots(AvatarSlots)(Recipes.Avatar({ size: 'sm', color: 'name' }))

export const appSidebar = Sidebar.init({
  id: 'app-sidebar',
  rows: ['inbox', 'projects', 'calendar', 'members', 'billing'],
  open: ['settings'],
})

const workspace = <Message>(h: HtmlBuilder<Message>): ReadonlyArray<Sidebar.SidebarGroup> => [
  {
    id: 'workspace',
    rows: [
      {
        id: 'inbox',
        label: 'Inbox',
        href: '#',
        current: true,
        badge: '12',
        icon: outline(h, 'M2 9h3l1 2h4l1-2h3M2 9l2-6h8l2 6v4H2z'),
      },
      {
        id: 'projects',
        label: 'Projects',
        icon: outline(h, 'M1 3h5l2 2h7v8H1z'),
        items: [
          { label: 'Website', href: '#' },
          { label: 'Mobile app', href: '#' },
        ],
      },
      {
        id: 'calendar',
        label: 'Calendar',
        href: '#',
        icon: outline(h, 'M2 4h12v10H2zM2 7h12M5 2v3M11 2v3'),
      },
    ],
  },
  {
    id: 'settings',
    title: 'Settings',
    rows: [
      {
        id: 'members',
        label: 'Members',
        href: '#',
        badge: '3',
        icon: outline(h, 'M6 7a2 2 0 100-4 2 2 0 000 4zM2 13c0-2 2-4 4-4s4 2 4 4'),
      },
      { id: 'billing', label: 'Billing', href: '#', icon: outline(h, 'M2 4h12v8H2zM2 7h12') },
    ],
  },
]

// Collapsed to a rail of icons named in tooltips; on a phone the opener shows it in a Sheet.
export const sidebar = <Message>(
  style: NamedStyle<typeof SidebarSlots>,
  model: Sidebar.Model,
  onMessage: (message: Sidebar.Message) => Message,
  h: HtmlBuilder<Message>,
): Html =>
  Sidebar.view(
    {
      model,
      onMessage,
      label: 'Workspace',
      groups: workspace(h),
      // A rail keeps each end's mark, centred over the icons.
      header: {
        mark: Avatar.view({ name: 'Acme', style: SidebarLogoStyle }, h),
        content: h.strong([], ['Acme']),
      },
      footer: {
        mark: Avatar.view({ name: 'Ada Lovelace', style: SidebarAvatarStyle }, h),
        content: h.span([], ['ada@acme.dev']),
      },
      collapse: 'icons',
      style,
      mixins: Sidebar.fluid,
      tooltip: [TooltipStyle.mixin],
      sheet: [SidebarSheetStyle.mixin],
    },
    h,
  )
// #endregion

// #region sidebar-resizable
// Its width is the sidebar's Model: drag the edge, or below half the least width it collapses.
export const sidebarResizableModel = Sidebar.init({
  id: 'app-sidebar-resizable',
  rows: ['inbox', 'projects', 'calendar', 'members', 'billing'],
  open: ['settings'],
  width: { size: 224, min: 176, max: 320 },
})

export const sidebarResizable = <Message>(
  model: Sidebar.Model,
  onMessage: (message: Sidebar.Message) => Message,
  h: HtmlBuilder<Message>,
): Html =>
  h.div(
    [h.Style({ display: 'flex', blockSize: '100%' })],
    [
      Sidebar.view(
        {
          model,
          onMessage,
          label: 'Workspace',
          groups: workspace(h),
          collapse: 'icons',
          style: SidebarStyle,
          mixins: Sidebar.fluid,
          tooltip: [TooltipStyle.mixin],
          sheet: [SidebarSheetStyle.mixin],
        },
        h,
      ),
      h.p([h.Style({ margin: '0', padding: '0.75rem' })], ['The page.']),
    ],
  )
// #endregion

// #region sidebar-floating
export const SidebarFloatingStyle = forSlots(SidebarSlots)(Recipes.Sidebar({ variant: 'floating' }))

export const floatingSidebar = Sidebar.init({
  id: 'app-sidebar-floating',
  rows: [],
  open: ['projects'],
})

const hash = 'M6.5 3L5 13M11 3l-1.5 10M3 6.5h10M3 9.5h10'

// A group's action adds to it; a row's takes the place of its count under the pointer.
const projects = <Message>(
  h: HtmlBuilder<Message>,
  acted: (what: string) => Message,
): ReadonlyArray<Sidebar.SidebarGroup<Message>> => {
  const more = (name: string) => ({
    label: `More for ${name}`,
    icon: outline(
      h,
      'M3 8a.5.5 0 101 0 .5.5 0 00-1 0zM7.5 8a.5.5 0 101 0 .5.5 0 00-1 0zM12 8a.5.5 0 101 0 .5.5 0 00-1 0z',
    ),
    message: acted(`More for ${name}`),
  })
  return [
    {
      id: 'main',
      rows: [
        {
          id: 'home',
          label: 'Home',
          href: '#',
          current: true,
          icon: outline(h, 'M2 7l6-5 6 5v7H2zM6 14V9h4v5'),
        },
        {
          id: 'inbox',
          label: 'Inbox',
          href: '#',
          badge: '4',
          icon: outline(h, 'M2 9h3l1 2h4l1-2h3M2 9l2-6h8l2 6v4H2z'),
        },
      ],
    },
    {
      id: 'projects',
      title: 'Projects',
      action: {
        label: 'New project',
        icon: outline(h, 'M8 3v10M3 8h10'),
        message: acted('New project'),
      },
      rows: [
        {
          id: 'design',
          label: 'Design engineering',
          href: '#',
          badge: '8',
          icon: outline(h, hash),
          action: more('Design engineering'),
        },
        {
          id: 'sales',
          label: 'Sales and marketing',
          href: '#',
          icon: outline(h, hash),
          action: more('Sales and marketing'),
        },
        {
          id: 'travel',
          label: 'Travel',
          href: '#',
          badge: '2',
          icon: outline(h, hash),
          action: more('Travel'),
        },
      ],
    },
  ]
}

// Lifted off the page's edge as a card; on a phone its opener shows it in a Sheet.
export const sidebarFloating = <Message>(
  model: Sidebar.Model,
  onMessage: (message: Sidebar.Message) => Message,
  acted: { readonly last: Option.Option<string>; readonly toMessage: (what: string) => Message },
  h: HtmlBuilder<Message>,
): Html =>
  h.div(
    [h.Style({ display: 'flex', blockSize: '100%' })],
    [
      Sidebar.view(
        {
          model,
          onMessage,
          label: 'Projects',
          groups: projects(h, acted.toMessage),
          style: SidebarFloatingStyle,
          mixins: Sidebar.fluid,
          sheet: [SidebarSheetStyle.mixin],
        },
        h,
      ),
      h.p(
        [h.Style({ margin: '0', padding: '1rem' })],
        [Option.getOrElse(acted.last, () => 'Hover a project for its actions.')],
      ),
    ],
  )
// #endregion

// #region sidebar-inset
export const SidebarInsetStyle = forSlots(SidebarSlots)(Recipes.Sidebar({ variant: 'inset' }))

export const insetSidebar = Sidebar.init({ id: 'app-sidebar-inset', rows: [], open: ['settings'] })

/** The theme's tokens by name; the palette is built only for its names, so the page's own applies. */
const token = Theme.ref(Theme.standard())

// Borderless on the frame's muted surface; the page beside it is the card.
export const sidebarInset = <Message>(
  model: Sidebar.Model,
  onMessage: (message: Sidebar.Message) => Message,
  h: HtmlBuilder<Message>,
): Html =>
  h.div(
    [
      h.Style({
        display: 'flex',
        blockSize: '100%',
        boxSizing: 'border-box',
        padding: token.space.xs,
        gap: token.space['2xs'],
        background: token.surface.muted,
        borderRadius: token.radius.lg,
      }),
    ],
    [
      Sidebar.view(
        {
          model,
          onMessage,
          label: 'Workspace',
          groups: workspace(h),
          style: SidebarInsetStyle,
          mixins: Sidebar.fluid,
          sheet: [SidebarSheetStyle.mixin],
        },
        h,
      ),
      h.div(
        // A grid, so the card stands the frame's full height.
        [h.Style({ display: 'grid', flex: '1 1 0', minInlineSize: '0' })],
        [
          Card.view(
            {
              title: 'Inbox',
              description: '12 unread, 3 flagged',
              content: h.p([h.Style({ margin: '0' })], ['The page stands on a card of its own.']),
              style: CardStyle,
            },
            h,
          ),
        ],
      ),
    ],
  )
// #endregion

// #region sidebar-sections
export const sectionsSidebar = Sidebar.init({
  id: 'app-sidebar-sections',
  rows: [],
  open: ['start', 'build', 'routing'],
})

/** A name over a quieter line, each cut short with an ellipsis. */
const twoLines = <Message>(h: HtmlBuilder<Message>, first: string, second: string) =>
  h.span(
    [h.Style({ display: 'grid', minInlineSize: '0', lineHeight: '1.25' })],
    [
      h.strong([h.Style({ overflow: 'hidden', textOverflow: 'ellipsis' })], [first]),
      h.small(
        [h.Style({ overflow: 'hidden', textOverflow: 'ellipsis', color: token.text.muted })],
        [second],
      ),
    ],
  )

const guide = (label: string, current = false) => ({ label, href: '#', current })

// Each heading opens and shuts its group, several at once; a branch nests its pages.
const docSections = <Message>(h: HtmlBuilder<Message>): ReadonlyArray<Sidebar.SidebarGroup> => [
  {
    id: 'start',
    title: 'Getting started',
    rows: [
      {
        id: 'install',
        label: 'Installation',
        href: '#',
        icon: outline(h, 'M8 2v8M5 7l3 3 3-3M3 13h10'),
      },
      {
        id: 'structure',
        label: 'Project structure',
        href: '#',
        icon: outline(h, 'M2 8l6 3 6-3M2 11l6 3 6-3M8 2l6 3-6 3-6-3z'),
      },
    ],
  },
  {
    id: 'build',
    title: 'Building your app',
    rows: [
      {
        id: 'routing',
        label: 'Routing',
        icon: outline(
          h,
          'M4 13a1.5 1.5 0 100-3 1.5 1.5 0 000 3zM12 6a1.5 1.5 0 100-3 1.5 1.5 0 000 3zM5.5 11.5H8a2.5 2.5 0 002.5-2.5V5.5',
        ),
        items: [guide('Defining routes'), guide('Pages and layouts', true), guide('Linking')],
      },
      {
        id: 'data',
        label: 'Data fetching',
        icon: outline(
          h,
          'M2.5 4c0-1 2.5-2 5.5-2s5.5 1 5.5 2-2.5 2-5.5 2-5.5-1-5.5-2zM2.5 4v8c0 1 2.5 2 5.5 2s5.5-1 5.5-2V4M2.5 8c0 1 2.5 2 5.5 2s5.5-1 5.5-2',
        ),
        items: [guide('Fetching'), guide('Caching'), guide('Revalidating')],
      },
      {
        id: 'styling',
        label: 'Styling',
        href: '#',
        badge: 'New',
        icon: outline(h, 'M3 13l1-3 7-7 2 2-7 7zM9.5 4.5l2 2'),
      },
    ],
  },
  {
    id: 'reference',
    title: 'API reference',
    rows: [
      {
        id: 'components',
        label: 'Components',
        href: '#',
        icon: outline(h, 'M5 4L1 8l4 4M11 4l4 4-4 4'),
      },
      {
        id: 'config',
        label: 'Configuration',
        href: '#',
        icon: outline(h, 'M2 4h8M12 4h2M2 12h2M6 12h8M10 2v4M4 10v4'),
      },
    ],
  },
]

export const sidebarSections = <Message>(
  model: Sidebar.Model,
  onMessage: (message: Sidebar.Message) => Message,
  h: HtmlBuilder<Message>,
): Html =>
  h.div(
    [h.Style({ display: 'flex', blockSize: '100%' })],
    [
      Sidebar.view(
        {
          model,
          onMessage,
          label: 'Documentation',
          groups: docSections(h),
          header: {
            mark: Avatar.view({ name: 'Docs', initials: 'D', style: SidebarLogoStyle }, h),
            content: twoLines(h, 'Documentation', 'v1.0.1'),
          },
          style: SidebarStyle,
          mixins: Sidebar.fluid,
          sheet: [SidebarSheetStyle.mixin],
        },
        h,
      ),
      h.p([h.Style({ margin: '0', padding: '1rem' })], ['Pages and layouts']),
    ],
  )
// #endregion

// #region sidebar-switcher
export const switcherSidebar = Sidebar.init({
  id: 'app-sidebar-switcher',
  rows: ['inbox', 'projects', 'calendar', 'members', 'billing'],
})

export const TEAMS: ReadonlyArray<Menu.Row> = [
  { value: 'Acme Inc', label: 'Acme Inc' },
  { value: 'Acme Corp.', label: 'Acme Corp.' },
  { value: 'Evil Corp.', label: 'Evil Corp.' },
]
export const ACCOUNT: ReadonlyArray<Menu.Row> = [
  { value: 'Account', label: 'Account' },
  { value: 'Notifications', label: 'Notifications' },
  { value: 'Log out', label: 'Log out' },
]

// A menu whose trigger is the whole end beside its mark, as wide as the column.
const EndMenuStyle = forSlots(MenuSlots)(
  Recipes.Menu.extend({
    base: {
      wrapper: { display: 'block', inlineSize: '100%' },
      button: {
        inlineSize: '100%',
        justifyContent: 'space-between',
        gap: token.space.xs,
        paddingInline: token.space.xs,
        border: '0',
        textAlign: 'start',
        fontWeight: 'inherit',
      },
    },
  })({}),
)

/** The team chosen, and the menus at the column's two ends. */
export interface SwitcherState {
  readonly team: string
  readonly teamMenu: Menu.Model
  readonly userMenu: Menu.Model
}

// The header switches teams and the footer opens the account's menu; a rail keeps their marks.
export const sidebarSwitcher = <Message>(
  model: Sidebar.Model,
  state: SwitcherState,
  messages: {
    readonly onSidebar: (message: Sidebar.Message) => Message
    readonly onTeamMenu: (message: Menu.Message) => Message
    readonly onUserMenu: (message: Menu.Message) => Message
  },
  h: HtmlBuilder<Message>,
): Html => {
  const upDown = outline(h, 'M5 6l3-3 3 3M5 10l3 3 3-3')
  return h.div(
    [h.Style({ display: 'flex', blockSize: '100%' })],
    [
      Sidebar.view(
        {
          model,
          onMessage: messages.onSidebar,
          label: 'Workspace',
          groups: workspace(h),
          header: {
            mark: Avatar.view({ name: state.team, style: SidebarLogoStyle }, h),
            content: Menu.view(
              {
                model: state.teamMenu,
                rows: TEAMS,
                buttonContent: h.span(
                  [h.Style({ display: 'contents' })],
                  [twoLines(h, state.team, 'Enterprise'), upDown],
                ),
                onMessage: messages.onTeamMenu,
                mixins: [EndMenuStyle.mixin, ...Menu.fluid],
              },
              h,
            ),
          },
          footer: {
            mark: Avatar.view({ name: 'Ada Lovelace', style: SidebarAvatarStyle }, h),
            content: Menu.view(
              {
                model: state.userMenu,
                rows: ACCOUNT,
                buttonContent: h.span(
                  [h.Style({ display: 'contents' })],
                  [twoLines(h, 'Ada Lovelace', 'ada@acme.dev'), upDown],
                ),
                onMessage: messages.onUserMenu,
                mixins: [EndMenuStyle.mixin, ...Menu.fluid],
              },
              h,
            ),
          },
          collapse: 'icons',
          style: SidebarStyle,
          mixins: Sidebar.fluid,
          tooltip: [TooltipStyle.mixin],
        },
        h,
      ),
      h.p([h.Style({ margin: '0', padding: '1rem' })], [`The ${state.team} inbox.`]),
    ],
  )
}
// #endregion

// #region menubar-basic
// A row's `shortcut` is drawn at its end and named in `aria-keyshortcuts`; the bar
// binds nothing, so the application listens for the keys.
export const MenubarStyle = forSlots(MenubarSlots)(Recipes.Menubar({}))
const MenubarMenuStyle = forSlots(MenuSlots)(Recipes.MenubarMenu({}))

/** The bar's menus, in the order of the Model's. */
export const MENUBAR: ReadonlyArray<Menubar.MenubarMenu> = [
  {
    label: 'File',
    rows: [
      { value: 'New', label: 'New' },
      { value: 'Open', label: 'Open' },
      { value: 'Save', label: 'Save', shortcut: ['⌘', 'S'] },
    ],
  },
  {
    label: 'Edit',
    rows: [
      { value: 'Undo', label: 'Undo', shortcut: ['⌘', 'Z'] },
      { value: 'Redo', label: 'Redo', shortcut: ['⇧', '⌘', 'Z'] },
      { value: 'Copy', label: 'Copy', shortcut: ['⌘', 'C'] },
    ],
    isRowDisabled: value => value === 'Redo',
  },
  {
    label: 'View',
    rows: [
      { value: 'Zoom in', label: 'Zoom in' },
      { value: 'Zoom out', label: 'Zoom out' },
      { value: 'Full screen', label: 'Full screen' },
    ],
  },
]

/** The open menus are the bar's; the command chosen is the Model's. */
export interface MenubarState {
  readonly bar: Menubar.Model
  readonly chosen: Option.Option<string>
}

export const menubar = <Message>(
  style: NamedStyle<typeof MenubarSlots>,
  state: MenubarState,
  onMessage: (message: Menubar.Message) => Message,
  direction: 'ltr' | 'rtl',
  h: HtmlBuilder<Message>,
): Html =>
  h.div(
    [h.Style({ display: 'grid', gap: '0.75rem', justifyItems: 'start' })],
    [
      Menubar.view(
        {
          label: 'Editor',
          model: state.bar,
          menus: MENUBAR,
          onMessage,
          direction,
          style,
          menuMixins: [MenubarMenuStyle.mixin, ...Menu.fluid],
        },
        h,
      ),
      h.p(
        [],
        [
          Option.match(state.chosen, {
            onNone: () => 'Nothing chosen yet.',
            onSome: chosen => `Chose ${chosen}.`,
          }),
        ],
      ),
    ],
  )
// #endregion

// #region virtual-list
export const VirtualListStyle = forSlots(VirtualListSlots)(Recipes.VirtualList({}))

/** Ten thousand files, made once: only the rows in view are drawn. */
export const FILES: ReadonlyArray<string> = Array.from(
  { length: 10_000 },
  (_, index) => `report-${String(index + 1).padStart(5, '0')}.pdf`,
)

/** The list's Model is upstream's, kept by the application and folded with its `update`. */
export const virtualList = <Message>(
  style: NamedStyle<typeof VirtualListSlots>,
  model: UiVirtualList.Model,
  onMessage: (message: UiVirtualList.Message) => Message,
  h: HtmlBuilder<Message>,
): Html =>
  h.div(
    [h.Style({ inlineSize: 'min(24rem, 100%)' })],
    [
      VirtualList.view(
        {
          model,
          items: FILES,
          itemToKey: file => file,
          itemToView: file => h.span([], [file]),
          onMessage,
          style,
        },
        h,
      ),
    ],
  )
// #endregion

// #region navigation-menu-links
export const NavStyle = forSlots(NavSlots)(Recipes.Nav({}))

const NavPage = Schema.Literals(['Overview', 'Projects', 'Team', 'Settings'])
type NavPage = typeof NavPage.Type

export const nav = <Message>(style: NamedStyle<typeof NavSlots>, h: HtmlBuilder<Message>): Html =>
  UiNav.view<NavPage>({
    items: NavPage.literals,
    ariaLabel: 'Workspace',
    // The demo's pages are not on this site, so each link stays on this page.
    toHref: () => '#',
    isItemCurrent: page => page === 'Projects',
    // The current link's line glides, and a faint pill follows the pointer.
    toView: Nav.toView<NavPage, Message>([style.mixin, ...Nav.fluid], { h }, page => page),
  })
// #endregion

// #region navigation-menu-panels
// A trigger shows a panel of links in the top layer below it; which one shows is Nav's Model.
export const siteNav: ReadonlyArray<Nav.NavEntry> = [
  { label: 'Overview', href: '#' },
  {
    id: 'packages',
    label: 'Packages',
    groups: [
      {
        title: 'Build',
        links: [
          { label: 'Mixins', href: '#', description: 'Slots, styles and behaviors.' },
          { label: 'Mixins UI', href: '#', description: 'Components on the slots.', current: true },
        ],
      },
      {
        title: 'Data',
        links: [
          { label: 'Remote', href: '#', description: 'Server facts, cached and live.' },
          { label: 'Sync', href: '#', description: 'Durable operations, offline first.' },
        ],
      },
    ],
  },
  { id: 'learn', label: 'Learn', groups: [{ links: [{ label: 'Guides', href: '#' }] }] },
  { label: 'Blog', href: '#' },
]

export const navPanels = <Message>(
  style: NamedStyle<typeof NavSlots>,
  model: Nav.Model,
  onMessage: (message: Nav.Message) => Message,
  h: HtmlBuilder<Message>,
): Html =>
  Nav.view(
    { model, entries: siteNav, label: 'Site', onMessage, mixins: [style.mixin, ...Nav.fluid] },
    h,
  )
// #endregion

// #region navigation-menu-pill
export const NavPillStyle = forSlots(NavSlots)(Recipes.Nav({ indicator: 'pill' }))
// #endregion

// #region navigation-menu-vertical
// A column: the arrows go up and down, and a panel opens beside it.
export const navVertical = <Message>(
  style: NamedStyle<typeof NavSlots>,
  model: Nav.Model,
  onMessage: (message: Nav.Message) => Message,
  h: HtmlBuilder<Message>,
): Html =>
  Nav.view(
    {
      model,
      entries: siteNav,
      label: 'Site',
      orientation: 'vertical',
      onMessage,
      mixins: [style.mixin, ...Nav.fluid],
    },
    h,
  )
// #endregion

// #region segmented-basic
export const SegmentedStyle = forSlots(SegmentedSlots)(Recipes.Segmented({}))

export const Range = Schema.Literals(['day', 'week', 'month', 'year'])
export type Range = typeof Range.Type

export const segmented = <Message>(
  style: NamedStyle<typeof SegmentedSlots>,
  range: Range,
  onRange: (range: Range) => Message,
  direction: 'ltr' | 'rtl',
  h: HtmlBuilder<Message>,
): Html =>
  Segmented.view(
    {
      id: 'range',
      label: 'Range',
      // A single choice is a radio group: its arrows choose, and swap when right to left.
      direction,
      options: Range.literals.map(value => ({
        value,
        label: value[0]!.toUpperCase() + value.slice(1),
      })),
      pressed: [range],
      onPress: onRange,
      style,
      // The pill glides to a new press; one is pressed at a time.
      mixins: Segmented.fluid,
    },
    h,
  )
// #endregion

// #region segmented-icons
export const ViewMode = Schema.Literals(['list', 'board', 'calendar'])
export type ViewMode = typeof ViewMode.Type

const modes: Record<ViewMode, { readonly label: string; readonly icon: string }> = {
  list: { label: 'List', icon: 'M2 4h12M2 8h12M2 12h12' },
  board: { label: 'Board', icon: 'M2 2h5v12H2zM9 2h5v7H9z' },
  calendar: { label: 'Calendar', icon: 'M2 4h12v10H2zM2 7h12M5 2v3M11 2v3' },
}

// An icon before each option's words, or alone (`iconOnly`), named by its label.
export const segmentedIcons = <Message>(
  style: NamedStyle<typeof SegmentedSlots>,
  mode: ViewMode,
  onMode: (mode: ViewMode) => Message,
  iconOnly: boolean,
  direction: 'ltr' | 'rtl',
  h: HtmlBuilder<Message>,
): Html =>
  Segmented.view(
    {
      id: 'view',
      label: 'View',
      direction,
      options: ViewMode.literals.map(value => ({
        value,
        label: modes[value].label,
        icon: outline(h, modes[value].icon),
        iconOnly,
      })),
      pressed: [mode],
      onPress: onMode,
      style,
      mixins: Segmented.fluid,
    },
    h,
  )
// #endregion

// #region segmented-icon-only
// The icons alone, each option named by its label (`aria-label` and `title`):
// `segmentedIcons(style, mode, onMode, true, direction, h)`.
// #endregion

// #region segmented-sizes
export const SegmentedSizes = (['sm', 'md', 'lg'] as const).map(size =>
  forSlots(SegmentedSlots)(Recipes.Segmented({ size })),
)

// Three steps of the size ladder, each a control of its own.
export const segmentedSizes = <Message>(
  range: Range,
  onRange: (range: Range) => Message,
  direction: 'ltr' | 'rtl',
  h: HtmlBuilder<Message>,
): Html =>
  h.div(
    [h.Style({ display: 'grid', gap: '0.75rem', justifyItems: 'start' })],
    SegmentedSizes.map(style => segmented(style, range, onRange, direction, h)),
  )
// #endregion

// #region segmented-multiple
export const Weekday = Schema.Literals(['mon', 'tue', 'wed', 'thu', 'fri'])
export type Weekday = typeof Weekday.Type

// With `multiple` it is a group of toggle buttons (`aria-pressed`), any number
// on, and `name` submits each chosen value. `Segmented.toggled(pressed, value,
// { multiple: true })` is the update. Draw it without `fluid`: the pill marks one.
export const segmentedMultiple = <Message>(
  style: NamedStyle<typeof SegmentedSlots>,
  days: ReadonlyArray<Weekday>,
  onDay: (day: Weekday) => Message,
  h: HtmlBuilder<Message>,
): Html =>
  Segmented.view(
    {
      multiple: true,
      label: 'Repeat on',
      name: 'repeat',
      options: Weekday.literals.map(value => ({
        value,
        label: value[0]!.toUpperCase() + value.slice(1),
      })),
      pressed: days,
      onPress: onDay,
      style,
    },
    h,
  )
// #endregion

// #region segmented-full
export const SegmentedFullStyle = forSlots(SegmentedSlots)(Recipes.Segmented({ width: 'fill' }))
// #endregion

// #region segmented-underline
export const SegmentedUnderlineStyle = forSlots(SegmentedSlots)(
  Recipes.Segmented({ tray: 'underline' }),
)
// #endregion

// #region angle-slider-basic
export const AngleSliderStyle = forSlots(AngleSliderSlots)(Recipes.AngleSlider({}))

/** What `update` and the view agree on: whole degrees, the compass points marked. */
export const HEADING_LAYOUT: AngleSlider.AngleSliderLayout = {
  step: 1,
  marks: [
    { value: 0, label: 'N' },
    { value: 90, label: 'E' },
    { value: 180, label: 'S' },
    { value: 270, label: 'W' },
  ],
}

/** The angle and the drag are the dial's Model, folded with `AngleSlider.update(HEADING_LAYOUT)`. */
export const angleSlider = <Message>(
  style: NamedStyle<typeof AngleSliderSlots>,
  model: AngleSlider.Model,
  onMessage: (message: AngleSlider.Message) => Message,
  h: HtmlBuilder<Message>,
): Html =>
  AngleSlider.view(
    { ...HEADING_LAYOUT, model, onMessage, label: 'Heading', name: 'heading', style },
    h,
  )
// #endregion

// #region angle-slider-marks
/** A quarter turn at a time: a drag lands on the nearest mark, and the keys go mark to mark. */
export const ROTATION_LAYOUT: AngleSlider.AngleSliderLayout = {
  step: 90,
  marks: [{ value: 0 }, { value: 90 }, { value: 180 }, { value: 270 }],
  restrictToMarks: true,
}

export const angleSliderMarks = <Message>(
  style: NamedStyle<typeof AngleSliderSlots>,
  model: AngleSlider.Model,
  onMessage: (message: AngleSlider.Message) => Message,
  h: HtmlBuilder<Message>,
): Html =>
  AngleSlider.view(
    {
      ...ROTATION_LAYOUT,
      model,
      onMessage,
      label: 'Rotation',
      format: value => `${value / 90} of 4`,
      valueText: value => `${value} degrees`,
      style,
    },
    h,
  )
// #endregion

// #region marquee-basic
export const MarqueeStyle = forSlots(MarqueeSlots)(Recipes.Marquee({}))

const CUSTOMERS = ['Acme', 'Globex', 'Initech', 'Umbrella', 'Hooli', 'Stark']

/** What it measured and whether it is paused are the marquee's Model, folded with `Marquee.update`. */
export const marquee = <Message>(
  style: NamedStyle<typeof MarqueeSlots>,
  model: Marquee.Model,
  onMessage: (message: Marquee.Message) => Message,
  h: HtmlBuilder<Message>,
): Html =>
  Marquee.view(
    {
      model,
      onMessage,
      label: 'Our customers',
      items: CUSTOMERS.map(name => h.strong([], [name])),
      speed: 40,
      style,
    },
    h,
  )
// #endregion

// #region marquee-vertical
export const marqueeVertical = <Message>(
  style: NamedStyle<typeof MarqueeSlots>,
  model: Marquee.Model,
  onMessage: (message: Marquee.Message) => Message,
  h: HtmlBuilder<Message>,
): Html =>
  h.div(
    [h.Style({ blockSize: '8rem' })],
    [
      Marquee.view(
        {
          model,
          onMessage,
          label: 'Latest news',
          items: ['Release 1.2 is out', 'New docs site', 'Meetup on Friday'].map(line =>
            h.span([], [line]),
          ),
          side: 'top',
          speed: 20,
          style,
        },
        h,
      ),
    ],
  )
// #endregion

// #region image-cropper-basic
export const ImageCropperStyle = forSlots(ImageCropperSlots)(Recipes.ImageCropper({}))
// The zoom is a Slider; its label is the cropper's to say.
const ZoomStyle = forSlots(SliderSlots)(Recipes.Slider({ label: 'hidden' }))

/** An 800 by 600 landscape, standing in for an upload. */
export const LANDSCAPE = `data:image/svg+xml,${encodeURIComponent(
  `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="600" viewBox="0 0 800 600"><rect width="800" height="600" fill="hsl(205 70% 82%)"/><circle cx="610" cy="150" r="70" fill="hsl(45 95% 65%)"/><path d="M0 460 L230 250 L420 430 L560 320 L800 500 V600 H0 Z" fill="hsl(150 30% 45%)"/></svg>`,
)}`

/** The crop, zoom and turn are the cropper's Model, folded with `update`; the image is the page's. */
export const imageCropper = <Message>(
  style: NamedStyle<typeof ImageCropperSlots>,
  model: ImageCropper.Model,
  onMessage: (message: ImageCropper.Message) => Message,
  h: HtmlBuilder<Message>,
): Html =>
  h.div(
    [h.Style({ inlineSize: 'min(32rem, 100%)' })],
    [
      ImageCropper.view(
        {
          model,
          onMessage,
          label: 'Crop the photo',
          src: LANDSCAPE,
          style,
          zoom: ImageCropper.zoomSlider(ZoomStyle),
        },
        h,
      ),
    ],
  )
// #endregion

// #region image-cropper-avatar
// A round crop at an aspect of 1, in a square well: its Model from
// `ImageCropper.init({ id, shape: 'round', aspect: 1 })`.
export const AvatarCropStyle = forSlots(ImageCropperSlots)(
  Recipes.ImageCropper({ viewport: 'square', handles: 'corners' }),
)

/**
 * `RequestedExport` answers with `Exported`, a PNG of the crop as a data URL,
 * which the page keeps to show (`url`).
 */
export const avatarCropper = <Message>(
  style: NamedStyle<typeof ImageCropperSlots>,
  model: ImageCropper.Model,
  url: Option.Option<string>,
  onMessage: (message: ImageCropper.Message) => Message,
  h: HtmlBuilder<Message>,
): Html =>
  h.div(
    [h.Style({ display: 'grid', gap: '0.75rem', inlineSize: 'min(20rem, 100%)' })],
    [
      ImageCropper.view(
        {
          model,
          onMessage,
          label: 'Profile picture',
          src: LANDSCAPE,
          controls: { rotate: false },
          style,
          zoom: ImageCropper.zoomSlider(ZoomStyle),
        },
        h,
      ),
      h.div(
        [h.Style({ display: 'flex', gap: '0.75rem', alignItems: 'center' })],
        [
          Button.view(
            {
              label: 'Use this crop',
              onClick: onMessage(
                ImageCropper.Message.RequestedExport({ type: 'image/png', quality: 1 }),
              ),
              style: ButtonStyle,
            },
            h,
          ),
          ...Option.match(url, {
            onNone: () => [],
            onSome: src => [
              h.img([
                h.Src(src),
                h.Alt('The cropped picture'),
                h.Style({ inlineSize: '3rem', blockSize: '3rem', borderRadius: '50%' }),
              ]),
            ],
          }),
        ],
      ),
    ],
  )
// #endregion

// #region signature-pad-basic
export const SignaturePadStyle = forSlots(SignaturePadSlots)(Recipes.SignaturePad({}))

/** The strokes and the typed name are the pad's Model, folded with `update`. */
export const signaturePad = <Message>(
  style: NamedStyle<typeof SignaturePadSlots>,
  model: SignaturePad.Model,
  onMessage: (message: SignaturePad.Message) => Message,
  h: HtmlBuilder<Message>,
): Html =>
  h.div(
    [h.Style({ inlineSize: 'min(28rem, 100%)' })],
    [SignaturePad.view({ model, onMessage, label: 'Signature', style }, h)],
  )
// #endregion

// #region qr-code-basic
export const QrCodeStyle = forSlots(QrCodeSlots)(Recipes.QrCode({}))

export const qrCode = (style: NamedStyle<typeof QrCodeSlots>, h: HtmlBuilder<never>): Html =>
  QrCode.view({ id: 'preview-qr', value: 'https://foldkit-plus.pages.dev', style }, h)
// #endregion

// #region qr-code-logo
const LOGO = `data:image/svg+xml,${encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><rect width="32" height="32" rx="8" fill="#4f46e5"/><path d="M10 9h12v4h-8v3h7v4h-7v6h-4z" fill="#fff"/></svg>',
)}`

// An overlay raises the error correction to H, so the code still reads under it.
export const qrCodeLogo = (style: NamedStyle<typeof QrCodeSlots>, h: HtmlBuilder<never>): Html =>
  QrCode.view(
    {
      id: 'logo-qr',
      value: 'https://foldkit-plus.pages.dev/components',
      label: 'QR code for the Foldkit Plus components',
      overlay: h.img([h.Src(LOGO), h.Alt('')]),
      style,
    },
    h,
  )
// #endregion

// #region qr-code-download
// The buttons send a Message; `update` answers it with `QrCode.Download`.
export const qrCodeDownload = <Message>(
  style: NamedStyle<typeof QrCodeSlots>,
  onDownload: (format: QrCode.Format) => Message,
  h: HtmlBuilder<Message>,
): Html =>
  h.div(
    [h.Style({ display: 'grid', gap: '0.75rem', justifyItems: 'start' })],
    [
      QrCode.view({ id: 'download-qr', value: 'WIFI:T:WPA;S:Guests;P:welcome-in;;', style }, h),
      h.div(
        [h.Style({ display: 'flex', gap: '0.5rem' })],
        [
          Button.view({ label: 'Download PNG', onClick: onDownload('png'), style: ButtonStyle }, h),
          Button.view({ label: 'Download SVG', onClick: onDownload('svg'), style: ButtonStyle }, h),
        ],
      ),
    ],
  )

/** In `update`: the drawn code, saved in the colors the page shows it in. */
export const downloadQr = (format: QrCode.Format) =>
  QrCode.Download({ id: 'download-qr', format, filename: 'guest-wifi', pixels: 512 })
// #endregion

export const ChartStyle = forSlots(ChartSlots)(Recipes.Chart({}))

// #region tour-basic
export const TourStyle = forSlots(TourSlots)(Recipes.Tour({}))

/** Folded with `Tour.update(TOUR)`; started with `Tour.start(model, TOUR)`. */
export const TOUR: Tour.Config = {
  steps: [
    { title: 'Search', description: 'Find any page by its name.', target: 'preview-tour-search' },
    { title: 'Save', description: 'Keep your work as you go.', target: 'preview-tour-save' },
    { title: 'That is all', description: 'Start the tour again from its button.' },
  ],
}

// Each step beside its target, the page dimmed around it; the arrows move on
// and back, Escape skips, and `Tour.focusReturn` gives focus back to the button that started it.
export const tour = <Message>(
  style: NamedStyle<typeof TourSlots>,
  model: Tour.Model,
  onMessage: (message: Tour.Message) => Message,
  started: Message,
  h: HtmlBuilder<Message>,
): Html => {
  // The targets need ids, so they are drawn from the Button's and Input's slots.
  const { button } = SlotView.buildersFor(ButtonSlots, [ButtonStyle.mixin], { input: undefined, h })
  const { input } = SlotView.buildersFor(InputSlots, [InputStyle.mixin], { input: undefined, h })
  return h.div(
    [h.Style({ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', alignItems: 'center' })],
    [
      h.button(button.attrs([h.Id('preview-tour-start'), h.Type('button'), h.OnClick(started)]), [
        'Start the tour',
      ]),
      h.input(
        input.attrs([
          h.Id('preview-tour-search'),
          h.Type('search'),
          h.AriaLabel('Search'),
          h.Placeholder('Search'),
          h.Style({ inlineSize: '12rem' }),
        ]),
      ),
      h.button(button.attrs([h.Id('preview-tour-save'), h.Type('button')]), ['Save']),
      Tour.view({ model, config: TOUR, onMessage, style, mixins: Tour.focusReturn }, h),
    ],
  )
}
// #endregion

// #region file-input-multiple
export const FileInputStyle = forSlots(FileInputSlots)(Recipes.FileInput({}))

/** What a pick and a remove send; answer both with `FileInput.Sync`, and a remove with `FileInput.Focus`. */
export interface FileMessages<Message> {
  readonly onChange: (files: ReadonlyArray<File>) => Message
  readonly onRemove: (file: File) => Message
}

// The application owns the list. The input forgets what it was given, so
// `Sync` writes the list back into it and a surrounding form submits what the
// list shows; the trigger is the input's `label`, so a press on it opens the
// browser's dialog with no script between.
export const fileInputMultiple = <Message>(
  style: NamedStyle<typeof FileInputSlots>,
  files: ReadonlyArray<File>,
  messages: FileMessages<Message>,
  h: HtmlBuilder<Message>,
): Html =>
  FileInput.view(
    {
      id: 'preview-attachments',
      name: 'attachments',
      label: 'Attach files',
      description: 'Images only, any number.',
      accept: ['image/*'],
      multiple: true,
      files,
      onChange: messages.onChange,
      onRemove: messages.onRemove,
      words: { remove: 'Take {name} off' },
      style,
    },
    h,
  )
// #endregion

// #region file-input-required
// A single file replaces the last pick. `required` is the browser's own, and
// `invalid` with a `description` says why the form would not submit.
export const fileInputRequired = <Message>(
  style: NamedStyle<typeof FileInputSlots>,
  files: ReadonlyArray<File>,
  messages: FileMessages<Message>,
  h: HtmlBuilder<Message>,
): Html =>
  FileInput.view(
    {
      id: 'preview-statement',
      name: 'statement',
      label: 'Choose a statement',
      description:
        files.length === 0 ? 'A CSV file is required.' : 'One file; choosing again replaces it.',
      accept: ['.csv', 'text/csv'],
      required: true,
      invalid: files.length === 0,
      files,
      onChange: messages.onChange,
      onRemove: messages.onRemove,
      style,
    },
    h,
  )
// #endregion

// #region code-block-basic
export const CodeBlockStyle = forSlots(CodeBlockSlots)(Recipes.CodeBlock({}))

const SOURCE = 'export const total = 3 // items\nexport const done = "yes"'

// Highlighting is the caller's: pass the tokens a tokenizer found as offsets
// into the code (`foldkit-richtext-code-shiki` finds them), and each is drawn
// with its `kind`, which the theme colours. The text of the block is the code.
export const codeBlock = (style: NamedStyle<typeof CodeBlockSlots>, h: HtmlBuilder<never>): Html =>
  CodeBlock.view(
    {
      code: SOURCE,
      title: 'totals.ts',
      lineNumbers: true,
      tokens: [
        { from: 0, to: 6, kind: 'syntax-keyword' },
        { from: 7, to: 12, kind: 'syntax-keyword' },
        { from: 19, to: 20, kind: 'syntax-operator' },
        { from: 21, to: 22, kind: 'syntax-number' },
        { from: 23, to: 31, kind: 'syntax-comment' },
        { from: 32, to: 38, kind: 'syntax-keyword' },
        { from: 39, to: 44, kind: 'syntax-keyword' },
        { from: 52, to: 57, kind: 'syntax-string' },
      ],
      style,
    },
    h,
  )
// #endregion

// #region code-block-copy
// The button sends what `onCopy` makes of the code: run `copyText` from
// `foldkit-primitives` in that Message's Command, then draw `copied: true`.
// Both states are drawn here, with no handler, as the page's script would.
export const codeBlockCopy = (
  style: NamedStyle<typeof CodeBlockSlots>,
  h: HtmlBuilder<never>,
): Html =>
  h.div(
    [h.Style({ display: 'grid', gap: '0.75rem' })],
    [
      CodeBlock.view({ code: 'npm install foldkit-plus', language: 'sh', copy: {}, style }, h),
      CodeBlock.view(
        { code: 'npm install foldkit-plus', language: 'sh', copy: { copied: true }, style },
        h,
      ),
    ],
  )
// #endregion
