/**
 * `RemoteServer.memory`'s authorization, broken in turn: `pnpm mutate
 * packages/remote-server/test/memory.mutations.ts` checks that a test fails for
 * every one.
 */
const tests = ['packages/remote-server/test/memory.test.ts']
const file = '../src/index.ts'

export default [
  {
    name: 'an entity is read without its authorize',
    edits: [
      {
        file,
        find: '...(Object.hasOwn(authorize, name) ? { authorize: authorize[name]! } : {}),',
        replace: '',
      },
    ],
    tests,
  },
  {
    name: 'an authorize for an undeclared entity is accepted',
    edits: [{ file, find: '  if (unknown.length > 0) {', replace: '  if (false) {' }],
    tests,
  },
  {
    name: 'the layer answers as no one',
    edits: [{ file, find: 'config.principal as P', replace: 'undefined as P' }],
    tests,
  },
  {
    name: 'memory takes a shared field the entity does not declare',
    edits: [
      {
        file: '../src/index.ts',
        find: 'field => declared !== undefined && !Object.hasOwn(declared, field),',
        replace: '() => false,',
      },
    ],
    tests: ['packages/remote-server/test/declared-fields.test.ts'],
  },
  {
    name: 'memory takes shared fields of an entity the domain does not declare',
    edits: [{ file: '../src/index.ts', find: "['shared', shared],", replace: '' }],
    tests: ['packages/remote-server/test/declared-fields.test.ts'],
  },
]
