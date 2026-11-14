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
        find: 'const issued = Object.freeze(',
        replace: 'const issued = record ?? Object.freeze(',
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
  {
    name: "an issued record's array shared with the caller",
    edits: [
      {
        file: evidence,
        find: 'Array.isArray(value) ? Object.freeze([...value]) : value',
        replace: 'value',
      },
    ],
    tests,
  },
  {
    name: "an issued record's array copied but not frozen",
    edits: [{ file: evidence, find: 'Object.freeze([...value])', replace: '[...value]' }],
    tests,
  },
]
