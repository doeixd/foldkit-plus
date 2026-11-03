/**
 * #470: a restored path left out of the envelope and filled before the first
 * render, each step broken in turn: `pnpm mutate
 * packages/ssr/test/restored.mutations.ts` checks that a test fails for each.
 */
const client = '../src/client.ts'
const index = '../src/index.ts'
const plan = '../src/shared.ts'
const tests = ['packages/ssr/test/restored.test.ts']

export default [
  {
    name: 'a restored path is not a cover',
    edits: [
      {
        file: index,
        find: "  if (plan.restored.some(({ path: outer }) => contains(outer))) return 'restored'\n",
        replace: '',
      },
    ],
    tests,
  },
  {
    name: 'the browser Model is given the baseline, not the restored values',
    edits: [
      {
        file: index,
        find: 'plan.restored.reduce((browser, place) => place.copy(browser, model), resumed.success)',
        replace: 'resumed.success',
      },
    ],
    tests,
  },
  {
    name: 'the browser does not restore its own fields',
    edits: [
      {
        file: client,
        find: '    startingModel = plan.restore === undefined ? resumed.success : plan.restore(resumed.success)',
        replace: '    startingModel = resumed.success',
      },
    ],
    tests,
  },
  {
    name: 'a state that sends a restored path is accepted',
    edits: [
      {
        file: plan,
        find: '  if (sent !== undefined) {',
        replace: '  if (false) {',
      },
    ],
    tests,
  },
]
