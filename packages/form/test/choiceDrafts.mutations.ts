/**
 * Choices' drafts are their options' text, and no two options share one
 * (#304, #305): `pnpm mutate packages/form/test/choiceDrafts.mutations.ts`.
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
  {
    name: 'options drawn alike are taken',
    edits: [
      {
        file: '../src/input.ts',
        find: 'if (earlier !== undefined && earlier !== option)',
        replace: 'if (false)',
      },
    ],
    tests,
  },
  {
    name: 'an option named twice is refused',
    edits: [
      {
        file: '../src/input.ts',
        find: 'if (earlier !== undefined && earlier !== option)',
        replace: 'if (earlier !== undefined)',
      },
    ],
    tests,
  },
]
