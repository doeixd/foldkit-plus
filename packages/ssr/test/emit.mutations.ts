/**
 * A static site's emitted files, broken in turn:
 * `pnpm mutate packages/ssr/test/emit.mutations.ts` checks that a test
 * fails for every one.
 */
const tests = ['packages/ssr/test/staticSite.test.ts']

export default [
  {
    name: 'an emitted path may climb out of the output',
    edits: [{ file: '../src/vite.ts', find: " || segments.includes('..')", replace: '' }],
    tests,
  },
  {
    name: 'an emitted path may be absolute',
    edits: [
      {
        file: '../src/vite.ts',
        find: String.raw`/^([a-zA-Z]:|[\\/])/.test(file)`,
        replace: 'false',
      },
    ],
    tests,
  },
  {
    name: 'an emitted file may land on a page',
    edits: [{ file: '../src/vite.ts', find: 'if (claimed.has(file)) {', replace: 'if (false) {' }],
    tests,
  },
  {
    name: 'an emitted file replaces what the client build wrote',
    edits: [
      {
        file: '../src/vite.ts',
        find: 'await access(target).then(\n        () => true,',
        replace: 'await access(target).then(\n        () => false,',
      },
    ],
    tests,
  },
  {
    name: 'nothing emitted is written',
    edits: [
      {
        file: '../src/vite.ts',
        find: '        await writeEmitted(outDir, result.emitted)\n',
        replace: '',
      },
    ],
    tests,
  },
]
