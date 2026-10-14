/**
 * `/create`: the theme's knobs beside every component drawn in them, and the
 * theme module they make. Each knob is a CSS variable set on the preview, so
 * moving one re-derives the theme in the browser; the code below it is the
 * same knobs written as an application's `AppStyle.make`.
 */
import { Option } from 'effect'
import type { Html } from 'foldkit/html'
import { CodeBlock } from 'foldkit-mixins-ui'

import { showcaseOf, type Selection } from '../gallery/showcases.js'
import {
  Base,
  Direction,
  Easing,
  Font,
  HeadingFont,
  MenuAccent,
  MenuColor,
  Size,
  bases,
  codeOf,
  fontLabels,
  inLook,
  looks,
  presets,
  ranges,
  sameKnobs,
  type Knobs,
  type Range,
} from '../gallery/theme.js'
import { COMPONENTS } from '../library.js'
import { Message, type Model } from '../main.js'
import { CodeStyle } from '../style.js'
import { choices, liveOf, preview, schemeChoice } from './components.js'
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

/** The accent a set of knobs makes, in a light scheme, for a preset's dot. */
const accentOf = (knobs: Knobs) => `oklch(${knobs.lightness}% ${knobs.chroma} ${knobs.hue})`

const slider = (model: Model, range: Range, slots: Slots, h: H): Html => {
  const id = `knob-${range.knob}`
  const value = model.knobs[range.knob]
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
        h.OnInput(moved => Message.MovedKnob({ knob: range.knob, value: Number(moved) })),
      ]),
    ),
  ])
}

/** Labels for a choice's values, as words. */
const words = <A extends string>(values: ReadonlyArray<A>, label: (value: A) => string = capital) =>
  values.map(value => ({ value, label: label(value) }))
const capital = (value: string) => value[0]!.toUpperCase() + value.slice(1).replaceAll('-', ' ')

/** Knobs with one choice changed, as a whole set `ChosePreset` installs. */
const choose = (model: Model, change: Partial<Knobs>) =>
  Message.ChosePreset({ knobs: { ...model.knobs, ...change } })

const shape = (model: Model, slots: Slots, h: H): ReadonlyArray<Html> => [
  h.fieldset(slots.axis.attrs(), [
    h.legend(slots.axisName.attrs(), ['style']),
    h.div(
      slots.presets.attrs(),
      looks.map(look =>
        h.button(
          slots.preset.attrs([
            h.Type('button'),
            h.AriaPressed(String(inLook(model.knobs, look))),
            h.Title(look.description),
            h.OnClick(choose(model, look.shape)),
          ]),
          [look.name],
        ),
      ),
    ),
  ]),
  choices(slots, h, 'base color', words(Base.literals), model.knobs.base, base =>
    choose(model, base === 'accent' ? { base } : { base, surfaceSaturation: bases[base].c }),
  ),
  choices(slots, h, 'menu accent', words(MenuAccent.literals), model.knobs.menuAccent, menuAccent =>
    choose(model, { menuAccent }),
  ),
  choices(slots, h, 'menu color', words(MenuColor.literals), model.knobs.menuColor, menuColor =>
    choose(model, { menuColor }),
  ),
  choices(slots, h, 'size', words(Size.literals), model.knobs.size, size =>
    choose(model, { size }),
  ),
  choices(slots, h, 'motion', words(Easing.literals), model.knobs.easing, easing =>
    choose(model, { easing, ...(model.knobs.motion === 0 ? { motion: 1 } : {}) }),
  ),
  choices(
    slots,
    h,
    'heading font',
    words(HeadingFont.literals, font => (font === 'inherit' ? 'Body' : fontLabels[font])),
    model.knobs.headingFont,
    headingFont => choose(model, { headingFont }),
  ),
  choices(
    slots,
    h,
    'direction',
    words(Direction.literals, direction => direction.toUpperCase()),
    model.knobs.direction,
    direction => choose(model, { direction }),
  ),
]

const controls = (model: Model, slots: Slots, h: H): Html =>
  h.aside(slots.knobs.attrs([h.AriaLabel('Theme')]), [
    h.fieldset(slots.axis.attrs(), [
      h.legend(slots.axisName.attrs(), ['preset']),
      h.div(
        slots.presets.attrs(),
        presets.map(preset =>
          h.button(
            slots.preset.attrs([
              h.Type('button'),
              h.AriaPressed(String(sameKnobs(model.knobs, preset.knobs))),
              h.OnClick(Message.ChosePreset({ knobs: preset.knobs })),
            ]),
            [
              h.span(
                slots.swatch.attrs([
                  h.AriaHidden(true),
                  h.Style({ background: accentOf(preset.knobs) }),
                ]),
                [],
              ),
              preset.name,
            ],
          ),
        ),
      ),
    ]),
    schemeChoice(model, slots, h),
    ...ranges.map(range => slider(model, range, slots, h)),
    choices(
      slots,
      h,
      'font',
      Font.literals.map(font => ({ value: font, label: fontLabels[font] })),
      model.knobs.font,
      font => Message.ChoseFont({ font }),
    ),
    ...shape(model, slots, h),
  ])

const canvas = (model: Model, slots: Slots, h: H): Html => {
  const live = liveOf(model, h)
  return preview(
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
  )
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
        ' theme is a handful of knobs; every color, space, corner and shadow is a CSS expression over them. Turn one and the components below follow, then copy the theme into your application.',
      ]),
    ]),
    h.div(slots.studio.attrs(), [controls(model, slots, h), canvas(model, slots, h)]),
    h.section(slots.section.attrs([h.AriaLabelledBy('theme-code')]), [
      h.h2(slots.sectionTitle.attrs([h.Id('theme-code')]), ['Your theme']),
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
