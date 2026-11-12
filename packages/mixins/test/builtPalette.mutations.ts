/**
 * A literal color in the palette, which a build lowers into fallbacks it
 * works out once: `pnpm mutate packages/mixins/test/builtPalette.mutations.ts`.
 */
const tests = ['packages/mixins/test/builtPalette.test.ts']

export default [
  {
    name: 'a palette color written as a literal, which the build bakes',
    edits: [
      {
        file: '../src/theme/oklch.ts',
        find: '`oklch(8% calc(${surfaceC} * 1.2) ${neutral})`',
        replace: '`oklch(8% 0.1 25)`',
      },
      {
        file: '../src/theme/oklch.ts',
        find: '`oklch(6% calc(${surfaceCDark} * 1.2) ${neutral})`',
        replace: '`oklch(6% 0.1 25)`',
      },
    ],
    tests,
  },
  {
    name: 'a red literal behind a variable, which the build gives a fallback',
    edits: [
      {
        file: '../src/theme/shadows.ts',
        find: "'var(--fk-shadow-color, oklch(0% 0 0 / 0.12))'",
        replace: "'var(--fk-shadow-color, oklch(40% 0.15 25 / 0.12))'",
      },
    ],
    tests,
  },
]
