/**
 * A tags input: a label over one bordered box, at least a rung of the size
 * ladder tall, that wraps its chips and the input as a field wraps words,
 * the ring around the whole box while the input has focus. A chip is the
 * Badge's pill without its dot, its remove button quiet until hovered. A
 * refused commit shakes the box sideways once, over the moderate tier and
 * travelling (so reduced motion keeps it still), its border in the error
 * line, and the message under it says why in the error's ink.
 */
import { Style, type StyleValue } from 'foldkit-mixins'
import { ladder, role } from 'foldkit-mixins/theme'
import { TagsInputSlots } from '../tagsInput.js'
import {
  component,
  controlCorner,
  disabled,
  focusRing,
  hover,
  ref,
  touchText,
  transition,
  travelled,
  unfilledHover,
} from './design.js'

const swing = (first: string, second: string) =>
  Style.keyframes({
    '0%, 100%': { translate: '0 0' },
    '20%, 60%': { translate: `${first} 0` },
    '40%, 80%': { translate: `${second} 0` },
  })
// Two shakes, one each way, since names are hashed from the frames: the view
// alternates them, and an animation whose name changes plays again.
const shakes = { even: swing('-4px', '4px'), odd: swing('4px', '-4px') }
const shake = (name: string) => ({
  animation: `${name} ${travelled(ref.motion.moderate)} ${ref.motion.ease}`,
  borderColor: ref.error.outline,
})

/** The chips' list, a chip (the Badge's pill without its dot), and its remove button; Combobox's chips share them. */
export const chipList: StyleValue = component(
  Style.self({
    display: 'flex',
    flexWrap: 'wrap',
    gap: '0.35rem',
    margin: '0',
    padding: '0',
    listStyle: 'none',
  }),
)

export const chip: StyleValue = component(
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
)

export const chipRemove: StyleValue = component(
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
  hover({ background: unfilledHover, color: ref.text.overt }),
  focusRing,
  disabled,
)

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
        borderRadius: controlCorner,
        background: ref.surface.base,
        boxShadow: ref.shadow.field,
        cursor: 'text',
        ...transition('border-color'),
      }),
      Style.pseudo(':hover:not(:focus-within)', { borderColor: ref.outline.overt }),
      Style.pseudo(':focus-within', {
        outline: `${ref.border.thick} solid ${ref.outline.focus}`,
        outlineOffset: '2px',
      }),
      Style.nest('&[data-disabled="true"]', { opacity: '0.5', cursor: 'not-allowed' }),
      shakes.even.style,
      shakes.odd.style,
      Style.states({ even: shake(shakes.even.name), odd: shake(shakes.odd.name) }, 'data-refused'),
    ),
    list: chipList,
    tag: chip,
    remove: chipRemove,
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
    message: component(
      Style.self({ margin: '0', color: ref.error.ink, ...role('caption') }),
      // Out of the column while silent, so the field keeps its gap and no more.
      Style.pseudo(':empty', { position: 'absolute' }),
    ),
  },
})
