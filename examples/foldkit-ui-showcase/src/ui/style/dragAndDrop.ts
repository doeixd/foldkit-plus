import { Slots, Style } from 'foldkit-mixins'

import { app, t } from '../../style.js'
import { container, demoSlots, demoStyles, shadow } from './shared.js'

/**
 * `foldkit-mixins-ui` has no DragAndDrop adapter. `@foldkit/ui` hands out
 * attribute bundles for a draggable card and a droppable column, which the
 * page's own Slots take, with `data-drag` and `data-drop-target` for the looks
 * a drag gives them.
 */
export const DragAndDropPageSlots = Slots.define({
  ...demoSlots,
  board: container,
  columns: container,
  column: container,
  columnLabel: container,
  dropZone: container,
  card: container,
  placeholder: container,
  ghost: container,
})

const card = Style.self({
  padding: `${t.space.xs} ${t.space.sm}`,
  border: `${t.border.thin} solid ${t.outline.subtle}`,
  borderRadius: t.radius.lg,
  background: t.surface.base,
  fontSize: t.size.sm,
  color: t.text.overt,
})

export const DragAndDropPageStyle = Style.forSlots(DragAndDropPageSlots)(
  {
    ...demoStyles,
    board: Style.self({ width: '100%', maxWidth: '28rem' }),
    columns: Style.self({
      display: 'grid',
      gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
      gap: t.space.md,
    }),
    column: Style.self({ display: 'flex', flexDirection: 'column', gap: '0.25rem' }),
    columnLabel: Style.self({
      marginBottom: '0.25rem',
      fontSize: t.size.xs,
      fontWeight: t.weight.semibold,
      letterSpacing: '0.05em',
      textTransform: 'uppercase',
      color: t.text.muted,
    }),
    dropZone: Style.compose(
      Style.self({
        display: 'flex',
        flexDirection: 'column',
        gap: '0.375rem',
        minHeight: '120px',
        padding: t.space.xs,
        border: `${t.border.thick} solid transparent`,
        borderRadius: t.radius.lg,
        background: t.surface.subtle,
        transition: `border-color ${t.motion.fast} ${t.motion.ease}`,
      }),
      Style.pseudo('[data-drop-target]', {
        borderStyle: 'dashed',
        borderColor: `color-mix(in oklch, ${t.accent.default} 50%, transparent)`,
      }),
    ),
    card: Style.compose(
      card,
      Style.self({
        cursor: 'grab',
        userSelect: 'none',
        transition: `opacity ${t.motion.fast} ${t.motion.ease}`,
      }),
      Style.pseudo(':active', { cursor: 'grabbing' }),
      Style.states(
        {
          Pointer: { opacity: '0.4' },
          Keyboard: { boxShadow: `0 0 0 ${t.border.thick} ${t.accent.default}` },
        },
        'data-drag',
      ),
    ),
    placeholder: Style.self({
      height: '2.25rem',
      border: `${t.border.thick} dashed color-mix(in oklch, ${t.accent.default} 50%, transparent)`,
      borderRadius: t.radius.lg,
    }),
    ghost: Style.compose(card, Style.self({ borderColor: t.accent.default, boxShadow: shadow.lg })),
  },
  { name: 'DragAndDropPageStyle', layer: app },
)
