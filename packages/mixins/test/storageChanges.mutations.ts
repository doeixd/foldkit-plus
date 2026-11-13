/**
 * Another tab's choice, heard: `pnpm mutate packages/mixins/test/storageChanges.mutations.ts`.
 */
const tests = ['packages/mixins/test/storageChanges.test.ts']
const storage = '../src/theme/storageChanges.ts'
const scheme = '../src/theme/scheme.ts'

export default [
  {
    name: 'another key is heard',
    edits: [{ file: storage, find: 'event.key !== null && event.key !== key', replace: 'false' }],
    tests,
  },
  {
    name: 'a cleared storage is not heard',
    edits: [
      {
        file: storage,
        find: 'event.key !== null && event.key !== key',
        replace: 'event.key !== key',
      },
    ],
    tests,
  },
  {
    name: 'session storage is heard',
    edits: [
      {
        file: storage,
        find: 'if (event.storageArea !== window.localStorage) return',
        replace: 'void window.localStorage',
      },
    ],
    tests,
  },
  {
    name: 'the listener outlives the stream',
    edits: [
      {
        file: storage,
        find: "window.removeEventListener('storage', listener)",
        replace: 'void listener',
      },
    ],
    tests,
  },
  {
    name: 'a name no theme has is passed on',
    edits: [
      {
        file: '../src/theme/themes.ts',
        find: 'themes.names.find(name => name === value) ?? themes.initial',
        replace: '(value as typeof themes.initial | null) ?? themes.initial',
      },
    ],
    tests,
  },
  {
    name: 'a scheme is passed on whatever it is',
    edits: [
      { file: scheme, find: "stored(value) ? value : 'system'", replace: "value ?? 'system'" },
    ],
    tests,
  },
  {
    name: 'the quoted hint is not read',
    edits: [{ file: scheme, find: 'replace(/^"(.*)"$/, \'$1\')', replace: 'trim()' }],
    tests,
  },
  {
    name: 'a hint is read whatever it says',
    edits: [
      {
        file: scheme,
        find: 'return stored(value) ? Option.some(value) : Option.none()',
        replace: 'return Option.fromNullishOr(value as never)',
      },
    ],
    tests,
  },
  {
    name: 'a hint with spaces round it is refused',
    edits: [{ file: scheme, find: 'header?.trim().replace', replace: 'header?.replace' }],
    tests,
  },
  {
    name: 'the hint headers drop Critical-CH',
    edits: [
      { file: scheme, find: "  'Critical-CH': 'Sec-CH-Prefers-Color-Scheme',\n", replace: '' },
    ],
    tests,
  },
]
