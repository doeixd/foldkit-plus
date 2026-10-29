/**
 * A list read live (#270), broken in turn, from the page's read to `pollLive`:
 * `pnpm mutate packages/remote-server/test/liveQuery.mutations.ts`.
 */
const server = '../src/index.ts'
const client = '../../remote/src/index.ts'
const requirement = '../../remote/src/requirement.ts'
const poll = '../../remote-drizzle/src/poll.ts'
const crud = '../../crud/src/index.ts'
const clientTests = ['packages/remote/test/liveQuery.test.ts']
const serverTests = ['packages/remote-server/test/liveQuery.test.ts']
const pollTests = ['packages/remote-drizzle/test/poll.test.ts']

export default [
  {
    name: 'a read marks no list live',
    edits: [
      {
        file: client,
        find: 'live === true ? { ...contract.requirement, live } : contract.requirement',
        replace: 'contract.requirement',
      },
    ],
    tests: clientTests,
  },
  {
    name: 'a list read live without first is taken',
    edits: [
      {
        file: client,
        find: 'if (live === true && window.first === undefined) {',
        replace: 'if (false) {',
      },
    ],
    tests: clientTests,
  },
  {
    name: 'the live entry subscribes no list',
    edits: [
      {
        file: client,
        find: 'connection.live === true ? [Result.getOrThrow(parsedQueryRequest(connection))] : []',
        replace: '[]',
      },
    ],
    tests: [...clientTests, ...serverTests],
  },
  {
    name: 'the live entry subscribes every list, live or not',
    edits: [
      {
        file: client,
        find: 'connection.live === true ? [Result.getOrThrow(parsedQueryRequest(connection))] : []',
        replace: '[Result.getOrThrow(parsedQueryRequest(connection))]',
      },
    ],
    tests: clientTests,
  },
  {
    name: 'a stream of lists alone opens nothing',
    edits: [
      {
        file: client,
        find: 'if (requirements.length === 0 && queries.length === 0) return Stream.empty',
        replace: 'if (requirements.length === 0) return Stream.empty',
      },
    ],
    tests: [...clientTests, ...serverTests],
  },
  {
    name: 'two lists share one stream key',
    edits: [
      { file: client, find: '    ...queries.map(query => stableStringify(query)),\n', replace: '' },
    ],
    tests: clientTests,
  },
  {
    name: 'liveStatus sees no list',
    edits: [
      {
        file: client,
        find: 'if (live.requirements.length === 0 && live.queries.length === 0) return',
        replace: 'if (live.requirements.length === 0) return',
      },
    ],
    tests: clientTests,
  },
  {
    name: 'the RPC client sends no list',
    edits: [{ file: client, find: '...(queries.length === 0 ? {} : { queries }),', replace: '' }],
    tests: serverTests,
  },
  {
    name: 'two reads of one list merge as the first',
    edits: [
      {
        file: requirement,
        find: 'const live = current.live === true || connection.live === true',
        replace: 'const live = current.live === true',
      },
    ],
    tests: clientTests,
  },
  {
    name: 'a crud list is never read live',
    edits: [
      {
        file: crud,
        find: '{ select: selection, first: pageSize, live }',
        replace: '{ select: selection, first: pageSize }',
      },
    ],
    tests: ['packages/crud/test/list.test.ts'],
  },
  {
    name: 'an unknown query is admitted',
    edits: [
      {
        file: server,
        find: 'if (source === undefined) return yield* refused(`Unknown query',
        replace: 'if (false) return yield* refused(`Unknown query',
      },
    ],
    tests: serverTests,
  },
  {
    name: 'a list with no select is admitted',
    edits: [
      {
        file: server,
        find: '      if (select === undefined) {\n',
        replace: '      if (false) {\n',
      },
    ],
    tests: serverTests,
  },
  {
    name: 'a list with no first is admitted',
    edits: [
      { file: server, find: '      if (first === undefined) {\n', replace: '      if (false) {\n' },
    ],
    tests: serverTests,
  },
  {
    name: 'an input that does not decode is admitted as given',
    edits: [
      {
        file: server,
        find: 'const input = yield* Schema.decodeUnknownEffect(source.Input)(request.input).pipe(',
        replace: 'const input = yield* Effect.succeed(request.input).pipe(',
      },
    ],
    tests: serverTests,
  },
  {
    name: 'a list’s first is not counted with the ids',
    edits: [
      {
        file: server,
        find: 'if ((ids.get(entity)?.size ?? 0) + listed > maxIds) {',
        replace: 'if (listed > maxIds) {',
      },
    ],
    tests: serverTests,
  },
  {
    name: 'a list is named by its query alone',
    edits: [
      {
        file: server,
        find: 'identity: queryIdentity(request.query, request.input),',
        replace: 'identity: request.query,',
      },
    ],
    tests: serverTests,
  },
  {
    name: 'a list is run with no window',
    edits: [
      {
        file: server,
        find: 'source.run({ input, window: request.window, principal: caller, viewer, select })',
        replace: 'source.run({ input, window: {}, principal: caller, viewer, select })',
      },
    ],
    tests: serverTests,
  },
  {
    name: 'a list of an entity no row is subscribed to reaches no live source',
    edits: [
      {
        file: server,
        find: '                ...queries.map(query => query.select.entity),\n',
        replace: '',
      },
    ],
    tests: serverTests,
  },
  {
    name: 'every live source is handed every list',
    edits: [
      {
        file: server,
        find: 'queries: queries.filter(query => query.select.entity === entity),',
        replace: 'queries,',
      },
    ],
    tests: serverTests,
  },
  {
    name: 'pollLive opens nothing for lists alone',
    edits: [
      {
        file: poll,
        find: 'if (wanted.size === 0 && watched.length === 0) return Stream.never',
        replace: 'if (wanted.size === 0) return Stream.never',
      },
    ],
    tests: pollTests,
  },
  {
    name: 'pollLive reads a paged relation of a listed row',
    edits: [
      {
        file: poll,
        find: 'select.fields.filter(field => !Object.hasOwn(select.windows ?? {}, field))',
        replace: 'select.fields',
      },
    ],
    tests: pollTests,
  },
  {
    name: 'pollLive never invalidates a list',
    edits: [
      {
        file: poll,
        find: '          if (listing.invalidated) return []',
        replace: '          return []',
      },
    ],
    tests: pollTests,
  },
  {
    name: 'a select of another entity than its query lists is admitted',
    edits: [
      { file: server, find: 'if (select.entity !== source.entity) {', replace: 'if (false) {' },
    ],
    tests: serverTests,
  },
  {
    name: 'RemoteServer.query names no entity',
    edits: [{ file: server, find: 'entity: query.Result.entity,', replace: "entity: ''," }],
    tests: serverTests,
  },
  {
    name: 'a Drizzle query names no entity',
    edits: [
      {
        file: '../../remote-drizzle/src/index.ts',
        find: 'entity: options.entity.name,',
        replace: "entity: '',",
      },
    ],
    tests: ['packages/remote-drizzle/test/query.test.ts'],
  },
  {
    name: 'a Drizzle query takes a table of another entity',
    edits: [
      {
        file: '../../remote-drizzle/src/index.ts',
        find: 'if (descriptor.Result.entity !== options.entity.name) {',
        replace: 'if (false) {',
      },
    ],
    tests: ['packages/remote-drizzle/test/query.test.ts'],
  },
  {
    name: 'two live sources keep the numbers each gave its changes',
    edits: [
      {
        file: server,
        find: '(cursor, change) => [cursor + 1, [{ ...change, cursor: cursor + 1 }]] as const,',
        replace: '(cursor, change) => [cursor + 1, [change]] as const,',
      },
    ],
    tests: serverTests,
  },
]
