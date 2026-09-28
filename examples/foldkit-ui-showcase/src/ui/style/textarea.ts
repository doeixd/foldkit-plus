import { Slots, Style } from 'foldkit-mixins'

import { app } from '../../style.js'
import { demoColumn, field } from './field.js'
import { container, demoSlots, demoStyles } from './shared.js'

export const TextareaPageSlots = Slots.define({ ...demoSlots, demo: container, field: container })

export const TextareaPageStyle = Style.forSlots(TextareaPageSlots)(
  { ...demoStyles, demo: demoColumn, field },
  { name: 'TextareaPageStyle', layer: app },
)
