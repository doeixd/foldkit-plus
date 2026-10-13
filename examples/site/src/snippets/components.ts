/**
 * Each shipped component as an application draws it, over the theme module
 * `/create` hands out (`./theme.ts`). A component's page shows its region,
 * and its previews call the function the region defines with the style the
 * reader selected, so the code on the page is the code that drew it.
 */
import * as UiCheckbox from '@foldkit/ui/checkbox'
import * as UiSelect from '@foldkit/ui/select'
import * as UiSwitch from '@foldkit/ui/switch'
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
  CardSlots,
  Checkbox,
  CheckboxSlots,
  Empty,
  EmptySlots,
  Input,
  InputSlots,
  Item,
  ItemSlots,
  Kbd,
  KbdSlots,
  Pagination,
  PaginationSlots,
  Recipes,
  Select,
  SelectSlots,
  Separator,
  SeparatorSlots,
  Skeleton,
  SkeletonSlots,
  Spinner,
  SpinnerSlots,
  Switch,
  SwitchSlots,
  Table,
  TableSlots,
  Textarea,
  TextareaSlots,
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

export const card = (style: NamedStyle<typeof CardSlots>, h: HtmlBuilder<never>): Html =>
  Card.view(
    {
      title: 'Invite your team',
      description: 'Everyone you invite can edit every page.',
      content: h.p([], ['Three seats left on the Starter plan.']),
      footer: Button.view({ label: 'Send invites', style: ButtonStyle }, h),
      style,
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
