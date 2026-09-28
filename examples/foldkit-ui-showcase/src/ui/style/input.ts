import { Slots } from 'foldkit-mixins'

import { forSlots } from '../../style.js'
import { demoColumn, field } from './field.js'
import { container, demoSlots, demoStyles } from './shared.js'

export const InputPageSlots = Slots.define({ ...demoSlots, demo: container, field: container })

export const InputPageStyle = forSlots(InputPageSlots)(
  { ...demoStyles, demo: demoColumn, field },
  { name: 'InputPageStyle' },
)
