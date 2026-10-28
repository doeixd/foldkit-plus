/**
 * An overwrite waits for the server's answer about the draft, broken in turn:
 * `pnpm mutate packages/cms-drizzle/test/editorSettling.mutations.ts`.
 */
const file = '../../cms/src/editor.ts'
const tests = ['packages/cms-drizzle/test/editor.test.ts']

export default [
  {
    name: 'an overwrite takes the old absence of a draft for the answer',
    edits: [
      {
        file,
        find: "editor().settling === 'overwrite' && answered(root, 'draft')",
        replace: "editor().settling === 'overwrite' && fresh(read(root, 'draft'))",
      },
    ],
    tests,
  },
  {
    name: 'an overwrite does not wait for what is still asked',
    edits: [
      {
        file,
        find: 'data.plan(root, projection).length === 0',
        replace: 'true',
      },
    ],
    tests,
  },
]
