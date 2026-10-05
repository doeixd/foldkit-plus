/**
 * A segmented control: a tray of toggle buttons where pressing selects. The
 * pressed option rises from the tray: that rule lives on the group
 * (`> [aria-pressed="true"]`), so icon tiles take the group piece alone and
 * share it with text options. The tray sets no `display`: the Builder owns
 * its narrow tabs' visibility, and every other tray lays itself out.
 */
import { Style } from 'foldkit-mixins'
import { SegmentedSlots } from '../segmented.js'
import { component, hover, ref, variant } from './design.js'

const pressed = '[aria-pressed="true"]'

export const Segmented = Style.recipeFor(SegmentedSlots)({
  base: {
    group: component(
      // One pressed rule for text and icon tiles alike.
      Style.nest(`> ${pressed}`, {
        background: ref.surface.base,
        boxShadow: ref.shadow.xs,
        color: ref.text.overt,
        cursor: 'default',
        fontWeight: ref.weight.semibold,
      }),
    ),
    option: component(
      Style.self({
        background: 'transparent',
        border: '0',
        borderRadius: ref.radius.sm,
        color: ref.text.muted,
        cursor: 'pointer',
        font: 'inherit',
        fontWeight: ref.weight.medium,
      }),
      hover({ color: ref.text.overt }),
    ),
  },
  variants: {
    tray: {
      tray: {
        group: variant(
          Style.self({
            background: ref.surface.muted,
            borderRadius: ref.radius.md,
            gap: '2px',
            padding: '2px',
          }),
        ),
      },
      plain: {
        group: variant(Style.self({ display: 'flex', gap: ref.space['3xs'] })),
      },
    },
    size: {
      sm: {
        option: variant(Style.self({ fontSize: ref.size.sm, padding: '0.4rem 0.75rem' })),
      },
      xs: {
        option: variant(Style.self({ fontSize: ref.size.xs, padding: '0.35rem 0.4rem' })),
      },
    },
  },
  defaults: { tray: 'tray', size: 'sm' },
})
