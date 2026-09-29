/**
 * `foldkit-mixins-ui` — published slot contracts and mixin adapters for
 * `@foldkit/ui`. Components still lay out their own markup through `toView`;
 * each adapter's `toView` hands it the bundles with attached Mixins applied,
 * and `resolve` applies them to bundles already in hand.
 */
export * as Anchor from './anchor.js'
export * as Button from './button.js'
export * as Calendar from './calendar.js'
export * as Checkbox from './checkbox.js'
export * as Dialog from './dialog.js'
export * as Disclosure from './disclosure.js'
export * as Fieldset from './fieldset.js'
export * as HoverIntent from './hoverIntent.js'
export * as Icons from './icons.js'
export * as Input from './input.js'
export * as Patterns from './patterns.js'
export * as Popover from './popover.js'
export * as RadioGroup from './radioGroup.js'
export * as Recipes from './recipes/index.js'
export * as Select from './select.js'
export * as Segmented from './segmented.js'
export * as Slider from './slider.js'
export * as Switch from './switch.js'
export * as Tabs from './tabs.js'
export * as Textarea from './textarea.js'
export * as Tooltip from './tooltip.js'
export * as Touch from './touch.js'

export { ButtonSlots } from './button.js'
export { CalendarSlots } from './calendar.js'
export { CheckboxSlots } from './checkbox.js'
export { DialogSlots } from './dialog.js'
export { DisclosureSlots } from './disclosure.js'
export { FieldsetSlots } from './fieldset.js'
export { HoverIntentSlots } from './hoverIntent.js'
export { InputSlots } from './input.js'
export { PopoverSlots } from './popover.js'
export { RadioGroupSlots } from './radioGroup.js'
export { SelectSlots } from './select.js'
export { SegmentedSlots } from './segmented.js'
export { SliderSlots } from './slider.js'
export { SwitchSlots } from './switch.js'
export { TabsSlots } from './tabs.js'
export { TextareaSlots } from './textarea.js'
export { TooltipSlots } from './tooltip.js'

export { resolveFor as resolve } from './resolve.js'
export type { MixinList, ResolveContext, Resolved, ResolvedSlots } from './resolve.js'
export type { ButtonView, ResolvedButton } from './button.js'
export type { ResolvedCheckbox } from './checkbox.js'
export type { ResolvedDialog } from './dialog.js'
export type { ResolvedDisclosure } from './disclosure.js'
export type { ResolvedFieldset } from './fieldset.js'
export type { ResolvedHoverIntent } from './hoverIntent.js'
export type { ResolvedInput } from './input.js'
export type { ResolvedPopover } from './popover.js'
export type { ResolvedRadioGroup, ResolvedRadioOption } from './radioGroup.js'
export type { ResolvedSelect } from './select.js'
export type { ResolvedSlider } from './slider.js'
export type { ResolvedSwitch } from './switch.js'
export type { ResolvedTab, ResolvedTabs } from './tabs.js'
export type { ResolvedTextarea } from './textarea.js'
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
