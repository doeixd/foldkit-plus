/**
 * Each shipped component as an application draws it, over the theme module
 * `/create` hands out (`./theme.ts`). A component's page shows its region,
 * and its previews call the function the region defines with the style the
 * reader selected, so the code on the page is the code that drew it.
 */
import { Option, Schema } from 'effect'
import {
  Combobox as UiCombobox,
  Dialog as UiDialog,
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
import type { NamedStyle } from 'foldkit-mixins'
import {
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
  Card,
  CardGroupSlots,
  CardSlots,
  Checkbox,
  CheckboxSlots,
  Combobox,
  ComboboxSlots,
  ComboboxView,
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
    [h.Style({ display: 'flex', alignItems: 'center', gap: '0.5rem' })],
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
        [style.mixin],
        { h },
        ({ tablist, tabs, activeIndex }) =>
          h.div(
            [],
            [
              h.div(
                tablist,
                tabs.map(tab => h.button(tab.tab, [sections[tab.value].label])),
              ),
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
          toView: Menu.toView([style.mixin], { h }),
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
      toView: Listbox.toView([style.mixin], { h }),
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
      toView: Combobox.toView([style.mixin], { h }),
    },
    toParentMessage: toMessage,
  })
}
// #endregion
