/**
 * A resizable split: the first panel takes the share the view writes in
 * `--_fk-split`, the second the rest, and between them a hairline handle
 * with a wider grip to press, which darkens under the pointer, while
 * dragged and when focused. Side by side or one over the other, as the
 * group's `data-orientation` says.
 */
import { Style } from 'foldkit-mixins'
import { ResizableSlots } from '../resizable.js'
import { component, ref, transition } from './design.js'

const vertical = '[data-orientation="vertical"]'

export const Resizable = Style.recipeFor(ResizableSlots)({
  base: {
    root: component(
      Style.self({ display: 'flex', minBlockSize: '0', minInlineSize: '0' }),
      Style.pseudo(vertical, { flexDirection: 'column' }),
    ),
    first: component(Style.self({ flex: '0 0 var(--_fk-split)', overflow: 'auto' })),
    second: component(Style.self({ flex: '1 1 0', overflow: 'auto' })),
    handle: component(
      Style.self({
        position: 'relative',
        flex: 'none',
        inlineSize: ref.border.thin,
        background: ref.outline.default,
        cursor: 'col-resize',
        touchAction: 'none',
        ...transition('background-color'),
      }),
      // A grip wider than the line, so the press need not land on a pixel.
      Style.pseudo('::before', { content: '""', position: 'absolute', inset: '0 -6px' }),
      Style.nest(`:where(${vertical}) > &`, {
        inlineSize: 'auto',
        blockSize: ref.border.thin,
        cursor: 'row-resize',
      }),
      Style.nest(`:where(${vertical}) > &::before`, { inset: '-6px 0' }),
      Style.pseudo(':is(:hover, :active, :focus-visible)', { background: ref.outline.focus }),
      Style.pseudo(':focus-visible', { outline: 'none' }),
    ),
  },
})
