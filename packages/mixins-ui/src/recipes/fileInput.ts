/**
 * A file picker: the trigger is Button's outlined face, drawn on a label, and
 * rings when the hidden file input has keyboard focus (a press does not ring it,
 * as `:focus-visible` decides). The input is a transparent pixel rather than
 * hidden, so it stays focusable and the browser can still show a `required`
 * message at it. Chosen files are rows with an icon button, the corner mark
 * Button's own icon variant. `size` is Button's ladder step, set on the field so
 * the trigger and the remove buttons follow it.
 */
import { Style } from 'foldkit-mixins'
import { ladder } from 'foldkit-mixins/theme'
import { glyph } from '../icons.js'
import { FileInputSlots } from '../fileInput.js'
import { Button } from './button.js'
import { Input } from './field.js'
import { component, disabled, focusRing, ref, steps, variant } from './design.js'

const { button: face } = Button({ tone: 'neutral', variant: 'outline' })
const { button: icon } = Button({ tone: 'neutral', variant: 'icon' })
const { description } = Input({ variant: null })

export const FileInput = Style.recipeFor(FileInputSlots)({
  base: {
    root: component(
      Style.self({
        position: 'relative',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'start',
        gap: ref.space['2xs'],
      }),
    ),
    input: component(
      Style.self({
        position: 'absolute',
        insetBlockStart: '0',
        insetInlineStart: '0',
        inlineSize: '1px',
        blockSize: '1px',
        margin: '0',
        overflow: 'hidden',
        opacity: '0',
      }),
    ),
    trigger: [
      face,
      component(
        Style.pseudo('[data-disabled]', { cursor: 'not-allowed' }),
        Style.pseudo('[data-disabled]', {
          opacity: ref.knob['state-disabled'],
          pointerEvents: 'none',
        }),
        // The label is not focusable: its input, which comes first, is.
        Style.nest('input:focus-visible + &', {
          outline: `${ref.border.thick} solid ${ref.outline.focus}`,
          outlineOffset: '2px',
        }),
      ),
      // In the variants layer, beside the outline face that sets the border color it overrides.
      variant(Style.pseudo('[data-invalid]', { borderColor: ref.error.outline })),
    ],
    description,
    list: component(
      Style.self({
        display: 'grid',
        gap: ref.space['3xs'],
        margin: '0',
        padding: '0',
        listStyle: 'none',
        inlineSize: '100%',
      }),
    ),
    item: component(
      Style.self({
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: ref.space.xs,
        paddingInlineStart: ref.space.xs,
        border: `${ref.border.thin} solid ${ref.outline.default}`,
        borderRadius: ref.radius.md,
        color: ref.text.default,
      }),
    ),
    name: component(
      Style.self({
        minInlineSize: '0',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        whiteSpace: 'nowrap',
      }),
    ),
    remove: [
      icon,
      component(
        glyph(ladder('icon')),
        Style.self({ '--icon': ref.icon.close }),
        focusRing,
        disabled,
      ),
    ],
  },
  variants: {
    size: {
      sm: { root: steps.sm },
      md: { root: steps.md },
      lg: { root: steps.lg },
    },
  },
})
