/**
 * Steps: round numbered markers joined by a hairline. An upcoming marker is
 * outlined and muted, the current one tinted in the accent, a complete one
 * filled with a check drawn in CSS over its hidden number, and the line
 * after a complete step takes the accent. `orientation: 'horizontal'` lays
 * the steps in a row as wide as its container, the lines stretching between
 * them, and below 32rem only the current step's label shows;
 * `orientation: 'vertical'` stacks them, each line running down from under
 * its marker beside the step's content. The states fade on the fast tier;
 * nothing moves. `size` sets the marker on the Avatar's steps: `sm` 1.5rem,
 * `md` 1.75rem (the default), `lg` 2.5rem. A step's icon in the marker is
 * hidden under the check once the step is complete. The horizontal row
 * draws no step's `content`, having no room under each step for it.
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

const markerSize = 'var(--_fk-steps-marker)'

const marker = (size: string, fontSize: string) => ({
  root: variant(Style.self({ '--_fk-steps-marker': size, '--_fk-steps-marker-text': fontSize })),
})

// From the top, so every title starts on its marker's line however long the
// text under it; centered, a step with a description stood its title higher.
const stepLayout = Style.self({
  display: 'flex',
  alignItems: 'start',
  gap: ref.space.xs,
  minInlineSize: '0',
})

// Below this width a row of steps has no room for every label: only the
// current step's shows, and the others stay for a screen reader.
const narrow = '@container (max-width: 32rem)'

export const Steps = Style.recipeFor(StepsSlots)({
  base: {
    root: component(
      Style.self({
        display: 'flex',
        margin: '0',
        padding: '0',
        listStyle: 'none',
        '--_fk-steps-marker': '1.75rem',
      }),
    ),
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
        fontSize: `var(--_fk-steps-marker-text, ${role('caption').fontSize})`,
        fontWeight: ref.weight.medium,
        fontVariantNumeric: 'tabular-nums',
        ...transition('background-color, border-color, color'),
      }),
      // An icon a step draws, sized to the marker's text as a glyph is.
      Style.nest('& > *', { inlineSize: '1.15em', blockSize: '1.15em' }),
      Style.nest(`&${complete} > *`, { visibility: 'hidden' }),
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
      Style.self({
        ...role('body'),
        // The first line centered on the marker beside it.
        marginBlockStart: `max(0px, (${markerSize} - 1lh) / 2)`,
        color: ref.text.default,
        ...transition('color'),
      }),
      Style.pseudo(upcoming, { color: ref.text.muted }),
      Style.pseudo(current, { color: ref.text.overt, fontWeight: ref.weight.medium }),
    ),
    description: component(Style.self({ ...role('caption'), color: ref.text.muted })),
    content: component(Style.self({ minInlineSize: '0', color: ref.text.default })),
    connector: component(
      Style.self({ background: ref.outline.subtle, ...transition('background-color') }),
      Style.pseudo(complete, { background: ref.accent.default }),
    ),
  },
  variants: {
    orientation: {
      horizontal: {
        // The row is the container its narrow layout asks about, so it takes
        // its container's width rather than its content's.
        root: variant(
          Style.self({
            alignItems: 'start',
            gap: ref.space.xs,
            inlineSize: '100%',
            containerType: 'inline-size',
          }),
        ),
        // Every step but the last grows, so the lines share the free width.
        item: variant(
          Style.self({ flex: '1 1 0', alignItems: 'start', gap: ref.space.xs }),
          Style.pseudo(':last-child', { flex: '0 0 auto' }),
        ),
        text: variant(
          Style.at(
            narrow,
            Style.nest(':where([data-state]:not([aria-current="step"])) > * > &', {
              position: 'absolute',
              width: '1px',
              height: '1px',
              margin: '-1px',
              overflow: 'hidden',
              clip: 'rect(0, 0, 0, 0)',
              whiteSpace: 'nowrap',
            }),
          ),
        ),
        content: variant(Style.self({ display: 'none' })),
        // On the markers' middle line, wherever the text below them ends.
        connector: variant(
          Style.self({
            flex: '1',
            minInlineSize: ref.space.md,
            blockSize: ref.border.thick,
            marginBlockStart: `calc((${markerSize} - ${ref.border.thick}) / 2)`,
          }),
        ),
      },
      vertical: {
        root: variant(Style.self({ flexDirection: 'column' })),
        // The marker's column, then the text's: the step spans both, and
        // under it the line keeps the marker's column beside the content.
        item: variant(
          Style.self({
            display: 'grid',
            gridTemplateColumns: `${markerSize} minmax(0, 1fr)`,
            columnGap: ref.space.xs,
          }),
        ),
        step: variant(Style.self({ gridColumn: '1 / -1' })),
        trigger: variant(Style.self({ gridColumn: '1 / -1' })),
        content: variant(
          Style.self({
            gridColumn: '2',
            gridRow: '2',
            paddingBlock: `${ref.space['2xs']} ${ref.space.sm}`,
          }),
        ),
        // Under the marker's center, as tall as the gap between two steps,
        // or as the content beside it.
        connector: variant(
          Style.self({
            gridColumn: '1',
            gridRow: '2',
            justifySelf: 'center',
            inlineSize: ref.border.thick,
            minBlockSize: ref.space.lg,
            marginBlock: ref.space['2xs'],
          }),
        ),
      },
    },
    size: {
      sm: marker('1.5rem', ref.size.xs),
      md: marker('1.75rem', role('caption').fontSize),
      lg: marker('2.5rem', ref.size.sm),
    },
  },
  defaults: { orientation: 'horizontal' },
})
