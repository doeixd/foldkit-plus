/**
 * What a guarded server reports instead of saying, each report broken in turn:
 * `pnpm mutate packages/guard/test/diagnostics.mutations.ts`.
 */
const server = '../src/server.ts'
const diagnostics = '../src/diagnostics.ts'
const compute = ['packages/guard/test/compute.test.ts']
const pinned = ['packages/guard/test/pinned.test.ts']

export default [
  {
    name: "an operator's refusal is not reported",
    edits: [
      {
        file: server,
        find: 'return Diagnostics.report(computeRefused(entity.name, error)).pipe(',
        replace: 'return Effect.void.pipe(',
      },
    ],
    tests: compute,
  },
  {
    name: "an operator's refusal is reported as a warning",
    edits: [
      {
        file: diagnostics,
        find: "  level: 'error',\n  message: `${entity}'s write was refused",
        replace: "  level: 'warning',\n  message: `${entity}'s write was refused",
      },
    ],
    tests: compute,
  },
  {
    name: 'an unpinned write is not reported',
    edits: [{ file: server, find: '    if (unpinned.length > 0) {', replace: '    if (false) {' }],
    tests: pinned,
  },
  {
    name: "validate ignores the host's reporter",
    edits: [
      {
        file: server,
        find: '        diagnostics === undefined\n',
        replace: '        true\n',
      },
    ],
    tests: pinned,
  },
  {
    name: 'an unpinned write is reported as an error',
    edits: [
      {
        file: diagnostics,
        find: "  level: 'warning',\n  message: `GuardServer.validate:",
        replace: "  level: 'error',\n  message: `GuardServer.validate:",
      },
    ],
    tests: pinned,
  },
]
