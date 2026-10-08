/**
 * A file drop zone: a dashed card that tints while a drag hovers. The file
 * input keeps its component-owned class, beside which a mixin class does not
 * survive to the element — so the visually-hidden treatment hangs off the
 * root as a descendant rule instead of an input piece. No axes.
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
      Style.pseudo(':hover', { borderColor: ref.outline.overt }),
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
