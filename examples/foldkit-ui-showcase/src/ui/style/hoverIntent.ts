import { Slots, Style } from 'foldkit-mixins'
import { HoverIntentSlots } from 'foldkit-mixins-ui'

import { app, t } from '../../style.js'
import { container, demoSlots, demoStyles, floatingPanel, primaryLook } from './shared.js'

export const HoverIntentPageSlots = Slots.define({
  ...demoSlots,
  intro: container,
  wrapper: container,
  panelTitle: container,
  panelText: container,
})

export const HoverIntentPageStyle = Style.forSlots(HoverIntentPageSlots)(
  {
    ...demoStyles,
    intro: Style.self({
      maxWidth: '36rem',
      margin: `0 0 ${t.space.md}`,
      fontSize: t.size.sm,
      color: t.text.muted,
    }),
    wrapper: Style.self({ position: 'relative', display: 'inline-block' }),
    panelTitle: Style.self({
      margin: '0',
      fontSize: t.size.sm,
      fontWeight: t.weight.medium,
      color: t.text.overt,
    }),
    panelText: Style.self({
      margin: `${t.space['2xs']} 0 0`,
      fontSize: t.size.sm,
      lineHeight: '1.25rem',
      color: t.text.muted,
    }),
  },
  { name: 'HoverIntentPageStyle', layer: app },
)

/** `foldkit-mixins-ui` ships no HoverIntent recipe; an accent trigger over a card. */
export const DemoHoverIntentStyle = Style.forSlots(HoverIntentSlots)(
  {
    trigger: Style.compose(primaryLook, Style.self({ fontSize: t.size.sm })),
    panel: Style.compose(
      floatingPanel,
      Style.self({
        position: 'absolute',
        top: '100%',
        left: '0',
        width: '18rem',
        marginTop: t.space.xs,
        padding: t.space.md,
      }),
    ),
  },
  { name: 'DemoHoverIntentStyle', layer: app },
)
