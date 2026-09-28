import { Slots, Style } from 'foldkit-mixins'
import { Recipes, SwitchSlots } from 'foldkit-mixins-ui'

import { forSlots, t } from '../../style.js'
import { container, demoSlots, demoStyles } from './shared.js'

export const SwitchPageSlots = Slots.define({
  ...demoSlots,
  demo: container,
  row: container,
  text: container,
})

export const SwitchPageStyle = forSlots(SwitchPageSlots)(
  {
    ...demoStyles,
    demo: Style.self({ marginTop: t.space.md }),
    row: Style.self({ display: 'flex', alignItems: 'center', gap: t.space.sm }),
  },
  { name: 'SwitchPageStyle' },
)

export const DemoSwitchStyle = forSlots(SwitchSlots)(
  Recipes.Switch.extend({
    base: {
      label: Style.self({ fontSize: t.size.sm, color: t.text.overt, userSelect: 'none' }),
      description: Style.self({ margin: '0', fontSize: t.size.sm, color: t.text.muted }),
    },
  })({ size: 'lg' }),
  { name: 'DemoSwitchStyle' },
)
