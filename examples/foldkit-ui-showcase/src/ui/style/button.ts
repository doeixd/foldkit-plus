import { Slots, Style } from 'foldkit-mixins'
import { ButtonSlots, Recipes } from 'foldkit-mixins-ui'

import { app, t } from '../../style.js'
import { container, demoSlots, demoStyles, shadow } from './shared.js'

export const ButtonPageSlots = Slots.define({ ...demoSlots, demo: container, count: container })

export const ButtonPageStyle = Style.forSlots(ButtonPageSlots)(
  {
    ...demoStyles,
    demo: Style.self({
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'flex-start',
      gap: t.space.xs,
    }),
    count: Style.self({ fontSize: t.size.sm, color: t.text.muted }),
  },
  { name: 'ButtonPageStyle', layer: app },
)

/** The shipped Button recipe, a little rounder and heavier, as upstream's is. */
export const DemoButtonStyle = Style.forSlots(ButtonSlots)(
  Recipes.Button.extend({
    base: {
      button: Style.self({
        borderRadius: t.radius.lg,
        fontWeight: t.weight.semibold,
        boxShadow: shadow.sm,
      }),
    },
  })({ tone: 'accent', variant: 'solid', size: 'md' }),
  { name: 'DemoButtonStyle', layer: app },
)
