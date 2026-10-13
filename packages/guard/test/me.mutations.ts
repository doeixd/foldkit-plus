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
        find: '      filter: GuardServer.filter(entity, policy),\n    }),',
        replace: '    }),',
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
]
