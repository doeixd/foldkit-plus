const tests = ['packages/metakit/test/t11-language-lowerings.test.ts']

export default [
  {
    name: 'Language.restrict drops default SQL lowerings',
    edits: [
      {
        file: '../src/language.ts',
        find: 'return make(families, { lowerings: sqlLowerings(...entries) })',
        replace: 'return make(families)',
      },
    ],
    tests,
  },
  {
    name: 'Language.compose drops defaults when only one language has them',
    edits: [
      {
        file: '../src/language.ts',
        find: 'return Effect.succeed(make(families, { lowerings: left ?? right }))',
        replace: 'return Effect.succeed(make(families))',
      },
    ],
    tests,
  },
  {
    name: 'Language.compose drops lowerings when both languages supply defaults',
    edits: [
      {
        file: '../src/language.ts',
        find: 'return Effect.succeed(make(families, { lowerings: sqlLowerings(...entries.values()) }))',
        replace: 'return Effect.succeed(make(families))',
      },
    ],
    tests,
  },
  {
    name: 'Language.compose silently accepts conflicting lowerings',
    edits: [
      {
        file: '../src/language.ts',
        find: 'left !== undefined && right !== undefined && left !== right',
        replace: 'false',
      },
    ],
    tests,
  },
]
