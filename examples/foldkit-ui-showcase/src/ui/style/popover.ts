import { Slots, Style } from 'foldkit-mixins'
import { PopoverSlots } from 'foldkit-mixins-ui'

import { app, t } from '../../style.js'
import {
  backdrop,
  container,
  demoSlots,
  demoStyles,
  fadeScale,
  floatingPanel,
  triggerLook,
} from './shared.js'

export const PopoverPageSlots = Slots.define({
  ...demoSlots,
  wrapper: container,
  triggerLabel: container,
  panelTitle: container,
  panelText: container,
  nestedBody: container,
})

export const PopoverPageStyle = Style.forSlots(PopoverPageSlots)(
  {
    ...demoStyles,
    wrapper: Style.self({ position: 'relative', display: 'inline-block' }),
    panelTitle: Style.self({
      margin: `0 0 ${t.space.xs}`,
      fontSize: t.size.sm,
      fontWeight: t.weight.semibold,
      color: t.text.overt,
    }),
    panelText: Style.self({ margin: '0', fontSize: t.size.sm, color: t.text.muted }),
    nestedBody: Style.self({ display: 'flex', flexDirection: 'column', gap: t.space.md }),
  },
  { name: 'PopoverPageStyle', layer: app },
)

const popover = {
  button: triggerLook,
  panel: Style.compose(floatingPanel, Style.self({ width: '16rem', padding: t.space.md })),
  backdrop,
} as const

/** `foldkit-mixins-ui` ships no Popover recipe; a trigger over a card. */
export const BasicPopoverStyle = Style.forSlots(PopoverSlots)(popover, {
  name: 'BasicPopoverStyle',
  layer: app,
})

/** The card fades and grows in while `@foldkit/ui` marks it `data-closed`. */
export const AnimatedPopoverStyle = Style.forSlots(PopoverSlots)(
  { ...popover, panel: Style.compose(popover.panel, fadeScale) },
  { name: 'AnimatedPopoverStyle', layer: app },
)
