const tests = ['packages/metakit/test/arrHas.test.ts']

export default [
  {
    name: 'Postgres arr.has drops NULL guard on empty array',
    edits: [
      {
        file: '../src/sqlLowering.ts',
        find: 'q`(CASE WHEN (${list}) IS NULL OR (${value}) IS NULL THEN NULL ELSE (${value} = ANY(${list})) END)`',
        replace: 'q`(${value} = ANY(${list}))`',
      },
    ],
    tests,
  },
  {
    name: 'SQLite arr.has drops NULL guard',
    edits: [
      {
        file: '../src/sqlLowering.ts',
        find: 'q`(CASE WHEN (${list}) IS NULL OR (${value}) IS NULL THEN NULL ELSE EXISTS (SELECT 1 FROM json_each(${list}) WHERE value = ${value}) END)`',
        replace: 'q`EXISTS (SELECT 1 FROM json_each(${list}) WHERE value = ${value})`',
      },
    ],
    tests,
  },
  {
    name: 'abstract arr.has assume drops count >= 1 constraint',
    edits: [
      {
        file: '../src/abstract/ops.ts',
        find: '    assume: (args, state) => {\n      const count = state.varOf(countOf(args[0]!))\n      if (Option.isSome(count)) state.zone.constrainLower(count.value, 1)\n    },',
        replace: '    assume: () => {},',
      },
    ],
    tests,
  },
]
