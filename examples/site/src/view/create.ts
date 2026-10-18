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
import { Listbox as UiListbox } from '@foldkit/ui'
import { Option } from 'effect'
import type { Html } from 'foldkit/html'
import { SlotView, Style } from 'foldkit-mixins'
import {
  ButtonSlots,
  CodeBlock,
  Listbox,
  ListboxSlots,
  Recipes,
  Segmented,
  SegmentedSlots,
  Slider,
  SliderSlots,
  Tabs,
  TabsSlots,
} from 'foldkit-mixins-ui'

import { showcaseOf, type Selection } from '../gallery/showcases.js'
import { PickerBox, SectionTabs, pickerId, type Picker } from '../gallery/studio.js'
import {
  Base,
  Easing,
  Font,
  HeadingFont,
  Hover,
  MenuAccent,
  MenuColor,
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
import { CodeStyle } from '../style.js'
import { liveOf, preview } from './components.js'
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

const PANES_ID = 'theme-panes'
const CODE_ID = 'theme-code'

// The controls' own looks, compact to fit a column; they read the site's tokens.
const TabsStyle = Style.forSlots(TabsSlots)(Recipes.Tabs({ variant: 'pill', size: 'sm' }))
const SliderStyle = Style.forSlots(SliderSlots)(Recipes.Slider({ size: 'sm', value: 'end' }))
const SegmentedStyle = Style.forSlots(SegmentedSlots)(
  Recipes.Segmented({ size: 'sm', width: 'fill' }),
)
const PickerStyle = Style.forSlots(ListboxSlots)(Recipes.Listbox({ size: 'sm', width: 'trigger' }))
const ChoiceStyle = Style.forSlots(ButtonSlots)(
  Recipes.Button({ tone: 'neutral', variant: 'outline', size: 'sm' }),
)
const BarStyle = Style.forSlots(SegmentedSlots)(Recipes.Segmented({ size: 'sm' }))
const ActionStyle = Style.forSlots(ButtonSlots)(
  Recipes.Button({ tone: 'neutral', variant: 'ghost', size: 'sm' }),
)

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

const slider = (model: Model, knob: Knob, h: H): Html => {
  const range = rangeOf(knob)
  return Slider.view(
    {
      id: `knob-${knob}`,
      label: range.label,
      value: model.knobs[knob],
      onChange: value => Message.MovedKnob({ knob, value }),
      min: range.min,
      max: range.max,
      step: range.step,
      format: value => `${value}${range.unit}`,
      showValue: true,
      style: SliderStyle,
    },
    h,
  )
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
  slots: Slots,
  h: H,
  name: string,
  options: ReadonlyArray<{ readonly value: A; readonly label: string }>,
  current: A,
  toMessage: (value: A) => Message,
): Html =>
  h.div(slots.knob.attrs(), [
    h.span(slots.axisName.attrs([h.AriaHidden(true)]), [name]),
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
    h.label(slots.axisName.attrs([h.Attribute('for', UiListbox.buttonId(pickerId(which)))]), [
      name,
    ]),
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
  slots: Slots,
  h: H,
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
    h.legend(slots.axisName.attrs(), [name]),
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
    chips(slots, h, 'Theme', presets, preset => {
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
        message: Message.ChosePreset({ knobs }),
      }
    }),
    chips(slots, h, 'Style, keeping the colors', looks, look => ({
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
      h.button(action.button.attrs([h.Type('button'), h.OnClick(Message.PressedShuffle())]), [
        'Shuffle',
      ]),
    ]),
  ]
}

const colorPane = (model: Model, slots: Slots, h: H): ReadonlyArray<Html> => [
  slider(model, 'hue', h),
  slider(model, 'chroma', h),
  slider(model, 'lightness', h),
  picker(model, slots, h, 'base', 'Base color', words(Base.literals), model.knobs.base),
  slider(model, 'surfaceSaturation', h),
  slider(model, 'surfaceLightness', h),
  slider(model, 'surfaceContrast', h),
  row(slots, h, 'Hover', words(Hover.literals), model.knobs.hover, hover =>
    choose(model, { hover }),
  ),
  row(slots, h, 'Menu accent', words(MenuAccent.literals), model.knobs.menuAccent, menuAccent =>
    choose(model, { menuAccent }),
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
  slider(model, 'radius', h),
  slider(model, 'density', h),
  row(slots, h, 'Size', words(Size.literals), model.knobs.size, size => choose(model, { size })),
  slider(model, 'border', h),
  slider(model, 'shadow', h),
  row(slots, h, 'Shadows', words(ShadowStyle.literals), model.knobs.shadowStyle, shadowStyle =>
    choose(model, { shadowStyle }),
  ),
  row(slots, h, 'Controls', words(Relief.literals), model.knobs.relief, relief =>
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
]

const motionPane = (model: Model, slots: Slots, h: H): ReadonlyArray<Html> => [
  slider(model, 'motion', h),
  row(slots, h, 'Easing', words(Easing.literals), model.knobs.easing, easing =>
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
const sections = (model: Model, slots: Slots, h: H): Html =>
  h.submodel({
    slotId: model.sectionTabs.id,
    model: model.sectionTabs,
    view: SectionTabs.view,
    viewInputs: {
      tabs: Section.literals,
      selectedValue: model.section,
      ariaLabel: 'Knobs',
      toView: Tabs.toView<Section, Message>(
        [TabsStyle.mixin, ...Tabs.fluid],
        { h },
        ({ tablist, indicator, highlight, label, tabs, activeIndex }) =>
          h.div(slots.sections.attrs(), [
            h.div(tablist, [
              h.div(indicator),
              h.div(highlight),
              ...tabs.map(tab => h.button(tab.tab, [h.span(label, [sectionLabels[tab.value]])])),
            ]),
            h.div(
              slots.panes.attrs([h.Id(PANES_ID)]),
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
  h.aside(
    slots.knobs.attrs([h.AriaLabel('Theme'), h.DataAttribute('open', String(model.drawerOpen))]),
    [
      // Drawn only where the knobs are a drawer.
      h.button(
        slots.drawerHandle.attrs([
          h.Type('button'),
          h.AriaExpanded(model.drawerOpen),
          h.AriaControls(PANES_ID),
          h.OnClick(Message.ToggledDrawer()),
        ]),
        [model.drawerOpen ? 'Hide the knobs' : 'Show the knobs'],
      ),
      sections(model, slots, h),
    ],
  )

const schemes = words(['system', 'light', 'dark'] as const)
const directions = words(['ltr', 'rtl'] as const, direction => direction.toUpperCase())

const canvas = (model: Model, slots: Slots, h: H): Html => {
  const live = liveOf(model, h)
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
      h.a(slots.toCode.attrs([h.Href(`#${CODE_ID}`)]), ['Get the code']),
    ]),
    preview(
      model,
      'canvas',
      slots,
      h,
      tiles.flatMap(({ slug, selection }) =>
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
      ),
    ),
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
            language: 'ts',
            copy: { onCopy: text => Message.PressedCopy({ text }), copied: model.copied },
            style: CodeStyle,
          },
          h,
        ),
      ]),
    ]),
  ]
}
