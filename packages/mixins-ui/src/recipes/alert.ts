/**
 * An alert: a tinted band with an icon, a semibold title, and a muted
 * description. The tone axis picks the feedback family; everything else is
 * shared. Tones read the family's `subtle` fill and `ink`, like Badge.
 */
import { Style, type StyleValue } from 'foldkit-mixins'
import { AlertSlots, type AlertTone } from '../alert.js'
import { component, ref, variant } from './design.js'

const toned = (tone: AlertTone): StyleValue =>
  variant(
    Style.self({
      background: ref[tone].subtle,
      color: ref[tone].ink,
    }),
  )

export const Alert = Style.recipeFor(AlertSlots)({
  base: {
    root: component(
      Style.self({
        display: 'flex',
        gap: ref.space.sm,
        padding: ref.space.md,
        borderRadius: ref.radius.md,
      }),
    ),
    icon: component(Style.self({ flex: 'none' })),
    title: component(
      Style.self({
        margin: '0',
        fontSize: ref.size.sm,
        fontWeight: ref.weight.semibold,
      }),
    ),
    description: component(
      Style.self({ margin: '0', marginBlockStart: ref.space['3xs'], fontSize: ref.size.sm }),
    ),
  },
  variants: {
    tone: {
      info: { root: toned('info') },
      success: { root: toned('success') },
      warning: { root: toned('warning') },
      error: { root: toned('error') },
    },
  },
  defaults: { tone: 'info' },
})
