/**
 * Angle slider: a round dial on the size ladder, its ring filled in the
 * `tone` from the top round to the value (`track: 'ring'`), left unfilled
 * (`'plain'`), or a whole face with the needle alone showing the value
 * (`'disc'`). The thumb rides the ring at `--fk-angle`, placed by `sin()` and
 * `cos()` of it, and a needle runs to it from short of the value in the
 * middle, or from the center when the value is below; markers are dots
 * on the ring, filled where the arc covers them, with their words inside it.
 * The value sits in the middle (`value: 'inside'`) or under the dial
 * (`'below'`). The dial is a drawing, so it is placed by physical sides and
 * turns the same way right to left. `size` sets the dial's width from the
 * ladder's control height, so a compact region shrinks it.
 */
import { Style, type StyleValue } from 'foldkit-mixins'
import { ladder, role } from 'foldkit-mixins/theme'
import { AngleSliderSlots } from '../angleSlider.js'
import { component, focusRing, ref, tones, toneVar, variant } from './design.js'

const size = 'var(--_fk-angle-size)'
const thumb = 'var(--_fk-angle-thumb)'
const ring = 'var(--_fk-angle-ring)'
// The circle the thumb's center and the markers ride: the middle of the ring.
const radius = `calc(${size} / 2 - ${ring} / 2)`
const angle = 'var(--fk-angle)'

/** A box of edge `edge` centered on the ring at `degrees`. */
const onRing = (degrees: string, edge: string, inward = '0px') => ({
  position: 'absolute',
  left: `calc(50% + sin(${degrees}) * (${radius} - ${inward}) - ${edge} / 2)`,
  top: `calc(50% - cos(${degrees}) * (${radius} - ${inward}) - ${edge} / 2)`,
  inlineSize: edge,
  blockSize: edge,
})

const dial = (length: string): StyleValue =>
  variant(Style.self({ '--_fk-angle-size': `calc(${ladder('height')} * ${length})` }))

// The ring alone of a full disc: the inside of it cut away.
const ringMask = `radial-gradient(farthest-side, transparent calc(100% - ${ring}), #000 calc(100% - ${ring} + 0.5px))`

export const AngleSlider = Style.recipeFor(AngleSliderSlots)({
  base: {
    root: component(
      Style.self({
        display: 'inline-grid',
        justifyItems: 'center',
        gap: ref.space.xs,
        '--_fk-angle-size': `calc(${ladder('height')} * 3.5)`,
        '--_fk-angle-thumb': `calc(${ladder('icon')} * 1.25)`,
        '--_fk-angle-ring': `calc(${ladder('icon')} * 0.5)`,
        '--_fk-angle-track': ref.surface.muted,
        '--_fk-angle-paint': `conic-gradient(${toneVar('fill')} ${angle}, var(--_fk-angle-track) 0)`,
      }),
      Style.pseudo('[data-disabled]', { opacity: '0.5' }),
      Style.pseudo('[data-invalid]', { '--_fk-angle-track': ref.error.default }),
    ),
    label: component(
      Style.self({
        justifySelf: 'start',
        color: ref.text.overt,
        ...role('body'),
        fontWeight: ref.weight.medium,
      }),
    ),
    control: component(
      Style.self({
        position: 'relative',
        inlineSize: size,
        blockSize: size,
        borderRadius: ref.radius.full,
        touchAction: 'none',
        userSelect: 'none',
        cursor: 'pointer',
      }),
      Style.pseudo('::before', {
        content: '""',
        position: 'absolute',
        inset: '0',
        borderRadius: 'inherit',
        background: 'var(--_fk-angle-paint)',
        mask: ringMask,
      }),
      Style.nest('[data-dragging] &', { cursor: 'grabbing' }),
      Style.nest(':is([data-disabled], [data-readonly]) &', { cursor: 'default' }),
    ),
    needle: component(
      Style.self({
        position: 'absolute',
        left: `calc(50% - ${ref.border.thick} / 2)`,
        top: `calc(50% - ${radius})`,
        inlineSize: ref.border.thick,
        // From the ring inward, stopping short of the value in the middle so it never
        // crosses it: `em` here is the value's type, and 2em clears about seven figures.
        fontSize: role('title').fontSize,
        blockSize: `calc(${radius} - 2em)`,
        // The dial's center, wherever the needle stops.
        transformOrigin: `50% ${radius}`,
        rotate: angle,
        borderRadius: ref.radius.full,
        background: toneVar('fill'),
        pointerEvents: 'none',
      }),
    ),
    thumb: component(
      Style.self({
        ...onRing(angle, thumb),
        boxSizing: 'border-box',
        borderRadius: ref.radius.full,
        background: ref.surface.base,
        border: `${ref.border.thick} solid ${toneVar('fill')}`,
        boxShadow: ref.shadow.sm,
      }),
      focusRing,
    ),
    markers: component(Style.self({ position: 'absolute', inset: '0', pointerEvents: 'none' })),
    marker: component(
      Style.self({
        ...onRing('var(--fk-angle-marker)', `calc(${ring} * 0.5)`),
        borderRadius: ref.radius.full,
        background: ref.text.muted,
      }),
      Style.states(
        { under: { background: toneVar('on-fill') }, at: { background: toneVar('on-fill') } },
        'data-state',
      ),
    ),
    // Inside the ring, toward the center from its marker, its words centered there.
    markerLabel: component(
      Style.self({
        position: 'absolute',
        left: `calc(50% + sin(var(--fk-angle-marker)) * ${ring} * -2)`,
        top: `calc(50% - cos(var(--fk-angle-marker)) * ${ring} * -2)`,
        translate: '-50% -50%',
        whiteSpace: 'nowrap',
        color: ref.text.muted,
        ...role('micro'),
      }),
    ),
    value: component(
      Style.self({
        position: 'absolute',
        inset: '0',
        display: 'grid',
        placeItems: 'center',
        pointerEvents: 'none',
        color: ref.text.overt,
        ...role('title'),
        fontVariantNumeric: 'tabular-nums',
      }),
    ),
    input: component(Style.self({ display: 'none' })),
  },
  variants: {
    tone: {
      accent: { root: tones.accent },
      neutral: { root: tones.ink },
    },
    track: {
      ring: {},
      plain: { root: variant(Style.self({ '--_fk-angle-paint': 'var(--_fk-angle-track)' })) },
      disc: {
        root: variant(Style.self({ '--_fk-angle-paint': 'var(--_fk-angle-track)' })),
        control: variant(Style.pseudo('::before', { mask: 'none' })),
      },
    },
    value: {
      inside: {},
      // Below the dial, in the root's flow: out of the control, which keeps its square.
      below: {
        value: variant(
          Style.self({
            insetBlockStart: `calc(100% + ${ref.space['2xs']})`,
            insetBlockEnd: 'auto',
          }),
        ),
        // Nothing in the middle to clear: the needle runs to the center.
        needle: variant(Style.self({ blockSize: radius })),
        control: variant(
          Style.self({
            marginBlockEnd: `calc(${role('title').lineHeight} + ${ref.space['2xs']})`,
          }),
        ),
      },
    },
    size: {
      sm: { root: dial('2.5') },
      md: { root: dial('3.5') },
      lg: { root: dial('5') },
    },
  },
  defaults: { tone: 'accent', track: 'ring', value: 'inside' },
})
