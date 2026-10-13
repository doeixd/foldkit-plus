/**
 * `Me`, each part broken in turn: `pnpm mutate packages/guard/test/me.mutations.ts`.
 */
const file = '../src/server.ts'
const tests = ['packages/guard/test/me.test.ts']

export default [
  {
    name: 'any id is answered as Me',
    edits: [{ file, find: '.filter(id => id === ME)', replace: '' }],
    tests,
  },
  {
    name: 'everyone is signed in',
    edits: [{ file, find: 'signedIn: Option.isSome(principal),', replace: 'signedIn: true,' }],
    tests,
  },
  {
    name: 'the key is not the declared one',
    edits: [
      {
        file,
        find: 'onSome: policy.key,',
        replace: 'onSome: user => policy.keyOf(Option.some(user)),',
      },
    ],
    tests,
  },
  {
    name: 'may is not answered',
    edits: [
      {
        file,
        find: '        filter: GuardServer.filter(entity, policy),\n      }),',
        replace: '      }),',
      },
    ],
    tests,
  },
  {
    name: 'one token for every Policy',
    edits: [
      {
        file,
        find: "visible: rowRules.add(Object.freeze({ reads: 'the asker’s own row' }), policy, [entity]),",
        replace: 'visible: rowRules.add(GuardServer, policy, [entity]),',
      },
    ],
    tests,
  },
  {
    name: "Me's Read falls to the set's unguarded",
    edits: [
      {
        file: '../src/me.ts',
        find: 'row: { Read: [Attaching.anyone], Write: [] },',
        replace: 'row: { Write: [] },',
      },
    ],
    tests,
  },
  {
    name: 'Me may be written',
    edits: [
      {
        file: '../src/me.ts',
        find: 'row: { Read: [Attaching.anyone], Write: [] },',
        replace: 'row: { Read: [Attaching.anyone] },',
      },
    ],
    tests,
  },
  {
    name: 'anyone is printed as an empty conjunction',
    edits: [
      {
        file: '../src/attach.ts',
        find: "(rules.length === 0 ? 'anyone' : `all(${rules.map(showRule).join(', ')})`)",
        replace: "`all(${rules.map(showRule).join(', ')})`",
      },
    ],
    tests,
  },
  {
    name: 'anyone restricts a surface like any rule',
    edits: [
      {
        file: '../src/attach.ts',
        find: "rule._tag === 'All' && rule.rules.length === 0",
        replace: 'false',
      },
    ],
    tests: ['packages/guard/test/sync.test.ts', 'packages/guard/test/server.test.ts'],
  },
  {
    name: 'a surface naming anyone among its rules restricts',
    edits: [{ file: '../src/attach.ts', find: '!rules.some(isAnyone)', replace: 'true' }],
    tests: ['packages/guard/test/sync.test.ts', 'packages/guard/test/server.test.ts'],
  },
  {
    name: 'an always of anyone reads the row, for Sync',
    edits: [
      {
        file: '../src/sync.ts',
        find: "rule._tag !== 'PrincipalGuard' && !isAnyone(rule)",
        replace: "rule._tag !== 'PrincipalGuard'",
      },
    ],
    tests: ['packages/guard/test/sync.test.ts'],
  },
  {
    name: 'an always of anyone rules the rows',
    edits: [
      {
        file: '../src/attach.ts',
        find: 'attachment.always.some(rule => !isAnyone(rule))',
        replace: 'attachment.always.length > 0',
      },
    ],
    tests: ['packages/guard/test/server.test.ts'],
  },
  {
    name: "Me is served by another set's Policy",
    edits: [{ file, find: 'if (set !== policy.set) {', replace: 'if (false) {' }],
    tests,
  },
]
