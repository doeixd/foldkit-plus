/**
 * An accessibility pattern per adapted widget with an ARIA contract: the
 * slots a widget of that kind must publish, with the capability, events and
 * attributes each must expose, as `A11y.pattern` contracts. Timing and
 * positioning behaviors without an ARIA contract of their own (`Anchor`,
 * `HoverIntent`) get none — they borrow their content's. `catalog` lists
 * the patterns with their tier, the ARIA roles involved, and the platform
 * floor: what the widget relies on the browser for, so a reader or an agent
 * can ask. The gate test validates every adapter's Slots against its
 * pattern; a custom view built from `foldkit-primitives/interaction`
 * entries validates against the same one.
 */
import { A11y, Attr, Capability, Event } from 'foldkit-mixins'
import { AccordionSlots } from './accordion.js'
import { ButtonSlots } from './button.js'
import { CalendarSlots } from './calendar.js'
import { CheckboxSlots } from './checkbox.js'
import { CheckboxGroupSlots } from './checkboxGroup.js'
import { CommandSlots } from './command.js'
import { MenubarSlots } from './menubar.js'
import { MeterSlots } from './meter.js'
import { NavSlots } from './nav.js'
import { CarouselSlots } from './carousel.js'
import { TreeViewSlots } from './treeView.js'
import { ColorPickerSlots } from './colorPicker.js'
import { InputCopySlots } from './inputCopy.js'
import { AlertSlots } from './alert.js'
import { AppShellSlots } from './appShell.js'
import { TagsInputSlots } from './tagsInput.js'
import { PasswordInputSlots } from './passwordInput.js'
import { RatingSlots } from './rating.js'
import { StepsSlots } from './steps.js'
import { VirtualListSlots } from './virtualList.js'
import { ProgressSlots } from './progress.js'
import { NumberFieldSlots } from './numberField.js'
import { OtpFieldSlots } from './otpField.js'
import { ResizableSlots } from './resizable.js'
import { SidebarSlots } from './sidebar.js'
import { DialogSlots } from './dialog.js'
import { DisclosureSlots } from './disclosure.js'
import { FieldsetSlots } from './fieldset.js'
import { FileDropSlots } from './fileDrop.js'
import { ComboboxSlots } from './combobox.js'
import { SegmentedSlots } from './segmented.js'
import { DatePickerSlots } from './datePicker.js'
import { ToastSlots } from './toast.js'
import { InputSlots } from './input.js'
import { ListboxSlots } from './listbox.js'
import { MenuSlots } from './menu.js'
import { PopoverSlots } from './popover.js'
import { RadioGroupSlots } from './radioGroup.js'
import { SelectSlots } from './select.js'
import { SliderSlots } from './slider.js'
import { SwitchSlots } from './switch.js'
import { TabsSlots } from './tabs.js'
import { TextareaSlots } from './textarea.js'
import { TooltipSlots } from './tooltip.js'
import { ChatMessageSlots } from './chatMessage.js'
import { MessageScrollerSlots } from './messageScroller.js'
import { ThinkingIndicatorSlots } from './thinkingIndicator.js'
import { ThinkingStepsSlots } from './thinkingSteps.js'
import { QuestionnaireSlots } from './questionnaire.js'
import { AngleSliderSlots } from './angleSlider.js'
import { TimerSlots } from './timer.js'
import { MarqueeSlots } from './marquee.js'
import { ImageCropperSlots } from './imageCropper.js'
import { SignaturePadSlots } from './signaturePad.js'
import { QrCodeSlots } from './qrCode.js'
import { ChartSlots } from './chart.js'
import { CascadeSelectSlots } from './cascadeSelect.js'
import { FloatingPanelSlots } from './floatingPanel.js'
import { TourSlots } from './tour.js'

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

export const Accordion = A11y.pattern({
  trigger: {
    capability: Capability.Interactive,
    events: [Event.Click],
    attributes: [Attr.AriaExpanded],
  },
  panel: { capability: Capability.Container, attributes: [Attr.Role] },
})

export const CheckboxGroup = A11y.pattern({
  root: { capability: Capability.Container },
  legend: { capability: Capability.Container },
  checkbox: {
    capability: Capability.Interactive,
    events: [Event.Click],
    attributes: [Attr.Role],
  },
})

export const NumberField = A11y.pattern({
  input: {
    capability: Capability.Focusable,
    events: [Event.KeyDown],
    attributes: [Attr.Role],
  },
  label: { capability: Capability.Container },
})

export const OtpField = A11y.pattern({
  input: {
    capability: Capability.Focusable,
    events: [Event.Input],
    attributes: [Attr.AriaLabel],
  },
})

export const Command = A11y.pattern({
  input: {
    capability: Capability.Focusable,
    events: [Event.Input, Event.KeyDown],
    attributes: [Attr.Role, Attr.AriaExpanded],
  },
  list: { capability: Capability.Container, attributes: [Attr.Role] },
  item: {
    capability: Capability.Interactive,
    events: [Event.Click],
    attributes: [Attr.Role, Attr.AriaSelected],
  },
})

export const Resizable = A11y.pattern({
  handle: {
    capability: Capability.Interactive,
    events: [Event.KeyDown],
    attributes: [Attr.Role, Attr.AriaLabel],
  },
})

export const Sidebar = A11y.pattern({
  toggle: {
    capability: Capability.Interactive,
    events: [Event.Click],
    attributes: [Attr.AriaExpanded],
  },
  nav: { capability: Capability.Container },
  trigger: {
    capability: Capability.Interactive,
    events: [Event.Click],
    attributes: [Attr.AriaExpanded],
  },
})

export const Menubar = A11y.pattern({
  bar: { capability: Capability.Container, events: [Event.KeyDown] },
  menu: { capability: Capability.Container },
})

export const Progress = A11y.pattern({
  root: { capability: Capability.Container },
  label: { capability: Capability.Container },
})

export const Meter = A11y.pattern({
  root: { capability: Capability.Container },
  label: { capability: Capability.Container },
})

export const VirtualList = A11y.pattern({
  root: { capability: Capability.Container },
  row: { capability: Capability.Container },
})

export const Steps = A11y.pattern({
  root: { capability: Capability.Container, attributes: [Attr.AriaLabel] },
  item: { capability: Capability.Container },
  trigger: { capability: Capability.Interactive, events: [Event.Click] },
})

export const Rating = A11y.pattern({
  root: { capability: Capability.Container, attributes: [Attr.Role] },
  label: { capability: Capability.Container },
  star: {
    capability: Capability.Interactive,
    events: [Event.Change],
    attributes: [Attr.AriaLabel],
  },
})

export const PasswordInput = A11y.pattern({
  label: { capability: Capability.Container },
  input: {
    capability: Capability.TextInput,
    events: [Event.Input],
    attributes: [Attr.AriaInvalid],
  },
  toggle: {
    capability: Capability.Interactive,
    events: [Event.Click],
    attributes: [Attr.AriaLabel, Attr.AriaPressed],
  },
  description: { capability: Capability.Container, optional: true },
})

export const TagsInput = A11y.pattern({
  label: { capability: Capability.Container },
  input: { capability: Capability.Focusable, events: [Event.Input, Event.KeyDown] },
  list: { capability: Capability.Container },
  remove: {
    capability: Capability.Interactive,
    events: [Event.Click],
    attributes: [Attr.AriaLabel],
  },
})

/** Inline, the root's `role` makes it a live region; as a banner, its `aria-label` names a landmark. */
export const Alert = A11y.pattern({
  root: { capability: Capability.Container, attributes: [Attr.Role, Attr.AriaLabel] },
  action: { capability: Capability.Interactive, optional: true },
  dismiss: {
    capability: Capability.Interactive,
    events: [Event.Click],
    attributes: [Attr.AriaLabel],
    optional: true,
  },
})

/** One banner, one main region the skip link reaches, and the link itself. */
export const AppShell = A11y.pattern({
  root: { capability: Capability.Container },
  skip: { capability: Capability.Interactive },
  header: { capability: Capability.Container },
  main: { capability: Capability.Container },
})

export const InputCopy = A11y.pattern({
  label: { capability: Capability.Container },
  input: { capability: Capability.Focusable, attributes: [Attr.Value] },
  button: { capability: Capability.Interactive, events: [Event.Click] },
  status: { capability: Capability.Container, attributes: [Attr.Role] },
})

export const ColorPicker = A11y.pattern({
  root: { capability: Capability.Container, attributes: [Attr.Role] },
  label: { capability: Capability.Container },
  areaThumb: {
    capability: Capability.Focusable,
    events: [Event.KeyDown],
    attributes: [Attr.Role, Attr.AriaLabel],
  },
  input: { capability: Capability.TextInput, events: [Event.Input, Event.Change] },
  preset: {
    capability: Capability.Interactive,
    events: [Event.Change],
    attributes: [Attr.AriaLabel],
    optional: true,
  },
})

export const TreeView = A11y.pattern({
  root: {
    capability: Capability.Container,
    events: [Event.KeyDown],
    attributes: [Attr.Role, Attr.AriaLabel],
  },
  item: {
    capability: Capability.Focusable,
    events: [Event.Focus],
    attributes: [Attr.Role, Attr.AriaExpanded, Attr.AriaSelected],
  },
  row: { capability: Capability.Interactive, events: [Event.Click] },
  group: { capability: Capability.Container, attributes: [Attr.Role] },
})

/** One thumb named by the label, or a range's group of two thumbs that each name themselves. */
export const Slider = A11y.pattern({
  root: { capability: Capability.Container, attributes: [Attr.Role] },
  label: { capability: Capability.Container },
  thumb: {
    capability: Capability.Interactive,
    events: [Event.Input],
    attributes: [Attr.AriaLabel],
  },
})

export const Carousel = A11y.pattern({
  root: { capability: Capability.Container, attributes: [Attr.Role, Attr.AriaLabel] },
  slide: { capability: Capability.Container, attributes: [Attr.Role, Attr.AriaLabel] },
  previous: {
    capability: Capability.Interactive,
    events: [Event.Click],
    attributes: [Attr.AriaLabel],
  },
  next: { capability: Capability.Interactive, events: [Event.Click], attributes: [Attr.AriaLabel] },
  dot: {
    capability: Capability.Interactive,
    events: [Event.Click],
    attributes: [Attr.AriaLabel],
    optional: true,
  },
  status: { capability: Capability.Container, attributes: [Attr.Role] },
})

export const Nav = A11y.pattern({
  nav: { capability: Capability.Container },
  link: { capability: Capability.Interactive },
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

export const FileDrop = A11y.pattern({
  root: { capability: Capability.Container },
  input: {
    capability: Capability.Interactive,
    events: [Event.Change],
    attributes: [Attr.Disabled],
  },
})

export const Toast = A11y.pattern({
  container: { capability: Capability.Container, attributes: [Attr.Role] },
  entry: { capability: Capability.Container, attributes: [Attr.Role] },
})

export const Segmented = A11y.pattern({
  group: { capability: Capability.Container, attributes: [Attr.Role, Attr.AriaLabel] },
  option: {
    capability: Capability.Interactive,
    events: [Event.Click],
    attributes: [Attr.AriaPressed, Attr.Disabled, Attr.AriaDisabled],
  },
})

export const DatePicker = A11y.pattern({
  trigger: {
    capability: Capability.Interactive,
    events: [Event.Click],
    attributes: [Attr.AriaExpanded],
  },
  panel: { capability: Capability.Container },
  backdrop: { capability: Capability.Container, optional: true },
})

export const Combobox = A11y.pattern({
  input: {
    capability: Capability.TextInput,
    events: [Event.KeyDown],
    attributes: [Attr.Role, Attr.AriaExpanded],
  },
  items: { capability: Capability.Container, attributes: [Attr.Role], optional: true },
  item: {
    capability: Capability.Interactive,
    events: [Event.Click],
    attributes: [Attr.Role, Attr.AriaSelected],
  },
  toggleButton: {
    capability: Capability.Interactive,
    events: [Event.Click],
    optional: true,
  },
})

export const Listbox = A11y.pattern({
  wrapper: { capability: Capability.Container },
  button: {
    capability: Capability.Interactive,
    events: [Event.Click],
    attributes: [Attr.AriaExpanded],
  },
  backdrop: { capability: Capability.Container, optional: true },
  items: { capability: Capability.Container, attributes: [Attr.Role], optional: true },
  item: {
    capability: Capability.Interactive,
    events: [Event.Click],
    attributes: [Attr.Role, Attr.AriaSelected],
  },
})

export const Menu = A11y.pattern({
  wrapper: { capability: Capability.Container },
  button: {
    capability: Capability.Interactive,
    events: [Event.Click],
    attributes: [Attr.AriaExpanded],
  },
  backdrop: { capability: Capability.Container, optional: true },
  items: { capability: Capability.Container, attributes: [Attr.Role], optional: true },
  item: {
    capability: Capability.Interactive,
    events: [Event.Click],
    attributes: [Attr.Role],
  },
})

/** A message's body, its retry when sending failed, and its actions, each named. */
export const ChatMessage = A11y.pattern({
  root: { capability: Capability.Container },
  body: { capability: Capability.Container },
  retry: { capability: Capability.Interactive, events: [Event.Click], optional: true },
  action: {
    capability: Capability.Interactive,
    events: [Event.Click],
    attributes: [Attr.AriaLabel],
    optional: true,
  },
})

/** A named log, and a press that jumps to its end. */
export const MessageScroller = A11y.pattern({
  log: { capability: Capability.Container, attributes: [Attr.Role, Attr.AriaLabel] },
  jump: { capability: Capability.Interactive, events: [Event.Click], attributes: [Attr.AriaLabel] },
})

/** A status the words fill; the mark is hidden. */
export const ThinkingIndicator = A11y.pattern({
  root: { capability: Capability.Container, attributes: [Attr.Role] },
  label: { capability: Capability.Container },
})

/** A disclosure over a list of steps, each saying its state in words. */
export const ThinkingSteps = A11y.pattern({
  trigger: {
    capability: Capability.Interactive,
    events: [Event.Click],
    attributes: [Attr.AriaExpanded],
  },
  list: { capability: Capability.Container },
  state: { capability: Capability.Container },
})

/** A form of questions; the controls are the RadioGroup's, CheckboxGroup's, Input's and Textarea's. */
export const Questionnaire = A11y.pattern({
  root: { capability: Capability.Container },
  question: { capability: Capability.Container },
  error: { capability: Capability.Container },
})

/** A named group around one slider thumb. */
export const AngleSlider = A11y.pattern({
  root: { capability: Capability.Container, attributes: [Attr.Role] },
  label: { capability: Capability.Container },
  thumb: {
    capability: Capability.Focusable,
    events: [Event.KeyDown],
    attributes: [Attr.Role, Attr.AriaLabel],
  },
})

/** A named group, a timer, and its presses. */
export const Timer = A11y.pattern({
  root: { capability: Capability.Container, attributes: [Attr.Role] },
  label: { capability: Capability.Container },
  area: { capability: Capability.Container, attributes: [Attr.Role] },
  action: { capability: Capability.Interactive, events: [Event.Click], optional: true },
})

/** A named region, and a press to hold it. */
export const Marquee = A11y.pattern({
  root: { capability: Capability.Container, attributes: [Attr.Role, Attr.AriaLabel] },
  viewport: { capability: Capability.Container },
  pause: {
    capability: Capability.Interactive,
    events: [Event.Click],
    attributes: [Attr.AriaLabel],
    optional: true,
  },
})

/** A named group around a selection that is a two-dimensional slider. */
export const ImageCropper = A11y.pattern({
  root: { capability: Capability.Container, attributes: [Attr.Role] },
  label: { capability: Capability.Container },
  selection: {
    capability: Capability.Focusable,
    events: [Event.KeyDown],
    attributes: [Attr.Role, Attr.AriaLabel],
  },
  rotate: {
    capability: Capability.Interactive,
    events: [Event.Click],
    attributes: [Attr.AriaLabel],
    optional: true,
  },
})

/** A named group around an image of what is drawn, its clear press, and a typed name instead. */
export const SignaturePad = A11y.pattern({
  root: { capability: Capability.Container, attributes: [Attr.Role] },
  label: { capability: Capability.Container },
  control: { capability: Capability.Container, attributes: [Attr.Role, Attr.AriaLabel] },
  clear: {
    capability: Capability.Interactive,
    events: [Event.Click],
    attributes: [Attr.AriaLabel],
  },
  input: { capability: Capability.TextInput, events: [Event.Input], optional: true },
})

/** One image named by what it encodes. */
export const QrCode = A11y.pattern({
  root: { capability: Capability.Container, attributes: [Attr.Role, Attr.AriaLabel] },
})

/** A tab stop the arrows step through, a status that says each point, and the data as a table. */
export const Chart = A11y.pattern({
  plot: {
    capability: Capability.Focusable,
    events: [Event.KeyDown, Event.Focus, Event.Blur],
    attributes: [Attr.Role],
  },
  status: { capability: Capability.Container, attributes: [Attr.Role] },
  table: { capability: Capability.Container },
})

/** A combobox opening a tree of columns, each row a treeitem saying whether it is chosen and open. */
export const CascadeSelect = A11y.pattern({
  trigger: {
    capability: Capability.Interactive,
    events: [Event.Click, Event.KeyDown],
    attributes: [Attr.Role, Attr.AriaLabel, Attr.AriaExpanded],
  },
  panel: {
    capability: Capability.Interactive,
    events: [Event.KeyDown],
    attributes: [Attr.Role, Attr.AriaLabel],
  },
  item: {
    capability: Capability.Interactive,
    events: [Event.Click],
    attributes: [Attr.Role, Attr.AriaSelected, Attr.AriaExpanded],
  },
})

/** A non-modal dialog, its drag trigger a named key stop, and a named close. */
export const FloatingPanel = A11y.pattern({
  panel: { capability: Capability.Container, attributes: [Attr.Role] },
  dragTrigger: {
    capability: Capability.Interactive,
    events: [Event.KeyDown],
    attributes: [Attr.AriaLabel],
  },
  close: {
    capability: Capability.Interactive,
    events: [Event.Click],
    attributes: [Attr.AriaLabel],
  },
})

/** A step's dialog taking the keys, with presses to go on and to skip. */
export const Tour = A11y.pattern({
  panel: { capability: Capability.Interactive, events: [Event.KeyDown], attributes: [Attr.Role] },
  next: { capability: Capability.Interactive, events: [Event.Click] },
  skip: { capability: Capability.Interactive, events: [Event.Click] },
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
  entry('accordion', Accordion, AccordionSlots, 'stateless', ['button', 'region']),
  entry('checkbox-group', CheckboxGroup, CheckboxGroupSlots, 'stateless', ['group', 'checkbox']),
  entry('command', Command, CommandSlots, 'stateless', ['combobox', 'listbox', 'option']),
  entry(
    'number-field',
    NumberField,
    NumberFieldSlots,
    'stateless',
    ['spinbutton'],
    ['native-control'],
  ),
  entry('otp-field', OtpField, OtpFieldSlots, 'stateless', ['textbox'], ['native-control']),
  entry('resizable', Resizable, ResizableSlots, 'stateful', ['separator']),
  entry('sidebar', Sidebar, SidebarSlots, 'stateful', ['navigation', 'button']),
  entry('nav', Nav, NavSlots, 'stateful', ['navigation', 'link'], ['native-control']),
  entry(
    'app-shell',
    AppShell,
    AppShellSlots,
    'stateless',
    ['banner', 'main', 'contentinfo', 'link'],
    ['native-control'],
  ),
  entry('menubar', Menubar, MenubarSlots, 'stateful', ['menubar', 'menuitem', 'menu']),
  entry('progress', Progress, ProgressSlots, 'stateless', ['progressbar']),
  entry('meter', Meter, MeterSlots, 'stateless', ['meter']),
  entry('carousel', Carousel, CarouselSlots, 'stateful', ['group', 'button', 'status']),
  entry(
    'slider',
    Slider,
    SliderSlots,
    'stateless',
    ['group', 'slider'],
    ['native-control', 'form-submission'],
  ),
  entry('tree-view', TreeView, TreeViewSlots, 'stateful', ['tree', 'treeitem', 'group']),
  entry(
    'color-picker',
    ColorPicker,
    ColorPickerSlots,
    'stateful',
    ['group', 'slider', 'textbox', 'combobox', 'button', 'radiogroup', 'radio'],
    ['native-control'],
  ),
  entry(
    'input-copy',
    InputCopy,
    InputCopySlots,
    'stateless',
    ['textbox', 'button', 'status'],
    ['native-control'],
  ),
  entry('alert', Alert, AlertSlots, 'stateless', ['status', 'alert', 'region', 'button', 'link']),
  entry(
    'tags-input',
    TagsInput,
    TagsInputSlots,
    'stateful',
    ['textbox', 'list', 'listitem', 'button'],
    ['native-control'],
  ),
  entry(
    'password-input',
    PasswordInput,
    PasswordInputSlots,
    'stateless',
    ['textbox', 'button'],
    ['native-control', 'form-submission'],
  ),
  entry(
    'rating',
    Rating,
    RatingSlots,
    'stateless',
    ['radiogroup', 'radio'],
    ['native-control', 'form-submission'],
  ),
  entry('steps', Steps, StepsSlots, 'stateless', ['list', 'listitem', 'button']),
  entry('virtual-list', VirtualList, VirtualListSlots, 'stateful', ['list', 'listitem']),
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
  entry(
    'fileDrop',
    FileDrop,
    FileDropSlots,
    'stateful',
    ['group'],
    ['native-control', 'form-submission'],
  ),
  entry('toast', Toast, ToastSlots, 'stateful', ['region', 'status', 'alert']),
  entry(
    'combobox',
    Combobox,
    ComboboxSlots,
    'stateful',
    ['combobox', 'listbox', 'option', 'button'],
    ['native-control', 'form-submission', 'top-layer', 'backdrop'],
  ),
  entry(
    'datePicker',
    DatePicker,
    DatePickerSlots,
    'stateful',
    ['button', 'dialog', 'grid'],
    ['native-control', 'form-submission', 'top-layer'],
  ),
  entry(
    'segmented',
    Segmented,
    SegmentedSlots,
    'stateless',
    ['group', 'button'],
    ['native-control'],
  ),
  entry(
    'listbox',
    Listbox,
    ListboxSlots,
    'stateful',
    ['listbox', 'option', 'button'],
    ['top-layer', 'backdrop', 'native-control', 'form-submission'],
  ),
  entry(
    'menu',
    Menu,
    MenuSlots,
    'stateful',
    ['menu', 'menuitem', 'button'],
    ['top-layer', 'backdrop', 'native-control'],
  ),
  entry('chat-message', ChatMessage, ChatMessageSlots, 'stateless', ['group', 'button']),
  entry('message-scroller', MessageScroller, MessageScrollerSlots, 'stateful', ['log', 'button']),
  entry('thinking-indicator', ThinkingIndicator, ThinkingIndicatorSlots, 'stateless', ['status']),
  entry('thinking-steps', ThinkingSteps, ThinkingStepsSlots, 'stateless', [
    'button',
    'list',
    'listitem',
  ]),
  entry(
    'questionnaire',
    Questionnaire,
    QuestionnaireSlots,
    'stateful',
    ['form', 'radiogroup', 'radio', 'group', 'checkbox', 'textbox', 'button'],
    ['native-control', 'form-submission'],
  ),
  entry(
    'angle-slider',
    AngleSlider,
    AngleSliderSlots,
    'stateful',
    ['group', 'slider'],
    ['form-submission'],
  ),
  entry('timer', Timer, TimerSlots, 'stateful', ['group', 'timer', 'button']),
  entry('marquee', Marquee, MarqueeSlots, 'stateful', ['region', 'button']),
  entry('image-cropper', ImageCropper, ImageCropperSlots, 'stateful', [
    'group',
    'slider',
    'button',
  ]),
  entry(
    'signature-pad',
    SignaturePad,
    SignaturePadSlots,
    'stateful',
    ['group', 'img', 'button', 'textbox'],
    ['native-control'],
  ),
  entry('qr-code', QrCode, QrCodeSlots, 'stateless', ['img']),
  entry('chart', Chart, ChartSlots, 'stateful', ['figure', 'group', 'status', 'table']),
  entry(
    'cascade-select',
    CascadeSelect,
    CascadeSelectSlots,
    'stateful',
    ['combobox', 'tree', 'group', 'treeitem', 'button'],
    ['top-layer', 'backdrop', 'form-submission'],
  ),
  entry(
    'floating-panel',
    FloatingPanel,
    FloatingPanelSlots,
    'stateful',
    ['dialog', 'button'],
    ['escape-dismiss'],
  ),
  entry(
    'tour',
    Tour,
    TourSlots,
    'stateful',
    ['dialog', 'button'],
    ['top-layer', 'escape-dismiss', 'backdrop'],
  ),
])
