const tests = ['packages/remote/test/impactGraph.test.ts']

export default [
  {
    name: 'mutation answers judge held queries that read none of the changed paths',
    edits: [
      {
        file: '../src/impact.ts',
        find: 'writes.filter(write => pathsMatch(write.paths, paths)).map(write => write.change)',
        replace: 'writes.map(write => write.change)',
      },
    ],
    tests,
  },
]
