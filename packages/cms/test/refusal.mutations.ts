/**
 * The editor's reading of refusals, broken in turn:
 * `pnpm mutate packages/cms/test/refusal.mutations.ts`.
 */
const tests = ['packages/cms/test/editor.test.ts']
const editor = '../src/editor.ts'

export default [
  {
    name: 'a taken address is not shown on the address',
    edits: [
      { file: editor, find: 'if (Option.isNone(refusal)) return root', replace: 'return root' },
    ],
    tests,
  },
  {
    name: 'a refusal of any key lands on the address',
    edits: [
      { file: editor, find: 'if (content.roles.slug?.key !== key) return root', replace: '' },
    ],
    tests,
  },
  {
    name: 'a conflict is not its own status',
    edits: [{ file: editor, find: 'if (conflicted) return', replace: 'if (false) return' }],
    tests,
  },
]
