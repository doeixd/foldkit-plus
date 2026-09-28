import { Slots, Style } from 'foldkit-mixins'

import { app, t } from '../../style.js'
import { gaugeSlots, gaugeStyles } from './gauge.js'
import { demoSlots, demoStyles } from './shared.js'

export const MeterPageSlots = Slots.define({ ...demoSlots, ...gaugeSlots })

/** Upstream draws the health bar emerald and the storage bar amber, by the bar's `data-tone`. */
export const MeterPageStyle = Style.forSlots(MeterPageSlots)(
  {
    ...demoStyles,
    ...gaugeStyles,
    bar: Style.compose(
      gaugeStyles.bar,
      Style.states(
        { success: { background: t.success.default }, warning: { background: t.warning.default } },
        'data-tone',
      ),
    ),
  },
  { name: 'MeterPageStyle', layer: app },
)
