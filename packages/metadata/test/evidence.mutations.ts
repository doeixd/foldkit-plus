/**
 * `Evidence` (#537), broken in turn: `pnpm mutate packages/metadata/test/evidence.mutations.ts`.
 */
const evidence = '../src/evidence.ts'
const tests = ['packages/metadata/test/evidence.test.ts']

export default [
  {
    name: 'issuedBy answers for any record',
    edits: [
      {
        file: evidence,
        find: 'Option.fromUndefinedOr(issuedBy.get(record))',
        replace: "Option.some(issuedBy.get(record) ?? 'anyone')",
      },
    ],
    tests,
  },
  {
    name: 'issue stamps the record it was handed',
    edits: [
      {
        file: evidence,
        find: 'const issued = Object.freeze({ ...record })',
        replace: 'const issued = record',
      },
    ],
    tests,
  },
  {
    name: 'runtimeOnly takes an empty reason',
    edits: [
      {
        file: evidence,
        find: 'if (fields.why.trim().length === 0)',
        replace: 'if (fields.why.length < 0)',
      },
    ],
    tests,
  },
  {
    name: 'runtimeOnly takes a blank reason',
    edits: [
      {
        file: evidence,
        find: 'if (fields.why.trim().length === 0)',
        replace: "if (fields.why === '')",
      },
    ],
    tests,
  },
  {
    name: 'a second issuer of a name accepted',
    edits: [
      { file: evidence, find: 'if (taken.has(name))', replace: 'if (taken.has(name) && false)' },
    ],
    tests,
  },
]
