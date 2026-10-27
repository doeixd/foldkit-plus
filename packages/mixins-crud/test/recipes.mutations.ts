/**
 * The shipped looks, broken in turn: `pnpm mutate packages/mixins-crud/test/recipes.mutations.ts`.
 */
const file = '../src/recipes.ts'
const tests = ['packages/mixins-crud/test/recipes.browser.test.ts']

export default [
  {
    name: 'a row opens only where its title is',
    edits: [
      {
        file,
        find: "Style.nest('&::after', { content: '\"\"', position: 'absolute', inset: '0' })",
        replace: 'Style.empty',
      },
    ],
    tests,
  },
  {
    name: 'a sorting heading is only as tall as its words',
    edits: [
      {
        file,
        find: "        alignItems: 'center',\n        minBlockSize: '1.5rem',\n        padding: '0',\n        border: '0',",
        replace: "        alignItems: 'center',\n        padding: '0',\n        border: '0',",
      },
    ],
    tests,
  },
  {
    name: 'a failure reads as any other line',
    edits: [
      {
        file,
        find: 'Style.nest(\'&[role="alert"]\', { color: ref.error.ink, fontWeight: ref.weight.medium }),',
        replace: '',
      },
    ],
    tests,
  },
  {
    name: 'a delete’s yes looks like its no',
    edits: [{ file, find: 'confirm: component(danger),', replace: 'confirm: component(quiet),' }],
    tests,
  },
  {
    name: 'a row list’s row is only as tall as its parts',
    edits: [
      {
        file,
        find: "        gap: ref.space.sm,\n        minBlockSize: '2.5rem',\n        paddingBlock: ref.space['2xs'],",
        replace: "        gap: ref.space.sm,\n        paddingBlock: ref.space['2xs'],",
      },
    ],
    tests,
  },
  {
    name: 'a row list’s parts stand on its baseline',
    edits: [
      {
        file,
        find: "        display: 'flex',\n        alignItems: 'center',\n        gap: ref.space.sm,\n        minBlockSize: '2.5rem',\n        paddingBlock",
        replace:
          "        display: 'flex',\n        alignItems: 'baseline',\n        gap: ref.space.sm,\n        minBlockSize: '2.5rem',\n        paddingBlock",
      },
    ],
    tests,
  },
  {
    name: 'the way into a row list’s row is as wide as its words',
    edits: [{ file, find: "        flex: '1',\n", replace: '' }],
    tests,
  },
]
