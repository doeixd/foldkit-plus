export default [
  {
    name: 'manifestFromChunks ignores duplicate tag claim',
    edits: [
      {
        file: '../src/vite/manifest.ts',
        find: '      if (Object.hasOwn(result, tag)) {',
        replace: '      if (false && Object.hasOwn(result, tag)) {',
      },
    ],
    tests: ['packages/ssr/test/manifest.test.ts'],
  },
  {
    name: 'manifestFromChunks ignores missing tag home',
    edits: [
      {
        file: '../src/vite/manifest.ts',
        find: '    if (!Object.hasOwn(result, tag)) {',
        replace: '    if (false && !Object.hasOwn(result, tag)) {',
      },
    ],
    tests: ['packages/ssr/test/manifest.test.ts'],
  },
]
