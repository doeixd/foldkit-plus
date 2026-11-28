export default [
  {
    name: 'binder allows duplicate press while chunk is in flight',
    edits: [
      {
        file: '../src/binder.ts',
        find: '      if (pendingPresses.has(el)) return',
        replace: '      if (false && pendingPresses.has(el)) return',
      },
    ],
    tests: ['packages/ssr/test/binderChunks.test.ts'],
  },
  {
    name: 'binder does not mark aria-disabled on non-form chunk failure',
    edits: [
      {
        file: '../src/binder.ts',
        find: "        next.el.setAttribute('aria-disabled', 'true')",
        replace: '        // skipped aria-disabled',
      },
    ],
    tests: ['packages/ssr/test/binderChunks.test.ts'],
  },
]
