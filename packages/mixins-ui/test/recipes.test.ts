/**
 * The shipped recipes: every selection compiles, every token they reference
 * is one the shipped scales and palette define, bases and variants land in
 * their layers, `extend` adjusts a recipe, and a real `@foldkit/ui` Button
 * resolves with a recipe's class.
 */
import { describe, expect, it } from 'vitest'
import { view as buttonView } from '@foldkit/ui/button'
import {
  Capability,
  Layers,
  Slot,
  Slots,
  Style,
  type SlotAttributes,
  type StyleValue,
  type StyleValues,
} from 'foldkit-mixins'
import { Theme } from 'foldkit-mixins/theme'
import {
  Button,
  ButtonSlots,
  PaginationSlots,
  ButtonGroupSlots,
  AvatarGroupSlots,
  AvatarSlots,
  TypographySlots,
  ScrollAreaSlots,
  CalendarSlots,
  CardGroupSlots,
  CardSlots,
  AlertSlots,
  AspectRatioSlots,
  IconSlots,
  SeparatorSlots,
  SkeletonSlots,
  ItemGroupSlots,
  ItemSlots,
  EmptySlots,
  SpinnerSlots,
  KbdSlots,
  BreadcrumbSlots,
  LabelSlots,
  TableSlots,
  CheckboxSlots,
  ComboboxSlots,
  DatePickerSlots,
  DialogSlots,
  FileDropSlots,
  InputSlots,
  ListboxSlots,
  MenuSlots,
  PopoverSlots,
  RadioGroupSlots,
  Recipes,
  SegmentedSlots,
  SelectSlots,
  SliderSlots,
  SwitchSlots,
  TabsSlots,
  TextareaSlots,
  ToastSlots,
  TooltipSlots,
  ChatMessageSlots,
  ChatMessageGroupSlots,
  MessageScrollerSlots,
  ThinkingIndicatorSlots,
  ThinkingStepsSlots,
  QuestionnaireSlots,
  AngleSliderSlots,
  ResizableSlots,
  ColorPickerSlots,
  CommandSlots,
  CheckboxGroupSlots,
  NumberFieldSlots,
  TagsInputSlots,
  TreeViewSlots,
  TimerSlots,
  MarqueeSlots,
  ImageCropperSlots,
  SignaturePadSlots,
  QrCodeSlots,
  ChartSlots,
  CascadeSelectSlots,
  FloatingPanelSlots,
  TourSlots,
} from '../src/index.js'
import * as Popup from '../src/recipes/popup.js'
import { attributeOf, h, message, type TestMessage } from './fixture.js'

const palette = Theme.standard(Theme.make({ accent: { hue: 280, chroma: 0.15, lightness: 60 } }))
const defined = new Set([
  ...Object.entries(palette).flatMap(([group, names]) =>
    Object.keys(names).map(name => `${group}-${name}`),
  ),
  // Set by a container drawn in its own color, not by a theme.
  'ink',
  // Set by `Defaults.reset` where the pointer is coarse; read with a fallback of 0.
  'touch-floor',
  // Written on the picker by its view, from the colour it holds.
  ...['', '-opaque', '-hue', '-area', '-hues', '-x', '-y'].map(part => `color${part}`),
  // Written on a dialog's panel by `Dialog.keyboard`; read with a fallback of 0.
  'keyboard-inset',
  // Written on the element by the card group's view and its FluidHover, not by a theme.
  'card-columns',
  // Written on a textarea by its view, from `rows` and `maxRows`.
  'textarea-rows',
  'textarea-max-rows',
  // Written by the views: an avatar's hue from its name, a table row skeleton's column count.
  'avatar-hue',
  'skeleton-columns',
  ...['x', 'y', 'w', 'h', 'shown', 'moving'].map(part => `card-hover-${part}`),
  ...['x', 'y', 'w', 'h', 'shown', 'moving'].map(part => `table-hover-${part}`),
  // Written on the tablist by `Tabs.fluid`'s Measure and FluidHover.
  ...['x', 'y', 'w', 'h', 'display'].map(part => `tabs-chosen-${part}`),
  ...['x', 'y', 'w', 'h', 'shown', 'moving'].map(part => `tabs-hover-${part}`),
  // Written on a segmented group by `Segmented.fluid`.
  ...['x', 'y', 'w', 'h', 'display'].map(part => `segmented-chosen-${part}`),
  ...['x', 'y', 'w', 'h', 'shown', 'moving'].map(part => `segmented-hover-${part}`),
  // Written on an open popup's panel by its `fluid`.
  ...['x', 'y', 'w', 'h', 'display', 'moving'].map(part => `popup-chosen-${part}`),
  ...['x', 'y', 'w', 'h', 'shown', 'moving'].map(part => `popup-hover-${part}`),
  // Written on a toast stack's list and toasts by its view and `Toast.Stack`.
  ...['front', 'total', 'count', 'offset', 'index', 'swipe-x', 'swipe-y'].map(
    part => `toast-${part}`,
  ),
  // Written on each overlay scroll bar by `ScrollBars`.
  'scroll-thumb-offset',
  'scroll-thumb-size',
  // Published by a padded container with `Theme.nests`, read by `Theme.nested()` and `Theme.concentric`.
  'outer-radius',
  'inset',
  'control-corner',
  // Written on a sheet's panel by `Sheet.view`: the point it rests at and the drag.
  'sheet-snap',
  'sheet-offset',
  // Written on a slider's control, marks and shown values by `Slider.view`, and its
  // track's length, least length and paint by a holder such as the color picker.
  ...['low', 'high', 'at', 'length', 'min-length', 'paint', 'thumb-paint'].map(
    part => `slider-${part}`,
  ),
  // Prose's own knobs, each read with a fallback and set by `Prose.style(options)`.
  ...['measure', 'leading', 'align', 'paragraph', 'heading', 'list', 'figure'].map(
    part => `prose-${part}`,
  ),
  // The reading tokens `Prose` falls back to when its own options are unset.
  ...['measure', 'heading-wrap', 'body-wrap', 'align'].map(part => `reading-${part}`),
  // Written by the views: the dial's angle and each marker's, the timer's share counted,
  // the marquee's measured timing, the cropper's geometry.
  'angle',
  'angle-marker',
  'timer-progress',
  ...['duration', 'delay', 'loop-count'].map(part => `marquee-${part}`),
  ...['x', 'y', 'w', 'h', 'rotation'].map(part => `cropper-${part}`),
  ...['x', 'y', 'w', 'h'].map(part => `cropper-image-${part}`),
  ...['w', 'h'].map(part => `cropper-natural-${part}`),
  // The signature pad's typed-name face: the recipe sets its default, an application its own.
  'signature-font',
  // Written on a tour step's progress by `Tour.view`.
  'tour-progress',
  // Written on the tour's layer: its padding by `Tour.view`, its target's corner by `TrackBox`.
  'tour-padding',
  'tour-radius',
])

/** Every selection of a recipe: the defaults, then each value of each axis. */
const selections = (variants: Readonly<Record<string, Readonly<Record<string, unknown>>>>) => [
  {},
  ...Object.entries(variants).flatMap(([axis, values]) =>
    Object.keys(values).map(value => ({ [axis]: value })),
  ),
]

/** Top-level blocks of a stylesheet, split by brace depth. */
const blocks = (css: string): ReadonlyArray<string> => {
  const found: Array<string> = []
  let depth = 0
  let start = 0
  for (let index = 0; index < css.length; index++) {
    if (css[index] === '{') depth++
    if (css[index] === '}' && --depth === 0) {
      found.push(css.slice(start, index + 1))
      start = index + 1
    }
  }
  return found
}

/** Every slot piece of every selection of every recipe. */
const allPieces = [
  ...selections(Recipes.Button.def.variants).map(selection => Recipes.Button(selection)),
  ...selections(Recipes.Pagination.def.variants).map(selection => Recipes.Pagination(selection)),
  ...selections(Recipes.ButtonGroup.def.variants).map(selection => Recipes.ButtonGroup(selection)),
  ...selections(Recipes.ScrollArea.def.variants).map(selection => Recipes.ScrollArea(selection)),
  ...selections(Recipes.Typography.def.variants).map(selection => Recipes.Typography(selection)),
  ...selections(Recipes.Avatar.def.variants).map(selection => Recipes.Avatar(selection)),
  ...selections(Recipes.Table.def.variants).map(selection => Recipes.Table(selection)),
  ...selections(Recipes.Label.def.variants).map(selection => Recipes.Label(selection)),
  ...selections(Recipes.Breadcrumb.def.variants).map(selection => Recipes.Breadcrumb(selection)),
  ...selections(Recipes.Kbd.def.variants).map(selection => Recipes.Kbd(selection)),
  ...selections(Recipes.Spinner.def.variants).map(selection => Recipes.Spinner(selection)),
  ...selections(Recipes.Empty.def.variants).map(selection => Recipes.Empty(selection)),
  ...selections(Recipes.Item.def.variants).map(selection => Recipes.Item(selection)),
  ...selections(Recipes.Skeleton.def.variants).map(selection => Recipes.Skeleton(selection)),
  ...selections(Recipes.Separator.def.variants).map(selection => Recipes.Separator(selection)),
  ...selections(Recipes.AspectRatio.def.variants).map(selection => Recipes.AspectRatio(selection)),
  ...selections(Recipes.Icon.def.variants).map(selection => Recipes.Icon(selection)),
  ...selections(Recipes.Alert.def.variants).map(selection => Recipes.Alert(selection)),
  ...selections(Recipes.Calendar.def.variants).map(selection => Recipes.Calendar(selection)),
  ...selections(Recipes.Card.def.variants).map(selection => Recipes.Card(selection)),
  ...selections(Recipes.Input.def.variants).map(selection => Recipes.Input(selection)),
  ...selections(Recipes.Textarea.def.variants).map(selection => Recipes.Textarea(selection)),
  ...selections(Recipes.Checkbox.def.variants).map(selection => Recipes.Checkbox(selection)),
  ...selections(Recipes.Switch.def.variants).map(selection => Recipes.Switch(selection)),
  ...selections(Recipes.Dialog.def.variants).map(selection => Recipes.Dialog(selection)),
  ...selections(Recipes.Tabs.def.variants).map(selection => Recipes.Tabs(selection)),
  ...selections(Recipes.Segmented.def.variants).map(selection => Recipes.Segmented(selection)),
  ...selections(Recipes.Menu.def.variants).map(selection => Recipes.Menu(selection)),
  ...selections(Recipes.Listbox.def.variants).map(selection => Recipes.Listbox(selection)),
  ...selections(Recipes.Combobox.def.variants).map(selection => Recipes.Combobox(selection)),
  ...selections(Recipes.Select.def.variants).map(selection => Recipes.Select(selection)),
  ...selections(Recipes.RadioGroup.def.variants).map(selection => Recipes.RadioGroup(selection)),
  ...selections(Recipes.Slider.def.variants).map(selection => Recipes.Slider(selection)),
  ...selections(Recipes.Toast.def.variants).map(selection => Recipes.Toast(selection)),
  ...selections(Recipes.FileDrop.def.variants).map(selection => Recipes.FileDrop(selection)),
  ...selections(Recipes.DatePicker.def.variants).map(selection => Recipes.DatePicker(selection)),
  ...selections(Recipes.Popover.def.variants).map(selection => Recipes.Popover(selection)),
  ...selections(Recipes.Tooltip.def.variants).map(selection => Recipes.Tooltip(selection)),
  ...selections(Recipes.ChatMessage.def.variants).map(selection => Recipes.ChatMessage(selection)),
  ...selections(Recipes.ChatMessageGroup.def.variants).map(selection =>
    Recipes.ChatMessageGroup(selection),
  ),
  ...selections(Recipes.MessageScroller.def.variants).map(selection =>
    Recipes.MessageScroller(selection),
  ),
  ...selections(Recipes.ThinkingIndicator.def.variants).map(selection =>
    Recipes.ThinkingIndicator(selection),
  ),
  ...selections(Recipes.ThinkingSteps.def.variants).map(selection =>
    Recipes.ThinkingSteps(selection),
  ),
  ...selections(Recipes.Questionnaire.def.variants).map(selection =>
    Recipes.Questionnaire(selection),
  ),
  ...selections(Recipes.AngleSlider.def.variants).map(selection => Recipes.AngleSlider(selection)),
  ...selections(Recipes.Timer.def.variants).map(selection => Recipes.Timer(selection)),
  ...selections(Recipes.Marquee.def.variants).map(selection => Recipes.Marquee(selection)),
  ...selections(Recipes.ImageCropper.def.variants).map(selection =>
    Recipes.ImageCropper(selection),
  ),
  ...selections(Recipes.SignaturePad.def.variants).map(selection =>
    Recipes.SignaturePad(selection),
  ),
  ...selections(Recipes.QrCode.def.variants).map(selection => Recipes.QrCode(selection)),
  ...selections(Recipes.Chart.def.variants).map(selection => Recipes.Chart(selection)),
  ...selections(Recipes.CascadeSelect.def.variants).map(selection =>
    Recipes.CascadeSelect(selection),
  ),
  ...selections(Recipes.FloatingPanel.def.variants).map(selection =>
    Recipes.FloatingPanel(selection),
  ),
  ...selections(Recipes.Tour.def.variants).map(selection => Recipes.Tour(selection)),
].flatMap(pieces => Object.values(pieces))

const compiled = {
  Button: selections(Recipes.Button.def.variants).map(
    selection => Style.forSlots(ButtonSlots)(Recipes.Button(selection)).css,
  ),
  Pagination: selections(Recipes.Pagination.def.variants).map(
    selection => Style.forSlots(PaginationSlots)(Recipes.Pagination(selection)).css,
  ),
  ButtonGroup: selections(Recipes.ButtonGroup.def.variants).map(
    selection => Style.forSlots(ButtonGroupSlots)(Recipes.ButtonGroup(selection)).css,
  ),
  ScrollArea: selections(Recipes.ScrollArea.def.variants).map(
    selection => Style.forSlots(ScrollAreaSlots)(Recipes.ScrollArea(selection)).css,
  ),
  Typography: selections(Recipes.Typography.def.variants).map(
    selection => Style.forSlots(TypographySlots)(Recipes.Typography(selection)).css,
  ),
  Avatar: selections(Recipes.Avatar.def.variants).map(
    selection => Style.forSlots(AvatarSlots)(Recipes.Avatar(selection)).css,
  ),
  AvatarGroup: selections(Recipes.AvatarGroup.def.variants).map(
    selection => Style.forSlots(AvatarGroupSlots)(Recipes.AvatarGroup(selection)).css,
  ),
  Table: selections(Recipes.Table.def.variants).map(
    selection => Style.forSlots(TableSlots)(Recipes.Table(selection)).css,
  ),
  Label: selections(Recipes.Label.def.variants).map(
    selection => Style.forSlots(LabelSlots)(Recipes.Label(selection)).css,
  ),
  Breadcrumb: selections(Recipes.Breadcrumb.def.variants).map(
    selection => Style.forSlots(BreadcrumbSlots)(Recipes.Breadcrumb(selection)).css,
  ),
  Kbd: selections(Recipes.Kbd.def.variants).map(
    selection => Style.forSlots(KbdSlots)(Recipes.Kbd(selection)).css,
  ),
  Spinner: selections(Recipes.Spinner.def.variants).map(
    selection => Style.forSlots(SpinnerSlots)(Recipes.Spinner(selection)).css,
  ),
  Empty: selections(Recipes.Empty.def.variants).map(
    selection => Style.forSlots(EmptySlots)(Recipes.Empty(selection)).css,
  ),
  Item: selections(Recipes.Item.def.variants).map(
    selection => Style.forSlots(ItemSlots)(Recipes.Item(selection)).css,
  ),
  ItemGroup: selections(Recipes.ItemGroup.def.variants).map(
    selection => Style.forSlots(ItemGroupSlots)(Recipes.ItemGroup(selection)).css,
  ),
  Skeleton: selections(Recipes.Skeleton.def.variants).map(
    selection => Style.forSlots(SkeletonSlots)(Recipes.Skeleton(selection)).css,
  ),
  Separator: selections(Recipes.Separator.def.variants).map(
    selection => Style.forSlots(SeparatorSlots)(Recipes.Separator(selection)).css,
  ),
  AspectRatio: selections(Recipes.AspectRatio.def.variants).map(
    selection => Style.forSlots(AspectRatioSlots)(Recipes.AspectRatio(selection)).css,
  ),
  Icon: selections(Recipes.Icon.def.variants).map(
    selection => Style.forSlots(IconSlots)(Recipes.Icon(selection)).css,
  ),
  Alert: selections(Recipes.Alert.def.variants).map(
    selection => Style.forSlots(AlertSlots)(Recipes.Alert(selection)).css,
  ),
  Card: selections(Recipes.Card.def.variants).map(
    selection => Style.forSlots(CardSlots)(Recipes.Card(selection)).css,
  ),
  CardGroup: selections(Recipes.CardGroup.def.variants).map(
    selection => Style.forSlots(CardGroupSlots)(Recipes.CardGroup(selection)).css,
  ),
  Input: selections(Recipes.Input.def.variants).map(
    selection => Style.forSlots(InputSlots)(Recipes.Input(selection)).css,
  ),
  Textarea: selections(Recipes.Textarea.def.variants).map(
    selection => Style.forSlots(TextareaSlots)(Recipes.Textarea(selection)).css,
  ),
  Checkbox: selections(Recipes.Checkbox.def.variants).map(
    selection => Style.forSlots(CheckboxSlots)(Recipes.Checkbox(selection)).css,
  ),
  Switch: selections(Recipes.Switch.def.variants).map(
    selection => Style.forSlots(SwitchSlots)(Recipes.Switch(selection)).css,
  ),
  Dialog: selections(Recipes.Dialog.def.variants).map(
    selection => Style.forSlots(DialogSlots)(Recipes.Dialog(selection)).css,
  ),
  Sheet: selections(Recipes.Sheet.def.variants).map(
    selection => Style.forSlots(DialogSlots)(Recipes.Sheet(selection)).css,
  ),
  Tabs: selections(Recipes.Tabs.def.variants).map(
    selection => Style.forSlots(TabsSlots)(Recipes.Tabs(selection)).css,
  ),
  Segmented: selections(Recipes.Segmented.def.variants).map(
    selection => Style.forSlots(SegmentedSlots)(Recipes.Segmented(selection)).css,
  ),
  Menu: selections(Recipes.Menu.def.variants).map(
    selection => Style.forSlots(MenuSlots)(Recipes.Menu(selection)).css,
  ),
  Listbox: selections(Recipes.Listbox.def.variants).map(
    selection => Style.forSlots(ListboxSlots)(Recipes.Listbox(selection)).css,
  ),
  Combobox: selections(Recipes.Combobox.def.variants).map(
    selection => Style.forSlots(ComboboxSlots)(Recipes.Combobox(selection)).css,
  ),
  Select: selections(Recipes.Select.def.variants).map(
    selection => Style.forSlots(SelectSlots)(Recipes.Select(selection)).css,
  ),
  RadioGroup: selections(Recipes.RadioGroup.def.variants).map(
    selection => Style.forSlots(RadioGroupSlots)(Recipes.RadioGroup(selection)).css,
  ),
  Slider: selections(Recipes.Slider.def.variants).map(
    selection => Style.forSlots(SliderSlots)(Recipes.Slider(selection)).css,
  ),
  Toast: selections(Recipes.Toast.def.variants).map(
    selection => Style.forSlots(ToastSlots)(Recipes.Toast(selection)).css,
  ),
  FileDrop: selections(Recipes.FileDrop.def.variants).map(
    selection => Style.forSlots(FileDropSlots)(Recipes.FileDrop(selection)).css,
  ),
  Calendar: selections(Recipes.Calendar.def.variants).map(
    selection => Style.forSlots(CalendarSlots)(Recipes.Calendar(selection)).css,
  ),
  DatePicker: selections(Recipes.DatePicker.def.variants).map(
    selection => Style.forSlots(DatePickerSlots)(Recipes.DatePicker(selection)).css,
  ),
  Popover: selections(Recipes.Popover.def.variants).map(
    selection => Style.forSlots(PopoverSlots)(Recipes.Popover(selection)).css,
  ),
  Tooltip: selections(Recipes.Tooltip.def.variants).map(
    selection => Style.forSlots(TooltipSlots)(Recipes.Tooltip(selection)).css,
  ),
  ChatMessage: selections(Recipes.ChatMessage.def.variants).map(
    selection => Style.forSlots(ChatMessageSlots)(Recipes.ChatMessage(selection)).css,
  ),
  ChatMessageGroup: selections(Recipes.ChatMessageGroup.def.variants).map(
    selection => Style.forSlots(ChatMessageGroupSlots)(Recipes.ChatMessageGroup(selection)).css,
  ),
  MessageScroller: selections(Recipes.MessageScroller.def.variants).map(
    selection => Style.forSlots(MessageScrollerSlots)(Recipes.MessageScroller(selection)).css,
  ),
  ThinkingIndicator: selections(Recipes.ThinkingIndicator.def.variants).map(
    selection => Style.forSlots(ThinkingIndicatorSlots)(Recipes.ThinkingIndicator(selection)).css,
  ),
  ThinkingSteps: selections(Recipes.ThinkingSteps.def.variants).map(
    selection => Style.forSlots(ThinkingStepsSlots)(Recipes.ThinkingSteps(selection)).css,
  ),
  Questionnaire: selections(Recipes.Questionnaire.def.variants).map(
    selection => Style.forSlots(QuestionnaireSlots)(Recipes.Questionnaire(selection)).css,
  ),
  AngleSlider: selections(Recipes.AngleSlider.def.variants).map(
    selection => Style.forSlots(AngleSliderSlots)(Recipes.AngleSlider(selection)).css,
  ),
  ColorPicker: selections(Recipes.ColorPicker.def.variants).map(
    selection => Style.forSlots(ColorPickerSlots)(Recipes.ColorPicker(selection)).css,
  ),
  Resizable: selections(Recipes.Resizable.def.variants).map(
    selection => Style.forSlots(ResizableSlots)(Recipes.Resizable(selection)).css,
  ),
  Timer: selections(Recipes.Timer.def.variants).map(
    selection => Style.forSlots(TimerSlots)(Recipes.Timer(selection)).css,
  ),
  Marquee: selections(Recipes.Marquee.def.variants).map(
    selection => Style.forSlots(MarqueeSlots)(Recipes.Marquee(selection)).css,
  ),
  ImageCropper: selections(Recipes.ImageCropper.def.variants).map(
    selection => Style.forSlots(ImageCropperSlots)(Recipes.ImageCropper(selection)).css,
  ),
  SignaturePad: selections(Recipes.SignaturePad.def.variants).map(
    selection => Style.forSlots(SignaturePadSlots)(Recipes.SignaturePad(selection)).css,
  ),
  QrCode: selections(Recipes.QrCode.def.variants).map(
    selection => Style.forSlots(QrCodeSlots)(Recipes.QrCode(selection)).css,
  ),
  Chart: selections(Recipes.Chart.def.variants).map(
    selection => Style.forSlots(ChartSlots)(Recipes.Chart(selection)).css,
  ),
  CascadeSelect: selections(Recipes.CascadeSelect.def.variants).map(
    selection => Style.forSlots(CascadeSelectSlots)(Recipes.CascadeSelect(selection)).css,
  ),
  FloatingPanel: selections(Recipes.FloatingPanel.def.variants).map(
    selection => Style.forSlots(FloatingPanelSlots)(Recipes.FloatingPanel(selection)).css,
  ),
  Tour: selections(Recipes.Tour.def.variants).map(
    selection => Style.forSlots(TourSlots)(Recipes.Tour(selection)).css,
  ),
}

describe('Recipes', () => {
  it.each(Object.entries(compiled))('%s compiles every selection to CSS', (_, sheets) => {
    for (const css of sheets) expect(css.length).toBeGreaterThan(0)
  })

  // Scrolled to its end, a swipe on a panel moved the page behind it.
  // Each slot alone, so another slot's rule cannot stand in for the one named.
  const panelOf = (piece: StyleValue | undefined) =>
    piece === undefined ? '' : Style.forSlots(DialogSlots)({ panel: piece }).css
  const list = Recipes.Command({}).list
  it.each([
    ['a Dialog panel', panelOf(Recipes.Dialog({}).panel)],
    ['a Sheet panel', panelOf(Recipes.Sheet({}).panel)],
    ['a Command list', list === undefined ? '' : Style.forSlots(CommandSlots)({ list }).css],
    ['a popup list', panelOf(Popup.scroll)],
  ])('%s keeps a swipe to itself', (_, css) => {
    expect(css).toMatch(/\{[^{}]*overflow-y:auto[^{}]*overscroll-behavior:contain/)
  })

  it('caps a popup panel at the screen, less a margin', () => {
    expect(Style.forSlots(MenuSlots)(Recipes.Menu({})).css).toContain(
      'max-inline-size:calc(100vw - 2 * var(--fk-space-xs))',
    )
  })

  // Table's highlight painted with the text alone while every hover beside it followed
  // `surface.hover`. A hover or a press reads the state ink (`unfilledHover`), a tone's own fill,
  // or the popups' highlight; anything else is named here, with why, so a new one is a decision.
  // `*` names a value every recipe may read.
  const hoverExceptions: ReadonlyArray<readonly [recipe: string, value: string, why: string]> = [
    ['Card', 'surface-default', 'a pressable card steps its own surface'],
    ['Card', 'surface-muted', 'a pressable card steps its own surface'],
    ['Card', 'knob-state-tint', 'its film lightens a dark page as it darkens a light one'],
    ['CardGroup', 'knob-state-tint', 'its highlight is a card’s film, as a card’s own hover'],
    ['Tabs', 'accent-subtle', 'the chosen pill dims while another tab is hovered'],
    ['Calendar', 'accent-default', 'a chosen day keeps its fill under the pointer'],
    ['Resizable', 'accent-default', 'the handle shows its accent line under the pointer'],
    ['Menu', 'error-default', 'a danger row hovers in its own tone'],
    ['Button', 'text-overt', 'an ink button deepens its own fill'],
    ['*', 'currentColor calc(var(--fk-knob-state-hover) *', 'a scrollbar thumb takes the text'],
  ]
  const stateRead =
    /--_fk-state-ink|--_fk-tone-|--fk-(?!state-)[a-z]+-(hover|active|press)\b|--fk-popup-(highlight|press)|^\s*(transparent|none|inherit)\s*$/
  it.each(Object.entries(compiled))('%s draws its hovers from the state tokens', (name, sheets) => {
    const strays = new Set<string>()
    for (const css of sheets)
      for (const [, selector, body] of css.matchAll(/([^{}]+)\{([^{}]*)\}/g))
        // A fluid highlight sets its fill on itself, shown by its `--fk-<name>-hover-shown`.
        if (/:hover|:active/.test(selector!) || /-hover-shown\)/.test(body!))
          for (const [, value] of body!.matchAll(/background(?:-color)?:([^;]+)/g))
            if (
              !stateRead.test(value!) &&
              !hoverExceptions.some(
                ([recipe, read]) => (recipe === '*' || recipe === name) && value!.includes(read),
              )
            )
              strays.add(value!)
    expect([...strays]).toEqual([])
  })

  // A disabled control faded to `0.4` in two recipes and `0.5` in the rest: one page showed two
  // fades. Every rule for a disabled control that sets an opacity reads the knob, so a theme sets
  // them all. A `:not(:disabled)` is the hover guard, not the state, so negations come off first.
  const withoutNegations = (selector: string): string => {
    const once = selector.replace(/:not\([^()]*\)/g, '')
    return once === selector ? once : withoutNegations(once)
  }
  const fades = (selector: string) =>
    /:disabled|\[aria-disabled="true"\]|\[data-disabled/.test(withoutNegations(selector))
  it.each(Object.entries(compiled))(
    '%s fades a disabled control by the theme’s opacity',
    (_, sheets) => {
      const strays = new Set<string>()
      for (const css of sheets)
        for (const [, selector, body] of css.matchAll(/([^{}]+)\{([^{}]*)\}/g))
          if (fades(selector!))
            for (const [, value] of body!.matchAll(/opacity:([^;]+)/g))
              if (!value!.includes('var(--fk-knob-state-disabled)'))
                strays.add(`${selector!.trim()} { opacity: ${value} }`)
      expect([...strays]).toEqual([])
    },
  )

  // The recipes whose disabled fade this change converted, each still reading the knob: a literal
  // back in one of them shows two fades on one page, which is what the knob ended.
  const faded = {
    AngleSlider: Style.forSlots(AngleSliderSlots)(Recipes.AngleSlider({})).css,
    Calendar: Style.forSlots(CalendarSlots)(Recipes.Calendar({})).css,
    Card: Style.forSlots(CardSlots)(Recipes.Card({})).css,
    CheckboxGroup: Style.forSlots(CheckboxGroupSlots)(Recipes.CheckboxGroup({})).css,
    ColorPicker: Style.forSlots(ColorPickerSlots)(Recipes.ColorPicker({})).css,
    Command: Style.forSlots(CommandSlots)(Recipes.Command({})).css,
    ImageCropper: Style.forSlots(ImageCropperSlots)(Recipes.ImageCropper({})).css,
    Item: Style.forSlots(ItemSlots)(Recipes.Item({})).css,
    NumberField: Style.forSlots(NumberFieldSlots)(Recipes.NumberField({})).css,
    SignaturePad: Style.forSlots(SignaturePadSlots)(Recipes.SignaturePad({})).css,
    Slider: Style.forSlots(SliderSlots)(Recipes.Slider({})).css,
    TagsInput: Style.forSlots(TagsInputSlots)(Recipes.TagsInput({})).css,
    TreeView: Style.forSlots(TreeViewSlots)(Recipes.TreeView({})).css,
  }
  it.each(Object.entries(faded))('%s still fades a disabled control by the knob', (_, css) => {
    expect(css).toContain('opacity:var(--fk-knob-state-disabled)')
  })

  // A press held on a drag surface opened iOS's callout menu over the drag.
  it.each(Object.entries(compiled))('%s holds no callout where it takes the press', (_, sheets) => {
    for (const css of sheets) {
      for (const [, body] of css.matchAll(/\{([^{}]*touch-action:none[^{}]*)\}/g)) {
        expect(body).toContain('-webkit-touch-callout:none')
      }
    }
  })

  it.each(Object.entries(compiled))('%s references only defined tokens', (_, sheets) => {
    const references = sheets.flatMap(css =>
      [...css.matchAll(/var\(--fk-([a-z0-9-]+)/g)].map(match => match[1] ?? ''),
    )
    expect(references.length).toBeGreaterThan(0)
    expect(references.filter(reference => !defined.has(reference))).toEqual([])
  })

  it('draws an unfilled button’s text in a band’s --fk-ink before its tone’s', () => {
    for (const variant of ['outline', 'ghost'] as const) {
      const css = Style.forSlots(ButtonSlots)(Recipes.Button({ variant })).css
      expect(css).toContain('color:var(--fk-ink, var(--_fk-tone-ink))')
    }
    const solid = Style.forSlots(ButtonSlots)(Recipes.Button({ variant: 'solid' })).css
    expect(solid).not.toContain('--fk-ink')
  })

  it.each(Object.entries(compiled))('%s emits every rule inside a layer', (_, sheets) => {
    for (const css of sheets) {
      for (const block of blocks(css)) {
        expect(block).toMatch(/^@layer (components|variants)\{/)
      }
    }
  })

  it('writes no inline declarations, so a later layer can override any of them', () => {
    expect(allPieces.length).toBeGreaterThan(0)
    for (const piece of allPieces) {
      expect(piece.style).toEqual({})
      expect(piece.conditions ?? []).toEqual([])
      expect(piece.items ?? []).toEqual([])
    }
  })

  it('yields to an application rule in the app layer', () => {
    const L = Layers.standard
    const Danger = Style.forSlots(ButtonSlots)(Recipes.Button({ tone: 'danger' }))
    const Override = Style.forSlots(ButtonSlots)(
      { button: Style.self({ background: 'red' }) },
      { layer: L.layer('app') },
    )
    const sheet = Style.stylesheet(L.declare, Danger, Override)

    // The order is declared once, first, with app after components and variants.
    const order = sheet.slice(0, sheet.indexOf(';'))
    expect(order).toBe(`@layer ${L.names.join(', ')}`)
    expect(L.names.indexOf('app')).toBeGreaterThan(L.names.indexOf('variants'))

    // The recipe's background is a layered rule; the override's is in app.
    const layered = blocks(sheet.slice(order.length + 1))
    expect(
      layered.some(block => /^@layer variants\{.*background:var\(--_fk-tone-fill\)/.test(block)),
    ).toBe(true)
    expect(layered.some(block => /^@layer app\{.*background:red/.test(block))).toBe(true)

    // Both classes land on the element (or the icon's, for the recipe's icon
    // rule) and nothing is inline, so the cascade decides.
    let resolved: SlotAttributes<TestMessage> = []
    let icon: SlotAttributes<TestMessage> = []
    buttonView<TestMessage>(
      {
        onClick: message('Clicked'),
        toView: attributes => {
          const slots = Button.resolve(attributes, [Danger.mixin, Override.mixin], {
            input: undefined,
            h,
          })
          resolved = slots.button
          icon = slots.icon
          return h.button(resolved, [])
        },
      },
      h,
    )
    const classes = [resolved, icon].flatMap(
      attributes => attributeOf(attributes, 'Class')?.value.split(' ') ?? [],
    )
    for (const rule of [...Danger.rules, ...Override.rules]) {
      expect(classes).toContain(rule.className)
    }
    expect(attributeOf(resolved, 'Style')).toBeUndefined()
  })

  it('puts the base in components and a selected variant in variants', () => {
    const css = Style.forSlots(ButtonSlots)(Recipes.Button({ variant: 'outline' })).css
    const layered = blocks(css)
    expect(layered.some(block => /^@layer components\{.*cursor:pointer/.test(block))).toBe(true)
    expect(layered.some(block => /^@layer variants\{.*background:transparent/.test(block))).toBe(
      true,
    )
  })

  it('applies a compound only to its combination', () => {
    const outline = 'outline-color:var(--fk-error-outline)'
    const css = (tone: 'accent' | 'danger') =>
      Style.forSlots(ButtonSlots)(Recipes.Button({ tone, variant: 'solid' })).css
    expect(css('danger')).toContain(outline)
    expect(css('accent')).not.toContain(outline)
  })

  it('draws primary in ink whatever the tone', () => {
    const css = Style.forSlots(ButtonSlots)(Recipes.Button({ variant: 'primary', size: 'sm' })).css
    expect(css).toContain('background:var(--fk-text-overt)')
    expect(css).toContain('color:var(--fk-surface-base)')
    expect(css).toContain('color-mix(in oklch, var(--fk-text-overt) 85%, var(--fk-surface-base))')
  })

  it.each(['outline', 'ghost', 'icon'] as const)(
    'grounds a %s button’s hover and press on the state ink, its text or its surface’s paint',
    variant => {
      const css = Style.forSlots(ButtonSlots)(
        Recipes.Button({ tone: 'neutral', variant, size: null }),
      ).css
      const film = (state: 'hover' | 'active', strength: string) =>
        new RegExp(
          `:${state}:not\\(\\[aria-disabled="true"\\], :disabled\\)\\{[^}]*background:color-mix\\(in oklab, var\\(--_fk-state-ink, var\\(--fk-state-ink\\)\\) ${strength}, transparent\\)`,
        )
      expect(css).toMatch(film('hover', 'var\\(--fk-knob-state-hover\\)'))
      // A press is the same ink held at 1.75, so it reads darker than the hover.
      expect(css).toMatch(film('active', 'calc\\(var\\(--fk-knob-state-hover\\) \\* 1\\.75\\)'))
    },
  )

  it('draws an icon button square with only its glyph showing', () => {
    const css = Style.forSlots(ButtonSlots)(
      Recipes.Button({ tone: 'neutral', variant: 'icon', size: null }),
    ).css
    // A square one rung of the size ladder tall, beside the buttons it sits with, and as
    // large as a finger needs on a touch screen.
    const side = `max(${Theme.ladder('height')}, var(--fk-touch-floor, 0px))`
    expect(css).toContain(`inline-size:${side}`)
    expect(css).toContain(`block-size:${side}`)
    expect(css).toContain('padding:0')
    expect(css).toContain('font-size:0')
    // No gap beside the hidden words, which pushed the glyph off center.
    expect(css).toContain('gap:0')
  })

  describe('Segmented', () => {
    const css = (selection: Parameters<typeof Recipes.Segmented>[0]): string =>
      Style.forSlots(SegmentedSlots)(Recipes.Segmented(selection)).css

    it('tints the pressed option, flat, for text and icon tiles alike', () => {
      // In the variants layer, so an icon button's own background (a variant) does not hide it.
      const pressed = /@layer variants\{[^@]*\w > \[aria-pressed="true"\]\{([^}]*)\}/.exec(css({}))
      expect(pressed?.[1]).toContain('color:var(--fk-accent-ink)')
      // Its fill, until `Segmented.fluid` runs and the indicator carries it.
      const filled = /:not\(\[data-fluid-hover\]\) > \[aria-pressed="true"\]\{([^}]*)\}/.exec(
        css({}),
      )
      expect(filled?.[1]).toContain('background:var(--fk-accent-subtle)')
      expect(pressed?.[1]).toContain('box-shadow:none')
      expect(pressed?.[1]).toContain('font-weight:var(--fk-weight-semibold)')
    })

    it('lays a tray or a plain row', () => {
      expect(css({ tray: 'tray' })).toContain('background:var(--fk-surface-muted)')
      expect(css({ tray: 'plain' })).toContain('display:flex')
      expect(css({ tray: 'plain' })).not.toContain('background:var(--fk-surface-muted)')
    })

    it('steps the tray and its options together, below the ladder for xs', () => {
      expect(css({ size: 'sm' }).match(/--fk-knob-step:1\}/g)).toHaveLength(2)
      expect(css({ size: 'xs' }).match(/--fk-knob-step:1\.5\}/g)).toHaveLength(2)
      // No size follows the region.
      expect(css({ size: null })).not.toContain('--fk-knob-step:')
    })
  })

  describe('Dialog', () => {
    const dialogCss = (selection: Parameters<typeof Recipes.Dialog>[0]): string => {
      const piece = Recipes.Dialog(selection).dialog
      return piece === undefined ? '' : Style.forSlots(DialogSlots)({ dialog: piece }).css
    }

    it('puts the modal back in the middle, where the reset left it in the corner', () => {
      expect(dialogCss({})).toContain('margin:auto')
    })

    it('sizes the panel to the selected width', () => {
      const panel = Recipes.Dialog({ size: 'sm' }).panel
      expect(panel === undefined ? '' : Style.forSlots(DialogSlots)({ panel }).css).toContain(
        'max-inline-size:min(calc(24rem * (1 - 0.1 * var(--fk-knob-step))), 100% - 2rem - var(--fk-safe-left) - var(--fk-safe-right))',
      )
    })

    it('sinks the panel to the modal step', () => {
      const panel = Recipes.Dialog({}).panel
      expect(panel === undefined ? '' : Style.forSlots(DialogSlots)({ panel }).css).toContain(
        'box-shadow:var(--fk-shadow-2xl)',
      )
    })
  })

  describe('Menu', () => {
    const css = (selection: Parameters<typeof Recipes.Menu>[0]): string =>
      Style.forSlots(MenuSlots)(Recipes.Menu(selection)).css

    it('opens a bordered panel over later content', () => {
      expect(css({})).toContain('border-radius:var(--fk-radius-xl)')
      expect(css({})).toContain('box-shadow:var(--fk-shadow-lg)')
      expect(css({})).toContain('z-index:20')
    })

    it('densities rows without changing the panel', () => {
      expect(css({ size: 'sm' })).not.toBe(css({ size: 'md' }))
      expect(css({ size: 'md' })).toContain('border-radius:var(--fk-radius-xl)')
    })

    it('dims a disabled trigger like its rows', () => {
      const button = Recipes.Menu({}).button
      expect(button === undefined ? '' : Style.forSlots(MenuSlots)({ button }).css).toContain(
        'cursor:not-allowed',
      )
    })
  })

  describe('Listbox', () => {
    const css = (selection: Parameters<typeof Recipes.Listbox>[0]): string =>
      Style.forSlots(ListboxSlots)(Recipes.Listbox(selection)).css

    it('tints the chosen option with the accent wash and ink', () => {
      expect(css({})).toMatch(/\[aria-selected="true"\]\{[^}]*background:var\(--fk-accent-subtle\)/)
      expect(css({})).toMatch(/\[aria-selected="true"\]\{[^}]*color:var\(--fk-accent-ink\)/)
    })

    it('leaves the panel its own width unless asked to match the trigger', () => {
      expect(css({})).not.toContain('var(--button-width')
      expect(css({ width: 'trigger' })).toContain('min-inline-size:var(--button-width, 14rem)')
      expect(css({ width: 'auto' })).not.toContain('var(--button-width')
    })
  })

  describe('Combobox', () => {
    const css = (selection: Parameters<typeof Recipes.Combobox>[0]): string =>
      Style.forSlots(ComboboxSlots)(Recipes.Combobox(selection)).css

    it('rings the group while its input has focus and keeps the input borderless', () => {
      expect(css({})).toMatch(/:focus-within\{[^}]*outline:[^}]*var\(--fk-outline-focus\)/)
      expect(css({})).toMatch(/\.style-[a-z0-9]+\{[^}]*border:0[^}]*\}/)
    })

    it('tints the chosen row like the listbox', () => {
      expect(css({})).toMatch(/\[aria-selected="true"\]\{[^}]*background:var\(--fk-accent-subtle\)/)
    })

    it('holds the panel to the trigger’s width unless set free', () => {
      expect(css({})).toContain('min-inline-size:var(--button-width, 14rem)')
      expect(css({ width: 'auto' })).not.toContain('var(--button-width')
    })
  })

  describe('Input and Textarea', () => {
    const inputCss = (selection: Parameters<typeof Recipes.Input>[0]): string =>
      Style.forSlots(InputSlots)(Recipes.Input(selection)).css
    const textareaCss = (selection: Parameters<typeof Recipes.Textarea>[0]): string =>
      Style.forSlots(TextareaSlots)(Recipes.Textarea(selection)).css

    it('fills from the field ground, not the quieter tint beside it', () => {
      expect(inputCss({ variant: 'filled' })).toContain('background:var(--fk-surface-field)')
      expect(textareaCss({ variant: 'filled' })).toContain('background:var(--fk-surface-field)')
      expect(inputCss({ variant: 'filled' })).not.toContain('background:var(--fk-surface-subtle)')
      expect(inputCss({ variant: 'outline' })).not.toContain('background:var(--fk-surface-field)')
    })
  })

  describe('Select', () => {
    const css = (selection: Parameters<typeof Recipes.Select>[0]): string =>
      Style.forSlots(SelectSlots)(Recipes.Select(selection)).css

    it('keeps room for the value, whatever the size', () => {
      // The room is the base's, and a size moves only the step.
      expect(css({ size: null })).toMatch(/padding-inline:[^;]*2rem/)
      for (const size of ['sm', 'md', 'lg'] as const) {
        expect(blocks(css({ size })).filter(block => /padding-inline/.test(block))).toHaveLength(1)
      }
    })

    it('fills instead of outlining on request', () => {
      // The colour alone, so the chevron's gradients stay.
      expect(css({ variant: 'filled' })).toContain('background-color:var(--fk-surface-field)')
      expect(css({ variant: 'outline' })).not.toContain('background-color:var(--fk-surface-field)')
    })

    it('lines an invalid control in error', () => {
      expect(css({})).toMatch(
        /\[aria-invalid="true"\]\{[^}]*border-color:var\(--fk-error-outline\)/,
      )
    })
  })

  describe('RadioGroup', () => {
    const css = (selection: Parameters<typeof Recipes.RadioGroup>[0]): string =>
      Style.forSlots(RadioGroupSlots)(Recipes.RadioGroup(selection)).css

    it('fills the checked circle from the tone', () => {
      expect(css({ tone: 'accent' })).toMatch(
        /\[aria-checked="true"\]::after\{[^}]*background:var\(--_fk-tone-fill\)/,
      )
    })

    it('checks neutral in ink, not the pale surface', () => {
      const neutral = Style.forSlots(RadioGroupSlots)(Recipes.RadioGroup({ tone: 'neutral' })).css
      expect(neutral).toContain('--_fk-tone-fill:var(--fk-text-default)')
    })

    it('scales the box by size', () => {
      expect(css({ size: 'lg' })).toContain('--_fk-toggle-size:1.25rem')
    })

    it('sits the checked dot on whole pixels, centered at every size', () => {
      expect(css({})).toMatch(/\[aria-checked="true"\]::after\{[^}]*inset:3px/)
    })
  })

  describe('Slider', () => {
    const css = (selection: Parameters<typeof Recipes.Slider>[0]): string =>
      Style.forSlots(SliderSlots)(Recipes.Slider(selection)).css

    it('fills the track and rims the thumb in the tone', () => {
      expect(css({})).toContain('background:var(--_fk-tone-fill)')
      expect(css({ tone: 'neutral' })).toContain('--_fk-tone-fill:var(--fk-text-default)')
    })

    it('scales the thumb by size', () => {
      expect(css({ size: 'sm' })).toContain('--_fk-slider-size:0.75rem')
    })

    it('draws a track as thick as the thumb, or a slim one', () => {
      const slim = 'block-size:calc(var(--_fk-slider-size) * 0.375)'
      expect(css({})).not.toContain(slim)
      expect(css({ track: 'thin' })).toContain(slim)
    })

    it('widens the thumb for a value inside it, and only where values are shown', () => {
      const pill = '--_fk-slider-thumb:calc(var(--_fk-slider-size) * 2.5)'
      expect(css({})).not.toContain(pill)
      expect(css({ value: 'inside' })).toContain(`[data-values]{${pill}`)
    })
  })

  describe('Toast', () => {
    const css = (): string => Style.forSlots(ToastSlots)(Recipes.Toast({})).css

    it('stacks entries bottom-right above the page', () => {
      expect(css()).toContain('position:fixed')
      expect(css()).toContain('z-index:50')
    })
  })

  describe('FileDrop', () => {
    const css = (): string => Style.forSlots(FileDropSlots)(Recipes.FileDrop({})).css

    it('draws a dashed zone that tints on drag-over', () => {
      expect(css()).toMatch(/border:[^;]*dashed/)
      expect(css()).toContain('[data-drag-over="true"]')
      expect(css()).toContain('background:var(--fk-accent-subtle)')
    })

    it('hides the file input off the root, beside the component class', () => {
      expect(css()).toContain('> input{')
      expect(css()).toContain('clip-path:inset(50%)')
    })
  })

  describe('DatePicker', () => {
    const css = (selection: Parameters<typeof Recipes.DatePicker>[0]): string =>
      Style.forSlots(DatePickerSlots)(Recipes.DatePicker(selection)).css

    it('draws the trigger as a bordered control', () => {
      expect(css({})).toMatch(/border:[^;]*solid[^;]*var\(--fk-outline-default\)/)
    })

    it('steps the trigger and its panel by size', () => {
      expect(css({ size: 'sm' }).match(/--fk-knob-step:1\}/g)).toHaveLength(2)
    })
  })

  describe('Popover', () => {
    const css = (selection: Parameters<typeof Recipes.Popover>[0]): string =>
      Style.forSlots(PopoverSlots)(Recipes.Popover(selection)).css

    it('floats the panel above page content', () => {
      expect(css({})).toContain('box-shadow:var(--fk-shadow-lg)')
      expect(css({})).toContain('z-index:20')
    })

    it('sizes the panel by selection', () => {
      expect(css({ size: 'lg' })).toContain('max-inline-size:min(32rem, 100% - 2rem)')
    })
  })

  describe('Tooltip', () => {
    const css = (): string => Style.forSlots(TooltipSlots)(Recipes.Tooltip({})).css

    it('draws the pill dark on any ground', () => {
      expect(css()).toContain('background:var(--fk-text-overt)')
      expect(css()).toContain('color:var(--fk-surface-base)')
    })

    it('underlines the trigger dotted', () => {
      expect(css()).toContain('text-decoration:underline dotted')
    })

    it('dims a disabled trigger instead of inviting hover', () => {
      expect(css()).toContain('cursor:not-allowed')
    })
  })

  describe('Badge', () => {
    const BadgeSlots = Slots.define({
      badge: Slot.make({ capability: Capability.Container }),
    })
    const tones = { Published: 'success', Changed: 'warning', New: 'info' } as const
    const css = (attribute = 'data-state'): string =>
      Style.forSlots(BadgeSlots)({ badge: Recipes.Badge({ attribute, tones }).badge }).css

    it('compiles the pill, its appearances, and one rule per mapped value', () => {
      expect(css()).toContain('border-radius:var(--fk-radius-xl)')
      expect(css()).toContain('[data-state="Published"]')
      expect(css()).toContain('[data-state="Changed"]')
      expect(css()).toContain('[data-state="New"]')
      // The dot lives in the `dot` appearance alone, in the tone's fill.
      expect(css()).not.toContain('::before')
      const dotted = Style.forSlots(BadgeSlots)({
        badge: Recipes.Badge({ attribute: 'data-state', tones, appearance: 'dot' }).badge,
      }).css
      expect(dotted).toContain('::before')
      expect(dotted).toContain('background:var(--_fk-badge-fill)')
    })

    it('tones a value with its family wash and ink', () => {
      expect(css()).toContain('--_fk-badge-tint:var(--fk-success-subtle)')
      expect(css()).toContain('--_fk-badge-ink:var(--fk-success-ink)')
      expect(css()).toContain('--_fk-badge-ink:var(--fk-warning-ink)')
      expect(css()).toContain('background:var(--_fk-badge-tint)')
      expect(css()).toContain('color:var(--_fk-badge-ink)')
    })

    it('leaves an unmapped value on the base and takes the attribute', () => {
      expect(css()).not.toContain('[data-state="Archived"]')
      expect(css('data-cms-state')).toContain('[data-cms-state="Published"]')
      expect(css('data-cms-state')).not.toContain('[data-state="Published"]')
    })

    it('references only defined tokens', () => {
      const references = [...css().matchAll(/var\(--fk-([a-z0-9-]+)/g)].map(match => match[1] ?? '')
      expect(references.length).toBeGreaterThan(0)
      expect(references.filter(reference => !defined.has(reference))).toEqual([])
    })

    it('emits every rule inside a layer, base in components and tones in variants', () => {
      for (const block of blocks(css())) {
        expect(block).toMatch(/^@layer (components|variants)\{/)
      }
      const layered = blocks(css())
      expect(layered.some(block => /^@layer components\{/.test(block))).toBe(true)
      expect(layered.some(block => /^@layer variants\{.*data-state/.test(block))).toBe(true)
    })

    it('writes no inline declarations', () => {
      const piece = Recipes.Badge({ attribute: 'data-state', tones }).badge
      expect(piece.style).toEqual({})
      expect(piece.conditions ?? []).toEqual([])
      expect(piece.items ?? []).toEqual([])
    })
  })

  it('extend composes a patch onto a variant and the base', () => {
    const Brand = Recipes.Button.extend({
      base: { button: Style.class('brand-button') },
      variants: { tone: { accent: { button: Style.class('brand-accent') } } },
    })
    const classes = (pieces: StyleValues<typeof ButtonSlots>) => pieces.button?.classes ?? []
    expect(classes(Brand())).toEqual(expect.arrayContaining(['brand-button', 'brand-accent']))
    expect(classes(Brand({ tone: 'danger' }))).toContain('brand-button')
    expect(classes(Brand({ tone: 'danger' }))).not.toContain('brand-accent')
    expect(classes(Recipes.Button())).not.toContain('brand-button')
  })

  it('styles a real @foldkit/ui Button through its adapter', () => {
    const Danger = Style.forSlots(ButtonSlots)(Recipes.Button({ tone: 'danger' }))
    let resolved: SlotAttributes<TestMessage> = []
    buttonView<TestMessage>(
      {
        onClick: message('Clicked'),
        toView: attributes => {
          resolved = Button.resolve(attributes, [Danger.mixin], { input: undefined, h }).button
          return h.button(resolved, [])
        },
      },
      h,
    )
    const generated = Danger.rules[0]?.className ?? ''
    expect(generated).not.toBe('')
    expect(attributeOf(resolved, 'Class')?.value.split(' ')).toContain(generated)
    expect(attributeOf(resolved, 'OnClick')?.message).toEqual(message('Clicked'))
    expect(Danger.css).toContain('--_fk-tone-fill:var(--fk-error-default)')
  })
})
