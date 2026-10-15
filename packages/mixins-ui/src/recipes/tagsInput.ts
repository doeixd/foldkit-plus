/**
 * A tags input: a label over one bordered box, at least a rung of the size
 * ladder tall, that wraps its chips and the input as a field wraps words,
 * the ring around the whole box while the input has focus. A chip is the
 * Badge's pill without its dot, its remove button quiet until hovered.
 */
import { Style } from 'foldkit-mixins'
import { ladder, role } from 'foldkit-mixins/theme'
import { TagsInputSlots } from '../tagsInput.js'
import {
  component,
  disabled,
  focusRing,
  ref,
  touchText,
  transition,
  unfilledHover,
} from './design.js'

export const TagsInput = Style.recipeFor(TagsInputSlots)({
  base: {
    root: component(Style.self({ display: 'flex', flexDirection: 'column', gap: ladder('gap') })),
    label: component(
      Style.self({ color: ref.text.overt, ...role('body'), fontWeight: ref.weight.medium }),
    ),
    control: component(
      Style.self({
        display: 'flex',
        flexWrap: 'wrap',
        alignItems: 'center',
        gap: '0.35rem',
        minBlockSize: ladder('height'),
        paddingBlock: '0.25rem',
        paddingInline: ladder('pad'),
        border: `${ref.border.thin} solid ${ref.outline.default}`,
        borderRadius: ref.radius.md,
        background: ref.surface.base,
        cursor: 'text',
        ...transition('border-color'),
      }),
      Style.pseudo(':hover:not(:focus-within)', { borderColor: ref.outline.overt }),
      Style.pseudo(':focus-within', {
        outline: `${ref.border.thick} solid ${ref.outline.focus}`,
        outlineOffset: '2px',
      }),
      Style.nest('&[data-disabled="true"]', { opacity: '0.5', cursor: 'not-allowed' }),
    ),
    list: component(
      Style.self({
        display: 'flex',
        flexWrap: 'wrap',
        gap: '0.35rem',
        margin: '0',
        padding: '0',
        listStyle: 'none',
      }),
    ),
    tag: component(
      Style.self({
        display: 'inline-flex',
        alignItems: 'center',
        gap: '0.2rem',
        paddingBlock: '0.1rem',
        paddingInlineStart: '0.6rem',
        paddingInlineEnd: '0.2rem',
        borderRadius: ref.radius.xl,
        background: ref.surface.muted,
        color: ref.text.default,
        ...role('caption'),
        fontWeight: ref.weight.medium,
        whiteSpace: 'nowrap',
      }),
    ),
    remove: component(
      Style.self({
        display: 'grid',
        placeItems: 'center',
        inlineSize: '1.25em',
        blockSize: '1.25em',
        padding: '0',
        border: '0',
        borderRadius: ref.radius.full,
        background: 'transparent',
        color: ref.text.muted,
        font: 'inherit',
        lineHeight: '1',
        cursor: 'pointer',
        ...transition('background-color, color'),
      }),
      Style.pseudo(':hover:not(:disabled)', { background: unfilledHover, color: ref.text.overt }),
      focusRing,
      disabled,
    ),
    input: component(
      Style.self({
        flex: '1 1 8ch',
        minInlineSize: '8ch',
        padding: '0',
        border: '0',
        background: 'transparent',
        color: ref.text.default,
        font: 'inherit',
        ...role('body'),
      }),
      // The control draws the ring around the whole field.
      Style.pseudo(':focus-visible', { outline: 'none' }),
      Style.pseudo('::placeholder', { color: ref.text.muted }),
      disabled,
      touchText,
    ),
  },
})
