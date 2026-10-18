/**
 * A resizable split: the first panel takes the share the view writes in
 * `--_fk-split`, the second the rest, and between them a hairline handle
 * with a wider grip to press, which turns to a thicker accent line under the
 * pointer, while dragged and when focused. Side by side or one over the
 * other, as the group's `data-orientation` says; the group fills its panel,
 * so a split nests in another either way. A panel collapsed or put back
 * eases there, on the moderate tier times `travel`, and a drag follows the
 * pointer at once. `handle: 'grip'` shows a pill of dots on the line.
 */
import { Style } from 'foldkit-mixins'
import { ResizableSlots } from '../resizable.js'
import { component, ref, transition, travelled, variant } from './design.js'

const vertical = '[data-orientation="vertical"]'
const held = ':is(:hover, :active, :focus-visible)'

export const Resizable = Style.recipeFor(ResizableSlots)({
  base: {
    root: component(
      Style.self({
        display: 'flex',
        inlineSize: '100%',
        blockSize: '100%',
        minBlockSize: '0',
        minInlineSize: '0',
      }),
      Style.pseudo(vertical, { flexDirection: 'column' }),
    ),
    first: component(
      Style.self({
        flex: '0 0 var(--_fk-split)',
        overflow: 'auto',
        transitionProperty: 'flex-basis',
        transitionDuration: travelled(ref.motion.moderate),
        transitionTimingFunction: ref.motion.settle,
      }),
      Style.nest(':where([data-dragging]) > &', { transitionDuration: '0s' }),
    ),
    second: component(Style.self({ flex: '1 1 0', overflow: 'auto' })),
    handle: component(
      Style.self({
        position: 'relative',
        flex: 'none',
        inlineSize: ref.border.thin,
        background: ref.outline.default,
        cursor: 'col-resize',
        touchAction: 'none',
        // No callout of iOS's own for a press held while dragging.
        WebkitTouchCallout: 'none',
        ...transition('background-color, box-shadow'),
      }),
      // A grip wider than the line, so the press need not land on a pixel.
      Style.pseudo('::before', { content: '""', position: 'absolute', inset: '0 -6px' }),
      Style.nest(`:where(${vertical}) > &`, {
        inlineSize: 'auto',
        blockSize: ref.border.thin,
        cursor: 'row-resize',
      }),
      Style.nest(`:where(${vertical}) > &::before`, { inset: '-6px 0' }),
      // The accent line, a pixel thicker on each side, without moving the panels.
      Style.pseudo(held, {
        background: ref.accent.default,
        boxShadow: `0 0 0 ${ref.border.thin} ${ref.accent.default}`,
      }),
      Style.nest(':where([data-dragging]) > &', {
        background: ref.accent.default,
        boxShadow: `0 0 0 ${ref.border.thin} ${ref.accent.default}`,
      }),
      Style.pseudo(':focus-visible', { outline: 'none' }),
    ),
    grip: component(Style.self({ display: 'none' })),
  },
  variants: {
    handle: {
      line: {},
      grip: {
        // A pill of dots across the line, above its hit area.
        grip: variant(
          Style.self({
            display: 'block',
            // Physical: centred on the line in either direction, overflowing it both ways.
            position: 'absolute',
            top: '50%',
            left: '50%',
            translate: '-50% -50%',
            zIndex: '1',
            inlineSize: '0.75rem',
            blockSize: '1.25rem',
            borderRadius: ref.radius.sm,
            border: `${ref.border.thin} solid ${ref.outline.default}`,
            backgroundColor: ref.surface.base,
            backgroundImage: `radial-gradient(circle, ${ref.text.muted} 1px, transparent 1.5px)`,
            backgroundSize: '4px 4px',
            backgroundPosition: 'center',
            pointerEvents: 'none',
            ...transition('border-color'),
          }),
          Style.nest(`:where(${vertical}) > * > &`, {
            inlineSize: '1.25rem',
            blockSize: '0.75rem',
          }),
          Style.nest(`:where(${held}) > &`, { borderColor: ref.accent.default }),
        ),
      },
    },
  },
  defaults: { handle: 'line' },
})
