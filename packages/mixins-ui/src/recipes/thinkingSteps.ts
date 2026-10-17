/**
 * A trace of an assistant's steps under a quiet button: the button's words
 * shimmer while it works (the Thinking Indicator's sweep) and its chevron
 * turns as the list opens. The list and each step's detail open and shut by
 * a grid row between `0fr` and `1fr`, as the Accordion's panel does, with no
 * measured height. Each step's marker says its state: a hollow ring
 * waiting, a turning arc running, a check done, a cross failed; a step's
 * own icon stands in for the mark, tinted by the state. Every movement
 * travels, so reduced motion and a still theme hold it.
 *
 * The axes:
 *
 * - `variant`: `plain` (the default) on the page; `card` in a box.
 * - `connector`: `line` (the default) a hairline down from each marker to
 *   the next; `none`.
 */
import { Style } from 'foldkit-mixins'
import { ladder, role } from 'foldkit-mixins/theme'
import { Utilities } from 'foldkit-mixins/utilities'
import { ThinkingStepsSlots } from '../thinkingSteps.js'
import {
  component,
  cornerSides,
  focusRing,
  opensBelow,
  ref,
  transition,
  turning,
  turningChevron,
  variant,
} from './design.js'
import { shimmer } from './thinkingIndicator.js'

const open = '[data-open="true"]'
const size = 'var(--_fk-thinking-marker, 1rem)'
// How far a step's body stands in: past its marker, to its title.
const indent = `calc(${size} + ${ref.space.xs})`

// One bar of the cross, centred in the marker.
const bar = (turn: string) => ({
  content: '""',
  position: 'absolute',
  insetInlineStart: '15%',
  insetBlockStart: `calc(50% - ${ref.border.thick} / 2)`,
  inlineSize: '70%',
  blockSize: ref.border.thick,
  borderRadius: ref.radius.full,
  background: 'currentColor',
  rotate: turn,
})

const state = (name: string) => `&[data-state="${name}"]`
// A marker holding the step's own icon draws no mark of its own.
const marked = (name: string) => `${state(name)}:not(:has(> *))`

export const ThinkingSteps = Style.recipeFor(ThinkingStepsSlots)({
  base: {
    root: component(opensBelow(open), Style.self({ ...role('body') })),
    trigger: component(
      Style.self({
        display: 'inline-flex',
        alignItems: 'center',
        justifySelf: 'start',
        gap: ref.space.xs,
        padding: '0',
        border: '0',
        background: 'transparent',
        color: ref.text.muted,
        font: 'inherit',
        cursor: 'pointer',
        ...transition('color'),
      }),
      Style.pseudo(':hover', { color: ref.text.default }),
      focusRing,
    ),
    summary: component(shimmer('&[data-state="running"]')),
    chevron: component(turningChevron('[aria-expanded="true"]', '0.4em')),
    // The one grid row the root animates; it clips, so it holds no padding.
    panel: component(Style.self({ minBlockSize: '0', overflow: 'hidden' })),
    list: component(
      Style.self({
        display: 'grid',
        gap: ref.space.xs,
        margin: '0',
        padding: '0',
        listStyle: 'none',
      }),
    ),
    step: component(opensBelow(open), Style.self({ position: 'relative' })),
    head: component(
      Style.self({
        display: 'flex',
        alignItems: 'start',
        gap: ref.space.xs,
        inlineSize: '100%',
        padding: '0',
        border: '0',
        background: 'transparent',
        color: ref.text.default,
        font: 'inherit',
        textAlign: 'start',
      }),
      Style.nest('&:is(button)', { cursor: 'pointer' }),
      focusRing,
    ),
    marker: component(
      Style.self({
        position: 'relative',
        display: 'inline-grid',
        placeItems: 'center',
        flex: 'none',
        boxSizing: 'border-box',
        inlineSize: size,
        blockSize: size,
        // Centred on the title's first line.
        marginBlockStart: `calc((1lh - ${size}) / 2)`,
        borderRadius: ref.radius.full,
        color: ref.text.muted,
      }),
      Style.nest('& > *', { inlineSize: '100%', blockSize: '100%' }),
      Style.nest(marked('pending'), { border: `${ref.border.thin} solid ${ref.outline.overt}` }),
      Style.nest(marked('running'), {
        border: `${ref.border.thick} solid color-mix(in oklab, ${ref.accent.default} 20%, transparent)`,
        borderTopColor: ref.accent.default,
      }),
      turning(`calc(${ref.motion.slow} * 3)`, marked('running')),
      Style.nest(state('running'), { color: ref.accent.ink }),
      // A check: two sides of a box, turned.
      Style.nest(`${marked('done')}::after`, {
        content: '""',
        inlineSize: '30%',
        blockSize: '55%',
        marginBlockEnd: '15%',
        ...cornerSides(ref.border.thick, 'currentColor'),
        rotate: '45deg',
      }),
      Style.nest(state('done'), { color: ref.success.ink }),
      Style.nest(`${marked('failed')}::before`, bar('45deg')),
      Style.nest(`${marked('failed')}::after`, bar('-45deg')),
      Style.nest(state('failed'), { color: ref.error.ink }),
    ),
    title: component(Style.self({ flex: '1', minInlineSize: '0' })),
    state: component(Utilities.srOnly),
    duration: component(
      Style.self({
        flex: 'none',
        color: ref.text.muted,
        fontVariantNumeric: 'tabular-nums',
        ...role('caption'),
        lineHeight: 'inherit',
      }),
    ),
    // The step's one grid row; it clips, so its padding is inline alone.
    body: component(
      Style.self({ minBlockSize: '0', overflow: 'hidden', paddingInlineStart: indent }),
    ),
    detail: component(Style.self({ paddingBlockStart: ref.space['2xs'], color: ref.text.muted })),
  },
  variants: {
    variant: {
      plain: {},
      card: {
        root: variant(
          Style.self({
            padding: `${ladder('row-pad')} ${ladder('pad')}`,
            border: `${ref.border.thin} solid ${ref.outline.default}`,
            borderRadius: ref.radius.lg,
          }),
        ),
      },
    },
    connector: {
      line: {
        // From under the marker to the next step's, through the gap between.
        step: variant(
          Style.nest('&:not(:last-child)::before', {
            content: '""',
            position: 'absolute',
            insetInlineStart: `calc(${size} / 2 - ${ref.border.thin} / 2)`,
            insetBlockStart: `calc((1lh + ${size}) / 2 + ${ref.space['2xs']})`,
            insetBlockEnd: `calc(${ref.space['2xs']} - ${ref.space.xs})`,
            inlineSize: ref.border.thin,
            background: ref.outline.default,
          }),
        ),
      },
      none: {},
    },
  },
  defaults: { variant: 'plain', connector: 'line' },
})
