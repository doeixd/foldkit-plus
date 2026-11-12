/**
 * The palette's hues, taken from a grey again in turn:
 * `pnpm mutate packages/mixins/test/neutralHue.mutations.ts`.
 */
const gamut = '../src/theme/gamut.ts'
const oklch = '../src/theme/oklch.ts'
const tests = ['packages/mixins/test/neutralHue.browser.test.ts']

export default [
  {
    name: 'a fitted color keeps its origin’s hue, which a grey has none of',
    edits: [
      {
        file: gamut,
        find: 'l ${bounded(hue)} ${hues[hue]} / alpha)',
        replace: 'l ${bounded(hue)} h / alpha)',
      },
    ],
    tests,
  },
  {
    name: 'a surface step mixed in OKLCH, where a grey brings its hue',
    edits: [
      {
        file: oklch,
        find: 'fit(`color-mix(in oklab, ${base} calc(100% - ${amount})',
        replace: 'fit(`color-mix(in oklch, ${base} calc(100% - ${amount})',
      },
    ],
    tests,
    survives:
      'redundant with fit: the step is fitted on the neutral hue, whatever hue the mix gave its grey; kept so no palette mix reads a hue',
  },
  {
    name: 'an inked line mixed in OKLCH, where the line’s grey brings its hue',
    edits: [
      {
        file: oklch,
        find: '`color-mix(in oklab, ${line}, color-mix(in oklab,',
        replace: '`color-mix(in oklch, ${line}, color-mix(in oklab,',
      },
    ],
    tests,
    survives:
      'redundant with fit: the line and the text are each fitted on the neutral hue, so an OKLCH mix of them meets no grey of another hue',
  },
  {
    name: 'the palette as before: hues from the origin, mixes in OKLCH',
    edits: [
      {
        file: gamut,
        find: 'l ${bounded(hue)} ${hues[hue]} / alpha)',
        replace: 'l ${bounded(hue)} h / alpha)',
      },
      {
        file: oklch,
        find: 'fit(`color-mix(in oklab, ${base} calc(100% - ${amount})',
        replace: 'fit(`color-mix(in oklch, ${base} calc(100% - ${amount})',
      },
      {
        file: oklch,
        find: '`color-mix(in oklab, ${line}, color-mix(in oklab,',
        replace: '`color-mix(in oklch, ${line}, color-mix(in oklch,',
      },
    ],
    tests,
  },
  {
    name: 'a wash given its scale’s hue, not the hue of its mix',
    edits: [
      {
        file: oklch,
        find: "fitMix(`color-mix(in oklab, ${v(name, '6')}",
        replace: "fit(`color-mix(in oklab, ${v(name, '6')}",
      },
    ],
    tests,
  },
]
