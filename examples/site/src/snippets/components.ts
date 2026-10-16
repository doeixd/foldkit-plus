/**
 * Each shipped component as an application draws it, over the theme module
 * `/create` hands out (`./theme.ts`). A component's page shows its region,
 * and its previews call the function the region defines with the style the
 * reader selected, so the code on the page is the code that drew it.
 */
import { Option, Schema } from 'effect'
import { Calendar as FoldkitCalendar } from 'foldkit'
import {
  Calendar as UiCalendar,
  Combobox as UiCombobox,
  DatePicker as UiDatePicker,
  Dialog as UiDialog,
  HoverIntent as UiHoverIntent,
  Nav as UiNav,
  Listbox as UiListbox,
  Popover as UiPopover,
  RadioGroup as UiRadioGroup,
  Tabs as UiTabs,
} from '@foldkit/ui'
import * as UiCheckbox from '@foldkit/ui/checkbox'
import * as UiSelect from '@foldkit/ui/select'
import * as UiSwitch from '@foldkit/ui/switch'
import * as UiTooltip from '@foldkit/ui/tooltip'
import type * as UiVirtualList from '@foldkit/ui/virtualList'
import type { Html, HtmlBuilder } from 'foldkit/html'
import { SlotView, type NamedStyle } from 'foldkit-mixins'
import {
  Accordion,
  AccordionSlots,
  Anchor,
  HoverIntent,
  HoverIntentSlots,
  Alert,
  AlertSlots,
  Avatar,
  AvatarSlots,
  Badge,
  BadgeSlots,
  Breadcrumb,
  BreadcrumbSlots,
  Button,
  ButtonGroup,
  ButtonGroupSlots,
  ButtonSlots,
  Calendar,
  CalendarSlots,
  Card,
  CardGroupSlots,
  CardSlots,
  CheckboxGroup,
  CheckboxGroupSlots,
  Command,
  CommandSlots,
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
  TagsInput,
  TagsInputSlots,
  PasswordInput,
  PasswordInputSlots,
  Rating,
  RatingSlots,
  Steps,
  StepsSlots,
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
  Combobox,
  ComboboxSlots,
  ComboboxView,
  DatePicker,
  DatePickerSlots,
  DatePickerView,
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
  Pagination,
  PaginationSlots,
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
  Skeleton,
  SkeletonSlots,
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
} from 'foldkit-mixins-ui'

import { forSlots } from './theme.js'

// #region button-basic
export const ButtonStyle = forSlots(ButtonSlots)(Recipes.Button({}))

export const button = (style: NamedStyle<typeof ButtonSlots>, h: HtmlBuilder<never>): Html =>
  Button.view({ label: 'Save changes', style }, h)
// #endregion

// #region button-toggle
// Toggle buttons: `pressed` draws `aria-pressed` and the recipe's pressed
// look. Which are on is the Model's; each press sends the format.
export const Format = Schema.Literals(['bold', 'italic', 'underline'])
export type Format = typeof Format.Type

const formatLabels: Record<Format, string> = {
  bold: 'Bold',
  italic: 'Italic',
  underline: 'Underline',
}

export const toggleButtons = <Message>(
  style: NamedStyle<typeof ButtonSlots>,
  pressed: ReadonlyArray<Format>,
  onToggle: (format: Format) => Message,
  h: HtmlBuilder<Message>,
): Html =>
  h.div(
    [
      h.Role('group'),
      h.AriaLabel('Text style'),
      h.Style({ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }),
    ],
    Format.literals.map(format =>
      Button.view(
        {
          label: formatLabels[format],
          pressed: pressed.includes(format),
          onClick: onToggle(format),
          style,
        },
        h,
      ),
    ),
  )
// #endregion

// #region button-group
export const ButtonGroupStyle = forSlots(ButtonGroupSlots)(Recipes.ButtonGroup({}))
const GroupedStyle = forSlots(ButtonSlots)(Recipes.Button({ tone: 'neutral', variant: 'outline' }))

export const buttonGroup = (
  style: NamedStyle<typeof ButtonGroupSlots>,
  h: HtmlBuilder<never>,
): Html =>
  ButtonGroup.view(
    {
      label: 'Text alignment',
      items: ['Left', 'Center', 'Right'].map(label =>
        Button.view({ label, style: GroupedStyle }, h),
      ),
      style,
    },
    h,
  )
// #endregion

// #region badge-tinted
export const BadgeStyle = forSlots(BadgeSlots)(
  Recipes.Badge({
    attribute: 'data-tone',
    tones: { live: 'success', review: 'warning', failed: 'error', draft: 'info' },
  }),
)

// Tinted, the default: a pill in the tone's tint.

export const badgesTinted = (style: NamedStyle<typeof BadgeSlots>, h: HtmlBuilder<never>): Html =>
  h.div(
    [h.Style({ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '0.5rem' })],
    [
      Badge.view({ text: 'Live', tone: 'live', style }, h),
      Badge.view({ text: 'In review', tone: 'review', style }, h),
      Badge.view({ text: 'Failed', tone: 'failed', style }, h),
      Badge.view({ text: 'Draft', tone: 'draft', style }, h),
      Badge.view({ text: 'Archived', style }, h),
    ],
  )
// #endregion

// #region badge-dot
export const BadgeDotStyle = forSlots(BadgeSlots)(
  Recipes.Badge({
    attribute: 'data-tone',
    tones: { live: 'success', review: 'warning', failed: 'error', draft: 'info' },
    appearance: 'dot',
  }),
)

// Dot, a coloured dot before plain words: a status beside what it is about,
// quiet enough for every row of a list.

export const badgesDot = (style: NamedStyle<typeof BadgeSlots>, h: HtmlBuilder<never>): Html =>
  h.ul(
    [h.Style({ display: 'grid', gap: '0.5rem', margin: '0', padding: '0', listStyle: 'none' })],
    [
      { site: 'api.example.com', status: 'Live', tone: 'live' },
      { site: 'staging.example.com', status: 'Deploying', tone: 'review' },
      { site: 'old.example.com', status: 'Down', tone: 'failed' },
    ].map(({ site, status, tone }) =>
      h.li(
        [h.Style({ display: 'flex', justifyContent: 'space-between', gap: '1rem' })],
        [h.span([], [site]), Badge.view({ text: status, tone, style }, h)],
      ),
    ),
  )
// #endregion

// #region badge-outline
export const BadgeOutlineStyle = forSlots(BadgeSlots)(
  Recipes.Badge({
    attribute: 'data-tone',
    tones: { live: 'success', review: 'warning', failed: 'error', draft: 'info' },
    appearance: 'outline',
  }),
)

// Outline, a line in the tone around words in its ink: labels that sit
// beside a title without outweighing it.

export const badgesOutline = (style: NamedStyle<typeof BadgeSlots>, h: HtmlBuilder<never>): Html =>
  h.p(
    [h.Style({ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '0.5rem' })],
    [
      h.strong([], ['foldkit-remote']),
      Badge.view({ text: 'v0.4', style }, h),
      Badge.view({ text: 'Beta', tone: 'draft', style }, h),
      Badge.view({ text: 'Breaking change', tone: 'failed', style }, h),
    ],
  )
// #endregion

// #region badge-solid
export const BadgeSolidStyle = forSlots(BadgeSlots)(
  Recipes.Badge({
    attribute: 'data-tone',
    tones: { live: 'success', review: 'warning', failed: 'error', draft: 'info' },
    appearance: 'solid',
  }),
)

// Solid, the tone's fill: the loudest, for the one thing to see first, such
// as a count waiting or a word that must not be missed.

export const badgesSolid = (style: NamedStyle<typeof BadgeSlots>, h: HtmlBuilder<never>): Html =>
  h.div(
    [h.Style({ display: 'grid', gap: '0.5rem', justifyItems: 'start' })],
    [
      h.p(
        [h.Style({ display: 'flex', alignItems: 'center', gap: '0.5rem', margin: '0' })],
        ['Inbox', Badge.view({ text: '12', tone: 'failed', style }, h)],
      ),
      h.p(
        [h.Style({ display: 'flex', alignItems: 'center', gap: '0.5rem', margin: '0' })],
        [Badge.view({ text: 'New', tone: 'draft', style }, h), 'Comments now thread.'],
      ),
    ],
  )
// #endregion

// #region alert-inline
export const AlertStyle = forSlots(AlertSlots)(Recipes.Alert({}))

// Inline, a status inside the content.
export const alertInline = (style: NamedStyle<typeof AlertSlots>, h: HtmlBuilder<never>): Html =>
  Alert.view(
    {
      layout: 'inline',
      title: 'A new version is out',
      description: 'Reload to pick up the latest fixes. Your drafts are kept.',
      actions: [{ label: 'Reload', href: '#' }],
      style,
    },
    h,
  )
// #endregion

// #region alert-banner
// As a banner, a named landmark across the page.
export const alertBanner = (style: NamedStyle<typeof AlertSlots>, h: HtmlBuilder<never>): Html =>
  Alert.view(
    {
      layout: 'banner',
      label: 'Announcement',
      title: 'Version 2 is out, with offline sync.',
      actions: [{ label: 'Read the notes', href: '#' }],
      style,
    },
    h,
  )
// #endregion

// #region card
export const CardStyle = forSlots(CardSlots)(Recipes.Card({}))

/** A sparkle in the text's color, for the card's media tile. */
const sparkle = <Message>(h: HtmlBuilder<Message>): Html =>
  h.svg(
    [h.ViewBox('0 0 16 16'), h.Attribute('fill', 'currentColor'), h.AriaHidden(true)],
    [h.path([h.Attribute('d', 'M8 0l2 6 6 2-6 2-2 6-2-6-6-2 6-2z')], [])],
  )

/** Whether the card was dismissed, and the Messages that dismiss it and bring it back. */
export interface Dismissal<Message> {
  readonly dismissed: boolean
  readonly onDismiss: Message
  readonly onRestore: Message
}

export const card = <Message>(
  style: NamedStyle<typeof CardSlots>,
  dismissal: Dismissal<Message>,
  h: HtmlBuilder<Message>,
): Html =>
  dismissal.dismissed
    ? Button.view(
        { label: 'Bring the card back', onClick: dismissal.onRestore, style: ButtonStyle },
        h,
      )
    : Card.view(
        {
          media: sparkle(h),
          title: 'Invite your team',
          description: 'Everyone you invite can edit every page.',
          action: Badge.view({ text: 'New', tone: 'live', style: BadgeStyle }, h),
          content: h.p([], ['Three seats left on the Starter plan.']),
          footer: Button.view({ label: 'Send invites', style: ButtonStyle }, h),
          dismiss: { onDismiss: dismissal.onDismiss },
          style,
        },
        h,
      )
// #endregion

// #region card-group
export const CardGroupStyle = forSlots(CardGroupSlots)(Recipes.CardGroup({}))
export const PlanStyle = forSlots(CardSlots)(
  Recipes.Card({ surface: 'plain', orientation: 'inline' }),
)

const plans = [
  { key: 'starter', title: 'Starter', description: 'One editor and three pages.', price: 'Free' },
  { key: 'team', title: 'Team', description: 'Ten editors and every page.', price: '$12' },
  { key: 'business', title: 'Business', description: 'Sign-on and audit logs.', price: '$40' },
  { key: 'enterprise', title: 'Enterprise', description: 'Talk to us first.', price: 'Soon' },
] as const

/** The plan chosen, by key, and the Message that chooses another. */
export interface Choice<Message> {
  readonly chosen: string
  readonly onChoose: (key: string) => Message
}

export const cardGroup = <Message>(
  style: NamedStyle<typeof CardGroupSlots>,
  choice: Choice<Message>,
  h: HtmlBuilder<Message>,
): Html =>
  Card.group(
    {
      label: 'Plans',
      cards: plans.map(plan => ({
        key: plan.key,
        title: plan.title,
        description: plan.description,
        footer: h.span([], [plan.price]),
        selected: plan.key === choice.chosen,
        disabled: plan.key === 'enterprise',
        press: { onClick: choice.onChoose(plan.key) },
      })),
      style,
      cardStyle: PlanStyle,
    },
    h,
  )
// #endregion

// #region input
export const InputStyle = forSlots(InputSlots)(Recipes.Input({}))

export const input = (style: NamedStyle<typeof InputSlots>, h: HtmlBuilder<never>): Html =>
  Input.view(
    {
      id: 'email',
      type: 'email',
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

// #region avatar
export const AvatarStyle = forSlots(AvatarSlots)(Recipes.Avatar({}))

export const avatars = (style: NamedStyle<typeof AvatarSlots>, h: HtmlBuilder<never>): Html =>
  h.div(
    [h.Style({ display: 'flex', alignItems: 'center', gap: '0.5rem' })],
    [
      Avatar.view({ name: 'Ada Lovelace', src: portrait(210), style }, h),
      Avatar.view({ name: 'Grace Hopper', src: portrait(20), style }, h),
      Avatar.view({ name: 'Alan Turing', src: portrait(140), style }, h),
    ],
  )
// #endregion

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

// #region separator
export const SeparatorStyle = forSlots(SeparatorSlots)(Recipes.Separator({}))

export const separator = (style: NamedStyle<typeof SeparatorSlots>, h: HtmlBuilder<never>): Html =>
  h.div(
    [],
    [
      h.p([], ['Account']),
      Separator.view({ style }, h),
      h.p([], ['Billing']),
      Separator.view({ style }, h),
      h.p([], ['Members']),
    ],
  )
// #endregion

// #region skeleton
export const SkeletonStyle = forSlots(SkeletonSlots)(Recipes.Skeleton({}))

export const skeleton = (style: NamedStyle<typeof SkeletonSlots>, h: HtmlBuilder<never>): Html =>
  h.div(
    [h.Style({ display: 'grid', gap: '0.5rem', inlineSize: 'min(20rem, 100%)' })],
    [
      Skeleton.view({ label: 'Loading the profile', style }, h),
      Skeleton.view({ style }, h),
      Skeleton.view({ style }, h),
    ],
  )
// #endregion

// #region spinner
export const SpinnerStyle = forSlots(SpinnerSlots)(Recipes.Spinner({}))

export const spinner = (style: NamedStyle<typeof SpinnerSlots>, h: HtmlBuilder<never>): Html =>
  Spinner.view({ label: 'Saving', style }, h)
// #endregion

// #region table
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
        { header: 'Invoice', value: row => row.id },
        { header: 'Status', value: row => row.status },
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

/** A line icon in the text's colour, from one path on a 16-unit square. */
const outline = <Message>(h: HtmlBuilder<Message>, d: string): Html =>
  h.svg(
    [
      h.ViewBox('0 0 16 16'),
      h.Attribute('width', '1em'),
      h.Attribute('height', '1em'),
      h.Attribute('fill', 'none'),
      h.Attribute('stroke', 'currentColor'),
      h.Attribute('stroke-width', '1.5'),
      h.Attribute('stroke-linecap', 'round'),
      h.Attribute('stroke-linejoin', 'round'),
    ],
    [h.path([h.Attribute('d', d)], [])],
  )

// #region breadcrumb-basic
export const BreadcrumbStyle = forSlots(BreadcrumbSlots)(Recipes.Breadcrumb({}))

export const breadcrumb = (
  style: NamedStyle<typeof BreadcrumbSlots>,
  h: HtmlBuilder<never>,
): Html =>
  Breadcrumb.view(
    {
      steps: [
        { label: 'Home', href: '#' },
        { label: 'Components', href: '#' },
        { label: 'Breadcrumb', current: true },
      ],
      style,
    },
    h,
  )
// #endregion

// #region breadcrumb-icons
// An icon before a step's words, hidden from assistive technology.
export const breadcrumbIcons = (
  style: NamedStyle<typeof BreadcrumbSlots>,
  h: HtmlBuilder<never>,
): Html =>
  Breadcrumb.view(
    {
      steps: [
        { label: 'Home', href: '#', icon: outline(h, 'M2 7l6-5 6 5v7H2zM6 14v-4h4v4') },
        { label: 'Projects', href: '#', icon: outline(h, 'M1 3h5l2 2h7v8H1z') },
        { label: 'Roadmap.md', current: true, icon: outline(h, 'M3 1h7l3 3v11H3zM10 1v3h3') },
      ],
      style,
    },
    h,
  )
// #endregion

// #region breadcrumb-custom
// A separator of the view's own stands in for the recipe's.
export const breadcrumbCustom = (
  style: NamedStyle<typeof BreadcrumbSlots>,
  h: HtmlBuilder<never>,
): Html =>
  Breadcrumb.view(
    {
      steps: [
        { label: 'Settings', href: '#' },
        { label: 'Billing', href: '#' },
        { label: 'Invoices', current: true },
      ],
      separator: h.span([], ['→']),
      style,
    },
    h,
  )
// #endregion

// #region breadcrumb-collapsed
// A long trail folds its middle into an ellipsis; a press on it sends
// `onExpand`, and the application draws the trail whole.
export const breadcrumbCollapsed = <Message>(
  style: NamedStyle<typeof BreadcrumbSlots>,
  expanded: boolean,
  onExpand: Message,
  h: HtmlBuilder<Message>,
): Html =>
  Breadcrumb.view(
    {
      steps: [
        { label: 'Home', href: '#' },
        { label: 'Docs', href: '#' },
        { label: 'Packages', href: '#' },
        { label: 'Mixins', href: '#' },
        { label: 'Recipes', href: '#' },
        { label: 'Breadcrumb', current: true },
      ],
      ...(expanded ? {} : { collapse: { max: 3, onExpand } }),
      style,
    },
    h,
  )
// #endregion

// #region pagination-numbered
export const PaginationStyle = forSlots(PaginationSlots)(Recipes.Pagination({}))

export const pagination = <Message>(
  style: NamedStyle<typeof PaginationSlots>,
  page: number,
  onPage: (page: number) => Message,
  h: HtmlBuilder<Message>,
): Html => Pagination.view({ page, pageCount: 12, onPage, style }, h)
// #endregion

// #region pagination-simple
// Previous and next alone, for a feed with no page worth naming.
export const paginationSimple = <Message>(
  style: NamedStyle<typeof PaginationSlots>,
  page: number,
  onPage: (page: number) => Message,
  h: HtmlBuilder<Message>,
): Html => Pagination.view({ page, pageCount: 12, onPage, numbered: false, style }, h)
// #endregion

// #region pagination-ends
// First and last beside previous and next.
export const paginationEnds = <Message>(
  style: NamedStyle<typeof PaginationSlots>,
  page: number,
  onPage: (page: number) => Message,
  h: HtmlBuilder<Message>,
): Html => Pagination.view({ page, pageCount: 20, onPage, ends: true, style }, h)
// #endregion

// #region pagination-range
// Which rows the page shows, and a choice of how many a page holds.
export const ROWS = 97

export const paginationRange = <Message>(
  style: NamedStyle<typeof PaginationSlots>,
  rows: { readonly page: number; readonly perPage: number },
  onPage: (page: number) => Message,
  onPerPage: (perPage: number) => Message,
  h: HtmlBuilder<Message>,
): Html =>
  Pagination.view(
    {
      page: rows.page,
      pageCount: Math.ceil(ROWS / rows.perPage),
      onPage,
      range: {
        total: ROWS,
        perPage: rows.perPage,
        choose: { sizes: [10, 20, 50], onPerPage },
      },
      style,
    },
    h,
  )
// #endregion

// #region pagination-siblings
// Two stops either side of the current page, and two at each end.
export const paginationSiblings = <Message>(
  style: NamedStyle<typeof PaginationSlots>,
  page: number,
  onPage: (page: number) => Message,
  h: HtmlBuilder<Message>,
): Html => Pagination.view({ page, pageCount: 40, onPage, siblings: 2, boundaries: 2, style }, h)
// #endregion

// #region pagination-compact
// The current page and the count alone, at every width: "5 / 12". The
// default, `compact: 'narrow'`, does this only on a narrow window.
export const PaginationCompactStyle = forSlots(PaginationSlots)(
  Recipes.Pagination({ compact: 'always' }),
)

export const paginationCompact = <Message>(
  style: NamedStyle<typeof PaginationSlots>,
  page: number,
  onPage: (page: number) => Message,
  h: HtmlBuilder<Message>,
): Html => Pagination.view({ page, pageCount: 12, onPage, style }, h)
// #endregion

// #region item
export const ItemStyle = forSlots(ItemSlots)(Recipes.Item({}))

export const item = (style: NamedStyle<typeof ItemSlots>, h: HtmlBuilder<never>): Html =>
  Item.view(
    {
      // A status mark in the success color, not a bare black dot that read as a list bullet.
      media: h.span(
        [
          h.AriaHidden(true),
          h.Style({
            display: 'block',
            inlineSize: '0.5rem',
            blockSize: '0.5rem',
            borderRadius: '50%',
            background: 'oklch(0.62 0.15 150)',
          }),
        ],
        [],
      ),
      title: 'Deploy finished',
      description: '2 minutes ago',
      content: h.span([], ['Production is live.']),
      style,
    },
    h,
  )
// #endregion

// #region empty
export const EmptyStyle = forSlots(EmptySlots)(Recipes.Empty({}))

export const empty = (style: NamedStyle<typeof EmptySlots>, h: HtmlBuilder<never>): Html =>
  Empty.view(
    {
      title: 'No projects yet',
      description: 'Create one to get started.',
      action: Button.view({ label: 'New project', style: ButtonStyle }, h),
      style,
    },
    h,
  )
// #endregion

// #region tabs
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
        [style.mixin, ...Tabs.fluid],
        { h },
        ({ tablist, indicator, highlight, tabs, activeIndex }) =>
          h.div(
            [],
            [
              h.div(tablist, [
                h.div(indicator),
                h.div(highlight),
                ...tabs.map(tab => h.button(tab.tab, [sections[tab.value].label])),
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
      toView: RadioGroup.toView<Billing, Message>([style.mixin], { h }, ({ group, options }) =>
        h.div(
          group,
          // A row is a `label` around its radio, so a press on the words
          // presses the radio. The label bundle is only the name's id.
          options.map(option =>
            h.label(
              [h.Style({ display: 'flex', gap: '0.5rem', alignItems: 'start' })],
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

// #region slider
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

// #region dialog
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
                          Button.view(
                            { label: 'Cancel', onClick: messages.onClose, style: QuietStyle },
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

// #region popover
export const PopoverStyle = forSlots(PopoverSlots)(Recipes.Popover({}))

export const popover = <Message>(
  style: NamedStyle<typeof PopoverSlots>,
  model: UiPopover.Model,
  toMessage: (message: UiPopover.Message) => Message,
  h: HtmlBuilder<Message>,
): Html =>
  h.submodel({
    slotId: model.id,
    model,
    view: UiPopover.view,
    viewInputs: {
      // In place: a portal moves the panel out of the page that drew it.
      anchor: { placement: 'bottom-start', gap: 4, padding: 8, portal: false },
      toView: Popover.toView([style.mixin], { h }, popover =>
        h.div(
          [],
          [
            h.button(popover.button, ['Share']),
            ...(popover.isVisible
              ? [
                  h.div(popover.backdrop, []),
                  h.div(popover.panel, [h.p([], ['Anyone with the link can view this page.'])]),
                ]
              : []),
          ],
        ),
      ),
    },
    toParentMessage: toMessage,
  })
// #endregion

// #region tooltip
export const TooltipStyle = forSlots(TooltipSlots)(Recipes.Tooltip({}))

export const tooltip = <Message>(
  style: NamedStyle<typeof TooltipSlots>,
  model: UiTooltip.Model,
  toMessage: (message: UiTooltip.Message) => Message,
  h: HtmlBuilder<Message>,
): Html =>
  h.submodel({
    slotId: model.id,
    model,
    view: UiTooltip.view,
    viewInputs: {
      anchor: { placement: 'top', gap: 6, padding: 8, portal: false },
      toView: Tooltip.toView([style.mixin], { h }, ({ trigger, panel, isVisible }) =>
        h.div(
          [],
          [
            h.button(trigger, ['Autosave']),
            ...(isVisible ? [h.span(panel, ['Saved a second after you stop typing'])] : []),
          ],
        ),
      ),
    },
    toParentMessage: toMessage,
  })
// #endregion

// #region hover-card
export const HoverCardStyle = forSlots(HoverIntentSlots)(Recipes.HoverCard({}))

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
      focusTriggerSelector: '#preview-hover-card-trigger',
      toView: HoverIntent.toView([style.mixin], { h }, ({ trigger, panel, isVisible }) =>
        h.span(
          [],
          [
            h.button([...trigger, h.Id('preview-hover-card-trigger'), h.Type('button')], ['@ada']),
            ...(isVisible
              ? [
                  h.div(
                    [
                      ...panel,
                      h.OnMount(
                        Anchor.Anchor({
                          buttonId: 'preview-hover-card-trigger',
                          anchor: { placement: 'bottom-start', gap: 8, padding: 8, portal: false },
                        }),
                      ),
                    ],
                    [
                      h.p([], ['Ada Lovelace']),
                      h.p([], ['Wrote the first program. 3 projects, 12 followers.']),
                    ],
                  ),
                ]
              : []),
          ],
        ),
      ),
    },
    toParentMessage: toMessage,
  })
// #endregion

// #region menu
export const MenuStyle = forSlots(MenuSlots)(Recipes.Menu({}))

/** The rows of the menu a button opens. */
export const PAGE_MENU: ReadonlyArray<Menu.Row> = [
  { label: 'Rename' },
  { label: 'Duplicate' },
  { label: 'Move' },
  { label: 'Delete' },
]

/** The rows of the menu a right press opens, two opening submenus beside them. */
export const FILE_MENU: ReadonlyArray<Menu.Row> = [
  { label: 'New tab' },
  { label: 'Share', items: ['Email', 'Messages', 'Copy link'] },
  { label: 'Export', items: ['PDF', 'PNG', 'SVG'], isItemDisabled: item => item === 'SVG' },
  { label: 'Print' },
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
          isRowDisabled: label => label === 'Move',
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

// #region command
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
    [h.Style({ display: 'grid', gap: '0.75rem', justifyItems: 'start' })],
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
                { value: 'new-page', label: 'New page', shortcut: '⌘N' },
                { value: 'search', label: 'Search pages', keywords: ['find'], shortcut: '⌘K' },
              ],
            },
            {
              heading: 'Settings',
              items: [
                { value: 'theme', label: 'Change theme', keywords: ['dark', 'light'] },
                { value: 'billing', label: 'Billing', disabled: true },
                { value: 'members', label: 'Invite members', keywords: ['team'] },
              ],
            },
          ],
          query: state.query,
          onQuery: messages.onQuery,
          active: state.active,
          onActive: messages.onActive,
          onRun: messages.onRun,
          style,
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

// #region combobox
export const ComboboxStyle = forSlots(ComboboxSlots)(Recipes.Combobox({}))

export const cities = ['Kyiv', 'Lagos', 'Lima', 'Oslo', 'Osaka', 'Quito', 'Seoul', 'Zurich']
export const CityBox: ReturnType<typeof ComboboxView.create<string>> = ComboboxView.create<string>()

/** What is typed and highlighted is the component's; the city is the Model's. */
export interface ComboboxState {
  readonly combobox: UiCombobox.Model
  readonly city: Option.Option<string>
}

export const combobox = <Message>(
  style: NamedStyle<typeof ComboboxSlots>,
  state: ComboboxState,
  toMessage: (message: UiCombobox.Message) => Message,
  h: HtmlBuilder<Message>,
): Html => {
  const typed = state.combobox.inputValue.toLowerCase()
  return h.submodel({
    slotId: state.combobox.id,
    model: state.combobox,
    view: CityBox.view,
    viewInputs: {
      anchor: { placement: 'bottom-start', gap: 4, padding: 8, portal: false },
      items: cities.filter(city => city.toLowerCase().includes(typed)),
      restingInputValue: Option.getOrElse(state.city, () => ''),
      maybeSelectedValue: state.city,
      itemToConfig: (city: string) => ({ content: h.span([], [city]) }),
      itemToValue: (city: string) => city,
      itemToDisplayText: (city: string) => city,
      inputPlaceholder: 'Find a city',
      buttonContent: h.span([], ['▾']),
      toView: Combobox.toView([style.mixin, ...Combobox.fluid], { h }),
    },
    toParentMessage: toMessage,
  })
}
// #endregion

// #region calendar
export const CalendarStyle = forSlots(CalendarSlots)(Recipes.Calendar({}))

/** Each month shown and focused day are the component's; each selection is the Model's. */
export interface CalendarState {
  readonly calendar: UiCalendar.Model
  readonly selection: Calendar.Selection
  readonly trip: UiCalendar.Model
  readonly tripDates: Calendar.Selection
}

export const calendar = <Message>(
  style: NamedStyle<typeof CalendarSlots>,
  state: CalendarState,
  toMessage: (message: UiCalendar.Message) => Message,
  toTrip: (message: UiCalendar.Message) => Message,
  h: HtmlBuilder<Message>,
): Html => {
  const month = (
    id: string,
    model: UiCalendar.Model,
    selection: Calendar.Selection,
    toParentMessage: (message: UiCalendar.Message) => Message,
  ) =>
    h.submodel({
      slotId: id,
      model,
      view: UiCalendar.view,
      viewInputs: {
        // The marks show the chosen days; the Calendar's own marker would show one.
        maybeSelectedDate: Calendar.selectedDate(selection),
        toView: Calendar.toView(selection, [style.mixin], { h }),
      },
      toParentMessage,
    })
  return h.div(
    [h.Style({ display: 'grid', gap: '1.5rem', justifyItems: 'start' })],
    [
      month(state.calendar.id, state.calendar, state.selection, toMessage),
      month(state.trip.id, state.trip, state.tripDates, toTrip),
    ],
  )
}
// #endregion

// #region date-picker
export const DatePickerStyle = forSlots(DatePickerSlots)(Recipes.DatePicker({}))
const PanelCalendarStyle = forSlots(CalendarSlots)(Recipes.Calendar({ size: 'sm' }))

/** The open panel and its month are the component's; the date is the Model's. */
export interface DatePickerState {
  readonly picker: UiDatePicker.Model
  readonly due: Option.Option<FoldkitCalendar.CalendarDate>
}

const dayOf = (date: FoldkitCalendar.CalendarDate): string =>
  `${date.year}-${String(date.month).padStart(2, '0')}-${String(date.day).padStart(2, '0')}`

export const datePicker = <Message>(
  style: NamedStyle<typeof DatePickerSlots>,
  state: DatePickerState,
  toMessage: (message: UiDatePicker.Message) => Message,
  h: HtmlBuilder<Message>,
): Html =>
  h.submodel({
    slotId: state.picker.id,
    model: state.picker,
    view: DatePickerView.view,
    viewInputs: {
      // Locked: paging the months resizes the panel, which must not flip sides as it does.
      anchor: {
        placement: 'bottom-start',
        gap: 4,
        padding: 8,
        isPlacementLocked: true,
        portal: false,
      },
      maybeSelectedDate: state.due,
      triggerContent: due =>
        h.span([], [Option.match(due, { onNone: () => 'Pick a due date', onSome: dayOf })]),
      toCalendarView: Calendar.toView(
        Calendar.Selection.Single({ date: state.due }),
        [PanelCalendarStyle.mixin],
        { h },
      ),
      toView: DatePicker.toView([style.mixin]),
    },
    toParentMessage: toMessage,
  })
// #endregion

// #region toast
export const ToastStyle = forSlots(ToastSlots)(Recipes.Toast({}))
const NoticeStyle = forSlots(ItemSlots)(Recipes.Item({}))
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

// #region accordion
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

// #region number-field
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
      value,
      onChange,
      min: 1,
      max: 12,
      style,
    },
    h,
  )
// #endregion

// #region otp-field
export const OtpFieldStyle = forSlots(OtpFieldSlots)(Recipes.OtpField({}))

export const otpField = <Message>(
  style: NamedStyle<typeof OtpFieldSlots>,
  code: string,
  onChange: (code: string) => Message,
  h: HtmlBuilder<Message>,
): Html => OtpField.view({ label: 'Sign-in code', value: code, onChange, groups: [3, 3], style }, h)
// #endregion

// #region resizable
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

// #region sidebar
export const SidebarStyle = forSlots(SidebarSlots)(Recipes.Sidebar({}))

export interface SidebarMessages<Message> {
  readonly onToggleSection: (id: string) => Message
  readonly onToggleCollapsed: Message
}

export const sidebar = <Message>(
  style: NamedStyle<typeof SidebarSlots>,
  state: { readonly open: ReadonlyArray<string>; readonly collapsed: boolean },
  messages: SidebarMessages<Message>,
  h: HtmlBuilder<Message>,
): Html =>
  Sidebar.view(
    {
      id: 'app-sidebar',
      label: 'Workspace',
      sections: [
        {
          id: 'workspace',
          title: 'Workspace',
          links: [
            { label: 'Inbox', href: '#', current: true },
            { label: 'Projects', href: '#' },
            { label: 'Calendar', href: '#' },
          ],
        },
        {
          id: 'settings',
          title: 'Settings',
          links: [
            { label: 'Members', href: '#' },
            { label: 'Billing', href: '#' },
          ],
        },
      ],
      open: state.open,
      onToggleSection: messages.onToggleSection,
      collapsed: state.collapsed,
      onToggleCollapsed: messages.onToggleCollapsed,
      style,
    },
    h,
  )
// #endregion

// #region menubar
export const MenubarStyle = forSlots(MenubarSlots)(Recipes.Menubar({}))
const MenubarMenuStyle = forSlots(MenuSlots)(Recipes.MenubarMenu({}))

/** The bar's menus, in the order of the Model's. */
export const MENUBAR: ReadonlyArray<Menubar.MenubarMenu> = [
  { label: 'File', items: ['New', 'Open', 'Save'] },
  { label: 'Edit', items: ['Undo', 'Redo', 'Copy'], isItemDisabled: item => item === 'Redo' },
  { label: 'View', items: ['Zoom in', 'Zoom out', 'Full screen'] },
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

// #region progress
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

// #region steps-basic
export const StepsStyle = forSlots(StepsSlots)(Recipes.Steps({}))

export const steps = <Message>(
  style: NamedStyle<typeof StepsSlots>,
  h: HtmlBuilder<Message>,
): Html =>
  Steps.view(
    {
      label: 'Checkout',
      steps: [
        { title: 'Account', description: 'Your details' },
        { title: 'Plan', description: 'Pick a tier' },
        { title: 'Payment', description: 'Card or invoice' },
        { title: 'Review' },
      ],
      current: 2,
      style,
    },
    h,
  )
// #endregion

// #region steps-icons
// A step's icon stands in its marker for the number, until the step is done.
export const stepsIcons = <Message>(
  style: NamedStyle<typeof StepsSlots>,
  h: HtmlBuilder<Message>,
): Html =>
  Steps.view(
    {
      label: 'Shipping',
      steps: [
        { title: 'Ordered', icon: outline(h, 'M3 4h10l-1 8H4zM6 4a2 2 0 0 1 4 0') },
        { title: 'Packed', icon: outline(h, 'M2 5l6-3 6 3v6l-6 3-6-3zM2 5l6 3 6-3M8 8v6') },
        { title: 'Shipped', icon: outline(h, 'M1 4h8v7H1zM9 7h3l3 3v1H9M4 13h1M11 13h1') },
        { title: 'Delivered', icon: outline(h, 'M2 7l6-5 6 5v7H2zM6 14v-4h4v4') },
      ],
      current: 2,
      style,
    },
    h,
  )
// #endregion

// #region steps-vertical
// Vertical, each step's content under it beside the line to the next. A
// horizontal stepper has no room under its steps and draws no content.
export const VerticalStepsStyle = forSlots(StepsSlots)(Recipes.Steps({ orientation: 'vertical' }))

export const stepsVertical = <Message>(
  style: NamedStyle<typeof StepsSlots>,
  h: HtmlBuilder<Message>,
): Html =>
  Steps.view(
    {
      label: 'Set up the workspace',
      steps: [
        {
          title: 'Create the workspace',
          content: h.p([], ['Named Northwind, at northwind.example.com.']),
        },
        {
          title: 'Invite the team',
          description: 'Three of ten seats',
          content: h.div(
            [h.Style({ display: 'grid', gap: '0.5rem', justifyItems: 'start' })],
            [
              h.p([], ['Ada and Grace have joined. Alan has not answered yet.']),
              Button.view({ label: 'Send a reminder', style: ButtonStyle }, h),
            ],
          ),
        },
        { title: 'Connect a domain', content: h.p([], ['Point a CNAME at the workspace.']) },
      ],
      current: 1,
      style,
    },
    h,
  )
// #endregion

// #region rating
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
          onChange,
          readOnly: true,
          style,
        },
        h,
      ),
    ],
  )
// #endregion

// #region password-input
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

// #region tags-input
export const TagsInputStyle = forSlots(TagsInputSlots)(Recipes.TagsInput({}))

export const tagsInput = <Message>(
  style: NamedStyle<typeof TagsInputSlots>,
  model: TagsInput.Model,
  onMessage: (message: TagsInput.Message) => Message,
  h: HtmlBuilder<Message>,
): Html =>
  TagsInput.view({ model, onMessage, label: 'Topics', placeholder: 'Add a topic', style }, h)
// #endregion

// #region input-copy
export const InputCopyStyle = forSlots(InputCopySlots)(Recipes.InputCopy({}))

export const API_KEY = 'sk-live-4f9a2c71'

export const inputCopy = <Message>(
  style: NamedStyle<typeof InputCopySlots>,
  copied: boolean,
  onCopy: (text: string) => Message,
  h: HtmlBuilder<Message>,
): Html =>
  InputCopy.view(
    {
      id: 'preview-api-key',
      label: 'API key',
      value: API_KEY,
      copied,
      onCopy: onCopy(API_KEY),
      style,
    },
    h,
  )
// #endregion

// #region sheet
/**
 * The Dialog drawn with the Sheet recipe: the same Model, Messages and focus
 * trap. The handle is drawn always; the recipe shows it with `handle: 'bar'`.
 */
export const sheet = <Message>(
  style: NamedStyle<typeof DialogSlots>,
  model: UiDialog.Model,
  messages: DialogMessages<Message>,
  h: HtmlBuilder<Message>,
): Html =>
  h.div(
    [],
    [
      Button.view({ label: 'Edit profile', onClick: messages.onOpen, style: GroupedStyle }, h),
      h.submodel({
        slotId: model.id,
        model,
        view: UiDialog.view,
        viewInputs: {
          hasDescription: true,
          toView: Dialog.toView([style.mixin], { h }, dialog =>
            h.dialog(
              dialog.dialog,
              dialog.isVisible
                ? [
                    h.div(dialog.backdrop),
                    h.div(dialog.panel, [
                      h.div(dialog.handle),
                      h.button(dialog.closeButton, ['✕']),
                      h.h2(dialog.title, ['Edit profile']),
                      h.p(dialog.description, ['Changes show once you save. Escape keeps them.']),
                      h.div(
                        [h.Style({ display: 'flex', gap: '0.5rem', justifyContent: 'end' })],
                        [
                          Button.view(
                            { label: 'Cancel', onClick: messages.onClose, style: QuietStyle },
                            h,
                          ),
                          Button.view(
                            { label: 'Save', onClick: messages.onClose, style: ButtonStyle },
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
// #endregion

// #region color-picker
export const ColorPickerStyle = forSlots(ColorPickerSlots)(Recipes.ColorPicker({}))

export const colorPicker = <Message>(
  style: NamedStyle<typeof ColorPickerSlots>,
  value: ColorPicker.Oklch,
  onChange: (value: ColorPicker.Oklch) => Message,
  h: HtmlBuilder<Message>,
): Html =>
  ColorPicker.view(
    {
      id: 'preview-accent',
      label: 'Accent',
      value,
      onChange,
      presets: [
        { label: 'Blue', value: { l: 62.5, c: 0.15, h: 250 } },
        { label: 'Teal', value: { l: 70, c: 0.12, h: 190 } },
        { label: 'Amber', value: { l: 80, c: 0.16, h: 80 } },
        { label: 'Rose', value: { l: 65, c: 0.2, h: 10 } },
      ],
      style,
    },
    h,
  )
// #endregion

// #region tree-view
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
      TreeView.view({ label: 'Files', model, nodes: TREE_FILES, onMessage, direction, style }, h),
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

// #region carousel
export const CarouselStyle = forSlots(CarouselSlots)(Recipes.Carousel({}))

const PLACES = ['Dunes', 'Coast', 'Ridge', 'Valley']

export const carousel = <Message>(
  style: NamedStyle<typeof CarouselSlots>,
  index: number,
  onIndex: (index: number) => Message,
  h: HtmlBuilder<Message>,
): Html =>
  h.div(
    [h.Style({ inlineSize: 'min(28rem, 100%)' })],
    [
      Carousel.view(
        {
          id: 'preview-carousel',
          label: 'Places',
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
          index,
          onIndex,
          style,
        },
        h,
      ),
    ],
  )
// #endregion

// #region navigation-menu
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

// #region segmented
export const SegmentedStyle = forSlots(SegmentedSlots)(Recipes.Segmented({}))

export const Range = Schema.Literals(['day', 'week', 'month', 'year'])
export type Range = typeof Range.Type

export const segmented = <Message>(
  style: NamedStyle<typeof SegmentedSlots>,
  range: Range,
  onRange: (range: Range) => Message,
  h: HtmlBuilder<Message>,
): Html =>
  Segmented.view(
    {
      label: 'Range',
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
