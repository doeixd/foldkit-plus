import { Slots, Style } from 'foldkit-mixins'

import { forSlots, t } from '../../style.js'
import { container, demoSlots, demoStyles } from './shared.js'

/**
 * `foldkit-mixins-ui` has no FileDrop adapter, though `@foldkit/ui` hands its
 * `root` and `input` bundles to a `toView`, so they take the page's own Slots.
 * The component marks the zone `data-drag-over` while files hover it.
 */
export const FileDropPageSlots = Slots.define({
  ...demoSlots,
  demo: container,
  dropZone: container,
  fileInput: container,
  primaryText: container,
  secondaryText: container,
  fileRow: container,
  fileText: container,
  fileName: container,
  fileSize: container,
  removeButton: container,
})

export const FileDropPageStyle = forSlots(FileDropPageSlots)(
  {
    ...demoStyles,
    demo: Style.self({
      display: 'flex',
      flexDirection: 'column',
      gap: t.space.sm,
      width: '100%',
      maxWidth: '28rem',
    }),
    dropZone: Style.compose(
      Style.self({
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: t.space.xs,
        padding: `2.5rem ${t.space.lg}`,
        border: `${t.border.thick} dashed ${t.outline.default}`,
        borderRadius: t.radius.xl,
        background: t.surface.subtle,
        textAlign: 'center',
        cursor: 'pointer',
        userSelect: 'none',
      }),
      Style.pseudo(':hover', { borderColor: t.accent.default }),
      Style.pseudo('[data-drag-over]', {
        borderColor: t.accent.default,
        background: t.accent.subtle,
      }),
    ),
    primaryText: Style.self({
      margin: '0',
      fontSize: t.size.md,
      fontWeight: t.weight.medium,
      color: t.text.overt,
    }),
    secondaryText: Style.self({ margin: '0', fontSize: t.size.sm, color: t.text.muted }),
    fileRow: Style.self({
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: t.space.sm,
      padding: `${t.space.xs} ${t.space.sm}`,
      border: `${t.border.thin} solid ${t.outline.subtle}`,
      borderRadius: t.radius.lg,
      background: t.surface.base,
    }),
    fileText: Style.self({ display: 'flex', flexDirection: 'column', minWidth: '0' }),
    fileName: Style.self({
      overflow: 'hidden',
      fontSize: t.size.sm,
      fontWeight: t.weight.medium,
      color: t.text.overt,
      textOverflow: 'ellipsis',
      whiteSpace: 'nowrap',
    }),
    fileSize: Style.self({ fontSize: t.size.xs, color: t.text.muted }),
    removeButton: Style.compose(
      Style.self({
        padding: '0',
        border: '0',
        background: 'transparent',
        font: 'inherit',
        fontSize: t.size.sm,
        color: t.text.muted,
        cursor: 'pointer',
      }),
      Style.pseudo(':hover', { color: t.error.ink }),
    ),
  },
  { name: 'FileDropPageStyle' },
)
