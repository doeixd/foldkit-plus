/**
 * The size ladder, broken in turn:
 * `pnpm mutate packages/mixins-ui/test/ladder.mutations.ts`.
 */
const tests = ['packages/mixins-ui/test/ladder.browser.test.ts']
const tokens = '../../mixins/src/theme/tokens.ts'
const design = '../src/recipes/design.ts'

export default [
  {
    name: 'the ladder ignores the step',
    edits: [
      {
        file: tokens,
        find: '(var(--fk-control-${name}-compact) - ${at}) * var(--fk-knob-step))',
        replace: '(var(--fk-control-${name}-compact) - ${at}) * 0)',
      },
    ],
    tests,
  },
  {
    name: "a list's rows are off the ladder",
    edits: [
      {
        file: design,
        find: "export const rowOnLadder: Declarations = { ...onLadder, paddingInline: Theme.ladder('row-pad') }",
        replace:
          "export const rowOnLadder: Declarations = { paddingInline: Theme.ladder('row-pad') }",
      },
    ],
    tests,
  },
  {
    name: 'a chosen size follows the region instead',
    edits: [
      {
        file: design,
        find: "md: variant(Style.self({ '--fk-knob-step': '0' })),",
        replace: 'md: variant(Style.self({})),',
      },
    ],
    tests,
  },
  {
    name: "the segmented tray's inset adds to its option",
    edits: [
      {
        file: '../src/recipes/segmented.ts',
        find: ' - 2 * var(--_fk-segmented-inset, 0px))`,',
        replace: ')`,',
      },
    ],
    tests,
  },
  {
    name: 'a table row is as tall as its text',
    edits: [
      {
        file: '../src/recipes/table.ts',
        find: "Style.self({ blockSize: ladder('height'), paddingBlock: '0', paddingInline: ladder('pad') }),",
        replace: "Style.self({ paddingInline: ladder('pad') }),",
      },
    ],
    tests,
  },
]
