/**
 * An insert's stamps on the server, broken in turn:
 * `pnpm mutate packages/remote-drizzle/test/stamp.mutations.ts`.
 */
const tests = ['packages/remote-drizzle/test/stamp.test.ts']
const file = '../../remote-server/src/index.ts'

export default [
  {
    name: 'the stamped fields are not written',
    edits: [
      {
        file,
        find: 'values: { ...bound.values, ...stamps.values },',
        replace: 'values: bound.values,',
      },
    ],
    tests,
  },
  {
    name: 'the stamped relations are not written',
    edits: [
      { file, find: 'links: { ...bound.links, ...stamps.links },', replace: 'links: bound.links,' },
    ],
    tests,
  },
  {
    name: 'the input may set a stamped member',
    edits: [
      {
        file,
        find: 'values: { ...bound.values, ...stamps.values },',
        replace: 'values: { ...stamps.values, ...(given as Record<string, unknown>) },',
      },
    ],
    tests,
  },
  {
    name: 'a retry compares the clock',
    edits: [{ file, find: 'stamped: clocked,', replace: 'stamped: [],' }],
    tests,
  },
  {
    name: 'a visitor is not refused',
    edits: [
      {
        file,
        find: 'if (stamps.unknown.length > 0) return yield* Effect.fail(RemoteServer.forbid())',
        replace: '',
      },
    ],
    tests,
  },
  {
    name: 'the handler gives no viewer',
    edits: [
      {
        file,
        find: 'viewer: server.viewer === undefined ? Option.none() : server.viewer(caller),',
        replace: 'viewer: Option.none(),',
      },
    ],
    tests,
  },
  {
    name: 'a server without a viewer is made',
    edits: [{ file, find: 'if (viewing !== undefined) {', replace: 'if (false) {' }],
    tests,
  },
  {
    name: 'a stamped field is not counted as set where an insert is registered',
    edits: [
      {
        file,
        find: '...write.sets.map(set => set.field.key), ...stamped])',
        replace: '...write.sets.map(set => set.field.key)])',
      },
    ],
    tests,
  },
]
