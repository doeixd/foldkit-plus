/**
 * Concentric control corners, broken in turn:
 * `pnpm mutate packages/mixins-ui/test/concentric.mutations.ts`.
 */
const browser = ['packages/mixins-ui/test/concentric.browser.test.ts']
const tokens = '../../mixins/src/theme/tokens.ts'
const design = '../src/recipes/design.ts'

export default [
  {
    name: 'a control ignores the container it sits in',
    edits: [
      {
        file: tokens,
        find: '`clamp(${bounds.min}, var(--fk-control-corner, 9999px), ${bounds.max})`',
        replace: 'bounds.max',
      },
    ],
    tests: browser,
  },
  {
    name: 'a deep inset squares a control off',
    edits: [
      {
        file: design,
        find: 'Theme.concentric({ min: ref.radius.sm, max: ref.radius.md })',
        replace: "Theme.concentric({ min: '0px', max: ref.radius.md })",
      },
    ],
    tests: browser,
  },
  {
    name: 'a wide corner rounds a control past md',
    edits: [
      {
        file: design,
        find: 'Theme.concentric({ min: ref.radius.sm, max: ref.radius.md })',
        replace: "Theme.concentric({ min: ref.radius.sm, max: '9999px' })",
      },
    ],
    tests: browser,
  },
  {
    name: 'a pill theme no longer rounds a button',
    edits: [{ file: design, find: " + ${ref.knob['control-round']} * 9999px)`", replace: ')`' }],
    tests: browser,
  },
  {
    name: 'a button keeps the root corner',
    edits: [
      {
        file: '../src/recipes/button.ts',
        find: 'borderRadius: pressCorner,',
        replace: 'borderRadius: ref.radius.control,',
      },
    ],
    tests: browser,
  },
  {
    name: 'a field keeps the root corner',
    edits: [
      {
        file: '../src/recipes/field.ts',
        find: "    inlineSize: '100%',\n    border: `${ref.border.thin} solid ${ref.outline.default}`,\n    borderRadius: controlCorner,",
        replace:
          "    inlineSize: '100%',\n    border: `${ref.border.thin} solid ${ref.outline.default}`,\n    borderRadius: ref.radius.md,",
      },
    ],
    tests: browser,
  },
  ...(
    [
      ['card', '...nests(ref.radius.lg, pad),'],
      ['dialog', '...nests(ref.radius.lg, ref.space.lg, ref.border.thin),'],
      ['toast', '...nests(ref.radius.lg, ref.space.md, ref.border.thin),'],
      ['alert', '...nests(ref.radius.md, ref.space.md),'],
    ] as const
  ).map(([name, find]) => ({
    name: `a ${name} publishes no corner`,
    edits: [{ file: `../src/recipes/${name}.ts`, find, replace: '' }],
    tests: browser,
  })),
  {
    name: 'a dialog forgets its border',
    edits: [
      {
        file: '../src/recipes/dialog.ts',
        find: '...nests(ref.radius.lg, ref.space.lg, ref.border.thin),',
        replace: '...nests(ref.radius.lg, ref.space.lg),',
      },
    ],
    tests: browser,
  },
  ...(
    [
      ['segmented', 'a segmented tray'],
      ['inputCopy', 'an input copy group'],
    ] as const
  ).map(([file, what]) => ({
    name: `${what} publishes a corner from its own`,
    edits: [
      { file: `../src/recipes/${file}.ts`, find: "'--fk-control-corner': 'inherit',", replace: '' },
    ],
    tests: [`packages/mixins-ui/test/${file}.browser.test.ts`, ...browser],
  })),
]
