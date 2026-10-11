/**
 * A guard set's declaration and decisions, broken in turn:
 * `pnpm mutate packages/guard/test/declare.mutations.ts`.
 */
const file = '../src/index.ts'
const tests = ['packages/guard/test/declare.test.ts']

export default [
  {
    name: 'a guard of another set is decided anyway',
    edits: [{ file, find: 'if (guard.set !== name) {', replace: 'if (false) {' }],
    tests,
  },
  {
    name: 'a principal guard may go without a body',
    edits: [
      {
        file,
        find: 'const missing = principalNames.filter(guard => !Object.hasOwn(bodies, guard))',
        replace: 'const missing: Array<string> = []',
      },
    ],
    tests,
  },
  {
    name: 'a body may name no principal guard',
    edits: [
      {
        file,
        find: 'const extra = Object.keys(bodies).filter(guard => !principalNames.includes(guard))',
        replace: 'const extra: Array<string> = []',
      },
    ],
    tests,
  },
  {
    name: 'a guard may take a name the set keeps',
    edits: [
      {
        file,
        find: 'if ((reserved as ReadonlyArray<string>).includes(guard)) {',
        replace: 'if (false) {',
      },
    ],
    tests,
  },
  {
    name: 'a placeholder is named apart from the input that binds it',
    edits: [{ file, find: '`principal.${key}`,', replace: '`principal:${key}`,' }],
    tests,
  },
  {
    name: 'a row guard is decided without a row',
    edits: [
      {
        file,
        find: 'row !== undefined &&',
        replace: '',
      },
    ],
    tests,
  },
  {
    name: 'a user may be keyed as the visitor is',
    edits: [
      { file, find: 'user => `user:${JSON.stringify(inputOf(user))}`', replace: "() => 'visitor'" },
    ],
    tests,
  },
  {
    name: 'a principal is keyed by the declared key alone',
    edits: [
      {
        file,
        find: 'user => `user:${JSON.stringify(inputOf(user))}`',
        replace: 'user => `user:${options.key(user)}`',
      },
    ],
    tests,
  },
]
