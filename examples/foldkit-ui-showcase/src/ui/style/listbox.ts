import { Slots, Style } from 'foldkit-mixins'

import { app, t } from '../../style.js'
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
 * `foldkit-mixins-ui` has no Listbox adapter: `@foldkit/ui` draws the
 * listbox's elements itself and takes only attributes for its button, items,
 * backdrop, separator and wrapper, so those are the page's own Slots. Each
 * option takes only a class name, so the options are styled from their
 * container, by the role and the `data-active` and `data-selected` the
 * component writes.
 */
export const ListboxPageSlots = Slots.define({
  ...demoSlots,
  field: container,
  label: container,
  listbox: container,
  button: container,
  buttonContent: container,
  buttonLabel: container,
  chevron: container,
  items: container,
  backdrop: container,
  separator: container,
  itemContent: container,
  checkIcon: container,
  itemLabel: container,
  groupHeading: container,
})

export const ListboxPageStyle = Style.forSlots(ListboxPageSlots)(
  {
    ...demoStyles,
    field: Style.self({
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'flex-start',
      gap: '0.375rem',
    }),
    label: Style.self({ fontSize: t.size.sm, fontWeight: t.weight.medium, color: t.text.default }),
    listbox: Style.self({ position: 'relative', display: 'inline-block' }),
    button: Style.compose(triggerLook, Style.self({ minWidth: '12rem' })),
    buttonContent: Style.self({
      display: 'flex',
      width: '100%',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: t.space.md,
    }),
    chevron: icon('1rem'),
    items: Style.compose(
      floatingPanel,
      Style.self({ width: '14rem', overflow: 'hidden' }),
      Style.nest('[role="option"]', {
        padding: `${t.space.xs} ${t.space.sm}`,
        color: t.text.default,
        cursor: 'pointer',
      }),
      Style.nest('[role="option"][data-active]', { background: t.surface.muted }),
    ),
    backdrop,
    separator: Style.self({ borderTop: `${t.border.thin} solid ${t.outline.subtle}` }),
    itemContent: Style.self({ display: 'flex', alignItems: 'center', gap: t.space.xs }),
    checkIcon: Style.compose(
      icon('1rem'),
      Style.self({ color: t.text.overt, visibility: 'hidden' }),
      Style.nest('[data-selected] &', { visibility: 'visible' }),
    ),
    groupHeading: Style.self({
      display: 'block',
      padding: `${t.space.sm} ${t.space.sm} 0.375rem`,
      fontSize: t.size.xs,
      fontWeight: t.weight.semibold,
      letterSpacing: '0.05em',
      textTransform: 'uppercase',
      color: t.text.muted,
    }),
  },
  { name: 'ListboxPageStyle', layer: app },
)
