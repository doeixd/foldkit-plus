/**
 * A search field: Input's own control, with a magnifier at the start and the
 * clear button, a square the ladder sizes, at the end (the inline end, so a
 * right-to-left page mirrors both). The browser's own cancel button and
 * decoration are hidden, so there is one clear control. `size` and `variant`
 * are Input's axes, the control taken from it rather than restated.
 */
import { Style } from 'foldkit-mixins'
import { ladder } from 'foldkit-mixins/theme'
import { glyph } from '../icons.js'
import { SearchFieldSlots } from '../searchField.js'
import { Input } from './field.js'
import {
  component,
  disabled,
  hover,
  ref,
  steps,
  transition,
  unfilledHover,
  variant,
} from './design.js'

const { input: control } = Input({ variant: null })

export const SearchField = Style.recipeFor(SearchFieldSlots)({
  base: {
    root: component(
      Style.self({ position: 'relative', display: 'block' }),
      // The magnifier is drawn, not a slot: it takes no input and names nothing.
      glyph(ladder('icon')),
      Style.nest('&::before', {
        '--icon': ref.icon.search,
        position: 'absolute',
        insetBlockStart: '50%',
        insetInlineStart: ladder('pad'),
        transform: 'translateY(-50%)',
        color: ref.text.muted,
        pointerEvents: 'none',
      }),
    ),
    input: [
      control,
      variant(
        Style.self({
          appearance: 'none',
          // Room for the magnifier at the start and the button at the end.
          paddingInlineStart: `calc(${ladder('pad')} * 2 + ${ladder('icon')})`,
          paddingInlineEnd: ladder('height'),
        }),
        // One clear control: the browser's own would sit beside ours.
        Style.pseudo('::-webkit-search-cancel-button', { appearance: 'none', display: 'none' }),
        Style.pseudo('::-webkit-search-decoration', { appearance: 'none', display: 'none' }),
      ),
    ],
    clear: component(
      Style.self({
        position: 'absolute',
        insetBlock: '0',
        insetInlineEnd: '0',
        display: 'grid',
        placeItems: 'center',
        inlineSize: ladder('height'),
        padding: '0',
        border: '0',
        borderRadius: ref.radius.md,
        background: 'transparent',
        color: ref.text.muted,
        cursor: 'pointer',
        '--icon': ref.icon.close,
        ...transition('background-color, color'),
      }),
      glyph(ladder('icon')),
      hover({ background: unfilledHover, color: ref.text.overt }),
      // Inside the input's own ring, so the two do not draw over each other.
      Style.pseudo(':focus-visible', {
        outline: `${ref.border.thick} solid ${ref.outline.focus}`,
        outlineOffset: `calc(-1 * ${ref.border.thick})`,
      }),
      disabled,
    ),
  },
  variants: {
    size: {
      sm: { root: steps.sm, input: steps.sm },
      md: { root: steps.md, input: steps.md },
      lg: { root: steps.lg, input: steps.lg },
    },
    variant: {
      outline: { input: Input({ variant: 'outline' }).input },
      filled: { input: Input({ variant: 'filled' }).input },
    },
  },
  defaults: { variant: 'outline' },
})
