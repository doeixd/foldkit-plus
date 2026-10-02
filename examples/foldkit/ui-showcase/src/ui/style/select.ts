import { Slots, Style } from 'foldkit-mixins'
import { SelectSlots } from 'foldkit-mixins-ui'

import { forSlots, t } from '../../style.js'
import { demoColumn, field } from './field.js'
import { container, demoSlots, demoStyles, icon, triggerLook } from './shared.js'

export const SelectPageSlots = Slots.define({
  ...demoSlots,
  demo: container,
  field: container,
  selectFrame: container,
  option: container,
  chevron: container,
  chevronIcon: container,
})

export const SelectPageStyle = forSlots(SelectPageSlots)(
  {
    ...demoStyles,
    demo: demoColumn,
    field,
    selectFrame: Style.self({ position: 'relative', width: '100%' }),
    chevron: Style.self({
      position: 'absolute',
      top: '50%',
      right: t.space.sm,
      display: 'flex',
      translate: '0 -50%',
      color: t.text.muted,
      pointerEvents: 'none',
    }),
    chevronIcon: icon('1rem'),
  },
  { name: 'SelectPageStyle' },
)

/**
 * `foldkit-mixins-ui` ships no Select recipe, so the native control takes the
 * trigger look every other button on the page has.
 */
export const DemoSelectStyle = forSlots(SelectSlots)(
  {
    select: Style.compose(
      triggerLook,
      Style.self({
        appearance: 'none',
        justifyContent: 'flex-start',
        width: '100%',
        padding: `${t.space.xs} ${t.space.md}`,
      }),
      Style.pseudo(':focus', {
        outline: 'none',
        borderColor: t.accent.default,
        boxShadow: `0 0 0 1px ${t.accent.default}`,
      }),
    ),
    label: Style.self({ fontSize: t.size.sm, fontWeight: t.weight.medium, color: t.text.default }),
    description: Style.self({ fontSize: t.size.sm, color: t.text.muted }),
  },
  { name: 'DemoSelectStyle' },
)
