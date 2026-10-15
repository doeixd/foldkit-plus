/**
 * Merged choices, broken in turn:
 * `pnpm mutate packages/mixins-ui/test/merged.mutations.ts`.
 */
const tests = ['packages/mixins-ui/test/merged.browser.test.ts']
const file = '../src/recipes/popup.ts'

export default [
  {
    name: 'a chosen row before another keeps its bottom corners',
    edits: [
      {
        file,
        find: '[aria-selected="true"]:has(+ [aria-selected="true"])',
        replace: '[aria-selected="true"]:has(+ [data-never])',
      },
    ],
    tests,
  },
  {
    name: 'a chosen row after another keeps its top corners',
    edits: [
      {
        file,
        find: '`[aria-selected="true"] + ${unlit}[aria-selected="true"]`',
        replace: '`[data-never] + ${unlit}[aria-selected="true"]`',
      },
    ],
    tests,
  },
  {
    name: 'a listbox draws no merged run',
    edits: [{ file: '../src/recipes/listbox.ts', find: '      mergedChoice,\n', replace: '' }],
    tests,
  },
]
