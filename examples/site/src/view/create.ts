/**
 * `/create`: the theme's knobs beside every component drawn in them, and the
 * theme module they make. Each knob is a CSS variable set on the preview, so
 * moving one re-derives the theme in the browser; the code below it is the
 * same knobs written as an application's `AppStyle.make`.
 *
 * The knobs sit in panes. Beside the preview they are a column of their own;
 * on a narrower screen they are a drawer held to the bottom of the screen,
 * over the preview rather than above it, so a knob turned shows its effect
 * without a scroll. The drawer is not modal: the preview stays live under it.
 */
import { Option } from 'effect'
import type { Html } from 'foldkit/html'
import { CodeBlock } from 'foldkit-mixins-ui'

import { showcaseOf, type Selection } from '../gallery/showcases.js'
import {
  Base,
  Easing,
  Font,
  HeadingFont,
  Hover,
  MenuAccent,
  MenuColor,
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
import { choices, directionChoice, liveOf, preview, schemeChoice } from './components.js'
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

const slider = (model: Model, knob: Knob, slots: Slots, h: H): Html => {
  const range = rangeOf(knob)
  const id = `knob-${knob}`
  const value = model.knobs[knob]
  return h.div(slots.knob.attrs(), [
    h.div(slots.knobHead.attrs(), [
      h.label([h.Attribute('for', id)], [range.label]),
      h.span(slots.knobValue.attrs(), [`${value}${range.unit}`]),
    ]),
    h.input(
      slots.slider.attrs([
        h.Id(id),
        h.Type('range'),
        h.Attribute('min', String(range.min)),
        h.Attribute('max', String(range.max)),
        h.Attribute('step', String(range.step)),
        h.Value(String(value)),
        h.OnInput(moved => Message.MovedKnob({ knob, value: Number(moved) })),
      ]),
    ),
  ])
}

/** Labels for a choice's values, as words. */
const words = <A extends string>(values: ReadonlyArray<A>, label: (value: A) => string = capital) =>
  values.map(value => ({ value, label: label(value) }))
const capital = (value: string) => value[0]!.toUpperCase() + value.slice(1).replaceAll('-', ' ')

/** Knobs with some changed, as a whole set `ChosePreset` installs. */
const choose = (model: Model, change: Partial<Knobs>) =>
  Message.ChosePreset({ knobs: { ...model.knobs, ...change } })

/** A row of buttons, each pressed while the knobs are its own. */
const buttons = <A>(
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
): Html =>
  h.fieldset(slots.axis.attrs(), [
    h.legend(slots.axisName.attrs(), [name]),
    h.div(
      slots.presets.attrs(),
      items.map(value => {
        const { label, title, pressed, message } = item(value)
        return h.button(
          slots.preset.attrs([
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

const themesPane = (model: Model, slots: Slots, h: H): ReadonlyArray<Html> => [
  buttons(slots, h, 'theme', presets, preset => {
    const knobs = presetKnobs(preset, model.knobs.direction)
    return {
      label: [
        h.span(
          slots.swatch.attrs([h.AriaHidden(true), h.Style({ background: swatchOf(preset.knobs) })]),
          [],
        ),
        preset.name,
      ],
      title: preset.description,
      pressed: sameKnobs(model.knobs, knobs),
      message: Message.ChosePreset({ knobs }),
    }
  }),
  buttons(slots, h, 'style, keeping the colors', looks, look => ({
    label: [look.name],
    title: look.description,
    pressed: inLook(model.knobs, look),
    message: choose(model, look.shape),
  })),
  h.div(slots.actions.attrs(), [
    h.button(
      slots.preset.attrs([
        h.Type('button'),
        h.OnClick(
          Message.ChosePreset({ knobs: { ...defaults, direction: model.knobs.direction } }),
        ),
      ]),
      ['Reset'],
    ),
    h.button(slots.preset.attrs([h.Type('button'), h.OnClick(Message.PressedShuffle())]), [
      'Shuffle',
    ]),
  ]),
]

const colorPane = (model: Model, slots: Slots, h: H): ReadonlyArray<Html> => [
  slider(model, 'hue', slots, h),
  slider(model, 'chroma', slots, h),
  slider(model, 'lightness', slots, h),
  choices(slots, h, 'base color', words(Base.literals), model.knobs.base, base =>
    choose(model, base === 'accent' ? { base } : { base, surfaceSaturation: bases[base].c }),
  ),
  slider(model, 'surfaceSaturation', slots, h),
  slider(model, 'surfaceLightness', slots, h),
  slider(model, 'surfaceContrast', slots, h),
  choices(slots, h, 'hover', words(Hover.literals), model.knobs.hover, hover =>
    choose(model, { hover }),
  ),
  choices(slots, h, 'menu accent', words(MenuAccent.literals), model.knobs.menuAccent, menuAccent =>
    choose(model, { menuAccent }),
  ),
  choices(slots, h, 'menu color', words(MenuColor.literals), model.knobs.menuColor, menuColor =>
    choose(model, { menuColor }),
  ),
]

const shapePane = (model: Model, slots: Slots, h: H): ReadonlyArray<Html> => [
  slider(model, 'radius', slots, h),
  slider(model, 'density', slots, h),
  choices(slots, h, 'size', words(Size.literals), model.knobs.size, size =>
    choose(model, { size }),
  ),
  slider(model, 'border', slots, h),
  slider(model, 'shadow', slots, h),
  choices(
    slots,
    h,
    'shadow style',
    words(ShadowStyle.literals),
    model.knobs.shadowStyle,
    shadowStyle => choose(model, { shadowStyle }),
  ),
]

const typePane = (model: Model, slots: Slots, h: H): ReadonlyArray<Html> => [
  choices(
    slots,
    h,
    'font',
    words(Font.literals, font => fontLabels[font]),
    model.knobs.font,
    font => choose(model, { font }),
  ),
  choices(
    slots,
    h,
    'heading font',
    words(HeadingFont.literals, font => (font === 'inherit' ? 'Body' : fontLabels[font])),
    model.knobs.headingFont,
    headingFont => choose(model, { headingFont }),
  ),
]

const motionPane = (model: Model, slots: Slots, h: H): ReadonlyArray<Html> => [
  slider(model, 'motion', slots, h),
  choices(slots, h, 'easing', words(Easing.literals), model.knobs.easing, easing =>
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
      h.div(
        slots.sections.attrs([h.AriaLabel('Knobs')]),
        Section.literals.map(section =>
          h.button(
            slots.choice.attrs([
              h.Type('button'),
              h.AriaPressed(String(section === model.section)),
              h.AriaControls(PANES_ID),
              h.OnClick(Message.ChoseSection({ section })),
            ]),
            [sectionLabels[section]],
          ),
        ),
      ),
      h.div(slots.panes.attrs([h.Id(PANES_ID)]), panes[model.section](model, slots, h)),
    ],
  )

const canvas = (model: Model, slots: Slots, h: H): Html => {
  const live = liveOf(model, h)
  return h.div(slots.canvasColumn.attrs(), [
    h.div(slots.previewBar.attrs(), [
      schemeChoice(model, slots, h),
      directionChoice(model, slots, h),
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
