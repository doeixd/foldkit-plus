/**
 * `RemotePolicy.cacheOnly`, and a policy picked from the Model (#402), broken
 * in turn: `pnpm mutate packages/remote/test/cacheOnly.mutations.ts`
 */
const tests = [
  'packages/remote/test/cacheOnly.test.ts',
  'packages/remote/test/policy.test.ts',
  'packages/remote/test/why.test.ts',
  'packages/remote/test/noOp.test.ts',
  'packages/remote/test/overlappingReads.test.ts',
]
const edit = (name: string, file: string, find: string, replace: string) => ({
  name,
  edits: [{ file, find, replace }],
  tests,
})
const domain = '../src/domain.ts'
const remote = '../src/remote.ts'

export default [
  edit(
    'cacheOnly plans as cacheFirst',
    '../src/policy.ts',
    'return { unasked: true }',
    'return {}',
  ),
  edit(
    "the store's plan asks under cacheOnly",
    '../src/plan.ts',
    '  if (options.unasked === true) return []\n',
    '',
  ),
  edit(
    "a read entry's plan asks under cacheOnly",
    domain,
    '  if (options.unasked === true)\n',
    '  if (false)\n',
  ),
  edit(
    'a policy picked from the Model is not asked',
    domain,
    "    : typeof option === 'function'\n      ? option(model)\n      : option",
    "    : typeof option === 'function'\n      ? RemotePolicy.cacheFirst\n      : option",
  ),
  edit(
    'a plan made under one policy is kept under another',
    domain,
    'stableStringify([policy, asked])',
    'stableStringify(asked)',
  ),
  edit(
    'a prefetch ignores the policy the Model picks',
    remote,
    'RemotePolicy.toPlan(policyAt(options.policy, model), at),',
    'RemotePolicy.toPlan(RemotePolicy.cacheFirst, at),',
  ),
  edit(
    "the domain's prefetch ignores the policy the Model picks",
    remote,
    'RemotePolicy.toPlan(policyAt(options.policy, model), now())',
    'RemotePolicy.toPlan(RemotePolicy.cacheFirst, now())',
  ),
  edit(
    'a call keeps only the last policy of an entry',
    remote,
    'policies.set(entry, new Map(policies.get(entry)).set(key, options.policy))',
    'policies.set(entry, new Map([[key, options.policy]]))',
  ),
  edit(
    'a reader wired again keeps the policy it had',
    remote,
    'policies.set(entry, new Map(policies.get(entry)).set(key, options.policy))',
    'policies.set(entry, new Map(policies.get(entry)).set(`${key}${Math.random()}`, options.policy))',
  ),
  edit('an entry no call names reads under any policy', remote, '    policies.has(entry) &&\n', ''),
  edit(
    'one call under a policy is enough',
    remote,
    '[...policies.get(entry)!.values()].every(policy =>',
    '[...policies.get(entry)!.values()].some(policy =>',
  ),
  edit(
    'a list ages under whichever policy',
    remote,
    "if (!readsUnder(entry, model, 'StaleWhileRevalidate'))",
    "if (!readsUnder(entry, model, 'CacheOnly'))",
  ),
  edit(
    'why says unasked when one Surface reading it is',
    '../src/why.ts',
    'reading.every(({ entry }) => unasked(model, entry))',
    'reading.some(({ entry }) => unasked(model, entry))',
  ),
  edit(
    'why never says the policy left it unasked',
    '../src/why.ts',
    '? [Why.CacheOnly({ surfaces: reading.flatMap(read => read.names) })]',
    '? []',
  ),
  edit(
    'why says cacheOnly when no Surface reads it',
    '../src/why.ts',
    'reading.length > 0 && reading.every(',
    'reading.every(',
  ),
  edit(
    'why says a stale value under cacheOnly is being fetched again',
    '../src/why.ts',
    'reason => cacheOnly.length === 0 || !isStaleUnasked(reason),',
    'reason => true,',
  ),
  edit(
    'the policy decides no state',
    '../src/whyTerms.ts',
    "    CacheOnly: () => ['Initial', 'Refreshing'],",
    '    CacheOnly: () => [],',
  ),
  edit(
    'the policy decides no stale state',
    '../src/whyTerms.ts',
    "    CacheOnly: () => ['Initial', 'Refreshing'],",
    "    CacheOnly: () => ['Initial'],",
  ),
  edit(
    'an entry takes back nothing',
    domain,
    'abandoned: ownedMarks(remote, by).filter(mark => !asking.has(mark)),',
    'abandoned: [],',
  ),
  edit(
    'a restart sends no ReadAbandoned',
    domain,
    '          ...(abandoned.length === 0\n',
    '          ...(true\n',
  ),
  edit(
    'a read names no entry',
    domain,
    "{ _tag: 'ReadStarted', requests: requirements, refresh, by }",
    "{ _tag: 'ReadStarted', requests: requirements, refresh }",
  ),
  edit(
    'a query names no entry',
    domain,
    '                  connections: queries.map(query => query.identity),\n                  by,\n',
    '                  connections: queries.map(query => query.identity),\n',
  ),
  edit(
    'taking marks back restarts the entry again',
    domain,
    'Schema.Array(Schema.String).pipe(Schema.overrideToEquivalence(() => () => true))',
    'Schema.Array(Schema.String)',
  ),
  edit(
    "an entry takes back another entry's marks",
    '../src/model.ts',
    'const kept = new Set(message.marks.filter(mark => others.some(([, set]) => set.has(mark))))',
    'const kept = new Set<string>()',
  ),
  {
    name: 'an owner keeps the marks an answer cleared',
    edits: [
      {
        file: '../src/model.ts',
        find: 'const still = [...(before ?? [])].filter(mark => model.loading.has(mark))',
        replace: 'const still = [...(before ?? [])]',
      },
    ],
    tests,
    survives:
      "only bounds what loadingBy keeps: ownedMarks reads an owner's marks through loading, so a cleared one is never taken back either way",
  },
]
