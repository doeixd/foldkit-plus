import { Slots, Style } from 'foldkit-mixins'
import { FieldsetSlots, Recipes } from 'foldkit-mixins-ui'

import { forSlots, t } from '../../style.js'
import { checkRow, field } from './field.js'
import { container, demoSlots, demoStyles } from './shared.js'

export const FieldsetPageSlots = Slots.define({
  ...demoSlots,
  fields: container,
  field: container,
  checkField: container,
  checkRow: container,
})

export const FieldsetPageStyle = forSlots(FieldsetPageSlots)(
  {
    ...demoStyles,
    fields: Style.self({
      display: 'flex',
      flexDirection: 'column',
      gap: t.space.md,
    }),
    field,
    checkField: Style.self({ display: 'flex', flexDirection: 'column', gap: t.space['2xs'] }),
    checkRow,
  },
  { name: 'FieldsetPageStyle' },
)

/** Upstream's bordered group. */
export const DemoFieldsetStyle = forSlots(FieldsetSlots)(
  Recipes.Fieldset({ variant: 'bordered' }),
  {
    name: 'DemoFieldsetStyle',
  },
)
