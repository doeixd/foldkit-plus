/**
 * Review of #610: `Path.get` and `Path.set` read and write the logical value of
 * a schema-backed Option field (#630).
 * `pnpm mutate packages/metakit/test/path-option.mutations.ts`.
 */
const tests = ['packages/metakit/test/option-paths.test.ts']

export default [
  {
    name: 'a schema-backed path reads storage, an Option included',
    edits: [
      {
        file: '../src/path.ts',
        find: '  const logical = Option.isSome(path.ast)\n  let current: unknown = env\n',
        replace: '  const logical = false\n  let current: unknown = env\n',
      },
    ],
    tests,
  },
  {
    name: 'a write to an Option field stores the bare value',
    edits: [
      {
        file: '../src/path.ts',
        find: '  const stored =\n    logical && optionPath(path) ? (value === null ? Option.none() : Option.some(value)) : value',
        replace: '  const stored = value',
      },
    ],
    tests,
  },
  {
    name: 'a write inside an Option is accepted',
    edits: [
      {
        file: '../src/path.ts',
        find: '  if (logical && !optionPath(path)) {',
        replace: '  if (false) {',
      },
    ],
    tests,
  },
  {
    name: 'a write that changes nothing rebuilds the spine',
    edits: [
      {
        file: '../src/path.ts',
        find: `  const existing = get(path, env)
  if (Option.isSome(existing) && Object.is(existing.value, value)) {
    return env
  }
`,
        replace: '',
      },
    ],
    tests,
  },
]
