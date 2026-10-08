/**
 * `foldkit-mixins-ui` — published slot contracts and mixin adapters for
 * `@foldkit/ui`. Components still lay out their own markup through `toView`;
 * each adapter's `toView` hands it the bundles with attached Mixins applied,
 * and `resolve` applies them to bundles already in hand.
 */
export * as Alert from './alert.js'
export * as Anchor from './anchor.js'
export * as Avatar from './avatar.js'
export * as Badge from './badge.js'
export * as Breadcrumb from './breadcrumb.js'
export * as Button from './button.js'
export * as ButtonGroup from './buttonGroup.js'
export * as Pagination from './pagination.js'
export * as Calendar from './calendar.js'
export * as Card from './card.js'
export * as Checkbox from './checkbox.js'
export * as Combobox from './combobox.js'
export * as ComboboxView from './comboboxView.js'
export * as DatePicker from './datePicker.js'
export * as DatePickerView from './datePickerView.js'
export * as Dialog from './dialog.js'
export * as Disclosure from './disclosure.js'
export * as Empty from './empty.js'
export * as Fieldset from './fieldset.js'
export * as FileDrop from './fileDrop.js'
export * as HoverIntent from './hoverIntent.js'
export * as Icons from './icons.js'
export * as Input from './input.js'
export * as Item from './item.js'
export * as Kbd from './kbd.js'
export * as Label from './label.js'
export * as Listbox from './listbox.js'
export * as ListboxView from './listboxView.js'
export * as Menu from './menu.js'
export * as MenuView from './menuView.js'
export * as Patterns from './patterns.js'
export * as Popover from './popover.js'
export * as RadioGroup from './radioGroup.js'
export * as Recipes from './recipes/index.js'
export * as Select from './select.js'
export * as Separator from './separator.js'
export * as Segmented from './segmented.js'
export * as Skeleton from './skeleton.js'
export * as Slider from './slider.js'
export * as Spinner from './spinner.js'
export * as Switch from './switch.js'
export * as Tabs from './tabs.js'
export * as Table from './table.js'
export * as Textarea from './textarea.js'
export * as Toast from './toast.js'
export * as ToastView from './toastView.js'
export * as Tooltip from './tooltip.js'
export * as Touch from './touch.js'
export * as Typography from './typography.js'
export * as ScrollArea from './scrollArea.js'

export { AlertSlots } from './alert.js'
export { AvatarSlots } from './avatar.js'
export { BadgeSlots } from './badge.js'
export { BreadcrumbSlots } from './breadcrumb.js'
export { ButtonSlots } from './button.js'
export { ButtonGroupSlots } from './buttonGroup.js'
export { PaginationSlots } from './pagination.js'
export { CalendarSlots } from './calendar.js'
export { CardSlots } from './card.js'
export { CheckboxSlots } from './checkbox.js'
export { ComboboxSlots } from './combobox.js'
export { DatePickerSlots } from './datePicker.js'
export { DialogSlots } from './dialog.js'
export { DisclosureSlots } from './disclosure.js'
export { EmptySlots } from './empty.js'
export { FieldsetSlots } from './fieldset.js'
export { FileDropSlots } from './fileDrop.js'
export { HoverIntentSlots } from './hoverIntent.js'
export { InputSlots } from './input.js'
export { ItemSlots } from './item.js'
export { KbdSlots } from './kbd.js'
export { LabelSlots } from './label.js'
export { ListboxSlots } from './listbox.js'
export { MenuSlots } from './menu.js'
export { PopoverSlots } from './popover.js'
export { RadioGroupSlots } from './radioGroup.js'
export { SelectSlots } from './select.js'
export { SeparatorSlots } from './separator.js'
export { SegmentedSlots } from './segmented.js'
export { SkeletonSlots } from './skeleton.js'
export { SliderSlots } from './slider.js'
export { SpinnerSlots } from './spinner.js'
export { SwitchSlots } from './switch.js'
export { TabsSlots } from './tabs.js'
export { TableSlots } from './table.js'
export { TextareaSlots } from './textarea.js'
export { ToastSlots } from './toast.js'
export { TooltipSlots } from './tooltip.js'
export { TypographySlots } from './typography.js'
export { ScrollAreaSlots } from './scrollArea.js'

export { resolveFor as resolve } from './resolve.js'
export type { FieldParts } from './field.js'
export type { MixinList, ResolveContext, Resolved, ResolvedSlots } from './resolve.js'
export type { ButtonView, ResolvedButton } from './button.js'
export type { ResolvedCheckbox } from './checkbox.js'
export type {
  ResolvedCombobox,
  ResolvedComboboxGroup,
  ResolvedComboboxHeading,
  ResolvedComboboxItem,
  ResolvedComboboxToggle,
} from './combobox.js'
export type {
  ComboboxGroupRender,
  ComboboxHeadingRender,
  ComboboxItemRender,
  ComboboxRenderInfo,
  MultiBundle as ComboboxMultiBundle,
  MultiViewInputs as ComboboxMultiViewInputs,
  SingleBundle as ComboboxSingleBundle,
  SingleViewInputs as ComboboxSingleViewInputs,
} from './comboboxView.js'
export type { ResolvedDatePicker } from './datePicker.js'
export type { DatePickerRenderInfo, DatePickerViewInputs } from './datePickerView.js'
export type { ResolvedDialog } from './dialog.js'
export type { ResolvedDisclosure } from './disclosure.js'
export type { ResolvedFieldset } from './fieldset.js'
export type { ResolvedFileDrop } from './fileDrop.js'
export type { ResolvedHoverIntent } from './hoverIntent.js'
export type { InputField, InputView, ResolvedInput } from './input.js'
export type {
  ResolvedListbox,
  ResolvedListboxGroup,
  ResolvedListboxHeading,
  ResolvedListboxItem,
} from './listbox.js'
export type {
  ListboxGroupRender,
  ListboxHeadingRender,
  ListboxItemRender,
  ListboxRenderInfo,
  MultiBundle,
  MultiViewInputs,
  SingleBundle,
  SingleViewInputs,
} from './listboxView.js'
export type {
  ResolvedMenu,
  ResolvedMenuGroup,
  ResolvedMenuHeading,
  ResolvedMenuItem,
} from './menu.js'
export type {
  MenuBundle,
  MenuGroupRender,
  MenuHeadingRender,
  MenuItemRender,
  MenuRenderInfo,
  MenuViewInputs,
} from './menuView.js'
export type { ResolvedPopover } from './popover.js'
export type { ResolvedRadioGroup, ResolvedRadioOption } from './radioGroup.js'
export type { ResolvedSelect } from './select.js'
export type { ResolvedSlider } from './slider.js'
export type { ResolvedSwitch } from './switch.js'
export type { ResolvedTab, ResolvedTabs } from './tabs.js'
export type { ResolvedTextarea, TextareaField, TextareaView } from './textarea.js'
export type { ResolvedToast, ResolvedToastEntry } from './toast.js'
export type { ToastEntryRender, ToastRenderInfo } from './toastView.js'
export type { ResolvedTooltip } from './tooltip.js'
export type {
  ResolvedCalendar,
  ResolvedColumnHeader,
  ResolvedDayCell,
  ResolvedDays,
  ResolvedMonthCell,
  ResolvedMonths,
  ResolvedWeek,
  ResolvedYearCell,
  ResolvedYears,
} from './calendar.js'
