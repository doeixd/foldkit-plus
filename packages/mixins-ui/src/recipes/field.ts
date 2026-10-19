/**
 * Text fields: `Input` and `Textarea` publish the same regions under
 * different control names, so both recipes are built from these pieces.
 */
import { Style, type Declarations, type StyleValue } from 'foldkit-mixins'
import { InputSlots } from '../input.js'
import { TextareaSlots } from '../textarea.js'
import { ladder, role } from 'foldkit-mixins/theme'
import {
  component,
  controlCorner,
  disabled,
  focusRing,
  focusWithin,
  onLadder,
  ref,
  steps,
  touchText,
  transition,
  variant,
} from './design.js'

const control = component(
  Style.self({
    display: 'block',
    inlineSize: '100%',
    border: `${ref.border.thin} solid ${ref.outline.default}`,
    borderRadius: controlCorner,
    background: ref.surface.base,
    boxShadow: ref.shadow.field,
    color: ref.text.default,
    font: 'inherit',
    ...onLadder,
    ...transition('border-color, background-color, box-shadow'),
  }),
  Style.pseudo(':hover:not(:focus, :disabled)', { borderColor: ref.outline.overt }),
  Style.pseudo('::placeholder', { color: ref.text.muted }),
  Style.pseudo('[aria-invalid="true"]', { borderColor: ref.error.outline }),
  focusRing,
  disabled,
  touchText,
)

const label = component(
  Style.self({
    display: 'block',
    marginBlockEnd: ref.space['2xs'],
    color: ref.text.overt,
    ...role('body'),
    fontWeight: ref.weight.medium,
  }),
)

const description = component(
  Style.self({
    marginBlockStart: ref.space['2xs'],
    color: ref.text.muted,
    ...role('body'),
  }),
)

const filled: StyleValue = variant(
  Style.self({ background: ref.surface.field, borderColor: 'transparent' }),
)
const outlined: StyleValue = variant(Style.self({ background: ref.surface.base }))

export const Input = Style.recipeFor(InputSlots)({
  base: { input: control, label, description },
  variants: {
    size: { sm: { input: steps.sm }, md: { input: steps.md }, lg: { input: steps.lg } },
    variant: { outline: { input: outlined }, filled: { input: filled } },
  },
  defaults: { variant: 'outline' },
})

/** `lines` lines of text tall, with the padding and the border around them. */
const linesTall = (lines: string) =>
  `calc(${lines} * 1lh + 2 * ${ladder('row-pad')} + 2 * ${ref.border.thin})`

/**
 * A field's box drawn around the control inside it, which goes borderless:
 * the border, its hover, the focus ring while the control has focus, and an
 * invalid control's edge. An InputGroup's group and a Textarea's frame.
 */
const fieldBox = (layout: Declarations): StyleValue =>
  component(
    Style.self({
      ...layout,
      border: `${ref.border.thin} solid ${ref.outline.default}`,
      borderRadius: controlCorner,
      background: ref.surface.base,
      boxShadow: ref.shadow.field,
      ...transition('border-color'),
    }),
    Style.pseudo(':hover:not(:focus-within)', { borderColor: ref.outline.overt }),
    focusWithin,
    Style.pseudo(':has([aria-invalid="true"])', { borderColor: ref.error.outline }),
  )

/** The box around a textarea and its footer. */
const frame = Style.compose(
  fieldBox({ display: 'grid' }),
  component(Style.pseudo(':has(:disabled)', { opacity: '0.5', cursor: 'not-allowed' })),
)

export const Textarea = Style.recipeFor(TextareaSlots)({
  base: {
    // Lines rather than one: padded like a list row, and two lines tall at least.
    textarea: Style.compose(
      control,
      component(
        Style.self({
          paddingBlock: ladder('row-pad'),
          minBlockSize: linesTall('2'),
        }),
      ),
      // In a frame the frame is the box. In the variants layer, and more
      // specific, so it beats the look an `outline` or `filled` variant gives.
      variant(
        Style.nest(':is([data-textarea-frame]) > &', {
          border: '0',
          background: 'transparent',
          boxShadow: 'none',
        }),
        Style.nest(':is([data-textarea-frame]) > &:focus-visible', { outline: 'none' }),
      ),
    ),
    label,
    description,
    frame,
    // Under the text, its controls at the start and the count pushed to the end.
    footer: component(
      Style.self({
        display: 'flex',
        alignItems: 'center',
        flexWrap: 'wrap',
        gap: ladder('gap'),
        paddingInline: `calc(${ladder('pad')} / 2)`,
        paddingBlockEnd: `calc(${ladder('pad')} / 2)`,
      }),
    ),
    meta: component(
      Style.self({
        display: 'flex',
        alignItems: 'baseline',
        gap: ref.space.sm,
        marginBlockStart: ref.space['2xs'],
      }),
      // The description and the count carry ids: more specific than their own margin.
      Style.nest('& > [id]', { marginBlockStart: '0' }),
    ),
    count: component(
      Style.self({
        marginInlineStart: 'auto',
        color: ref.text.muted,
        ...role('caption'),
        fontVariantNumeric: 'tabular-nums',
        whiteSpace: 'nowrap',
      }),
      Style.nest('&[data-limit="near"]', { color: ref.warning.ink }),
      Style.nest('&[data-limit="at"]', { color: ref.error.ink }),
    ),
  },
  variants: {
    size: {
      sm: { textarea: steps.sm, frame: steps.sm },
      md: { textarea: steps.md, frame: steps.md },
      lg: { textarea: steps.lg, frame: steps.lg },
    },
    variant: {
      outline: { textarea: outlined, frame: outlined },
      filled: { textarea: filled, frame: filled },
    },
    // How it changes size. `auto` grows with its text from `rows` lines (2
    // unless given) to `maxRows` (without one, as far as the text goes),
    // then scrolls; `none` and `vertical` stay `rows` lines tall, and
    // `vertical` lets the reader drag it taller or shorter. A browser
    // without `field-sizing` keeps `auto` at its fewest lines, scrolling.
    resize: {
      none: { textarea: variant(Style.self({ fieldSizing: 'fixed', resize: 'none' })) },
      vertical: { textarea: variant(Style.self({ fieldSizing: 'fixed', resize: 'vertical' })) },
      auto: {
        textarea: variant(
          Style.self({
            fieldSizing: 'content',
            resize: 'none',
            // Content sizing takes the width from the text too: where nothing
            // gives it one, at least the 20 columns a fixed textarea has.
            minInlineSize: '20ch',
            minBlockSize: linesTall('var(--fk-textarea-rows, 2)'),
            // With no `maxRows`, `infinity` lines: no cap, and no read of an
            // unset variable for a page's token check to refuse.
            maxBlockSize: linesTall('var(--fk-textarea-max-rows, infinity)'),
          }),
        ),
      },
    },
  },
  defaults: { variant: 'outline', resize: 'auto' },
})

/**
 * A text field with a prefix or suffix, such as an address's `/`: pieces for
 * the application's own group, affix and control slots, drawn as one field.
 * The group carries the border, its hover and the focus ring (while the
 * control inside has focus); the affix sits inside it, muted; the control
 * inside goes borderless and transparent, so the two read as one box.
 */
export const InputGroup: {
  readonly group: StyleValue
  readonly affix: StyleValue
  readonly control: StyleValue
} = {
  group: fieldBox({ display: 'flex', alignItems: 'center' }),
  affix: component(
    Style.self({ color: ref.text.muted, paddingInlineStart: ladder('pad'), whiteSpace: 'nowrap' }),
  ),
  // In the variants layer, so it wins over a field's own look composed on the same slot.
  control: variant(
    Style.self({
      flex: '1',
      minInlineSize: '0',
      border: '0',
      background: 'transparent',
      // The group draws the well; a second one inside it would double the edge.
      boxShadow: 'none',
      paddingInlineStart: ref.space['3xs'],
    }),
    Style.pseudo(':focus-visible', { outline: 'none' }),
  ),
}
