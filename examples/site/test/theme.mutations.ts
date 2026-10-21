/**
 * The pack's stroke and the code `/create` hands out, broken in turn: `pnpm
 * mutate examples/site/test/theme.mutations.ts` checks that a test fails for
 * every one. The visual claim is the theme end-to-end test's.
 */
const tests = ['examples/site/test/theme.test.ts']
export default [
  {
    name: 'the previews draw the pack at its own stroke',
    edits: [
      {
        file: '../src/gallery/theme.ts',
        find: 'Icon.withStroke(icon, { width: stroke })',
        replace: 'Icon.withStroke(icon, {})',
      },
    ],
    tests,
  },
  {
    name: 'the code hands out the pack without the stroke',
    edits: [
      {
        file: '../src/gallery/theme.ts',
        find: '}, { width: ${stroke} })`',
        replace: '} })`',
      },
    ],
    tests,
  },
  {
    name: 'the shipped pack never needs its own drawing',
    edits: [
      {
        file: '../src/gallery/theme.ts',
        find: "if (pack === 'lucide' && stroke === knobAt('icon.stroke').default)\n    return { imports: [], tokens: '' }",
        replace: "if (pack === 'lucide')\n    return { imports: [], tokens: '' }",
      },
    ],
    tests,
  },
  {
    name: 'the shipped pack keeps its own drawing at every stroke',
    edits: [
      {
        file: '../src/gallery/theme.ts',
        find: "if (pack === 'lucide' && stroke === knobAt('icon.stroke').default) return {}",
        replace: "if (pack === 'lucide') return {}",
      },
    ],
    tests,
  },
]
