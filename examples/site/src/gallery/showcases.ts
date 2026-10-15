/**
 * The components the site shows: each a shipped recipe, the variant axes a
 * reader can pick from (read from the recipe itself), and the function in
 * `src/snippets/components.ts` that draws it. A selection the recipe does
 * not know never reaches it: every value is checked against the recipe's own
 * axes first.
 */
import { Option } from 'effect'
import type { Html, HtmlBuilder } from 'foldkit/html'
import { SlotView, type NamedStyle, type StylePieces } from 'foldkit-mixins'
import {
  AccordionSlots,
  AlertSlots,
  AvatarSlots,
  BadgeSlots,
  BreadcrumbSlots,
  ButtonGroupSlots,
  ButtonSlots,
  CalendarSlots,
  CardGroupSlots,
  CardSlots,
  CheckboxSlots,
  ComboboxSlots,
  DatePickerSlots,
  DialogSlots,
  EmptySlots,
  InputSlots,
  ItemSlots,
  KbdSlots,
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
  TableSlots,
  TabsSlots,
  TextareaSlots,
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
  readonly checked: boolean
  readonly onCheck: (checked: boolean) => Message
  readonly switched: boolean
  readonly onSwitch: (on: boolean) => Message
  readonly page: number
  readonly onPage: (page: number) => Message
  readonly chosen: string
  readonly onChoose: (key: string) => Message
  readonly dismissed: boolean
  readonly onDismiss: Message
  readonly onRestore: Message
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
 */
const fromRecipe = <Slots>(
  about: Omit<Showcase, 'axes' | 'preview'>,
  contract: Slots,
  recipe: RecipeOf<Slots> & ((selection: never) => StylePieces<Slots>),
  draw: <Message>(style: NamedStyle<Slots>, live: Live<Message>) => Html,
  only?: ReadonlyArray<string>,
): Showcase => {
  const axes = Object.entries(recipe.def.variants)
    .filter(([name]) => only === undefined || only.includes(name))
    .map(([name, values]): Axis => {
      const names = Object.keys(values)
      // An axis the recipe leaves unset follows the page, as a size follows
      // the ladder's step, which is the default one on this page.
      const unset = names.includes('md') ? 'md' : names[0]!
      return { name, values: names, initial: recipe.def.defaults?.[name] ?? unset }
    })
  // Every value passed was checked against the recipe's own axes by `valueOf`.
  const select = recipe as unknown as (selection: Selection) => StylePieces<Slots>
  const styles = new Map<string, NamedStyle<Slots>>()
  const styleOf = (selection: Selection): NamedStyle<Slots> => {
    const chosen = Object.fromEntries(axes.map(axis => [axis.name, valueOf(axis, selection)]))
    const key = axes.map(axis => chosen[axis.name]).join('/')
    const known = styles.get(key)
    if (known !== undefined) return known
    const style = forSlots(contract)(select(chosen))
    styles.set(key, style)
    return style
  }
  return { ...about, axes, preview: (selection, live) => draw(styleOf(selection), live) }
}

/** A showcase whose look has no axes to pick from. */
const fixed = (
  about: Omit<Showcase, 'axes' | 'preview'>,
  draw: <Message>(live: Live<Message>) => Html,
): Showcase => ({ ...about, axes: [], preview: (_, live) => draw(live) })

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
    () => Snippet.badges(Snippet.BadgeStyle, inert),
  ),
  fromRecipe(
    {
      slug: 'alert',
      title: 'Alert',
      summary: 'A message that asks for attention, in four tones.',
      recipe: 'Alert',
      file: 'alert',
      contract: 'AlertSlots',
    },
    AlertSlots,
    Recipes.Alert,
    style => Snippet.alert(style, inert),
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
    (style, live) =>
      Snippet.card(
        style,
        { dismissed: live.dismissed, onDismiss: live.onDismiss, onRestore: live.onRestore },
        live.h,
      ),
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
    (style, live) =>
      Snippet.cardGroup(style, { chosen: live.chosen, onChoose: live.onChoose }, live.h),
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
      summary: 'The native select, styled like the fields beside it.',
      recipe: 'Select',
      file: 'select',
      contract: 'SelectSlots',
    },
    SelectSlots,
    Recipes.Select,
    style => Snippet.select(style, inert),
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
    (style, live) => Snippet.checkbox(style, live.checked, live.onCheck, live.h),
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
    () => Snippet.shortcut(Snippet.KbdStyle, inert),
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
    [],
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
  ),
  fixed(
    {
      slug: 'table',
      title: 'Table',
      summary: 'Rows and columns, numbers aligned to the end.',
      recipe: 'Table',
      file: 'table',
      contract: 'TableSlots',
    },
    () => Snippet.table(Snippet.TableStyle, inert),
  ),
  fixed(
    {
      slug: 'breadcrumb',
      title: 'Breadcrumb',
      summary: 'Where a page sits, and the way back up.',
      recipe: 'Breadcrumb',
      file: 'breadcrumb',
      contract: 'BreadcrumbSlots',
    },
    () => Snippet.breadcrumb(Snippet.BreadcrumbStyle, inert),
  ),
  fixed(
    {
      slug: 'pagination',
      title: 'Pagination',
      summary: 'Pages of a long list, the current one in your Model.',
      recipe: 'Pagination',
      file: 'pagination',
      contract: 'PaginationSlots',
    },
    live => Snippet.pagination(Snippet.PaginationStyle, live.page, live.onPage, live.h),
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
  ),
  fixed(
    {
      slug: 'empty',
      title: 'Empty',
      summary: 'What a list shows before it has anything in it.',
      recipe: 'Empty',
      file: 'empty',
      contract: 'EmptySlots',
    },
    () => Snippet.empty(Snippet.EmptyStyle, inert),
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
    (style, live) =>
      Snippet.accordion(
        style,
        live.widgets.faq,
        id => live.onWidget(Widgets.Message.ToggledFaq({ id })),
        live.h,
      ),
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
    (style, live) =>
      Snippet.segmented(
        style,
        live.widgets.range,
        range => live.onWidget(Widgets.Message.ChoseRange({ range })),
        live.h,
      ),
  ),
  fromRecipe(
    {
      slug: 'tabs',
      title: 'Tabs',
      summary: 'Panels of one place, one shown at a time, moved between by the arrow keys.',
      recipe: 'Tabs',
      file: 'tabs',
      contract: 'TabsSlots',
    },
    TabsSlots,
    Recipes.Tabs,
    (style, live) =>
      Snippet.tabs(
        style,
        live.widgets,
        message => live.onWidget(Widgets.Message.GotTabs({ message })),
        live.h,
      ),
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
  ),
  fromRecipe(
    {
      slug: 'slider',
      title: 'Slider',
      summary: 'A number in a range, dragged, clicked or stepped by the keys.',
      recipe: 'Slider',
      file: 'slider',
      contract: 'SliderSlots',
    },
    SliderSlots,
    Recipes.Slider,
    (style, live) =>
      Snippet.slider(
        style,
        live.widgets,
        message => live.onWidget(Widgets.Message.GotSlider({ message })),
        live.h,
      ),
  ),
  fromRecipe(
    {
      slug: 'dialog',
      title: 'Dialog',
      summary: 'A modal that holds focus until it is answered or Escape dismisses it.',
      recipe: 'Dialog',
      file: 'dialog',
      contract: 'DialogSlots',
    },
    DialogSlots,
    Recipes.Dialog,
    (style, live) =>
      Snippet.dialog(
        style,
        live.widgets.dialog,
        {
          onOpen: live.onWidget(Widgets.Message.OpenedDialog()),
          onClose: live.onWidget(Widgets.Message.ClosedDialog()),
          toMessage: message => live.onWidget(Widgets.Message.GotDialog({ message })),
        },
        live.h,
      ),
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
    (style, live) =>
      Snippet.popover(
        style,
        live.widgets.popover,
        message => live.onWidget(Widgets.Message.GotPopover({ message })),
        live.h,
      ),
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
    live =>
      Snippet.tooltip(
        Snippet.TooltipStyle,
        live.widgets.tooltip,
        message => live.onWidget(Widgets.Message.GotTooltip({ message })),
        live.h,
      ),
  ),
  fromRecipe(
    {
      slug: 'menu',
      title: 'Menu',
      summary: 'Actions behind a button, in groups, moved through by the keys and typed to.',
      recipe: 'Menu',
      file: 'menu',
      contract: 'MenuSlots',
    },
    MenuSlots,
    Recipes.Menu,
    (style, live) =>
      Snippet.menu(
        style,
        live.widgets,
        message => live.onWidget(Widgets.Message.GotMenu({ message })),
        live.h,
      ),
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
        live.h,
      ),
  ),
  fromRecipe(
    {
      slug: 'combobox',
      title: 'Combobox',
      summary: 'A field that suggests as you type, and keeps one of its suggestions.',
      recipe: 'Combobox',
      file: 'combobox',
      contract: 'ComboboxSlots',
    },
    ComboboxSlots,
    Recipes.Combobox,
    (style, live) =>
      Snippet.combobox(
        style,
        live.widgets,
        message => live.onWidget(Widgets.Message.GotCombobox({ message })),
        live.h,
      ),
  ),
  fromRecipe(
    {
      slug: 'calendar',
      title: 'Calendar',
      summary: 'A month of days to pick from, with its months and years a press away.',
      recipe: 'Calendar',
      file: 'calendar',
      contract: 'CalendarSlots',
    },
    CalendarSlots,
    Recipes.Calendar,
    (style, live) =>
      Snippet.calendar(
        style,
        live.widgets,
        message => live.onWidget(Widgets.Message.GotCalendar({ message })),
        live.h,
      ),
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
  ),
  fixed(
    {
      slug: 'toast',
      title: 'Toast',
      summary: 'A notice in the corner that goes by itself, or when dismissed.',
      recipe: 'Toast',
      file: 'toast',
      contract: 'ToastSlots',
    },
    live =>
      Snippet.toast(
        Snippet.ToastStyle,
        live.widgets.notices,
        {
          onNotify: live.onWidget(Widgets.Message.SavedDraft()),
          toMessage: message => live.onWidget(Widgets.Message.GotNotices({ message })),
        },
        live.h,
      ),
  ),
]

const bySlug = new Map(showcases.map(showcase => [showcase.slug, showcase]))

export const showcaseOf = (slug: string): Option.Option<Showcase> =>
  Option.fromNullishOr(bySlug.get(slug))
