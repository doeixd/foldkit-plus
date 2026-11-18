/**
 * A search field: Input's control in one box (the `group`) with a magnifier
 * in the `start` Slot, which it draws while that is empty, and the clear
 * button, a square the ladder sizes, after the control (the inline end, so a
 * right-to-left page mirrors both). `start` and `end` take the application's
 * own drawing. The browser's own cancel button and decoration are hidden, so
 * there is one clear control. `size` and `variant` are Input's axes, the
 * control and the box taken from it rather than restated.
 */
import { Style } from 'foldkit-mixins'
import { ladder } from 'foldkit-mixins/theme'
import { glyph } from '../icons.js'
import { SearchFieldSlots } from '../searchField.js'
import { Adorned, Input } from './field.js'
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
    root: component(Style.self({ display: 'block' })),
    group: Adorned.group,
    start: Style.compose(
      Adorned.start,
      component(
        Style.self({ '--icon': ref.icon.search }),
        // The magnifier is drawn only while nothing of the application's is: it names nothing.
        Style.nest('&:empty::before', {
          WebkitMask: 'var(--icon) center / contain no-repeat',
          background: 'currentColor',
          content: '""',
          flexShrink: '0',
          height: ladder('icon'),
          mask: 'var(--icon) center / contain no-repeat',
          width: ladder('icon'),
        }),
      ),
    ),
    end: Adorned.end,
    input: [
      control,
      variant(
        Style.self({
          appearance: 'none',
          paddingInlineStart: ref.space['3xs'],
        }),
        // One clear control: the browser's own would sit beside ours.
        Style.pseudo('::-webkit-search-cancel-button', { appearance: 'none', display: 'none' }),
        Style.pseudo('::-webkit-search-decoration', { appearance: 'none', display: 'none' }),
      ),
    ],
    clear: component(
      Style.self({
        display: 'grid',
        placeItems: 'center',
        flexShrink: '0',
        alignSelf: 'stretch',
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
      // The application's own drawing stands in place of the cross.
      Style.nest('&[data-content]::before', { display: 'none' }),
      Style.nest('&[data-content]', { inlineSize: 'auto', paddingInline: ladder('pad') }),
      hover({ background: unfilledHover, color: ref.text.overt }),
      // Inside the group's own ring, so the two do not draw over each other.
      Style.pseudo(':focus-visible', {
        outline: `${ref.border.thick} solid ${ref.outline.focus}`,
        outlineOffset: `calc(-1 * ${ref.border.thick})`,
      }),
      disabled,
    ),
  },
  variants: {
    size: {
      sm: { root: steps.sm, group: steps.sm, input: steps.sm },
      md: { root: steps.md, group: steps.md, input: steps.md },
      lg: { root: steps.lg, group: steps.lg, input: steps.lg },
    },
    variant: {
      outline: { group: Input({ variant: 'outline' }).group },
      filled: { group: Input({ variant: 'filled' }).group },
      ghost: { group: Input({ variant: 'ghost' }).group },
      underline: { group: Input({ variant: 'underline' }).group },
    },
  },
  defaults: { variant: 'outline' },
})
