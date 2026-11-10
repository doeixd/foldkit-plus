/**
 * The keyboard key, broken in turn:
 * `pnpm mutate packages/mixins-ui/test/kbd.mutations.ts` checks that a test
 * fails for every one.
 */
const tests = ['packages/mixins-ui/test/kbd.test.ts']
const browser = ['packages/mixins-ui/test/kbd.browser.test.ts']

export default [
  {
    name: 'a key keeps the untrimmed line, so its letter stands high',
    edits: [
      {
        file: '../src/recipes/kbd.ts',
        find: "        display: 'inline-block',\n        ...trimmed,\n",
        replace: "        display: 'inline-block',\n",
      },
    ],
    tests: browser,
  },
  {
    name: 'a key pads more below than above',
    edits: [
      {
        file: '../src/recipes/kbd.ts',
        find: "padding: '0.3rem 0.375rem',",
        replace: "padding: '0.1rem 0.375rem 0.5rem',",
      },
    ],
    tests: browser,
  },
  {
    name: 'a key pads more at the start than the end',
    edits: [
      {
        file: '../src/recipes/kbd.ts',
        find: "padding: '0.3rem 0.375rem',",
        replace: "padding: '0.3rem 0.2rem 0.3rem 0.6rem',",
      },
    ],
    tests: browser,
  },
  {
    name: 'keys set proportionally spaced',
    edits: [
      {
        file: '../src/recipes/kbd.ts',
        find: 'fontFamily: ref.font.mono,',
        replace: 'fontFamily: ref.font.body,',
      },
    ],
    tests: browser,
  },
  {
    name: 'a keycap loses its lit top',
    edits: [
      {
        file: '../src/recipes/kbd.ts',
        find: 'boxShadow: `inset 0 ${ref.border.thin} 0 ${ref.surface.base}, ',
        replace: 'boxShadow: `',
      },
    ],
    tests: browser,
  },
  {
    name: 'a combination joins its first key too',
    edits: [
      {
        file: '../src/kbd.ts',
        find: '...(index === 0 || joiner === undefined ? []',
        replace: '...(joiner === undefined ? []',
      },
    ],
    tests,
  },
  {
    name: 'a combination of no keys draws an empty kbd',
    edits: [
      { file: '../src/kbd.ts', find: 'if (options.keys.length === 0) {', replace: 'if (false) {' },
    ],
    tests,
  },
  {
    name: 'a combination draws its keys as plain text',
    edits: [
      {
        file: '../src/kbd.ts',
        find: 'h.kbd(builders.key.attrs(), [key]),',
        replace: 'key,',
      },
    ],
    tests,
  },
  {
    name: 'keys lose their lower edge',
    edits: [
      {
        file: '../src/recipes/kbd.ts',
        find: 'borderBlockEndWidth: ref.border.thick,',
        replace: '',
      },
    ],
    tests: browser,
  },
]
