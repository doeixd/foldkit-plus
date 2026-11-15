/**
 * The journal's `judge` hook, each part broken in turn: `pnpm mutate
 * packages/durable/test/laws.mutations.ts` checks that a test fails for every one.
 */
const tests = ['packages/durable/test/journal.test.ts', 'packages/durable/test/d1.test.ts']
const file = '../src/journal.ts'

export default [
  {
    name: 'the hook is dropped',
    edits: [{ file, find: 'if (options.judge !== undefined) {', replace: 'if (false) {' }],
    tests,
  },
  {
    name: 'after is given the snapshot before',
    edits: [
      {
        file,
        find: 'after: reduced,',
        replace: 'after: snapshot,',
      },
    ],
    tests,
  },
  {
    name: 'the law judges the operation as sent',
    edits: [
      {
        file,
        find: 'operation: stamped,\n              before: snapshot,',
        replace: 'operation,\n              before: snapshot,',
      },
    ],
    tests,
  },
  {
    name: 'a refusal carries no rule',
    edits: [{ file, find: 'rule: judged.rule,', replace: '' }],
    tests,
  },
]
