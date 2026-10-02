/**
 * What the Meter and Progress pages share: a labelled row over a rounded
 * track and the bar that fills it.
 */
import { Style } from 'foldkit-mixins'

import { t } from '../../style.js'
import { container } from './shared.js'

export const gaugeSlots = {
  row: container,
  header: container,
  label: container,
  value: container,
  track: container,
  bar: container,
} as const

export const gaugeStyles = {
  row: Style.self({
    display: 'flex',
    flexDirection: 'column',
    gap: t.space.xs,
    width: '100%',
    maxWidth: '24rem',
  }),
  header: Style.self({
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    fontSize: t.size.sm,
  }),
  label: Style.self({ fontWeight: t.weight.medium, color: t.text.overt }),
  value: Style.self({ fontVariantNumeric: 'tabular-nums', color: t.text.muted }),
  track: Style.self({
    width: '100%',
    height: '0.75rem',
    overflow: 'hidden',
    borderRadius: t.radius.full,
    background: t.surface.default,
  }),
  bar: Style.self({ height: '100%', borderRadius: t.radius.full, background: t.accent.default }),
} as const
