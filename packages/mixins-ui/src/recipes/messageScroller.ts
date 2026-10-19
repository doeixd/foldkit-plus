/**
 * A message scroller: the scrolling area fills the scroller, which fills
 * what holds it, and a short log sits at the bottom, beside the composer
 * below it, as a conversation begins. The jump button floats over the
 * area's bottom, centred either way round: a raised pill with a down
 * chevron and, once messages arrived unseen, their count in an accent
 * badge. It rises in as it appears, the rise travelling, so reduced motion
 * keeps the fade. The area's own look is the ScrollArea recipe's.
 */
import { Style } from 'foldkit-mixins'
import { ladder, role } from 'foldkit-mixins/theme'
import { MessageScrollerSlots } from '../messageScroller.js'
import {
  component,
  cornerSides,
  focusRing,
  hover,
  ref,
  travelled,
  unfilledHover,
} from './design.js'

export const MessageScroller = Style.recipeFor(MessageScrollerSlots)({
  base: {
    root: component(
      Style.self({
        position: 'relative',
        display: 'grid',
        gridTemplateRows: 'minmax(0, 1fr)',
        blockSize: '100%',
        minBlockSize: '0',
      }),
    ),
    log: component(
      Style.self({
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'flex-end',
        minBlockSize: '100%',
        padding: ref.space.md,
      }),
    ),
    jump: component(
      Style.self({
        position: 'absolute',
        insetBlockEnd: ref.space.sm,
        insetInline: '0',
        marginInline: 'auto',
        inlineSize: 'fit-content',
        display: 'inline-flex',
        alignItems: 'center',
        gap: ladder('gap'),
        minInlineSize: ladder('height'),
        blockSize: ladder('height'),
        paddingInline: ladder('pad'),
        border: `${ref.border.thin} solid ${ref.outline.subtle}`,
        borderRadius: ref.radius.full,
        background: ref.surface.base,
        boxShadow: ref.shadow.md,
        color: ref.text.default,
        font: 'inherit',
        cursor: 'pointer',
        zIndex: '1',
        transitionProperty: 'opacity, translate, background-color',
        transitionDuration: `${ref.motion.moderate}, ${travelled(ref.motion.moderate)}, ${ref.motion.fast}`,
        transitionTimingFunction: ref.motion.ease,
      }),
      Style.enter({ opacity: '0', translate: '0 0.5rem' }),
      // A chevron pointing down, to the latest.
      Style.nest('&::before', {
        content: '""',
        inlineSize: '0.45em',
        blockSize: '0.45em',
        ...cornerSides(ref.border.glyph, 'currentColor'),
        rotate: '45deg',
        translate: '0 -0.15em',
      }),
      hover({ backgroundImage: `linear-gradient(${unfilledHover}, ${unfilledHover})` }),
      focusRing,
    ),
    count: component(
      Style.self({
        ...role('micro'),
        minInlineSize: '1.25rem',
        paddingInline: ref.space['2xs'],
        borderRadius: ref.radius.full,
        background: ref.accent.default,
        color: ref.accent['on-fill'],
        fontWeight: ref.weight.semibold,
        textAlign: 'center',
        fontVariantNumeric: 'tabular-nums',
      }),
    ),
  },
  variants: {},
  defaults: {},
})
