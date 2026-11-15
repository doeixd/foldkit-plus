/**
 * The islands' boot, broken in turn:
 * `pnpm mutate examples/design-system/test/islands.mutations.ts`.
 */
const unit = ['examples/design-system/test/islands.test.ts']

export default [
  {
    name: 'a missing container is skipped, not named',
    edits: [
      {
        file: '../src/islands.ts',
        find: 'if (container === null)\n      throw new Error(`#${islandContainerId(island.id)} is missing from the page`)',
        replace: 'if (container === null) continue',
      },
    ],
    tests: unit,
  },
  {
    name: 'an island draws over the page’s own container',
    edits: [
      {
        file: '../src/islands.ts',
        find: '  container.replaceChildren(own)\n  body.mount(own)',
        replace: '  body.mount(container)',
      },
    ],
    tests: unit,
  },
]
