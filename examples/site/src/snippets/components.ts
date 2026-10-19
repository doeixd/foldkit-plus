/**
 * Each shipped component as an application draws it, over the theme module
 * `/create` hands out (`./theme.ts`). A component's page shows its region,
 * and its previews call the function the region defines with the style the
 * reader selected, so the code on the page is the code that drew it.
 */
import { Effect, Option, Schema } from 'effect'
import { Calendar as FoldkitCalendar, FieldValidation } from 'foldkit'
import * as FoldkitCommand from 'foldkit/command'
import { modifyFields } from 'foldkit/struct'
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
import type { AnchorConfig } from '@foldkit/ui/anchor'
import type { Html, HtmlBuilder } from 'foldkit/html'
import { SlotView, type NamedStyle } from 'foldkit-mixins'
import { Theme } from 'foldkit-mixins/theme'
import { Utilities } from 'foldkit-mixins/utilities'
import {
  Accordion,
  AccordionSlots,
  Anchor,
  HoverIntent,
  HoverIntentSlots,
  Alert,
  AlertSlots,
  Avatar,
  AvatarGroupSlots,
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
  TagsInput,
  TagsInputSlots,
  PasswordInput,
  PasswordInputSlots,
  type PasswordRequirement,
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
  ItemGroupSlots,
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
  Sheet,
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
} from 'foldkit-mixins-ui'

import { forSlots, slots } from './theme.js'

// #region button-basic
export const ButtonStyle = forSlots(ButtonSlots)(Recipes.Button({}))

// An `icon` stands before the label; the `icon` variant shows it alone,
// the label staying its name.
export const button = (style: NamedStyle<typeof ButtonSlots>, h: HtmlBuilder<never>): Html =>
  Button.view({ label: 'Save changes', icon: outline(h, 'M3 8.5l3 3 7-7'), style }, h)
// #endregion

// #region button-icon
// Pinned: `Recipes.Button({ tone: 'neutral', variant: 'icon' })`. A row of
// actions with no words in sight: each label is the button's name.
export const iconButtons = (style: NamedStyle<typeof ButtonSlots>, h: HtmlBuilder<never>): Html =>
  h.div(
    [h.Role('group'), h.AriaLabel('Message'), h.Style({ display: 'flex', gap: '0.25rem' })],
    [
      Button.view(
        { label: 'Reply', icon: outline(h, 'M6.5 4L2.5 8l4 4M3 8h6.5a4 4 0 0 1 4 4'), style },
        h,
      ),
      Button.view(
        { label: 'Copy', icon: outline(h, 'M5.5 5.5h8v8h-8zM10.5 5.5v-3h-8v8h3'), style },
        h,
      ),
      Button.view(
        {
          label: 'Delete',
          icon: outline(h, 'M2.5 4.5h11M6 4.5v-2h4v2M4 4.5l.75 9h6.5l.75-9'),
          style,
        },
        h,
      ),
    ],
  )
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

// #region card-basic
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

// #region card-stat
// A number with what it counts and how it moved: the content is the figure.
export const cardStat = (style: NamedStyle<typeof CardSlots>, h: HtmlBuilder<never>): Html =>
  Card.view(
    {
      title: 'Monthly revenue',
      description: 'Up 12% on September',
      action: Badge.view({ text: '+12%', tone: 'live', style: BadgeStyle }, h),
      content: h.p([h.Style({ margin: '0', fontSize: '2rem', fontWeight: '600' })], ['$48,210']),
      style,
    },
    h,
  )
// #endregion

// #region card-media
// A picture across the top, bled to the card's edges.
export const cardMedia = (style: NamedStyle<typeof CardSlots>, h: HtmlBuilder<never>): Html =>
  Card.view(
    {
      image: h.img([h.Src(portrait(200)), h.Alt('')]),
      title: 'Lisbon in spring',
      description: 'Six days of trams, tiles and long lunches.',
      footer: Button.view({ label: 'Read the guide', style: ButtonStyle }, h),
      style,
    },
    h,
  )
// #endregion

// #region card-profile
export const CardProfileAvatarStyle = forSlots(AvatarSlots)(
  Recipes.Avatar({ size: 'lg', color: 'name' }),
)

// A person: their avatar in the media tile's place, a name and a role.
export const cardProfile = (style: NamedStyle<typeof CardSlots>, h: HtmlBuilder<never>): Html =>
  Card.view(
    {
      image: Avatar.view(
        { name: 'Ada Lovelace', status: 'online', style: CardProfileAvatarStyle },
        h,
      ),
      title: 'Ada Lovelace',
      description: 'Analyst, Engine team',
      footer: Button.view({ label: 'Message', style: ButtonStyle }, h),
      style,
    },
    h,
  )
// #endregion

// #region card-link
export const CardLinkStyle = forSlots(CardSlots)(Recipes.Card({ lift: 'hover' }))

// A whole card that goes somewhere: one link named by its title, lifting under the pointer.
export const cardLink = (style: NamedStyle<typeof CardSlots>, h: HtmlBuilder<never>): Html =>
  Card.view(
    {
      media: sparkle(h),
      title: 'Read the changelog',
      description: 'Everything that shipped this month.',
      press: { href: 'https://github.com/doeixd/foldkit-plus/blob/main/CHANGELOG.md' },
      style,
    },
    h,
  )
// #endregion

// #region card-elevation
export const CardLevels = (['0', '1', '2', '3'] as const).map(elevation =>
  forSlots(CardSlots)(Recipes.Card({ surface: 'elevated', elevation })),
)

// Each level one more step above what holds it: lighter on a dark page, a
// deeper contact and ambient shadow on a light one.
export const cardElevation = (h: HtmlBuilder<never>): Html =>
  h.div(
    [
      h.Style({
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(9rem, 1fr))',
        gap: '1.5rem',
      }),
    ],
    CardLevels.map((style, level) =>
      Card.view({ title: `Level ${level}`, description: `elevation: '${level}'`, style }, h),
    ),
  )
// #endregion

// #region card-group-plans
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

// #region card-group-grid
export const CardGridStyle = forSlots(CardGroupSlots)(Recipes.CardGroup({ layout: 'separated' }))
export const CardGridCardStyle = forSlots(CardSlots)(Recipes.Card({}))

// Cards as one choice in a grid: the highlight follows the pointer both ways.
export const cardGroupGrid = <Message>(
  style: NamedStyle<typeof CardGroupSlots>,
  choice: Choice<Message>,
  h: HtmlBuilder<Message>,
): Html =>
  Card.group(
    {
      label: 'Regions',
      columns: 2,
      cards: ['Frankfurt', 'Virginia', 'Singapore', 'São Paulo'].map(title => ({
        key: title,
        title,
        description: 'Under 40ms from most of the region',
        selected: title === choice.chosen,
        press: { onClick: choice.onChoose(title) },
      })),
      style,
      cardStyle: CardGridCardStyle,
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

// #region avatar-pictures
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

// #region avatar-initials
export const AvatarInitialsStyle = forSlots(AvatarSlots)(Recipes.Avatar({ color: 'name' }))

// No picture: initials in a colour from the name, the same everywhere for one person.
export const avatarInitials = (
  style: NamedStyle<typeof AvatarSlots>,
  h: HtmlBuilder<never>,
): Html =>
  h.div(
    [h.Style({ display: 'flex', gap: '0.5rem' })],
    ['Ada Lovelace', 'Grace Hopper', 'Alan Turing', 'Edsger Dijkstra'].map(name =>
      Avatar.view({ name, style }, h),
    ),
  )
// #endregion

// #region avatar-status
// A dot on the lower end corner, said in the avatar's name: "Ada Lovelace, Online".
export const avatarStatus = (style: NamedStyle<typeof AvatarSlots>, h: HtmlBuilder<never>): Html =>
  h.div(
    [h.Style({ display: 'flex', gap: '0.75rem' })],
    (['online', 'away', 'busy', 'offline'] as const).map((status, index) =>
      Avatar.view({ name: 'Ada Lovelace', src: portrait(40 + index * 70), status, style }, h),
    ),
  )
// #endregion

// #region avatar-group
export const AvatarStackStyle = forSlots(AvatarGroupSlots)(Recipes.AvatarGroup({}))

// Overlapping, each ringed in the page, at most four and a count of the rest.
export const avatarGroup = (style: NamedStyle<typeof AvatarSlots>, h: HtmlBuilder<never>): Html =>
  Avatar.group(
    {
      label: 'Editors',
      people: [
        'Ada Lovelace',
        'Grace Hopper',
        'Alan Turing',
        'Edsger Dijkstra',
        'Barbara Liskov',
        'Donald Knuth',
      ].map((name, index) => ({ name, src: portrait(index * 60) })),
      max: 4,
      style: AvatarStackStyle,
      avatarStyle: style,
    },
    h,
  )
// #endregion

// #region avatar-shapes
export const AvatarShapes = (['circle', 'rounded', 'square'] as const).map(shape =>
  forSlots(AvatarSlots)(Recipes.Avatar({ shape, size: 'lg', ring: 'accent' })),
)

// A disc, a rounded square and a square, ringed in the accent.
export const avatarShapes = (h: HtmlBuilder<never>): Html =>
  h.div(
    [h.Style({ display: 'flex', gap: '1rem' })],
    AvatarShapes.map(style => Avatar.view({ name: 'Grace Hopper', src: portrait(20), style }, h)),
  )
// #endregion

// #region avatar-named
export const AvatarNamedRowStyle = forSlots(ItemSlots)(Recipes.Item({ density: 'compact' }))

// An avatar with a name and a caption is an Item with the avatar as its media.
export const avatarNamed = (style: NamedStyle<typeof AvatarSlots>, h: HtmlBuilder<never>): Html =>
  Item.view(
    {
      media: Avatar.view({ name: 'Alan Turing', src: portrait(140), style }, h),
      title: 'Alan Turing',
      description: 'alan@example.com',
      style: AvatarNamedRowStyle,
    },
    h,
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

// #region skeleton-basic
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

// #region skeleton-lines
// A paragraph still loading: whole lines, the last one ending early.
export const skeletonLines = (
  style: NamedStyle<typeof SkeletonSlots>,
  h: HtmlBuilder<never>,
): Html =>
  h.div(
    [h.Style({ inlineSize: 'min(24rem, 100%)' })],
    [Skeleton.lines({ lines: 4, label: 'Loading the article', style }, h)],
  )
// #endregion

// #region skeleton-shapes
// The shapes content will take: a person, a card, rows of a table.
export const skeletonShapes = (
  style: NamedStyle<typeof SkeletonSlots>,
  h: HtmlBuilder<never>,
): Html =>
  h.div(
    [h.Style({ display: 'grid', gap: '1.5rem', inlineSize: 'min(24rem, 100%)' })],
    [
      Skeleton.avatarRow({ label: 'Loading the author', style }, h),
      Skeleton.card({ label: 'Loading the post', style }, h),
      h.div(
        [],
        [1, 2, 3].map(() => Skeleton.tableRow({ columns: 4, label: 'Loading a row', style }, h)),
      ),
    ],
  )
// #endregion

// #region skeleton-shimmer
export const SkeletonShimmerStyle = forSlots(SkeletonSlots)(
  Recipes.Skeleton({ animation: 'shimmer' }),
)

// A band of the page sweeping across; still under reduced motion.
export const skeletonShimmer = (
  style: NamedStyle<typeof SkeletonSlots>,
  h: HtmlBuilder<never>,
): Html =>
  h.div(
    [h.Style({ inlineSize: 'min(24rem, 100%)' })],
    [Skeleton.avatarRow({ label: 'Loading the author', style }, h)],
  )
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

// #region breadcrumb-menu
// The "…" opens a Menu of the hidden steps; the application keeps the Menu's Model.
export const trail: ReadonlyArray<Breadcrumb.BreadcrumbStep> = [
  { label: 'Home', href: '#' },
  { label: 'Docs', href: '#' },
  { label: 'Packages', href: '#' },
  { label: 'Mixins', href: '#' },
  { label: 'Recipes', href: '#' },
  { label: 'Breadcrumb', current: true },
]
export const TRAIL_MAX = 3
export const trailMenu = Menu.init('trail-menu', Breadcrumb.menuRows(trail, TRAIL_MAX))

export const breadcrumbMenu = <Message>(
  style: NamedStyle<typeof BreadcrumbSlots>,
  menu: Menu.Model,
  onMessage: (message: Menu.Message) => Message,
  h: HtmlBuilder<Message>,
): Html =>
  Breadcrumb.view(
    {
      steps: trail,
      collapse: { max: TRAIL_MAX, menu: { model: menu, onMessage, mixins: [MenuStyle.mixin] } },
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

// #region item-basic
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

// #region item-settings
export const SettingsListStyle = forSlots(ItemGroupSlots)(Recipes.ItemGroup({}))
export const SettingsRowStyle = forSlots(ItemSlots)(Recipes.Item({ media: 'icon' }))

// Settings: a list of rows, each one control that opens its page.
export const itemSettings = (style: NamedStyle<typeof ItemSlots>, h: HtmlBuilder<never>): Html =>
  Item.group(
    {
      label: 'Settings',
      items: [
        // Pages of this site, standing in for an application's settings pages.
        { key: 'avatar', title: 'Profile', description: 'Name, photo and email' },
        { key: 'password-input', title: 'Security', description: 'Passkeys and sessions' },
        { key: 'pagination', title: 'Billing', description: 'Plan and invoices' },
      ].map(row => ({ ...row, media: sparkle(h), press: { href: `/components/${row.key}` } })),
      style: SettingsListStyle,
      itemStyle: style,
    },
    h,
  )
// #endregion

// #region item-selectable
// Rows as a choice: the chosen one is pressed and keeps a film of its text.
export const itemSelectable = <Message>(
  style: NamedStyle<typeof ItemSlots>,
  choice: Choice<Message>,
  h: HtmlBuilder<Message>,
): Html =>
  Item.group(
    {
      label: 'Plan',
      items: ['Starter', 'Team', 'Business'].map(title => ({
        key: title,
        title,
        selected: title === choice.chosen,
        press: { onClick: choice.onChoose(title) },
      })),
      itemStyle: style,
    },
    h,
  )
// #endregion

// #region empty-results
export const EmptyResultsStyle = forSlots(EmptySlots)(Recipes.Empty({}))

// No results: say what was looked for, and offer the way out.
export const emptyResults = (style: NamedStyle<typeof EmptySlots>, h: HtmlBuilder<never>): Html =>
  Empty.view(
    {
      icon: sparkle(h),
      title: 'No results for “invoices 2019”',
      description: 'Check the spelling, or search every folder.',
      action: Button.view({ label: 'Search everywhere', style: ButtonStyle }, h),
      style,
    },
    h,
  )
// #endregion

// #region empty-first-use
export const EmptyFirstUseStyle = forSlots(EmptySlots)(Recipes.Empty({ frame: 'dashed' }))

// First use: a dashed frame where the first item will go.
export const emptyFirstUse = (style: NamedStyle<typeof EmptySlots>, h: HtmlBuilder<never>): Html =>
  Empty.view(
    {
      icon: sparkle(h),
      title: 'No projects yet',
      description: 'Projects hold your pages and the people who edit them.',
      action: h.div(
        [h.Style({ display: 'flex', gap: '0.5rem' })],
        [
          Button.view({ label: 'New project', style: ButtonStyle }, h),
          Button.view({ label: 'Import', style: ButtonStyle }, h),
        ],
      ),
      style,
    },
    h,
  )
// #endregion

// #region empty-error
export const EmptyErrorStyle = forSlots(EmptySlots)(
  Recipes.Empty({ tone: 'danger', frame: 'filled' }),
)

// A load that failed: the icon in the error's ink, and a retry.
export const emptyError = (style: NamedStyle<typeof EmptySlots>, h: HtmlBuilder<never>): Html =>
  Empty.view(
    {
      icon: sparkle(h),
      title: 'Could not load your projects',
      description: 'The server did not answer. Your work is safe.',
      action: Button.view({ label: 'Try again', style: ButtonStyle }, h),
      style,
    },
    h,
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
  { label: 'Grid', check: 'checkbox', checked: options.grid, group: 'Show', shortcut: ['⌘', 'G'] },
  { label: 'Rulers', check: 'checkbox', checked: options.rulers, group: 'Show' },
  { label: 'Fit', check: 'radio', checked: options.zoom === 'Fit', group: 'Zoom' },
  {
    label: 'Actual size',
    check: 'radio',
    checked: options.zoom === 'Actual size',
    group: 'Zoom',
  },
  { label: 'Delete', tone: 'destructive', shortcut: ['⌫'] },
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

// #region combobox-basic
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

// #region combobox-multiple
export const CityTags: ReturnType<typeof ComboboxView.Multi.create<string>> =
  ComboboxView.Multi.create<string>()

/** What is typed is the component's; the cities chosen are the Model's. */
export interface CityTagsState {
  readonly combobox: UiCombobox.Multi.Model
  readonly cities: ReadonlyArray<string>
}

// Several cities as chips in the field, each with a remove button; the
// list stays open while choosing, and a chosen city chosen again goes.
export const comboboxMultiple = <Message>(
  style: NamedStyle<typeof ComboboxSlots>,
  state: CityTagsState,
  toMessage: (message: UiCombobox.Message) => Message,
  h: HtmlBuilder<Message>,
): Html => {
  const typed = state.combobox.inputValue
  const part = Combobox.parts([style.mixin], { h })
  return h.submodel({
    slotId: state.combobox.id,
    model: state.combobox,
    view: CityTags.view,
    viewInputs: {
      anchor: { placement: 'bottom-start', gap: 4, padding: 8, portal: false },
      items: cities.filter(city => city.toLowerCase().includes(typed.toLowerCase())),
      restingInputValue: '',
      selectedValues: state.cities,
      itemToConfig: (city: string) => ({ content: part.option({ label: city }, typed) }),
      itemToValue: (city: string) => city,
      itemToDisplayText: (city: string) => city,
      ariaLabel: 'Cities',
      inputPlaceholder: 'Add a city',
      empty: h.span([], ['No cities match']),
      clearContent: h.span([h.AriaHidden(true)], ['×']),
      chips: {},
      toView: Combobox.toView([style.mixin, ...Combobox.fluid], { h }),
    },
    toParentMessage: toMessage,
  })
}
// #endregion

// #region combobox-empty
/** Whether the cities are still being fetched, and the Message that flips it. */
export interface Loading<Message> {
  readonly on: boolean
  readonly onToggle: Message
}

// What the panel says with nothing to list: no match, or a fetch still out.
export const comboboxEmpty = <Message>(
  style: NamedStyle<typeof ComboboxSlots>,
  state: ComboboxState,
  loading: Loading<Message>,
  toMessage: (message: UiCombobox.Message) => Message,
  h: HtmlBuilder<Message>,
): Html => {
  const typed = state.combobox.inputValue.toLowerCase()
  return h.div(
    [h.Style({ display: 'grid', gap: '0.75rem', justifyItems: 'start' })],
    [
      Button.view(
        {
          label: 'Still loading',
          pressed: loading.on,
          onClick: loading.onToggle,
          style: ButtonStyle,
        },
        h,
      ),
      h.submodel({
        slotId: state.combobox.id,
        model: state.combobox,
        view: CityBox.view,
        viewInputs: {
          anchor: { placement: 'bottom-start', gap: 4, padding: 8, portal: false },
          items: loading.on ? [] : cities.filter(city => city.toLowerCase().includes(typed)),
          restingInputValue: Option.getOrElse(state.city, () => ''),
          maybeSelectedValue: state.city,
          itemToConfig: (city: string) => ({ content: h.span([], [city]) }),
          itemToValue: (city: string) => city,
          itemToDisplayText: (city: string) => city,
          ariaLabel: 'City',
          inputPlaceholder: 'Type a city that is not there',
          empty: h.span([], [loading.on ? 'Loading cities…' : 'No cities match']),
          toView: Combobox.toView([style.mixin, ...Combobox.fluid], { h }),
        },
        toParentMessage: toMessage,
      }),
    ],
  )
}
// #endregion

// #region combobox-clear
// A clear button while the field has text: it empties the field and the choice.
export const comboboxClear = <Message>(
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
      ariaLabel: 'City',
      inputPlaceholder: 'Find a city',
      clearContent: h.span([h.AriaHidden(true)], ['×']),
      clearLabel: 'Clear the city',
      toView: Combobox.toView([style.mixin, ...Combobox.fluid], { h }),
    },
    toParentMessage: toMessage,
  })
}
// #endregion

// #region combobox-groups
// A Map: a city is read by what the list holds, and a plain object would
// answer `constructor` from its prototype.
const CONTINENTS = new Map([
  ['Kyiv', 'Europe'],
  ['Oslo', 'Europe'],
  ['Zurich', 'Europe'],
  ['Lagos', 'Africa'],
  ['Lima', 'South America'],
  ['Quito', 'South America'],
  ['Osaka', 'Asia'],
  ['Seoul', 'Asia'],
])
const byContinent = [...CONTINENTS.keys()]

// Rows next to each other with one group key stand under its heading.
export const comboboxGroups = <Message>(
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
      items: byContinent.filter(city => city.toLowerCase().includes(typed)),
      restingInputValue: Option.getOrElse(state.city, () => ''),
      maybeSelectedValue: state.city,
      itemToConfig: (city: string) => ({ content: h.span([], [city]) }),
      itemToValue: (city: string) => city,
      itemToDisplayText: (city: string) => city,
      itemGroupKey: (city: string) => CONTINENTS.get(city) ?? 'Elsewhere',
      groupToHeading: (continent: string) => ({ content: h.span([], [continent]) }),
      ariaLabel: 'City',
      inputPlaceholder: 'Find a city',
      toView: Combobox.toView([style.mixin, ...Combobox.fluid], { h }),
    },
    toParentMessage: toMessage,
  })
}
// #endregion

// #region combobox-creatable
// With no match, the typed words are the one row, offered as a new city;
// the Model adds it to `created` when it is chosen.
export const comboboxCreatable = <Message>(
  style: NamedStyle<typeof ComboboxSlots>,
  state: ComboboxState,
  created: ReadonlyArray<string>,
  toMessage: (message: UiCombobox.Message) => Message,
  h: HtmlBuilder<Message>,
): Html => {
  const typed = state.combobox.inputValue.trim()
  const known = [...cities, ...created]
  const matches = known.filter(city => city.toLowerCase().includes(typed.toLowerCase()))
  return h.submodel({
    slotId: state.combobox.id,
    model: state.combobox,
    view: CityBox.view,
    viewInputs: {
      anchor: { placement: 'bottom-start', gap: 4, padding: 8, portal: false },
      items: matches.length === 0 && typed !== '' ? [typed] : matches,
      restingInputValue: Option.getOrElse(state.city, () => ''),
      maybeSelectedValue: state.city,
      itemToConfig: (city: string) => ({
        content: h.span([], [known.includes(city) ? city : `Create “${city}”`]),
      }),
      itemToValue: (city: string) => city,
      itemToDisplayText: (city: string) => city,
      ariaLabel: 'City',
      inputPlaceholder: 'Find or add a city',
      toView: Combobox.toView([style.mixin, ...Combobox.fluid], { h }),
    },
    toParentMessage: toMessage,
  })
}
// #endregion

// #region calendar-single-range
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
      // The marks and upstream's selected day, both from the one selection.
      viewInputs: Calendar.inputs(selection, [style.mixin, Calendar.readingKeys], { h }),
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

// #region calendar-two-months
/** Two months side by side, a range previewed under the pointer, and presets beside them. */
export interface TwoMonthsState {
  readonly first: UiCalendar.Model
  readonly second: UiCalendar.Model
  readonly range: Calendar.Selection
  readonly preview: Option.Option<FoldkitCalendar.CalendarDate>
}

export interface TwoMonthsMessages<Message> {
  readonly onFirst: (message: UiCalendar.Message) => Message
  readonly onSecond: (message: UiCalendar.Message) => Message
  readonly onPreview: (date: Option.Option<FoldkitCalendar.CalendarDate>) => Message
  readonly onPreset: (selection: Calendar.Selection) => Message
}

/** The day the page was loaded, as the other calendars take it. */
export const TODAY = Effect.runSync(FoldkitCalendar.today.local)

export const TRIP_PRESETS: ReadonlyArray<Calendar.Preset> = [
  { label: 'Last 7 days', selection: Calendar.lastDays(TODAY, 7) },
  { label: 'Last 30 days', selection: Calendar.lastDays(TODAY, 30) },
  { label: 'This month', selection: Calendar.monthOf(TODAY) },
  { label: 'Last month', selection: Calendar.monthOf(TODAY, -1) },
]

export const calendarTwoMonths = <Message>(
  style: NamedStyle<typeof CalendarSlots>,
  state: TwoMonthsState,
  messages: TwoMonthsMessages<Message>,
  h: HtmlBuilder<Message>,
): Html => {
  const month = (
    model: UiCalendar.Model,
    paging: 'previous' | 'next',
    toParentMessage: (message: UiCalendar.Message) => Message,
  ) =>
    h.submodel({
      slotId: model.id,
      model,
      view: UiCalendar.view,
      viewInputs: Calendar.inputs(
        state.range,
        [style.mixin, Calendar.readingKeys],
        { h },
        {
          paging,
          caption: 'label',
          preview: { date: state.preview, onPreview: messages.onPreview },
        },
      ),
      toParentMessage,
    })
  return h.div(
    [h.Style({ display: 'flex', flexWrap: 'wrap', gap: '1.5rem', alignItems: 'start' })],
    [
      Calendar.presetsView(
        { presets: TRIP_PRESETS, selection: state.range, onPick: messages.onPreset, style },
        h,
      ),
      month(state.first, 'previous', messages.onFirst),
      month(state.second, 'next', messages.onSecond),
    ],
  )
}
// #endregion

// #region calendar-dropdowns
/** Months and years chosen from selects, and the weeks numbered. */
export const calendarDropdowns = <Message>(
  style: NamedStyle<typeof CalendarSlots>,
  state: { readonly calendar: UiCalendar.Model; readonly selection: Calendar.Selection },
  toMessage: (message: UiCalendar.Message) => Message,
  onShow: (shown: Calendar.Shown) => Message,
  h: HtmlBuilder<Message>,
): Html =>
  h.submodel({
    slotId: state.calendar.id,
    model: state.calendar,
    view: UiCalendar.view,
    viewInputs: Calendar.inputs(
      state.selection,
      [style.mixin, Calendar.readingKeys],
      { h },
      {
        weekNumbers: true,
        dropdowns: { model: state.calendar, onShow },
      },
    ),
    toParentMessage: toMessage,
  })
// #endregion

// #region calendar-unavailable
/** The theme's scales by name, for the notes beside the calendars below. */
const calendarRef = Theme.ref(
  Theme.compose(Theme.tokens, Theme.oklch({ accent: { h: 0, c: 0, l: '50%' } })),
)

const note = <Message>(h: HtmlBuilder<Message>, text: string): Html =>
  h.p(
    [
      h.Style({
        margin: '0',
        color: calendarRef.text.muted,
        fontSize: calendarRef.size.sm,
        maxInlineSize: '18rem',
      }),
    ],
    [text],
  )

/** Days already taken, from the day the page was loaded. */
export const BOOKED: ReadonlyArray<FoldkitCalendar.CalendarDate> = [1, 2, 8, 9, 15, 22].map(days =>
  FoldkitCalendar.addDays(TODAY, days),
)

// The bounds and the closed days are the calendar's own: upstream draws them disabled and skips them.
export const unavailableCalendar = (id: string): UiCalendar.Model =>
  UiCalendar.init({
    id,
    today: TODAY,
    minDate: TODAY,
    maxDate: FoldkitCalendar.addDays(TODAY, 60),
    disabledDaysOfWeek: ['Saturday', 'Sunday'],
    disabledDates: BOOKED,
  })

export const calendarUnavailable = <Message>(
  style: NamedStyle<typeof CalendarSlots>,
  state: { readonly calendar: UiCalendar.Model; readonly day: Calendar.Selection },
  toMessage: (message: UiCalendar.Message) => Message,
  h: HtmlBuilder<Message>,
): Html =>
  h.div(
    [h.Style({ display: 'grid', gap: '0.75rem', justifyItems: 'center' })],
    [
      h.submodel({
        slotId: state.calendar.id,
        model: state.calendar,
        view: UiCalendar.view,
        viewInputs: Calendar.inputs(state.day, [style.mixin, Calendar.readingKeys], { h }),
        toParentMessage: toMessage,
      }),
      note(
        h,
        Option.match(Calendar.firstDate(state.day), {
          onNone: () => 'Weekends and booked days are closed; book up to two months ahead.',
          onSome: date => `Delivery on ${FoldkitCalendar.formatLong(date, state.calendar.locale)}.`,
        }),
      ),
    ],
  )
// #endregion

// #region calendar-several
export const SeveralClearStyle = forSlots(ButtonSlots)(
  Recipes.Button({ tone: 'neutral', variant: 'outline', size: 'sm' }),
)

/** Any number of days: each press adds a day or takes it away again. */
export const calendarSeveral = <Message>(
  style: NamedStyle<typeof CalendarSlots>,
  state: { readonly calendar: UiCalendar.Model; readonly days: Calendar.Selection },
  messages: {
    readonly onCalendar: (message: UiCalendar.Message) => Message
    readonly onClear: Message
  },
  h: HtmlBuilder<Message>,
): Html => {
  const count = Calendar.Selection.match(state.days, {
    Single: ({ date }) => (Option.isSome(date) ? 1 : 0),
    Range: () => 0,
    Multiple: ({ dates }) => dates.length,
  })
  return h.div(
    [h.Style({ display: 'grid', gap: '0.75rem', justifyItems: 'center' })],
    [
      h.submodel({
        slotId: state.calendar.id,
        model: state.calendar,
        view: UiCalendar.view,
        viewInputs: Calendar.inputs(state.days, [style.mixin, Calendar.readingKeys], { h }),
        toParentMessage: messages.onCalendar,
      }),
      h.div(
        [
          h.Style({
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '0.75rem',
            inlineSize: '100%',
          }),
        ],
        [
          note(h, count === 1 ? '1 day chosen' : `${count} days chosen`),
          Button.view(
            {
              label: 'Clear',
              disabled: count === 0,
              onClick: messages.onClear,
              style: SeveralClearStyle,
            },
            h,
          ),
        ],
      ),
    ],
  )
}
// #endregion

// #region calendar-prices
// Pinned: `Recipes.Calendar({ detail: 'text' })`, a taller cell for the price under each number.

/** A night's price: dearer at the weekend, and varying through the month. */
export const priceOf = (date: FoldkitCalendar.CalendarDate): number => {
  const weekend = ['Friday', 'Saturday'].includes(FoldkitCalendar.dayOfWeek(date))
  return 89 + (weekend ? 40 : 0) + ((date.day * 7) % 5) * 6
}

export interface PricesState {
  readonly calendar: UiCalendar.Model
  readonly stay: Calendar.Selection
  readonly preview: Option.Option<FoldkitCalendar.CalendarDate>
}

/** The nights from check-in to check-out, and what they cost together. */
const stayOf = (stay: Calendar.Selection): Option.Option<{ nights: number; total: number }> =>
  Calendar.Selection.match(stay, {
    Single: () => Option.none(),
    Multiple: () => Option.none(),
    Range: ({ start, end }) =>
      Option.map(Option.all({ start, end }), ({ start, end }) => {
        const nights = Math.max(1, FoldkitCalendar.daysUntil(start, end))
        const total = Array.from({ length: nights }, (_, night) =>
          priceOf(FoldkitCalendar.addDays(start, night)),
        ).reduce((sum, price) => sum + price, 0)
        return { nights, total }
      }),
  })

export const calendarPrices = <Message>(
  style: NamedStyle<typeof CalendarSlots>,
  state: PricesState,
  messages: {
    readonly onCalendar: (message: UiCalendar.Message) => Message
    readonly onPreview: (date: Option.Option<FoldkitCalendar.CalendarDate>) => Message
  },
  h: HtmlBuilder<Message>,
): Html =>
  h.div(
    [h.Style({ display: 'grid', gap: '0.75rem', justifyItems: 'center' })],
    [
      h.submodel({
        slotId: state.calendar.id,
        model: state.calendar,
        view: UiCalendar.view,
        viewInputs: Calendar.inputs(
          state.stay,
          [style.mixin, Calendar.readingKeys],
          { h },
          {
            caption: 'label',
            preview: { date: state.preview, onPreview: messages.onPreview },
            // A day that can be booked shows its night's price; the past shows none.
            detail: date =>
              Option.liftPredicate(date, () => !FoldkitCalendar.isBefore(date, TODAY)).pipe(
                Option.map(night => `$${priceOf(night)}`),
              ),
          },
        ),
        toParentMessage: messages.onCalendar,
      }),
      note(
        h,
        Option.match(stayOf(state.stay), {
          onNone: () => 'Pick a check-in day, then a check-out day.',
          onSome: ({ nights, total }) =>
            `${nights} ${nights === 1 ? 'night' : 'nights'} · $${total} in all`,
        }),
      ),
    ],
  )
// #endregion

// #region calendar-events
// Pinned: `Recipes.Calendar({ detail: 'dot' })`, the day's events a dot under its number.
export const EventRowStyle = forSlots(ItemSlots)(Recipes.Item({ density: 'compact' }))
export const TodayStyle = forSlots(ButtonSlots)(
  Recipes.Button({ tone: 'neutral', variant: 'outline', size: 'sm' }),
)

export interface CalendarEvent {
  readonly title: string
  readonly time: string
}

/** A few events, days from the day the page was loaded. */
const EVENTS: ReadonlyArray<{ readonly in: number; readonly event: CalendarEvent }> = [
  { in: 0, event: { title: 'Design review', time: '10:00 – 11:00' } },
  { in: 0, event: { title: 'Lunch with Sam', time: '12:30' } },
  { in: 2, event: { title: 'Sprint planning', time: '09:30 – 10:30' } },
  { in: 5, event: { title: 'Dentist', time: '16:00' } },
  { in: 9, event: { title: 'Team offsite', time: 'All day' } },
  { in: 9, event: { title: 'Dinner', time: '19:00' } },
  { in: 13, event: { title: 'Release', time: '15:00' } },
]

export const eventsOn = (date: FoldkitCalendar.CalendarDate): ReadonlyArray<CalendarEvent> =>
  EVENTS.filter(each => FoldkitCalendar.isEqual(FoldkitCalendar.addDays(TODAY, each.in), date)).map(
    each => each.event,
  )

export const calendarEvents = <Message>(
  style: NamedStyle<typeof CalendarSlots>,
  state: { readonly calendar: UiCalendar.Model; readonly day: Calendar.Selection },
  messages: {
    readonly onCalendar: (message: UiCalendar.Message) => Message
    readonly onToday: Message
  },
  h: HtmlBuilder<Message>,
): Html => {
  const day = Option.getOrElse(Calendar.firstDate(state.day), () => TODAY)
  const events = eventsOn(day)
  return h.div(
    [
      h.Style({
        display: 'flex',
        flexWrap: 'wrap',
        gap: '1.5rem',
        alignItems: 'start',
        inlineSize: '100%',
        maxInlineSize: '40rem',
      }),
    ],
    [
      h.div(
        [h.Style({ display: 'grid', gap: '0.5rem', justifyItems: 'center' })],
        [
          h.submodel({
            slotId: state.calendar.id,
            model: state.calendar,
            view: UiCalendar.view,
            viewInputs: Calendar.inputs(
              state.day,
              [style.mixin, Calendar.readingKeys],
              { h },
              {
                detail: date => {
                  const count = eventsOn(date).length
                  return Option.liftPredicate(
                    count === 1 ? '1 event' : `${count} events`,
                    () => count > 0,
                  )
                },
              },
            ),
            toParentMessage: messages.onCalendar,
          }),
          Button.view({ label: 'Today', onClick: messages.onToday, style: TodayStyle }, h),
        ],
      ),
      h.section(
        [
          h.AriaLabel('Events'),
          h.Style({ display: 'grid', gap: '0.25rem', flex: '1 1 14rem', minInlineSize: '0' }),
        ],
        [
          h.h3(
            [
              h.Style({
                margin: '0',
                fontSize: calendarRef.size.sm,
                fontWeight: calendarRef.weight.semibold,
              }),
            ],
            [FoldkitCalendar.formatLong(day, state.calendar.locale)],
          ),
          ...(events.length === 0
            ? [note(h, 'Nothing planned.')]
            : events.map(event =>
                Item.view(
                  {
                    media: h.span(
                      [
                        h.AriaHidden(true),
                        h.Style({
                          display: 'block',
                          inlineSize: '0.25rem',
                          blockSize: '1.75rem',
                          borderRadius: calendarRef.radius.full,
                          background: calendarRef.accent.default,
                        }),
                      ],
                      [],
                    ),
                    title: event.title,
                    description: event.time,
                    style: EventRowStyle,
                  },
                  h,
                ),
              )),
        ],
      ),
    ],
  )
}
// #endregion

// #region calendar-appointment
export const SlotStyle = forSlots(ButtonSlots)(
  Recipes.Button({ tone: 'neutral', variant: 'outline', size: 'sm' }),
)

export const TIMES = [
  '09:00',
  '09:30',
  '10:00',
  '10:30',
  '11:00',
  '13:00',
  '13:30',
  '14:00',
  '15:30',
  '16:00',
]

/** The times already taken on `date`: a few, and different from day to day. */
export const takenOn = (date: FoldkitCalendar.CalendarDate): ReadonlyArray<string> =>
  TIMES.filter((_, index) => (date.day + index * 3) % 4 === 0)

export const appointmentCalendar = (id: string): UiCalendar.Model =>
  UiCalendar.init({
    id,
    today: TODAY,
    minDate: TODAY,
    disabledDaysOfWeek: ['Saturday', 'Sunday'],
  })

export interface AppointmentState {
  readonly calendar: UiCalendar.Model
  readonly day: Calendar.Selection
  /** The time chosen; a day that has it taken clears it. */
  readonly time: Option.Option<string>
}

export const calendarAppointment = <Message>(
  style: NamedStyle<typeof CalendarSlots>,
  state: AppointmentState,
  messages: {
    readonly onCalendar: (message: UiCalendar.Message) => Message
    readonly onTime: (time: string) => Message
  },
  h: HtmlBuilder<Message>,
): Html => {
  const day = Calendar.firstDate(state.day)
  const taken = Option.match(day, { onNone: () => TIMES, onSome: takenOn })
  return h.div(
    [h.Style({ display: 'grid', gap: '0.75rem', justifyItems: 'start' })],
    [
      h.div(
        [h.Style({ display: 'flex', flexWrap: 'wrap', gap: '1.5rem', alignItems: 'start' })],
        [
          h.submodel({
            slotId: state.calendar.id,
            model: state.calendar,
            view: UiCalendar.view,
            viewInputs: Calendar.inputs(state.day, [style.mixin, Calendar.readingKeys], { h }),
            toParentMessage: messages.onCalendar,
          }),
          h.div(
            [
              h.Role('group'),
              h.AriaLabel('Time'),
              h.Style({
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(5rem, 1fr))',
                gap: '0.375rem',
                alignContent: 'start',
                flex: '1 1 11rem',
                maxInlineSize: '16rem',
              }),
            ],
            TIMES.map(time =>
              Button.view(
                {
                  label: time,
                  pressed: Option.exists(state.time, chosen => chosen === time),
                  disabled: taken.includes(time),
                  onClick: messages.onTime(time),
                  style: SlotStyle,
                },
                h,
              ),
            ),
          ),
        ],
      ),
      note(
        h,
        Option.match(Option.all({ day, time: state.time }), {
          onNone: () =>
            Option.isNone(day) ? 'Pick a weekday, then a time.' : 'Now pick a time that is free.',
          onSome: ({ day, time }) =>
            `Booked for ${FoldkitCalendar.formatLong(day, state.calendar.locale)} at ${time}.`,
        }),
      ),
    ],
  )
}
// #endregion

// #region date-picker-single
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
        [PanelCalendarStyle.mixin, Calendar.readingKeys],
        { h },
      ),
      toView: DatePicker.toView([style.mixin]),
    },
    toParentMessage: toMessage,
  })
// #endregion

// #region date-picker-range
// A range in a popover: the application's update is `DatePicker.update(range)`,
// which keeps the panel open until both ends are picked. Under `name`, the
// form submits the start and then the end.
export interface DateRangeState {
  readonly picker: UiDatePicker.Model
  readonly range: Calendar.Selection
}

const endOf = (end: Option.Option<FoldkitCalendar.CalendarDate>, missing: string): string =>
  Option.match(end, { onNone: () => missing, onSome: dayOf })

export const datePickerRange = <Message>(
  style: NamedStyle<typeof DatePickerSlots>,
  state: DateRangeState,
  toMessage: (message: UiDatePicker.Message) => Message,
  h: HtmlBuilder<Message>,
): Html =>
  h.submodel({
    slotId: state.picker.id,
    model: state.picker,
    view: DatePickerView.view,
    viewInputs: {
      anchor: {
        placement: 'bottom-start',
        gap: 4,
        padding: 8,
        isPlacementLocked: true,
        portal: false,
      },
      selection: state.range,
      name: 'stay',
      triggerContent: selection =>
        h.span(
          [],
          [
            Calendar.Selection.match(selection, {
              Range: ({ start, end }) =>
                Option.isNone(start)
                  ? 'Pick your dates'
                  : `${endOf(start, '')} – ${endOf(end, 'pick an end')}`,
              Single: ({ date }) => endOf(date, 'Pick a date'),
              Multiple: ({ dates }) => `${dates.length} days`,
            }),
          ],
        ),
      toCalendarView: Calendar.toView(
        state.range,
        [PanelCalendarStyle.mixin, Calendar.readingKeys],
        { h },
      ),
      toView: DatePicker.toView([style.mixin]),
    },
    toParentMessage: toMessage,
  })
// #endregion

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
      Toast.view({ model: stack.model, onMessage: stack.onMessage, label: stack.label, style }, h),
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
        },
        h,
      ),
      h.p([h.Style({ margin: '0', padding: '0.75rem' })], ['The page.']),
    ],
  )
// #endregion

// #region menubar
export const MenubarStyle = forSlots(MenubarSlots)(Recipes.Menubar({}))
const MenubarMenuStyle = forSlots(MenuSlots)(Recipes.MenubarMenu({}))

/** The bar's menus, in the order of the Model's. */
export const MENUBAR: ReadonlyArray<Menubar.MenubarMenu> = [
  { label: 'File', rows: [{ label: 'New' }, { label: 'Open' }, { label: 'Save' }] },
  {
    label: 'Edit',
    rows: [{ label: 'Undo' }, { label: 'Redo' }, { label: 'Copy' }],
    isRowDisabled: label => label === 'Redo',
  },
  { label: 'View', rows: [{ label: 'Zoom in' }, { label: 'Zoom out' }, { label: 'Full screen' }] },
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

// #region steps-progress
export const ProgressStepsStyle = forSlots(StepsSlots)(Recipes.Steps({ connector: 'progress' }))

// The connector is the Progress bar's track, filling after each step done and,
// after the current one, by how far it has gone.
export const stepsProgress = <Message>(
  style: NamedStyle<typeof StepsSlots>,
  h: HtmlBuilder<Message>,
): Html =>
  Steps.view(
    {
      label: 'Upload',
      steps: [{ title: 'Choose' }, { title: 'Upload' }, { title: 'Process' }, { title: 'Done' }],
      current: 1,
      progress: 0.6,
      style,
    },
    h,
  )
// #endregion

// #region steps-dots
export const DotStepsStyle = forSlots(StepsSlots)(Recipes.Steps({ marker: 'dot' }))

// Dots for a light stepper; `size` sets a numbered marker on the Avatar's sizes.
export const stepsDots = <Message>(
  style: NamedStyle<typeof StepsSlots>,
  h: HtmlBuilder<Message>,
): Html =>
  Steps.view(
    {
      label: 'Onboarding',
      steps: [{ title: 'Profile' }, { title: 'Team' }, { title: 'Billing' }, { title: 'Launch' }],
      current: 2,
      style,
    },
    h,
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
      strength: {
        id: 'preview-new-password-strength',
        label: 'Strength',
        value: rules.filter(rule => rule.met).length,
        max: 4,
        low: 2,
        high: 3,
        optimum: 4,
        style: MeterStyle,
      },
      requirements: rules,
      capsLock: { on: field.capsLock, onKey: field.onCapsLock },
      style,
    },
    h,
  )
}
// #endregion

// #region tags-input-basic
export const TagsInputStyle = forSlots(TagsInputSlots)(Recipes.TagsInput({}))

export const tagsInput = <Message>(
  style: NamedStyle<typeof TagsInputSlots>,
  model: TagsInput.Model,
  onMessage: (message: TagsInput.Message) => Message,
  h: HtmlBuilder<Message>,
): Html =>
  TagsInput.view({ model, onMessage, label: 'Topics', placeholder: 'Add a topic', style }, h)
// #endregion

// #region tags-input-max
// At most three: a fourth is refused, said under the field, and the field shakes once.
export const tagsInputMax = <Message>(
  style: NamedStyle<typeof TagsInputSlots>,
  model: TagsInput.Model,
  onMessage: (message: TagsInput.Message) => Message,
  h: HtmlBuilder<Message>,
): Html => TagsInput.view({ model, onMessage, label: 'Labels, up to three', style }, h)
// #endregion

// #region tags-input-refusals
// Type a tag the field holds already: the refusal is said in your words.
export const tagsInputRefusals = <Message>(
  style: NamedStyle<typeof TagsInputSlots>,
  model: TagsInput.Model,
  onMessage: (message: TagsInput.Message) => Message,
  h: HtmlBuilder<Message>,
): Html =>
  TagsInput.view(
    {
      model,
      onMessage,
      label: 'Topics',
      placeholder: 'Type effect again',
      refusalText: refusal =>
        TagsInput.Refusal.match(refusal, {
          Repeat: ({ tag }) => `“${tag}” is on the list already.`,
          Empty: () => 'Type a topic first.',
          Full: ({ max }) => `That makes more than ${max}.`,
        }),
      style,
    },
    h,
  )
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
          sheet: [SidebarSheetStyle.mixin],
                      h.p([], ['Drag the handle up for every filter, or down to close.']),
                      Button.view(
                        { label: 'Show results', onClick: messages.onClose, style: ButtonStyle },
                        h,
                      ),
                    ]),
                  ]
                : [],
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
const token = Theme.ref(
  Theme.compose(Theme.tokens, Theme.oklch({ accent: { h: 0, c: 0, l: '50%' } })),
)

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
  { label: 'Acme Inc' },
  { label: 'Acme Corp.' },
  { label: 'Evil Corp.' },
]
export const ACCOUNT: ReadonlyArray<Menu.Row> = [
  { label: 'Account' },
  { label: 'Notifications' },
  { label: 'Log out' },
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

/** The color, its format and the text being typed are the picker's Model, folded with `update`. */
export const colorPicker = <Message>(
  style: NamedStyle<typeof ColorPickerSlots>,
  model: ColorPicker.Model,
  onMessage: (message: ColorPicker.Message) => Message,
  h: HtmlBuilder<Message>,
): Html =>
  ColorPicker.view(
    { model, onMessage, label: 'Accent', presets: ACCENTS, style, slider: ChannelStyle },
    h,
  )
// #endregion

// #region color-picker-popover
const PickerPopoverStyle = forSlots(PopoverSlots)(Recipes.Popover({}))

/** The picker behind a swatch of its color: the popover's open state is its Submodel's. */
export const colorPickerPopover = <Message>(
  style: NamedStyle<typeof ColorPickerSlots>,
  state: { readonly picker: ColorPicker.Model; readonly popover: UiPopover.Model },
  onMessage: (message: ColorPicker.Message) => Message,
  onPopover: (message: UiPopover.Message) => Message,
  h: HtmlBuilder<Message>,
): Html =>
  h.submodel({
    slotId: state.popover.id,
    model: state.popover,
    view: UiPopover.view,
    viewInputs: {
      anchor: { placement: 'bottom-start', gap: 4, padding: 8, portal: false },
      toView: ColorPicker.popover(
        {
          model: state.picker,
          onMessage,
          label: 'Brand color',
          presets: ACCENTS,
          style,
          slider: ChannelStyle,
          popover: [PickerPopoverStyle.mixin],
        },
        h,
      ),
    },
    toParentMessage: onPopover,
  })
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
      h.p([], [model.checked.length === 0 ? 'Nothing staged.' : `${model.checked.length} staged.`]),
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
  h: HtmlBuilder<Message>,
): Html =>
  Segmented.view(
    {
      label: 'View',
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
// `segmentedIcons(style, mode, onMode, true, h)`.
// #endregion

// #region segmented-sizes
export const SegmentedSizes = (['sm', 'md', 'lg'] as const).map(size =>
  forSlots(SegmentedSlots)(Recipes.Segmented({ size })),
)

// Three steps of the size ladder, each a control of its own.
export const segmentedSizes = <Message>(
  range: Range,
  onRange: (range: Range) => Message,
  h: HtmlBuilder<Message>,
): Html =>
  h.div(
    [h.Style({ display: 'grid', gap: '0.75rem', justifyItems: 'start' })],
    SegmentedSizes.map(style => segmented(style, range, onRange, h)),
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

// Folded with `FloatingPanel.update()`; opened with `FloatingPanel.open(model,
// { opener })`, and its `Raised` folded into `order` with `FloatingPanel.raise`.
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
        },
        h,
      ),
    ],
  )
// #endregion

// #region tour-basic
export const TourStyle = forSlots(TourSlots)(Recipes.Tour({}))

/** Folded with `Tour.update(TOUR)`; started with `Tour.start(model, TOUR, { opener })`. */
export const TOUR: Tour.Config = {
  steps: [
    { title: 'Search', description: 'Find any page by its name.', target: 'preview-tour-search' },
    { title: 'Save', description: 'Keep your work as you go.', target: 'preview-tour-save' },
    { title: 'That is all', description: 'Start the tour again from its button.' },
  ],
}

// Each step beside its target, the page dimmed around it; the arrows move on
// and back, Escape skips, and focus returns to the button that started it.
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
      Tour.view({ model, config: TOUR, onMessage, style }, h),
    ],
  )
}
// #endregion
