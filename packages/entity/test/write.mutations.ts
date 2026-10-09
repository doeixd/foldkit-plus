/**
 * `Write`, broken in turn: `pnpm mutate packages/entity/test/write.mutations.ts`.
 */
const tests = ['packages/entity/test/write.test.ts']
const file = '../src/write.ts'

export default [
  {
    name: 'any field can be the id',
    edits: [{ file, find: "if (id.key !== 'id')", replace: 'if (false)' }],
    tests,
  },
  {
    name: 'the id can be the revision',
    edits: [{ file, find: 'if (options.expect === options.id)', replace: 'if (false)' }],
    tests,
  },
  {
    name: 'the revision need not be a field',
    edits: [{ file, find: "fieldAt(input, options.expect, 'expect')", replace: '' }],
    tests,
  },
  {
    name: 'an unmapped key is set',
    edits: [
      {
        file,
        find: "        case 'Unmapped':\n          break\n",
        replace:
          "        case 'Unmapped':\n          sets.push(Object.freeze({ key, field: member as never }))\n          break\n",
      },
    ],
    tests,
  },
  {
    name: 'a write may set nothing',
    edits: [{ file, find: 'if (sets.length === 0)', replace: 'if (false)' }],
    tests,
  },
  {
    name: 'the keys asked for are ignored',
    edits: [{ file, find: 'if (wanted !== undefined && !wanted.has(key)) continue', replace: '' }],
    tests,
  },
  {
    name: 'a value is written decoded',
    edits: [
      {
        file,
        find: 'values[field.key] = encoded(field, given[key])',
        replace: 'values[field.key] = given[key]',
      },
    ],
    tests,
  },
  {
    name: 'the sets can be changed after',
    edits: [{ file, find: 'sets: Object.freeze(sets),', replace: 'sets,' }],
    tests,
  },
]
