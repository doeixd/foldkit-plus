/**
 * The icon packs `/create` offers, broken in turn:
 * `pnpm mutate examples/site/test/packs.mutations.ts` checks that a test fails
 * for every one.
 */
const theme = '../src/gallery/theme.ts'
const tests = ['examples/site/test/theme.test.ts', 'examples/site/test/components.test.ts']

export default [
  {
    name: 'a preview keeps the shipped icons whatever the pack',
    edits: [{ file: theme, find: "pack === 'lucide' ? {} : packStyles[pack]", replace: '{}' }],
    tests,
  },
  {
    name: 'the code names no pack',
    edits: [
      {
        file: theme,
        find: "if (pack === 'lucide') return { imports: [], tokens: '' }",
        replace: "return { imports: [], tokens: '' }",
      },
    ],
    tests,
  },
  {
    name: 'a key that cannot stand bare is written bare',
    edits: [
      {
        file: theme,
        find: String.raw`/^[A-Za-z_$][\w$]*$/.test(name) ? name : ` + "`'${name}'`",
        replace: 'name',
      },
    ],
    tests,
  },
  {
    name: 'any text is taken as a pack',
    edits: [
      {
        file: '../src/main.ts',
        find: 'Option.match(decodePack(value), {',
        replace: 'Option.match(Option.some(value as never), {',
      },
    ],
    tests,
  },
]
