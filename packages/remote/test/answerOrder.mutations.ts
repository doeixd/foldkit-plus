/**
 * Mutation answers settling in request order, broken in turn:
 * `pnpm mutate packages/remote/test/answerOrder.mutations.ts`.
 */
const tests = ['packages/remote/test/answerOrder.test.ts']
const file = '../src/mutation.ts'

export default [
  {
    name: 'a request keeps no order',
    edits: [
      {
        file,
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
        file,
        find: '.filter(([field]) => !newer(`${key}\\u0000${field}`)),',
        replace: '.filter(() => true),',
      },
    ],
    tests,
  },
  {
    name: 'an earlier answer clears a tombstone a later one settled',
    edits: [{ file, find: '        if (newer(key)) return []\n', replace: '' }],
    tests,
  },
  {
    name: 'an earlier delete answer deletes a row a later one wrote',
    edits: [{ file, find: '.filter(key => !rewritten(key))', replace: '' }],
    tests,
  },
  {
    name: 'nothing is recorded as settled',
    edits: [
      {
        file,
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
        file,
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
        file,
        find: 'operations, writes, ...ordered(state, requestId, []) }',
        replace: 'operations, writes }',
      },
    ],
    tests,
  },
  {
    name: 'a settled request keeps its order',
    edits: [{ file, find: '  order.delete(requestId)\n', replace: '' }],
    tests,
  },
]
