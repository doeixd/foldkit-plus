/**
 * A capability answers for its own ancestors, not the registry of the copy
 * asking: `pnpm mutate packages/mixins/test/capability.mutations.ts`.
 */
const tests = ['packages/mixins/test/capability.test.ts']

export default [
  {
    name: "a token's parents are read from the registry of the asking copy",
    edits: [
      {
        file: '../src/capability.ts',
        find: "const parentsOf = (value: CapabilityParent): ReadonlyArray<CapabilityParent> =>\n  (typeof value === 'string' ? undefined : (value as Partial<Any>).extends) ??\n  parentsByName.get(MetadataToken.nameOf(value)) ??\n  []",
        replace:
          'const parentsOf = (value: CapabilityParent): ReadonlyArray<CapabilityParent> =>\n  parentsByName.get(MetadataToken.nameOf(value)) ?? []',
      },
    ],
    tests,
  },
]
