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
  controlHeight,
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

/** The chip's room above, below and after its remove button: even, so the button is the end cap's own circle. */
const chipInset = '0.1rem'
const chipLine = role('caption').lineHeight
/** The button's room at the end: its own width, its inset and the gap to the label. */
const buttonRoom = `calc(${chipLine} + ${chipInset} + 0.2rem)`

// The pill is as tall as the button with its inset. Where `text-box` trims, the label's line is
// cut to the capitals' height and the padding is what is left of that height, moved by a quarter of
// the gap between the capitals' and the x-height's (`1cap - 1ex`): the label is centred half way
// between the middle of its capitals and of its x-height band, where mixed lowercase reads centred,
// by the face's own metrics. A line box centres its ascent and descent, which sit low or high by the
// face. Without `text-box` the base rule stands: the line box, centred, at the same height. The
// button is out of the flow, since a block container is what `text-box` trims.
const trimmedPadding = `calc((${chipLine} + 2 * ${chipInset} - 1cap) / 2)`
const opticalShift = 'calc((1cap - 1ex) / 4)'
export const chip: StyleValue = component(
  Style.self({
    position: 'relative',
    display: 'block',
    boxSizing: 'border-box',
    paddingBlock: chipInset,
    paddingInlineStart: '0.6rem',
    paddingInlineEnd: buttonRoom,
    borderRadius: ref.radius.full,
    // A step off the field the other way from `muted`, which is a recessed
    // step: lighter in a dark scheme, darker in a light one.
    background: ref.surface.default,
    color: ref.text.default,
    ...role('caption'),
    fontWeight: ref.weight.medium,
    whiteSpace: 'nowrap',
  }),
  Style.supports('(text-box: trim-both cap alphabetic)', {
    textBox: 'trim-both cap alphabetic',
    paddingBlockStart: `calc(${trimmedPadding} - ${opticalShift})`,
    paddingBlockEnd: `calc(${trimmedPadding} + ${opticalShift})`,
  }),
)

/**
 * One stroke of the sign, centred in the button by its own middle, so no face's glyph metrics move it.
 * The button is positioned and sets `--_fk-chip-sign`, the stroke's colour.
 */
export const stroke = (turn: string) => ({
  content: '""',
  position: 'absolute',
  insetInlineStart: '50%',
  insetBlockStart: '50%',
  inlineSize: `calc(${role('caption').lineHeight} * 0.5)`,
  blockSize: `calc(${ref.border.glyph} * 0.75)`,
  borderRadius: ref.radius.full,
  background: 'var(--_fk-chip-sign)',
  translate: '-50% -50%',
  rotate: turn,
})

export const chipRemove: StyleValue = component(
  Style.self({
    '--_fk-chip-sign': ref.text.muted,
    // The chip's own line tall, at the end of the pill with the same inset above, below and after.
    position: 'absolute',
    insetBlock: '0',
    insetInlineEnd: chipInset,
    marginBlock: 'auto',
    inlineSize: role('caption').lineHeight,
    blockSize: role('caption').lineHeight,
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
  // The default sign is drawn, since the multiplication sign sits above or below the middle of its
  // line by the face; its text stays for a copy and a search. A mark the application words is text.
  Style.nest('&[data-glyph="cross"]', { fontSize: '0' }),
  Style.nest('&[data-glyph="cross"]::before', stroke('45deg')),
  Style.nest('&[data-glyph="cross"]::after', stroke('-45deg')),
  hover({ '--_fk-chip-sign': ref.text.overt, background: unfilledHover, color: ref.text.overt }),
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
        minBlockSize: controlHeight,
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
      Style.nest('&[data-disabled="true"]', {
        opacity: ref.knob['state-disabled'],
        cursor: 'not-allowed',
      }),
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
