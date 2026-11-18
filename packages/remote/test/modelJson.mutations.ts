/**
 * A Remote Model as JSON, broken in turn: `pnpm mutate packages/remote/test/modelJson.mutations.ts`.
 */
const file = '../src/runtimeJson.ts'
const tests = ['packages/remote/test/modelJson.test.ts']

export default [
  {
    name: 'a Set is not written, so an entity entry cannot be encoded',
    edits: [
      {
        file,
        find: '  if (value instanceof Set)\n',
        replace: '  if (value instanceof Set && false)\n',
      },
    ],
    tests,
  },
  {
    name: 'undefined is dropped on the way back instead of kept',
    edits: [
      {
        file,
        find: "    case 'undefined':\n      return undefined",
        replace: "    case 'undefined':\n      return null",
      },
    ],
    tests,
  },
  {
    name: 'an object carrying the tag key is not wrapped',
    edits: [
      {
        file,
        find: "    return Object.hasOwn(record, TAG) ? tagged('object', record) : record",
        replace: '    return record',
      },
    ],
    tests,
  },
  {
    name: 'a value with no JSON form is written as nothing',
    edits: [
      {
        file,
        find: '  throw new TypeError(\n    `a Remote Model holds a',
        replace: '  return null\n  throw new TypeError(\n    `a Remote Model holds a',
      },
    ],
    tests,
  },
]
