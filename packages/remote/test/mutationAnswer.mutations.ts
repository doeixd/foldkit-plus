/**
 * A mutation's answer carrying what the client shows, broken in turn:
 * `pnpm mutate packages/remote/test/mutationAnswer.mutations.ts`.
 */
const tests = [
  'packages/remote/test/mutationAnswer.test.ts',
  'packages/remote-server/test/mutationAnswer.test.ts',
]
const shown = '../src/shown.ts'
const client = '../src/client.ts'
const index = '../src/index.ts'
const model = '../src/model.ts'

export default [
  {
    name: 'a relation target is not shown under its own entity',
    edits: [
      {
        file: shown,
        find: '    for (const relation of Object.values(slice.relations ?? {})) add(relation)',
        replace: '',
      },
    ],
    tests,
  },
  {
    name: 'a list does not show what it selects',
    edits: [
      {
        file: shown,
        find: '  for (const connection of asked.connections) add(connection.select)',
        replace: '',
      },
    ],
    tests,
  },
  {
    name: 'Data.mutate sends nothing shown',
    edits: [{ file: index, find: '                shown,\n', replace: '' }],
    tests,
  },
  {
    name: 'an empty shown list is sent',
    edits: [
      {
        file: client,
        find: '...(shown === undefined || shown.length === 0 ? {} : { shown }),',
        replace: '...(shown === undefined ? {} : { shown }),',
      },
    ],
    tests,
  },
  {
    name: 'the client drops the read the server sent',
    edits: [{ file: client, find: '    read: result.read,\n', replace: '' }],
    tests,
  },
  {
    name: 'the settling Message drops the read',
    edits: [
      {
        file: index,
        find: '...(outcome.read === undefined ? {} : { read: outcome.read }),',
        replace: '',
      },
    ],
    tests,
  },
  {
    name: 'the read is not written',
    edits: [
      {
        file: model,
        find: ': writeRead(settled.store, read.requests, read.result, message.now),',
        replace: ': settled.store,',
      },
    ],
    tests,
  },
  {
    name: 'a repeated answer writes its read again',
    edits: [
      {
        file: model,
        find: 'message.read === undefined || model.mutations.applied.has(message.requestId)',
        replace: 'message.read === undefined',
      },
    ],
    tests,
  },
  {
    name: 'the read settles no failure',
    edits: [
      {
        file: model,
        find: ': [...fieldMarks(read.requests), ...patchedMarks(read.result.entities)]),',
        replace: ': []),',
      },
    ],
    tests,
  },
  {
    name: 'placement ignores what the answer read',
    edits: [
      {
        file: index,
        find: 'remote.mutations.applied.has(answer.requestId) ? answer : withAnswerRead(answer),',
        replace: 'answer,',
      },
    ],
    tests,
  },
  {
    name: 'a row the answer patched and read is placed by the read alone',
    edits: [
      {
        file: index,
        find: 'held === undefined ? patch : { ...held, values: { ...held.values, ...patch.values } },',
        replace: 'patch,',
      },
    ],
    tests,
  },
]
