/**
 * A segmented control: a tray of toggle buttons where pressing selects. The
 * pressed option takes the accent's tint, flat: that rule lives on the group
 * (`> [aria-pressed="true"]`), so icon tiles take the group piece alone and
 * share it with text options. It is in the variants layer, so an option drawn
 * by another recipe (an icon button, whose own background is a variant) still
 * shows it. The tray sets no `display`: the Builder owns its narrow tabs'
 * visibility, and every other tray lays itself out.
 */
import { Style } from 'foldkit-mixins'
import { SegmentedSlots } from '../segmented.js'
import { component, hover, ref, variant } from './design.js'

const pressed = '[aria-pressed="true"]'
const lit = ':where([data-fluid-hover]) > &'
const at = (name: 'hover' | 'chosen', part: 'x' | 'y' | 'w' | 'h') =>
  `var(--fk-segmented-${name}-${part})`

const glide = (moving: string) => {
  const duration = `calc(${ref.motion.normal} * ${moving})`
  return {
    transitionProperty: 'translate, inline-size, block-size, opacity',
    transitionDuration: `${duration}, ${duration}, ${duration}, ${ref.motion.fast}`,
    transitionTimingFunction: `${ref.motion.spring}, ${ref.motion.spring}, ${ref.motion.spring}, ${ref.motion.ease}`,
  }
}

const overlay = (name: 'hover' | 'chosen') =>
  Style.self({
    position: 'absolute',
    // Physical: the Mounts measure from the left, in either direction.
    top: '0',
    left: '0',
    zIndex: '-1',
    display: 'none',
    inlineSize: at(name, 'w'),
    blockSize: at(name, 'h'),
    translate: `${at(name, 'x')} ${at(name, 'y')}`,
    borderRadius: ref.radius.sm,
    pointerEvents: 'none',
  })

export const Segmented = Style.recipeFor(SegmentedSlots)({
  base: {
    group: variant(
      // A positioned box for the indicator and highlight, under the options.
      Style.self({ position: 'relative', isolation: 'isolate' }),
      // One pressed rule for text and icon tiles alike; its fill is the
      // indicator's once `Segmented.fluid` runs.
      Style.nest(`> ${pressed}`, {
        boxShadow: 'none',
        color: ref.accent.ink,
        cursor: 'default',
        fontWeight: ref.weight.semibold,
      }),
      Style.nest(`&:not([data-fluid-hover]) > ${pressed}`, { background: ref.accent.subtle }),
    ),
    indicator: component(
      overlay('chosen'),
      Style.self({ background: ref.accent.subtle, ...glide('1') }),
      Style.nest(lit, { display: 'var(--fk-segmented-chosen-display, none)' }),
    ),
    highlight: component(
      overlay('hover'),
      Style.self({
        background: ref.accent.subtle,
        opacity: 'calc(0.4 * var(--fk-segmented-hover-shown))',
        ...glide('var(--fk-segmented-hover-moving)'),
      }),
      Style.nest(lit, { display: 'block' }),
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
