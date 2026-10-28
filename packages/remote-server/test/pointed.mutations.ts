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
