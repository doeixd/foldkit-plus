/**
 * An insert's stamps, broken in turn: `pnpm mutate packages/entity/test/stamp.mutations.ts`.
 */
const tests = ['packages/entity/test/stamp.test.ts']
const file = '../src/write.ts'

export default [
  {
    name: 'the id may be stamped',
    edits: [{ file, find: "if (key === 'id') return fail(", replace: 'if (false) return fail(' }],
    tests,
  },
  {
    name: 'a member the input writes may be stamped too',
    edits: [
      {
        file,
        find: 'declared.sets.some(set => set.field.key === key) ||',
        replace: 'false &&',
      },
    ],
    tests,
  },
  {
    name: 'a many relation may be stamped',
    edits: [
      {
        file,
        find: 'if (relation.cardinality !== \'one\') return fail(input, `stamps "${key}", a many relation`)',
        replace: '',
      },
    ],
    tests,
  },
  {
    name: 'a relation may take the clock',
    edits: [
      {
        file,
        find: 'Clock: () => fail(input, `stamps the relation "${key}" with the clock`),',
        replace: 'Clock: () => WriteStamp.Link({ relation: relation as OneRelation }),',
      },
    ],
    tests,
  },
  {
    name: 'a key that is no member is skipped',
    edits: [
      {
        file,
        find: 'if (!Object.hasOwn(fields, key)) return fail(input, `stamps "${key}", which is not a member`)',
        replace: '',
      },
    ],
    tests,
  },
  {
    name: 'the clock goes into text',
    edits: [
      {
        file,
        find: 'storedAsNumber(field.schema as unknown as Schema.Top)\n        ? WriteStamp.Field',
        replace: 'true\n        ? WriteStamp.Field',
      },
    ],
    tests,
  },
  {
    name: 'the viewer goes into a number',
    edits: [{ file, find: "stored.has('text')\n", replace: 'true\n' }],
    tests,
  },
  {
    name: 'a stamp alone sets nothing',
    edits: [{ file, find: '  write.stamps.length === 0\n', replace: '  true\n' }],
    tests,
  },
  {
    name: 'a stamped member is not among what a write writes',
    edits: [
      {
        file,
        find: '    ...write.stamps.map(\n',
        replace: '    ...[].map(\n',
      },
    ],
    tests,
  },
  {
    name: 'a relation takes a viewer of any Entity',
    edits: [
      {
        file,
        find: 'Option.filter(by.viewer, viewer => viewer.entity === relation.target().name)',
        replace: 'by.viewer',
      },
    ],
    tests,
  },
  {
    name: 'a missing clock is not named',
    edits: [
      {
        file,
        find: 'onNone: () => void unknown.push(field.key),',
        replace: 'onNone: () => undefined,',
      },
    ],
    tests,
  },
]
