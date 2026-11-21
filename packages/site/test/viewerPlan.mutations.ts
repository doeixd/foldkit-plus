/**
 * `pnpm mutate packages/site/test/viewerPlan.mutations.ts`
 */
const tests = ['packages/site/test/viewerPlan.test.ts']

export default [
  {
    name: 'askReads takes a viewer-reading Site node for one the route alone decides',
    edits: [
      {
        file: '../../remote/src/active.ts',
        find: "    !('readsBeyondActivation' in entry)\n",
        replace: '    true\n',
      },
    ],
    tests,
  },
  {
    name: 'the Site node drops the mark that its read goes beyond the route',
    edits: [
      {
        file: '../src/index.ts',
        find: '    readsBeyondActivation: true,\n',
        replace: '',
      },
    ],
    tests,
  },
]
