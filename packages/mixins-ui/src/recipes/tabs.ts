/**
 * Tabs: the selected tab is `aria-selected`, which `@foldkit/ui` writes.
 * `variant` is an underline under a rule or a pill in a tray; `size` the
 * tabs' step on the size ladder. Drawn with its `indicator` and `highlight`, and given
 * `Tabs.fluid`, the underline or pill glides to the chosen tab and a hover
 * follows the pointer; until `Tabs.fluid` runs, the chosen tab marks itself.
 */
import { Style } from 'foldkit-mixins'
import { TabsSlots } from '../tabs.js'
import {
  component,
  disabled,
  focusRing,
  glide,
  hover,
  onLadder,
  ref,
  steps,
  transition,
  trimmed,
  unfilledHover,
  variant,
} from './design.js'

const selected = '[aria-selected="true"]'
/** Where `Tabs.fluid` runs; a tablist marks it while its highlight follows the pointer. */
const fluid = ':where([data-fluid-hover]) > &'
/** A chosen tab marks itself until `Tabs.fluid` moves the indicator. */
const marked = `:where(:not([data-fluid-hover])) > &${selected}`

const hovered = (part: 'x' | 'y' | 'w' | 'h' | 'shown' | 'moving') => `var(--fk-tabs-hover-${part})`
const chosen = (part: 'x' | 'y' | 'w' | 'h' | 'display') =>
  part === 'display' ? 'var(--fk-tabs-chosen-display, none)' : `var(--fk-tabs-chosen-${part})`

const overlay = {
  position: 'absolute',
  // Physical: the Mounts measure from the left, in either direction.
  top: '0',
  left: '0',
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
        display: 'none',
        zIndex: '-1',
        ...glide('moderate', '1'),
      }),
      Style.nest(fluid, { display: chosen('display') }),
    ),
    highlight: component(
      Style.self({
        ...overlay,
        display: 'none',
        zIndex: '-1',
        inlineSize: hovered('w'),
        blockSize: hovered('h'),
        translate: `${hovered('x')} ${hovered('y')}`,
        opacity: hovered('shown'),
        borderRadius: ref.radius.md,
        background: unfilledHover,
        ...glide('fast', hovered('moving')),
      }),
      Style.nest(fluid, { display: 'block' }),
    ),
    tab: component(
      Style.self({
        position: 'relative',
        ...onLadder,
        ...trimmed,
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
        // The hover is the chosen pill, faint, as if it were trying the tab on.
        highlight: variant(
          Style.self({
            background: ref.accent.subtle,
            opacity: `calc(0.4 * ${hovered('shown')})`,
          }),
        ),
      },
    },
    size: {
      sm: { tablist: steps.sm },
      md: { tablist: steps.md },
    },
  },
  defaults: { variant: 'line' },
})
