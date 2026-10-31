/**
 * Single flight for lists on the client (#386), broken in turn:
 * `pnpm mutate packages/remote/test/answerLists.mutations.ts`.
 */
const writes = '../src/writes.ts'
const index = '../src/index.ts'
const tests = [
  'packages/remote/test/answerLists.test.ts',
  'packages/remote-server/test/singleFlight.test.ts',
]

export default [
  {
    name: 'a list already stale is asked back',
    edits: [
      {
        file: writes,
        find: '          layered.connections[identity]?.stale !== true,',
        replace: '          true,',
      },
    ],
    tests,
  },
  {
    name: 'a list the prediction leaves to be fetched is not asked back',
    edits: [
      {
        file: writes,
        find: 'moved.filter(identity => judged.connections[identity]!.stale || short.has(identity))',
        replace: 'moved.filter(identity => short.has(identity))',
      },
    ],
    tests,
  },
  {
    name: 'a list the prediction leaves short is not asked back',
    edits: [
      {
        file: writes,
        find: 'moved.filter(identity => judged.connections[identity]!.stale || short.has(identity))',
        replace: 'moved.filter(identity => judged.connections[identity]!.stale)',
      },
    ],
    tests,
  },
  {
    name: 'every list the prediction placed is asked back',
    edits: [
      {
        file: writes,
        find: 'moved.filter(identity => judged.connections[identity]!.stale || short.has(identity))',
        replace: 'moved',
      },
    ],
    tests,
  },
  {
    name: 'a list read from its end is asked back',
    edits: [{ file: writes, find: 'query.window.first !== undefined &&', replace: '' }],
    tests,
  },
  {
    name: 'a list read after a cursor is asked back',
    edits: [
      {
        file: writes,
        find: '            query.window.first !== undefined &&\n            query.window.after === undefined,',
        replace: '            query.window.first !== undefined,',
      },
    ],
    tests,
  },
  {
    name: 'more lists are asked back than the server takes',
    edits: [{ file: writes, find: '.slice(0, MAX_ANSWER_LISTS)', replace: '' }],
    tests,
  },
  {
    name: 'the request carries no lists',
    edits: [
      {
        file: writes,
        find: '                      lists,\n',
        replace: '',
      },
    ],
    tests,
  },
  {
    name: 'a durable write keeps no lists',
    edits: [
      {
        file: '../src/model.ts',
        find: '...(write.durable?.lists === undefined ? {} : { lists: write.durable.lists }),',
        replace: '',
      },
    ],
    tests: ['examples/chirp/test/requests.test.ts'],
  },
  {
    name: 'the outbox sends a durable write without its lists',
    edits: [{ file: '../src/outbox.ts', find: 'lists: write.lists,', replace: '' }],
    tests: ['examples/chirp/test/requests.test.ts'],
  },
  {
    name: 'a page lands in a list the answer did not move',
    edits: [
      {
        file: index,
        find: 'if (held === undefined || held.stale || judged.connections[identity] === held) continue',
        replace: 'if (held === undefined || held.stale) continue',
      },
    ],
    tests,
  },
  {
    name: 'a page lands in a list stale before the write',
    edits: [
      {
        file: index,
        find: 'if (held === undefined || held.stale || judged.connections[identity] === held) continue',
        replace: 'if (held === undefined || judged.connections[identity] === held) continue',
      },
    ],
    tests,
  },
  {
    name: 'a page merges into what the client placed',
    edits: [
      {
        file: index,
        find: 'const owed = { ...next, connections: setConnectionStale(next.connections, identity, true) }',
        replace: 'const owed = next',
      },
    ],
    tests,
  },
  {
    name: 'a page past its window lands',
    edits: [
      {
        file: index,
        find: "if (page._tag !== 'ConnectionMerged') continue",
        replace: '',
      },
    ],
    tests,
  },
  {
    name: 'an answer carries no pages to the Model',
    edits: [
      {
        file: index,
        find: '          : withAnswerLists(\n              remote,\n              impactOf(reduced, withAnswerRead(answer), remote.entities, contextOf(model)),\n              answer,\n            )',
        replace:
          '          : impactOf(reduced, withAnswerRead(answer), remote.entities, contextOf(model))',
      },
    ],
    tests,
  },
]
