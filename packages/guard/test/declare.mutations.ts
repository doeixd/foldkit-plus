/**
 * A guard set's declaration and decisions, broken in turn:
 * `pnpm mutate packages/guard/test/declare.mutations.ts`.
 */
const file = '../src/index.ts'
const tests = ['packages/guard/test/declare.test.ts']

export default [
  {
    // Object.assign sets each key, as `inputs[key] = …` did: `__proto__` becomes the prototype.
    name: 'a principal field named __proto__ is no placeholder of its own',
    edits: [
      {
        file,
        find: '    Object.fromEntries(\n      Object.entries(fields).map(',
        replace: '    Object.assign({}, Object.fromEntries(\n      Object.entries(fields).map(',
      },
      {
        file,
        find: '      ]),\n    ),\n  ) as Placeholders<User>',
        replace: '      ])),\n    ),\n  ) as Placeholders<User>',
      },
    ],
    tests,
  },
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
      { file, find: 'user => `user:${JSON.stringify(asJson(user))}`', replace: "() => 'visitor'" },
    ],
    tests,
  },
  {
    name: 'a principal is keyed by the declared key alone',
    edits: [
      {
        file,
        find: 'user => `user:${JSON.stringify(asJson(user))}`',
        replace: 'user => `user:${options.key(user)}`',
      },
    ],
    tests,
  },
  {
    name: 'a key is its claims as JSON alone keeps them',
    edits: [
      {
        file: '../src/index.ts',
        find: 'onSome: user => `user:${JSON.stringify(asJson(user))}`,',
        replace: 'onSome: user => `user:${JSON.stringify(inputOf(user))}`,',
      },
    ],
    tests: ['packages/guard/test/declare.test.ts'],
  },
  {
    name: 'unguarded is taken unchecked',
    edits: [
      {
        file,
        find: "if (options.unguarded !== 'allow' && options.unguarded !== 'deny')",
        replace: 'if (false)',
      },
    ],
    tests,
  },
]
