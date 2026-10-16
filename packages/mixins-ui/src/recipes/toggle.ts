/**
 * Checkbox and Switch: controls whose state is `aria-checked`, which
 * `@foldkit/ui` writes, so the checked look needs no input condition. `tone`
 * is the checked fill; `size` the control's box. The check mark and the
 * switch thumb are pseudo-elements, so the view renders an empty control.
 */
import { Style } from 'foldkit-mixins'
import { ladder, role } from 'foldkit-mixins/theme'
import { CheckboxSlots } from '../checkbox.js'
import { SwitchSlots } from '../switch.js'
import {
  component,
  cornerSides,
  disabled,
  focusRing,
  hover,
  ref,
  toneVar,
  tones,
  transition,
  travelled,
  variant,
} from './design.js'

const checked = '[aria-checked="true"]'

const label = component(Style.self({ color: ref.text.default, ...role('body'), cursor: 'pointer' }))

const description = component(Style.self({ color: ref.text.muted, ...role('body') }))

/** The control's edge length; the check mark and the thumb scale from it. */
const box = (length: string) => variant(Style.self({ '--_fk-toggle-size': length }))

const sizes = {
  sm: box('0.875rem'),
  md: box('1rem'),
  lg: box('1.25rem'),
} as const

// With no size, the ladder's icon rung: 16px, 14px compact, as Fluid Functionalism's.
const edge = `var(--_fk-toggle-size, ${ladder('icon')})`

export const Checkbox = Style.recipeFor(CheckboxSlots)({
  base: {
    checkbox: component(
      Style.self({
        position: 'relative',
        display: 'inline-block',
        flexShrink: '0',
        inlineSize: edge,
        blockSize: edge,
        padding: '0',
        border: `${ref.border.thin} solid ${ref.outline.overt}`,
        borderRadius: ref.radius.sm,
        background: ref.surface.base,
        cursor: 'pointer',
        ...transition('background-color, border-color'),
      }),
      Style.pseudo(`:is(${checked}, [aria-checked="mixed"])`, {
        background: toneVar('fill'),
        borderColor: toneVar('fill'),
      }),
      // A check: two borders of a box, rotated; a dash when mixed. Placed
      // physically, as its sides are, so right to left draws the same check
      // in the same place. The box sits above center because the check's ink
      // gathers at its corner, below: 19.5% puts the ink's middle at the
      // box's (at 12% it stood a pixel high). The mark is always drawn,
      // clipped away until checked, so checking wipes it on over the fast
      // tier; the wipe travels, so reduced motion shows the mark at once.
      Style.pseudo('::after', {
        content: '""',
        position: 'absolute',
        top: '19.5%',
        left: '32%',
        inlineSize: '32%',
        blockSize: '56%',
        ...cornerSides(ref.border.thick, toneVar('on-fill')),
        rotate: '45deg',
        clipPath: 'inset(0 100% 100% 0)',
        transitionProperty: 'clip-path',
        transitionDuration: travelled(ref.motion.fast),
        transitionTimingFunction: ref.motion.ease,
      }),
      Style.pseudo(`${checked}::after`, { clipPath: 'inset(0 0 0 0)' }),
      // The check's box lives on every `::after` so it can wipe in. A dash
      // clears that box, or it inherits the check's size, borders and turn.
      Style.pseudo('[aria-checked="mixed"]::after', {
        content: '""',
        position: 'absolute',
        top: '45%',
        right: '20%',
        bottom: '45%',
        left: '20%',
        inlineSize: 'auto',
        blockSize: 'auto',
        border: '0',
        rotate: 'none',
        clipPath: 'inset(0 0 0 0)',
        background: toneVar('on-fill'),
      }),
      focusRing,
      disabled,
    ),
    label,
    description,
  },
  variants: {
    tone: {
      accent: { checkbox: tones.accent },
      // Checked in the page's ink: the neutral surface was a pale fill under a dark mark.
      neutral: { checkbox: tones.ink },
    },
    size: { sm: { checkbox: sizes.sm }, md: { checkbox: sizes.md }, lg: { checkbox: sizes.lg } },
  },
  defaults: { tone: 'accent' },
})

/**
 * The switch's height, a quarter over the toggle edge: 20px on a 34px track
 * with a 16px thumb by default, as Fluid Functionalism's. `stretch` is what
 * the thumb grows by while hovered, into a pill.
 */
const rail = `calc(${edge} * 1.25)`
const stretch = 'var(--_fk-switch-stretch, 0px)'

export const Switch = Style.recipeFor(SwitchSlots)({
  base: {
    button: component(
      Style.self({
        position: 'relative',
        display: 'inline-block',
        flexShrink: '0',
        inlineSize: `calc(${rail} * 1.7)`,
        blockSize: rail,
        padding: '0',
        border: '0',
        borderRadius: ref.radius.full,
        background: ref.outline.overt,
        cursor: 'pointer',
        ...transition('background-color'),
      }),
      Style.pseudo('::before', {
        content: '""',
        position: 'absolute',
        insetBlockStart: '2px',
        insetInlineStart: '2px',
        inlineSize: `calc(${rail} - 4px + ${stretch})`,
        blockSize: `calc(${rail} - 4px)`,
        borderRadius: ref.radius.full,
        background: ref.surface.base,
        transitionProperty: 'translate, inline-size',
        transitionDuration: `${travelled(ref.motion.moderate)}, ${travelled(ref.motion.moderate)}`,
        transitionTimingFunction: ref.motion.settle,
      }),
      // Hovered, the thumb stretches into a pill, as if leaning to go.
      hover({ '--_fk-switch-stretch': '2px' }),
      Style.pseudo(checked, { background: toneVar('fill') }),
      // On, it sits at the far end, and a stretch grows back from that end.
      Style.pseudo(`${checked}::before`, { translate: `calc(${rail} * 0.7 - ${stretch}) 0` }),
      // `translate` is physical while the thumb starts at the inline start:
      // right to left it starts on the right and moves left.
      Style.nest(`&${checked}:dir(rtl)::before`, {
        translate: `calc(-1 * (${rail} * 0.7 - ${stretch})) 0`,
      }),
      focusRing,
      disabled,
    ),
    label,
    description,
  },
  variants: {
    tone: {
      accent: { button: tones.accent },
      // On in the page's ink: the neutral surface was paler on than off.
      neutral: { button: tones.ink },
    },
    size: { sm: { button: sizes.sm }, md: { button: sizes.md }, lg: { button: sizes.lg } },
  },
  defaults: { tone: 'accent' },
})
