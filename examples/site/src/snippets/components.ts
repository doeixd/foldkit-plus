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
  Menu as UiMenu,
  Popover as UiPopover,
  RadioGroup as UiRadioGroup,
  Tabs as UiTabs,
} from '@foldkit/ui'
import * as UiCheckbox from '@foldkit/ui/checkbox'
import * as UiSelect from '@foldkit/ui/select'
import * as UiSlider from '@foldkit/ui/slider'
import * as UiSwitch from '@foldkit/ui/switch'
import * as UiTooltip from '@foldkit/ui/tooltip'
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
  ContextMenu,
  Menubar,
  MenubarSlots,
  Nav,
  NavSlots,
  NumberField,
  NumberFieldSlots,
  OtpField,
  OtpFieldSlots,
  Resizable,
  ResizableSlots,
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
  MenuView,
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

// #region button
export const ButtonStyle = forSlots(ButtonSlots)(Recipes.Button({}))

export const button = (style: NamedStyle<typeof ButtonSlots>, h: HtmlBuilder<never>): Html =>
  Button.view({ label: 'Save changes', style }, h)
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

// #region badge
export const BadgeStyle = forSlots(BadgeSlots)(
  Recipes.Badge({
    attribute: 'data-tone',
    tones: { live: 'success', review: 'warning', failed: 'error', draft: 'info' },
  }),
)

export const badges = (style: NamedStyle<typeof BadgeSlots>, h: HtmlBuilder<never>): Html =>
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

// #region alert
export const AlertStyle = forSlots(AlertSlots)(Recipes.Alert({}))

export const alert = (style: NamedStyle<typeof AlertSlots>, h: HtmlBuilder<never>): Html =>
  Alert.view(
    {
      title: 'A new version is out',
      description: 'Reload to pick up the latest fixes. Your drafts are kept.',
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

// #region select
export const SelectStyle = forSlots(SelectSlots)(Recipes.Select({}))

export const select = (style: NamedStyle<typeof SelectSlots>, h: HtmlBuilder<never>): Html =>
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

// #region checkbox
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

// #region kbd
export const KbdStyle = forSlots(KbdSlots)(Recipes.Kbd({}))

export const shortcut = (style: NamedStyle<typeof KbdSlots>, h: HtmlBuilder<never>): Html =>
  h.p([], ['Search with ', Kbd.view({ key: '⌘', style }, h), ' ', Kbd.view({ key: 'K', style }, h)])
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
    [],
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

// #region breadcrumb
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

// #region pagination
export const PaginationStyle = forSlots(PaginationSlots)(Recipes.Pagination({}))

export const pagination = <Message>(
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
      media: h.span([h.AriaHidden(true)], ['●']),
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

// #region radio-group
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

export const radioGroup = <Message>(
  style: NamedStyle<typeof RadioGroupSlots>,
  state: RadioGroupState,
  toMessage: (message: UiRadioGroup.Message) => Message,
  h: HtmlBuilder<Message>,
): Html =>
  h.submodel({
    slotId: state.group.id,
    model: state.group,
    view: BillingGroup.view,
    viewInputs: {
      selectedValue: Option.some(state.billing),
      options: Billing.literals,
      ariaLabel: 'Billing',
      hasOptionDescription: () => true,
      toView: RadioGroup.toView<Billing, Message>([style.mixin], { h }, ({ group, options }) =>
        h.div(
          group,
          options.map(option =>
            h.div(
              [h.Style({ display: 'flex', gap: '0.5rem', alignItems: 'baseline' })],
              [
                h.button(option.option, []),
                h.div(
                  [h.Style({ display: 'grid' })],
                  [
                    h.label(option.label, [billings[option.value].label]),
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

// #region slider
export const SliderStyle = forSlots(SliderSlots)(Recipes.Slider({}))

/** The drag is the component's; the value is the Model's. */
export interface SliderState {
  readonly slider: UiSlider.Model
  readonly volume: number
}

export const slider = <Message>(
  style: NamedStyle<typeof SliderSlots>,
  state: SliderState,
  toMessage: (message: UiSlider.Message) => Message,
  h: HtmlBuilder<Message>,
): Html =>
  h.submodel({
    slotId: state.slider.id,
    model: state.slider,
    view: UiSlider.view,
    viewInputs: {
      value: state.volume,
      ariaLabel: 'Volume',
      formatValue: (value: number) => `${Math.round(value)} percent`,
      toView: Slider.toView([style.mixin], { h }, slider =>
        h.div(slider.root, [
          h.label(slider.label, [`Volume: ${state.volume}%`]),
          h.div(slider.track, [h.div(slider.filledTrack, []), h.div(slider.thumb, [])]),
        ]),
      ),
    },
    toParentMessage: toMessage,
  })
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

export const dialog = <Message>(
  style: NamedStyle<typeof DialogSlots>,
  model: UiDialog.Model,
  messages: DialogMessages<Message>,
  h: HtmlBuilder<Message>,
): Html =>
  h.div(
    [],
    [
      Button.view({ label: 'Delete project', onClick: messages.onOpen, style: DangerStyle }, h),
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
                      h.button(dialog.closeButton, ['✕']),
                      h.h2(dialog.title, ['Delete this project?']),
                      h.p(dialog.description, [
                        'Its pages and their history go for good. Escape keeps it.',
                      ]),
                      h.div(
                        [h.Style({ display: 'flex', gap: '0.5rem', justifyContent: 'end' })],
                        [
                          Button.view(
                            { label: 'Cancel', onClick: messages.onClose, style: QuietStyle },
                            h,
                          ),
                          Button.view(
                            { label: 'Delete', onClick: messages.onClose, style: DangerStyle },
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

// #region alert-dialog
/**
 * An alert dialog: `role="alertdialog"` and no close button; the
 * application drops `Dialog.isDismissal` Messages, so only Cancel or Delete
 * answers it.
 */
export const alertDialog = <Message>(
  style: NamedStyle<typeof DialogSlots>,
  model: UiDialog.Model,
  messages: DialogMessages<Message>,
  h: HtmlBuilder<Message>,
): Html =>
  h.div(
    [],
    [
      Button.view({ label: 'Remove member', onClick: messages.onOpen, style: DangerStyle }, h),
      h.submodel({
        slotId: model.id,
        model,
        view: UiDialog.view,
        viewInputs: {
          hasDescription: true,
          toView: Dialog.toView([style.mixin], { h }, dialog =>
            h.dialog(
              [...dialog.dialog, h.Role('alertdialog')],
              dialog.isVisible
                ? [
                    h.div(dialog.backdrop),
                    h.div(dialog.panel, [
                      h.h2(dialog.title, ['Remove Ada from the team?']),
                      h.p(dialog.description, [
                        'She loses access to every project at once. Only an answer closes this.',
                      ]),
                      h.div(
                        [h.Style({ display: 'flex', gap: '0.5rem', justifyContent: 'end' })],
                        [
                          Button.view(
                            { label: 'Cancel', onClick: messages.onClose, style: QuietStyle },
                            h,
                          ),
                          Button.view(
                            { label: 'Remove', onClick: messages.onClose, style: DangerStyle },
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

export const Action = Schema.Literals(['Rename', 'Duplicate', 'Move', 'Delete'])
export type Action = typeof Action.Type
// Annotated: the inferred type names a foldkit internal module.
export const ActionMenu: ReturnType<typeof MenuView.create<Action>> = MenuView.create<Action>()

/** The open menu is the component's; the action chosen is the Model's. */
export interface MenuState {
  readonly menu: UiMenu.Model
  readonly action: Option.Option<Action>
}

export const menu = <Message>(
  style: NamedStyle<typeof MenuSlots>,
  state: MenuState,
  toMessage: (message: UiMenu.Message) => Message,
  h: HtmlBuilder<Message>,
): Html =>
  h.div(
    [h.Style({ display: 'grid', gap: '0.75rem', justifyItems: 'start' })],
    [
      h.submodel({
        slotId: state.menu.id,
        model: state.menu,
        view: ActionMenu.view,
        viewInputs: {
          anchor: { placement: 'bottom-start', gap: 4, padding: 8, portal: false },
          items: Action.literals,
          itemToConfig: (action: Action) => ({ content: h.span([], [action]) }),
          isItemDisabled: (action: Action) => action === 'Move',
          buttonContent: h.span([], ['Page actions']),
          toView: Menu.toView([style.mixin, ...Menu.fluid], { h }),
        },
        toParentMessage: toMessage,
      }),
      h.p(
        [],
        [
          Option.match(state.action, {
            onNone: () => 'Nothing chosen yet',
            onSome: a => `Chose ${a}`,
          }),
        ],
      ),
    ],
  )
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

// #region context-menu
/** The context menu's state: the Menu's, the point it opened at, the last action. */
export interface ContextMenuState {
  readonly menu: UiMenu.Model
  readonly point: Option.Option<ContextMenu.Point>
  readonly action: Option.Option<Action>
}

export interface ContextMenuMessages<Message> {
  readonly toMessage: (message: UiMenu.Message) => Message
  readonly onPoint: (point: ContextMenu.Point) => Message
  readonly onOpen: Message
}

export const contextMenu = <Message>(
  style: NamedStyle<typeof MenuSlots>,
  state: ContextMenuState,
  messages: ContextMenuMessages<Message>,
  h: HtmlBuilder<Message>,
): Html =>
  h.div(
    [h.Style({ display: 'grid', gap: '0.75rem', justifyItems: 'start' })],
    [
      h.div(
        [
          ...ContextMenu.target({ onPoint: messages.onPoint, onOpen: messages.onOpen }, h),
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
      h.submodel({
        slotId: state.menu.id,
        model: state.menu,
        view: ActionMenu.view,
        viewInputs: {
          anchor: { placement: 'bottom-start', gap: 0, padding: 8, portal: false },
          items: Action.literals,
          itemToConfig: (action: Action) => ({ content: h.span([], [action]) }),
          buttonContent: h.span([], ['Actions for report.pdf']),
          toView: ContextMenu.toView([style.mixin, ...Menu.fluid], { h }, state.point),
        },
        toParentMessage: messages.toMessage,
      }),
      h.p(
        [],
        [
          Option.match(state.action, {
            onNone: () => 'Nothing chosen yet',
            onSome: a => `Chose ${a}`,
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
  h: HtmlBuilder<Message>,
): Html =>
  h.submodel({
    slotId: state.listbox.id,
    model: state.listbox,
    view: FrequencyBox.view,
    viewInputs: {
      anchor: { placement: 'bottom-start', gap: 4, padding: 8, portal: false },
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

/** The month shown and the focused day are the component's; the date is the Model's. */
export interface CalendarState {
  readonly calendar: UiCalendar.Model
  readonly date: Option.Option<FoldkitCalendar.CalendarDate>
}

export const calendar = <Message>(
  style: NamedStyle<typeof CalendarSlots>,
  state: CalendarState,
  toMessage: (message: UiCalendar.Message) => Message,
  h: HtmlBuilder<Message>,
): Html =>
  h.submodel({
    slotId: state.calendar.id,
    model: state.calendar,
    view: UiCalendar.view,
    viewInputs: {
      maybeSelectedDate: state.date,
      toView: Calendar.toView([style.mixin], { h }),
    },
    toParentMessage: toMessage,
  })
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
      toCalendarView: Calendar.toView([PanelCalendarStyle.mixin], { h }),
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

// #region checkbox-group
export const CheckboxGroupStyle = forSlots(CheckboxGroupSlots)(
  Recipes.CheckboxGroup({ variant: 'list' }),
)

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
  h: HtmlBuilder<Message>,
): Html =>
  h.div(
    [
      h.Style({
        blockSize: '12rem',
        inlineSize: 'min(32rem, 100%)',
        border: '1px solid currentColor',
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
          first: h.ul(
            [h.Style({ margin: '0', padding: '0.75rem 1.5rem' })],
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
            { label: 'Inbox', href: '#inbox', current: true },
            { label: 'Projects', href: '#projects' },
            { label: 'Calendar', href: '#calendar' },
          ],
        },
        {
          id: 'settings',
          title: 'Settings',
          links: [
            { label: 'Members', href: '#members' },
            { label: 'Billing', href: '#billing' },
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

// #region navigation-menu
export const NavStyle = forSlots(NavSlots)(Recipes.Nav({}))

const NavPage = Schema.Literals(['Overview', 'Projects', 'Team', 'Settings'])
type NavPage = typeof NavPage.Type

export const nav = <Message>(style: NamedStyle<typeof NavSlots>, h: HtmlBuilder<Message>): Html =>
  UiNav.view<NavPage>({
    items: NavPage.literals,
    ariaLabel: 'Workspace',
    toHref: page => `#${page.toLowerCase()}`,
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
