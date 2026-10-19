/**
 * `/create`'s address, broken in turn:
 * `pnpm mutate examples/site/test/themeUrl.mutations.ts` checks that a test fails for every one.
 */
const tests = ['examples/site/test/themeUrl.test.ts']
const file = '../src/gallery/themeUrl.ts'

export default [
  {
    name: 'every knob is written, default or not',
    edits: [
      { file: '../src/gallery/themeUrl.ts', find: 'if (same(value, base)) continue', replace: '' },
    ],
    tests: ['examples/site/test/themeUrl.test.ts'],
  },
  {
    name: 'a value none of the knobs takes is kept',
    edits: [
      {
        file: '../src/gallery/themeUrl.ts',
        find: 'Option.flatMap(Schema.decodeUnknownOption(knobAt(path).schema)),',
        replace: '',
      },
    ],
    tests: ['examples/site/test/themeUrl.test.ts'],
  },
  {
    name: 'a number is kept off its slider',
    edits: [
      {
        file: '../src/gallery/themeUrl.ts',
        find: 'Option.some(fit(control, value))',
        replace: 'Option.some(value)',
      },
    ],
    tests: ['examples/site/test/themeUrl.test.ts'],
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
    name: 'a link sets a font stack of its own',
    edits: [
      {
        file: '../src/gallery/themeUrl.ts',
        find: 'Option.fromNullishOr(Object.entries(Theme.fonts).find(([name]) => name === raw)?.[1])',
        replace: 'Option.some(raw)',
      },
    ],
    tests: ['examples/site/test/themeUrl.test.ts'],
  },
  {
    name: 'the flat names written before are passed over',
    edits: [
      {
        file: '../src/gallery/themeUrl.ts',
        find: 'else if (Object.hasOwn(legacy, name)) {',
        replace: 'else if (name === legacy.toString()) {',
      },
    ],
    tests: ['examples/site/test/themeUrl.test.ts'],
  },
  {
    name: 'a screen draws an example its showcase does not have',
    edits: [
      {
        file: '../src/gallery/specimens.ts',
        find: "[example(live, 'progress', 'ring')]",
        replace: "[example(live, 'progress', 'rings')]",
      },
    ],
    tests: ['examples/site/test/screens.test.ts'],
  },
]
