/**
 * Surface states and concentric corners, broken in turn:
 * `pnpm mutate packages/mixins-ui/test/state.mutations.ts`.
 */
const tests = ['packages/mixins-ui/test/state.browser.test.ts']

export default [
  {
    name: 'rows keep a fixed radius inside the panel',
    edits: [
      {
        file: '../src/recipes/popup.ts',
        find: "    // Concentric with the panel's corner, inside its padding and border.\n    borderRadius: nested(),",
        replace: '    borderRadius: ref.radius.md,',
      },
    ],
    tests,
  },
  {
    name: 'a nesting container forgets its border',
    edits: [
      {
        file: '../../mixins/src/theme/tokens.ts',
        find: "'--fk-outer-radius': `calc(${radius} - ${border})`,",
        replace: "'--fk-outer-radius': `calc(${radius})`,",
      },
    ],
    tests,
  },
  {
    name: 'the panel publishes no corner, so its rows are square',
    edits: [
      {
        file: '../src/recipes/popup.ts',
        find: "    ...nests(ref.radius.xl, ref.space['2xs'], ref.border.thin),\n",
        replace: '',
      },
    ],
    tests,
  },
  {
    name: 'a neutral button paints an opaque grey',
    edits: [
      {
        file: '../src/recipes/design.ts',
        find: '    fill: ref.state.tint,',
        replace: '    fill: ref.outline.subtle,',
      },
    ],
    tests,
  },
  {
    name: "a trigger's hover is the muted surface again",
    edits: [
      {
        file: '../src/recipes/menu.ts',
        find: '      hover({ background: unfilledHover }),',
        replace: '      hover({ background: ref.surface.muted }),',
      },
    ],
    tests,
  },
]
