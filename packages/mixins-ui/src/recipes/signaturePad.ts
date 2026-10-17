/**
 * Signature pad: a raised field to draw on, its strokes filled in the
 * overt text color, over a dashed line at `BASELINE` of its height with
 * "Sign here" above the line's start until something is signed. A typed name
 * sits on the same line in a script face, `--fk-signature-font` (default the
 * browser's `cursive`), which the PNG export reads back so both agree. Undo
 * and Clear are quiet buttons on the size ladder, and the typed field a
 * bordered input under them. `surface` picks the pad's ground, `size` its
 * height. The pad is a drawing, physical in either direction: its line
 * starts at the left.
 */
import { Style, type Declarations } from 'foldkit-mixins'
import { role } from 'foldkit-mixins/theme'
import { BASELINE, SignaturePadSlots } from '../signaturePad.js'
import {
  component,
  disabled,
  focusRing,
  hover,
  onLadder,
  ref,
  touchText,
  transition,
  unfilledHover,
  variant,
} from './design.js'

const line = `${(1 - BASELINE) * 100}%`

const quiet: Declarations = {
  ...onLadder,
  display: 'inline-flex',
  alignItems: 'center',
  boxSizing: 'border-box',
  border: `${ref.border.thin} solid ${ref.outline.default}`,
  borderRadius: ref.radius.md,
  background: 'transparent',
  color: ref.text.default,
  font: 'inherit',
  cursor: 'pointer',
  ...transition('background-color'),
}

export const SignaturePad = Style.recipeFor(SignaturePadSlots)({
  base: {
    root: component(
      Style.self({
        display: 'grid',
        gap: ref.space.sm,
        inlineSize: '100%',
        '--fk-signature-font': 'cursive',
        '--_fk-signature-height': '10rem',
      }),
      Style.pseudo('[data-disabled]', { opacity: '0.5' }),
    ),
    label: component(
      Style.self({ color: ref.text.overt, ...role('body'), fontWeight: ref.weight.medium }),
    ),
    control: component(
      Style.self({
        position: 'relative',
        overflow: 'hidden',
        blockSize: 'var(--_fk-signature-height)',
        boxSizing: 'border-box',
        border: `${ref.border.thin} solid ${ref.outline.default}`,
        borderRadius: ref.radius.md,
        background: ref.surface.base,
        color: ref.text.overt,
        // The pointer draws; it never scrolls or zooms the page.
        touchAction: 'none',
        userSelect: 'none',
        cursor: 'crosshair',
      }),
      Style.pseudo('[aria-disabled="true"]', { cursor: 'not-allowed' }),
    ),
    segments: component(
      Style.self({
        position: 'absolute',
        inset: '0',
        inlineSize: '100%',
        blockSize: '100%',
        fill: 'currentColor',
        pointerEvents: 'none',
      }),
    ),
    guide: component(
      Style.self({
        position: 'absolute',
        left: ref.space.lg,
        right: ref.space.lg,
        // Its top edge is the line, so the line is at the baseline itself.
        top: `${BASELINE * 100}%`,
        borderTop: `${ref.border.thin} dashed ${ref.outline.default}`,
        pointerEvents: 'none',
      }),
    ),
    placeholder: component(
      Style.self({
        position: 'absolute',
        left: ref.space.lg,
        bottom: `calc(${line} + ${ref.space['2xs']})`,
        color: ref.text.muted,
        ...role('caption'),
        pointerEvents: 'none',
        transitionProperty: 'opacity',
        transitionDuration: ref.motion.fast,
      }),
      Style.nest(':not([data-empty]) > * > &', { opacity: '0' }),
    ),
    typedName: component(
      Style.self({
        position: 'absolute',
        left: '6%',
        bottom: line,
        // The same size the exports write it at, a share of the pad's height.
        fontSize: 'calc(var(--_fk-signature-height) * 0.4)',
        lineHeight: '1',
        fontFamily: 'var(--fk-signature-font)',
        whiteSpace: 'nowrap',
        pointerEvents: 'none',
      }),
    ),
    controls: component(Style.self({ display: 'flex', gap: ref.space.xs })),
    undo: component(Style.self(quiet), hover({ background: unfilledHover }), focusRing, disabled),
    clear: component(Style.self(quiet), hover({ background: unfilledHover }), focusRing, disabled),
    fallback: component(Style.self({ display: 'grid', gap: ref.space['2xs'] })),
    fallbackLabel: component(Style.self({ color: ref.text.muted, ...role('caption') })),
    input: component(
      Style.self({
        ...onLadder,
        boxSizing: 'border-box',
        border: `${ref.border.thin} solid ${ref.outline.default}`,
        borderRadius: ref.radius.md,
        background: ref.surface.base,
        color: ref.text.default,
        font: 'inherit',
      }),
      touchText,
      focusRing,
      disabled,
    ),
  },
  variants: {
    surface: {
      plain: {},
      muted: { control: variant(Style.self({ background: ref.surface.muted })) },
      dashed: { control: variant(Style.self({ borderStyle: 'dashed' })) },
    },
    size: {
      sm: { root: variant(Style.self({ '--_fk-signature-height': '7rem' })) },
      md: { root: variant(Style.self({ '--_fk-signature-height': '10rem' })) },
      lg: { root: variant(Style.self({ '--_fk-signature-height': '14rem' })) },
    },
  },
  defaults: { surface: 'plain', size: 'md' },
})
