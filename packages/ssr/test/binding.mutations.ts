const tests = ['packages/ssr/test/binding.test.ts']

export default [
  {
    name: 'Binding.define skips undeclared anchor key guard',
    edits: [
      {
        file: '../src/binding.ts',
        find: 'if (!keySet.has(key)) {',
        replace: 'if (false) {',
      },
    ],
    tests,
  },
]
