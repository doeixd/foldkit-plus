/**
 * The images plugin, broken in turn:
 * `pnpm mutate packages/media/test/images.mutations.ts` checks that a test
 * fails for every one.
 */
const plugin = '../src/vite/images.ts'
const tests = ['packages/media/test/images.test.ts']

export default [
  {
    name: 'every ladder width is written, wider than the original or not',
    edits: [{ file: plugin, find: '.filter(value => value < width)', replace: '' }],
    tests,
  },
  {
    name: 'the original is not offered at its own width',
    edits: [
      {
        file: plugin,
        find: '  ...ladder.values.filter(value => value < width),\n  width,\n',
        replace: '  ...ladder.values.filter(value => value < width),\n',
      },
    ],
    tests,
  },
  {
    name: 'Vite’s asset handling takes the import first',
    edits: [{ file: plugin, find: "    enforce: 'pre',", replace: '' }],
    tests,
  },
  {
    name: 'a format both a source and the fallback is written twice',
    edits: [
      {
        file: plugin,
        find: 'const formats = [...new Set([...sources, fallback])]',
        replace: 'const formats = [...sources, fallback]',
      },
    ],
    tests,
  },
  {
    name: 'kept facts are never read',
    edits: [
      {
        file: plugin,
        find: "await readFile(file, 'utf8')",
        replace: "await readFile(join(file, 'none'), 'utf8')",
      },
    ],
    tests,
  },
  {
    name: 'kept variants are never read',
    edits: [
      {
        file: plugin,
        find: 'return new Uint8Array(await readFile(file))',
        replace: "return new Uint8Array(await readFile(join(file, 'none')))",
      },
    ],
    tests,
  },
  {
    name: 'the development server makes a width it did not offer',
    edits: [{ file: plugin, find: '!original.widths.includes(Number(width))', replace: 'false' }],
    tests,
  },
  {
    name: 'the development server makes a format it did not offer',
    edits: [
      {
        file: plugin,
        find: 'const format = formats.find(offered => offered === asked)',
        replace: "const format = asked as 'avif'",
      },
    ],
    tests,
  },
  {
    name: 'the development server lets its variants go stale',
    edits: [{ file: plugin, find: "'public, max-age=31536000, immutable'", replace: "'no-cache'" }],
    tests,
  },
  {
    name: 'any quality is taken',
    edits: [
      {
        file: plugin,
        find: '!(Number.isInteger(quality.value) && quality.value >= 1 && quality.value <= 100)',
        replace: 'false',
      },
    ],
    tests,
  },
]
