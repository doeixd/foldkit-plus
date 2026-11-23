/**
 * Review of #610: a lifted opaque body runs once per step (#619), and a broken
 * walk stays visible whichever order it was recorded (#632).
 * `pnpm mutate packages/metakit/test/lift-and-evidence.mutations.ts`.
 */
const tests = [
  'packages/metakit/test/transition-opaque-lift.test.ts',
  'packages/metakit/test/temporal-evidence.test.ts',
]

export default [
  {
    name: 'a lifted opaque body receives a fresh environment per written value',
    edits: [
      {
        file: '../src/transitionLift.ts',
        find: `        run: env => {
          const outer = env as TransitionEnv<unknown, unknown, unknown>
          const innerState = Path.get(Path.make<unknown, unknown>(outerSegments), outer.state)
          // No child to run over: null, as a read of it is.
          return Option.match(innerState, {
            onNone: () => null,
            onSome: state => {
              if (state === null || state === undefined) return null
              const known = projected.get(outer)
              if (known !== undefined) return fn(known)
              const projectedEnv = { ...outer, state }
              projected.set(outer, projectedEnv)
              return fn(projectedEnv)
            },
          })
        },`,
        replace: `        run: env => {
          const outer = env as TransitionEnv<unknown, unknown, unknown>
          const innerState = Path.get(Path.make<unknown, unknown>(outerSegments), outer.state)
          return Option.match(innerState, {
            onNone: () => null,
            onSome: state =>
              state === null || state === undefined ? null : fn({ ...outer, state }),
          })
        },`,
      },
    ],
    tests,
  },
  {
    name: 'the report takes only the last walk',
    edits: [
      {
        file: '../src/temporal.ts',
        find: `      const failure = broke(walks)
      if (failure !== undefined) {
        open.push({ ...scope, obligation, why: describeResult(failure.result) })
        continue
      }
`,
        replace: '',
      },
    ],
    tests,
  },
  {
    name: 'undischarged counts any passing walk, whatever else broke',
    edits: [
      {
        file: '../src/temporal.ts',
        find: '      .filter(([, walks]) => broke(walks) === undefined && walks.some(closes))',
        replace: '      .filter(([, walks]) => walks.some(closes))',
      },
    ],
    tests,
  },
  {
    name: 'declaring an obligation does not clear the evidence',
    edits: [
      {
        file: '../src/temporal.ts',
        find: '        shown.delete(key)\n',
        replace: '',
      },
    ],
    tests,
  },
]
