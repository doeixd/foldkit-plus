/**
 * `/create`'s address, broken in turn:
 * `pnpm mutate examples/site/test/themeUrl.mutations.ts` checks that a test fails for every one.
 */
const tests = ['examples/site/test/themeUrl.test.ts']
const file = '../src/gallery/themeUrl.ts'

export default [
  {
    name: 'every knob is written, default or not',
    edits: [{ file, find: 'if (address.knobs[knob] !== defaults[knob]) ', replace: '' }],
    tests,
  },
  {
    name: 'a value none of the knobs takes is kept',
    edits: [
      {
        file,
        find: 'knobs = Option.getOrElse(decodeKnobs({ ...knobs, [name]: value }), () => knobs)',
        replace: 'knobs = { ...knobs, [name]: value }',
      },
    ],
    tests,
  },
  {
    name: 'a number is kept off its slider',
    edits: [
      {
        file,
        find: '(fitting, knob) => ({ ...fitting, [knob]: fit(rangeOf(knob), fitting[knob]) }),',
        replace: '(fitting) => fitting,',
      },
    ],
    tests,
  },
  {
    name: 'the address is read on every page',
    edits: [
      {
        file: '../src/main.ts',
        find: 'if (!onCreate(model.page) || model.addressRead) return { model }',
        replace: 'if (model.addressRead) return { model }',
      },
    ],
    tests,
  },
  {
    name: 'the address is read again over the knobs',
    edits: [
      {
        file: '../src/main.ts',
        find: 'if (!onCreate(model.page) || model.addressRead) return { model }',
        replace: 'if (!onCreate(model.page)) return { model }',
      },
    ],
    tests,
  },
  {
    name: 'a copied link stays fresh as the knobs move',
    edits: [{ file: '../src/main.ts', find: '          linkCopied: () => false,\n', replace: '' }],
    tests,
  },
  {
    name: 'a shuffled base color draws a tint of its own',
    edits: [
      {
        file: '../src/gallery/theme.ts',
        find: "base === 'accent' ? across('surfaceSaturation') : bases[base].c",
        replace: "across('surfaceSaturation')",
      },
    ],
    tests: ['examples/site/test/theme.test.ts'],
  },
  {
    name: 'a screen draws an example its showcase does not have',
    edits: [
      {
        file: '../src/gallery/specimens.ts',
        find: "[example(live, 'chart', 'area')]",
        replace: "[example(live, 'chart', 'areas')]",
      },
    ],
    tests: ['examples/site/test/screens.test.ts'],
  },
]
