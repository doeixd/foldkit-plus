/**
 * `style.ts` frozen for the browser (#420), broken:
 * `pnpm mutate examples/foldkit/domains-plus/test/frozen.mutations.ts`.
 */
const tests = ['examples/foldkit/domains-plus/test/frozen.test.ts']

export default [
  {
    name: 'a frozen Style draws no classes',
    edits: [
      {
        file: '../../../../packages/mixins/src/viteFreeze.ts',
        find: '`${literal(slot)}: frozen(${literal(classes ?? [])}${declarations})`',
        replace: '`${literal(slot)}: frozen([]${declarations})`',
      },
    ],
    tests,
  },
  {
    name: 'a frozen contract loses a Slot',
    edits: [
      {
        file: '../../../../packages/mixins/src/viteFreeze.ts',
        find: 'const entries = Object.getOwnPropertyNames(contract).map(',
        replace: 'const entries = Object.getOwnPropertyNames(contract).slice(1).map(',
      },
    ],
    tests,
  },
] as const
