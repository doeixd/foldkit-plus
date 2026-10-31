/**
 * The lists a mutation's answer carries (#386), broken in turn:
 * `pnpm mutate packages/remote-server/test/answerLists.mutations.ts`.
 */
const file = '../src/index.ts'
const tests = ['packages/remote-server/test/answerLists.test.ts']

export default [
  {
    name: 'an unknown query is read',
    edits: [
      {
        file,
        find: 'if (source === undefined || select === undefined || select.entity !== source.entity)',
        replace:
          'if (select === undefined || (source !== undefined && select.entity !== source.entity))',
      },
    ],
    tests,
  },
  {
    name: 'a list with no select is read',
    edits: [
      {
        file,
        find: 'if (source === undefined || select === undefined || select.entity !== source.entity)',
        replace:
          'if (source === undefined || (select !== undefined && select.entity !== source.entity))',
      },
    ],
    tests,
  },
  {
    name: "a select of another entity than the query's is read",
    edits: [
      {
        file,
        find: 'if (source === undefined || select === undefined || select.entity !== source.entity)',
        replace: 'if (source === undefined || select === undefined)',
      },
    ],
    tests,
  },
  {
    name: 'a page with no size is read',
    edits: [
      {
        file,
        find: 'if (window.first === undefined || window.after !== undefined) return false',
        replace: 'if (window.after !== undefined) return false',
      },
    ],
    tests,
  },
  {
    name: 'a page after a cursor is read',
    edits: [
      {
        file,
        find: 'if (window.first === undefined || window.after !== undefined) return false',
        replace: 'if (window.first === undefined) return false',
      },
    ],
    tests,
  },
  {
    name: 'a select paging a relation past the bound is read',
    edits: [
      {
        file,
        find: 'if (checkPagesPerRelation([select]) !== undefined) return false',
        replace: '',
      },
    ],
    tests,
  },
  {
    name: 'every list is read, however many rows they list',
    edits: [{ file, find: '    if (listed > maxIds) return false', replace: '' }],
    tests,
  },
  {
    name: 'each list is counted alone against maxIdsPerEntity',
    edits: [{ file, find: '    rows.set(select.entity, listed)', replace: '' }],
    tests,
  },
  {
    name: 'a list whose read fails is reported as nothing',
    edits: [
      {
        file,
        find: 'answerUnread(payload.mutation, `list "${request.query}": ${error.message}`)',
        replace: 'answerUnread(payload.mutation, error.message)',
      },
    ],
    tests,
  },
  {
    name: 'the answer leaves its lists out',
    edits: [
      {
        file,
        find: '...(answered.length === 0 ? {} : { lists: answered }),',
        replace: '',
      },
    ],
    tests,
  },
]
