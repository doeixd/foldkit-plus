/**
 * Progress: `shape: 'bar'` is a rounded track whose fill grows on the
 * moderate tier, with the label and its value on the line above;
 * `shape: 'ring'` is Circular Progress, a ring whose arc is the root's
 * `--fk-progress` turned into a conic gradient, with the value inside. Not
 * known, the bar's fill slides through the track toward its inline end,
 * leftward right to left, and the ring's quarter arc turns as a Spinner's
 * ring does (`turning`); with no travel, or under reduced motion, they
 * hold still, the bar's fill resting faint across the track.
 *
 * `tone` colours the fill with the tokens Meter's levels use (success,
 * warning, error), and a stacked bar's parts take theirs from `data-tone`.
 * `stripes` lays bands over the fill, `moving` sliding them, also only as
 * far as `travel` lets. A buffer is the fill's tone, faint; a segmented
 * track is cut by a mask, so the fill needs no steps of its own. `size`
 * thickens the bar and widens the ring.
 */
import { Style } from 'foldkit-mixins'
import { role } from 'foldkit-mixins/theme'
import { ProgressSlots, type ProgressTone } from '../progress.js'
import { component, ref, stillWhenReduced, travelled, turning, variant } from './design.js'

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

const band = '1rem'

// The bands run toward the fill's end: rightward, and leftward right to left.
const bandsOn = Style.keyframes({
  from: { backgroundPosition: '0 0' },
  to: { backgroundPosition: `${band} 0` },
})
const bandsBack = Style.keyframes({
  from: { backgroundPosition: '0 0' },
  to: { backgroundPosition: `calc(-1 * ${band}) 0` },
})

const toneOf: Readonly<Record<ProgressTone, string>> = {
  accent: ref.accent.default,
  neutral: ref.text.muted,
  success: ref.success.default,
  warning: ref.warning.default,
  error: ref.error.default,
  info: ref.info.default,
}

const fill = `var(--_fk-progress-tone, ${ref.accent.default})`
const thick = 'var(--_fk-progress-thick, 0.5rem)'
const ring = 'var(--_fk-progress-ring, 2.5rem)'
const ringWidth = 'var(--_fk-progress-ring-width, 0.25rem)'

const light = `color-mix(in oklab, ${ref.surface.base} 30%, transparent)`
const bands = Style.self({
  backgroundImage: `linear-gradient(45deg, ${light} 25%, transparent 25% 50%, ${light} 50% 75%, transparent 75%)`,
  backgroundSize: `${band} ${band}`,
})
const banding = (name: string) =>
  `${name} ${travelled(`calc(${ref.motion.slow} * 3)`)} linear infinite`
const moving = Style.compose(
  bandsOn.style,
  bandsBack.style,
  // An unknown end's sweep outranks these, so it stays the fill's motion.
  Style.self({ animation: banding(bandsOn.name) }),
  Style.nest('&:dir(rtl)', { animation: banding(bandsBack.name) }),
)

const toned = (color: string) => ({ root: variant(Style.self({ '--_fk-progress-tone': color })) })

const sized = (bar: string, across: string, width: string) =>
  variant(
    Style.self({
      '--_fk-progress-thick': bar,
      '--_fk-progress-ring': across,
      '--_fk-progress-ring-width': width,
    }),
  )

export const Progress = Style.recipeFor(ProgressSlots)({
  base: {
    root: component(Style.self({ display: 'grid', gap: ref.space['2xs'] })),
    label: component(Style.self({ ...role('caption'), color: ref.text.muted })),
    value: component(
      Style.self({
        ...role('caption'),
        color: ref.text.default,
        fontVariantNumeric: 'tabular-nums',
      }),
    ),
    track: component(
      Style.self({ position: 'relative', overflow: 'hidden', borderRadius: ref.radius.full }),
      // Cut into equal steps by gaps a mask leaves.
      Style.nest(':where([data-segmented]) > &', {
        '--_fk-gap': ref.space['2xs'],
        mask: `repeating-linear-gradient(to right, black 0 calc((100% + var(--_fk-gap)) / var(--fk-progress-segments) - var(--_fk-gap)), transparent 0 calc((100% + var(--_fk-gap)) / var(--fk-progress-segments)))`,
      }),
    ),
    buffer: component(
      Style.self({
        position: 'absolute',
        insetBlock: '0',
        insetInlineStart: '0',
        borderRadius: ref.radius.full,
        background: `color-mix(in oklab, ${fill} 30%, transparent)`,
        transitionProperty: 'inline-size',
        transitionDuration: travelled(ref.motion.moderate),
        transitionTimingFunction: ref.motion.settle,
      }),
    ),
    indicator: component(
      // Above the buffer, which is placed absolutely.
      Style.self({ position: 'relative', blockSize: '100%', backgroundColor: fill }),
    ),
    section: component(
      Style.self({
        blockSize: '100%',
        transitionProperty: 'inline-size',
        transitionDuration: travelled(ref.motion.moderate),
        transitionTimingFunction: ref.motion.settle,
        backgroundColor: fill,
      }),
      ...Object.entries(toneOf).map(([name, color]) =>
        Style.nest(`&[data-tone="${name}"]`, { '--_fk-progress-tone': color }),
      ),
    ),
  },
  variants: {
    shape: {
      bar: {
        root: variant(
          Style.self({ inlineSize: 'min(20rem, 100%)', gridTemplateColumns: '1fr auto' }),
        ),
        value: variant(Style.self({ gridColumn: '2', gridRow: '1' })),
        track: variant(
          Style.self({
            gridColumn: '1 / -1',
            blockSize: thick,
            background: ref.outline.subtle,
            // A stacked bar's parts stand in a row.
            display: 'flex',
          }),
        ),
        indicator: variant(
          Style.self({
            borderRadius: ref.radius.full,
            transitionProperty: 'width',
            transitionDuration: travelled(ref.motion.moderate),
            transitionTimingFunction: ref.motion.settle,
          }),
          // A rounded end would land inside a step.
          Style.nest(':where([data-segmented]) > * > &', { borderRadius: '0' }),
          slide.style,
          slideBack.style,
          // Still (`knob.travel` 0), the fill spans the track, faint.
          Style.pseudo(unknown, {
            inlineSize: `calc(40% + 60% * (1 - ${ref.knob.travel}))`,
            opacity: `calc(1 - 0.6 * (1 - ${ref.knob.travel}))`,
            animation: sweep(slide.name),
          }),
          Style.nest(`&${unknown}:dir(rtl)`, { animation: sweep(slideBack.name) }),
          // Held, the fill rests where a still theme draws it, across the
          // track; the reset's 0.01ms sweep left it mostly past the end.
          stillWhenReduced(`&${unknown}`),
          stillWhenReduced(`&${unknown}:dir(rtl)`),
        ),
      },
      ring: {
        root: variant(Style.self({ justifyItems: 'center', inlineSize: 'fit-content' })),
        // The arc is the track's own fill, cut to a ring by a mask.
        track: variant(
          Style.self({
            gridRow: '2',
            gridColumn: '1',
            inlineSize: ring,
            blockSize: ring,
            background: `conic-gradient(${fill} calc(var(--fk-progress, 0) * 1turn), ${ref.outline.subtle} 0)`,
            mask: `radial-gradient(farthest-side, transparent calc(100% - ${ringWidth}), black calc(100% - ${ringWidth}))`,
          }),
          Style.pseudo(unknown, {
            background: `conic-gradient(${fill} 0 0.25turn, ${ref.outline.subtle} 0)`,
          }),
          turning(`calc(${ref.motion.slow} * 4)`, `&${unknown}`),
        ),
        // Inside the ring, over its hole.
        value: variant(Style.self({ gridRow: '2', gridColumn: '1', placeSelf: 'center' })),
        indicator: variant(Style.self({ display: 'none' })),
        buffer: variant(Style.self({ display: 'none' })),
        section: variant(Style.self({ display: 'none' })),
      },
    },
    tone: {
      accent: toned(toneOf.accent),
      neutral: toned(toneOf.neutral),
      success: toned(toneOf.success),
      warning: toned(toneOf.warning),
      error: toned(toneOf.error),
      info: toned(toneOf.info),
    },
    stripes: {
      none: {},
      still: {
        indicator: variant(bands),
        section: variant(bands),
      },
      moving: {
        indicator: variant(bands, moving),
        section: variant(bands, moving),
      },
    },
    size: {
      sm: { root: sized('0.25rem', '2rem', '0.1875rem') },
      md: { root: sized('0.5rem', '2.5rem', '0.25rem') },
      lg: { root: sized('0.75rem', '4rem', '0.375rem') },
    },
  },
  defaults: { shape: 'bar', stripes: 'none' },
})
