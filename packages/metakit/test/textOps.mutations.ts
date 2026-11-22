const tests = ['packages/metakit/test/textOps.test.ts']

export default [
  {
    name: 'upperAscii uses locale toUpperCase instead of ASCII a-z only',
    edits: [
      {
        file: '../src/ops/str.ts',
        find: 'text!.replace(/[a-z]/g, letter => letter.toUpperCase())',
        replace: 'text!.toUpperCase()',
      },
    ],
    tests,
  },
  {
    name: 'SQLite endsWith drops empty-suffix guard',
    edits: [
      {
        file: '../src/sqlLowering.ts',
        find: 'q`(CASE WHEN (${s}) IS NULL OR (${suffix}) IS NULL THEN NULL ELSE (length(${suffix}) = 0 OR substr(${s}, -length(${suffix})) = ${suffix}) END)`',
        replace: 'q`(substr(${s}, -length(${suffix})) = ${suffix})`',
      },
    ],
    tests,
  },
  {
    name: 'SQLite endsWith drops NULL guard',
    edits: [
      {
        file: '../src/sqlLowering.ts',
        find: 'q`(CASE WHEN (${s}) IS NULL OR (${suffix}) IS NULL THEN NULL ELSE (length(${suffix}) = 0 OR substr(${s}, -length(${suffix})) = ${suffix}) END)`',
        replace: 'q`(length(${suffix}) = 0 OR substr(${s}, -length(${suffix})) = ${suffix})`',
      },
    ],
    tests,
  },
  {
    name: 'str.upperAscii drops idempotent law',
    edits: [
      {
        file: '../src/ops/laws.ts',
        find: "'str.upperAscii': { idempotent: true },",
        replace: "'str.upperAscii': {},",
      },
    ],
    tests,
  },
]
