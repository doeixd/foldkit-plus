/**
 * A file drop zone: a dashed card that tints while a drag hovers. The file
 * input's visually-hidden treatment hangs off the root as a descendant rule,
 * so it holds whatever classes the input carries. No axes.
 */
import { Style } from 'foldkit-mixins'
import { FileDropSlots } from '../fileDrop.js'
import { component, ref } from './design.js'

export const FileDrop = Style.recipeFor(FileDropSlots)({
  base: {
    root: component(
      Style.self({
        display: 'grid',
        gap: ref.space['2xs'],
        placeItems: 'center',
        padding: ref.space.xl,
        border: `${ref.border.thin} dashed ${ref.outline.default}`,
        borderRadius: ref.radius.lg,
        background: ref.surface.subtle,
        color: ref.text.muted,
        textAlign: 'center',
        cursor: 'pointer',
      }),
      Style.pseudo(':hover:not([data-disabled])', { borderColor: ref.outline.overt }),
      // The input is the only focusable thing and is hidden, so the zone shows its focus; a press does not ring it.
      Style.pseudo(':has(> input:focus-visible)', {
        outline: `${ref.border.thick} solid ${ref.outline.focus}`,
        outlineOffset: '2px',
      }),
      Style.pseudo('[data-disabled]', {
        opacity: ref.knob['state-disabled'],
        cursor: 'not-allowed',
      }),
      // Drag-over is DOM state on the root, so it goes through `states`.
      Style.states(
        {
          true: {
            borderColor: ref.accent.default,
            background: ref.accent.subtle,
            color: ref.accent.ink,
          },
        },
        'data-drag-over',
      ),
      Style.nest('& > input', {
        position: 'absolute',
        inlineSize: '1px',
        blockSize: '1px',
        overflow: 'hidden',
        clipPath: 'inset(50%)',
      }),
    ),
  },
})
