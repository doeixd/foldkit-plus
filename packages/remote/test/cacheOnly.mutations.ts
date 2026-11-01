/**
 * `RemotePolicy.cacheOnly`, and a policy picked from the Model (#402), broken
 * in turn: `pnpm mutate packages/remote/test/cacheOnly.mutations.ts`
 */
const tests = ['packages/remote/test/cacheOnly.test.ts', 'packages/remote/test/policy.test.ts']
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
    'policies.set(entry, [...(policies.get(entry) ?? []), options.policy])',
    'policies.set(entry, [options.policy])',
  ),
  edit('an entry no call names reads under any policy', remote, '    policies.has(entry) &&\n', ''),
  edit(
    'one call under a policy is enough',
    remote,
    'policies.get(entry)!.every(policy =>',
    'policies.get(entry)!.some(policy =>',
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
    '? Why.CacheOnly({ surfaces: names })',
    '? Why.NotFetching({ surfaces: names })',
  ),
  edit(
    'the policy decides no state',
    '../src/whyTerms.ts',
    "    CacheOnly: () => ['Initial'],",
    '    CacheOnly: () => [],',
  ),
]
