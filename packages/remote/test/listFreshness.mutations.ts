/**
 * Lists that age under staleWhileRevalidate (#234), broken in turn:
 * `pnpm mutate packages/remote/test/listFreshness.mutations.ts`
 */
const tests = [
  'packages/remote/test/listFreshness.test.ts',
  'packages/remote/test/resume.test.ts',
  'packages/remote/test/freshness.test.ts',
]
const edit = (name: string, file: string, find: string, replace: string) => ({
  name,
  edits: [{ file, find, replace }],
  tests,
})
const index = '../src/index.ts'
const model = '../src/model.ts'
const resume = '../src/resume.ts'

export default [
  edit(
    'a list never ages',
    index,
    'const aged = freshness !== undefined && expires !== undefined && freshness.now > expires',
    'const aged = false',
  ),
  edit(
    'a list ages at the very moment its window ends',
    index,
    'freshness.now > expires',
    'freshness.now >= expires',
  ),
  edit(
    'a list asked for again is not named as refreshing',
    index,
    '      if (known !== undefined && known.segments.length > 0) refreshing.push(connection.identity)\n',
    '',
  ),
  edit(
    'no clock waits on a list',
    index,
    'listsExpire = earlier(listsExpire, {',
    'void earlier(listsExpire, {',
  ),
  edit(
    'a failed list sets a clock',
    index,
    'if (!failed && expires !== undefined && Number.isFinite(expires))',
    'if (expires !== undefined && Number.isFinite(expires))',
  ),
  edit(
    'the later deadline is waited on',
    index,
    'return a.at < b.at ? a : b',
    'return a.at < b.at ? b : a',
  ),
  edit(
    'deadlines that fall together keep only the rows',
    index,
    'connections: [...a.connections, ...b.connections],',
    'connections: a.connections,',
  ),
  edit(
    'the entry does not announce a list it asks for again',
    index,
    '(requirements.length > 0 || refreshing.length > 0)',
    'requirements.length > 0',
  ),
  edit(
    'the clock does not name the lists that aged',
    index,
    'toMessage(refreshStarted(expires.due, expires.connections))',
    'toMessage(refreshStarted(expires.due, []))',
  ),
  edit(
    'RefreshStarted marks no list',
    model,
    'const connections = (message.connections ?? []).reduce(',
    'const connections = ([] as ReadonlyArray<string>).reduce(',
  ),
  edit(
    'RefreshStarted marks a list the Model does not hold',
    model,
    '(held[identity]?.segments.length ?? 0) === 0',
    'false',
  ),
  edit(
    'a later page dates the list',
    model,
    'message.now !== undefined && (replaces || current.segments.length === 0)',
    'message.now !== undefined',
  ),
  edit(
    'no page dates the list',
    model,
    '          ? message.now\n          : current.receivedAt',
    '          ? current.receivedAt\n          : current.receivedAt',
  ),
  edit('a list left is held stale whatever its readers', model, ' || ages === true', ''),
  edit(
    'a list read without ageing ages anyway',
    index,
    'root.select === undefined || unaged.has(root.identity)',
    'root.select === undefined',
  ),
  edit(
    'the last call alone says whether a reader ages',
    index,
    "(ageing.get(entry) ?? true) && options.policy?._tag === 'StaleWhileRevalidate'",
    "options.policy?._tag === 'StaleWhileRevalidate'",
  ),
  edit(
    'a resumed list loses its age',
    resume,
    'receivedAt: connection.receivedAt ?? 0,',
    'receivedAt: 0,',
  ),
]
