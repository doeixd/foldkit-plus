import { Slots, Style } from 'foldkit-mixins'

import { forSlots, t } from '../../style.js'
import { checkRow } from './field.js'
import { container, demoSlots, demoStyles } from './shared.js'

export const CheckboxPageSlots = Slots.define({
  ...demoSlots,
  field: container,
  row: container,
  group: container,
  options: container,
})

export const CheckboxPageStyle = forSlots(CheckboxPageSlots)(
  {
    ...demoStyles,
    field: Style.self({ display: 'flex', flexDirection: 'column', gap: t.space['2xs'] }),
    row: checkRow,
    group: Style.self({ display: 'flex', flexDirection: 'column', gap: t.space.sm }),
    options: Style.self({
      display: 'flex',
      flexDirection: 'column',
      gap: t.space.sm,
      marginLeft: '1.75rem',
    }),
  },
  { name: 'CheckboxPageStyle' },
)
