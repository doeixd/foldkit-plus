/**
 * Mutations for writing under a null or absent parent in `Transition.run` (#652).
 * `pnpm mutate packages/metakit/test/write-under-null.mutations.ts`.
 */
const tests = ['packages/metakit/test/write-under-null.test.ts']

export default [
  {
    name: 'null/absent parent check removed',
    edits: [
      {
        file: '../src/transition.ts',
        find: '  if (missing !== -1) {',
        replace: '  if (false) {',
      },
    ],
    tests,
  },
  {
    name: 'checks only the immediate parent instead of every proper prefix',
    edits: [
      {
        file: '../src/transition.ts',
        find: `  const missing = target.slice(0, -1).findIndex((_, index) => {
    const held = Path.get(Path.make<State, unknown>(target.slice(0, index + 1)), state)
    return Option.isNone(held) || held.value === null || held.value === undefined
  })`,
        replace: `  const missing =
    target.length > 1
      ? (() => {
          const held = Path.get(Path.make<State, unknown>(target.slice(0, -1)), state)
          return Option.isNone(held) || held.value === null || held.value === undefined
            ? target.length - 2
            : -1
        })()
      : -1`,
      },
    ],
    tests,
  },
  {
    name: 'skips null parents while keeping absent-key refusal',
    edits: [
      {
        file: '../src/transition.ts',
        find: 'return Option.isNone(held) || held.value === null || held.value === undefined',
        replace: 'return Option.isNone(held) || held.value === undefined',
      },
    ],
    tests,
  },
  {
    name: 'skips absent keys while keeping null-parent refusal',
    edits: [
      {
        file: '../src/transition.ts',
        find: 'return Option.isNone(held) || held.value === null || held.value === undefined',
        replace: 'return Option.isSome(held) && (held.value === null || held.value === undefined)',
      },
    ],
    tests,
  },
  {
    name: 'skips undefined parents while keeping null and absent refusal',
    edits: [
      {
        file: '../src/transition.ts',
        find: 'return Option.isNone(held) || held.value === null || held.value === undefined',
        replace: 'return Option.isNone(held) || held.value === null',
      },
    ],
    tests,
  },
]
