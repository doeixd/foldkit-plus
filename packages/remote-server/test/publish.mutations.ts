/**
 * A mutation's live publish, broken in turn:
 * `pnpm mutate packages/remote-server/test/publish.mutations.ts`.
 */
const tests = ['packages/remote-server/test/liveHub.test.ts']
const server = '../src/index.ts'

export default [
  {
    name: 'nothing is published',
    edits: [{ file: server, find: 'if (hub !== undefined) {', replace: 'if (false) {' }],
    tests,
  },
  {
    name: 'a deletion is not published',
    edits: [
      {
        file: server,
        find: 'Effect.andThen(Effect.forEach(outcome.deleted, gone => hub.deleted(gone))),',
        replace: '',
      },
    ],
    tests,
  },
  {
    name: 'a failed publish fails the mutation',
    edits: [
      {
        file: server,
        find: 'Effect.catchCause(cause => Diagnostics.report(publishFailed(payload.mutation, cause))),',
        replace:
          'Effect.tapCause(cause => Diagnostics.report(publishFailed(payload.mutation, cause))),',
      },
    ],
    tests,
  },
  {
    name: 'a failed publish is not reported',
    edits: [
      {
        file: server,
        find: 'Effect.catchCause(cause => Diagnostics.report(publishFailed(payload.mutation, cause))),',
        replace: 'Effect.catchCause(() => Effect.void),',
      },
    ],
    tests,
  },
  {
    name: 'a shared field is read again',
    edits: [{ file: server, find: 'source.shared.has(field) &&', replace: 'false &&' }],
    tests,
  },
  {
    name: 'every given value is sent as written',
    edits: [{ file: server, find: 'source.shared.has(field) &&', replace: '' }],
    tests,
  },
  {
    name: 'a paged shared field is sent as written',
    edits: [
      {
        file: server,
        find: 'given(field) && !selected.windows.has(field)',
        replace: 'given(field)',
      },
    ],
    tests,
  },
  {
    name: "a handler's claim is sent as stored",
    edits: [
      {
        file: server,
        find: 'const stored = source.writes !== undefined',
        replace: 'const stored = true',
      },
    ],
    tests,
  },
  {
    name: "a declared write's values are not given",
    edits: [
      {
        file: server,
        find: 'const stored = source.writes !== undefined',
        replace: 'const stored = false',
      },
    ],
    tests,
  },
  {
    name: 'a shared field naming no member is kept',
    edits: [
      {
        file: server,
        find: '      field => fields !== undefined && !fields.has(field),\n    )\n    if (unserved.length > 0) {',
        replace:
          '      field => fields !== undefined && !fields.has(field),\n    )\n    if (false) {',
      },
    ],
    tests,
  },
  {
    name: 'a memory backend keeps a shared field naming no member',
    edits: [
      {
        file: server,
        find: '      field => declared !== undefined && !Object.hasOwn(declared, field),\n    )\n    if (unserved.length > 0) {',
        replace:
          '      field => declared !== undefined && !Object.hasOwn(declared, field),\n    )\n    if (false) {',
      },
    ],
    tests: ['packages/remote-server/test/declared-fields.test.ts'],
  },
  {
    name: 'a row gone for one subscriber is kept for them',
    edits: [
      {
        file: server,
        find: '// Deleted, or no longer there to this principal: either way, gone.',
        replace: 'continue',
      },
    ],
    tests,
  },
  {
    name: "a deletion asks for none of a subscriber's fields",
    edits: [
      {
        file: server,
        find: 'deleted: ref => refresh(ref, Option.none(), undefined),',
        replace: 'deleted: ref => refresh(ref, Option.some([]), undefined),',
      },
    ],
    tests,
  },
  {
    name: "a group's failure is dropped",
    edits: [
      {
        file: server,
        find: 'if (failures.length > 0) return yield* Effect.fail(failures[0]!)',
        replace: '',
      },
    ],
    tests,
  },
]
