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

const description = component(Style.self({ color: ref.text.muted, ...role('body'), margin: '0' }))

/**
 * The row `Checkbox.view` and `Switch.view` draw: the control, then the
 * words. The control sits on the label's first line, the words take what is
 * left, and `position: end` reverses the row so the control is at the far
 * end, as a settings list has it. The root's marks are written by the view.
 */
const row = {
  root: component(
    Style.self({
      position: 'relative',
      display: 'flex',
      alignItems: 'flex-start',
      gap: ladder('gap'),
    }),
    Style.states({ end: { flexDirection: 'row-reverse' } }, 'data-position'),
  ),
  text: component(
    Style.self({ display: 'flex', flexDirection: 'column', flex: '1', minInlineSize: '0' }),
    // The words dim with the control.
    Style.nest(':where([data-disabled="true"]) > &', { opacity: ref.knob['state-disabled'] }),
  ),
  heading: component(
    Style.self({ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: ladder('gap') }),
  ),
  aside: component(Style.self({ display: 'inline-flex', alignItems: 'center' })),
}

/** The control on the label's first line: `1lh` is the label's leading, from the body role. */
const onFirstLine = (edgeLength: string) =>
  Style.nest(':where([data-position]) > &', {
    ...role('body'),
    marginBlockStart: `calc((1lh - ${edgeLength}) / 2)`,
  })

/**
 * `variant: card` boxes the row and fills it while chosen. The label is
 * stretched over the card, so a press anywhere on it is the label's own
 * click; the aside stays above it, where a Tooltip or a link can be pressed.
 */
const card = {
  root: variant(
    Style.self({
      // Cards of a list are one width: their words alone would make each its own.
      minInlineSize: ref.width['column-lg'],
      padding: ladder('row-pad'),
      border: `${ref.border.thin} solid ${ref.outline.subtle}`,
      borderRadius: ref.radius.lg,
      background: ref.surface.base,
      ...transition('background-color, border-color'),
    }),
    Style.pseudo(':hover:not([data-disabled="true"])', { borderColor: ref.outline.overt }),
    Style.pseudo('[data-checked="true"]', {
      borderColor: ref.accent.default,
      background: ref.accent.subtle,
    }),
    Style.pseudo('[data-invalid="true"]', { borderColor: ref.error.outline }),
  ),
  label: variant(
    Style.pseudo('::after', {
      content: '""',
      position: 'absolute',
      inset: '0',
      borderRadius: 'inherit',
    }),
  ),
  aside: variant(Style.self({ position: 'relative' })),
}

const looks = { plain: { root: variant(Style.self({})) }, card }

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
    ...row,
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
        boxShadow: ref.shadow.field,
        cursor: 'pointer',
        ...transition('background-color, border-color'),
      }),
      Style.pseudo(`:is(${checked}, [aria-checked="mixed"])`, {
        background: toneVar('fill'),
        borderColor: toneVar('fill'),
      }),
      // A check: two borders of a box, rotated; a dash when mixed. Placed
      // physically, as its sides are, so right to left draws the same check
      // in the same place. Turned, the box's ink spans 0.311 of the edge to
      // either side of its center, 0.311 below it and 0.085 above, plus 0.707
      // of the stroke: so the box sits 0.113 of the edge less 0.354 of the
      // stroke above center, and the ink's middle lands on the control's at
      // every size. The mark is always drawn,
      // clipped away until checked, so checking wipes it on over the fast
      // tier; the wipe travels, so reduced motion shows the mark at once.
      Style.pseudo('::after', {
        content: '""',
        position: 'absolute',
        top: `calc(10.7% + ${ref.border.glyph} * 0.354)`,
        // physical: a drawn check mark
        left: '34%',
        inlineSize: '32%',
        blockSize: '56%',
        ...cornerSides(ref.border.glyph, toneVar('on-fill')),
        rotate: '45deg',
        clipPath: 'inset(0 100% 100% 0)',
        transitionProperty: 'clip-path',
        transitionDuration: travelled(ref.motion.fast),
        transitionTimingFunction: ref.motion.ease,
      }),
      Style.pseudo(`${checked}::after`, { clipPath: 'inset(0 0 0 0)' }),
      // After the checked rule, which sets the same border: an invalid box keeps its fill and shows the error edge.
      Style.pseudo('[aria-invalid="true"]', { borderColor: ref.error.outline }),
      // The check's box lives on every `::after` so it can wipe in. A dash
      // clears that box, or it inherits the check's size, borders and turn.
      Style.pseudo('[aria-checked="mixed"]::after', {
        content: '""',
        position: 'absolute',
        // The check's stroke, on the middle: a share of the box was 1.4px at
        // 16px, thinner than the check and blurred off its pixel rows.
        top: `calc(50% - ${ref.border.glyph} / 2)`,
        // physical: a drawn check mark
        right: '22%',
        left: '22%',
        inlineSize: 'auto',
        blockSize: ref.border.glyph,
        border: '0',
        rotate: 'none',
        clipPath: 'inset(0 0 0 0)',
        background: toneVar('on-fill'),
      }),
      onFirstLine(edge),
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
      danger: { checkbox: tones.danger },
    },
    size: { sm: { checkbox: sizes.sm }, md: { checkbox: sizes.md }, lg: { checkbox: sizes.lg } },
    variant: looks,
    shape: {
      square: { checkbox: variant(Style.self({})) },
      round: { checkbox: variant(Style.self({ borderRadius: ref.radius.full })) },
    },
  },
  defaults: { tone: 'accent', variant: 'plain', shape: 'square' },
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
    ...row,
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
      // The track has no edge to recolour, so an invalid one is ringed.
      Style.pseudo('[aria-invalid="true"]', {
        boxShadow: `0 0 0 ${ref.border.thin} ${ref.error.outline}`,
      }),
      // `translate` is physical while the thumb starts at the inline start:
      // right to left it starts on the right and moves left.
      Style.nest(`&${checked}:dir(rtl)::before`, {
        translate: `calc(-1 * (${rail} * 0.7 - ${stretch})) 0`,
      }),
      // Dragged (`Switch.draggable`), the thumb follows the pointer at once,
      // from the drag's own place, whichever side it began on or the direction.
      Style.nest('&[data-dragging]:is(:dir(ltr), :dir(rtl))::before', {
        translate: 'var(--_fk-switch-drag, 0px) 0',
        transitionDuration: '0s',
      }),
      onFirstLine(rail),
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
      danger: { button: tones.danger },
    },
    size: { sm: { button: sizes.sm }, md: { button: sizes.md }, lg: { button: sizes.lg } },
    variant: looks,
  },
  defaults: { tone: 'accent', variant: 'plain' },
})
