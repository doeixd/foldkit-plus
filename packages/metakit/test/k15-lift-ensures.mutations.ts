const tests = ['packages/metakit/test/k15-lift-ensures.test.ts']

export default [
  {
    name: 'Transition.lift drops ensures instead of carrying it',
    edits: [
      {
        file: '../src/transitionLift.ts',
        find: `    ensures: Option.map(transition.ensures, post =>
      wrap<TransitionPostEnv<Outer, Input, Supplied>, boolean | null>(movePost(post.node)),
    ),`,
        replace: '    ensures: Option.none(),',
      },
    ],
    tests,
  },
  {
    name: 'Transition.lift rewrites only state and forgets next in ensures',
    edits: [
      {
        file: '../src/transitionLift.ts',
        find: 'wrap<TransitionPostEnv<Outer, Input, Supplied>, boolean | null>(movePost(post.node)),',
        replace:
          'wrap<TransitionPostEnv<Outer, Input, Supplied>, boolean | null>(move(post.node)),',
      },
    ],
    tests,
  },
  {
    name: 'Transition.make omits ensures instead of setting Option.none()',
    edits: [
      {
        file: '../src/transition.ts',
        find: '    ensures: ensuresExpr,',
        replace: '    ...(Option.isSome(ensuresExpr) ? { ensures: ensuresExpr } : {}),',
      },
    ],
    tests,
  },
]
