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
        find: "borderRadius: nested(ref.radius.xl, ref.space['2xs'], ref.border.thin),",
        replace: 'borderRadius: ref.radius.md,',
      },
    ],
    tests,
  },
  {
    name: 'the nested radius forgets the border',
    edits: [
      {
        file: '../../mixins/src/theme/tokens.ts',
        find: '`max(0px, calc(${outer} - ${inset} - ${border}))`',
        replace: '`max(0px, calc(${outer} - ${inset}))`',
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
