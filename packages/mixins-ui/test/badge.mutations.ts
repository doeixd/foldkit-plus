/**
 * The badge, broken in turn:
 * `pnpm mutate packages/mixins-ui/test/badge.mutations.ts` checks that a test
 * fails for every one.
 */
const tests = ['packages/mixins-ui/test/badge.test.ts']
const browser = ['packages/mixins-ui/test/badge.browser.test.ts']

export default [
  {
    name: 'pills lose their tone attribute',
    edits: [
      {
        file: '../src/badge.ts',
        find: "...(options.tone === undefined ? [] : [h.DataAttribute('tone', options.tone)]),",
        replace: '',
      },
    ],
    tests,
  },
  {
    name: 'success fills with ink instead of its tint',
    edits: [
      {
        file: '../src/recipes/badge.ts',
        find: "'--_fk-badge-tint': ref[tone].subtle,",
        replace: "'--_fk-badge-tint': ref[tone].ink,",
      },
    ],
    tests: browser,
  },
  {
    name: 'every appearance is tinted',
    edits: [
      {
        file: '../src/recipes/badge.ts',
        find: "appearances[options.appearance ?? 'tinted'],",
        replace: 'appearances.tinted,',
      },
    ],
    tests: browser,
  },
  {
    name: 'a dot badge draws no dot',
    edits: [{ file: '../src/recipes/badge.ts', find: '    dot,\n  ),', replace: '  ),' }],
    tests: browser,
  },
  {
    name: 'the solid fill ignores the tone',
    edits: [
      {
        file: '../src/recipes/badge.ts',
        find: "'--_fk-badge-fill': ref[tone].default,",
        replace: "'--_fk-badge-fill': ref.text.muted,",
      },
    ],
    tests: browser,
  },
  {
    name: 'an outline badge draws no line',
    edits: [
      {
        file: '../src/recipes/badge.ts',
        find: '    boxShadow: `inset 0 0 0 ${ref.border.thin} ${line}`,\n',
        replace: '',
      },
    ],
    tests: browser,
  },
]
