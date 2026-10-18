/**
 * A button: `tone` picks the colors, `variant` how they are applied, `size`
 * its step on the size ladder (unset, it follows the region it sits in). Tone
 * and variant are independent because a tone only sets the private custom
 * properties the variants read — except `primary`, which is ink by
 * definition, and `icon`, a square one rung of the ladder on a side.
 */
import { Style, type Declarations, type StyleValue } from 'foldkit-mixins'
import { ButtonSlots } from '../button.js'
import {
  component,
  disabled,
  focusRing,
  hover,
  onLadder,
  ref,
  steps,
  tones,
  toneVar,
  transition,
  trimmed,
  unfilledHover,
  variant,
  controlHeight,
} from './design.js'

/**
 * Text on a button with no fill: the tone's ink, unless a container drawn in a
 * color of its own sets `--fk-ink` (as it sets `--fk-heading`), where the ink
 * would not read.
 */
const unfilledInk = `var(--fk-ink, ${toneVar('ink')})`

/**
 * A toggle button that is on (`aria-pressed="true"`), beside each variant
 * that sets the same properties, since a state in the base would lose to them.
 */
const on = (declarations: Declarations): StyleValue =>
  Style.pseudo('[aria-pressed="true"]', declarations)
const held = ':active:not([aria-disabled="true"], :disabled)'
/**
 * A toggle that is on, hovered and not held. The plain hover and held rules
 * are more specific than `on`, so each state of a toggle that is on needs a
 * rule of its own, or the hover's or the press's look replaces the fill.
 */
const onHovered = '[aria-pressed="true"]:hover:not(:active, [aria-disabled="true"], :disabled)'
const onHeld = '[aria-pressed="true"]:active:not([aria-disabled="true"], :disabled)'

/**
 * A button with a face of its own (solid, outline, primary) stands off the
 * page by the theme's relief, and is pressed into it while held or on. Flat
 * unless the theme gives its controls relief (`Theme.relief`); the unfilled
 * ghost and icon buttons stay flat, as text on the page does.
 */
const raised: ReadonlyArray<StyleValue> = [
  Style.self({ boxShadow: ref.shadow.raised }),
  Style.pseudo(`:is(${held}, [aria-pressed="true"])`, { boxShadow: ref.shadow.pressed }),
]

/**
 * On, an unfilled toggle is filled with its tone, as a solid button is, and
 * keeps a fill and the text on it when hovered (the tone's hover fill) and
 * when held (its active fill): the plain hover and held films would
 * otherwise lay a tint where the fill was, under text meant for the fill.
 */
const unfilledOn: ReadonlyArray<StyleValue> = [
  on({ background: toneVar('fill'), color: toneVar('on-fill') }),
  Style.pseudo(onHovered, { background: toneVar('fill-hover'), color: toneVar('on-fill') }),
  Style.pseudo(onHeld, { background: toneVar('fill-active'), color: toneVar('on-fill') }),
]

/** Held, an unfilled button is grounded in its tone's ink, faint, deeper than its hover. */
const unfilledActive = Style.pseudo(held, {
  background: `color-mix(in oklab, ${toneVar('ink')} 16%, transparent)`,
})

/**
 * A press that shrinks a fill by exactly 1px a side, as Fluid
 * Functionalism's: the fill stops at the padding box and the 1px border
 * carries its color, which a press clears, while the fill deepens to the
 * family's `active`. It presses on the fast tier and springs back on the
 * moderate one.
 */
const press = (fill: string, fillHover: string, fillActive: string): ReadonlyArray<StyleValue> => [
  Style.self({
    backgroundClip: 'padding-box',
    borderColor: fill,
    transitionDuration: ref.motion.moderate,
    transitionTimingFunction: ref.motion.settle,
  }),
  hover({ borderColor: fillHover }),
  Style.pseudo(held, {
    background: fillActive,
    borderColor: 'transparent',
    transitionDuration: ref.motion.fast,
  }),
]

export const Button = Style.recipeFor(ButtonSlots)({
  base: {
    button: component(
      Style.self({
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        ...onLadder,
        border: `${ref.border.thin} solid transparent`,
        borderRadius: ref.radius.control,
        font: 'inherit',
        fontWeight: ref.weight.medium,
        // A link drawn as a button (`Anchor`) is not underlined like one in running text.
        textDecoration: 'none',
        cursor: 'pointer',
        ...transition('background-color, border-color, color, scale, box-shadow'),
      }),
      // Held, every variant gives a little. The scale is the motion: reduced
      // motion zeroes `travel`, and the button holds its size.
      Style.pseudo(held, { scale: `calc(1 - 0.02 * ${ref.knob.travel})` }),
      focusRing,
      disabled,
    ),
  },
  variants: {
    tone: {
      accent: { button: tones.accent },
      neutral: { button: tones.neutral },
      danger: { button: tones.danger },
    },
    variant: {
      solid: {
        button: variant(
          Style.self({ background: toneVar('fill'), color: toneVar('on-fill') }),
          hover({ background: toneVar('fill-hover') }),
          ...press(toneVar('fill'), toneVar('fill-hover'), toneVar('fill-active')),
          ...raised,
          // On, a solid toggle rests on the active fill, and keeps it hovered:
          // the hover fill, a step from the resting one, read as off. Held,
          // the press applies.
          on({ background: toneVar('fill-active') }),
          Style.pseudo(onHovered, { background: toneVar('fill-active') }),
        ),
      },
      outline: {
        button: variant(
          Style.self({
            background: 'transparent',
            color: unfilledInk,
            borderColor: toneVar('line'),
          }),
          hover({ background: unfilledHover }),
          unfilledActive,
          ...unfilledOn,
          ...raised,
        ),
      },
      ghost: {
        button: variant(
          Style.self({ background: 'transparent', color: unfilledInk }),
          hover({ background: unfilledHover }),
          unfilledActive,
          ...unfilledOn,
        ),
      },
      /**
       * The main action, dark as the page's ink: tone-independent, so it reads
       * on any surface. Density still comes from `size`.
       */
      primary: {
        button: variant(
          Style.self({ background: ref.text.overt, color: ref.surface.base }),
          hover({
            background: `color-mix(in oklch, ${ref.text.overt} 85%, ${ref.surface.base})`,
          }),
          ...press(
            ref.text.overt,
            `color-mix(in oklch, ${ref.text.overt} 85%, ${ref.surface.base})`,
            `color-mix(in oklch, ${ref.text.overt} 72%, ${ref.surface.base})`,
          ),
          ...raised,
        ),
      },
      /**
       * An icon with no words beside it: a square that centers its glyph. The
       * words stay the accessible name; only the icon shows, so label it with
       * `aria-label` or visually-hidden text.
       */
      icon: {
        button: variant(
          Style.self({
            background: 'transparent',
            color: ref.text.muted,
            inlineSize: controlHeight,
            blockSize: controlHeight,
            padding: '0',
            fontSize: '0',
            // The words are hidden, not gone: a gap beside them pushed the icon off center.
            gap: '0',
          }),
          hover({ background: unfilledHover, color: ref.text.overt }),
          unfilledActive,
          ...unfilledOn,
        ),
      },
    },
    size: {
      sm: { button: steps.sm },
      md: { button: steps.md },
      lg: { button: steps.lg },
    },
  },
  defaults: { tone: 'accent', variant: 'solid' },
  compound: [
    {
      // A destructive primary action announces itself on focus too.
      when: { tone: 'danger', variant: 'solid' },
      style: {
        button: variant(Style.pseudo(':focus-visible', { outlineColor: ref.error.outline })),
      },
    },
    {
      // A small ghost button sits in dense toolbars: trim it to its label.
      when: { variant: 'ghost', size: 'sm' },
      style: { button: variant(Style.self({ paddingInline: ref.space['2xs'] })) },
    },
  ],
})
