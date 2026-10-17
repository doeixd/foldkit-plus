/**
 * The progress, broken in turn:
 * `pnpm mutate packages/mixins-ui/test/progress.mutations.ts` checks that a
 * test fails for every one.
 */
const unit = 'packages/mixins-ui/test/progress.test.ts'
const browser = 'packages/mixins-ui/test/progress.browser.test.ts'
const view = '../src/progress.ts'
const recipe = '../src/recipes/progress.ts'

export default [
  {
    name: 'right to left, the fill sweeps rightward',
    edits: [
      {
        file: recipe,
        find: 'Style.nest(`&${unknown}:dir(rtl)`, { animation: sweep(slideBack.name) }),\n',
        replace: '',
      },
    ],
    tests: [browser],
  },
  {
    name: 'right to left, the fill starts inside the track',
    edits: [
      {
        file: recipe,
        find: "from: { translate: '100% 0' },",
        replace: "from: { translate: '0% 0' },",
      },
    ],
    tests: [browser],
  },
  {
    name: 'left to right, the fill stops inside the track',
    edits: [
      {
        file: recipe,
        find: "to: { translate: '250% 0' },",
        replace: "to: { translate: '150% 0' },",
      },
    ],
    tests: [browser],
  },
  {
    name: 'the share runs past the end',
    edits: [
      {
        file: view,
        find: 'Math.min(1, Math.max(0, (value - min) / (max - min)))',
        replace: 'Math.max(0, (value - min) / (max - min))',
      },
    ],
    tests: [unit],
  },
  {
    name: 'a range of no width divides by zero',
    edits: [{ file: view, find: 'max <= min ? 1 : ', replace: '' }],
    tests: [unit],
  },
  {
    name: 'the share is measured from zero',
    edits: [
      {
        file: view,
        find: 'const share = Option.map(value, done => fraction(done, min, max))',
        replace: 'const share = Option.map(value, done => fraction(done, 0, max))',
      },
    ],
    tests: [unit],
  },
  {
    name: 'an unknown end gets a share',
    edits: [
      {
        file: view,
        find: 'const share = Option.map(value, done => fraction(done, min, max))',
        replace: 'const share = Option.some(fraction(Option.getOrElse(value, () => 0), min, max))',
      },
    ],
    tests: [unit],
  },
  {
    name: 'the range stops at upstream',
    edits: [{ file: view, find: '      min,\n      max,\n', replace: '      min,\n' }],
    tests: [unit],
  },
  {
    name: 'the ring reads a share nobody writes',
    edits: [
      {
        file: recipe,
        find: 'calc(var(--fk-progress, 0) * 1turn)',
        replace: 'calc(var(--fk-progress-share, 0) * 1turn)',
      },
    ],
    tests: [unit],
  },
  {
    name: 'a stacked bar counts from zero, not its start',
    edits: [
      {
        file: view,
        find: 'sections.reduce((sum, section) => sum + section.value, min)',
        replace: 'sections.reduce((sum, section) => sum + section.value, 0)',
      },
    ],
    tests: [unit],
  },
  {
    name: 'a stacked bar reads only its total aloud',
    edits: [
      {
        file: view,
        find: "sections.map(section => `${section.label} ${section.value}`).join(', ')",
        replace: 'undefined',
      },
    ],
    tests: [unit],
  },
  {
    name: 'a part runs past the end of the range',
    edits: [
      {
        file: view,
        find: 'const to = Math.min(1, acc.from + fraction(section.value + min, min, max))',
        replace: 'const to = acc.from + fraction(section.value + min, min, max)',
      },
    ],
    tests: [unit],
  },
  {
    name: 'a part with no tone of its own has none',
    edits: [{ file: view, find: "section.tone ?? 'accent'", replace: "section.tone ?? ''" }],
    tests: [unit],
  },
  {
    name: 'a stacked bar draws one fill too',
    edits: [
      {
        file: view,
        find: '...(sections.length === 0\n                ? [h.div(builders.indicator.attrs(attributes.indicator), [])]\n                : parts),',
        replace:
          'h.div(builders.indicator.attrs(attributes.indicator), []),\n              ...parts,',
      },
    ],
    tests: [unit],
  },
  {
    name: 'the value shown is read twice',
    edits: [
      {
        file: view,
        find: 'h.span(builders.value.attrs([h.AriaHidden(true)]), [shownText])',
        replace: 'h.span(builders.value.attrs([]), [shownText])',
      },
    ],
    tests: [unit],
  },
  {
    name: 'a value shown past the end is not clamped',
    edits: [
      {
        file: view,
        find: 'options.valueText(Math.max(min, Math.min(max, done)), max)',
        replace: 'options.valueText(done, max)',
      },
    ],
    tests: [unit],
  },
  {
    name: 'the value is shown unasked',
    edits: [
      {
        file: view,
        find: "options.showValue === true && shownText !== ''",
        replace: "shownText !== ''",
      },
    ],
    tests: [unit],
  },
  {
    name: 'the track is cut without being told how often',
    edits: [
      {
        file: view,
        find: "h.Style({ '--fk-progress-segments': String(options.segments) }),",
        replace: '',
      },
    ],
    tests: [unit],
  },
  {
    name: 'the buffer is the fill’s share',
    edits: [
      {
        file: view,
        find: 'percent(fraction(options.buffer, min, max))',
        replace: 'percent(Option.getOrElse(share, () => 0))',
      },
    ],
    tests: [unit],
  },
  {
    name: "a bar's value drops below its label",
    edits: [
      {
        file: recipe,
        find: "value: variant(Style.self({ gridColumn: '2', gridRow: '1' })),",
        replace: "value: variant(Style.self({ gridColumn: '1 / -1' })),",
      },
    ],
    tests: [browser],
  },
  {
    name: "a ring's value stands below it",
    edits: [
      {
        file: recipe,
        find: "value: variant(Style.self({ gridRow: '2', gridColumn: '1', placeSelf: 'center' })),",
        replace:
          "value: variant(Style.self({ gridRow: '3', gridColumn: '1', placeSelf: 'center' })),",
      },
    ],
    tests: [browser],
  },
  {
    name: 'every size is the same',
    edits: [
      {
        file: recipe,
        find: "lg: { root: sized('0.75rem', '4rem', '0.375rem') },",
        replace: "lg: { root: sized('0.25rem', '2rem', '0.1875rem') },",
      },
    ],
    tests: [browser],
  },
  {
    name: "a stacked bar's parts stand one over the other",
    edits: [{ file: recipe, find: "            display: 'flex',\n", replace: '' }],
    tests: [browser],
  },
  {
    name: 'a part ignores its tone',
    edits: [
      {
        file: recipe,
        find: 'Style.nest(`&[data-tone="${name}"]`, { \'--_fk-progress-tone\': color }),',
        replace: 'Style.nest(`&[data-tone="${name}"]`, {}),',
      },
    ],
    tests: [browser],
  },
  {
    name: 'the buffer lies over the fill',
    edits: [
      {
        file: recipe,
        find: "Style.self({ position: 'relative', blockSize: '100%', backgroundColor: fill }),",
        replace: "Style.self({ blockSize: '100%', backgroundColor: fill }),",
      },
    ],
    tests: [browser],
  },
  {
    name: 'the success tone is the accent',
    edits: [
      {
        file: recipe,
        find: '  success: ref.success.default,',
        replace: '  success: ref.accent.default,',
      },
    ],
    tests: [browser],
  },
  {
    name: 'moving stripes slide whatever `travel` says',
    edits: [
      {
        file: recipe,
        find: '`${name} ${travelled(`calc(${ref.motion.slow} * 3)`)} linear infinite`',
        replace: '`${name} calc(${ref.motion.slow} * 3) linear infinite`',
      },
    ],
    tests: [browser],
  },
  {
    name: "moving stripes take over an unknown end's sweep",
    edits: [
      {
        file: recipe,
        find: 'Style.self({ animation: banding(bandsOn.name) }),',
        replace: "Style.nest('&&&', { animation: banding(bandsOn.name) }),",
      },
    ],
    tests: [browser],
  },
  {
    name: 'still stripes move',
    edits: [
      {
        file: recipe,
        find: '      still: {\n        indicator: variant(bands),',
        replace: '      still: {\n        indicator: variant(bands, moving),',
      },
    ],
    tests: [browser],
  },
  {
    name: 'a segmented track is whole',
    edits: [
      {
        file: recipe,
        find: 'mask: `repeating-linear-gradient(',
        replace: "'--_fk-unused': `repeating-linear-gradient(",
      },
    ],
    tests: [browser],
  },
  {
    name: "a segmented fill's end is rounded",
    edits: [
      {
        file: recipe,
        find: "Style.nest(':where([data-segmented]) > * > &', { borderRadius: '0' }),",
        replace: '',
      },
    ],
    tests: [browser],
  },
]
