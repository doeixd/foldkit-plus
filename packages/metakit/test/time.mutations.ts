export default [
  {
    name: 'addMonths skips month-end clamping',
    edits: [
      {
        file: '../src/ops/time.ts',
        find: 'const nd = Math.min(dom, daysInMonth(ny, nm))',
        replace: 'const nd = dom',
      },
    ],
    tests: ['packages/metakit/test/time.test.ts'],
  },
  {
    name: 'overlaps uses inclusive <= instead of half-open <',
    edits: [
      {
        file: '../src/ops/time.ts',
        find: 'return a < d && c < b',
        replace: 'return a <= d && c <= b',
      },
    ],
    tests: ['packages/metakit/test/time.test.ts'],
  },
  {
    name: 'SQL overlaps drops NULL guard',
    edits: [
      {
        file: '../src/sqlLowering.ts',
        find: 'q`(CASE WHEN (${a}) IS NULL OR (${b}) IS NULL OR (${c}) IS NULL OR (${d}) IS NULL THEN NULL ELSE ((${a}) < (${d}) AND (${c}) < (${b})) END)`',
        replace: 'q`((${a}) < (${d}) AND (${c}) < (${b}))`',
      },
    ],
    tests: ['packages/metakit/test/time.test.ts'],
  },
  {
    name: 'startOfMonth drops idempotent law',
    edits: [
      {
        file: '../src/ops/laws.ts',
        find: "'time.startOfMonth': { idempotent: true },",
        replace: "'time.startOfMonth': {},",
      },
    ],
    tests: ['packages/metakit/test/time.test.ts'],
  },
]
