/**
 * What a declared write's answer names because its row points there, broken in turn:
 * `pnpm mutate packages/remote-server/test/pointed.mutations.ts`.
 */
const file = '../src/index.ts'
const tests = [
  'packages/remote-server/test/pointed.test.ts',
  'packages/guard/test/answered.test.ts',
]

export default [
  {
    name: 'every row a link reaches is named',
    edits: [
      { file, find: 'return changes ? [relation.key] : []', replace: 'return [relation.key]' },
    ],
    tests,
  },
  {
    name: 'a count changes with any link',
    edits: [
      { file, find: 'Count: ({ relation: read }) => isThis(read),', replace: 'Count: () => true,' },
    ],
    tests,
  },
  {
    name: 'an exists changes with any link',
    edits: [
      {
        file,
        find: 'Exists: ({ relation: read }) => isThis(read),',
        replace: 'Exists: () => true,',
      },
    ],
    tests,
  },
  {
    name: 'a supplied member changes with no link',
    edits: [{ file, find: 'Supplied: () => true,', replace: 'Supplied: () => false,' }],
    tests,
  },
  {
    name: 'a relation of another Entity with the same key is this one',
    edits: [
      {
        file,
        find: 'read.owner.token === relation.owner.token && read.key === relation.key',
        replace: 'read.key === relation.key',
      },
    ],
    tests,
  },
  {
    name: 'a delete that deleted nothing names where its row pointed',
    edits: [
      {
        file,
        find: "return outcome === 'deleted' ? naming(gone, before) : gone",
        replace: 'return naming(gone, before)',
      },
    ],
    tests,
  },
  {
    name: 'the links are read as stored, not as the writer may see the row',
    edits: [
      {
        file,
        find: '      writer.read !== undefined\n        ? writer.read({ id, fields: pointers, principal })',
        replace:
          '      writer.read === undefined\n        ? writer.read!({ id, fields: pointers, principal })',
      },
    ],
    tests,
  },
  {
    name: 'a row the answer only settled counts as reached',
    edits: [
      {
        file,
        find: 'const reached = new Set(read.entities.map(row => `${row.entity}:${row.id}`))',
        replace:
          'const reached = new Set([...read.entities, ...read.settled].map(row => `${row.entity}:${row.id}`))',
      },
    ],
    tests,
  },
  {
    name: 'what the answer settled of a row it did not reach is sent',
    edits: [
      {
        file,
        find: 'settled: read.settled.filter(row => !unreached.has(`${row.entity}:${row.id}`)),',
        replace: 'settled: read.settled,',
      },
    ],
    tests,
  },
]
