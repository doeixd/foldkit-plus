/**
 * One admission for every live subscription, broken in turn:
 * `pnpm mutate packages/remote-server/test/liveLimits.mutations.ts`.
 */
const index = '../src/index.ts'
const fetch = '../src/fetch.ts'
const sse = '../../remote/src/sse.ts'
const tests = [
  'packages/remote-server/test/liveLimits.test.ts',
  'packages/remote-server/test/liveHub.test.ts',
  'packages/remote-drizzle/test/pollLimits.test.ts',
]

export default [
  {
    name: 'a live subscription is not admitted',
    edits: [
      { file: index, find: 'if (refusal !== undefined) return Stream.fail(refusal)', replace: '' },
    ],
    tests,
  },
  {
    name: 'live ignores the handler’s maxIdsPerEntity',
    edits: [
      {
        file: index,
        find: '          payload.requirements,\n          Math.max(1, options.maxIdsPerEntity ?? DEFAULT_MAX_IDS_PER_ENTITY),\n',
        replace: '          payload.requirements,\n          DEFAULT_MAX_IDS_PER_ENTITY,\n',
      },
    ],
    tests,
  },
  {
    name: 'the limit itself is refused',
    edits: [
      {
        file: index,
        find: 'if (seen.size > maxIds) return',
        replace: 'if (seen.size >= maxIds) return',
      },
    ],
    tests,
  },
  {
    name: 'a live subscription’s pages go unchecked',
    edits: [
      {
        file: index,
        find: '  const paged = checkPagesPerRelation(requirements)\n  if (paged !== undefined) {\n    return new RemoteLiveRefused(',
        replace:
          '  const paged = undefined as string | undefined\n  if (paged !== undefined) {\n    return new RemoteLiveRefused(',
      },
    ],
    tests,
  },
  {
    name: 'too many ids is a broken stream, not a refusal',
    edits: [
      {
        file: index,
        find: '    return new RemoteLiveRefused({\n      message: `Too many "${over}" ids',
        replace: '    return new RemoteLiveError({\n      message: `Too many "${over}" ids',
      },
    ],
    tests,
  },
  {
    name: 'serveFetch sends a refusal as a plain error frame',
    edits: [
      {
        file: fetch,
        find: 'errorFrame(error.message, { refused: true })',
        replace: 'errorFrame(error.message)',
      },
    ],
    tests,
  },
  {
    name: 'a fetch client reads a refused frame as a broken stream',
    edits: [{ file: sse, find: 'said.refused === true', replace: 'false' }],
    tests,
  },
]
