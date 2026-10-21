/**
 * `/create`: the theme's knobs beside every component drawn in them, and the
 * theme module they make. Each knob is a CSS variable set on the preview, so
 * moving one re-derives the theme in the browser; the code below it is the
 * same knobs written as an application's `AppStyle.make`.
 *
 * The knobs are the library's own components, in the site's look: Tabs pick
 * a pane, a Slider turns each number, a Segmented row picks among a few, a
 * Select over Listbox among many, and Buttons choose a theme. Beside the
 * preview they are a column of their own; on a narrower screen they are a
 * drawer held to the bottom of the screen, over the preview rather than above
 * it, so a knob turned shows its effect without a scroll. The drawer is not
 * modal: the preview stays live under it.
 */
import { Tooltip as UiTooltip } from '@foldkit/ui'
import { Option } from 'effect'
import type { Html } from 'foldkit/html'
import { Icon as MediaIcon, type IconData } from 'foldkit-media'
import { SlotView, Style, type SlotAttributes } from 'foldkit-mixins'
import { Theme } from 'foldkit-mixins/theme'
import {
  ButtonSlots,
  CodeBlock,
  Drawer,
  Listbox,
  ListboxSlots,
  Recipes,
  Segmented,
  SegmentedSlots,
  Slider,
  SliderSlots,
  Tabs,
  TabsSlots,
  Tooltip,
} from 'foldkit-mixins-ui'

import { showcaseOf, type Selection } from '../gallery/showcases.js'
import * as Specimens from '../gallery/specimens.js'
import {
  Canvas,
  CanvasTabs,
  PickerBox,
  SectionTabs,
  type Hint,
  type Picker,
} from '../gallery/studio.js'
import {
  Base,
  Section,
  baseOf,
  codeOf,
  defaults,
  fontLabels,
  inLook,
  halfAt,
  knobAt,
  looks,
  packIconsAt,
  presets,
  packs,
  Pack,
  sameTheme,
  sectionLabels,
  valueAt,
  withLook,
  type KnobPath,
  type ThemeValues,
} from '../gallery/theme.js'
import { COMPONENTS } from '../library.js'
import { Message, type Model } from '../main.js'
import { CodeStyle, HintStyle, StudioDrawerStyle, StudioTabsStyle } from '../style.js'
import { liveOf, preview } from './components.js'
import { icons } from './iconData.js'
import { tsTokens } from './tsTokens.js'
import type { H, Slots } from './layout.js'

/** What the preview shows, in order, and the variant each is drawn in. */
const tiles: ReadonlyArray<{ readonly slug: string; readonly selection: Selection }> = [
  { slug: 'card', selection: {} },
  { slug: 'input', selection: {} },
  { slug: 'button', selection: {} },
  { slug: 'button', selection: { tone: 'neutral', variant: 'outline' } },
  { slug: 'button', selection: { tone: 'danger' } },
  { slug: 'alert', selection: { tone: 'success' } },
  { slug: 'badge', selection: {} },
  { slug: 'checkbox', selection: {} },
  { slug: 'switch', selection: {} },
  { slug: 'select', selection: {} },
  { slug: 'table', selection: {} },
  { slug: 'item', selection: {} },
  { slug: 'avatar', selection: {} },
  { slug: 'pagination', selection: {} },
  { slug: 'skeleton', selection: {} },
  { slug: 'empty', selection: {} },
  { slug: 'kbd', selection: {} },
  { slug: 'tabs', selection: { variant: 'pill' } },
  { slug: 'segmented', selection: {} },
  { slug: 'menu', selection: {} },
]

const CODE_ID = 'theme-code'

// The controls' own looks, compact to fit a column; they read the site's tokens.
// The name and value are drawn above it, the name a hint's trigger; the slider's own stay for a reader.
const SliderStyle = Style.forSlots(SliderSlots)(
  Recipes.Slider({ size: 'sm', value: 'end', label: 'hidden' }),
)
const SegmentedStyle = Style.forSlots(SegmentedSlots)(
  Recipes.Segmented({ size: 'sm', width: 'fill' }),
)
const PickerStyle = Style.forSlots(ListboxSlots)(Recipes.Listbox({ size: 'sm', width: 'trigger' }))
const ChoiceStyle = Style.forSlots(ButtonSlots)(
  Recipes.Button({ tone: 'neutral', variant: 'outline', size: 'sm' }),
)
const BarStyle = Style.forSlots(SegmentedSlots)(Recipes.Segmented({ size: 'sm' }))
const CanvasTabsStyle = Style.forSlots(TabsSlots)(Recipes.Tabs({ overflow: 'scroll' }))
const ActionStyle = Style.forSlots(ButtonSlots)(
  Recipes.Button({ tone: 'neutral', variant: 'ghost', size: 'sm' }),
)
const PrimaryStyle = Style.forSlots(ButtonSlots)(Recipes.Button({ size: 'sm' }))

/** An icon at the text's size and in its color, from the site's own generated set. */
const icon = (h: H, drawn: IconData): Html => MediaIcon.draw(drawn, h, { size: '1.1em' })

/** A ghost button with an icon before its words. */
const iconButton = (h: H, drawn: IconData, label: string, onClick: Message): Html => {
  const action = SlotView.buildersFor(ButtonSlots, [ActionStyle.mixin], { input: undefined, h })
  return h.button(action.button.attrs([h.Type('button'), h.OnClick(onClick)]), [
    icon(h, drawn),
    label,
  ])
}

/** A number a knob stands at, light or dark: a bare schemed value is the light one. */
const numberAt = (values: ThemeValues, path: KnobPath, dark = false): number => {
  const value = valueAt(values, path)
  const fallback = knobAt(path).default
  if (typeof value === 'number')
    return dark && typeof fallback === 'object' ? (fallback.dark ?? value) : value
  if (typeof value === 'object') {
    const each = dark ? value.dark : value.light
    const otherwise =
      typeof fallback === 'object' ? (dark ? fallback.dark : fallback.light) : undefined
    return each ?? otherwise ?? 0
  }
  return 0
}

/**
 * A theme's accent over its page, in a light scheme, for a preset's swatch:
 * the page's grey is as much of Windows 95 as its navy.
 */
const swatchOf = (values: ThemeValues) => {
  const hue = numberAt(values, 'accent.hue')
  const neutral = values.surface?.hue ?? hue
  const accent = `oklch(${numberAt(values, 'accent.lightness')}% ${numberAt(values, 'accent.chroma')} ${hue})`
  const page = `oklch(${numberAt(values, 'surface.lightness')}% ${numberAt(values, 'surface.saturation') * 2} ${neutral})`
  return `linear-gradient(135deg, ${accent} 50%, ${page} 50%)`
}

/** How a slider's value reads: an angle in degrees, a multiplier with ×, else its unit. */
const shown: Partial<Record<KnobPath, string>> = {
  'accent.hue': '°',
  'shape.radius': '×',
  'shape.density': '×',
  'type.scale': '×',
  'type.headingScale': '×',
  'type.leading': '×',
  'motion.scale': '×',
  'scales.chroma': '×',
}

const slider = (model: Model, slots: Slots, h: H, path: KnobPath, dark = false): Html => {
  const knob = halfAt(path, dark)
  const { control } = knob
  if (control.kind !== 'range') return h.span([], [])
  const { title } = knob
  const format = (value: number) => `${value}${shown[path] ?? control.unit}`
  const value = numberAt(model.theme, path, dark)
  return h.div(slots.knob.attrs(), [
    h.div(slots.knobHead.attrs(), [
      hint(model, h, dark && path === 'surface.lightness' ? 'surface.lightness.dark' : path, title),
      h.span(slots.knobValue.attrs([h.AriaHidden(true)]), [format(value)]),
    ]),
    Slider.view(
      {
        id: `knob-${path.replace('.', '-')}${dark ? '-dark' : ''}`,
        label: title,
        value,
        onChange: next => Message.SetKnob({ path, value: next, dark }),
        min: control.min,
        max: control.max,
        step: control.step,
        format,
        style: SliderStyle,
      },
      h,
    ),
  ])
}

/** What a name means, for its tooltip: a knob's own description, or the site's words. */
const hintText = (which: Hint): string => {
  switch (which) {
    case 'surface.lightness.dark':
      return halfAt('surface.lightness', true).description
    case 'icon.stroke':
      return 'How thick every stroke is: the pack’s icons and the shapes the recipes draw in CSS, like a check or a chevron.'
    case 'base':
      return 'The hue the neutrals are mixed from: the page, text and borders. Accent takes the accent’s own; the others are shadcn’s base colors.'
    case 'theme':
      return 'Whole themes, setting every knob at once. Hover one to read about it.'
    case 'look':
      return 'The shape and type of a style, leaving the colors as they are.'
    case 'pack':
      return 'The icons the components draw themselves: a search, a close, an alert’s sign. The theme’s code imports them from the pack.'
    default:
      return knobAt(which).description
  }
}

/**
 * A knob's name as a Tooltip's trigger, the tooltip saying what the knob
 * does; the name alone is often a term of art (chroma, leading, relief).
 */
const hint = (model: Model, h: H, which: Hint, name: string): Html =>
  Option.match(Option.fromNullishOr(model.hints.find(each => each.hint === which)), {
    onNone: () => h.span([], [name]),
    onSome: ({ tooltip }) =>
      h.submodel({
        slotId: tooltip.id,
        model: tooltip,
        view: UiTooltip.view,
        viewInputs: {
          anchor: Tooltip.anchor({ placement: 'top-start' }),
          toView: Tooltip.toView([HintStyle.mixin], { h, id: tooltip.id }, tip =>
            h.span(
              [],
              [
                h.button([...tip.trigger, h.Type('button')], [name]),
                ...(tip.isVisible
                  ? [h.div(tip.layer, [h.div(tip.panel, [h.span(tip.arrow, []), hintText(which)])])]
                  : []),
              ],
            ),
          ),
        },
        toParentMessage: message => Message.GotHint({ hint: which, message }),
      }),
  })

/** Labels for a choice's values, as words. */
const words = <A extends string>(values: ReadonlyArray<A>, label: (value: A) => string = capital) =>
  values.map(value => ({ value, label: label(value) }))
const capital = (value: string) => value[0]!.toUpperCase() + value.slice(1).replaceAll('-', ' ')

/** A choice knob's options in a row, one pressed: its title shows above, and names the group. */
const row = (model: Model, slots: Slots, h: H, path: KnobPath): Html => {
  const knob = knobAt(path)
  const { control } = knob
  if (control.kind !== 'choice') return h.span([], [])
  return h.div(slots.knob.attrs(), [
    hint(model, h, path, knob.title),
    Segmented.view(
      {
        label: knob.title,
        options: words(control.options),
        pressed: [String(valueAt(model.theme, path))],
        onPress: value => Message.SetKnob({ path, value, dark: false }),
        style: SegmentedStyle,
        mixins: Segmented.fluid,
      },
      h,
    ),
  ])
}

/** A font stack's name in `Theme.fonts`, or `custom` for one of its own. */
const fontName = (stack: unknown): string =>
  stack === 'inherit'
    ? 'inherit'
    : (Object.entries(Theme.fonts).find(([, each]) => each === stack)?.[0] ?? 'custom')
const fonts = Object.keys(Theme.fonts).map(name => ({
  value: name,
  label: Object.entries(fontLabels).find(([key]) => key === name)?.[1] ?? capital(name),
}))

/** Many values in a Select over Listbox, labelled by `name`. */
const picker = (
  model: Model,
  slots: Slots,
  h: H,
  which: Picker,
  name: string,
  options: ReadonlyArray<{ readonly value: string; readonly label: string }>,
  current: string,
): Html => {
  const part = Listbox.parts([PickerStyle.mixin], { h })
  const labelOf = new Map<string, string>([
    ...options.map(option => [option.value, option.label] as const),
    ['custom', 'Custom'],
  ])
  const listbox = model.pickers[which]
  return h.div(slots.knob.attrs(), [
    hint(model, h, pickerHint[which], name),
    h.submodel({
      slotId: listbox.id,
      model: listbox,
      view: PickerBox.view,
      viewInputs: {
        // Not portaled: the runtime that draws the list keeps it.
        anchor: { placement: 'bottom-start', gap: 4, padding: 8, portal: false },
        direction: 'ltr',
        items: options.map(option => option.value),
        maybeSelectedValue: Option.some<string>(current),
        itemToConfig: (value: string) => ({
          content: part.option({ label: labelOf.get(value) ?? value }),
        }),
        buttonContent: part.trigger(Option.some({ label: labelOf.get(current) ?? current }), name),
        toView: Listbox.toView([PickerStyle.mixin, ...Listbox.fluid], { h }),
      },
      toParentMessage: message => Message.GotPicker({ picker: which, message }),
    }),
  ])
}

/** What each picker's tooltip explains: the knob it sets, or a choice that is no knob. */
const pickerHint: Readonly<Record<Picker, Hint>> = {
  base: 'base',
  pack: 'pack',
  font: 'type.body',
  headingFont: 'type.heading',
  menuColor: 'menu.panel',
}

/** Buttons that each install a theme, pressed while the theme is its own. */
const chips = <A>(
  model: Model,
  slots: Slots,
  h: H,
  which: Hint,
  name: string,
  items: ReadonlyArray<A>,
  item: (value: A) => {
    readonly label: ReadonlyArray<Html | string>
    readonly title: string
    readonly pressed: boolean
    readonly message: Message
  },
): Html => {
  const button = SlotView.buildersFor(ButtonSlots, [ChoiceStyle.mixin], { input: undefined, h })
  return h.fieldset(slots.axis.attrs(), [
    h.legend(slots.axisName.attrs(), [hint(model, h, which, name)]),
    h.div(
      slots.presets.attrs(),
      items.map(value => {
        const { label, title, pressed, message } = item(value)
        return h.button(
          button.button.attrs([
            h.Type('button'),
            h.AriaPressed(String(pressed)),
            h.Title(title),
            h.OnClick(message),
          ]),
          label,
        )
      }),
    ),
  ])
}

const themesPane = (model: Model, slots: Slots, h: H): ReadonlyArray<Html> => {
  const action = SlotView.buildersFor(ButtonSlots, [ActionStyle.mixin], { input: undefined, h })
  return [
    chips(model, slots, h, 'theme', 'Theme', presets, preset => ({
      label: [
        h.span(
          slots.swatch.attrs([
            h.AriaHidden(true),
            h.Style({ background: swatchOf(preset.values) }),
          ]),
          [],
        ),
        preset.name,
      ],
      title: preset.description,
      pressed: sameTheme(model.theme, preset.values),
      message: Message.ChoseTheme({ name: preset.name }),
    })),
    chips(model, slots, h, 'look', 'Style, keeping the colors', looks, look => ({
      label: [look.name],
      title: look.description,
      pressed: inLook(model.theme, look),
      message: Message.ChoseValues({ values: withLook(model.theme, look) }),
    })),
    h.div(slots.actions.attrs(), [
      h.button(
        action.button.attrs([
          h.Type('button'),
          h.OnClick(Message.ChoseValues({ values: defaults })),
        ]),
        ['Reset'],
      ),
      h.button(
        SlotView.buildersFor(ButtonSlots, [PrimaryStyle.mixin], {
          input: undefined,
          h,
        }).button.attrs([h.Type('button'), h.OnClick(Message.PressedShuffle())]),
        [icon(h, icons.shuffle), 'Shuffle'],
      ),
    ]),
  ]
}

const colorPane = (model: Model, slots: Slots, h: H): ReadonlyArray<Html> => [
  slider(model, slots, h, 'accent.hue'),
  slider(model, slots, h, 'accent.chroma'),
  slider(model, slots, h, 'accent.lightness'),
  picker(model, slots, h, 'base', 'Base color', words(Base.literals), baseOf(model.theme)),
  slider(model, slots, h, 'surface.saturation'),
  slider(model, slots, h, 'surface.lightness'),
  slider(model, slots, h, 'surface.lightness', true),
  slider(model, slots, h, 'surface.contrast'),
  slider(model, slots, h, 'scales.chroma'),
  row(model, slots, h, 'surface.hover'),
  slider(model, slots, h, 'surface.hoverStrength'),
  row(model, slots, h, 'menu.highlight'),
  picker(
    model,
    slots,
    h,
    'menuColor',
    knobAt('menu.panel').title,
    words(['default', 'inverted', 'translucent', 'inverted-translucent']),
    String(valueAt(model.theme, 'menu.panel')),
  ),
]

const shapePane = (model: Model, slots: Slots, h: H): ReadonlyArray<Html> => [
  slider(model, slots, h, 'shape.radius'),
  slider(model, slots, h, 'shape.density'),
  row(model, slots, h, 'shape.size'),
  row(model, slots, h, 'shape.controls'),
  slider(model, slots, h, 'shape.border'),
  row(model, slots, h, 'shape.outlines'),
  slider(model, slots, h, 'state.disabledOpacity'),
  slider(model, slots, h, 'shadow.strength'),
  row(model, slots, h, 'shadow.style'),
  row(model, slots, h, 'shadow.relief'),
]

const typePane = (model: Model, slots: Slots, h: H): ReadonlyArray<Html> => [
  picker(
    model,
    slots,
    h,
    'font',
    knobAt('type.body').title,
    fonts,
    fontName(valueAt(model.theme, 'type.body')),
  ),
  picker(
    model,
    slots,
    h,
    'headingFont',
    knobAt('type.heading').title,
    [{ value: 'inherit', label: 'Body' }, ...fonts],
    fontName(valueAt(model.theme, 'type.heading')),
  ),
  slider(model, slots, h, 'type.scale'),
  slider(model, slots, h, 'type.headingScale'),
  slider(model, slots, h, 'type.headingWeight'),
  slider(model, slots, h, 'type.headingTracking'),
  slider(model, slots, h, 'type.leading'),
]

const iconsPane = (model: Model, slots: Slots, h: H): ReadonlyArray<Html> => [
  picker(
    model,
    slots,
    h,
    'pack',
    'Icon pack',
    Pack.literals.map(pack => ({ value: pack, label: packs[pack].label })),
    model.pack,
  ),
  h.div(slots.knob.attrs(), [
    // The icons the components draw themselves, in the pack chosen, at the theme's stroke.
    h.div(
      slots.iconSpecimen.attrs([
        // The icon size knob's own multiple: the specimen sits outside the preview, which sets it.
        h.Style({ fontSize: `${1.25 * valueAt(model.theme, 'icon.size')}rem` }),
      ]),
      packIconsAt(model.pack, valueAt(model.theme, 'icon.stroke')).map(icon =>
        MediaIcon.draw(icon, h),
      ),
    ),
  ]),
  slider(model, slots, h, 'icon.size'),
  slider(model, slots, h, 'icon.stroke'),
]

const motionPane = (model: Model, slots: Slots, h: H): ReadonlyArray<Html> => [
  slider(model, slots, h, 'motion.scale'),
  row(model, slots, h, 'motion.easing'),
]

const panes: Readonly<Record<Section, (model: Model, slots: Slots, h: H) => ReadonlyArray<Html>>> =
  {
    theme: themesPane,
    color: colorPane,
    shape: shapePane,
    type: typePane,
    icons: iconsPane,
    motion: motionPane,
  }

/** The pane names as Tabs, and the chosen pane as the tab's panel. */
const sections = (
  model: Model,
  slots: Slots,
  h: H,
  body: SlotAttributes<Message>,
  grip: SlotAttributes<Message>,
): Html =>
  h.submodel({
    slotId: model.sectionTabs.id,
    model: model.sectionTabs,
    view: SectionTabs.view,
    viewInputs: {
      tabs: Section.literals,
      selectedValue: model.section,
      ariaLabel: 'Knobs',
      toView: Tabs.toView<Section, Message>(
        [StudioTabsStyle.mixin, ...Tabs.fluid],
        { h },
        ({ tablist, indicator, highlight, label, tabs, activeIndex }) =>
          h.div(slots.sections.attrs(), [
            // The pane names drag the drawer too: a swipe down them, not only the bar.
            h.div(grip, [
              h.div(tablist, [
                h.div(indicator),
                h.div(highlight),
                ...tabs.map(tab => h.button(tab.tab, [h.span(label, [sectionLabels[tab.value]])])),
              ]),
            ]),
            // The Drawer's body: what hides when it is down, under the pane names that peek.
            h.div(
              body,
              tabs
                .filter(tab => tab.index === activeIndex)
                // The pane's own column inside the panel: one element, one Slot.
                .map(tab =>
                  h.div(tab.panel, [h.div(slots.pane.attrs(), panes[tab.value](model, slots, h))]),
                ),
            ),
          ]),
      ),
    },
    toParentMessage: message => Message.GotSectionTabs({ message }),
  })

const controls = (model: Model, slots: Slots, h: H): Html =>
  Drawer.view(
    {
      model: model.drawer,
      onMessage: message => Message.GotDrawer({ message }),
      labels: { open: 'Hide the knobs', closed: 'Show the knobs' },
      style: StudioDrawerStyle,
      draw: ({ panel, handle, body, grip }) =>
        h.aside(
          [...panel, h.AriaLabel('Theme')],
          [h.button(handle, []), sections(model, slots, h, body, grip)],
        ),
    },
    h,
  )

const schemes = words(['system', 'light', 'dark'] as const)
const directions = words(['ltr', 'rtl'] as const, direction => direction.toUpperCase())

const canvasLabels: Readonly<Record<Canvas, string>> = {
  components: 'Components',
  typography: 'Typography',
  palette: 'Palette',
  dashboard: 'Dashboard',
  assistant: 'Assistant',
  booking: 'Booking',
  settings: 'Settings',
}

/** Every component, each in its first example, in columns. */
const components = (model: Model, slots: Slots, h: H): ReadonlyArray<Html> => {
  const live = liveOf(model, h)
  return tiles.flatMap(({ slug, selection }) =>
    showcaseOf(slug).pipe(
      Option.match({
        onNone: () => [],
        onSome: showcase => [
          h.div(slots.tile.attrs(), [
            h.a(slots.tileName.attrs([h.Href(`${COMPONENTS}/${slug}`)]), [showcase.title]),
            // A block of its own, so a button keeps its width in the column.
            h.div([], [showcase.preview(selection, live)]),
          ]),
        ],
      }),
    ),
  )
}

/** What each tab of the preview draws inside it. */
const canvases: Readonly<
  Record<Canvas, (model: Model, slots: Slots, h: H) => ReadonlyArray<Html>>
> = {
  components,
  typography: (_, slots, h) => [Specimens.typography(slots, h)],
  palette: (_, slots, h) => [Specimens.palette(slots, h)],
  dashboard: (model, slots, h) => [Specimens.dashboard(slots, h, liveOf(model, h))],
  assistant: (model, slots, h) => [Specimens.assistant(slots, h, liveOf(model, h))],
  booking: (model, slots, h) => [Specimens.booking(slots, h, liveOf(model, h))],
  settings: (_, slots, h) => [Specimens.settings(slots, h)],
}

const canvas = (model: Model, slots: Slots, h: H): Html => {
  const bar = <A extends string>(
    label: string,
    options: ReadonlyArray<{ readonly value: A; readonly label: string }>,
    current: A,
    onPress: (value: A) => Message,
  ) =>
    Segmented.view(
      { label, options, pressed: [current], onPress, style: BarStyle, mixins: Segmented.fluid },
      h,
    )
  return h.div(slots.canvasColumn.attrs(), [
    h.div(slots.previewBar.attrs(), [
      bar('Preview scheme', schemes, model.scheme, scheme => Message.ChoseScheme({ scheme })),
      bar('Preview direction', directions, model.direction, direction =>
        Message.ChoseDirection({ direction }),
      ),
      h.div(slots.previewActions.attrs(), [
        h.a(slots.toCode.attrs([h.Href(`#${CODE_ID}`)]), ['Get the code:']),
        // The theme as the application's style module, or a link back to these knobs.
        iconButton(
          h,
          model.copied ? icons.check : icons.copy,
          model.copied ? 'Copied' : 'Copy theme',
          Message.PressedCopy({ text: codeOf(model.theme, model.pack) }),
        ),
        iconButton(
          h,
          model.linkCopied ? icons.check : icons.link,
          model.linkCopied ? 'Link copied' : 'Copy link',
          Message.PressedCopyLink(),
        ),
      ]),
    ]),
    h.submodel({
      slotId: model.canvasTabs.id,
      model: model.canvasTabs,
      view: CanvasTabs.view,
      viewInputs: {
        tabs: Canvas.literals,
        selectedValue: model.canvas,
        ariaLabel: 'Preview',
        toView: Tabs.toView<Canvas, Message>(
          [CanvasTabsStyle.mixin, ...Tabs.fluid],
          { h },
          ({ tablist, indicator, highlight, label, tabs, activeIndex }) =>
            h.div(slots.canvasColumn.attrs(), [
              h.div(tablist, [
                h.div(indicator),
                h.div(highlight),
                ...tabs.map(tab => h.button(tab.tab, [h.span(label, [canvasLabels[tab.value]])])),
              ]),
              ...tabs
                .filter(tab => tab.index === activeIndex)
                .map(tab =>
                  h.div(tab.panel, [
                    // The components in columns; a specimen reads down the page.
                    preview(
                      model,
                      tab.value === 'components' ? 'canvas' : 'specimen',
                      slots,
                      h,
                      canvases[tab.value](model, slots, h),
                    ),
                  ]),
                ),
            ]),
        ),
      },
      toParentMessage: message => Message.GotCanvasTabs({ message }),
    }),
  ])
}

export const createPage = (model: Model, slots: Slots, h: H): ReadonlyArray<Html> => {
  const code = codeOf(model.theme, model.pack)
  return [
    h.section(slots.hero.attrs(), [
      h.h1(slots.heroTitle.attrs(), [
        'Create a theme. ',
        h.span(slots.quiet.attrs(), ['A few knobs, every component.']),
      ]),
      h.p(slots.lede.attrs(), [
        'A ',
        h.code([], ['foldkit-mixins']),
        ' theme is a handful of knobs; every color, space, corner and shadow is a CSS expression over them. Start from a theme, turn a knob and the components follow, then copy the theme into your application.',
      ]),
    ]),
    h.div(slots.studio.attrs(), [controls(model, slots, h), canvas(model, slots, h)]),
    h.section(slots.section.attrs([h.AriaLabelledBy(CODE_ID)]), [
      h.h2(slots.sectionTitle.attrs([h.Id(CODE_ID)]), ['Your theme']),
      h.p(slots.rowText.attrs(), [
        'Your application’s style module. Its ',
        h.code([], ['forSlots']),
        ' styles each component’s slots with a recipe, as every component page shows.',
      ]),
      h.div(slots.themeCode.attrs(), [
        CodeBlock.view(
          {
            code,
            tokens: tsTokens(code),
            language: 'ts',
            copy: { onCopy: text => Message.PressedCopy({ text }), copied: model.copied },
            style: CodeStyle,
          },
          h,
        ),
      ]),
    ]),
    h.div(slots.drawerRoom.attrs([h.AriaHidden(true)]), []),
  ]
}
