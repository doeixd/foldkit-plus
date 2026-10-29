/**
 * A key named like an `Object.prototype` member is given only what the
 * application gave it: `pnpm mutate packages/form/test/protoKey.mutations.ts`.
 */
const tests = ['packages/form/test/protoKey.test.ts']
const file = '../src/index.ts'

export default [
  {
    name: "a key's control is read through the prototype",
    edits: [{ file, find: 'own(overrides, key)', replace: 'overrides[key]' }],
    tests,
  },
  {
    name: "a Bundle-backed key's check is looked for through the prototype",
    edits: [
      {
        file,
        find: 'Object.hasOwn(options.checks, key)',
        replace: 'key in options.checks',
      },
    ],
    tests,
  },
  {
    name: "a nested key's form is read through the prototype",
    edits: [{ file, find: 'own(givenForms, key)', replace: 'givenForms[key]' }],
    tests,
  },
  {
    name: "a key's check is read through the prototype",
    edits: [{ file, find: 'own(checks, key)', replace: 'checks[key]' }],
    tests,
  },
  {
    name: "a follower's fill looks for its value through the prototype",
    edits: [
      {
        file,
        find: 'Object.hasOwn(given, key)\n              ? isEmpty',
        replace: 'key in given\n              ? isEmpty',
      },
    ],
    tests,
  },
  {
    name: "a draft's fill looks for its value through the prototype",
    edits: [
      {
        file,
        find: 'Object.hasOwn(given, plan.key)',
        replace: 'plan.key in given',
      },
    ],
    tests,
  },
  {
    name: "a nested key's fill looks for its rows through the prototype",
    edits: [
      {
        file,
        find: 'if (!Object.hasOwn(given, key)) return next',
        replace: 'if (!(key in given)) return next',
      },
    ],
    tests,
  },
]
