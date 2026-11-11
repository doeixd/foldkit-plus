/**
 * Every base slot is in every selection of a slot recipe, which its result
 * type promises: `pnpm mutate packages/mixins/test/recipePieces.mutations.ts`.
 */
const tests = ['packages/mixins/test/styleRecipes.test.ts']

export default [
  {
    name: 'a selection starts from the base',
    edits: [
      {
        file: '../src/style.ts',
        find: 'let pieces = mergePieces(def.base, undefined)',
        replace: 'let pieces = mergePieces(undefined, undefined)',
      },
    ],
    tests,
  },
  {
    name: 'extend keeps the base it extends',
    edits: [
      {
        file: '../src/style.ts',
        find: 'base: mergePieces(def.base, patch.base),',
        replace: 'base: mergePieces(undefined, patch.base),',
      },
    ],
    tests,
  },
  {
    name: "extend adds its patch's base",
    edits: [
      {
        file: '../src/style.ts',
        find: 'base: mergePieces(def.base, patch.base),',
        replace: 'base: mergePieces(def.base, undefined),',
      },
    ],
    tests,
  },
]
