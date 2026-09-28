import { type Declarations, Slots, Style, type StylePieces, type StyleValue } from 'foldkit-mixins'
import { DialogSlots, Recipes } from 'foldkit-mixins-ui'

import { app, t } from '../../style.js'
import { comboboxSlots, comboboxStyles } from './combobox.js'
import { container, dangerLook, demoSlots, demoStyles, primaryLook, triggerLook } from './shared.js'

export const DialogPageSlots = Slots.define({
  ...demoSlots,
  ...comboboxSlots,
  demo: container,
  triggers: container,
  trigger: container,
  content: container,
  actions: container,
  cancelButton: container,
  confirmButton: container,
  dangerButton: container,
})

export const DialogPageStyle = Style.forSlots(DialogPageSlots)(
  {
    ...demoStyles,
    ...comboboxStyles,
    triggers: Style.self({ display: 'flex', gap: t.space.sm }),
    trigger: triggerLook,
    content: Style.self({ display: 'grid', gap: t.space.sm }),
    actions: Style.self({ display: 'flex', justifyContent: 'flex-end', gap: t.space.xs }),
    cancelButton: triggerLook,
    confirmButton: primaryLook,
    dangerButton: dangerLook,
  },
  { name: 'DialogPageStyle', layer: app },
)

/** The shipped Dialog recipe, centered, with upstream's lighter title. */
const centered = Recipes.Dialog.extend({
  base: {
    dialog: Style.pseudo('[open]', {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
    }),
    title: Style.self({ fontSize: t.size.lg, fontWeight: t.weight.normal }),
  },
})

/** Fades in while `@foldkit/ui` marks the backdrop and panel `data-closed`. */
const fade = (closed: Declarations): StyleValue =>
  Style.compose(
    Style.self({
      transitionProperty: 'opacity, scale',
      transitionDuration: t.motion.fast,
      transitionTimingFunction: t.motion.ease,
    }),
    Style.pseudo('[data-closed]', closed),
  )

const animated = centered.extend({
  base: { backdrop: fade({ opacity: '0' }), panel: fade({ opacity: '0', scale: '0.95' }) },
})

/**
 * Every dialog here closes from its action buttons, which take the page's
 * button looks, so the recipe's corner close button is left out.
 */
const withoutCornerClose = ({
  closeButton: _cornerCloseButton,
  ...pieces
}: StylePieces<typeof DialogSlots>): StylePieces<typeof DialogSlots> => pieces

export const DemoDialogStyle = Style.forSlots(DialogSlots)(
  withoutCornerClose(centered({ size: 'md' })),
  { name: 'DemoDialogStyle', layer: app },
)

export const ConfirmDialogStyle = Style.forSlots(DialogSlots)(
  withoutCornerClose(centered({ size: 'sm' })),
  { name: 'ConfirmDialogStyle', layer: app },
)

export const AnimatedDialogStyle = Style.forSlots(DialogSlots)(
  withoutCornerClose(animated({ size: 'md' })),
  { name: 'AnimatedDialogStyle', layer: app },
)
