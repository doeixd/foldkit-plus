/**
 * Choices' drafts are their options' text (#304):
 * `pnpm mutate packages/form/test/choiceDrafts.mutations.ts`.
 */
const tests = ['packages/form/test/choices.test.ts']

export default [
  {
    name: 'a filled list keeps its values as they are',
    edits: [
      {
        file: '../src/index.ts',
        find: "  if (plan.kind === 'list' && Array.isArray(value)) return value.map(item => String(item))\n",
        replace: '',
      },
    ],
    tests,
  },
]
