/**
 * An accessibility pattern per adapted widget with an ARIA contract: the
 * slots a widget of that kind must publish, with the capability, events and
 * attributes each must expose, as `A11y.pattern` contracts. A positioning
 * behavior without an ARIA contract of its own (`Anchor`) gets none: it
 * borrows its content's. `catalog` lists the patterns with their tier, the
 * ARIA roles involved, and the platform floor: what the widget relies on the
 * browser for, so a reader or an agent can ask. It also lists who supplies
 * each obligation a pattern declares (`support`), which `A11y.validate`
 * judges. The gate test validates every adapter's Slots and support against
 * its pattern; a custom view built from `foldkit-primitives/interaction`
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
import { BreadcrumbSlots } from './breadcrumb.js'
import { ButtonGroupSlots } from './buttonGroup.js'
import { CardSlots } from './card.js'
import { DrawerSlots } from './drawer.js'
import { HoverIntentSlots } from './hoverIntent.js'
import { PaginationSlots } from './pagination.js'
import { PickerSlots } from './picker.js'
import { ScrollAreaSlots } from './scrollArea.js'
import { SearchFieldSlots } from './searchField.js'
import { TableSlots } from './table.js'
import { WindowListSlots } from './windowList.js'

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
  checkbox: {
    capability: Capability.Interactive,
    events: [Event.Click],
    attributes: [Attr.Role, Attr.AriaChecked],
    obligations: ['checked', 'activation'],
  },
  label: { capability: Capability.Container },
  hiddenInput: { capability: Capability.Base, attributes: [Attr.Value], optional: true },
})

export const Switch = A11y.pattern({
  button: {
    capability: Capability.Interactive,
    events: [Event.Click],
    attributes: [Attr.Role, Attr.AriaChecked],
    obligations: ['checked', 'activation'],
  },
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
    obligations: ['activation'],
  },
  panel: { capability: Capability.Container },
})

export const Accordion = A11y.pattern({
  trigger: {
    capability: Capability.Interactive,
    events: [Event.Click],
    attributes: [Attr.AriaExpanded, Attr.AriaControls],
    obligations: ['activation'],
  },
  panel: { capability: Capability.Container, attributes: [Attr.Role] },
})

export const CheckboxGroup = A11y.pattern({
  root: { capability: Capability.Container },
  legend: { capability: Capability.Container },
  checkbox: {
    capability: Capability.Interactive,
    events: [Event.Click],
    attributes: [Attr.Role, Attr.AriaChecked],
    obligations: ['checked', 'activation'],
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
    obligations: ['navigation'],
  },
  list: { capability: Capability.Container, attributes: [Attr.Role] },
  item: {
    capability: Capability.Interactive,
    events: [Event.Click],
    attributes: [Attr.Role, Attr.AriaSelected],
    obligations: ['focus', 'activation'],
  },
})

export const Resizable = A11y.pattern({
  handle: {
    capability: Capability.Interactive,
    events: [Event.KeyDown],
    attributes: [Attr.Role, Attr.AriaLabel, Attr.AriaValuenow],
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
  bar: { capability: Capability.Container, events: [Event.KeyDown], obligations: ['navigation'] },
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
    obligations: ['navigation', 'checked'],
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
    obligations: ['navigation'],
  },
  item: {
    capability: Capability.Focusable,
    events: [Event.Focus],
    attributes: [Attr.Role, Attr.AriaExpanded, Attr.AriaSelected],
    obligations: ['focus'],
  },
  row: { capability: Capability.Interactive, events: [Event.Click], obligations: ['activation'] },
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
    obligations: ['navigation'],
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
    obligations: ['navigation', 'focus', 'activation'],
  },
  panel: { capability: Capability.Container, attributes: [Attr.Role] },
})

export const RadioGroup = A11y.pattern({
  group: { capability: Capability.Container, attributes: [Attr.Role] },
  option: {
    capability: Capability.Interactive,
    events: [Event.Click],
    attributes: [Attr.Role, Attr.AriaChecked],
    obligations: ['navigation', 'focus', 'checked', 'activation'],
  },
  label: { capability: Capability.Container },
})

export const Calendar = A11y.pattern({
  root: { capability: Capability.Container },
  grid: {
    capability: Capability.Container,
    attributes: [Attr.Role],
    obligations: ['navigation', 'focus'],
  },
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
    obligations: ['activation'],
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
    obligations: ['navigation'],
  },
  items: { capability: Capability.Container, attributes: [Attr.Role], optional: true },
  item: {
    capability: Capability.Interactive,
    events: [Event.Click],
    attributes: [Attr.Role, Attr.AriaSelected],
    obligations: ['focus', 'activation'],
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
  items: {
    capability: Capability.Container,
    attributes: [Attr.Role],
    obligations: ['navigation'],
    optional: true,
  },
  item: {
    capability: Capability.Interactive,
    events: [Event.Click],
    attributes: [Attr.Role, Attr.AriaSelected],
    obligations: ['focus', 'activation'],
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
  items: {
    capability: Capability.Container,
    attributes: [Attr.Role],
    obligations: ['navigation'],
    optional: true,
  },
  item: {
    capability: Capability.Interactive,
    events: [Event.Click],
    attributes: [Attr.Role],
    obligations: ['focus', 'activation'],
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
    obligations: ['navigation'],
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
    obligations: ['navigation'],
  },
  item: {
    capability: Capability.Interactive,
    events: [Event.Click],
    attributes: [Attr.Role, Attr.AriaSelected, Attr.AriaExpanded],
    obligations: ['focus', 'activation'],
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
  panel: {
    capability: Capability.Interactive,
    events: [Event.KeyDown],
    attributes: [Attr.Role],
    obligations: ['navigation'],
  },
  next: { capability: Capability.Interactive, events: [Event.Click], obligations: ['activation'] },
  skip: { capability: Capability.Interactive, events: [Event.Click] },
})

/** A named navigation landmark of presses: previous, next and a button per page. */
export const Pagination = A11y.pattern({
  root: { capability: Capability.Container, attributes: [Attr.Role, Attr.AriaLabel] },
  prev: { capability: Capability.Interactive, attributes: [Attr.AriaLabel] },
  next: { capability: Capability.Interactive, attributes: [Attr.AriaLabel] },
  page: { capability: Capability.Interactive, attributes: [Attr.AriaLabel, Attr.AriaCurrent] },
})

/** A named navigation landmark of links to the ancestors, and the page the trail ends on. */
export const Breadcrumb = A11y.pattern({
  root: { capability: Capability.Container, attributes: [Attr.Role, Attr.AriaLabel] },
  list: { capability: Capability.Container },
  link: { capability: Capability.Interactive },
  current: { capability: Capability.Container, attributes: [Attr.AriaCurrent] },
})

/** A native table; a sort and a row's details are presses only where the table draws them. */
export const Table = A11y.pattern({
  root: { capability: Capability.Container },
  headerCell: { capability: Capability.Container },
  row: { capability: Capability.Container },
  cell: { capability: Capability.Container },
  sortButton: { capability: Capability.Interactive, events: [Event.Click], optional: true },
  expandButton: {
    capability: Capability.Interactive,
    events: [Event.Click],
    attributes: [Attr.AriaExpanded, Attr.AriaLabel],
    optional: true,
  },
})

/** A region whose viewport scrolls; its bars are drawn over it. */
export const ScrollArea = A11y.pattern({
  root: { capability: Capability.Container },
  viewport: { capability: Capability.Container },
})

/** A panel and the handle that opens and shuts it. */
export const Drawer = A11y.pattern({
  panel: { capability: Capability.Container },
  handle: {
    capability: Capability.Interactive,
    events: [Event.Click],
    attributes: [Attr.AriaExpanded],
  },
})

/** A card that opens on hover or focus of its trigger, and stays while either holds it. */
export const HoverIntent = A11y.pattern({
  trigger: {
    capability: Capability.Interactive,
    events: [Event.Hover, Event.Focus, Event.Blur],
  },
  panel: { capability: Capability.Container, events: [Event.Hover, Event.Focus, Event.Blur] },
})

/** A listbox on a fine pointer; on a coarse one a button opening a sheet of options, each a press. */
export const Picker = A11y.pattern({
  opener: {
    capability: Capability.Interactive,
    events: [Event.Click],
    attributes: [Attr.AriaExpanded, Attr.AriaLabel],
  },
  list: { capability: Capability.Container, attributes: [Attr.Role] },
  option: {
    capability: Capability.Interactive,
    events: [Event.Click, Event.KeyDown],
    attributes: [Attr.Role, Attr.AriaSelected],
    obligations: ['navigation', 'focus', 'activation'],
  },
})

/** A named group of buttons. */
export const ButtonGroup = A11y.pattern({
  root: { capability: Capability.Container, attributes: [Attr.Role, Attr.AriaLabel] },
})

/** A list that draws only the rows in view. */
export const WindowList = A11y.pattern({
  root: { capability: Capability.Container },
  row: { capability: Capability.Container },
})

/** A card; the stretched link over it and its dismiss are presses where the card draws them. */
export const Card = A11y.pattern({
  root: { capability: Capability.Container },
  title: { capability: Capability.Container },
  overlay: { capability: Capability.Interactive, optional: true },
  dismiss: { capability: Capability.Interactive, optional: true },
})

/** A named text field and, once it holds text, a named press that clears it. */
export const SearchField = A11y.pattern({
  input: {
    capability: Capability.TextInput,
    events: [Event.Input, Event.KeyDown],
    attributes: [Attr.AriaLabel],
  },
  clear: {
    capability: Capability.Interactive,
    events: [Event.Click],
    attributes: [Attr.AriaLabel],
    optional: true,
  },
})

export interface Entry {
  readonly name: string
  readonly pattern: A11y.Pattern
  /** The adapter's own contract, which the gate validates against `pattern`. */
  readonly slots: { readonly [name: string]: unknown }
  readonly tier: Tier
  readonly roles: ReadonlyArray<string>
  readonly floor: ReadonlyArray<FloorConcern>
  /**
   * Who supplies each obligation `pattern` declares. A claim, found in the
   * widget or in the upstream bundle it wraps: the gate passes it to
   * `A11y.validate`, so an obligation with no provider is a diagnostic.
   */
  readonly support: ReadonlyArray<A11y.ObligationSupport>
}

const entry = (
  name: string,
  pattern: A11y.Pattern,
  slots: { readonly [name: string]: unknown },
  tier: Tier,
  roles: ReadonlyArray<string>,
  floor: ReadonlyArray<FloorConcern> = [],
  support: ReadonlyArray<A11y.ObligationSupport> = [],
): Entry => Object.freeze({ name, pattern, slots, tier, roles, floor, support })

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
  entry(
    'checkbox',
    Checkbox,
    CheckboxSlots,
    'stateless',
    ['checkbox'],
    ['form-submission'],
    [
      A11y.delegated({
        slot: 'checkbox',
        obligation: 'checked',
        provider: '@foldkit/ui/checkbox aria-checked (checkbox/index.js)',
      }),
      A11y.delegated({
        slot: 'checkbox',
        obligation: 'activation',
        provider: '@foldkit/ui/checkbox click and Space keyup (checkbox/index.js)',
      }),
    ],
  ),
  entry(
    'switch',
    Switch,
    SwitchSlots,
    'stateless',
    ['switch'],
    ['form-submission'],
    [
      A11y.delegated({
        slot: 'button',
        obligation: 'checked',
        provider: '@foldkit/ui/switch aria-checked (switch/index.js)',
      }),
      A11y.delegated({
        slot: 'button',
        obligation: 'activation',
        provider: '@foldkit/ui/switch button click and Space keyup (switch/index.js)',
      }),
    ],
  ),
  entry('fieldset', Fieldset, FieldsetSlots, 'stateless', ['group'], ['native-control']),
  entry(
    'disclosure',
    Disclosure,
    DisclosureSlots,
    'stateless',
    ['button'],
    [],
    [
      A11y.delegated({
        slot: 'button',
        obligation: 'activation',
        provider: '@foldkit/ui/disclosure button click and keydown (disclosure/index.js)',
      }),
    ],
  ),
  entry(
    'accordion',
    Accordion,
    AccordionSlots,
    'stateless',
    ['button', 'region'],
    [],
    [...A11y.native({ slot: 'trigger', obligations: ['activation'], provider: 'button' })],
  ),
  entry(
    'checkbox-group',
    CheckboxGroup,
    CheckboxGroupSlots,
    'stateless',
    ['group', 'checkbox'],
    [],
    [
      A11y.delegated({
        slot: 'checkbox',
        obligation: 'checked',
        provider: 'CheckboxGroup.view aria-checked on each role=checkbox button (checkboxGroup.ts)',
      }),
      A11y.delegated({
        slot: 'checkbox',
        obligation: 'activation',
        provider: 'CheckboxGroup.view button click (checkboxGroup.ts)',
      }),
    ],
  ),
  entry(
    'command',
    Command,
    CommandSlots,
    'stateless',
    ['combobox', 'listbox', 'option'],
    [],
    [
      A11y.delegated({
        slot: 'input',
        obligation: 'navigation',
        provider: 'Command.view input keydown: ArrowDown, ArrowUp, Enter (command.ts)',
      }),
      A11y.delegated({
        slot: 'item',
        obligation: 'focus',
        provider: 'Command.view aria-activedescendant on the input (command.ts)',
      }),
      A11y.delegated({
        slot: 'item',
        obligation: 'activation',
        provider: 'Command.view item click (command.ts)',
      }),
    ],
  ),
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
  entry(
    'menubar',
    Menubar,
    MenubarSlots,
    'stateful',
    ['menubar', 'menuitem', 'menu'],
    [],
    [
      A11y.delegated({
        slot: 'bar',
        obligation: 'navigation',
        provider: 'Menubar.view bar keydown: ArrowLeft, ArrowRight, Home, End (menubar.ts)',
      }),
    ],
  ),
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
    [...A11y.native({ slot: 'thumb', obligations: ['navigation'], provider: 'input[type=range]' })],
  ),
  entry(
    'tree-view',
    TreeView,
    TreeViewSlots,
    'stateful',
    ['tree', 'treeitem', 'group'],
    [],
    [
      A11y.delegated({
        slot: 'root',
        obligation: 'navigation',
        provider:
          'TreeView.update over foldkit-primitives TreeNavigation.move and Typeahead (treeView.ts)',
      }),
      A11y.delegated({
        slot: 'item',
        obligation: 'focus',
        provider: 'TreeView.view roving tabindex from TreeNavigation.tabStop (treeView.ts)',
      }),
      A11y.delegated({
        slot: 'row',
        obligation: 'activation',
        provider: 'TreeView.view row click (treeView.ts)',
      }),
    ],
  ),
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
    [
      ...A11y.native({
        slot: 'star',
        obligations: ['navigation', 'checked'],
        provider: 'input[type=radio]',
      }),
    ],
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
  entry(
    'tabs',
    Tabs,
    TabsSlots,
    'stateful',
    ['tablist', 'tab', 'tabpanel'],
    [],
    [
      A11y.delegated({
        slot: 'tab',
        obligation: 'navigation',
        provider: '@foldkit/ui/tabs tab keydown: arrows, Home, End (tabs/index.js)',
      }),
      A11y.delegated({
        slot: 'tab',
        obligation: 'focus',
        provider: '@foldkit/ui/tabs roving tabindex on each tab (tabs/index.js)',
      }),
      A11y.delegated({
        slot: 'tab',
        obligation: 'activation',
        provider: '@foldkit/ui/tabs tab click (tabs/index.js)',
      }),
    ],
  ),
  entry(
    'radioGroup',
    RadioGroup,
    RadioGroupSlots,
    'stateful',
    ['radiogroup', 'radio'],
    ['form-submission'],
    [
      A11y.delegated({
        slot: 'option',
        obligation: 'navigation',
        provider: '@foldkit/ui/radioGroup option keydown: arrows, Home, End (radioGroup/index.js)',
      }),
      A11y.delegated({
        slot: 'option',
        obligation: 'focus',
        provider: '@foldkit/ui/radioGroup roving tabindex on each option (radioGroup/index.js)',
      }),
      A11y.delegated({
        slot: 'option',
        obligation: 'checked',
        provider: '@foldkit/ui/radioGroup aria-checked (radioGroup/index.js)',
      }),
      A11y.delegated({
        slot: 'option',
        obligation: 'activation',
        provider: '@foldkit/ui/radioGroup option click (radioGroup/index.js)',
      }),
    ],
  ),
  entry(
    'calendar',
    Calendar,
    CalendarSlots,
    'stateful',
    ['grid', 'gridcell', 'button'],
    [],
    [
      A11y.delegated({
        slot: 'grid',
        obligation: 'navigation',
        provider:
          '@foldkit/ui/calendar grid keydown: arrows, Home, End, PageUp, PageDown (calendar/index.js)',
      }),
      A11y.delegated({
        slot: 'grid',
        obligation: 'focus',
        provider: '@foldkit/ui/calendar aria-activedescendant on the grid (calendar/index.js)',
      }),
    ],
  ),
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
    [
      A11y.delegated({
        slot: 'input',
        obligation: 'navigation',
        provider:
          '@foldkit/ui/combobox input keydown: ArrowDown, ArrowUp, Enter (combobox/shared.js)',
      }),
      A11y.delegated({
        slot: 'item',
        obligation: 'focus',
        provider: '@foldkit/ui/combobox aria-activedescendant on the input (combobox/shared.js)',
      }),
      A11y.delegated({
        slot: 'item',
        obligation: 'activation',
        provider: '@foldkit/ui/combobox item click (combobox/shared.js)',
      }),
    ],
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
    [
      A11y.delegated({
        slot: 'option',
        obligation: 'activation',
        provider: 'Segmented.view option click (segmented.ts)',
      }),
    ],
  ),
  entry(
    'listbox',
    Listbox,
    ListboxSlots,
    'stateful',
    ['listbox', 'option', 'button'],
    ['top-layer', 'backdrop', 'native-control', 'form-submission'],
    [
      A11y.delegated({
        slot: 'items',
        obligation: 'navigation',
        provider:
          '@foldkit/ui/listbox items keydown: arrows, Home, End, typeahead (listbox/shared.js)',
      }),
      A11y.delegated({
        slot: 'item',
        obligation: 'focus',
        provider: '@foldkit/ui/listbox aria-activedescendant on items (listbox/shared.js)',
      }),
      A11y.delegated({
        slot: 'item',
        obligation: 'activation',
        provider: '@foldkit/ui/listbox item click (listbox/shared.js)',
      }),
    ],
  ),
  entry(
    'menu',
    Menu,
    MenuSlots,
    'stateful',
    ['menu', 'menuitem', 'button'],
    ['top-layer', 'backdrop', 'native-control'],
    [
      A11y.delegated({
        slot: 'items',
        obligation: 'navigation',
        provider: '@foldkit/ui/menu items keydown: arrows, Home, End, typeahead (menu/index.js)',
      }),
      A11y.delegated({
        slot: 'item',
        obligation: 'focus',
        provider: '@foldkit/ui/menu aria-activedescendant on items (menu/index.js)',
      }),
      A11y.delegated({
        slot: 'item',
        obligation: 'activation',
        provider: '@foldkit/ui/menu item click (menu/index.js)',
      }),
    ],
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
    [
      A11y.delegated({
        slot: 'thumb',
        obligation: 'navigation',
        provider: 'AngleSlider.view thumb keydown: the arrow keys (angleSlider.ts)',
      }),
    ],
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
    [
      A11y.delegated({
        slot: 'panel',
        obligation: 'navigation',
        provider:
          'CascadeSelect.view panel keydown: arrows, Home, End, typeahead (cascadeSelect.ts)',
      }),
      A11y.delegated({
        slot: 'item',
        obligation: 'focus',
        provider: 'CascadeSelect.view aria-activedescendant on the panel (cascadeSelect.ts)',
      }),
      A11y.delegated({
        slot: 'item',
        obligation: 'activation',
        provider: 'CascadeSelect.view item click (cascadeSelect.ts)',
      }),
    ],
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
    [
      A11y.delegated({
        slot: 'panel',
        obligation: 'navigation',
        provider: 'Tour.view panel keydown: ArrowLeft, ArrowRight, Escape (tour.ts)',
      }),
      ...A11y.native({ slot: 'next', obligations: ['activation'], provider: 'button' }),
    ],
  ),
  entry('pagination', Pagination, PaginationSlots, 'stateless', ['navigation', 'button']),
  entry('breadcrumb', Breadcrumb, BreadcrumbSlots, 'stateless', ['navigation', 'link', 'list']),
  entry('table', Table, TableSlots, 'stateless', ['table', 'row', 'cell', 'columnheader']),
  entry('scroll-area', ScrollArea, ScrollAreaSlots, 'stateless', ['region']),
  entry('drawer', Drawer, DrawerSlots, 'stateful', ['button']),
  entry('hover-intent', HoverIntent, HoverIntentSlots, 'stateful', ['tooltip']),
  entry(
    'picker',
    Picker,
    PickerSlots,
    'stateful',
    ['listbox', 'option', 'button', 'dialog'],
    ['top-layer', 'backdrop'],
    [
      A11y.delegated({
        slot: 'option',
        obligation: 'navigation',
        provider: 'Picker.view sheet option keydown: ArrowDown, ArrowUp (picker.ts)',
      }),
      A11y.delegated({
        slot: 'option',
        obligation: 'focus',
        provider: 'Picker.view roving tabindex on the sheet options (picker.ts)',
      }),
      A11y.delegated({
        slot: 'option',
        obligation: 'activation',
        provider: 'Picker.view sheet option click (picker.ts)',
      }),
    ],
  ),
  entry('button-group', ButtonGroup, ButtonGroupSlots, 'stateless', ['group']),
  entry('window-list', WindowList, WindowListSlots, 'stateful', ['list', 'listitem']),
  entry('card', Card, CardSlots, 'stateless', ['list', 'link', 'button']),
  entry(
    'search-field',
    SearchField,
    SearchFieldSlots,
    'stateless',
    ['searchbox', 'button'],
    ['native-control'],
  ),
])
