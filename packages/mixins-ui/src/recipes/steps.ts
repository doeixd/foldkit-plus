/**
 * Steps: round numbered markers joined by a hairline. An upcoming marker is
 * outlined and muted, the current one tinted in the accent, a complete one
 * filled with a check drawn in CSS over its hidden number, and the line
 * after a complete step takes the accent. `orientation: 'horizontal'` lays
 * the steps in a row, the lines stretching between them;
 * `orientation: 'vertical'` stacks them, each line running down from under
 * its marker. The states fade on the fast tier; nothing moves.
 */
import { Style } from 'foldkit-mixins'
import { role } from 'foldkit-mixins/theme'
import { StepsSlots } from '../steps.js'
import {
  component,
  cornerSides,
  focusRing,
  ref,
  transition,
  unfilledHover,
  variant,
} from './design.js'

const complete = '[data-state="complete"]'
const current = '[data-state="current"]'
const upcoming = '[data-state="upcoming"]'

const markerSize = '1.75rem'

const stepLayout = Style.self({
  display: 'flex',
  alignItems: 'center',
  gap: ref.space.xs,
  minInlineSize: '0',
})

export const Steps = Style.recipeFor(StepsSlots)({
  base: {
    root: component(Style.self({ display: 'flex', margin: '0', padding: '0', listStyle: 'none' })),
    item: component(Style.self({ display: 'flex', minInlineSize: '0' })),
    step: component(stepLayout),
    trigger: component(
      stepLayout,
      Style.self({
        margin: `calc(-1 * ${ref.space['2xs']})`,
        padding: ref.space['2xs'],
        border: '0',
        borderRadius: ref.radius.md,
        background: 'transparent',
        color: 'inherit',
        font: 'inherit',
        textAlign: 'start',
        cursor: 'pointer',
        ...transition('background-color'),
      }),
      Style.pseudo(':hover', { background: unfilledHover }),
      focusRing,
    ),
    marker: component(
      Style.self({
        position: 'relative',
        display: 'grid',
        placeItems: 'center',
        flexShrink: '0',
        inlineSize: markerSize,
        blockSize: markerSize,
        borderRadius: ref.radius.full,
        border: `${ref.border.thin} solid ${ref.outline.default}`,
        ...role('caption'),
        fontWeight: ref.weight.medium,
        fontVariantNumeric: 'tabular-nums',
        ...transition('background-color, border-color, color'),
      }),
      Style.pseudo(upcoming, { color: ref.text.muted }),
      Style.pseudo(current, {
        borderColor: ref.accent.default,
        background: ref.accent.subtle,
        color: ref.accent.ink,
      }),
      // The number stays for the box's size; the check is drawn over it.
      Style.pseudo(complete, {
        borderColor: ref.accent.default,
        background: ref.accent.default,
        color: 'transparent',
      }),
      Style.nest(`&${complete}::after`, {
        content: '""',
        position: 'absolute',
        inlineSize: '0.3rem',
        blockSize: '0.6rem',
        ...cornerSides(ref.border.thick, ref.accent['on-fill']),
        rotate: '45deg',
        translate: '0 -10%',
      }),
    ),
    text: component(Style.self({ display: 'grid', minInlineSize: '0' })),
    title: component(
      Style.self({ ...role('body'), color: ref.text.default, ...transition('color') }),
      Style.pseudo(upcoming, { color: ref.text.muted }),
      Style.pseudo(current, { color: ref.text.overt, fontWeight: ref.weight.medium }),
    ),
    description: component(Style.self({ ...role('caption'), color: ref.text.muted })),
    connector: component(
      Style.self({ background: ref.outline.subtle, ...transition('background-color') }),
      Style.pseudo(complete, { background: ref.accent.default }),
    ),
  },
  variants: {
    orientation: {
      horizontal: {
        root: variant(Style.self({ alignItems: 'center', gap: ref.space.xs })),
        // Every step but the last grows, so the lines share the free width.
        item: variant(
          Style.self({ flex: '1 1 0', alignItems: 'center', gap: ref.space.xs }),
          Style.pseudo(':last-child', { flex: '0 0 auto' }),
        ),
        connector: variant(
          Style.self({ flex: '1', minInlineSize: ref.space.md, blockSize: ref.border.thick }),
        ),
      },
      vertical: {
        root: variant(Style.self({ flexDirection: 'column' })),
        item: variant(Style.self({ flexDirection: 'column' })),
        // Under the marker's center, as tall as the gap between two steps.
        connector: variant(
          Style.self({
            inlineSize: ref.border.thick,
            minBlockSize: ref.space.lg,
            marginBlock: ref.space['2xs'],
            marginInlineStart: `calc((${markerSize} - ${ref.border.thick}) / 2)`,
          }),
        ),
      },
    },
  },
  defaults: { orientation: 'horizontal' },
})
