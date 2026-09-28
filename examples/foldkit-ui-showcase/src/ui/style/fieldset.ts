import { Slots, Style } from 'foldkit-mixins'
import { FieldsetSlots } from 'foldkit-mixins-ui'

import { app, t } from '../../style.js'
import { checkRow, field } from './field.js'
import { container, demoSlots, demoStyles } from './shared.js'

export const FieldsetPageSlots = Slots.define({
  ...demoSlots,
  fields: container,
  field: container,
  checkField: container,
  checkRow: container,
})

export const FieldsetPageStyle = Style.forSlots(FieldsetPageSlots)(
  {
    ...demoStyles,
    fields: Style.self({
      display: 'flex',
      flexDirection: 'column',
      gap: t.space.md,
      marginTop: t.space.md,
    }),
    field,
    checkField: Style.self({ display: 'flex', flexDirection: 'column', gap: t.space['2xs'] }),
    checkRow,
  },
  { name: 'FieldsetPageStyle', layer: app },
)

/** `foldkit-mixins-ui` ships no Fieldset recipe; this is upstream's bordered group. */
export const DemoFieldsetStyle = Style.forSlots(FieldsetSlots)(
  {
    fieldset: Style.self({
      margin: '0',
      padding: t.space.lg,
      border: `${t.border.thin} solid ${t.outline.subtle}`,
      borderRadius: t.radius.lg,
    }),
    legend: Style.self({
      float: 'left',
      width: '100%',
      padding: '0',
      fontSize: t.size.md,
      fontWeight: t.weight.semibold,
      color: t.text.overt,
    }),
    description: Style.self({
      display: 'block',
      marginTop: t.space['2xs'],
      fontSize: t.size.sm,
      color: t.text.muted,
    }),
  },
  { name: 'DemoFieldsetStyle', layer: app },
)
