/**
 * An answer asked for before `Data.forget` writes nothing (#484), each step
 * broken in turn: `pnpm mutate packages/remote/test/forgetAnswers.mutations.ts`.
 */
const tests = [
  'packages/remote/test/forget.test.ts',
  'packages/remote/test/overlappingReads.test.ts',
  'packages/remote/test/domain.test.ts',
  'packages/remote/test/liveStream.test.ts',
  'packages/remote/test/satisfy.test.ts',
]
const model = '../src/model.ts'
const domain = '../src/domain.ts'
const liveReads = '../src/liveReads.ts'
const remote = '../src/remote.ts'
const guard = 'if (askedBeforeForget(model, message.generation)) return model\n'
const edit = (name: string, file: string, find: string, replace: string) => ({
  name,
  edits: [{ file, find, replace }],
  tests,
})
/** Deletes the guard in front of `next`, the line that tells the cases apart. */
const unguarded = (variant: string, next: string) =>
  edit(
    `a ${variant} asked before forget is applied`,
    model,
    `${guard}      ${next}`,
    `      ${next}`,
  )

export default [
  edit(
    'no answer is from before forget',
    model,
    'generation !== undefined && generation < model.refresh.floor',
    'false',
  ),
  unguarded('read answer', 'const { held, confirmed } = readAfter('),
  unguarded('read failure', '// A broken live stream is not a failed read.'),
  unguarded('live event', 'const state = model.live[message.stream] ?? emptyLiveState'),
  unguarded('page', 'const current = model.connections[message.connection] ?? emptyConnection'),
  unguarded('query failure', '// The pages stay as they were'),
  edit(
    'a failed read names no generation',
    domain,
    "error: remoteError(result.failure),\n          generation,\n        }\n      : {\n          _tag: 'ReadReceived'",
    "error: remoteError(result.failure),\n        }\n      : {\n          _tag: 'ReadReceived'",
  ),
  edit(
    'a failed query names no generation',
    domain,
    'connection: query.identity,\n          error: remoteError(result.failure),\n          generation,',
    'connection: query.identity,\n          error: remoteError(result.failure),',
  ),
  edit(
    'a page names its generation only with a principal',
    domain,
    '    ...(result.principal === undefined ? {} : { principal: madeAsOf(result.principal) }),\n    ...(generation === undefined ? {} : { generation }),',
    '    ...(result.principal === undefined\n      ? {}\n      : { principal: madeAsOf(result.principal), ...(generation === undefined ? {} : { generation }) }),',
  ),
  edit(
    'a live event names the first floor',
    liveReads,
    'now: (options.now ?? wallClock)(),\n        generation: floor,',
    'now: (options.now ?? wallClock)(),\n        generation: 0,',
  ),
  edit(
    'a broken stream names no generation',
    liveReads,
    'stream: key,\n            generation: floor,',
    'stream: key,',
  ),
  edit(
    'a preloaded read names no generation',
    remote,
    'now: at,\n        generation,\n      })',
    'now: at,\n      })',
  ),
  edit(
    'a preloaded page names no generation',
    remote,
    'query.select, now(), generation),',
    'query.select, now()),',
  ),
]
