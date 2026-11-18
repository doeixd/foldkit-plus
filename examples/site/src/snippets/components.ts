/**
 * Each shipped component as an application draws it, over the theme module
 * `/create` hands out (`./theme.ts`). A component's page shows its region,
 * and its previews call the function the region defines with the style the
 * reader selected, so the code on the page is the code that drew it.
 */
import { Option, Schema } from 'effect'
import { FieldValidation } from 'foldkit'
import * as FoldkitCommand from 'foldkit/command'
import { modifyFields } from 'foldkit/struct'
import {
  Dialog as UiDialog,
  Disclosure as UiDisclosure,
  HoverIntent as UiHoverIntent,
  Nav as UiNav,
  Listbox as UiListbox,
  Popover as UiPopover,
  RadioGroup as UiRadioGroup,
  Tabs as UiTabs,
} from '@foldkit/ui'
import * as UiCheckbox from '@foldkit/ui/checkbox'
import * as UiFileDrop from '@foldkit/ui/fileDrop'
import * as UiSelect from '@foldkit/ui/select'
import * as UiSwitch from '@foldkit/ui/switch'
import * as UiTooltip from '@foldkit/ui/tooltip'
import type * as UiVirtualList from '@foldkit/ui/virtualList'
import type { AnchorConfig } from '@foldkit/ui/anchor'
import * as UiFieldset from '@foldkit/ui/fieldset'
import type { Html, HtmlBuilder } from 'foldkit/html'
import { Behaviors, SlotView, type NamedStyle } from 'foldkit-mixins'
import { RovingTabindex } from 'foldkit-primitives/interaction'
import { Theme } from 'foldkit-mixins/theme'
import { Utilities } from 'foldkit-mixins/utilities'
import {
  Accordion,
  AccordionSlots,
  AppShell,
  AppShellSlots,
  Disclosure,
  DisclosureSlots,
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
  Meter,
  MeterSlots,
  Nav,
  NavSlots,
  Carousel,
  CarouselSlots,
  TreeView,
  TreeViewSlots,
  ColorPicker,
  ColorPickerSlots,
  InputCopy,
  InputCopySlots,
  PasswordInput,
  PasswordInputSlots,
  type PasswordRequirement,
  Rating,
  RatingSlots,
  VirtualList,
  VirtualListSlots,
  Progress,
  ProgressSlots,
  NumberField,
  NumberFieldSlots,
  OtpField,
  OtpFieldSlots,
  Resizable,
  ResizableSlots,
  ScrollArea,
  ScrollAreaSlots,
  Sidebar,
  SidebarSlots,
  Checkbox,
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
  Listbox,
  ListboxSlots,
  ListboxView,
  Menu,
  MenuSlots,
  Popover,
  PopoverSlots,
  RadioGroup,
  RadioGroupSlots,
  Recipes,
  Select,
  Segmented,
  SegmentedSlots,
  SelectSlots,
  Separator,
  SeparatorSlots,
  Sheet,
  Slider,
  SliderSlots,
  Spinner,
  SpinnerSlots,
  Switch,
  SwitchSlots,
  Table,
  TableSlots,
  Tabs,
  TabsSlots,
  Textarea,
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
  CascadeSelect,
  CascadeSelectSlots,
  FloatingPanel,
  FloatingPanelSlots,
  Tour,
  TourSlots,
  SearchField,
  SearchFieldSlots,
  Picker,
  PickerSlots,
  Toolbar,
  ToolbarSlots,
  type ToolbarControl,
  FileInput,
  FileInputSlots,
  CodeBlock,
  CodeBlockSlots,
  Fieldset,
  FieldsetSlots,
  Icon,
  IconSlots,
  Label,
  LabelSlots,
} from 'foldkit-mixins-ui'

import { icons } from '../view/iconData.js'
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

// #region input-basic
export const InputStyle = forSlots(InputSlots)(Recipes.Input({}))

export const input = (style: NamedStyle<typeof InputSlots>, h: HtmlBuilder<never>): Html =>
  Input.view(
    {
      id: 'email',
      name: 'email',
      type: 'email',
      autocomplete: 'email',
      placeholder: 'ada@example.com',
      described: true,
      style,
      draw: (resolved, h) =>
        h.div(
          [],
          [
            h.label(resolved.label, ['Email']),
            h.input(resolved.input),
            h.span(resolved.description, ['We send the receipt here.']),
          ],
        ),
    },
    h,
  )
// #endregion

// #region input-form
// What a form reads from a field: the `name` it submits under, `required`, what
// the browser may fill in (`autocomplete`), the keyboard a phone offers
// (`inputMode`) and a limit (`maxLength`). A `readOnly` value can be read and
// selected, and is submitted with the rest.
export const inputForm = (style: NamedStyle<typeof InputSlots>, h: HtmlBuilder<never>): Html =>
  h.div(
    [h.Style({ display: 'grid', gap: '0.75rem', inlineSize: 'min(20rem, 100%)' })],
    [
      Input.view(
        {
          id: 'phone',
          name: 'phone',
          type: 'tel',
          autocomplete: 'tel',
          inputMode: 'tel',
          required: true,
          maxLength: 16,
          placeholder: '+1 555 0100',
          style,
          draw: (resolved, h) =>
            h.div([], [h.label(resolved.label, ['Phone']), h.input(resolved.input)]),
        },
        h,
      ),
      Input.view(
        {
          id: 'order',
          name: 'order',
          value: 'ORD-2041',
          readOnly: true,
          style,
          draw: (resolved, h) =>
            h.div([], [h.label(resolved.label, ['Order']), h.input(resolved.input)]),
        },
        h,
      ),
    ],
  )
// #endregion

// #region textarea
export const TextareaStyle = forSlots(TextareaSlots)(Recipes.Textarea({}))

export const textarea = (style: NamedStyle<typeof TextareaSlots>, h: HtmlBuilder<never>): Html =>
  Textarea.view(
    {
      id: 'message',
      rows: 3,
      placeholder: 'What should we know?',
      style,
      draw: (resolved, h) =>
        h.div([], [h.label(resolved.label, ['Message']), h.textarea(resolved.textarea)]),
    },
    h,
  )
// #endregion

/** What a textarea holds, and the Message that writes it. */
export interface Note<Message> {
  readonly value: string
  readonly onType: (value: string) => Message
}

// #region textarea-grow
// `resize: 'auto'` (the default): two lines empty, a line more with each
// line written, and from six lines on it scrolls.
export const textareaGrow = <Message>(
  style: NamedStyle<typeof TextareaSlots>,
  note: Note<Message>,
  h: HtmlBuilder<Message>,
): Html =>
  Textarea.field(
    {
      id: 'notes',
      label: 'Notes',
      field: FieldValidation.NotValidated({ value: note.value }),
      changed: note.onType,
      rows: 2,
      maxRows: 6,
      placeholder: 'Write a line, then another…',
      style,
    },
    h,
  )
// #endregion

// #region textarea-fixed
// Pinned: `Recipes.Textarea({ resize: 'vertical' })`. Four lines whatever
// the text, and the reader drags the corner for more; `resize: 'none'` holds it.
export const textareaFixed = (
  style: NamedStyle<typeof TextareaSlots>,
  h: HtmlBuilder<never>,
): Html =>
  Textarea.view(
    {
      id: 'terms',
      rows: 4,
      value:
        'Terms\n\n1. You keep what you write.\n2. We keep it safe.\n3. Either of us may end this.',
      readOnly: true,
      style,
      draw: (resolved, h) =>
        h.div([], [h.label(resolved.label, ['Terms']), h.textarea(resolved.textarea)]),
    },
    h,
  )
// #endregion

// #region textarea-count
// With a `maxLength` the field counts toward it, in the warning's ink from
// nine tenths and the error's at the limit, and the count describes the field.
export const textareaCount = <Message>(
  style: NamedStyle<typeof TextareaSlots>,
  note: Note<Message>,
  h: HtmlBuilder<Message>,
): Html =>
  Textarea.field(
    {
      id: 'request',
      label: 'Requests for your host',
      field: FieldValidation.NotValidated({ value: note.value }),
      changed: note.onType,
      maxLength: 60,
      style,
    },
    h,
  )
// #endregion

// #region textarea-footer
// A `footer` draws the field as one box, its controls under the text and
// the count at their end; the ring shows while the text has focus.
export const ComposerButtonStyle = forSlots(ButtonSlots)(
  Recipes.Button({ tone: 'neutral', variant: 'ghost', size: 'sm' }),
)
export const SendStyle = forSlots(ButtonSlots)(Recipes.Button({ size: 'sm' }))

export const textareaFooter = <Message>(
  style: NamedStyle<typeof TextareaSlots>,
  note: Note<Message>,
  h: HtmlBuilder<Message>,
): Html =>
  Textarea.field(
    {
      id: 'reply',
      label: 'Reply',
      field: FieldValidation.NotValidated({ value: note.value }),
      changed: note.onType,
      rows: 2,
      maxRows: 8,
      maxLength: 500,
      placeholder: 'Write a reply…',
      footer: [
        Button.view({ label: 'Attach', style: ComposerButtonStyle }, h),
        Button.view({ label: 'Send', disabled: note.value.trim() === '', style: SendStyle }, h),
      ],
      style,
    },
    h,
  )
// #endregion

// #region select-basic
export const SelectStyle = forSlots(SelectSlots)(Recipes.Select({}))

export const selectBasic = (style: NamedStyle<typeof SelectSlots>, h: HtmlBuilder<never>): Html =>
  UiSelect.view(
    {
      id: 'region',
      toView: Select.toView([style.mixin], { h }, resolved =>
        h.div(
          [],
          [
            h.label(resolved.label, ['Region']),
            h.select(
              resolved.select,
              ['Europe', 'Americas', 'Asia Pacific'].map(region => h.option([], [region])),
            ),
          ],
        ),
      ),
    },
    h,
  )
// #endregion

// #region select-placeholder
// A prompt that is chosen until the reader picks a value: an empty, disabled,
// selected option.
export const selectPlaceholder = (
  style: NamedStyle<typeof SelectSlots>,
  h: HtmlBuilder<never>,
): Html =>
  UiSelect.view(
    {
      id: 'region-placeholder',
      toView: Select.toView([style.mixin], { h }, resolved =>
        h.div(
          [],
          [
            h.label(resolved.label, ['Region']),
            h.select(resolved.select, [
              h.option([h.Value(''), h.Disabled(true), h.Selected(true)], ['Choose a region']),
              h.option([], ['Europe']),
              h.option([], ['Americas']),
              h.option([], ['Asia Pacific']),
            ]),
          ],
        ),
      ),
    },
    h,
  )
// #endregion

// #region select-groups
// Options under headings: an `optgroup` per continent, named by its label.
export const selectGroups = (style: NamedStyle<typeof SelectSlots>, h: HtmlBuilder<never>): Html =>
  UiSelect.view(
    {
      id: 'region-groups',
      toView: Select.toView([style.mixin], { h }, resolved =>
        h.div(
          [],
          [
            h.label(resolved.label, ['Region']),
            h.select(resolved.select, [
              h.optgroup(
                [h.Attribute('label', 'Americas')],
                [h.option([], ['United States']), h.option([], ['Canada'])],
              ),
              h.optgroup(
                [h.Attribute('label', 'Europe')],
                [h.option([], ['France']), h.option([], ['Germany'])],
              ),
            ]),
          ],
        ),
      ),
    },
    h,
  )
// #endregion

// #region select-disabled
// An option the reader cannot pick stays in the list, dimmed.
export const selectDisabled = (
  style: NamedStyle<typeof SelectSlots>,
  h: HtmlBuilder<never>,
): Html =>
  UiSelect.view(
    {
      id: 'region-disabled',
      toView: Select.toView([style.mixin], { h }, resolved =>
        h.div(
          [],
          [
            h.label(resolved.label, ['Region']),
            h.select(resolved.select, [
              h.option([], ['Europe']),
              h.option([h.Disabled(true)], ['Antarctica (no shipping)']),
              h.option([], ['Asia Pacific']),
            ]),
          ],
        ),
      ),
    },
    h,
  )
// #endregion

// #region select-invalid
// A refused value: the control draws its error line and names what is wrong.
export const selectInvalid = (style: NamedStyle<typeof SelectSlots>, h: HtmlBuilder<never>): Html =>
  UiSelect.view(
    {
      id: 'region-invalid',
      isInvalid: true,
      hasDescription: true,
      toView: Select.toView([style.mixin], { h }, resolved =>
        h.div(
          [],
          [
            h.label(resolved.label, ['Region']),
            h.select(
              resolved.select,
              ['Europe', 'Americas', 'Asia Pacific'].map(region => h.option([], [region])),
            ),
            h.span(resolved.description, ['Pick a region we ship to.']),
          ],
        ),
      ),
    },
    h,
  )
// #endregion

// #region select-custom
export const SelectMenuStyle = forSlots(ListboxSlots)(Recipes.Listbox({ width: 'trigger' }))

export const Fruit = Schema.Literals(['Apple', 'Banana', 'Cherry', 'Durian'])
export type Fruit = typeof Fruit.Type
export const FruitBox: ReturnType<typeof ListboxView.create<Fruit>> = ListboxView.create<Fruit>()

/** The open list is the component's; the fruit chosen is the Model's. */
export interface FruitState {
  readonly listbox: UiListbox.Model
  readonly fruit: Option.Option<Fruit>
}

/** What the examples below change: a row's parts, which rows are off, and their groups. */
export interface FruitRows {
  readonly option?: (fruit: Fruit) => Listbox.OptionContent
  readonly isDisabled?: (fruit: Fruit) => boolean
  readonly groupOf?: (fruit: Fruit) => string
}

// A select drawn over Listbox: `Listbox.parts` draws each row and the
// trigger's value, or its placeholder, and chevron.
export const selectCustom = <Message>(
  style: NamedStyle<typeof ListboxSlots>,
  state: FruitState,
  toMessage: (message: UiListbox.Message) => Message,
  direction: 'ltr' | 'rtl',
  h: HtmlBuilder<Message>,
  rows: FruitRows = {},
): Html => {
  const part = Listbox.parts([style.mixin], { h })
  const option = rows.option ?? ((fruit: Fruit) => ({ label: fruit }))
  return h.submodel({
    slotId: state.listbox.id,
    model: state.listbox,
    view: FruitBox.view,
    viewInputs: {
      anchor: { placement: 'bottom-start', gap: 4, padding: 8, portal: false },
      direction,
      items: Fruit.literals,
      maybeSelectedValue: state.fruit,
      ...(rows.isDisabled === undefined ? {} : { isItemDisabled: rows.isDisabled }),
      ...(rows.groupOf === undefined
        ? {}
        : {
            itemGroupKey: rows.groupOf,
            groupToHeading: (group: string) => ({ content: h.span([], [group]) }),
          }),
      itemToConfig: (fruit: Fruit) => ({ content: part.option(option(fruit)) }),
      buttonContent: part.trigger(Option.map(state.fruit, option), 'Pick a fruit'),
      toView: Listbox.toView([style.mixin, ...Listbox.fluid], { h }),
    },
    toParentMessage: toMessage,
  })
}
// #endregion

// #region select-custom-icons
const FRUIT_ICONS = new Map<Fruit, string>([
  ['Apple', '🍎'],
  ['Banana', '🍌'],
  ['Cherry', '🍒'],
  ['Durian', '🥭'],
])

// An icon before each label, in the list and on the trigger.
export const selectIcons = <Message>(
  style: NamedStyle<typeof ListboxSlots>,
  state: FruitState,
  toMessage: (message: UiListbox.Message) => Message,
  direction: 'ltr' | 'rtl',
  h: HtmlBuilder<Message>,
): Html =>
  selectCustom(style, state, toMessage, direction, h, {
    option: fruit => ({
      label: fruit,
      icon: h.span([h.AriaHidden(true)], [FRUIT_ICONS.get(fruit) ?? '']),
    }),
  })
// #endregion

// #region select-custom-descriptions
const FRUIT_NOTES = new Map<Fruit, string>([
  ['Apple', 'Crisp, and keeps for weeks'],
  ['Banana', 'Ripens on the counter'],
  ['Cherry', 'Early summer only'],
  ['Durian', 'Strong; ask before opening'],
])

// A line under each label, in the list only: the trigger shows the label.
export const selectDescriptions = <Message>(
  style: NamedStyle<typeof ListboxSlots>,
  state: FruitState,
  toMessage: (message: UiListbox.Message) => Message,
  direction: 'ltr' | 'rtl',
  h: HtmlBuilder<Message>,
): Html =>
  selectCustom(style, state, toMessage, direction, h, {
    option: fruit => ({ label: fruit, description: FRUIT_NOTES.get(fruit) }),
  })
// #endregion

// #region select-custom-groups
// Rows next to each other with one group key stand under its heading.
export const selectCustomGroups = <Message>(
  style: NamedStyle<typeof ListboxSlots>,
  state: FruitState,
  toMessage: (message: UiListbox.Message) => Message,
  direction: 'ltr' | 'rtl',
  h: HtmlBuilder<Message>,
): Html =>
  selectCustom(style, state, toMessage, direction, h, {
    groupOf: fruit => (fruit === 'Apple' || fruit === 'Banana' ? 'Every day' : 'In season'),
  })
// #endregion

// #region select-custom-placeholder
// Nothing chosen yet: the trigger shows `selectCustom`'s placeholder, muted.
export const selectPrompt = <Message>(
  style: NamedStyle<typeof ListboxSlots>,
  state: FruitState,
  toMessage: (message: UiListbox.Message) => Message,
  direction: 'ltr' | 'rtl',
  h: HtmlBuilder<Message>,
): Html => selectCustom(style, state, toMessage, direction, h)
// #endregion

// #region select-custom-disabled
// A row that shows but cannot be chosen, saying why.
export const selectDisabledOption = <Message>(
  style: NamedStyle<typeof ListboxSlots>,
  state: FruitState,
  toMessage: (message: UiListbox.Message) => Message,
  direction: 'ltr' | 'rtl',
  h: HtmlBuilder<Message>,
): Html =>
  selectCustom(style, state, toMessage, direction, h, {
    option: fruit => ({
      label: fruit,
      description: fruit === 'Durian' ? 'Out of season' : undefined,
    }),
    isDisabled: fruit => fruit === 'Durian',
  })
// #endregion

// #region select-custom-check-start
// The chosen row's check before its label, as macOS draws it.
export const SelectCheckStartStyle = forSlots(ListboxSlots)(
  Recipes.Listbox({ width: 'trigger', check: 'start' }),
)
// #endregion

// #region select-custom-trigger-filled
// A trigger filled like a field, with no outline.
export const SelectFilledStyle = forSlots(ListboxSlots)(
  Recipes.Listbox({ width: 'trigger', trigger: 'filled' }),
)
// #endregion

// #region select-custom-trigger-ghost
// A trigger with no fill until hovered, for a toolbar.
export const SelectGhostStyle = forSlots(ListboxSlots)(
  Recipes.Listbox({ width: 'trigger', trigger: 'ghost' }),
)
// #endregion

// #region select-custom-sizes
export const SelectSizes = (['sm', 'md', 'lg'] as const).map(size => ({
  size,
  style: forSlots(ListboxSlots)(Recipes.Listbox({ width: 'trigger', size })),
}))

// The trigger and the rows it opens step together.
export const selectSizes = <Message>(
  states: Readonly<Record<'sm' | 'md' | 'lg', FruitState>>,
  toMessage: (size: 'sm' | 'md' | 'lg', message: UiListbox.Message) => Message,
  direction: 'ltr' | 'rtl',
  h: HtmlBuilder<Message>,
): Html =>
  h.div(
    [h.Style({ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '1rem' })],
    SelectSizes.map(({ size, style }) =>
      selectCustom(style, states[size], message => toMessage(size, message), direction, h),
    ),
  )
// #endregion

// #region checkbox-basic
export const CheckboxStyle = forSlots(CheckboxSlots)(Recipes.Checkbox({}))

export const checkbox = <Message>(
  style: NamedStyle<typeof CheckboxSlots>,
  checked: boolean,
  onToggle: (checked: boolean) => Message,
  h: HtmlBuilder<Message>,
): Html =>
  UiCheckbox.view(
    {
      id: 'terms',
      isChecked: checked,
      onToggle,
      toView: Checkbox.toView([style.mixin], { h }, resolved =>
        h.div(
          [h.Style({ display: 'flex', alignItems: 'center', gap: '0.5rem' })],
          [h.button(resolved.checkbox, []), h.label(resolved.label, ['Accept the terms'])],
        ),
      ),
    },
    h,
  )
// #endregion

// #region checkbox-indeterminate
/** How many of the toppings are chosen: the box is a dash while only some are. */
export const Toppings = Schema.Literals(['none', 'some', 'all'])
export type Toppings = typeof Toppings.Type

export const checkboxIndeterminate = <Message>(
  style: NamedStyle<typeof CheckboxSlots>,
  toppings: Toppings,
  onToggle: (checked: boolean) => Message,
  h: HtmlBuilder<Message>,
): Html =>
  UiCheckbox.view(
    {
      id: 'toppings',
      isChecked: toppings === 'all',
      isIndeterminate: toppings === 'some',
      onToggle,
      toView: Checkbox.toView([style.mixin], { h }, resolved =>
        h.div(
          [h.Style({ display: 'flex', alignItems: 'center', gap: '0.5rem' })],
          [h.button(resolved.checkbox, []), h.label(resolved.label, ['Toppings'])],
        ),
      ),
    },
    h,
  )
// #endregion

// #region checkbox-card
// The card is the label and the box sits in it, so a press anywhere on the
// card toggles the box. The label slot is not used: it carries its own click,
// and a second one inside the label would turn the box off again. The card's
// label takes the label's id instead, so the box is named by the card's words.
const CheckboxCardStyle = forSlots(CardSlots)(
  Recipes.Card({ surface: 'outlined', padding: 'compact' }),
)

export const checkboxCard = <Message>(
  style: NamedStyle<typeof CheckboxSlots>,
  checked: boolean,
  onToggle: (checked: boolean) => Message,
  h: HtmlBuilder<Message>,
): Html =>
  UiCheckbox.view(
    {
      id: 'plan-team',
      isChecked: checked,
      onToggle,
      toView: Checkbox.toView([style.mixin], { h }, resolved =>
        h.label(
          [
            h.Id(UiCheckbox.labelId('plan-team')),
            h.Style({ display: 'block', maxInlineSize: '20rem', cursor: 'pointer' }),
          ],
          [
            Card.view(
              {
                title: 'Team',
                description: 'Ten editors and every page.',
                selected: checked,
                action: h.button(resolved.checkbox, []),
                style: CheckboxCardStyle,
              },
              h,
            ),
          ],
        ),
      ),
    },
    h,
  )
// #endregion

// #region switch
export const SwitchStyle = forSlots(SwitchSlots)(Recipes.Switch({}))

export const toggle = <Message>(
  style: NamedStyle<typeof SwitchSlots>,
  on: boolean,
  onToggle: (on: boolean) => Message,
  h: HtmlBuilder<Message>,
): Html =>
  UiSwitch.view(
    {
      id: 'airplane',
      isChecked: on,
      onToggle,
      toView: Switch.toView([style.mixin], { h }, resolved =>
        h.div(
          [h.Style({ display: 'flex', alignItems: 'center', gap: '0.5rem' })],
          [h.button(resolved.button, []), h.label(resolved.label, ['Airplane mode'])],
        ),
      ),
    },
    h,
  )
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

// #region separator-basic
export const SeparatorStyle = forSlots(SeparatorSlots)(Recipes.Separator({}))

// One style draws both: across, between sections; stood up, between links in
// a row, where it stretches to the row's height.
export const separator = (style: NamedStyle<typeof SeparatorSlots>, h: HtmlBuilder<never>): Html =>
  h.div(
    [h.Style({ display: 'grid', gap: '0.75rem', inlineSize: 'min(100%, 22rem)' })],
    [
      h.div(
        [],
        [
          h.p([h.Style({ fontWeight: '600' })], ['Foldkit Plus']),
          h.p([], ['Packages for Foldkit applications.']),
        ],
      ),
      Separator.view({ style }, h),
      h.div(
        [h.Style({ display: 'flex', alignItems: 'center', gap: '0.75rem' })],
        [
          h.a([h.Href('#')], ['Blog']),
          Separator.view({ orientation: 'vertical', style }, h),
          h.a([h.Href('#')], ['Docs']),
          Separator.view({ orientation: 'vertical', style }, h),
          h.a([h.Href('#')], ['Source']),
        ],
      ),
    ],
  )
// #endregion

// #region separator-label
// Words in the middle of the rule, read as text; the rules either side are drawing.
export const separatorLabel = (
  style: NamedStyle<typeof SeparatorSlots>,
  h: HtmlBuilder<never>,
): Html =>
  h.div(
    [h.Style({ display: 'grid', gap: '1rem', inlineSize: 'min(100%, 20rem)' })],
    [
      Button.view({ label: 'Continue with a passkey', style: ButtonStyle }, h),
      Separator.view({ label: 'or', style }, h),
      Button.view({ label: 'Continue with email', style: ButtonStyle }, h),
    ],
  )
// #endregion

// #region separator-vertical
export const ToolbarButtonStyle = forSlots(ButtonSlots)(
  Recipes.Button({ tone: 'neutral', variant: 'icon', size: 'sm' }),
)

// Pinned: `Recipes.Separator({ spacing: 'sm', inset: 'sm' })`. Between groups
// of a toolbar's buttons, the rule stops short of the row's height.
export const separatorVertical = (
  style: NamedStyle<typeof SeparatorSlots>,
  h: HtmlBuilder<never>,
): Html => {
  const tool = (label: string, d: string) =>
    Button.view({ label, icon: outline(h, d), style: ToolbarButtonStyle }, h)
  return h.div(
    [
      h.Role('group'),
      h.AriaLabel('Formatting'),
      h.Style({ display: 'flex', alignItems: 'center', gap: '0.25rem' }),
    ],
    [
      tool('Bold', 'M4.5 2.5h4.25a2.75 2.75 0 0 1 0 5.5H4.5zM4.5 8h5a2.75 2.75 0 0 1 0 5.5h-5z'),
      tool('Italic', 'M7 2.5h5M4 13.5h5M10 2.5l-4 11'),
      Separator.view({ orientation: 'vertical', style }, h),
      tool('Align left', 'M2.5 4h11M2.5 8h7M2.5 12h9'),
      tool('Align center', 'M2.5 4h11M4.5 8h7M3.5 12h9'),
      Separator.view({ orientation: 'vertical', style }, h),
      tool(
        'Link',
        'M7 9a3 3 0 0 0 4.24 0l2-2a3 3 0 0 0-4.24-4.24l-.75.75M9 7a3 3 0 0 0-4.24 0l-2 2a3 3 0 0 0 4.24 4.24l.75-.75',
      ),
    ],
  )
}
// #endregion

// #region separator-dashed
// Pinned: `Recipes.Separator({ line: 'dashed', thickness: 'thick', spacing: 'md' })`.
// Dashed and thick, with room above and below, above a receipt's total.
export const separatorDashed = (
  style: NamedStyle<typeof SeparatorSlots>,
  h: HtmlBuilder<never>,
): Html => {
  const line = (label: string, amount: string) =>
    h.div(
      [h.Style({ display: 'flex', justifyContent: 'space-between' })],
      [h.span([], [label]), h.span([], [amount])],
    )
  return h.div(
    [h.Style({ inlineSize: 'min(100%, 16rem)' })],
    [
      line('Subtotal', '$40.00'),
      line('Shipping', '$5.00'),
      Separator.view({ style }, h),
      line('Total', '$45.00'),
    ],
  )
}
// #endregion

// #region spinner-basic
export const SpinnerStyle = forSlots(SpinnerSlots)(Recipes.Spinner({}))

export const spinner = (style: NamedStyle<typeof SpinnerSlots>, h: HtmlBuilder<never>): Html =>
  Spinner.view({ label: 'Saving', style }, h)
// #endregion

// #region spinner-kinds
export const SpinnerKinds = (['ring', 'dots', 'bars', 'pulse', 'orbit'] as const).map(kind =>
  forSlots(SpinnerSlots)(Recipes.Spinner({ kind })),
)

// Five ways to say "still working", each still under reduced motion.
export const spinnerKinds = (h: HtmlBuilder<never>): Html =>
  h.div(
    [h.Style({ display: 'flex', alignItems: 'center', gap: '1.5rem' })],
    SpinnerKinds.map(style => Spinner.view({ label: 'Loading', style }, h)),
  )
// #endregion

// #region spinner-label
// The label shown beside the wheel is the status's words.
export const spinnerLabel = (style: NamedStyle<typeof SpinnerSlots>, h: HtmlBuilder<never>): Html =>
  Spinner.view({ label: 'Saving your changes', showLabel: true, style }, h)
// #endregion

// #region spinner-sizes
export const SpinnerSizes = (['sm', 'md', 'lg'] as const).map(size =>
  forSlots(SpinnerSlots)(Recipes.Spinner({ size, tone: 'current' })),
)

// Three sizes in the ink of the text around them, as inside a button or a badge.
export const spinnerSizes = (h: HtmlBuilder<never>): Html =>
  h.div(
    [h.Style({ display: 'flex', alignItems: 'center', gap: '1rem' })],
    SpinnerSizes.map(style => Spinner.view({ label: 'Loading', style }, h)),
  )
// #endregion

// #region table-basic
export const TableStyle = forSlots(TableSlots)(Recipes.Table({}))

interface Invoice {
  readonly id: string
  readonly status: string
  readonly amount: number
}

export const table = (style: NamedStyle<typeof TableSlots>, h: HtmlBuilder<never>): Html =>
  Table.view<Invoice>(
    {
      caption: 'Recent invoices',
      columns: [
        // The row's heading (`th scope="row"`): a screen reader names the row by it.
        { header: 'Invoice', rowHeader: true, value: row => row.id },
        // A cell is text or markup: a Badge, styled as on the Badge page.
        {
          header: 'Status',
          value: row =>
            Badge.view(
              {
                text: row.status,
                tone: row.status === 'Paid' ? 'live' : 'review',
                style: BadgeStyle,
              },
              h,
            ),
        },
        { header: 'Amount', numeric: true, value: row => `$${row.amount.toFixed(2)}` },
      ],
      rows: [
        { id: 'INV-001', status: 'Paid', amount: 250 },
        { id: 'INV-002', status: 'Pending', amount: 150 },
        { id: 'INV-003', status: 'Paid', amount: 350 },
      ],
      style,
      // One highlight behind the rows, following the pointer.
      fluid: true,
    },
    h,
  )
// #endregion

// #region table-sortable
const invoices: ReadonlyArray<Invoice> = [
  { id: 'INV-001', status: 'Paid', amount: 250 },
  { id: 'INV-002', status: 'Pending', amount: 150 },
  { id: 'INV-003', status: 'Paid', amount: 350 },
  { id: 'INV-004', status: 'Overdue', amount: 450 },
]

const invoiceColumns = [
  { header: 'Invoice', sortKey: 'id', value: (row: Invoice) => row.id },
  { header: 'Status', sortKey: 'status', value: (row: Invoice) => row.status },
  {
    header: 'Amount',
    sortKey: 'amount',
    numeric: true,
    value: (row: Invoice) => `$${row.amount.toFixed(2)}`,
  },
]

const invoiceOrder: ReadonlyMap<string, (a: Invoice, b: Invoice) => number> = new Map([
  ['id', (a: Invoice, b: Invoice) => a.id.localeCompare(b.id)],
  ['status', (a: Invoice, b: Invoice) => a.status.localeCompare(b.status)],
  ['amount', (a: Invoice, b: Invoice) => a.amount - b.amount],
])

/** The rows in the sort's order: the application sorts, the table draws. */
const sortedInvoices = (sort: Option.Option<Table.TableSort>): ReadonlyArray<Invoice> =>
  Option.match(
    Option.flatMap(sort, ({ column, direction }) =>
      Option.map(Option.fromUndefinedOr(invoiceOrder.get(column)), compare => ({
        compare,
        sign: direction === 'ascending' ? 1 : -1,
      })),
    ),
    {
      onNone: () => invoices,
      onSome: ({ compare, sign }) => [...invoices].sort((a, b) => sign * compare(a, b)),
    },
  )

export const tableSortable = <Message>(
  style: NamedStyle<typeof TableSlots>,
  sort: Option.Option<Table.TableSort>,
  // In update: `sort: () => Table.nextSort(model.sort, column)`.
  onSort: (column: string) => Message,
  h: HtmlBuilder<Message>,
): Html =>
  Table.view<Invoice, Message>(
    {
      caption: 'Recent invoices',
      columns: invoiceColumns,
      rows: sortedInvoices(sort),
      rowKey: row => row.id,
      sort: { by: sort, onSort },
      style,
      fluid: true,
    },
    h,
  )
// #endregion

// #region table-selection

export const tableSelection = <Message>(
  style: NamedStyle<typeof TableSlots>,
  chosen: ReadonlyArray<string>,
  onToggle: (id: string, selected: boolean) => Message,
  onToggleAll: (ids: ReadonlyArray<string>) => Message,
  h: HtmlBuilder<Message>,
): Html =>
  Table.view<Invoice, Message>(
    {
      columns: invoiceColumns,
      rows: invoices,
      rowKey: row => row.id,
      selection: {
        id: 'invoices-chosen',
        isSelected: row => chosen.includes(row.id),
        onToggle: (row, selected) => onToggle(row.id, selected),
        onToggleAll: all => onToggleAll(all ? invoices.map(row => row.id) : []),
        rowLabel: row => `Select ${row.id}`,
        checkbox: CheckboxStyle,
      },
      style,
      fluid: true,
    },
    h,
  )
// #endregion

// #region table-expandable
export const tableExpandable = <Message>(
  style: NamedStyle<typeof TableSlots>,
  open: ReadonlyArray<string>,
  onToggle: (id: string, expanded: boolean) => Message,
  h: HtmlBuilder<Message>,
): Html =>
  Table.view<Invoice, Message>(
    {
      columns: invoiceColumns,
      rows: invoices,
      rowKey: row => row.id,
      expansion: {
        id: 'invoices-open',
        isExpanded: row => open.includes(row.id),
        onToggle: (row, expanded) => onToggle(row.id, expanded),
        detail: row =>
          h.p([], [`${row.id} was sent on the 1st and is ${row.status.toLowerCase()}.`]),
        label: row => `Details of ${row.id}`,
      },
      style,
      fluid: true,
    },
    h,
  )
// #endregion

// #region table-empty
const TableEmptyStyle = forSlots(EmptySlots)(Recipes.Empty({ size: 'compact' }))

export const tableEmpty = (style: NamedStyle<typeof TableSlots>, h: HtmlBuilder<never>): Html =>
  Table.view<Invoice>(
    {
      columns: invoiceColumns,
      rows: [],
      empty: Empty.view(
        {
          title: 'No invoices yet',
          description: 'Invoices you send show up here.',
          style: TableEmptyStyle,
        },
        h,
      ),
      style,
    },
    h,
  )
// #endregion

// #region table-sticky
const manyInvoices: ReadonlyArray<Invoice> = Array.from({ length: 20 }, (_, index) => ({
  id: `INV-${String(index + 1).padStart(3, '0')}`,
  status: index % 3 === 0 ? 'Pending' : 'Paid',
  amount: 100 + index * 25,
}))

// Pinned: `Recipes.Table({ header: 'sticky', rows: 'striped', density: 'compact' })`.
export const tableSticky = (style: NamedStyle<typeof TableSlots>, h: HtmlBuilder<never>): Html =>
  h.div(
    [h.Style({ maxBlockSize: '16rem', overflow: 'auto' })],
    [Table.view<Invoice>({ columns: invoiceColumns, rows: manyInvoices, style }, h)],
  )
// #endregion

// #region tabs-underline
export const TabsStyle = forSlots(TabsSlots)(Recipes.Tabs({}))

export const Section = Schema.Literals(['overview', 'activity', 'settings'])
export type Section = typeof Section.Type
// Annotated: the inferred type names a foldkit internal module.
export const SectionTabs: ReturnType<typeof UiTabs.create<Section>> = UiTabs.create<Section>()

const sections: Record<Section, { readonly label: string; readonly text: string }> = {
  overview: { label: 'Overview', text: 'Six people, three open milestones, one launch.' },
  activity: { label: 'Activity', text: 'Ada published the pricing page an hour ago.' },
  settings: { label: 'Settings', text: 'Who can see the project, and who can edit it.' },
}

/** The tabs' focus is the component's; which tab shows is the Model's. */
export interface TabsState {
  readonly tabs: UiTabs.Model
  readonly section: Section
}

export const tabs = <Message>(
  style: NamedStyle<typeof TabsSlots>,
  state: TabsState,
  toMessage: (message: UiTabs.Message) => Message,
  h: HtmlBuilder<Message>,
): Html =>
  h.submodel({
    slotId: state.tabs.id,
    model: state.tabs,
    view: SectionTabs.view,
    viewInputs: {
      tabs: Section.literals,
      selectedValue: state.section,
      ariaLabel: 'Project',
      toView: Tabs.toView<Section, Message>(
        // Arrow keys follow the page's direction: ArrowLeft is the next tab right to left.
        [style.mixin, ...Tabs.fluid, Tabs.readingKeys],
        { h },
        ({ tablist, indicator, highlight, label, tabs, activeIndex }) =>
          h.div(
            [],
            [
              h.div(tablist, [
                h.div(indicator),
                h.div(highlight),
                // The words in `label`, which keeps their trim in the tab's flex row.
                ...tabs.map(tab => h.button(tab.tab, [h.span(label, [sections[tab.value].label])])),
              ]),
              ...tabs
                .filter(tab => tab.index === activeIndex)
                .map(tab => h.div(tab.panel, [h.p([], [sections[tab.value].text])])),
            ],
          ),
      ),
    },
    toParentMessage: toMessage,
  })
// #endregion

// #region tabs-pill
// The chosen tab on a pill that glides, drawn by `tabs`.
export const TabsPillStyle = forSlots(TabsSlots)(Recipes.Tabs({ variant: 'pill' }))
// #endregion

// #region tabs-icons
// An icon before each tab's words and a Badge count after them; the words sit in `label`.
export const Inbox = Schema.Literals(['inbox', 'drafts', 'sent'])
export type Inbox = typeof Inbox.Type
export const InboxTabs: ReturnType<typeof UiTabs.create<Inbox>> = UiTabs.create<Inbox>()

const folders: Record<
  Inbox,
  { readonly label: string; readonly icon: string; readonly count?: string }
> = {
  inbox: { label: 'Inbox', icon: 'M2 9h3l1 2h4l1-2h3M2 9l2-6h8l2 6v4H2z', count: '12' },
  drafts: { label: 'Drafts', icon: 'M3 13l1-4 7-7 3 3-7 7z', count: '3' },
  sent: { label: 'Sent', icon: 'M2 8l12-5-5 12-2-5z' },
}

export interface InboxState {
  readonly tabs: UiTabs.Model
  readonly folder: Inbox
}

export const tabsIcons = <Message>(
  style: NamedStyle<typeof TabsSlots>,
  state: InboxState,
  toMessage: (message: UiTabs.Message) => Message,
  h: HtmlBuilder<Message>,
): Html =>
  h.submodel({
    slotId: state.tabs.id,
    model: state.tabs,
    view: InboxTabs.view,
    viewInputs: {
      tabs: Inbox.literals,
      selectedValue: state.folder,
      ariaLabel: 'Mail',
      toView: Tabs.toView<Inbox, Message>(
        [style.mixin, ...Tabs.fluid],
        { h },
        ({ tablist, indicator, highlight, label, icon, tabs }) =>
          h.div(tablist, [
            h.div(indicator),
            h.div(highlight),
            ...tabs.map(tab => {
              const folder = folders[tab.value]
              return h.button(tab.tab, [
                h.span(icon, [outline(h, folder.icon)]),
                h.span(label, [folder.label]),
                ...(folder.count === undefined
                  ? []
                  : [Badge.view({ text: folder.count, style: BadgeStyle }, h)]),
              ])
            }),
          ]),
      ),
    },
    toParentMessage: toMessage,
  })
// #endregion

// #region tabs-vertical
// Upright: the arrows go up and down, and the underline stands at the tabs' inline end.
export const tabsVertical = <Message>(
  style: NamedStyle<typeof TabsSlots>,
  state: InboxState,
  toMessage: (message: UiTabs.Message) => Message,
  h: HtmlBuilder<Message>,
): Html =>
  h.submodel({
    slotId: state.tabs.id,
    model: state.tabs,
    view: InboxTabs.view,
    viewInputs: {
      tabs: Inbox.literals,
      selectedValue: state.folder,
      ariaLabel: 'Mail',
      orientation: 'Vertical',
      toView: Tabs.toView<Inbox, Message>(
        [style.mixin, ...Tabs.fluid],
        { h },
        ({ tablist, indicator, highlight, label, tabs, activeIndex }) =>
          h.div(
            [h.Style({ display: 'flex', gap: '1.5rem' })],
            [
              h.div(tablist, [
                h.div(indicator),
                h.div(highlight),
                ...tabs.map(tab => h.button(tab.tab, [h.span(label, [folders[tab.value].label])])),
              ]),
              ...tabs
                .filter(tab => tab.index === activeIndex)
                .map(tab => h.div(tab.panel, [`${folders[tab.value].label} is empty.`])),
            ],
          ),
      ),
    },
    toParentMessage: toMessage,
  })
// #endregion

// #region tabs-closable
// Each tab closes with its cross or Delete; Tabs.closing says what is left and what takes focus.
export const OpenFiles = Schema.Struct({
  tabs: UiTabs.Model,
  files: Schema.Array(Schema.String),
  chosen: Schema.String,
})
export type OpenFiles = typeof OpenFiles.Type
export const FileTabs: ReturnType<typeof UiTabs.create<string>> = UiTabs.create<string>()

/** Answers a tab's `onClose`: the file goes, and the tab after it takes focus. */
export const closeFile = <Message>(
  state: OpenFiles,
  file: string,
  toMessage: (message: UiTabs.Message) => Message,
): {
  readonly state: OpenFiles
  readonly commands: ReadonlyArray<FoldkitCommand.Command<Message>>
} => {
  const after = Tabs.closing(state.files, state.chosen, file)
  return {
    state: modifyFields(state, {
      files: () => after.tabs,
      chosen: chosen => Option.getOrElse(after.selected, () => chosen),
    }),
    commands: FoldkitCommand.mapMessages(
      Option.toArray(
        Option.map(after.focus, index => UiTabs.FocusTab({ id: state.tabs.id, index })),
      ),
      toMessage,
    ),
  }
}

export const tabsClosable = <Message>(
  style: NamedStyle<typeof TabsSlots>,
  state: OpenFiles,
  messages: {
    readonly toMessage: (message: UiTabs.Message) => Message
    readonly onClose: (file: string) => Message
  },
  h: HtmlBuilder<Message>,
): Html =>
  h.submodel({
    slotId: state.tabs.id,
    model: state.tabs,
    view: FileTabs.view,
    viewInputs: {
      tabs: state.files,
      selectedValue: state.chosen,
      ariaLabel: 'Open files',
      toView: Tabs.toView<string, Message>(
        [style.mixin, ...Tabs.fluid],
        { h, close: { onClose: messages.onClose } },
        ({ tablist, indicator, highlight, label, tabs }) =>
          h.div(tablist, [
            h.div(indicator),
            h.div(highlight),
            ...tabs.map(tab =>
              h.div(tab.item, [
                h.button(tab.tab, [h.span(label, [tab.value])]),
                ...Option.match(tab.close, {
                  onNone: () => [],
                  onSome: close => [h.button(close, [])],
                }),
              ]),
            ),
          ]),
      ),
    },
    toParentMessage: messages.toMessage,
  })
// #endregion

// #region tabs-scrolling
export const TabsScrollStyle = forSlots(TabsSlots)(Recipes.Tabs({ overflow: 'scroll' }))

// More tabs than fit: one line that scrolls, its edges fading where more lies
// past, and focus scrolling a tab into view. The closable files in a narrow box.
export const tabsScrolling = <Message>(
  style: NamedStyle<typeof TabsSlots>,
  state: OpenFiles,
  messages: {
    readonly toMessage: (message: UiTabs.Message) => Message
    readonly onClose: (file: string) => Message
  },
  h: HtmlBuilder<Message>,
): Html =>
  h.div([h.Style({ inlineSize: 'min(20rem, 100%)' })], [tabsClosable(style, state, messages, h)])
// #endregion

export const RadioGroupStyle = forSlots(RadioGroupSlots)(Recipes.RadioGroup({}))

export const Billing = Schema.Literals(['monthly', 'yearly', 'lifetime'])
export type Billing = typeof Billing.Type
export const BillingGroup: ReturnType<typeof UiRadioGroup.create<Billing>> =
  UiRadioGroup.create<Billing>()

const billings: Record<Billing, { readonly label: string; readonly text: string }> = {
  monthly: { label: 'Monthly', text: '$12 a month, cancel any time.' },
  yearly: { label: 'Yearly', text: '$120 a year, two months free.' },
  lifetime: { label: 'Lifetime', text: '$400 once.' },
}

/** The group's focus is the component's; the choice is the Model's. */
export interface RadioGroupState {
  readonly group: UiRadioGroup.Model
  readonly billing: Billing
}

// #region radio-group-descriptions
export const radioGroup = <Message>(
  style: NamedStyle<typeof RadioGroupSlots>,
  state: RadioGroupState,
  toMessage: (message: UiRadioGroup.Message) => Message,
  h: HtmlBuilder<Message>,
  orientation: 'Vertical' | 'Horizontal' = 'Vertical',
): Html =>
  h.submodel({
    slotId: state.group.id,
    model: state.group,
    view: BillingGroup.view,
    viewInputs: {
      selectedValue: Option.some(state.billing),
      options: Billing.literals,
      ariaLabel: 'Billing',
      orientation,
      hasOptionDescription: () => true,
      toView: RadioGroup.toView<Billing, Message>(
        [style.mixin, RadioGroup.readingKeys],
        { h },
        ({ group, options }) =>
          h.div(
            group,
            // A row is a `label` around its radio, so a press on the words
            // presses the radio. The label bundle is only the name's id; the
            // row is the `card` slot, which the card variant frames.
            options.map(option =>
              h.label(
                [...option.card, h.Style({ display: 'flex', gap: '0.5rem', alignItems: 'start' })],
                [
                  h.button(option.option, []),
                  h.span(
                    [h.Style({ display: 'grid' })],
                    [
                      h.span(option.label, [billings[option.value].label]),
                      h.span(option.description, [billings[option.value].text]),
                    ],
                  ),
                ],
              ),
            ),
          ),
      ),
    },
    toParentMessage: toMessage,
  })
// #endregion

// #region radio-group-horizontal
export const radioGroupHorizontal = <Message>(
  style: NamedStyle<typeof RadioGroupSlots>,
  state: RadioGroupState,
  toMessage: (message: UiRadioGroup.Message) => Message,
  h: HtmlBuilder<Message>,
): Html => radioGroup(style, state, toMessage, h, 'Horizontal')
// #endregion

// #region radio-group-cards
// The group above, `radioGroup`, in the recipe's card variant: each option's
// label is framed, and the checked one filled. Only the style changes.
export const RadioGroupCardStyle = forSlots(RadioGroupSlots)(
  Recipes.RadioGroup({ variant: 'card' }),
)
// #endregion

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
          thumbLabels: { low: 'Minimum price', high: 'Maximum price' },
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
      thumbLabels: { low: 'Minimum budget', high: 'Maximum budget' },
      style,
    },
    h,
  )
// #endregion

// #region dialog-confirm
export const DialogStyle = forSlots(DialogSlots)(Recipes.Dialog({}))
const DangerStyle = forSlots(ButtonSlots)(Recipes.Button({ tone: 'danger' }))
const QuietStyle = forSlots(ButtonSlots)(Recipes.Button({ tone: 'neutral', variant: 'ghost' }))

/** The Messages that open and close the dialog, and the one that wraps its own. */
export interface DialogMessages<Message> {
  readonly onOpen: Message
  readonly onClose: Message
  readonly toMessage: (message: UiDialog.Message) => Message
}

/** One dialog of the page: its role and what it says. */
interface Question<Message> {
  readonly style: NamedStyle<typeof DialogSlots>
  readonly model: UiDialog.Model
  readonly messages: DialogMessages<Message>
  readonly role: 'dialog' | 'alertdialog'
  readonly opener: string
  readonly title: string
  readonly body: string
  readonly answer: string
}

/**
 * A dialog that asks before something that cannot be undone. As an alert
 * dialog it draws no close button, and its application drops
 * `Dialog.isDismissal` Messages, so only Cancel or the answer closes it.
 */
const ask = <Message>(question: Question<Message>, h: HtmlBuilder<Message>): Html => {
  const { style, model, messages, role } = question
  return h.div(
    [],
    [
      Button.view({ label: question.opener, onClick: messages.onOpen, style: DangerStyle }, h),
      h.submodel({
        slotId: model.id,
        model,
        view: UiDialog.view,
        viewInputs: {
          hasDescription: true,
          toView: Dialog.toView([style.mixin], { h, role }, dialog =>
            h.dialog(
              dialog.dialog,
              dialog.isVisible
                ? [
                    h.div(dialog.backdrop),
                    h.div(dialog.panel, [
                      ...(role === 'dialog' ? [h.button(dialog.closeButton, ['✕'])] : []),
                      h.h2(dialog.title, [question.title]),
                      h.p(dialog.description, [question.body]),
                      h.div(
                        [h.Style({ display: 'flex', gap: '0.5rem', justifyContent: 'end' })],
                        [
                          // An alert opens on the answer that loses nothing.
                          Button.view(
                            {
                              label: 'Cancel',
                              onClick: messages.onClose,
                              style: QuietStyle,
                              ...(role === 'alertdialog'
                                ? { attributes: { button: dialog.initialFocus } }
                                : {}),
                            },
                            h,
                          ),
                          Button.view(
                            {
                              label: question.answer,
                              onClick: messages.onClose,
                              style: DangerStyle,
                            },
                            h,
                          ),
                        ],
                      ),
                    ]),
                  ]
                : [],
            ),
          ),
        },
        toParentMessage: messages.toMessage,
      }),
    ],
  )
}

/** A dialog that Escape dismisses, and an alert dialog that waits for an answer. */
export const dialog = <Message>(
  style: NamedStyle<typeof DialogSlots>,
  models: { readonly dialog: UiDialog.Model; readonly alert: UiDialog.Model },
  messages: { readonly dialog: DialogMessages<Message>; readonly alert: DialogMessages<Message> },
  h: HtmlBuilder<Message>,
): Html =>
  h.div(
    [h.Style({ display: 'flex', flexWrap: 'wrap', gap: '0.75rem' })],
    [
      ask(
        {
          style,
          model: models.dialog,
          messages: messages.dialog,
          role: 'dialog',
          opener: 'Delete project',
          title: 'Delete this project?',
          body: 'Its pages and their history go for good. Escape keeps it.',
          answer: 'Delete',
        },
        h,
      ),
      ask(
        {
          style,
          model: models.alert,
          messages: messages.alert,
          role: 'alertdialog',
          opener: 'Remove member',
          title: 'Remove Ada from the team?',
          body: 'She loses access to every project at once. Only an answer closes this.',
          answer: 'Remove',
        },
        h,
      ),
    ],
  )
// #endregion

// #region dialog-terms
const TERMS = [
  'You keep the rights to what you make here. We keep a copy only to show it to the people you share it with.',
  'We delete a closed account’s pages after thirty days, unless the law asks us to keep them longer.',
  'We do not sell what we learn about you, and we tell you before a change to these terms takes effect.',
  'A page you publish is public: anyone with its link can read it, and search engines may list it.',
  'You may not use the service to break the law, or to send what no one asked for.',
  'Either of us may end this agreement with notice; what you made stays yours to download for thirty days.',
]

// A body longer than the screen scrolls under the heading, its own bar
// drawn by `Dialog.overlayBars`, while the footer's answers stay in view.
export const dialogTerms = <Message>(
  style: NamedStyle<typeof DialogSlots>,
  model: UiDialog.Model,
  messages: DialogMessages<Message>,
  h: HtmlBuilder<Message>,
): Html =>
  h.div(
    [],
    [
      Button.view({ label: 'Read the terms', onClick: messages.onOpen, style: GroupedStyle }, h),
      h.submodel({
        slotId: model.id,
        model,
        view: UiDialog.view,
        viewInputs: {
          toView: Dialog.toView([style.mixin, ...Dialog.overlayBars], { h }, dialog =>
            h.dialog(
              dialog.dialog,
              dialog.isVisible
                ? [
                    h.div(dialog.backdrop),
                    h.div(dialog.panel, [
                      h.h2(dialog.title, ['Terms of service']),
                      h.div(dialog.body, [
                        h.div(
                          dialog.scroll,
                          // The reset zeroes a paragraph's margins: each term keeps a line between.
                          [...TERMS, ...TERMS].map(term =>
                            h.p([h.Style({ marginBlock: '0 0.75rem' })], [term]),
                          ),
                        ),
                        h.div(dialog.scrollBar, [h.div(dialog.scrollThumb)]),
                      ]),
                      h.div(dialog.footer, [
                        Button.view(
                          { label: 'Cancel', onClick: messages.onClose, style: QuietStyle },
                          h,
                        ),
                        Button.view(
                          { label: 'Accept', onClick: messages.onClose, style: ButtonStyle },
                          h,
                        ),
                      ]),
                    ]),
                  ]
                : [],
            ),
          ),
        },
        toParentMessage: messages.toMessage,
      }),
    ],
  )
// #endregion

// #region dialog-form
// A form in the body, its submit button in the footer: `form` ties the two,
// so Enter in a field submits it too.
export const dialogForm = <Message>(
  style: NamedStyle<typeof DialogSlots>,
  model: UiDialog.Model,
  messages: DialogMessages<Message>,
  h: HtmlBuilder<Message>,
): Html =>
  h.div(
    [],
    [
      Button.view({ label: 'Rename page', onClick: messages.onOpen, style: GroupedStyle }, h),
      h.submodel({
        slotId: model.id,
        model,
        view: UiDialog.view,
        viewInputs: {
          toView: Dialog.toView([style.mixin], { h }, dialog =>
            h.dialog(
              dialog.dialog,
              dialog.isVisible
                ? [
                    h.div(dialog.backdrop),
                    h.div(dialog.panel, [
                      h.button(dialog.closeButton, ['✕']),
                      h.h2(dialog.title, ['Rename page']),
                      h.div(dialog.body, [
                        h.div(dialog.scroll, [
                          h.form(
                            [h.Id('preview-rename'), h.OnSubmit(messages.onClose)],
                            [
                              Input.view(
                                {
                                  id: 'preview-rename-title',
                                  value: 'Quarterly plan',
                                  style: InputStyle,
                                  draw: (resolved, h) =>
                                    h.div(
                                      [],
                                      [h.label(resolved.label, ['Title']), h.input(resolved.input)],
                                    ),
                                },
                                h,
                              ),
                            ],
                          ),
                        ]),
                      ]),
                      h.div(dialog.footer, [
                        Button.view(
                          { label: 'Cancel', onClick: messages.onClose, style: QuietStyle },
                          h,
                        ),
                        h.button(
                          SlotView.buildersFor(ButtonSlots, [ButtonStyle.mixin], {
                            input: undefined,
                            h,
                          }).button.attrs([h.Type('submit'), h.FormAttr('preview-rename')]),
                          ['Rename'],
                        ),
                      ]),
                    ]),
                  ]
                : [],
            ),
          ),
        },
        toParentMessage: messages.toMessage,
      }),
    ],
  )
// #endregion

// #region dialog-nested
/** The two dialogs, the second opened from the first. */
export interface NestedDialogs<Message> {
  readonly outer: UiDialog.Model
  readonly inner: UiDialog.Model
  readonly outerMessages: DialogMessages<Message>
  readonly innerMessages: DialogMessages<Message>
}

// A dialog opened from another: the inner one is drawn inside the outer
// `dialog`, beside its panel, and the outer panel steps back while it is
// open (`covered`). Escape closes the inner one first.
export const dialogNested = <Message>(
  style: NamedStyle<typeof DialogSlots>,
  dialogs: NestedDialogs<Message>,
  h: HtmlBuilder<Message>,
): Html => {
  const inner = h.submodel({
    slotId: dialogs.inner.id,
    model: dialogs.inner,
    view: UiDialog.view,
    viewInputs: {
      toView: Dialog.toView([style.mixin], { h }, dialog =>
        h.dialog(
          dialog.dialog,
          dialog.isVisible
            ? [
                h.div(dialog.backdrop),
                h.div(dialog.panel, [
                  h.h2(dialog.title, ['Invite by link']),
                  h.p([], ['Anyone with the link joins as a viewer.']),
                  h.div(dialog.footer, [
                    Button.view(
                      { label: 'Done', onClick: dialogs.innerMessages.onClose, style: ButtonStyle },
                      h,
                    ),
                  ]),
                ]),
              ]
            : [],
        ),
      ),
    },
    toParentMessage: dialogs.innerMessages.toMessage,
  })
  return h.div(
    [],
    [
      Button.view(
        { label: 'Share', onClick: dialogs.outerMessages.onOpen, style: GroupedStyle },
        h,
      ),
      h.submodel({
        slotId: dialogs.outer.id,
        model: dialogs.outer,
        view: UiDialog.view,
        viewInputs: {
          toView: Dialog.toView([style.mixin], { h, covered: dialogs.inner.isOpen }, dialog =>
            h.dialog(
              dialog.dialog,
              dialog.isVisible
                ? [
                    h.div(dialog.backdrop),
                    h.div(dialog.panel, [
                      h.button(dialog.closeButton, ['✕']),
                      h.h2(dialog.title, ['Share “Quarterly plan”']),
                      h.p([], ['Three people can edit it.']),
                      h.div(dialog.footer, [
                        Button.view(
                          {
                            label: 'Invite by link',
                            onClick: dialogs.innerMessages.onOpen,
                            style: ButtonStyle,
                          },
                          h,
                        ),
                      ]),
                    ]),
                    inner,
                  ]
                : [],
            ),
          ),
        },
        toParentMessage: dialogs.outerMessages.toMessage,
      }),
    ],
  )
}
// #endregion

// #region popover-below
export const PopoverStyle = forSlots(PopoverSlots)(Recipes.Popover({}))

// In the browser's top layer, `Popover.anchor()` below its trigger by
// default, kept inside the viewport; the arrow points back at the trigger.
export const popover = <Message>(
  style: NamedStyle<typeof PopoverSlots>,
  model: UiPopover.Model,
  toMessage: (message: UiPopover.Message) => Message,
  h: HtmlBuilder<Message>,
  anchor: AnchorConfig = Popover.anchor(),
): Html =>
  h.submodel({
    slotId: model.id,
    model,
    view: UiPopover.view,
    viewInputs: {
      anchor,
      toView: Popover.toView([style.mixin], { h }, popover =>
        h.div(
          [],
          [
            h.button(popover.button, ['Share']),
            ...(popover.isVisible
              ? [
                  h.div(popover.backdrop, []),
                  h.div(popover.layer, [
                    h.div(popover.panel, [
                      h.div(popover.arrow, []),
                      h.p([], ['Anyone with the link can view this page.']),
                    ]),
                  ]),
                ]
              : []),
          ],
        ),
      ),
    },
    toParentMessage: toMessage,
  })
// #endregion

// #region popover-top-start
// Above its trigger, their start edges lined up; it flips below when there is no room.
export const popoverTopStart = <Message>(
  style: NamedStyle<typeof PopoverSlots>,
  model: UiPopover.Model,
  toMessage: (message: UiPopover.Message) => Message,
  h: HtmlBuilder<Message>,
): Html => popover(style, model, toMessage, h, Popover.anchor({ placement: 'top-start' }))
// #endregion

// #region popover-no-arrow
// The same panel with no arrow, drawn by `popover`.
export const PopoverNoArrowStyle = forSlots(PopoverSlots)(Recipes.Popover({ arrow: 'none' }))
// #endregion

// #region popover-clipped
// Its trigger in a card that clips what overflows it: the panel, in the top
// layer, paints past the card's edge all the same.
export const popoverClipped = <Message>(
  style: NamedStyle<typeof PopoverSlots>,
  model: UiPopover.Model,
  toMessage: (message: UiPopover.Message) => Message,
  h: HtmlBuilder<Message>,
): Html =>
  h.div(
    [
      h.Style({
        overflow: 'hidden',
        padding: '1rem',
        blockSize: '4.5rem',
        border: '1px dashed currentColor',
        borderRadius: '0.5rem',
      }),
    ],
    [popover(style, model, toMessage, h)],
  )
// #endregion

// #region tooltip-above
export const TooltipStyle = forSlots(TooltipSlots)(Recipes.Tooltip({}))

// In the top layer, `Tooltip.anchor()` above its trigger by default; the
// arrow points at the trigger, which `toView` finds by the Tooltip's id.
export const tooltip = <Message>(
  style: NamedStyle<typeof TooltipSlots>,
  model: UiTooltip.Model,
  toMessage: (message: UiTooltip.Message) => Message,
  h: HtmlBuilder<Message>,
  anchor: AnchorConfig = Tooltip.anchor(),
): Html =>
  h.submodel({
    slotId: model.id,
    model,
    view: UiTooltip.view,
    viewInputs: {
      anchor,
      toView: Tooltip.toView([style.mixin], { h, id: model.id }, tooltip =>
        h.div(
          [],
          [
            h.button(tooltip.trigger, ['Autosave']),
            ...(tooltip.isVisible
              ? [
                  h.div(tooltip.layer, [
                    h.div(tooltip.panel, [
                      h.span(tooltip.arrow, []),
                      'Saved a second after you stop typing',
                    ]),
                  ]),
                ]
              : []),
          ],
        ),
      ),
    },
    toParentMessage: toMessage,
  })
// #endregion

// #region tooltip-right
// Beside its trigger, at the end of the line.
export const tooltipRight = <Message>(
  style: NamedStyle<typeof TooltipSlots>,
  model: UiTooltip.Model,
  toMessage: (message: UiTooltip.Message) => Message,
  h: HtmlBuilder<Message>,
): Html => tooltip(style, model, toMessage, h, Tooltip.anchor({ placement: 'right' }))
// #endregion

// #region tooltip-edge
// A trigger at the viewport's edge: the pill shifts to stay 8px inside it,
// and the arrow still points at the trigger.
export const tooltipEdge = <Message>(
  style: NamedStyle<typeof TooltipSlots>,
  model: UiTooltip.Model,
  toMessage: (message: UiTooltip.Message) => Message,
  h: HtmlBuilder<Message>,
): Html =>
  h.div(
    [h.Style({ display: 'flex', justifyContent: 'end' })],
    [tooltip(style, model, toMessage, h)],
  )
// #endregion

// #region hover-card
export const HoverCardStyle = forSlots(HoverIntentSlots)(Recipes.HoverCard({}))

// `anchored` gives the trigger its id and places the card against it in the
// top layer (`HoverIntent.anchor()` unless given), its arrow at the trigger.
export const hoverCard = <Message>(
  style: NamedStyle<typeof HoverIntentSlots>,
  model: UiHoverIntent.Model,
  toMessage: (message: UiHoverIntent.Message) => Message,
  h: HtmlBuilder<Message>,
): Html =>
  h.submodel({
    slotId: 'preview-hover-card',
    model,
    view: UiHoverIntent.view,
    viewInputs: {
      focusTriggerSelector: `#${HoverIntent.triggerId('preview-hover-card')}`,
      toView: HoverIntent.toView(
        [style.mixin],
        // Start-aligned, so the arrow at the trigger is not the card's middle.
        { h, anchored: { id: 'preview-hover-card', anchor: { placement: 'bottom-start' } } },
        ({ trigger, panel, arrow, isVisible }) =>
          h.span(
            [],
            [
              h.button([...trigger, h.Type('button')], ['@ada']),
              ...(isVisible
                ? [
                    h.div(panel, [
                      h.div(arrow, []),
                      h.p([], ['Ada Lovelace']),
                      h.p([], ['Wrote the first program. 3 projects, 12 followers.']),
                    ]),
                  ]
                : []),
            ],
          ),
      ),
    },
    toParentMessage: toMessage,
  })
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

// #region listbox
export const ListboxStyle = forSlots(ListboxSlots)(Recipes.Listbox({}))

export const Frequency = Schema.Literals(['Hourly', 'Daily', 'Weekly', 'Monthly'])
export type Frequency = typeof Frequency.Type
export const FrequencyBox: ReturnType<typeof ListboxView.create<Frequency>> =
  ListboxView.create<Frequency>()

/** The open list and its highlight are the component's; the choice is the Model's. */
export interface ListboxState {
  readonly listbox: UiListbox.Model
  readonly frequency: Option.Option<Frequency>
}

export const listbox = <Message>(
  style: NamedStyle<typeof ListboxSlots>,
  state: ListboxState,
  toMessage: (message: UiListbox.Message) => Message,
  direction: 'ltr' | 'rtl',
  h: HtmlBuilder<Message>,
): Html =>
  h.submodel({
    slotId: state.listbox.id,
    model: state.listbox,
    view: FrequencyBox.view,
    viewInputs: {
      anchor: { placement: 'bottom-start', gap: 4, padding: 8, portal: false },
      direction,
      items: Frequency.literals,
      maybeSelectedValue: state.frequency,
      itemToConfig: (frequency: Frequency) => ({ content: h.span([], [frequency]) }),
      buttonContent: h.span([], [Option.getOrElse(state.frequency, () => 'Back up…')]),
      toView: Listbox.toView([style.mixin, ...Listbox.fluid], { h }),
    },
    toParentMessage: toMessage,
  })
// #endregion

export const CalendarStyle = forSlots(CalendarSlots)(Recipes.Calendar({}))

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

// #region toast-types
/** A stack of toasts: the component's state, folded with `Toast.update`. */
export interface ToastStack<Message> {
  readonly model: Toast.Model
  readonly onMessage: (message: Toast.Message) => Message
  /** The stack's landmark name, unique on the page. */
  readonly label: string
}

export const TOAST_TYPES = ['default', 'info', 'success', 'warning', 'error'] as const

// One button per type; the application answers each with `Toast.show`.
export const toastTypes = <Message>(
  style: NamedStyle<typeof ToastSlots>,
  stack: ToastStack<Message>,
  onShow: (type: (typeof TOAST_TYPES)[number]) => Message,
  h: HtmlBuilder<Message>,
): Html =>
  h.div(
    [h.Style({ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' })],
    [
      ...TOAST_TYPES.map(type =>
        Button.view({ label: type, onClick: onShow(type), style: ButtonStyle }, h),
      ),
      Toast.view({ model: stack.model, onMessage: stack.onMessage, label: stack.label, style }, h),
    ],
  )
// #endregion

// #region toast-promise
// `show` a loading toast, run the work as a Command, and `settle` the same
// toast with its outcome when the work's Message comes back.
export const toastPromise = <Message>(
  style: NamedStyle<typeof ToastSlots>,
  stack: ToastStack<Message>,
  onUpload: Message,
  h: HtmlBuilder<Message>,
): Html =>
  h.div(
    [],
    [
      Button.view({ label: 'Upload report.pdf', onClick: onUpload, style: ButtonStyle }, h),
      Toast.view(
        {
          model: stack.model,
          onMessage: stack.onMessage,
          label: stack.label,
          icons: { loading: Spinner.view({ label: 'Uploading', style: SpinnerStyle }, h) },
          style,
        },
        h,
      ),
    ],
  )
// #endregion

// #region toast-action
// A toast with an action: pressing it sends `Acted` with its value, and the toast leaves.
export const toastAction = <Message>(
  style: NamedStyle<typeof ToastSlots>,
  stack: ToastStack<Message>,
  onArchive: Message,
  h: HtmlBuilder<Message>,
): Html =>
  h.div(
    [],
    [
      Button.view({ label: 'Archive the thread', onClick: onArchive, style: ButtonStyle }, h),
      // Pressing the action removes the toast that holds focus: `keepFocus` hands
      // it to the same button of a neighbouring toast instead of dropping it on the page.
      Toast.view(
        {
          model: stack.model,
          onMessage: stack.onMessage,
          label: stack.label,
          mixins: Toast.keepFocus,
          style,
        },
        h,
      ),
    ],
  )
// #endregion

// #region toast-rich
// Each type on its own tint and edge; drawn by `toastTypes`.
export const ToastRichStyle = forSlots(ToastSlots)(Recipes.Toast({ tone: 'rich' }))
// #endregion

// #region toast-positions
// A stack where its Model says, `Toast.init(id, { position })`: one per place here.
export const toastPositions = <Message>(
  style: NamedStyle<typeof ToastSlots>,
  stacks: Readonly<Record<Toast.Position, Toast.Model>>,
  onMessage: (position: Toast.Position, message: Toast.Message) => Message,
  onShow: (position: Toast.Position) => Message,
  h: HtmlBuilder<Message>,
): Html =>
  h.div(
    [h.Style({ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' })],
    Toast.Position.literals.flatMap(position => [
      Button.view({ label: position, onClick: onShow(position), style: ButtonStyle }, h),
      Toast.view(
        {
          model: stacks[position],
          onMessage: message => onMessage(position, message),
          label: `Notifications, ${position}`,
          style,
        },
        h,
      ),
    ]),
  )
// #endregion

// #region disclosure-basic
/** One button that shows and hides one panel; the application holds whether it is open. */
export const disclosure = <Message>(
  style: NamedStyle<typeof DisclosureSlots>,
  isOpen: boolean,
  onToggle: (isOpen: boolean) => Message,
  h: HtmlBuilder<Message>,
): Html =>
  UiDisclosure.view(
    {
      id: 'details',
      isOpen,
      onToggle,
      toView: attributes => {
        const details = Disclosure.resolve(attributes, [style.mixin], { input: undefined, h })
        return h.div(
          [],
          [
            h.button(details.button, ['Shipping details']),
            details.animatePanel(h.div(details.panel, ['Shipped in two days, tracked.'])),
          ],
        )
      },
    },
    h,
  )
// #endregion

// #region accordion-basic
export const AccordionStyle = forSlots(AccordionSlots)(Recipes.Accordion({}))

export const accordion = <Message>(
  style: NamedStyle<typeof AccordionSlots>,
  open: ReadonlyArray<string>,
  onToggle: (id: string) => Message,
  h: HtmlBuilder<Message>,
): Html =>
  Accordion.view(
    {
      id: 'faq',
      items: [
        {
          id: 'billing',
          title: 'Billing',
          content: 'Seats, invoices and receipts, billed monthly.',
        },
        {
          id: 'team',
          title: 'Team',
          content: 'Invite people, remove them, and assign their roles.',
        },
        {
          id: 'keys',
          title: 'API keys',
          content: 'Mint a key per service, scope it, and revoke it.',
        },
      ],
      open,
      onToggle,
      style,
    },
    h,
  )
// #endregion

// #region accordion-plus
export const PlusAccordionStyle = forSlots(AccordionSlots)(
  Recipes.Accordion({ variant: 'separated', indicator: 'plus', indicatorPosition: 'start' }),
)

// Several open at once (`Accordion.toggled(open, id, { multiple: true })`), a
// plus that lies flat into a minus at the start of each card.
export const accordionPlus = <Message>(
  style: NamedStyle<typeof AccordionSlots>,
  open: ReadonlyArray<string>,
  onToggle: (id: string) => Message,
  h: HtmlBuilder<Message>,
): Html =>
  Accordion.view(
    {
      id: 'faq-plus',
      items: [
        { id: 'refunds', title: 'Refunds', content: 'Within 30 days, to the card that paid.' },
        { id: 'seats', title: 'Seats', content: 'Add or remove them at any time.' },
        { id: 'sso', title: 'Single sign-on', content: 'On the Business plan.', disabled: true },
      ],
      open,
      onToggle,
      style,
    },
    h,
  )
// #endregion

// #region accordion-active
export const ActiveAccordionStyle = forSlots(AccordionSlots)(
  Recipes.Accordion({ variant: 'ghost', separators: 'off', active: 'item' }),
)

// A ghost accordion whose open section is tinted, row and panel, with its own icon.
export const accordionActive = <Message>(
  style: NamedStyle<typeof AccordionSlots>,
  open: ReadonlyArray<string>,
  onToggle: (id: string) => Message,
  h: HtmlBuilder<Message>,
): Html =>
  Accordion.view(
    {
      id: 'faq-active',
      items: [
        { id: 'billing', title: 'Billing', content: 'Seats, invoices and receipts.' },
        { id: 'team', title: 'Team', content: 'Invite people and assign roles.' },
      ],
      open,
      onToggle,
      icon: outline(h, 'M4 6l4 4 4-4'),
      style,
    },
    h,
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

// #region number-field-basic
export const NumberFieldStyle = forSlots(NumberFieldSlots)(Recipes.NumberField({}))

export const numberField = <Message>(
  style: NamedStyle<typeof NumberFieldSlots>,
  value: number,
  onChange: (value: number) => Message,
  h: HtmlBuilder<Message>,
): Html =>
  NumberField.view(
    {
      id: 'servings',
      label: 'Servings',
      description: 'From 1 to 12; the arrow keys step it.',
      value: Option.some(value),
      // This Model holds a number, so a cleared field keeps the last one: see the next example for one that can be empty.
      onChange: next => onChange(Option.getOrElse(next, () => value)),
      min: 1,
      max: 12,
      style,
    },
    h,
  )
// #endregion

// #region number-field-locale
// An empty field is `Option.none()`, so the Model can hold "nothing entered
// yet"; the steppers then start from the bounds. `locale` draws the number
// with that locale's marks and reads typed text back the same way, so what the
// field shows is what it accepts. `name` submits the text shown.
export const numberFieldLocale = <Message>(
  style: NamedStyle<typeof NumberFieldSlots>,
  value: Option.Option<number>,
  onChange: (value: Option.Option<number>) => Message,
  h: HtmlBuilder<Message>,
): Html =>
  NumberField.view(
    {
      id: 'price',
      name: 'price',
      label: 'Price in euros',
      description: Option.match(value, {
        onNone: () => 'Empty: type 1.234,5 or step from the minimum.',
        onSome: amount => `Read as ${amount}.`,
      }),
      value,
      onChange,
      locale: 'de-DE',
      min: 0,
      step: 0.5,
      required: true,
      style,
    },
    h,
  )
// #endregion

// #region otp-field-basic
export const OtpFieldStyle = forSlots(OtpFieldSlots)(Recipes.OtpField({}))

export const otpField = <Message>(
  style: NamedStyle<typeof OtpFieldSlots>,
  code: string,
  onChange: (code: string) => Message,
  h: HtmlBuilder<Message>,
): Html => OtpField.view({ label: 'Sign-in code', value: code, onChange, groups: [3, 3], style }, h)
// #endregion

// #region otp-field-states
// Empty and filling are the same field at different values; invalid marks a
// refused code, disabled takes no input, and read-only shows a code that
// cannot be changed. Each cell mirrors the one real input beneath them. The
// two fields that take input keep a value of their own, which the application
// owns like any other.
export const otpFieldStates = <Message>(
  style: NamedStyle<typeof OtpFieldSlots>,
  codes: { readonly filling: string; readonly refused: string },
  onChange: (field: 'filling' | 'refused', code: string) => Message,
  h: HtmlBuilder<Message>,
): Html => {
  const typed = (field: 'filling' | 'refused') => (code: string) => onChange(field, code)
  return h.div(
    [h.Style({ display: 'grid', gap: '1rem' })],
    [
      OtpField.view(
        {
          id: 'otp-filling',
          label: 'Filling',
          value: codes.filling,
          onChange: typed('filling'),
          style,
        },
        h,
      ),
      OtpField.view(
        {
          id: 'otp-invalid',
          label: 'Refused code',
          value: codes.refused,
          invalid: true,
          onChange: typed('refused'),
          style,
        },
        h,
      ),
      OtpField.view(
        {
          id: 'otp-disabled',
          label: 'Disabled',
          value: '',
          disabled: true,
          onChange: typed('filling'),
          style,
        },
        h,
      ),
      OtpField.view(
        {
          id: 'otp-readonly',
          label: 'Read only',
          value: '482910',
          readOnly: true,
          onChange: typed('filling'),
          style,
        },
        h,
      ),
    ],
  )
}
// #endregion

// #region drawer-basic
// A panel docked to the bottom of the screen: the handle peeks, and a press, Enter or a drag
// opens it. The page under it stays live. Set `--fk-drawer-peek` and `--fk-drawer-height` on an
// ancestor to size it; `keepFocus` keeps focus on the handle when it goes down with focus inside.
export const drawer = <Message>(
  style: NamedStyle<typeof DrawerSlots>,
  model: Drawer.Model,
  onMessage: (message: Drawer.Message) => Message,
  h: HtmlBuilder<Message>,
): Html =>
  Drawer.view(
    {
      model,
      onMessage,
      label: 'Order details',
      style,
      mixins: Drawer.keepFocus,
      draw: ({ panel, handle, body }) =>
        h.aside(
          [...panel, h.AriaLabel('Order')],
          [
            h.button(handle, []),
            h.div(body, [
              h.div(
                [
                  h.Style({
                    display: 'grid',
                    gap: '0.75rem',
                    justifyItems: 'start',
                    padding: '0 1rem',
                  }),
                ],
                [
                  h.p([h.Style({ margin: '0' })], ['Two items, shipped tomorrow.']),
                  Button.view({ label: 'Track the order', style: ButtonStyle }, h),
                ],
              ),
            ]),
          ],
        ),
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

// #region resizable-basic
export const ResizableStyle = forSlots(ResizableSlots)(Recipes.Resizable({}))

export const resizable = <Message>(
  style: NamedStyle<typeof ResizableSlots>,
  model: Resizable.Model,
  onMessage: (message: Resizable.Message) => Message,
  direction: 'ltr' | 'rtl',
  h: HtmlBuilder<Message>,
): Html =>
  h.div(
    [
      h.Style({
        blockSize: '12rem',
        inlineSize: 'min(32rem, 100%)',
        border: '1px solid color-mix(in oklab, currentColor 20%, transparent)',
        borderRadius: '0.5rem',
        overflow: 'hidden',
      }),
    ],
    [
      Resizable.view(
        {
          model,
          onMessage,
          label: 'Resize the file list',
          min: 0.2,
          max: 0.8,
          direction,
          first: h.ul(
            [h.Style({ margin: '0', padding: '0.75rem', listStyle: 'none' })],
            [h.li([], ['notes.txt']), h.li([], ['todo.md']), h.li([], ['grid.ts'])],
          ),
          second: h.p(
            [h.Style({ margin: '0', padding: '0.75rem' })],
            ['Pick a file to preview it.'],
          ),
          style,
        },
        h,
      ),
    ],
  )
// #endregion

// #region resizable-collapsible
// The same bounds go to `Resizable.update(model, message, bounds)`.
const sidebarBounds = { min: 0.2, max: 0.6, collapsible: 'first' as const }

// Pinned: `Recipes.Resizable({ handle: 'grip' })`.
export const resizableCollapsible = <Message>(
  style: NamedStyle<typeof ResizableSlots>,
  model: Resizable.Model,
  onMessage: (message: Resizable.Message) => Message,
  h: HtmlBuilder<Message>,
): Html =>
  h.div(
    [h.Style({ blockSize: '12rem', inlineSize: 'min(32rem, 100%)' })],
    [
      Resizable.view(
        {
          model,
          onMessage,
          ...sidebarBounds,
          label: 'Resize the sidebar; Enter or a double-click folds it away',
          first: h.p([h.Style({ margin: '0', padding: '0.75rem' })], ['Folders']),
          second: h.p([h.Style({ margin: '0', padding: '0.75rem' })], ['Messages']),
          style,
        },
        h,
      ),
    ],
  )
// #endregion

// #region resizable-nested
export const resizableNested = <Message>(
  style: NamedStyle<typeof ResizableSlots>,
  outer: Resizable.Model,
  inner: Resizable.Model,
  onOuter: (message: Resizable.Message) => Message,
  onInner: (message: Resizable.Message) => Message,
  h: HtmlBuilder<Message>,
): Html =>
  h.div(
    [h.Style({ blockSize: '16rem', inlineSize: 'min(36rem, 100%)' })],
    [
      Resizable.view(
        {
          model: outer,
          onMessage: onOuter,
          label: 'Resize the file list',
          first: h.p([h.Style({ margin: '0', padding: '0.75rem' })], ['Files']),
          // One over the other, inside the second panel: the split fills it.
          second: Resizable.view(
            {
              model: inner,
              onMessage: onInner,
              orientation: 'vertical',
              label: 'Resize the editor',
              first: h.p([h.Style({ margin: '0', padding: '0.75rem' })], ['Editor']),
              second: h.p([h.Style({ margin: '0', padding: '0.75rem' })], ['Terminal']),
              style,
            },
            h,
          ),
          style,
        },
        h,
      ),
    ],
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

// #region menubar
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

// #region progress-basic
export const ProgressStyle = forSlots(ProgressSlots)(Recipes.Progress({}))

export const progress = <Message>(
  style: NamedStyle<typeof ProgressSlots>,
  h: HtmlBuilder<Message>,
): Html =>
  h.div(
    [h.Style({ display: 'flex', flexWrap: 'wrap', gap: '2rem', alignItems: 'end' })],
    [
      Progress.view(
        {
          id: 'preview-upload',
          label: 'Uploading',
          value: Option.some(120),
          max: 200,
          valueText: (value, max) => `${value} of ${max} MB`,
          style,
        },
        h,
      ),
      Progress.view({ id: 'preview-prepare', label: 'Preparing', value: Option.none(), style }, h),
    ],
  )
// #endregion

// #region progress-value
export const progressValue = (
  style: NamedStyle<typeof ProgressSlots>,
  h: HtmlBuilder<never>,
): Html =>
  h.div(
    [h.Style({ display: 'grid', gap: '1.5rem' })],
    [
      Progress.view(
        {
          id: 'value-copy',
          label: 'Copying files',
          value: Option.some(64),
          showValue: true,
          style,
        },
        h,
      ),
      Progress.view(
        {
          id: 'value-upload',
          label: 'Uploading',
          value: Option.some(120),
          max: 200,
          valueText: (value, max) => `${value} of ${max} MB`,
          showValue: true,
          style,
        },
        h,
      ),
    ],
  )
// #endregion

// #region progress-stacked
export const progressStacked = (
  style: NamedStyle<typeof ProgressSlots>,
  h: HtmlBuilder<never>,
): Html =>
  Progress.view(
    {
      id: 'stacked-disk',
      label: 'Storage',
      value: [
        { label: 'Photos', value: 38, tone: 'accent' },
        { label: 'Mail', value: 21, tone: 'success' },
        { label: 'Backups', value: 14, tone: 'warning' },
      ],
      showValue: true,
      style,
    },
    h,
  )
// #endregion

// #region progress-buffer
export const progressBuffer = (
  style: NamedStyle<typeof ProgressSlots>,
  h: HtmlBuilder<never>,
): Html =>
  Progress.view(
    {
      id: 'buffer-video',
      label: 'Played',
      value: Option.some(35),
      buffer: 70,
      valueText: '1:45 of 5:00, loaded to 3:30',
      style,
    },
    h,
  )
// #endregion

// #region progress-striped
// Pinned: `Recipes.Progress({ stripes: 'moving', size: 'lg' })`; still under reduced motion.
export const progressStriped = (
  style: NamedStyle<typeof ProgressSlots>,
  h: HtmlBuilder<never>,
): Html =>
  Progress.view(
    { id: 'striped-sync', label: 'Syncing', value: Option.some(55), showValue: true, style },
    h,
  )
// #endregion

// #region progress-ring
// Pinned: `Recipes.Progress({ shape: 'ring', size: 'lg' })`.
export const progressRing = (
  style: NamedStyle<typeof ProgressSlots>,
  h: HtmlBuilder<never>,
): Html =>
  h.div(
    [h.Style({ display: 'flex', gap: '2rem' })],
    [
      Progress.view(
        { id: 'ring-done', label: 'Done', value: Option.some(72), showValue: true, style },
        h,
      ),
      Progress.view({ id: 'ring-wait', label: 'Waiting', value: Option.none(), style }, h),
    ],
  )
// #endregion

// #region progress-steps
// The steps done of the steps there are, the track cut into one segment each.
export const progressSteps = (
  style: NamedStyle<typeof ProgressSlots>,
  h: HtmlBuilder<never>,
): Html =>
  Progress.view(
    {
      id: 'steps-setup',
      label: 'Setting up',
      value: Option.some(2),
      max: 4,
      segments: 4,
      valueText: (value, max) => `Step ${value} of ${max}`,
      showValue: true,
      style,
    },
    h,
  )
// #endregion

// #region meter
export const MeterStyle = forSlots(MeterSlots)(Recipes.Meter({}))

export const meter = <Message>(
  style: NamedStyle<typeof MeterSlots>,
  h: HtmlBuilder<Message>,
): Html =>
  h.div(
    [h.Style({ display: 'grid', gap: '1.25rem' })],
    [
      Meter.view(
        {
          id: 'preview-battery',
          label: 'Battery',
          value: 64,
          low: 20,
          high: 80,
          optimum: 100,
          style,
        },
        h,
      ),
      Meter.view(
        {
          id: 'preview-storage',
          label: 'Storage used',
          value: 91,
          low: 20,
          high: 80,
          optimum: 0,
          valueText: (value, max) => `${value} of ${max} GB`,
          style,
        },
        h,
      ),
    ],
  )
// #endregion

// #region scroll-area-native
// The box scrolls instead of the page, in the browser's own thin bars. Its
// height is the caller's: the recipe extended by one, here.
export const ScrollAreaStyle = forSlots(ScrollAreaSlots)(
  Recipes.ScrollArea.extend({ base: { viewport: { maxBlockSize: '12rem' } } })({}),
)

const releases = (h: HtmlBuilder<never>): Html =>
  h.ul(
    [h.Style({ margin: '0', paddingInline: '1rem' })],
    Array.from({ length: 24 }, (_, index) => h.li([], [`Release 0.${24 - index}.0`])),
  )

export const scrollArea = (
  style: NamedStyle<typeof ScrollAreaSlots>,
  h: HtmlBuilder<never>,
): Html =>
  ScrollArea.view(
    {
      content: releases(h),
      style,
    },
    h,
  )
// #endregion

// #region scroll-area-overlay
// Bars drawn over the content in place of the browser's, on a pointer that
// can hover; a coarse pointer keeps the browser's. Off unless passed.
export const scrollAreaOverlay = (
  style: NamedStyle<typeof ScrollAreaSlots>,
  h: HtmlBuilder<never>,
): Html =>
  ScrollArea.view(
    {
      content: releases(h),
      mixins: ScrollArea.overlayBars,
      style,
    },
    h,
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

// #region rating-basic
export const RatingStyle = forSlots(RatingSlots)(Recipes.Rating({}))

export const rating = <Message>(
  style: NamedStyle<typeof RatingSlots>,
  value: Option.Option<number>,
  onChange: (value: number) => Message,
  h: HtmlBuilder<Message>,
): Html =>
  h.div(
    [h.Style({ display: 'flex', flexWrap: 'wrap', gap: '2rem', alignItems: 'end' })],
    [
      Rating.view({ id: 'preview-stay', label: 'Your stay', value, onChange, style }, h),
      Rating.view(
        {
          id: 'preview-average',
          label: 'Average of 120 reviews',
          value: Option.some(4),
          readOnly: true,
          style,
        },
        h,
      ),
    ],
  )
// #endregion

// #region rating-half
export const ratingHalf = <Message>(
  style: NamedStyle<typeof RatingSlots>,
  value: Option.Option<number>,
  onChange: (value: number) => Message,
  onClear: () => Message,
  h: HtmlBuilder<Message>,
): Html =>
  // A press on the star already chosen clears it.
  Rating.view(
    { id: 'half-film', label: 'The film', value, onChange, onClear, precision: 0.5, style },
    h,
  )
// #endregion

// #region rating-fraction
export const ratingFraction = (
  style: NamedStyle<typeof RatingSlots>,
  h: HtmlBuilder<never>,
): Html =>
  Rating.view(
    {
      id: 'fraction-average',
      label: 'Average of 1,204 reviews',
      value: Option.some(4.3),
      readOnly: true,
      showValue: true,
      starLabel: value => `${value} stars`,
      style,
    },
    h,
  )
// #endregion

// #region rating-hearts
// Pinned: `Recipes.Rating({ glyph: 'heart', tone: 'error', size: 'lg' })`.
export const ratingHearts = <Message>(
  style: NamedStyle<typeof RatingSlots>,
  value: Option.Option<number>,
  onChange: (value: number) => Message,
  h: HtmlBuilder<Message>,
): Html =>
  Rating.view(
    {
      id: 'hearts-recipe',
      label: 'How much you liked it',
      value,
      onChange,
      starLabel: value => (value === 1 ? '1 heart' : `${value} hearts`),
      style,
    },
    h,
  )
// #endregion

// #region rating-labels
const verdicts = ['Useless', 'Poor', 'Ok', 'Good', 'Excellent']

export const ratingLabels = <Message>(
  style: NamedStyle<typeof RatingSlots>,
  value: Option.Option<number>,
  onChange: (value: number) => Message,
  h: HtmlBuilder<Message>,
): Html =>
  Rating.view(
    {
      id: 'labels-support',
      label: 'Your support call',
      value,
      onChange,
      starLabel: value => verdicts[value - 1] ?? `${value} stars`,
      showValue: true,
      style,
    },
    h,
  )
// #endregion

// #region password-input-basic
export const PasswordInputStyle = forSlots(PasswordInputSlots)(Recipes.PasswordInput({}))

export const passwordInput = <Message>(
  style: NamedStyle<typeof PasswordInputSlots>,
  field: {
    readonly value: string
    readonly visible: boolean
    readonly onInput: (value: string) => Message
    readonly onToggle: Message
  },
  h: HtmlBuilder<Message>,
): Html =>
  PasswordInput.view(
    {
      id: 'preview-password',
      label: 'Password',
      description: 'At least twelve characters.',
      autocomplete: 'new-password',
      ...field,
      style,
    },
    h,
  )
// #endregion

// #region password-input-new
/** The rules a new password keeps, each read from what is typed. */
export const passwordRules = (value: string): ReadonlyArray<PasswordRequirement> => [
  { label: 'At least 12 characters', met: value.length >= 12 },
  { label: 'A number', met: /[0-9]/.test(value) },
  { label: 'Upper and lower case', met: /[a-z]/.test(value) && /[A-Z]/.test(value) },
  { label: 'A symbol', met: /[^a-zA-Z0-9]/.test(value) },
]

/** The field's text and whether it shows, and what Caps Lock was last read as. */
export interface NewPassword<Message> {
  readonly value: string
  readonly visible: boolean
  readonly capsLock: boolean
  readonly onInput: (value: string) => Message
  readonly onToggle: Message
  readonly onCapsLock: (reading: Option.Option<boolean>) => Message
}

// A strength meter over the rules kept, the rules under the field, and a
// hint while Caps Lock is on, read from each key typed.
export const passwordInputNew = <Message>(
  style: NamedStyle<typeof PasswordInputSlots>,
  field: NewPassword<Message>,
  h: HtmlBuilder<Message>,
): Html => {
  const rules = passwordRules(field.value)
  return PasswordInput.view(
    {
      id: 'preview-new-password',
      label: 'New password',
      autocomplete: 'new-password',
      value: field.value,
      visible: field.visible,
      onInput: field.onInput,
      onToggle: field.onToggle,
      strength: Meter.view(
        {
          id: 'preview-new-password-strength',
          label: 'Strength',
          value: rules.filter(rule => rule.met).length,
          max: 4,
          low: 2,
          high: 3,
          optimum: 4,
          style: MeterStyle,
        },
        h,
      ),
      requirements: rules,
      capsLock: { on: field.capsLock, onKey: field.onCapsLock },
      style,
    },
    h,
  )
}
// #endregion

// #region input-copy
export const InputCopyStyle = forSlots(InputCopySlots)(Recipes.InputCopy({}))

export const API_KEY = 'sk-live-4f9a2c71'

export const inputCopy = <Message>(
  style: NamedStyle<typeof InputCopySlots>,
  model: InputCopy.Model,
  onCopy: (text: string) => Message,
  h: HtmlBuilder<Message>,
): Html =>
  InputCopy.view(
    {
      id: 'preview-api-key',
      label: 'API key',
      value: API_KEY,
      copied: model.copied,
      failed: model.failed,
      onCopy: onCopy(API_KEY),
      style,
    },
    h,
  )
// #endregion

// #region sheet-drawer
/** The application's page, stepped back behind a sheet drawn with `scalesPage`. */
export const SheetPage = slots({ page: Recipes.sheetPage })

/** The Messages that open and close a sheet, and the one that wraps its own. */
export interface SheetMessages<Message> {
  readonly onOpen: Message
  readonly onClose: Message
  readonly toMessage: (message: Sheet.Message) => Message
}

// Opens at half its height, `Sheet.init({ points: [0.5, 1] })`: its handle
// drags it to the next point, and down past the first one away. The page
// beside it, not around it, steps back while it is open.
export const sheetDrawer = <Message>(
  style: NamedStyle<typeof DialogSlots>,
  model: Sheet.Model,
  messages: SheetMessages<Message>,
  h: HtmlBuilder<Message>,
): Html =>
  h.div(
    [h.Style({ display: 'grid', gap: '0.75rem', justifyItems: 'start' })],
    [
      h.div(
        SlotView.buildersFor(SheetPage.slots, [SheetPage.style.mixin], {
          input: undefined,
          h,
        }).page.attrs([h.Style({ display: 'grid', gap: '0.75rem', justifyItems: 'start' })]),
        [
          h.p([], ['Twelve results near you.']),
          Button.view({ label: 'Filters', onClick: messages.onOpen, style: GroupedStyle }, h),
        ],
      ),
      Sheet.view(
        {
          model,
          onMessage: messages.toMessage,
          mixins: [style.mixin],
          scalesPage: true,
          draw: sheet =>
            h.dialog(
              sheet.dialog,
              sheet.isVisible
                ? [
                    h.div(sheet.backdrop),
                    h.div(sheet.panel, [
                      h.div(sheet.handle),
                      h.h2(sheet.title, ['Filters']),
                      h.p([], ['Only what is in stock, nearest first.']),
                      h.p([], ['Drag the handle up for every filter, or down to close.']),
                      Button.view(
                        { label: 'Show results', onClick: messages.onClose, style: ButtonStyle },
                        h,
                      ),
                    ]),
                  ]
                : [],
            ),
        },
        h,
      ),
    ],
  )
// #endregion

// #region sheet-right
// From the end edge, `Sheet.init({ side: 'right' })`, with no handle: a side panel.
export const sheetSide = <Message>(
  style: NamedStyle<typeof DialogSlots>,
  model: Sheet.Model,
  messages: SheetMessages<Message>,
  h: HtmlBuilder<Message>,
): Html =>
  h.div(
    [],
    [
      Button.view({ label: 'Edit profile', onClick: messages.onOpen, style: GroupedStyle }, h),
      Sheet.view(
        {
          model,
          onMessage: messages.toMessage,
          mixins: [style.mixin],
          hasDescription: true,
          draw: sheet =>
            h.dialog(
              sheet.dialog,
              sheet.isVisible
                ? [
                    h.div(sheet.backdrop),
                    h.div(sheet.panel, [
                      h.button(sheet.closeButton, ['✕']),
                      h.h2(sheet.title, ['Edit profile']),
                      h.p(sheet.description, ['Changes show once you save. Escape keeps them.']),
                      h.div(sheet.footer, [
                        Button.view(
                          { label: 'Cancel', onClick: messages.onClose, style: QuietStyle },
                          h,
                        ),
                        Button.view(
                          { label: 'Save', onClick: messages.onClose, style: ButtonStyle },
                          h,
                        ),
                      ]),
                    ]),
                  ]
                : [],
            ),
        },
        h,
      ),
    ],
  )
// #endregion

// #region sheet-fixed
// `Sheet.init({ dismissible: false })`: a drag moves it between its points
// and springs back, but never takes it away; only its button closes it.
export const sheetFixed = <Message>(
  style: NamedStyle<typeof DialogSlots>,
  model: Sheet.Model,
  messages: SheetMessages<Message>,
  h: HtmlBuilder<Message>,
): Html =>
  h.div(
    [],
    [
      Button.view({ label: 'Start checkout', onClick: messages.onOpen, style: GroupedStyle }, h),
      Sheet.view(
        {
          model,
          onMessage: messages.toMessage,
          mixins: [style.mixin],
          draw: sheet =>
            h.dialog(
              sheet.dialog,
              sheet.isVisible
                ? [
                    h.div(sheet.backdrop),
                    h.div(sheet.panel, [
                      h.div(sheet.handle),
                      h.h2(sheet.title, ['Confirm your order']),
                      h.p([], ['Two items, delivered on Thursday.']),
                      Button.view(
                        { label: 'Place order', onClick: messages.onClose, style: ButtonStyle },
                        h,
                      ),
                    ]),
                  ]
                : [],
            ),
        },
        h,
      ),
    ],
  )
// #endregion

// #region sheet-nested
/** The two sheets, the second opened from the first. */
export interface NestedSheets<Message> {
  readonly outer: Sheet.Model
  readonly inner: Sheet.Model
  readonly outerMessages: SheetMessages<Message>
  readonly innerMessages: SheetMessages<Message>
}

// A sheet opened from another: drawn inside the first one's `dialog`, beside
// its panel, as nested dialogs are, and the first steps back while it is open
// (`covered`).
export const sheetNested = <Message>(
  style: NamedStyle<typeof DialogSlots>,
  sheets: NestedSheets<Message>,
  h: HtmlBuilder<Message>,
): Html => {
  const inner = Sheet.view(
    {
      model: sheets.inner,
      onMessage: sheets.innerMessages.toMessage,
      mixins: [style.mixin],
      draw: sheet =>
        h.dialog(
          sheet.dialog,
          sheet.isVisible
            ? [
                h.div(sheet.backdrop),
                h.div(sheet.panel, [
                  h.div(sheet.handle),
                  h.h2(sheet.title, ['Compare plans']),
                  h.p([], ['Starter is free; Team is $12 an editor; Business adds sign-on.']),
                  Button.view(
                    { label: 'Back', onClick: sheets.innerMessages.onClose, style: ButtonStyle },
                    h,
                  ),
                ]),
              ]
            : [],
        ),
    },
    h,
  )
  return h.div(
    [],
    [
      Button.view(
        { label: 'Choose a plan', onClick: sheets.outerMessages.onOpen, style: GroupedStyle },
        h,
      ),
      Sheet.view(
        {
          model: sheets.outer,
          onMessage: sheets.outerMessages.toMessage,
          mixins: [style.mixin],
          covered: Sheet.isOpen(sheets.inner),
          draw: sheet =>
            h.dialog(
              sheet.dialog,
              sheet.isVisible
                ? [
                    h.div(sheet.backdrop),
                    h.div(sheet.panel, [
                      h.div(sheet.handle),
                      h.h2(sheet.title, ['Plans']),
                      h.p([], ['Team: ten editors and every page.']),
                      Button.view(
                        {
                          label: 'Compare plans',
                          onClick: sheets.innerMessages.onOpen,
                          style: ButtonStyle,
                        },
                        h,
                      ),
                    ]),
                    inner,
                  ]
                : [],
            ),
        },
        h,
      ),
    ],
  )
}
// #endregion

// #region color-picker-inline
export const ColorPickerStyle = forSlots(ColorPickerSlots)(Recipes.ColorPicker({}))
// The hue and alpha tracks are Sliders, painted from the color.
const ChannelStyle = forSlots(SliderSlots)(Recipes.Slider({ track: 'paint', label: 'hidden' }))

/** The colors one press away. */
export const ACCENTS: ReadonlyArray<ColorPicker.ColorPickerPreset> = [
  { label: 'Blue', value: ColorPicker.color('#3b82f6') },
  { label: 'Teal', value: ColorPicker.color('#14b8a6') },
  { label: 'Amber', value: ColorPicker.color('#f59e0b') },
  { label: 'Rose', value: ColorPicker.color('#f43f5e') },
  { label: 'Glass', value: ColorPicker.color('#3b82f680') },
]

/**
 * The color, its format and the text being typed are the picker's Model, folded with `update`.
 * `eyedropper` draws the eyedropper button: an input of the view, `false` by default on a server and
 * in a browser alike, so the application says when the browser has one (`ColorPicker.canEyedrop()`),
 * after its code has taken the page over.
 */
export const colorPicker = <Message>(
  style: NamedStyle<typeof ColorPickerSlots>,
  model: ColorPicker.Model,
  onMessage: (message: ColorPicker.Message) => Message,
  eyedropper: boolean,
  h: HtmlBuilder<Message>,
): Html =>
  ColorPicker.view(
    {
      model,
      onMessage,
      label: 'Accent',
      presets: ACCENTS,
      style,
      slider: ChannelStyle,
      eyedropper,
    },
    h,
  )
// #endregion

// #region color-picker-popover
const PickerPopoverStyle = forSlots(PopoverSlots)(Recipes.Popover({}))

/**
 * The picker behind a swatch of its color. Its Popover is made with
 * `UiPopover.init({ id, contentFocus: true })`: the picker owns the panel's
 * focus, so a press or a drag inside never closes it.
 */
export const colorPickerPopover = <Message>(
  style: NamedStyle<typeof ColorPickerSlots>,
  state: { readonly picker: ColorPicker.Model; readonly popover: UiPopover.Model },
  onMessage: (message: ColorPicker.Message) => Message,
  onPopover: (message: UiPopover.Message) => Message,
  eyedropper: boolean,
  h: HtmlBuilder<Message>,
): Html =>
  ColorPicker.popover(
    {
      model: state.picker,
      eyedropper,
      onMessage,
      popover: state.popover,
      onPopover,
      label: 'Brand color',
      presets: ACCENTS,
      style,
      slider: ChannelStyle,
      popoverMixins: [PickerPopoverStyle.mixin],
    },
    h,
  )
// #endregion

// #region tree-view-basic
export const TreeViewStyle = forSlots(TreeViewSlots)(Recipes.TreeView({}))

/** The preview's files, built once: `update` and the view read the same tree. */
export const TREE_FILES: ReadonlyArray<TreeView.TreeNode> = [
  {
    id: 'src',
    label: 'src',
    children: [
      {
        id: 'components',
        label: 'components',
        children: [
          { id: 'button', label: 'button.ts' },
          { id: 'tree', label: 'tree.ts' },
        ],
      },
      { id: 'index', label: 'index.ts' },
    ],
  },
  { id: 'tests', label: 'tests', children: [{ id: 'tree-test', label: 'tree.test.ts' }] },
  { id: 'lock', label: 'pnpm-lock.yaml', disabled: true },
  { id: 'readme', label: 'README.md' },
]

/** The open, current and chosen rows are the tree's Model. */
export const treeView = <Message>(
  style: NamedStyle<typeof TreeViewSlots>,
  model: TreeView.Model,
  onMessage: (message: TreeView.Message) => Message,
  direction: 'ltr' | 'rtl',
  h: HtmlBuilder<Message>,
): Html =>
  h.div(
    [h.Style({ display: 'grid', gap: '0.75rem', inlineSize: '16rem' })],
    [
      // `TreeView.fluid` glides one hover from row to row, after the pointer and the keys.
      TreeView.view(
        {
          label: 'Files',
          model,
          nodes: TREE_FILES,
          onMessage,
          direction,
          style,
          mixins: TreeView.fluid,
        },
        h,
      ),
      h.p(
        [],
        [
          Option.match(model.selected, {
            onNone: () => 'Nothing chosen yet.',
            onSome: id => `Chose ${id}.`,
          }),
        ],
      ),
    ],
  )
// #endregion

// #region tree-view-icons
export const GuidedTreeStyle = forSlots(TreeViewSlots)(Recipes.TreeView({ guides: 'lines' }))

const FOLDER = 'M1.5 4.5h4l1.5 1.5h7.5v6.5h-13z'
const FOLDER_OPEN = 'M1.5 4.5h4l1.5 1.5h6v2M1.5 12.5l2-4.5h11l-2 4.5z'
const FILE = 'M4 1.5h5l3 3v10H4zM9 1.5v3h3'

/** Built once: `update` and the view read the same tree. */
export const TREE_ICONS: ReadonlyArray<TreeView.TreeNode> = [
  {
    id: 'src',
    label: 'src',
    children: [
      { id: 'index', label: 'index.ts' },
      {
        id: 'components',
        label: 'components',
        children: [
          { id: 'button', label: 'button.ts' },
          { id: 'tree', label: 'tree.ts' },
        ],
      },
    ],
  },
  { id: 'readme', label: 'README.md' },
]

/** Each node's icon, a folder open or shut; drawn per builder, so built in the view. */
const withIcons = <Message>(
  h: HtmlBuilder<Message>,
  nodes: ReadonlyArray<TreeView.TreeNode>,
): ReadonlyArray<TreeView.TreeNode> =>
  nodes.map(node =>
    node.children === undefined
      ? { ...node, icon: outline(h, FILE) }
      : {
          ...node,
          icon: outline(h, FOLDER),
          openIcon: outline(h, FOLDER_OPEN),
          children: withIcons(h, node.children),
        },
  )

// A folder or file before each label, and a guide down each open folder.
export const treeViewIcons = <Message>(
  style: NamedStyle<typeof TreeViewSlots>,
  model: TreeView.Model,
  onMessage: (message: TreeView.Message) => Message,
  h: HtmlBuilder<Message>,
): Html =>
  h.div(
    [h.Style({ inlineSize: '16rem' })],
    [
      TreeView.view(
        {
          label: 'Files',
          model,
          nodes: withIcons(h, TREE_ICONS),
          onMessage,
          style,
          mixins: TreeView.fluid,
        },
        h,
      ),
    ],
  )
// #endregion

// #region tree-view-checkboxes
/** Folded with `TreeView.update(TREE_ICONS, { checkable: true })`. */
export const treeViewCheckboxes = <Message>(
  style: NamedStyle<typeof TreeViewSlots>,
  model: TreeView.Model,
  onMessage: (message: TreeView.Message) => Message,
  h: HtmlBuilder<Message>,
): Html =>
  h.div(
    [h.Style({ display: 'grid', gap: '0.75rem', inlineSize: '16rem' })],
    [
      TreeView.view(
        {
          label: 'Files to commit',
          model,
          nodes: TREE_ICONS,
          onMessage,
          checkable: true,
          style,
          mixins: TreeView.fluid,
        },
        h,
      ),
      // `checked` holds the files alone; a folder reads checked or mixed from them.
      // `checkedAs('trunk')` lists the outermost fully checked rows, so a checked
      // folder stands for everything in it. Typing a name moves to that row.
      h.p(
        [],
        [
          model.checked.length === 0
            ? 'Nothing staged.'
            : `Staged: ${TreeView.checkedAs(TREE_ICONS, model.checked, 'trunk').join(', ')}.`,
        ],
      ),
    ],
  )
// #endregion

// #region carousel-basic
export const CarouselStyle = forSlots(CarouselSlots)(Recipes.Carousel({}))

const PLACES = ['Dunes', 'Coast', 'Ridge', 'Valley']

/** The slides `Carousel.update` steps through: the same count the view draws. */
export const CAROUSEL_LAYOUT: Carousel.CarouselLayout = { count: PLACES.length }

// The slide shown is the carousel's Model, folded with `Carousel.update(layout)`,
// which hears a swipe settle as well as the buttons.
export const carousel = <Message>(
  style: NamedStyle<typeof CarouselSlots>,
  model: Carousel.Model,
  onMessage: (message: Carousel.Message) => Message,
  h: HtmlBuilder<Message>,
): Html =>
  h.div(
    [h.Style({ inlineSize: 'min(28rem, 100%)' })],
    [
      Carousel.view(
        {
          label: 'Places',
          model,
          onMessage,
          slides: PLACES.map(place =>
            h.div(
              [
                h.Style({
                  display: 'grid',
                  placeItems: 'center',
                  blockSize: '10rem',
                  // A fill, not a border: the slide rounds its corners by clipping, and a square border clipped there looks cut.
                  background: 'color-mix(in oklab, currentColor 8%, transparent)',
                }),
              ],
              [place],
            ),
          ),
          style,
        },
        h,
      ),
    ],
  )
// #endregion

// #region carousel-autoplay
const SHOTS = ['Dunes', 'Coast', 'Ridge', 'Valley', 'Delta']

const shot = <Message>(h: HtmlBuilder<Message>, place: string): Html =>
  h.div(
    [
      h.Style({
        display: 'grid',
        placeItems: 'center',
        blockSize: '10rem',
        background: 'color-mix(in oklab, currentColor 8%, transparent)',
      }),
    ],
    [place],
  )

/** Folded with `Carousel.update(AUTOPLAY_LAYOUT)`; its Model from `Carousel.init({ id, autoplay: true })`. */
export const AUTOPLAY_LAYOUT: Carousel.CarouselLayout = { count: SHOTS.length, loop: true }

// Moves on every four seconds, the current dot filling as it waits. A pointer
// on it pauses it, focus from the keys stops it, and the button in its
// corner, first in the tab order, stops and starts it.
export const carouselAutoplay = <Message>(
  style: NamedStyle<typeof CarouselSlots>,
  model: Carousel.Model,
  onMessage: (message: Carousel.Message) => Message,
  h: HtmlBuilder<Message>,
): Html =>
  h.div(
    [h.Style({ inlineSize: 'min(28rem, 100%)' })],
    [
      Carousel.view(
        {
          label: 'Places',
          model,
          onMessage,
          loop: AUTOPLAY_LAYOUT.loop,
          slides: SHOTS.map(place => shot(h, place)),
          style,
        },
        h,
      ),
    ],
  )
// #endregion

// #region carousel-thumbnails
export const THUMBNAILS_LAYOUT: Carousel.CarouselLayout = { count: SHOTS.length }

// A small copy of each slide in place of the dots; the one shown is ringed.
export const carouselThumbnails = <Message>(
  style: NamedStyle<typeof CarouselSlots>,
  model: Carousel.Model,
  onMessage: (message: Carousel.Message) => Message,
  h: HtmlBuilder<Message>,
): Html =>
  h.div(
    [h.Style({ inlineSize: 'min(28rem, 100%)' })],
    [
      Carousel.view(
        {
          label: 'Places',
          model,
          onMessage,
          slides: SHOTS.map(place => shot(h, place)),
          thumbnails: SHOTS.map(place =>
            h.span(
              [h.Style({ display: 'grid', placeItems: 'center', fontSize: '0.625rem' })],
              [place],
            ),
          ),
          style,
        },
        h,
      ),
    ],
  )
// #endregion

// #region carousel-per-view
export const PER_VIEW_LAYOUT: Carousel.CarouselLayout = { count: SHOTS.length, perView: 2 }

// Two slides at once, a dot per place the track can rest: four for five slides.
export const carouselPerView = <Message>(
  style: NamedStyle<typeof CarouselSlots>,
  model: Carousel.Model,
  onMessage: (message: Carousel.Message) => Message,
  h: HtmlBuilder<Message>,
): Html =>
  h.div(
    [h.Style({ inlineSize: 'min(32rem, 100%)' })],
    [
      Carousel.view(
        {
          label: 'Places',
          model,
          onMessage,
          perView: PER_VIEW_LAYOUT.perView,
          slides: SHOTS.map(place => shot(h, place)),
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

// #region chat-message-basic
export const ChatMessageStyle = forSlots(ChatMessageSlots)(Recipes.ChatMessage({}))
export const ChatMessageGroupStyle = forSlots(ChatMessageGroupSlots)(Recipes.ChatMessageGroup({}))
const ChatAvatarStyle = forSlots(AvatarSlots)(Recipes.Avatar({ size: 'sm' }))

/** A conversation's column, as a chat pane would give it. */
const chatColumn = <Message>(h: HtmlBuilder<Message>, content: Html): Html =>
  h.div([h.Style({ inlineSize: 'min(32rem, 100%)' })], [content])

// A question and its answer. What each action sends is the application's:
// copy runs a clipboard Command, and a toggle such as "Good answer" is
// `pressed` from the Model.
export const chatMessage = <Message>(
  style: NamedStyle<typeof ChatMessageSlots>,
  liked: boolean,
  messages: { readonly onCopy: Message; readonly onLike: Message },
  h: HtmlBuilder<Message>,
): Html =>
  chatColumn(
    h,
    ChatMessage.group(
      {
        items: [
          {
            key: 'question',
            from: 'user',
            content: 'Which sizes does the ladder have?',
            time: { at: '2026-10-17T09:30', label: '9:30' },
          },
          {
            key: 'answer',
            from: 'assistant',
            author: 'Ada',
            avatar: Avatar.view({ name: 'Ada Lovelace', style: ChatAvatarStyle }, h),
            content: 'Two ends, 36px and 28px, with the step knob between them.',
            actions: [
              { key: 'copy', label: 'Copy', onClick: messages.onCopy },
              { key: 'like', label: 'Good answer', onClick: messages.onLike, pressed: liked },
            ],
            pinActions: true,
          },
        ],
        style: ChatMessageGroupStyle,
        messageStyle: style,
      },
      h,
    ),
  )
// #endregion

// #region chat-message-status
// A message the server refused offers a retry; one still on its way says so.
export const chatMessageStatus = <Message>(
  style: NamedStyle<typeof ChatMessageSlots>,
  retried: boolean,
  onRetry: Message,
  h: HtmlBuilder<Message>,
): Html =>
  chatColumn(
    h,
    ChatMessage.group(
      {
        items: [
          { key: 'sent', from: 'user', content: 'Book the room for Friday.', status: 'sent' },
          retried
            ? { key: 'failed', from: 'user', content: 'And invite Grace.', status: 'sent' }
            : {
                key: 'failed',
                from: 'user',
                content: 'And invite Grace.',
                status: 'failed',
                onRetry,
              },
          { key: 'sending', from: 'user', content: 'Thanks!', status: 'sending' },
        ],
        style: ChatMessageGroupStyle,
        messageStyle: style,
      },
      h,
    ),
  )
// #endregion

// #region chat-message-thread
export const ChatThreadStyle = forSlots(ChatMessageSlots)(Recipes.ChatMessage({ layout: 'thread' }))

// A channel: everyone at the start beside their picture, and a sender's next
// messages continued under the first.
export const chatMessageThread = <Message>(
  style: NamedStyle<typeof ChatMessageSlots>,
  h: HtmlBuilder<Message>,
): Html => {
  const person = (name: string) => Avatar.view({ name, style: ChatAvatarStyle }, h)
  return chatColumn(
    h,
    ChatMessage.group(
      {
        items: [
          {
            key: 'deploy',
            from: 'assistant',
            author: 'Grace',
            avatar: person('Grace Hopper'),
            content: 'Deploy is green.',
            time: { at: '2026-10-17T10:02', label: '10:02' },
          },
          {
            key: 'noon',
            from: 'assistant',
            author: 'Grace',
            avatar: person('Grace Hopper'),
            content: 'Shipping at noon.',
          },
          {
            key: 'thanks',
            from: 'user',
            author: 'Me',
            avatar: person('Me'),
            content: 'Great, thanks.',
          },
        ],
        style: ChatMessageGroupStyle,
        messageStyle: style,
      },
      h,
    ),
  )
}
// #endregion

// #region chat-message-streaming
export const ANSWER =
  'The ladder has two ends, 36 pixels and 28, and the step knob moves every control between them at once, so a region set compact shrinks its buttons, fields and rows together.'.split(
    ' ',
  )

// The same message drawn again as each word arrives: its body wraps greedily,
// so the words already shown stay on their lines, and it is aria-busy until
// the answer is whole. Here a press brings the next words; in an application,
// a stream does.
export const chatMessageStreaming = <Message>(
  style: NamedStyle<typeof ChatMessageSlots>,
  shown: number,
  onMore: Message,
  h: HtmlBuilder<Message>,
): Html => {
  const done = shown >= ANSWER.length
  return h.div(
    [
      h.Style({
        display: 'grid',
        gap: '0.75rem',
        justifyItems: 'start',
        inlineSize: 'min(32rem, 100%)',
      }),
    ],
    [
      ChatMessage.view(
        {
          from: 'assistant',
          author: 'Ada',
          content: h.p([], [ANSWER.slice(0, shown).join(' ')]),
          streaming: !done,
          style,
        },
        h,
      ),
      Button.view(
        { label: done ? 'Start over' : 'Next words', onClick: onMore, style: ButtonStyle },
        h,
      ),
    ],
  )
}
// #endregion

// #region message-scroller-basic
export const MessageScrollerStyle = forSlots(MessageScrollerSlots)(Recipes.MessageScroller({}))
const ConversationArea = forSlots(ScrollAreaSlots)(Recipes.ScrollArea({}))
const ChatControlStyle = forSlots(ButtonSlots)(
  Recipes.Button({ tone: 'neutral', variant: 'outline' }),
)

/** A message of the conversation the scroller holds. */
export const ChatEntry = Schema.Struct({
  id: Schema.String,
  from: Schema.Literals(['user', 'assistant']),
  text: Schema.String,
})
export type ChatEntry = typeof ChatEntry.Type

// Whether it follows the end is the scroller's Model, folded with
// `MessageScroller.update`; the application sends it `Appended` when a
// message lands at the end, and nothing when older ones load above.
export const messageScroller = <Message>(
  style: NamedStyle<typeof MessageScrollerSlots>,
  model: MessageScroller.Model,
  entries: ReadonlyArray<ChatEntry>,
  messages: {
    readonly onMessage: (message: MessageScroller.Message) => Message
    readonly onSend: Message
    readonly onLoadOlder: Message
  },
  h: HtmlBuilder<Message>,
): Html =>
  h.div(
    [h.Style({ display: 'grid', gap: '0.75rem', inlineSize: 'min(32rem, 100%)' })],
    [
      h.div(
        [h.Style({ blockSize: '20rem' })],
        [
          MessageScroller.view(
            {
              model,
              label: 'Conversation with Ada',
              content: [
                ChatMessage.group(
                  {
                    items: entries.map(({ id, from, text }) => ({ key: id, from, content: text })),
                    style: ChatMessageGroupStyle,
                    messageStyle: ChatMessageStyle,
                  },
                  h,
                ),
              ],
              onMessage: messages.onMessage,
              style,
              areaStyle: ConversationArea,
              areaMixins: ScrollArea.overlayBars,
            },
            h,
          ),
        ],
      ),
      h.div(
        [h.Style({ display: 'flex', gap: '0.5rem' })],
        [
          Button.view({ label: 'Send', onClick: messages.onSend, style: ButtonStyle }, h),
          Button.view(
            { label: 'Load older', onClick: messages.onLoadOlder, style: ChatControlStyle },
            h,
          ),
        ],
      ),
    ],
  )
// #endregion

// #region thinking-indicator-basic
export const ThinkingIndicatorStyle = forSlots(ThinkingIndicatorSlots)(
  Recipes.ThinkingIndicator({}),
)

// A polite status: three dots and shimmering words, and what it is doing.
export const thinkingIndicator = (
  style: NamedStyle<typeof ThinkingIndicatorSlots>,
  h: HtmlBuilder<never>,
): Html => ThinkingIndicator.view({ detail: 'Searching the web', style }, h)
// #endregion

// #region thinking-indicator-kinds
export const ThinkingIndicatorKinds = [
  { mark: 'dots', label: 'shimmer' },
  { mark: 'pulse', label: 'plain' },
  { mark: 'none', label: 'shimmer' },
  { mark: 'dots', label: 'hidden' },
] as const

const thinkingKindStyles = ThinkingIndicatorKinds.map(selection =>
  forSlots(ThinkingIndicatorSlots)(Recipes.ThinkingIndicator(selection)),
)

// Dots or a pulse beside the words, the words alone, or the dots alone with
// the words said, not shown. Each holds still under reduced motion.
export const thinkingIndicatorKinds = (h: HtmlBuilder<never>): Html =>
  h.div(
    [h.Style({ display: 'grid', gap: '1rem', justifyItems: 'start' })],
    thinkingKindStyles.map(style => ThinkingIndicator.view({ label: 'Thinking', style }, h)),
  )
// #endregion

// #region thinking-indicator-accent
// In the accent's ink: `thinkingIndicator(ThinkingAccentStyle, h)`.
export const ThinkingAccentStyle = forSlots(ThinkingIndicatorSlots)(
  Recipes.ThinkingIndicator({ tone: 'accent' }),
)
// #endregion

// #region thinking-steps-basic
export const ThinkingStepsStyle = forSlots(ThinkingStepsSlots)(Recipes.ThinkingSteps({}))

export const THOUGHT: ReadonlyArray<ThinkingStep> = [
  { id: 'plan', title: 'Planned the answer', state: 'done', duration: 900 },
  {
    id: 'search',
    title: 'Searched the web',
    state: 'done',
    duration: 2300,
    detail: 'Found four sources on tide tables.',
  },
  { id: 'read', title: 'Read the sources', state: 'done', duration: 1100 },
]

// Shut once done, saying how long it took; a press opens it. `open` is the
// Model's: none follows the work, and the press sends what the reader asked.
export const thinkingSteps = <Message>(
  style: NamedStyle<typeof ThinkingStepsSlots>,
  open: Option.Option<boolean>,
  onToggle: (open: boolean) => Message,
  h: HtmlBuilder<Message>,
): Html =>
  h.div(
    [h.Style({ inlineSize: 'min(28rem, 100%)' })],
    [ThinkingSteps.view({ id: 'preview-thought', steps: THOUGHT, open, onToggle, style }, h)],
  )
// #endregion

// #region thinking-steps-running
export const THINKING: ReadonlyArray<ThinkingStep> = [
  { id: 'search', title: 'Searched the web', state: 'done', duration: 2300 },
  { id: 'fetch', title: 'Fetching tides.example', state: 'failed', duration: 400 },
  { id: 'read', title: 'Reading 3 sources', state: 'running' },
  { id: 'write', title: 'Write the answer', state: 'pending' },
]

// Open while it runs, its summary the running step's title, shimmering.
export const thinkingStepsRunning = <Message>(
  style: NamedStyle<typeof ThinkingStepsSlots>,
  open: Option.Option<boolean>,
  onToggle: (open: boolean) => Message,
  h: HtmlBuilder<Message>,
): Html =>
  h.div(
    [h.Style({ inlineSize: 'min(28rem, 100%)' })],
    [ThinkingSteps.view({ id: 'preview-thinking', steps: THINKING, open, onToggle, style }, h)],
  )
// #endregion

// #region thinking-steps-tools
export const ToolStepsStyle = forSlots(ThinkingStepsSlots)(
  Recipes.ThinkingSteps({ variant: 'card' }),
)

const toolCall = <Message>(h: HtmlBuilder<Message>, input: string, output: string): Html =>
  h.pre(
    [h.Style({ margin: '0', whiteSpace: 'pre-wrap', fontSize: '0.8125rem' })],
    [`→ ${input}`, h.br([]), `← ${output}`],
  )

/** Built per builder: a tool call's detail is markup. */
export const toolSteps = <Message>(h: HtmlBuilder<Message>): ReadonlyArray<ThinkingStep> => [
  {
    id: 'weather',
    title: 'get_weather',
    state: 'done',
    duration: 640,
    detail: toolCall(h, '{ "city": "Lisbon" }', '{ "high": 24, "sky": "clear" }'),
  },
  {
    id: 'calendar',
    title: 'list_events',
    state: 'done',
    duration: 1200,
    detail: toolCall(h, '{ "day": "Saturday" }', '2 events'),
    steps: [
      { id: 'calendar-work', title: 'Work calendar', state: 'done', duration: 500 },
      { id: 'calendar-home', title: 'Home calendar', state: 'done', duration: 700 },
    ],
  },
]

// Each tool call's input and output under its own row, which a press shows
// and hides (`Accordion.toggled(openSteps, id, { multiple: true })`).
export const thinkingStepsTools = <Message>(
  style: NamedStyle<typeof ThinkingStepsSlots>,
  open: Option.Option<boolean>,
  onToggle: (open: boolean) => Message,
  openSteps: ReadonlyArray<string>,
  onToggleStep: (id: string) => Message,
  h: HtmlBuilder<Message>,
): Html =>
  h.div(
    [h.Style({ inlineSize: 'min(28rem, 100%)' })],
    [
      ThinkingSteps.view(
        {
          id: 'preview-tools',
          steps: toolSteps(h),
          open,
          onToggle,
          summary: 'Used 2 tools',
          openSteps,
          onToggleStep,
          style,
        },
        h,
      ),
    ],
  )
// #endregion

// #region questionnaire-basic
export const QuestionnaireStyle = forSlots(QuestionnaireSlots)(Recipes.Questionnaire({}))

export const TRIP_QUESTIONS: ReadonlyArray<Questionnaire.Question> = [
  Questionnaire.single({
    id: 'pace',
    prompt: 'How busy should the days be?',
    options: [
      { value: 'slow', label: 'Slow', description: 'One thing a day' },
      { value: 'full', label: 'Full', description: 'Morning to night' },
    ],
    other: 'Something else',
  }),
  Questionnaire.multiple({
    id: 'likes',
    prompt: 'What do you enjoy?',
    options: [
      { value: 'food', label: 'Food' },
      { value: 'museums', label: 'Museums' },
      { value: 'walks', label: 'Walks' },
    ],
  }),
  Questionnaire.text({ id: 'avoid', prompt: 'Anything to avoid?', optional: true }),
]

/**
 * Its Model from `Questionnaire.init({ id: 'preview-trip', questions:
 * TRIP_QUESTIONS })`, folded by `Questionnaire.update`, whose
 * `OutMessage.Answered` carries every answer once the form is sent.
 */
export const questionnaire = <Message>(
  style: NamedStyle<typeof QuestionnaireSlots>,
  model: Questionnaire.Model,
  onMessage: (message: Questionnaire.Message) => Message,
  h: HtmlBuilder<Message>,
): Html =>
  h.div(
    [h.Style({ inlineSize: 'min(28rem, 100%)' })],
    [
      Questionnaire.view(
        {
          model,
          onMessage,
          title: 'A few questions before I plan',
          style,
          radioGroup: RadioGroupStyle,
          checkboxGroup: CheckboxGroupStyle,
          input: InputStyle,
          textarea: TextareaStyle,
          submitButton: ButtonStyle,
        },
        h,
      ),
    ],
  )
// #endregion

// #region questionnaire-paged
export const QuestionnaireCardStyle = forSlots(QuestionnaireSlots)(
  Recipes.Questionnaire({ variant: 'card' }),
)
const QuestionBackStyle = forSlots(ButtonSlots)(
  Recipes.Button({ tone: 'neutral', variant: 'outline' }),
)

/**
 * One question at a time: its Model from `Questionnaire.init({ id:
 * 'preview-trip-paged', questions: TRIP_QUESTIONS, layout: 'paged' })`.
 * Next refuses a missing answer and moves the focus to the next question.
 */
export const questionnairePaged = <Message>(
  style: NamedStyle<typeof QuestionnaireSlots>,
  model: Questionnaire.Model,
  onMessage: (message: Questionnaire.Message) => Message,
  h: HtmlBuilder<Message>,
): Html =>
  h.div(
    [h.Style({ inlineSize: 'min(28rem, 100%)' })],
    [
      Questionnaire.view(
        {
          model,
          onMessage,
          style,
          radioGroup: RadioGroupStyle,
          checkboxGroup: CheckboxGroupStyle,
          input: InputStyle,
          button: QuestionBackStyle,
          submitButton: ButtonStyle,
        },
        h,
      ),
    ],
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

// #region timer-countdown
export const TimerStyle = forSlots(TimerSlots)(Recipes.Timer({ progress: 'bar' }))

/** The time counted is the timer's Model, folded with `Timer.update`; its ticks are its Commands. */
export const timerCountdown = <Message>(
  style: NamedStyle<typeof TimerSlots>,
  model: Timer.Model,
  onMessage: (message: Timer.Message) => Message,
  h: HtmlBuilder<Message>,
): Html => Timer.view({ model, onMessage, label: 'Tea', units: ['minutes', 'seconds'], style }, h)
// #endregion

// #region timer-stopwatch
/** A stopwatch whose Model ticks every 10ms (`Timer.init({ id, interval: 10 })`), so hundredths show. */
export const timerStopwatch = <Message>(
  style: NamedStyle<typeof TimerSlots>,
  model: Timer.Model,
  onMessage: (message: Timer.Message) => Message,
  h: HtmlBuilder<Message>,
): Html =>
  Timer.view(
    {
      model,
      onMessage,
      label: 'Lap',
      units: ['minutes', 'seconds', 'milliseconds'],
      labels: { start: 'Go', restart: 'Again' },
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
        { model, onMessage, label: 'Crop the photo', src: LANDSCAPE, style, slider: ZoomStyle },
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
          slider: ZoomStyle,
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

// #region chart-bar
export const ChartStyle = forSlots(ChartSlots)(Recipes.Chart({}))

/** A chart fills its container's width: the page gives it one. */
const chartFrame = <Message>(h: HtmlBuilder<Message>, chart: Html): Html =>
  h.div([h.Style({ inlineSize: 'min(36rem, 100%)' })], [chart])

export const visitors = {
  categories: ['January', 'February', 'March', 'April', 'May', 'June'],
  series: [
    { name: 'Desktop', values: [186, 305, 237, 73, 209, 214] },
    { name: 'Mobile', values: [80, 200, 120, 190, 130, 140] },
  ],
}

// The lit point is the chart's Model, folded with `Chart.update`.
export const chartBar = <Message>(
  style: NamedStyle<typeof ChartSlots>,
  model: Chart.Model,
  onMessage: (message: Chart.Message) => Message,
  h: HtmlBuilder<Message>,
): Html =>
  chartFrame(
    h,
    Chart.view(
      {
        id: 'preview-visitors',
        label: 'Visitors',
        description: 'January to June',
        kind: 'bar',
        ...visitors,
        model,
        onMessage,
        style,
      },
      h,
    ),
  )
// #endregion

// #region chart-line
export const chartLine = <Message>(
  style: NamedStyle<typeof ChartSlots>,
  model: Chart.Model,
  onMessage: (message: Chart.Message) => Message,
  h: HtmlBuilder<Message>,
): Html =>
  chartFrame(
    h,
    Chart.view(
      {
        id: 'line-visitors',
        label: 'Visitors',
        kind: 'line',
        ...visitors,
        model,
        onMessage,
        format: value => `${value} k`,
        style,
      },
      h,
    ),
  )
// #endregion

// #region chart-area
export const SmallChartStyle = forSlots(ChartSlots)(Recipes.Chart({ height: 'sm', grid: 'zero' }))

// One series: no legend, the title names it.
export const chartArea = <Message>(
  style: NamedStyle<typeof ChartSlots>,
  model: Chart.Model,
  onMessage: (message: Chart.Message) => Message,
  h: HtmlBuilder<Message>,
): Html =>
  chartFrame(
    h,
    Chart.view(
      {
        id: 'area-signups',
        label: 'Sign-ups',
        kind: 'area',
        categories: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
        series: [{ name: 'Sign-ups', values: [42, 58, 51, 77, 69, 31, 24] }],
        model,
        onMessage,
        style,
      },
      h,
    ),
  )
// #endregion

// #region chart-donut
export const chartDonut = <Message>(
  style: NamedStyle<typeof ChartSlots>,
  model: Chart.Model,
  onMessage: (message: Chart.Message) => Message,
  h: HtmlBuilder<Message>,
): Html =>
  chartFrame(
    h,
    Chart.view(
      {
        id: 'donut-browsers',
        label: 'Visitors by browser',
        kind: 'donut',
        slices: [
          { name: 'Chrome', value: 275 },
          { name: 'Safari', value: 200 },
          { name: 'Firefox', value: 187 },
          { name: 'Edge', value: 173 },
          { name: 'Other', value: 90 },
        ],
        totalLabel: 'Visitors',
        model,
        onMessage,
        style,
      },
      h,
    ),
  )
// #endregion

// #region chart-table
// The table assistive technology reads, shown for every reader.
export const chartTable = <Message>(
  style: NamedStyle<typeof ChartSlots>,
  model: Chart.Model,
  onMessage: (message: Chart.Message) => Message,
  h: HtmlBuilder<Message>,
): Html =>
  chartFrame(
    h,
    Chart.view(
      {
        id: 'table-visitors',
        label: 'Visitors',
        kind: 'bar',
        ...visitors,
        categoryLabel: 'Month',
        table: 'shown',
        model,
        onMessage,
        style,
      },
      h,
    ),
  )
// #endregion

// #region chart-colors
// Mobile names its color, so hiding Desktop does not repaint it.
export const chartColors = <Message>(
  style: NamedStyle<typeof ChartSlots>,
  model: Chart.Model,
  onMessage: (message: Chart.Message) => Message,
  h: HtmlBuilder<Message>,
): Html =>
  chartFrame(
    h,
    Chart.view(
      {
        id: 'colors-visitors',
        label: 'Mobile visitors',
        kind: 'bar',
        categories: visitors.categories,
        series: [{ name: 'Mobile', values: [80, 200, 120, 190, 130, 140], color: 2 }],
        legend: true,
        model,
        onMessage,
        style,
      },
      h,
    ),
  )
// #endregion

// #region cascade-select-columns
export const CascadeSelectStyle = forSlots(CascadeSelectSlots)(Recipes.CascadeSelect({}))

/** Folded with `CascadeSelect.update(CASCADE_PLACES)`; its Model from `CascadeSelect.init({ id })`. */
export const CASCADE_PLACES: CascadeSelect.Config = {
  nodes: [
    {
      id: 'ca',
      label: 'Canada',
      children: [
        {
          id: 'on',
          label: 'Ontario',
          children: [
            { id: 'tor', label: 'Toronto' },
            { id: 'ott', label: 'Ottawa' },
          ],
        },
        { id: 'qc', label: 'Quebec', children: [{ id: 'mtl', label: 'Montreal' }] },
      ],
    },
    {
      id: 'jp',
      label: 'Japan',
      children: [
        { id: 'kanto', label: 'Kantō', children: [{ id: 'tyo', label: 'Tokyo' }] },
        { id: 'kansai', label: 'Kansai', children: [{ id: 'osa', label: 'Osaka' }] },
      ],
    },
    { id: 'sg', label: 'Singapore' },
  ],
}

// A city chosen through its country and region: a column per level, the
// arrows within and between them, the value the path of ids.
export const cascadeSelect = <Message>(
  style: NamedStyle<typeof CascadeSelectSlots>,
  model: CascadeSelect.Model,
  onMessage: (message: CascadeSelect.Message) => Message,
  h: HtmlBuilder<Message>,
): Html =>
  CascadeSelect.view(
    {
      model,
      config: CASCADE_PLACES,
      onMessage,
      label: 'City',
      placeholder: 'Choose a city',
      levels: ['Country', 'Region', 'City'],
      clearable: true,
      style,
    },
    h,
  )
// #endregion

// #region cascade-select-drill
// One level at a time, with a way back: a phone's width holds one column.
export const cascadeSelectDrill = <Message>(
  style: NamedStyle<typeof CascadeSelectSlots>,
  model: CascadeSelect.Model,
  onMessage: (message: CascadeSelect.Message) => Message,
  h: HtmlBuilder<Message>,
): Html =>
  CascadeSelect.view(
    { model, config: CASCADE_PLACES, onMessage, label: 'City', layout: 'drill', style },
    h,
  )
// #endregion

// #region floating-panel-basic
export const FloatingPanelStyle = forSlots(FloatingPanelSlots)(Recipes.FloatingPanel({}))

/** The notes panel and the order the page's panels stack in. */
export interface Panels {
  readonly notes: FloatingPanel.Model
  readonly order: ReadonlyArray<string>
}

// Folded with `FloatingPanel.update()`; opened with `FloatingPanel.open(model)`,
// and its `Raised` folded into `order` with `FloatingPanel.raise`. Closing it
// gives focus back to the button that opened it, by `FloatingPanel.focusReturn`.
export const floatingPanel = <Message>(
  style: NamedStyle<typeof FloatingPanelSlots>,
  panels: Panels,
  onMessage: (message: FloatingPanel.Message) => Message,
  opened: Message,
  h: HtmlBuilder<Message>,
): Html =>
  h.div(
    [],
    [
      h.button(
        SlotView.buildersFor(ButtonSlots, [ButtonStyle.mixin], {
          input: undefined,
          h,
        }).button.attrs([h.Id('preview-panel-opener'), h.Type('button'), h.OnClick(opened)]),
        ['Open notes'],
      ),
      FloatingPanel.view(
        {
          model: panels.notes,
          onMessage,
          title: 'Notes',
          content: h.p([], ['Drag the header, resize from an edge, or use the arrows.']),
          order: panels.order,
          style,
          mixins: FloatingPanel.focusReturn,
        },
        h,
      ),
    ],
  )
// #endregion

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

// #region search-field-basic
export const SearchFieldStyle = forSlots(SearchFieldSlots)(Recipes.SearchField({}))

/** What typing and clearing send. Answer `onClear` with `SearchField.Focus`: the button leaves with its focus. */
export interface SearchMessages<Message> {
  readonly onInput: (value: string) => Message
  readonly onClear: Message
}

// The application owns the text. Escape clears a field with text, and one
// without it reaches whatever encloses the field, such as a dialog.
export const searchField = <Message>(
  style: NamedStyle<typeof SearchFieldSlots>,
  query: string,
  messages: SearchMessages<Message>,
  h: HtmlBuilder<Message>,
): Html =>
  SearchField.view(
    {
      id: 'preview-search',
      label: 'Search recipes',
      placeholder: 'Search recipes',
      value: query,
      onInput: messages.onInput,
      onClear: messages.onClear,
      style,
    },
    h,
  )
// #endregion

// #region search-field-routes
export const RECIPES = ['Apple crumble', 'Apple pie', 'Banana bread', 'Lemon tart', 'Carrot cake']

/** The recipes whose name holds every word of the query. */
export const recipesFor = (query: string): ReadonlyArray<string> =>
  query
    .toLowerCase()
    .split(/\s+/)
    .filter(word => word !== '')
    .reduce((found, word) => found.filter(name => name.toLowerCase().includes(word)), RECIPES)

export interface KeyedSearch<Message> extends SearchMessages<Message> {
  /** Sent with 1 or -1 by the arrow keys. */
  readonly onMove: (by: number) => Message
}

// The arrows are the application's: `routes` adds them to the field's own
// Escape under one keydown owner, and a key another route already takes is
// a diagnostic naming both. The text stays the field's.
export const searchFieldRoutes = <Message>(
  style: NamedStyle<typeof SearchFieldSlots>,
  search: { readonly query: string; readonly active: number },
  messages: KeyedSearch<Message>,
  h: HtmlBuilder<Message>,
): Html =>
  h.div(
    [h.Style({ display: 'grid', gap: '0.5rem' })],
    [
      SearchField.view(
        {
          id: 'preview-search-keys',
          label: 'Find a recipe',
          placeholder: 'Type apple, then press the down arrow',
          value: search.query,
          onInput: messages.onInput,
          onClear: messages.onClear,
          routes: [
            Behaviors.Keys.route<string, Message>('Next', {
              on: [Behaviors.Keys.chord('ArrowDown')],
              handle: () => Option.some(messages.onMove(1)),
            }),
            Behaviors.Keys.route<string, Message>('Previous', {
              on: [Behaviors.Keys.chord('ArrowUp')],
              handle: () => Option.some(messages.onMove(-1)),
            }),
          ],
          style,
        },
        h,
      ),
      h.ul(
        [h.Style({ margin: '0', paddingInlineStart: '1.25rem' })],
        recipesFor(search.query).map((name, index) =>
          h.li(
            [
              h.Key(name),
              ...(index === search.active
                ? [h.AriaCurrent('true'), h.Style({ fontWeight: '600' })]
                : []),
            ],
            [name],
          ),
        ),
      ),
    ],
  )
// #endregion

// #region search-field-states
// Invalid names a field that cannot be searched yet; disabled takes no text
// or keys and draws no clear button.
export const searchFieldStates = <Message>(
  style: NamedStyle<typeof SearchFieldSlots>,
  messages: SearchMessages<Message>,
  h: HtmlBuilder<Message>,
): Html =>
  h.div(
    [h.Style({ display: 'grid', gap: '0.5rem' })],
    [
      SearchField.view(
        {
          id: 'preview-search-invalid',
          label: 'Search by order number',
          value: 'ord-',
          invalid: true,
          onInput: messages.onInput,
          onClear: messages.onClear,
          style,
        },
        h,
      ),
      SearchField.view(
        {
          id: 'preview-search-disabled',
          label: 'Search is off',
          placeholder: 'Search is off',
          value: '',
          disabled: true,
          onInput: messages.onInput,
          onClear: messages.onClear,
          style,
        },
        h,
      ),
    ],
  )
// #endregion

// #region toolbar-basic
export const ToolbarStyle = forSlots(ToolbarSlots)(Recipes.Toolbar({}))
const ToolStyle = forSlots(ButtonSlots)(Recipes.Button({ tone: 'neutral', variant: 'icon' }))

export interface ToolbarState {
  /** The one tab stop: the control focused last. */
  readonly roving: RovingTabindex.Model
  readonly pressed: ReadonlyArray<string>
  readonly align: string
}

export interface ToolbarMessages<Message> {
  readonly onFocus: (id: string) => Message
  readonly onPress: (id: string) => Message
}

const LINK = 'M6.5 9.5l3-3M7 4.5l1-1a2.5 2.5 0 0 1 3.5 3.5l-1 1M9 11.5l-1 1A2.5 2.5 0 0 1 4.5 9l1-1'

// One tab stop for every control, the arrows (Home and End too) between them,
// and a disabled one skipped. The controls are the application's own Buttons,
// handed the stop's attributes; the toolbar adds no markup around them.
export const toolbar = <Message>(
  style: NamedStyle<typeof ToolbarSlots>,
  state: ToolbarState,
  messages: ToolbarMessages<Message>,
  direction: 'ltr' | 'rtl',
  h: HtmlBuilder<Message>,
): Html => {
  const tool = (
    id: string,
    label: string,
    icon: string,
    on: boolean,
    disabled = false,
  ): ToolbarControl<Message> => ({
    id,
    disabled,
    draw: stop =>
      Button.view(
        {
          label,
          icon: outline(h, icon),
          pressed: on,
          disabled: stop.disabled,
          onClick: messages.onPress(id),
          attributes: { button: stop.attributes },
          style: ToolStyle,
        },
        h,
      ),
  })
  return Toolbar.view(
    {
      id: 'preview-toolbar',
      label: 'Text formatting',
      roving: state.roving,
      onFocus: messages.onFocus,
      direction,
      items: [
        tool(
          'bold',
          'Bold',
          'M4.5 2.5h4.25a2.75 2.75 0 0 1 0 5.5H4.5zM4.5 8h5a2.75 2.75 0 0 1 0 5.5h-5z',
          state.pressed.includes('bold'),
        ),
        tool(
          'italic',
          'Italic',
          'M7 2.5h5M4 13.5h5M10 2.5l-4 11',
          state.pressed.includes('italic'),
        ),
        tool(
          'underline',
          'Underline',
          'M4.5 2.5v5a3.5 3.5 0 0 0 7 0v-5M3.5 14h9',
          state.pressed.includes('underline'),
        ),
        'separator',
        {
          label: 'Alignment',
          controls: [
            tool('left', 'Align left', 'M2.5 4h11M2.5 8h7M2.5 12h9', state.align === 'left'),
            tool('center', 'Align center', 'M2.5 4h11M4.5 8h7M3.5 12h9', state.align === 'center'),
            tool('right', 'Align right', 'M2.5 4h11M6.5 8h7M4.5 12h9', state.align === 'right'),
          ],
        },
        'separator',
        tool('link', 'Link', LINK, false, true),
      ],
      style,
    },
    h,
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

// #region picker-basic
export const PickerStyle = forSlots(PickerSlots)(Recipes.Picker({}))
const PickerListboxStyle = forSlots(ListboxSlots)(Recipes.Listbox({ width: 'trigger' }))
const PickerSheetStyle = forSlots(DialogSlots)(Recipes.Sheet({}))

export const SORTS = ['relevance', 'price', 'name'] as const
export const Sort = Schema.Literals(SORTS)
export type Sort = typeof Sort.Type

export const SORT_OPTIONS: ReadonlyArray<Picker.PickerOption<Sort>> = [
  { value: 'relevance', label: 'Most relevant' },
  { value: 'price', label: 'Lowest price', description: 'The cheapest first' },
  { value: 'name', label: 'Name', description: 'A to Z' },
]

// One control, one Model and one set of Messages at every width: a dropdown
// above the theme's `md` breakpoint, and below it an opener that shows the
// options in a bottom sheet. Both are drawn and the style shows one, so a
// server render is right at any width; narrow the window to see the sheet.
export const picker = <Message>(
  style: NamedStyle<typeof PickerSlots>,
  state: { readonly picker: Picker.Model; readonly sort: Option.Option<Sort> },
  onMessage: (message: Picker.Message) => Message,
  h: HtmlBuilder<Message>,
): Html =>
  Picker.view(
    {
      model: state.picker,
      onMessage,
      label: 'Sort',
      options: SORT_OPTIONS,
      value: state.sort,
      placeholder: 'Sort by',
      style,
      listbox: [PickerListboxStyle.mixin],
      sheet: [PickerSheetStyle.mixin],
    },
    h,
  )
// #endregion

// #region label-basic
export const LabelStyle = forSlots(LabelSlots)(Recipes.Label({}))

// `for` is the id the control carries. Pass the one `FieldAssociation`
// derived, so there is no second naming scheme beside it.
export const label = (style: NamedStyle<typeof LabelSlots>, h: HtmlBuilder<never>): Html =>
  h.div(
    [h.Style({ display: 'grid', gap: '0.375rem', inlineSize: 'min(100%, 18rem)' })],
    [
      Label.view({ for: 'label-email', text: 'Email address', style }, h),
      Input.view(
        {
          id: 'label-email',
          type: 'email',
          style: InputStyle,
          draw: (resolved, h) => h.input(resolved.input),
        },
        h,
      ),
    ],
  )
// #endregion

// #region icon-basic
export const IconStyle = forSlots(IconSlots)(Recipes.Icon({}))

// An icon is data (here from `icons.json`, built by the icons plugin). With a
// `label` it is an image that has a name; without one it is ornament and a
// screen reader skips it. Two copies of one icon on a page need a `key`.
export const icon = (style: NamedStyle<typeof IconSlots>, h: HtmlBuilder<never>): Html =>
  h.div(
    [h.Style({ display: 'flex', alignItems: 'center', gap: '1rem' })],
    [
      Icon.view({ icon: icons.check, label: 'Saved', style }, h),
      Icon.view({ icon: icons.link, label: 'Linked', key: 'link', style }, h),
      h.span([], ['Copy ', Icon.view({ icon: icons.copy, key: 'copy', style }, h)]),
    ],
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

// #region fieldset-basic
export const FieldsetStyle = forSlots(FieldsetSlots)(Recipes.Fieldset({ variant: 'bordered' }))

// The legend names the group and the description is read after it: the base
// derives their ids (`legendId`, `descriptionId`) and wires `aria-describedby`.
// A disabled fieldset disables every control in it, and dims its legend and description.
export const fieldset = (style: NamedStyle<typeof FieldsetSlots>, h: HtmlBuilder<never>): Html => {
  const group = (id: string, disabled: boolean): Html =>
    UiFieldset.view(
      {
        id,
        isDisabled: disabled,
        hasDescription: true,
        toView: Fieldset.toView(
          [style.mixin],
          { input: undefined, h },
          ({ fieldset, legend, description }) =>
            h.fieldset(fieldset, [
              h.legend(legend, [disabled ? 'Billing address (locked)' : 'Shipping address']),
              h.p(description, ['Where the order is sent. We never share it.']),
              Input.view(
                {
                  id: `${id}-street`,
                  type: 'text',
                  style: InputStyle,
                  draw: (resolved, h) =>
                    h.div([], [h.label(resolved.label, ['Street']), h.input(resolved.input)]),
                },
                h,
              ),
            ]),
        ),
      },
      h,
    )
  return h.div(
    [h.Style({ display: 'grid', gap: '1rem', inlineSize: 'min(100%, 24rem)' })],
    [group('shipping', false), group('billing', true)],
  )
}
// #endregion
