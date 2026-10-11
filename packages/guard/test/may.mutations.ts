/**
 * Reading `may` on the client, broken in turn:
 * `pnpm mutate packages/guard/test/may.mutations.ts`.
 */
const file = '../src/may.ts'
const tests = ['packages/guard/test/server.test.ts']

export default [
  {
    name: 'a member may be set whatever the row’s Update',
    edits: [
      {
        file,
        find: "May.can(may, 'Update') && (!Object.hasOwn(may.members, member)",
        replace: '(!Object.hasOwn(may.members, member)',
      },
    ],
    tests,
  },
  {
    name: 'a member’s own rule is not read',
    edits: [{ file, find: '|| may.members[member] === true', replace: '|| true' }],
    tests,
  },
  {
    name: 'a relation may be pointed whatever the row’s Update',
    edits: [
      {
        file,
        find: "May.can(may, 'Update') &&\n    (!Object.hasOwn(may.relations, relation)",
        replace: '(!Object.hasOwn(may.relations, relation)',
      },
    ],
    tests,
  },
  {
    name: 'a relation’s own rule is not read',
    edits: [{ file, find: 'may.relations[relation]![interaction])', replace: 'true)' }],
    tests,
  },
]
