/**
 * The server's read of what a client shows, beside a mutation's answer,
 * broken in turn: `pnpm mutate packages/remote-server/test/mutationAnswer.mutations.ts`.
 */
const tests = ['packages/remote-server/test/mutationAnswer.test.ts']
const index = '../src/index.ts'

export default [
  {
    name: 'a field the answer carried is read again',
    edits: [
      {
        file: index,
        find: 'field => !row.answered.has(field) || Object.hasOwn(relations, field),',
        replace: 'field => true,',
      },
    ],
    tests,
  },
  {
    name: 'a relation the answer carried is not read',
    edits: [
      {
        file: index,
        find: 'field => !row.answered.has(field) || Object.hasOwn(relations, field),',
        replace: 'field => !row.answered.has(field),',
      },
    ],
    tests,
  },
  {
    name: 'two slices of one entity: the last wins',
    edits: [
      {
        file: index,
        find: 'current === undefined ? slice : Requirement.mergeRelation(current, slice),',
        replace: 'slice,',
      },
    ],
    tests,
  },
  {
    name: 'a row only put in a list is not read',
    edits: [
      {
        file: index,
        find: "      if (change._tag === 'Insert') name(change.edge.entity, change.edge.id, [])",
        replace: '      void change',
      },
    ],
    tests,
  },
  {
    name: 'a deleted row is read',
    edits: [
      {
        file: index,
        find: '    for (const gone of outcome.deleted) named.delete(`${gone.entity}:${gone.id}`)',
        replace: '',
      },
    ],
    tests,
  },
  {
    name: 'a row the read did not find is answered',
    edits: [
      {
        file: index,
        find: 'const found = requests.filter(request => reached.has(`${request.entity}:${request.id}`))',
        replace: 'const found = requests',
      },
    ],
    tests,
  },
  {
    name: 'a failed read fails the mutation',
    edits: [
      {
        file: index,
        find: '              Effect.as(Option.none()),',
        replace:
          '              Effect.andThen(Effect.fail(new RemoteMutationError({ message: error.message }))),',
      },
    ],
    tests,
  },
  {
    name: 'a failed read is not reported',
    edits: [
      {
        file: index,
        find: 'Diagnostics.report(answerUnread(payload.mutation, error.message)).pipe(',
        replace: 'Effect.void.pipe(',
      },
    ],
    tests,
  },
  {
    name: 'the handler drops the read',
    edits: [
      {
        file: index,
        find: '...Option.match(read, { onNone: () => ({}), onSome: value => ({ read: value }) }),',
        replace: '',
      },
    ],
    tests,
  },
]
