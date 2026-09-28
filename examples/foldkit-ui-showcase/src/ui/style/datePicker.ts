import { Slots, Style } from 'foldkit-mixins'

import { app, t } from '../../style.js'
import { calendarGridSlots, calendarGridStyles } from './calendarGrid.js'
import {
  backdrop,
  container,
  demoSlots,
  demoStyles,
  floatingPanel,
  icon,
  triggerLook,
} from './shared.js'

/**
 * `foldkit-mixins-ui` has no DatePicker adapter: `@foldkit/ui` draws the
 * picker's trigger, panel and backdrop itself and takes only attributes for
 * them, so they are the page's own Slots.
 */
export const DatePickerPageSlots = Slots.define({
  ...demoSlots,
  ...calendarGridSlots,
  picker: container,
  trigger: container,
  triggerContent: container,
  placeholder: container,
  dateLabel: container,
  triggerIcon: container,
  panel: container,
  backdrop: container,
})

export const DatePickerPageStyle = Style.forSlots(DatePickerPageSlots)(
  {
    ...demoStyles,
    ...calendarGridStyles,
    picker: Style.self({ position: 'relative', display: 'inline-block' }),
    trigger: Style.compose(
      triggerLook,
      Style.self({ justifyContent: 'space-between', minWidth: '12rem' }),
    ),
    triggerContent: Style.self({
      display: 'flex',
      width: '100%',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: t.space.md,
    }),
    placeholder: Style.self({ color: t.text.muted }),
    triggerIcon: icon('1rem'),
    panel: Style.compose(
      floatingPanel,
      Style.self({ padding: t.space.md, borderRadius: t.radius.xl }),
    ),
    backdrop,
  },
  { name: 'DatePickerPageStyle', layer: app },
)
