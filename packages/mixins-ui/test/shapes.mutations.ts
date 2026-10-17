/**
 * Badges and avatars, squeezed and rounded, broken in turn:
 * `pnpm mutate packages/mixins-ui/test/shapes.mutations.ts`.
 */
const radius = ['packages/mixins-ui/test/radius.browser.test.ts']

export default [
  {
    name: 'a squeezed badge shrinks under its words',
    edits: [{ file: '../src/recipes/badge.ts', find: "      flexShrink: '0',\n", replace: '' }],
    tests: ['packages/mixins-ui/test/badge.browser.test.ts'],
  },
  {
    name: 'a badge is a pill whatever the radius',
    edits: [
      {
        file: '../src/recipes/badge.ts',
        find: 'borderRadius: ref.radius.xl,',
        replace: "borderRadius: '9999px',",
      },
    ],
    tests: radius,
  },
  {
    name: 'an avatar is a disc whatever the radius',
    edits: [
      {
        file: '../src/recipes/avatar.ts',
        find: "Style.self({ borderRadius: `calc(50% * min(${ref.knob['radius-factor']}, 1))` }),",
        replace: "Style.self({ borderRadius: '50%' }),",
      },
    ],
    tests: radius,
  },
]
