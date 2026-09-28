import { Slots, Style } from 'foldkit-mixins'

import { app, t } from '../../style.js'
import { container, demoSlots, demoStyles, triggerLook } from './shared.js'

/**
 * `foldkit-mixins-ui` has no Animation adapter; `@foldkit/ui` takes
 * attributes for the element it animates, so that is the page's own Slot,
 * styled by the `data-closed` the component writes while it enters and
 * leaves.
 */
export const AnimationPageSlots = Slots.define({
  ...demoSlots,
  controls: container,
  toggle: container,
  stage: container,
  content: container,
  contentText: container,
})

export const AnimationPageStyle = Style.forSlots(AnimationPageSlots)(
  {
    ...demoStyles,
    controls: Style.self({ display: 'flex', gap: t.space.sm }),
    toggle: triggerLook,
    stage: Style.self({ marginTop: t.space.md }),
    content: Style.compose(
      Style.self({
        padding: t.space.md,
        border: `${t.border.thin} solid color-mix(in oklch, ${t.accent.default} 25%, ${t.surface.base})`,
        borderRadius: t.radius.lg,
        background: t.accent.subtle,
        transitionProperty: 'opacity, scale, translate',
        transitionDuration: '200ms',
        transitionTimingFunction: t.motion.ease,
      }),
      Style.pseudo('[data-closed]', { opacity: '0', scale: '0.95', translate: '0 -0.5rem' }),
    ),
    contentText: Style.self({ margin: '0', color: t.accent.ink }),
  },
  { name: 'AnimationPageStyle', layer: app },
)
