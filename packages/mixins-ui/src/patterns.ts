/**
 * An accessibility pattern per adapter: the slots a widget of that kind must
 * publish, with the capability, events and attributes each must expose, as
 * `A11y.pattern` contracts. `catalog` lists them with their tier, the ARIA
 * roles involved, and the platform floor: what the widget relies on the
 * browser for, so a reader or an agent can ask. The gate test validates
 * every adapter's Slots against its pattern; a custom view built from
 * `foldkit-primitives/interaction` entries validates against the same one.
 */
import { A11y, Attr, Capability, Event } from 'foldkit-mixins'
import { ButtonSlots } from './button.js'
import { CalendarSlots } from './calendar.js'
import { CheckboxSlots } from './checkbox.js'
import { DialogSlots } from './dialog.js'
import { DisclosureSlots } from './disclosure.js'
import { FieldsetSlots } from './fieldset.js'
import { InputSlots } from './input.js'
import { PopoverSlots } from './popover.js'
import { RadioGroupSlots } from './radioGroup.js'
import { SelectSlots } from './select.js'
import { SliderSlots } from './slider.js'
import { SwitchSlots } from './switch.js'
import { TabsSlots } from './tabs.js'
import { TextareaSlots } from './textarea.js'
import { TooltipSlots } from './tooltip.js'

/** Whether the widget keeps state of its own (a Submodel) or only decorates. */
export type Tier = 'stateful' | 'stateless'

/** What a widget relies on the browser for, so nothing here reimplements it. */
export type FloorConcern =
  | 'focus-trap'
  | 'escape-dismiss'
  | 'outside-dismiss'
  | 'inert-outside'
  | 'top-layer'
  | 'backdrop'
  | 'form-submission'
  | 'native-control'

export const Button = A11y.pattern({
  button: { capability: Capability.Interactive, events: [Event.Click], attributes: [Attr.Role] },
})

export const Input = A11y.pattern({
  input: {
    capability: Capability.TextInput,
    events: [Event.Input, Event.Blur],
    attributes: [Attr.AriaInvalid],
  },
  label: { capability: Capability.Container },
  description: { capability: Capability.Container, optional: true },
})

export const Textarea = A11y.pattern({
  textarea: {
    capability: Capability.TextInput,
    events: [Event.Input, Event.Blur],
    attributes: [Attr.AriaInvalid],
  },
  label: { capability: Capability.Container },
  description: { capability: Capability.Container, optional: true },
})

export const Select = A11y.pattern({
  select: {
    capability: Capability.Interactive,
    events: [Event.Change],
    attributes: [Attr.AriaInvalid],
  },
  label: { capability: Capability.Container },
  description: { capability: Capability.Container, optional: true },
})

export const Checkbox = A11y.pattern({
  checkbox: { capability: Capability.Interactive, events: [Event.Click], attributes: [Attr.Role] },
  label: { capability: Capability.Container },
  hiddenInput: { capability: Capability.Base, attributes: [Attr.Value], optional: true },
})

export const Switch = A11y.pattern({
  button: { capability: Capability.Interactive, events: [Event.Click], attributes: [Attr.Role] },
  label: { capability: Capability.Container },
  hiddenInput: { capability: Capability.Base, attributes: [Attr.Value], optional: true },
})

export const Fieldset = A11y.pattern({
  fieldset: { capability: Capability.Container },
  legend: { capability: Capability.Container },
})

export const Disclosure = A11y.pattern({
  button: {
    capability: Capability.Interactive,
    events: [Event.Click],
    attributes: [Attr.AriaExpanded],
  },
  panel: { capability: Capability.Container },
})

export const Dialog = A11y.pattern({
  dialog: { capability: Capability.Container, events: [Event.Cancel] },
  panel: { capability: Capability.Container },
  title: { capability: Capability.Container },
  description: { capability: Capability.Container, optional: true },
  closeButton: { capability: Capability.Interactive, events: [Event.Click], optional: true },
})

export const Popover = A11y.pattern({
  button: {
    capability: Capability.Interactive,
    events: [Event.Click],
    attributes: [Attr.AriaExpanded],
  },
  panel: { capability: Capability.Container },
})

export const Tooltip = A11y.pattern({
  trigger: { capability: Capability.Interactive, events: [Event.Focus, Event.Blur] },
  panel: { capability: Capability.Container, attributes: [Attr.Role] },
})

export const Slider = A11y.pattern({
  root: { capability: Capability.Container },
  track: { capability: Capability.Container, events: [Event.PointerDown] },
  thumb: { capability: Capability.Focusable, attributes: [Attr.Role] },
  label: { capability: Capability.Container },
})

export const Tabs = A11y.pattern({
  tablist: { capability: Capability.Container, attributes: [Attr.Role] },
  tab: {
    capability: Capability.Interactive,
    events: [Event.Click],
    attributes: [Attr.Role, Attr.AriaSelected],
  },
  panel: { capability: Capability.Container, attributes: [Attr.Role] },
})

export const RadioGroup = A11y.pattern({
  group: { capability: Capability.Container, attributes: [Attr.Role] },
  option: { capability: Capability.Interactive, events: [Event.Click], attributes: [Attr.Role] },
  label: { capability: Capability.Container },
})

export const Calendar = A11y.pattern({
  root: { capability: Capability.Container },
  grid: { capability: Capability.Container, attributes: [Attr.Role] },
  previousMonthButton: { capability: Capability.Interactive, events: [Event.Click] },
  nextMonthButton: { capability: Capability.Interactive, events: [Event.Click] },
})

export interface Entry {
  readonly name: string
  readonly pattern: A11y.Pattern
  /** The adapter's own contract, which the gate validates against `pattern`. */
  readonly slots: { readonly [name: string]: unknown }
  readonly tier: Tier
  readonly roles: ReadonlyArray<string>
  readonly floor: ReadonlyArray<FloorConcern>
}

const entry = (
  name: string,
  pattern: A11y.Pattern,
  slots: { readonly [name: string]: unknown },
  tier: Tier,
  roles: ReadonlyArray<string>,
  floor: ReadonlyArray<FloorConcern> = [],
): Entry => Object.freeze({ name, pattern, slots, tier, roles, floor })

/** Every adapted widget, for the gate, DevTools, and agents. */
export const catalog: ReadonlyArray<Entry> = Object.freeze([
  entry('button', Button, ButtonSlots, 'stateless', ['button'], ['native-control']),
  entry(
    'input',
    Input,
    InputSlots,
    'stateless',
    ['textbox'],
    ['native-control', 'form-submission'],
  ),
  entry(
    'textarea',
    Textarea,
    TextareaSlots,
    'stateless',
    ['textbox'],
    ['native-control', 'form-submission'],
  ),
  entry(
    'select',
    Select,
    SelectSlots,
    'stateless',
    ['combobox'],
    ['native-control', 'form-submission'],
  ),
  entry('checkbox', Checkbox, CheckboxSlots, 'stateless', ['checkbox'], ['form-submission']),
  entry('switch', Switch, SwitchSlots, 'stateless', ['switch'], ['form-submission']),
  entry('fieldset', Fieldset, FieldsetSlots, 'stateless', ['group'], ['native-control']),
  entry('disclosure', Disclosure, DisclosureSlots, 'stateless', ['button']),
  entry(
    'dialog',
    Dialog,
    DialogSlots,
    'stateful',
    ['dialog', 'button'],
    ['focus-trap', 'escape-dismiss', 'inert-outside', 'top-layer', 'backdrop'],
  ),
  entry(
    'popover',
    Popover,
    PopoverSlots,
    'stateful',
    ['dialog', 'button'],
    ['top-layer', 'escape-dismiss'],
  ),
  entry('tooltip', Tooltip, TooltipSlots, 'stateful', ['tooltip']),
  entry('slider', Slider, SliderSlots, 'stateful', ['slider'], ['form-submission']),
  entry('tabs', Tabs, TabsSlots, 'stateful', ['tablist', 'tab', 'tabpanel']),
  entry(
    'radioGroup',
    RadioGroup,
    RadioGroupSlots,
    'stateful',
    ['radiogroup', 'radio'],
    ['form-submission'],
  ),
  entry('calendar', Calendar, CalendarSlots, 'stateful', ['grid', 'gridcell', 'button']),
])
