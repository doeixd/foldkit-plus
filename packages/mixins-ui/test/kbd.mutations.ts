/**
 * The keyboard key, broken in turn:
 * `pnpm mutate packages/mixins-ui/test/kbd.mutations.ts` checks that a test
 * fails for every one.
 */
const tests = ['packages/mixins-ui/test/kbd.test.ts']

export default [
  {
    name: 'keys set proportionally spaced',
    edits: [
      {
        file: '../src/recipes/kbd.ts',
        find: 'fontFamily: ref.font.mono,',
        replace: 'fontFamily: ref.font.body,',
      },
    ],
    tests,
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
    tests,
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
    tests,
  },
]
