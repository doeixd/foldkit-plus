/**
 * Timer: the time in tabular figures, its units apart by quiet separators,
 * and a row of presses on the size ladder below, the one that goes on (start,
 * pause, resume, restart) filled in the `tone` and reset outlined. `look:
 * 'tiles'` sets each unit in a box of its own, a countdown's clock face;
 * `progress: 'bar'` draws a bar under the time that fills as a `duration` is
 * counted, which travels, so reduced motion holds it at each tick. A
 * finished countdown takes the error ink, a paused one the muted. `size`
 * steps the figures from the body's role to the display's.
 */
import { Style, type StyleValue } from 'foldkit-mixins'
import { role } from 'foldkit-mixins/theme'
import { TimerSlots } from '../timer.js'
import {
  component,
  disabled,
  focusRing,
  hover,
  onLadder,
  ref,
  tones,
  toneVar,
  transition,
  travelled,
  unfilledHover,
  variant,
} from './design.js'

const figures = (name: 'body' | 'title' | 'display'): StyleValue =>
  variant(Style.self({ ...role(name) }))

export const Timer = Style.recipeFor(TimerSlots)({
  base: {
    root: component(
      Style.self({ display: 'inline-grid', justifyItems: 'start', gap: ref.space.xs }),
    ),
    label: component(Style.self({ color: ref.text.muted, ...role('caption') })),
    area: component(
      Style.self({
        display: 'flex',
        alignItems: 'baseline',
        gap: ref.space['2xs'],
        color: ref.text.overt,
        ...role('display'),
        fontWeight: ref.weight.semibold,
        fontVariantNumeric: 'tabular-nums',
      }),
      Style.nest('[data-state="paused"] > &', { color: ref.text.muted }),
      Style.nest('[data-state="done"] > &', { color: ref.error.ink }),
    ),
    separator: component(Style.self({ color: ref.text.muted })),
    controls: component(Style.self({ display: 'flex', gap: ref.space.xs })),
    action: component(
      Style.self({
        ...onLadder,
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: ref.radius.md,
        border: `${ref.border.thin} solid ${toneVar('line')}`,
        background: 'transparent',
        color: toneVar('ink'),
        fontWeight: ref.weight.medium,
        cursor: 'pointer',
        ...transition('background-color, color, border-color'),
      }),
      hover({ background: unfilledHover }),
      // The press that goes on is the filled one; reset stays outlined.
      Style.pseudo(':not([data-action="reset"])', {
        borderColor: 'transparent',
        background: toneVar('fill'),
        color: toneVar('on-fill'),
      }),
      Style.pseudo(':not([data-action="reset"]):hover:not([aria-disabled="true"])', {
        background: toneVar('fill-hover'),
      }),
      focusRing,
      disabled,
    ),
  },
  variants: {
    tone: {
      accent: { action: tones.accent },
      neutral: { action: tones.ink },
    },
    look: {
      plain: {},
      tiles: {
        item: variant(
          Style.self({
            minInlineSize: '2ch',
            paddingInline: ref.space.xs,
            borderRadius: ref.radius.md,
            background: ref.surface.muted,
            textAlign: 'center',
          }),
        ),
      },
    },
    progress: {
      none: {},
      bar: {
        // Under the time, the width of the whole timer, filled to what is counted.
        root: variant(
          Style.self({ position: 'relative', paddingBlockEnd: ref.space.xs }),
          Style.pseudo('::after', {
            content: '""',
            position: 'absolute',
            insetInlineStart: '0',
            insetBlockEnd: '0',
            inlineSize: 'calc(var(--fk-timer-progress, 0) * 100%)',
            blockSize: ref.border.thick,
            borderRadius: ref.radius.full,
            background: ref.accent.default,
            transitionProperty: 'inline-size',
            transitionDuration: travelled(ref.motion.slow),
            transitionTimingFunction: 'linear',
          }),
        ),
      },
    },
    size: {
      sm: { area: figures('body') },
      md: { area: figures('title') },
      lg: { area: figures('display') },
    },
  },
  defaults: { tone: 'accent', look: 'plain', progress: 'none' },
})
