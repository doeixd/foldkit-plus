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
import { Listbox as UiListbox, Tooltip as UiTooltip } from '@foldkit/ui'
import { Option } from 'effect'
import type { Html } from 'foldkit/html'
import { SlotView, Style, type SlotAttributes } from 'foldkit-mixins'
import {
  Button,
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
  pickerId,
  type Hint,
  type Picker,
} from '../gallery/studio.js'
import {
  Base,
  ControlShape,
  Easing,
  Font,
  HeadingFont,
  Hover,
  MenuAccent,
  MenuColor,
  Outlines,
  Relief,
  Section,
  ShadowStyle,
  Size,
  bases,
  codeOf,
  defaults,
  fontLabels,
  inLook,
  looks,
  presetKnobs,
  presets,
  rangeOf,
  sameKnobs,
  sectionLabels,
  type Knob,
  type Knobs,
  type Preset,
} from '../gallery/theme.js'
import { COMPONENTS } from '../library.js'
import { Message, type Model } from '../main.js'
import { CodeStyle, HintStyle, StudioDrawerStyle, StudioTabsStyle } from '../style.js'
import { liveOf, preview } from './components.js'
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

/** Lucide's strokes, at the text's size and in its color. */
const icon = (h: H, paths: ReadonlyArray<string>): Html =>
  h.svg(
    [
      h.AriaHidden(true),
      h.ViewBox('0 0 24 24'),
      h.Attribute('width', '1.1em'),
      h.Attribute('height', '1.1em'),
      h.Attribute('fill', 'none'),
      h.Attribute('stroke', 'currentColor'),
      h.Attribute('stroke-width', '2'),
      h.Attribute('stroke-linecap', 'round'),
      h.Attribute('stroke-linejoin', 'round'),
    ],
    paths.map(d => h.path([h.Attribute('d', d)], [])),
  )
const COPY = [
  'M11 9h9a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-9a2 2 0 0 1-2-2v-9a2 2 0 0 1 2-2z',
  'M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1',
]
const LINK = [
  'M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71',
  'M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71',
]
const CHECK = ['M20 6 9 17l-5-5']
const SHUFFLE = [
  'm18 14 4 4-4 4',
  'm18 2 4 4-4 4',
  'M2 18h1.973a4 4 0 0 0 3.3-1.7l5.454-7.6a4 4 0 0 1 3.3-1.7H22',
  'M2 6h1.972a4 4 0 0 1 3.6 2.2',
  'M22 18h-6.041a4 4 0 0 1-3.3-1.8l-.359-.45',
]

/** A ghost button with an icon before its words. */
const iconButton = (h: H, paths: ReadonlyArray<string>, label: string, onClick: Message): Html => {
  const action = SlotView.buildersFor(ButtonSlots, [ActionStyle.mixin], { input: undefined, h })
  return h.button(action.button.attrs([h.Type('button'), h.OnClick(onClick)]), [
    icon(h, paths),
    label,
  ])
}

/**
 * A theme's accent over its page, in a light scheme, for a preset's swatch:
 * the page's grey is as much of Windows 95 as its navy.
 */
const swatchOf = (knobs: Preset['knobs']) => {
  const neutral = knobs.base === 'accent' ? knobs.hue : bases[knobs.base].h
  const accent = `oklch(${knobs.lightness}% ${knobs.chroma} ${knobs.hue})`
  const page = `oklch(${knobs.surfaceLightness}% ${knobs.surfaceSaturation * 2} ${neutral})`
  return `linear-gradient(135deg, ${accent} 50%, ${page} 50%)`
}

const slider = (model: Model, slots: Slots, knob: Knob, h: H): Html => {
  const range = rangeOf(knob)
  const format = (value: number) => `${value}${range.unit}`
  return h.div(slots.knob.attrs(), [
    h.div(slots.knobHead.attrs(), [
      hint(model, h, knob, range.label),
      h.span(slots.knobValue.attrs([h.AriaHidden(true)]), [format(model.knobs[knob])]),
    ]),
    Slider.view(
      {
        id: `knob-${knob}`,
        label: range.label,
        value: model.knobs[knob],
        onChange: value => Message.MovedKnob({ knob, value }),
        min: range.min,
        max: range.max,
        step: range.step,
        format,
        style: SliderStyle,
      },
      h,
    ),
  ])
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
                  ? [h.div(tip.layer, [h.div(tip.panel, [h.span(tip.arrow, []), hints[which]])])]
                  : []),
              ],
            ),
          ),
        },
        toParentMessage: message => Message.GotHint({ hint: which, message }),
      }),
  })

const hints: Readonly<Record<Hint, string>> = {
  hue: 'The accent’s place on the color wheel, in degrees: about 25 is red, 145 green, 264 blue. Buttons, links, focus rings and selections take it.',
  chroma: 'How vivid the accent is. 0 is grey; around 0.2 is as vivid as most screens show.',
  lightness: 'How light the accent is in the light scheme.',
  surfaceSaturation:
    'How much the page, cards and borders lean toward the base color. 0 is pure grey.',
  surfaceLightness:
    'How light the page is in the light scheme. Cards, fields and hovers step from it.',
  surfaceLightnessDark:
    'How light the page is in the dark scheme. Cards, fields and hovers step from it.',
  surfaceContrast:
    'How far apart the surface steps are: the page, a card on it, a field, a hover. Low is flat; high sets each apart.',
  radius:
    'Multiplies every corner. 0 is square. A control inside a card keeps inside the card’s corner.',
  density: 'Multiplies spacing: padding, gaps and margins. Below 1 is tighter, above 1 roomier.',
  scaleChroma:
    'How vivid the seven color scales are (red to purple, on the Palette tab), as a share of each step’s own. 0 turns them grey.',
  border: 'The thinnest border’s width; the thicker ones step up from it.',
  shadow: 'How strong shadows are. 0 removes them.',
  motion: 'Multiplies how long every transition takes. 0 stills them; 2 is twice as slow.',
  textScale: 'Multiplies every text size, headings and body alike.',
  headingScale: 'How far headings stand above body text: below 1 nearer its size, above 1 larger.',
  leading: 'Multiplies line height, the space each line of text takes.',
  headingWeight: 'How bold headings are, from 300 (light) to 900 (black).',
  tracking:
    'Headings’ letter spacing, in em: negative draws letters together, positive spreads them.',
  base: 'The hue the neutrals are mixed from: the page, text and borders. Accent takes the accent’s own; the others are shadcn’s base colors.',
  font: 'The typeface for body text and controls.',
  headingFont: 'The typeface for headings. Body uses the body’s font.',
  menuColor:
    'The background of menus and popovers: the page’s, inverted (dark on a light page), or translucent, the page blurred behind it.',
  hover:
    'What a hovered row or button is tinted with: a step of the surface, a plain grey, or the accent.',
  menuAccent: 'How the highlighted row of a menu shows: a subtle tint, or filled with the accent.',
  size: 'How tall controls are: 36px, or a compact 28px.',
  controlShape: 'The corners of buttons: the radius’s, or fully round pills.',
  outlines:
    'How much borders show: the palette’s soft lines, darker ones, or lines in the text’s own ink.',
  shadowStyle: 'Shadows that diffuse softly, or hard, solid offset copies.',
  relief:
    'How buttons stand off the page and fields sink into it: flat, or a soft, hard or bevelled edge.',
  easing: 'How transitions move: along an easing curve, or on a spring that settles.',
  theme: 'Whole themes, setting every knob at once. Hover one to read about it.',
  look: 'The shape and type of a style, leaving the colors as they are.',
}

/** Labels for a choice's values, as words. */
const words = <A extends string>(values: ReadonlyArray<A>, label: (value: A) => string = capital) =>
  values.map(value => ({ value, label: label(value) }))
const capital = (value: string) => value[0]!.toUpperCase() + value.slice(1).replaceAll('-', ' ')

/** Knobs with some changed, as a whole set `ChosePreset` installs. */
const choose = (model: Model, change: Partial<Knobs>) =>
  Message.ChosePreset({ knobs: { ...model.knobs, ...change } })

/** A few values in a row, one pressed: `name` shows above, and names the group. */
const row = <A extends string>(
  model: Model,
  slots: Slots,
  h: H,
  which: Hint,
  name: string,
  options: ReadonlyArray<{ readonly value: A; readonly label: string }>,
  current: A,
  toMessage: (value: A) => Message,
): Html =>
  h.div(slots.knob.attrs(), [
    hint(model, h, which, name),
    Segmented.view(
      {
        label: name,
        options,
        pressed: [current],
        onPress: toMessage,
        style: SegmentedStyle,
        mixins: Segmented.fluid,
      },
      h,
    ),
  ])

/** Many values in a Select over Listbox, labelled by `name`. */
const picker = <A extends string>(
  model: Model,
  slots: Slots,
  h: H,
  which: Picker,
  name: string,
  options: ReadonlyArray<{ readonly value: A; readonly label: string }>,
  current: A,
): Html => {
  const part = Listbox.parts([PickerStyle.mixin], { h })
  const labelOf = new Map<string, string>(options.map(option => [option.value, option.label]))
  const listbox = model.pickers[which]
  return h.div(slots.knob.attrs(), [
    hint(model, h, which, name),
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

/** Buttons that each install a set of knobs, pressed while the knobs are its own. */
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
    chips(model, slots, h, 'theme', 'Theme', presets, preset => {
      const knobs = presetKnobs(preset, model.knobs.direction)
      return {
        label: [
          h.span(
            slots.swatch.attrs([
              h.AriaHidden(true),
              h.Style({ background: swatchOf(preset.knobs) }),
            ]),
            [],
          ),
          preset.name,
        ],
        title: preset.description,
        pressed: sameKnobs(model.knobs, knobs),
        message: Message.ChoseTheme({ name: preset.name }),
      }
    }),
    chips(model, slots, h, 'look', 'Style, keeping the colors', looks, look => ({
      label: [look.name],
      title: look.description,
      pressed: inLook(model.knobs, look),
      message: choose(model, look.shape),
    })),
    h.div(slots.actions.attrs(), [
      h.button(
        action.button.attrs([
          h.Type('button'),
          h.OnClick(
            Message.ChosePreset({ knobs: { ...defaults, direction: model.knobs.direction } }),
          ),
        ]),
        ['Reset'],
      ),
      h.button(
        SlotView.buildersFor(ButtonSlots, [PrimaryStyle.mixin], {
          input: undefined,
          h,
        }).button.attrs([h.Type('button'), h.OnClick(Message.PressedShuffle())]),
        [icon(h, SHUFFLE), 'Shuffle'],
      ),
    ]),
  ]
}

const colorPane = (model: Model, slots: Slots, h: H): ReadonlyArray<Html> => [
  slider(model, slots, 'hue', h),
  slider(model, slots, 'chroma', h),
  slider(model, slots, 'lightness', h),
  picker(model, slots, h, 'base', 'Base color', words(Base.literals), model.knobs.base),
  slider(model, slots, 'surfaceSaturation', h),
  slider(model, slots, 'surfaceLightness', h),
  slider(model, slots, 'surfaceLightnessDark', h),
  slider(model, slots, 'surfaceContrast', h),
  slider(model, slots, 'scaleChroma', h),
  row(model, slots, h, 'hover', 'Hover', words(Hover.literals), model.knobs.hover, hover =>
    choose(model, { hover }),
  ),
  row(
    model,
    slots,
    h,
    'menuAccent',
    'Menu accent',
    words(MenuAccent.literals),
    model.knobs.menuAccent,
    menuAccent => choose(model, { menuAccent }),
  ),
  picker(
    model,
    slots,
    h,
    'menuColor',
    'Menu color',
    words(MenuColor.literals),
    model.knobs.menuColor,
  ),
]

const shapePane = (model: Model, slots: Slots, h: H): ReadonlyArray<Html> => [
  slider(model, slots, 'radius', h),
  slider(model, slots, 'density', h),
  row(model, slots, h, 'size', 'Size', words(Size.literals), model.knobs.size, size =>
    choose(model, { size }),
  ),
  row(
    model,
    slots,
    h,
    'controlShape',
    'Buttons',
    words(ControlShape.literals),
    model.knobs.controlShape,
    controlShape => choose(model, { controlShape }),
  ),
  slider(model, slots, 'border', h),
  row(
    model,
    slots,
    h,
    'outlines',
    'Outlines',
    words(Outlines.literals),
    model.knobs.outlines,
    outlines => choose(model, { outlines }),
  ),
  slider(model, slots, 'shadow', h),
  row(
    model,
    slots,
    h,
    'shadowStyle',
    'Shadows',
    words(ShadowStyle.literals),
    model.knobs.shadowStyle,
    shadowStyle => choose(model, { shadowStyle }),
  ),
  row(model, slots, h, 'relief', 'Controls', words(Relief.literals), model.knobs.relief, relief =>
    choose(model, { relief }),
  ),
]

const typePane = (model: Model, slots: Slots, h: H): ReadonlyArray<Html> => [
  picker(
    model,
    slots,
    h,
    'font',
    'Font',
    words(Font.literals, font => fontLabels[font]),
    model.knobs.font,
  ),
  picker(
    model,
    slots,
    h,
    'headingFont',
    'Heading font',
    words(HeadingFont.literals, font => (font === 'inherit' ? 'Body' : fontLabels[font])),
    model.knobs.headingFont,
  ),
  slider(model, slots, 'textScale', h),
  slider(model, slots, 'headingScale', h),
  slider(model, slots, 'headingWeight', h),
  slider(model, slots, 'tracking', h),
  slider(model, slots, 'leading', h),
]

const motionPane = (model: Model, slots: Slots, h: H): ReadonlyArray<Html> => [
  slider(model, slots, 'motion', h),
  row(model, slots, h, 'easing', 'Easing', words(Easing.literals), model.knobs.easing, easing =>
    choose(model, { easing, ...(model.knobs.motion === 0 ? { motion: 1 } : {}) }),
  ),
]

const panes: Readonly<Record<Section, (model: Model, slots: Slots, h: H) => ReadonlyArray<Html>>> =
  {
    theme: themesPane,
    color: colorPane,
    shape: shapePane,
    type: typePane,
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
      bar('Preview direction', directions, model.knobs.direction, direction =>
        Message.ChoseDirection({ direction }),
      ),
      h.div(slots.previewActions.attrs(), [
        h.a(slots.toCode.attrs([h.Href(`#${CODE_ID}`)]), ['Get the code:']),
        // The theme as the application's style module, or a link back to these knobs.
        iconButton(
          h,
          model.copied ? CHECK : COPY,
          model.copied ? 'Copied' : 'Copy theme',
          Message.PressedCopy({ text: codeOf(model.knobs) }),
        ),
        iconButton(
          h,
          model.linkCopied ? CHECK : LINK,
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
  const code = codeOf(model.knobs)
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
