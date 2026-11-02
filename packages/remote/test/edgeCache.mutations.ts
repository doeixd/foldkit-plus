/**
 * Cache declarations, each guard broken in turn:
 * `pnpm mutate packages/remote/test/edgeCache.mutations.ts`
 */
const tests = ['packages/remote/test/edgeCache.test.ts']
const policy = '../../surface/src/edgeCache.ts'
const declared = '../src/edgeCache.ts'
const query = '../src/query.ts'
const edit = (name: string, file: string, find: string, replace: string) => ({
  name,
  edits: [{ file, find, replace }],
  tests,
})

export default [
  edit('an endless freshness is taken', policy, '!Duration.isFinite(maxAge) ||', ''),
  edit(
    'a freshness under a second is taken',
    policy,
    '!Duration.isGreaterThanOrEqualTo(maxAge, Duration.seconds(1))',
    'false',
  ),
  edit(
    'two declarations keep the longer',
    declared,
    'Duration.isLessThan(policy.maxAge, shortest.maxAge) ? policy : shortest',
    'shortest',
  ),
  edit(
    'a Query drops its declaration',
    query,
    '...(config.cache === undefined ? {} : { cache: cachePolicy(config.cache) }),',
    '',
  ),
  edit(
    'a defined Query drops its declaration',
    query,
    '...(options?.cache === undefined ? {} : { cache: options.cache }),',
    '',
  ),
]
