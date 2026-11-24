export default [
  {
    name: 'may omits readable dependencies along with hidden ones',
    edits: [
      {
        file: '../src/server.ts',
        find: 'dependencies.get(condition)!.some(member => hidden.has(member))',
        replace: 'dependencies.get(condition)!.length > 0',
      },
    ],
    tests: ['packages/guard/test/mayAudit.test.ts'],
  },
]
