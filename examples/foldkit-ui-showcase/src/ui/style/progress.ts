import { Slots, Style } from 'foldkit-mixins'

import { app } from '../../style.js'
import { gaugeSlots, gaugeStyles } from './gauge.js'
import { container, demoSlots, demoStyles } from './shared.js'

export const ProgressPageSlots = Slots.define({ ...demoSlots, ...gaugeSlots, fill: container })

const pulse = Style.keyframes({ '50%': { opacity: '0.5' } })

/** The indeterminate bar, which has no value, is a third of the track and pulses. */
export const ProgressPageStyle = Style.forSlots(ProgressPageSlots)(
  {
    ...demoStyles,
    ...gaugeStyles,
    fill: Style.self({ width: '100%', height: '100%' }),
    bar: Style.compose(
      gaugeStyles.bar,
      pulse.style,
      Style.pseudo('[data-indeterminate]', {
        width: '33.333%',
        animation: `${pulse.name} 2s cubic-bezier(0.4, 0, 0.6, 1) infinite`,
      }),
    ),
  },
  { name: 'ProgressPageStyle', layer: app },
)
