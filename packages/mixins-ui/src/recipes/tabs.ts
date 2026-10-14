/**
 * Tabs: the selected tab is `aria-selected`, which `@foldkit/ui` writes.
 * `variant` is an underline under a rule or a pill in a tray; `size` the
 * density of each tab. Drawn with its `indicator` and `highlight` (and
 * `Tabs.fluid`), the underline or pill glides to the chosen tab and a hover
 * follows the pointer; without them, the chosen tab marks itself.
 */
import { Style } from 'foldkit-mixins'
import { TabsSlots } from '../tabs.js'
import {
  component,
  density,
  disabled,
  focusRing,
  ref,
  transition,
  unfilledHover,
  variant,
  hover,
} from './design.js'

const selected = '[aria-selected="true"]'
/** A chosen tab marks itself only where no indicator is drawn for it. */
const marked = `:where(:not(:has(> [data-tabs-indicator]))) > &${selected}`

const hovered = (part: 'x' | 'y' | 'w' | 'h' | 'shown' | 'moving') => `var(--fk-tabs-hover-${part})`
const chosen = (part: 'x' | 'y' | 'w' | 'h' | 'display') =>
  part === 'display' ? 'var(--fk-tabs-chosen-display, none)' : `var(--fk-tabs-chosen-${part})`

/** A travel that springs, scaled by `scale` so a highlight appearing lands where it is. */
const travel = (scale: string) => {
  const moving = `calc(${ref.motion.normal} * ${scale})`
  return {
    transitionProperty: 'translate, inline-size, block-size, opacity',
    transitionDuration: `${moving}, ${moving}, ${moving}, ${ref.motion.fast}`,
    transitionTimingFunction: `${ref.motion.spring}, ${ref.motion.spring}, ${ref.motion.spring}, ${ref.motion.ease}`,
  }
}

const overlay = {
  position: 'absolute',
  insetBlockStart: '0',
  insetInlineStart: '0',
  pointerEvents: 'none',
} as const

export const Tabs = Style.recipeFor(TabsSlots)({
  base: {
    tablist: component(
      Style.self({
        position: 'relative',
        display: 'flex',
        gap: ref.space['2xs'],
        isolation: 'isolate',
      }),
    ),
    indicator: component(
      Style.self({
        ...overlay,
        display: chosen('display'),
        zIndex: '-1',
        ...travel('1'),
      }),
    ),
    highlight: component(
      Style.self({
        ...overlay,
        zIndex: '-1',
        inlineSize: hovered('w'),
        blockSize: hovered('h'),
        translate: `${hovered('x')} ${hovered('y')}`,
        opacity: hovered('shown'),
        borderRadius: ref.radius.md,
        background: unfilledHover,
        ...travel(hovered('moving')),
      }),
    ),
    tab: component(
      Style.self({
        position: 'relative',
        border: '0',
        background: 'transparent',
        color: ref.text.muted,
        font: 'inherit',
        fontWeight: ref.weight.medium,
        cursor: 'pointer',
        ...transition('background-color, color, box-shadow'),
      }),
      hover({ color: ref.text.overt }),
      Style.pseudo(selected, { color: ref.text.overt }),
      focusRing,
      disabled,
    ),
    panel: component(Style.self({ paddingBlock: ref.space.md })),
  },
  variants: {
    variant: {
      line: {
        tablist: variant(
          Style.self({
            boxShadow: `inset 0 calc(-1 * ${ref.border.thin}) 0 ${ref.outline.default}`,
          }),
        ),
        tab: variant(
          Style.nest(marked, {
            boxShadow: `inset 0 calc(-1 * ${ref.border.thick}) 0 ${ref.accent.default}`,
          }),
        ),
        // A rule under the chosen tab, at its foot.
        indicator: variant(
          Style.self({
            inlineSize: chosen('w'),
            blockSize: ref.border.thick,
            translate: `${chosen('x')} calc(${chosen('y')} + ${chosen('h')} - ${ref.border.thick})`,
            background: ref.accent.default,
          }),
        ),
      },
      pill: {
        tablist: variant(
          Style.self({
            inlineSize: 'fit-content',
            padding: ref.space['3xs'],
            borderRadius: ref.radius.lg,
            background: ref.surface.muted,
          }),
        ),
        tab: variant(
          Style.self({ borderRadius: ref.radius.md }),
          // The accent's tint and ink, as a pressed Segmented option: the base
          // surface on the tray barely differed from it in a dark scheme.
          Style.pseudo(selected, { color: ref.accent.ink }),
          Style.nest(marked, { background: ref.accent.subtle }),
        ),
        // The chosen tab's pill, under it; it dims while another tab is hovered.
        indicator: variant(
          Style.self({
            inlineSize: chosen('w'),
            blockSize: chosen('h'),
            translate: `${chosen('x')} ${chosen('y')}`,
            borderRadius: ref.radius.md,
            background: ref.accent.subtle,
            opacity: `calc(1 - 0.15 * ${hovered('shown')})`,
          }),
        ),
      },
    },
    size: {
      sm: { tab: density(ref.space['2xs'], ref.space.sm, ref.size.sm) },
      md: { tab: density(ref.space.xs, ref.space.md, ref.size.md) },
    },
  },
  defaults: { variant: 'line', size: 'md' },
})
