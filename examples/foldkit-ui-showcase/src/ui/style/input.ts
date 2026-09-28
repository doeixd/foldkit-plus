import { Slots, Style } from 'foldkit-mixins'

import { app } from '../../style.js'
import { demoColumn, field } from './field.js'
import { container, demoSlots, demoStyles } from './shared.js'

export const InputPageSlots = Slots.define({ ...demoSlots, demo: container, field: container })

export const InputPageStyle = Style.forSlots(InputPageSlots)(
  { ...demoStyles, demo: demoColumn, field },
  { name: 'InputPageStyle', layer: app },
)
