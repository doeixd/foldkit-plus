/**
 * The check for issuers outside the producers:
 * `pnpm mutate scripts/test/evidenceCheck.mutations.ts`.
 */
const file = '../evidence-check.mjs'
const tests = ['scripts/test/evidenceCheck.test.ts']

export default [
  {
    name: 'every file counts as a producer',
    edits: [{ file, find: 'if (Object.hasOwn(producers, path)) return []', replace: 'return []' }],
    tests,
  },
  {
    name: 'no producer is allowed',
    edits: [{ file, find: 'if (Object.hasOwn(producers, path)) return []', replace: '' }],
    tests,
  },
  {
    name: 'tests and scripts are not read',
    edits: [{ file, find: "['packages', 'examples', 'scripts']", replace: "['packages']" }],
    tests,
  },
  {
    name: 'dependencies are read',
    edits: [
      {
        file,
        find: "new Set(['node_modules', 'dist', '.tsbuild', '.git'])",
        replace: "new Set(['.git'])",
      },
    ],
    tests,
  },
  {
    name: 'a finding does not fail the command',
    edits: [{ file, find: '    process.exit(1)\n', replace: '' }],
    tests,
    survives:
      'the test runs the script from disk, which pnpm mutate cannot reach; made by hand, it fails "fails the command on a finding"',
  },
]
