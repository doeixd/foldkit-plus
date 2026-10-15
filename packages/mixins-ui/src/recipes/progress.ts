/**
 * Progress: `shape: 'bar'` is a rounded track whose fill grows on the
 * moderate tier, `shape: 'ring'` is Circular Progress, a ring whose arc is
 * the root's `--fk-progress` turned into a conic gradient. Not known, the
 * bar's fill slides through the track toward its inline end, leftward right
 * to left, and the ring's quarter arc turns;
 * reduced motion holds them still (each loop lasts `travelled`, 0 there,
 * which runs no animation), the bar's fill faint across the track.
 */
import { Style } from 'foldkit-mixins'
import { role } from 'foldkit-mixins/theme'
import { ProgressSlots } from '../progress.js'
import { component, ref, travelled, variant } from './design.js'

const unknown = '[data-state="indeterminate"]'

const slide = Style.keyframes({
  from: { translate: '-100% 0' },
  to: { translate: '250% 0' },
})

// `translate` is physical while the fill starts at the inline start: right
// to left it starts on the right, and sweeps left.
const slideBack = Style.keyframes({
  from: { translate: '100% 0' },
  to: { translate: '-250% 0' },
})

const sweep = (name: string) =>
  `${name} ${travelled(`calc(${ref.motion.slow} * 6)`)} ${ref.motion.ease} infinite`

const turn = Style.keyframes({
  from: { rotate: '0deg' },
  to: { rotate: '360deg' },
})

const ringSize = '2.5rem'
const ringWidth = '0.25rem'

export const Progress = Style.recipeFor(ProgressSlots)({
  base: {
    root: component(Style.self({ display: 'grid', gap: ref.space['2xs'] })),
    label: component(Style.self({ ...role('caption'), color: ref.text.muted })),
    track: component(
      Style.self({ position: 'relative', overflow: 'hidden', borderRadius: ref.radius.full }),
    ),
    indicator: component(Style.self({ blockSize: '100%', background: ref.accent.default })),
  },
  variants: {
    shape: {
      bar: {
        root: variant(Style.self({ inlineSize: 'min(20rem, 100%)' })),
        track: variant(Style.self({ blockSize: '0.5rem', background: ref.outline.subtle })),
        indicator: variant(
          Style.self({
            borderRadius: ref.radius.full,
            transitionProperty: 'width',
            transitionDuration: travelled(ref.motion.moderate),
            transitionTimingFunction: ref.motion.settle,
          }),
          slide.style,
          slideBack.style,
          // Still (`knob.travel` 0), the fill spans the track, faint.
          Style.pseudo(unknown, {
            inlineSize: `calc(40% + 60% * (1 - ${ref.knob.travel}))`,
            opacity: `calc(1 - 0.6 * (1 - ${ref.knob.travel}))`,
            animation: sweep(slide.name),
          }),
          Style.nest(`&${unknown}:dir(rtl)`, { animation: sweep(slideBack.name) }),
        ),
      },
      ring: {
        root: variant(Style.self({ justifyItems: 'center', inlineSize: 'fit-content' })),
        // The arc is the track's own fill, cut to a ring by a mask.
        track: variant(
          Style.self({
            inlineSize: ringSize,
            blockSize: ringSize,
            background: `conic-gradient(${ref.accent.default} calc(var(--fk-progress, 0) * 1turn), ${ref.outline.subtle} 0)`,
            mask: `radial-gradient(farthest-side, transparent calc(100% - ${ringWidth}), black calc(100% - ${ringWidth}))`,
          }),
          turn.style,
          Style.pseudo(unknown, {
            background: `conic-gradient(${ref.accent.default} 0 0.25turn, ${ref.outline.subtle} 0)`,
            animation: `${turn.name} ${travelled(`calc(${ref.motion.slow} * 4)`)} linear infinite`,
          }),
        ),
        indicator: variant(Style.self({ display: 'none' })),
      },
    },
  },
  defaults: { shape: 'bar' },
})
