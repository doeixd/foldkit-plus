/**
 * A key's check as a Command definition, broken in turn:
 * `pnpm mutate packages/form/test/check.mutations.ts`.
 */
const file = '../src/index.ts'
const tests = [
  'packages/form/test/checks.test.ts',
  'examples/foldkit/form/test/scene.test.ts',
  'examples/foldkit/form/test/story.test.ts',
]

export default [
  {
    name: 'the check runs under another name than its definition',
    edits: [
      {
        file,
        find: 'defineCommand(`${name}.check`, {',
        replace: 'defineCommand(`${name}.asked`, {',
      },
    ],
    tests,
  },
  {
    name: 'the check sees none of the other values',
    edits: [{ file, find: '        values: decoded(model),', replace: '        values: {},' }],
    tests,
  },
  {
    name: 'the check does not know what the form edits',
    edits: [
      {
        file,
        find: '        subject: model.subject,\n      })',
        replace: '        subject: {},\n      })',
      },
    ],
    tests,
  },
]
