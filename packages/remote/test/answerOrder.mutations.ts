/**
 * Mutation answers settling in request order, broken in turn:
 * `pnpm mutate packages/remote/test/answerOrder.mutations.ts`.
 */
const tests = ['packages/remote/test/answerOrder.test.ts']
const file = '../src/mutation.ts'
const model = '../src/model.ts'

export default [
  {
    name: 'a request keeps no order',
    edits: [
      {
        file: '../src/ledger.ts',
        find: '  order: new Map([...state.order, [requestId, state.sequence + 1]]),\n',
        replace: '',
      },
    ],
    tests,
  },
  {
    name: 'an earlier answer overwrites a field a later one settled',
    edits: [
      {
        file: '../src/ledger.ts',
        find: '.filter(([field]) => !newer(`${key}\\u0000${field}`)),',
        replace: '.filter(() => true),',
      },
    ],
    tests,
  },
  {
    name: 'an earlier answer clears a tombstone a later one settled',
    edits: [{ file: '../src/ledger.ts', find: '        if (newer(key)) return []\n', replace: '' }],
    tests,
  },
  {
    name: 'an earlier delete answer deletes a row a later one wrote',
    edits: [{ file: '../src/ledger.ts', find: '.filter(key => !rewritten(key))', replace: '' }],
    tests,
  },
  {
    name: 'nothing is recorded as settled',
    edits: [
      {
        file: '../src/ledger.ts',
        find: 'if (at !== undefined && at > earliest) for (const mark of marks) settled.set(mark, at)',
        replace: '',
      },
    ],
    tests,
  },
  {
    name: 'settled marks are kept after every earlier request settled',
    edits: [
      {
        file: '../src/ledger.ts',
        find: 'for (const [mark, by] of state.settled) if (by > earliest) settled.set(mark, by)',
        replace: 'for (const [mark, by] of state.settled) settled.set(mark, by)',
      },
    ],
    tests,
  },
  {
    name: 'a failed request keeps its order',
    edits: [
      {
        file: '../src/ledger.ts',
        find: 'operations, writes, ...ordered(state, requestId, []) }',
        replace: 'operations, writes }',
      },
    ],
    tests,
  },
  {
    name: 'a settled request keeps its order',
    edits: [{ file: '../src/ledger.ts', find: '  order.delete(requestId)\n', replace: '' }],
    tests,
  },
  {
    name: "an earlier answer's read is written whole",
    edits: [
      {
        file: model,
        find: ': unsettledRead(message.read, settledLater(model.mutations, message.requestId))',
        replace: ': message.read',
      },
    ],
    tests,
  },
  {
    name: "an earlier answer's read rewrites a row a later one deleted",
    edits: [
      {
        file: model,
        find: '    if (newer(entityKey(entity.entity, entity.id))) return []\n',
        replace: '',
      },
    ],
    tests,
  },
  {
    name: "an earlier answer's read overwrites a field a later one settled",
    edits: [
      {
        file: model,
        find: '([field]) => !newer(fieldMark(entity.entity, entity.id, field)),',
        replace: '() => true,',
      },
    ],
    tests,
  },
  {
    name: "an earlier answer's read tombstones a row a later one wrote",
    edits: [
      { file: model, find: 'return answered.has(key) || !rewritten(key)', replace: 'return true' },
    ],
    tests,
  },
  {
    name: "an earlier answer's read loses the request of a row it answers",
    edits: [
      {
        file: model,
        find: 'return answered.has(key) || !rewritten(key)',
        replace: 'return !rewritten(key)',
      },
    ],
    tests,
    survives:
      'Only the windows of its relation fields ride on such a request (its values and failures are written from the result), and Post has no relation.',
  },
]
