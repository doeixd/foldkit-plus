/**
 * Public reads kept at the edge, each guard broken in turn:
 * `pnpm mutate packages/remote-server/test/edgeCache.mutations.ts`
 */
const tests = ['packages/remote-server/test/edgeCache.test.ts']
const policy = '../src/edgeCache.ts'
const fetch = '../src/fetch.ts'
const server = '../src/index.ts'
const declared = '../../surface/src/edgeCache.ts'
const edit = (name: string, file: string, find: string, replace: string) => ({
  name,
  edits: [{ file, find, replace }],
  tests,
})

export default [
  // What makes a read public.
  edit('an authorize is ignored', policy, 'source.authorize !== undefined ||', ''),
  edit('a filter is ignored', policy, 'source.filter !== undefined ||', ''),
  edit('a visible rule is ignored', policy, '  source.visible !== undefined ||\n', ''),
  edit('a member per viewer is ignored', policy, '(source.perViewer ?? []).length > 0', 'false'),
  {
    name: 'a source with no freshness is kept',
    edits: [
      {
        file: policy,
        find: ': Option.fromUndefinedOr(source.cache)',
        replace: ': Option.some(source.cache ?? { maxAge: Duration.seconds(60) })',
      },
      {
        file: policy,
        find: "import { Effect, Option, Schema } from 'effect'",
        replace: "import { Duration, Effect, Option, Schema } from 'effect'",
      },
    ],
    tests,
  },
  edit(
    'a relation is not followed',
    policy,
    '(policy, relation) => both(policy, slicePolicy(server, relation)),',
    'policy => policy,',
  ),
  edit(
    "a query's visible rule is ignored",
    policy,
    'source === undefined || source.visible !== undefined',
    'source === undefined',
  ),
  edit(
    "a query's rows are not judged",
    policy,
    'sourcePolicy(server.entities.get(source.entity)),',
    'Option.fromUndefinedOr(source.cache),',
  ),
  edit(
    "a query's selection is not judged",
    policy,
    'request.select === undefined ? own : both(own, slicePolicy(server, request.select))',
    'own',
  ),
  edit(
    'the longer freshness is kept',
    declared,
    'Duration.isLessThan(b.maxAge, a.maxAge) ? b : a',
    'Duration.isLessThan(b.maxAge, a.maxAge) ? a : b',
  ),
  edit(
    'an Entity declaration is dropped',
    server,
    '...(Option.isSome(cache) ? { cache: cache.value } : {}),',
    '',
  ),
  edit(
    "a memory backend's declarations are dropped",
    server,
    'Option.fromUndefinedOr(config.domain.registry.cached.get(name))',
    'Option.none()',
  ),
  edit(
    "a query's declaration is dropped",
    server,
    '...(query.cache === undefined ? {} : { cache: query.cache }),',
    '',
  ),
  // What a kept answer holds and is tagged with.
  edit('a row asked for and not found is untagged', policy, '...rowTags(batch.requests), ', ''),
  edit(
    "a query is not tagged with its entity's lists",
    policy,
    'listTag(source.entity),',
    "'none',",
  ),
  edit(
    'a write purges no row',
    policy,
    '...new Set([...rowTags(rows), ...rows',
    '...new Set([...rows',
  ),
  edit('a write purges no list', policy, ', ...rows.map(row => listTag(row.entity))', ''),
  // How serveFetch serves one.
  edit(
    'a public read is answered as who asks',
    fetch,
    'const answered = yield* RemoteServer.answer(visitor, body)',
    'const answered = yield* RemoteServer.answer(own, body)',
  ),
  edit('a failure is kept', fetch, 'if (answered.status !== 200) {', 'if (false) {'),
  edit('the asker is never checked', fetch, 'if (cache.check === true) {', 'if (false) {'),
  edit(
    'a difference passes the check',
    fetch,
    'stableStringify(unaddressedAnswer(mine.body)) !== stableStringify(JSON.parse(text))',
    'false',
  ),
  edit('a kept answer names whom it was for', fetch, '  return { result }\n', '  return answer\n'),
  edit(
    'a public answer says private',
    fetch,
    "'cache-control': `public, max-age=${maxAgeSeconds(shareable.policy)}`,",
    '',
  ),
  edit(
    'a write purges nothing',
    fetch,
    'if (cache !== undefined && answered.status === 200 && isWrite(body.success)) {',
    'if (false) {',
  ),
  edit(
    'a read is taken for a write',
    fetch,
    "request.operation === 'mutate'",
    "request.operation === 'read'",
  ),
  edit(
    'someone is taken as the visitor',
    fetch,
    'Option.isSome(server.viewer(cache.visitor))',
    'false',
  ),
  edit('the checker takes checking nothing', fetch, 'if (store.size() === 0) {', 'if (false) {'),
  // How pageReader notes one.
  edit(
    'pageReader answers no read as the visitor',
    fetch,
    'RemoteServer.handlers(config.server, principal, limits),\n          visitor,',
    'RemoteServer.handlers(config.server, principal, limits),\n          Option.none(),',
  ),
  edit(
    'a public page read is noted private',
    policy,
    'note(CachedRead.Public({ policy, tags: readTags(batch, result) })),',
    'unshared,',
  ),
  edit(
    'a public page read names whom it was for',
    policy,
    'unaddressed(result),\n              ),\n            ).pipe(Effect.onError(() => unshared)),\n        },\n      )\n    },\n    FoldkitRemoteQuery',
    'result,\n              ),\n            ).pipe(Effect.onError(() => unshared)),\n        },\n      )\n    },\n    FoldkitRemoteQuery',
  ),
  edit(
    'a private page read is not noted',
    policy,
    'Effect.ensuring(own.FoldkitRemoteRead(batch), unshared)',
    'own.FoldkitRemoteRead(batch)',
  ),
  edit(
    'a failed public page read is not noted',
    policy,
    ').pipe(Effect.onError(() => unshared)),\n        },\n      )\n    },\n    FoldkitRemoteQuery',
    '),\n        },\n      )\n    },\n    FoldkitRemoteQuery',
  ),
  edit('a private read names every row it asked for', policy, 'rows.slice(0, NAMED_ROWS)', 'rows'),
  edit('a private read hides how many more it asked for', policy, 'more > 0 ?', 'false ?'),
  edit('a private query is named as nothing', policy, 'read: `query ${request.query}`', "read: ''"),
]
