import { Slots, Style } from 'foldkit-mixins'
import { TooltipSlots } from 'foldkit-mixins-ui'

import { forSlots, t } from '../../style.js'
import { container, demoSlots, demoStyles, shadow, triggerLook } from './shared.js'

export const TooltipPageSlots = Slots.define({
  ...demoSlots,
  wrapper: container,
  triggerLabel: container,
  panelText: container,
})

export const TooltipPageStyle = forSlots(TooltipPageSlots)(
  { ...demoStyles, wrapper: Style.self({ position: 'relative', display: 'inline-block' }) },
  { name: 'TooltipPageStyle' },
)

/** `foldkit-mixins-ui` ships no Tooltip recipe; this is upstream's dark label. */
export const DemoTooltipStyle = forSlots(TooltipSlots)(
  {
    trigger: triggerLook,
    panel: Style.self({
      padding: `0.375rem ${t.space.sm}`,
      borderRadius: t.radius.md,
      background: t.surface.bedrock,
      fontSize: t.size.sm,
      color: t.surface.base,
      boxShadow: shadow.lg,
    }),
  },
  { name: 'DemoTooltipStyle' },
)
