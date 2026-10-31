/**
 * A memoized drawing drawn afresh while a server renders a page, broken:
 * `pnpm mutate packages/mixins/test/serverRender.mutations.ts`.
 */
export default [
  {
    name: 'a server render reuses a drawing kept from another render',
    edits: [
      {
        file: '../src/slotView.ts',
        find: '  if ((globalThis as Record<symbol, unknown>)[SERVER_RENDER] === true) return plain()\n',
        replace: '',
      },
    ],
    tests: ['packages/mixins/test/serverRender.test.ts'],
  },
]
