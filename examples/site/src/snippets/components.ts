/**
 * Each shipped component as an application draws it, over the theme module
 * `/create` hands out (`./theme.ts`). A component's page shows its region,
 * and its previews call the function the region defines with the style the
 * reader selected, so the code on the page is the code that drew it.
 */
import { Option, Schema } from 'effect'
import { Dialog as UiDialog, Nav as UiNav } from '@foldkit/ui'
import type { Html, HtmlBuilder } from 'foldkit/html'
import { SlotView, type NamedStyle } from 'foldkit-mixins'
import { Utilities } from 'foldkit-mixins/utilities'
import {
  AlertSlots,
  AvatarSlots,
  BadgeSlots,
  Button,
  ButtonSlots,
  CalendarSlots,
  CardSlots,
  CheckboxGroup,
  CheckboxGroupSlots,
  Command,
  CommandSlots,
  type CommandGroup,
  Menubar,
  MenubarSlots,
  Nav,
  NavSlots,
  Dialog,
  DialogSlots,
  InputSlots,
  Item,
  ItemSlots,
  Kbd,
  KbdSlots,
  Menu,
  MenuSlots,
  RadioGroupSlots,
  Recipes,
  Segmented,
  SegmentedSlots,
  SelectSlots,
  Slider,
  SliderSlots,
  SpinnerSlots,
  TableSlots,
  TextareaSlots,
  Toast,
  ToastSlots,
  ToastView,
  TooltipSlots,
  AngleSlider,
  AngleSliderSlots,
  ChartSlots,
} from 'foldkit-mixins-ui'

import { outline } from './icon.js'
import { forSlots } from './theme.js'

// The Button page's examples are modules of their own (`src/examples/button`).
export const ButtonStyle = forSlots(ButtonSlots)(Recipes.Button({}))

/** The badge the specimen's plan card carries. */
export const BadgeStyle = forSlots(BadgeSlots)(Recipes.Badge())

export const AlertStyle = forSlots(AlertSlots)(Recipes.Alert({}))

export const CardStyle = forSlots(CardSlots)(Recipes.Card({}))

export const InputStyle = forSlots(InputSlots)(Recipes.Input({}))
export const TextareaStyle = forSlots(TextareaSlots)(Recipes.Textarea({}))

// #region select-basic
export const SelectStyle = forSlots(SelectSlots)(Recipes.Select({}))
// #endregion

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
          words: { empty: 'No commands found.' },
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

export const ChartStyle = forSlots(ChartSlots)(Recipes.Chart({}))
