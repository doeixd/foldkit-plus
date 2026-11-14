/**
 * `policies` on `Data.wiring` (#236), broken in turn:
 * `pnpm mutate packages/remote/test/policies.mutations.ts`
 */
const tests = ['packages/remote/test/policies.test.ts']
const edit = (name: string, find: string, replace: string) => ({
  name,
  edits: [{ file: '../src/remote.ts', find, replace }],
  tests,
})

export default [
  edit(
    'the wiring reads every entry under policy',
    '(Object.hasOwn(byKey, key) ? byKey[key] : undefined) ?? options.policy',
    'options.policy',
  ),
  edit(
    'an entry policies names ignores policy where it says none',
    '(Object.hasOwn(byKey, key) ? byKey[key] : undefined) ?? options.policy',
    'Object.hasOwn(byKey, key) ? byKey[key] : options.policy',
  ),
  edit(
    'a key the prototype holds reads what the prototype answers',
    'Object.hasOwn(byKey, key) ? byKey[key] : undefined',
    'byKey[key]',
  ),
  edit(
    "a read entry plans under the call's policy, not its key's",
    '      entries[`${key}.read`] = observeEntry(bound, asked, identityMessage, {\n        ...options,\n        policy,\n      })',
    '      entries[`${key}.read`] = observeEntry(bound, asked, identityMessage, options)',
  ),
  edit(
    "retention judges a list by the call's policy, not its key's",
    '      policies.set(entry, new Map(policies.get(entry)).set(key, policy))',
    '      policies.set(entry, new Map(policies.get(entry)).set(key, options.policy))',
  ),
  edit(
    'a list one entry ages and one does not keeps its age',
    '    [...policies.get(entry)!.values()].every(policy => policyAt(policy, model)._tag === tag)',
    '    [...policies.get(entry)!.values()].some(policy => policyAt(policy, model)._tag === tag)',
  ),
  edit(
    'a key the active record lacks is let through',
    '        if (!Object.hasOwn(active, key))',
    '        if (false)',
  ),
]
