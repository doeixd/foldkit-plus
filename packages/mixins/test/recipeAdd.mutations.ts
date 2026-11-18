/**
 * `recipe.add` gives a recipe axes and values it lacks, refuses one it has,
 * and leaves the recipe it was called on alone:
 * `pnpm mutate packages/mixins/test/recipeAdd.mutations.ts`.
 */
const tests = ['packages/mixins/test/styleRecipes.test.ts']

export default [
  {
    name: 'add refuses a value the axis already has',
    edits: [
      {
        file: '../src/style.ts',
        find: 'if (Object.hasOwn(target, value)) {',
        replace: 'if (false) {',
      },
    ],
    tests,
  },
  {
    name: 'add stores the value it was given',
    edits: [
      {
        file: '../src/style.ts',
        find: '          target[value] = pieces\n',
        replace: '',
      },
    ],
    tests,
  },
  {
    name: 'add keeps the base, the defaults and the compounds',
    edits: [
      {
        file: '../src/style.ts',
        find: '<SlotRecipeVariants<Slots>, Base>({ ...def, variants })',
        replace: '<SlotRecipeVariants<Slots>, Base>({ variants })',
      },
    ],
    tests,
  },
  {
    name: "an added value is copied in, not written into the first recipe's axis",
    edits: [
      {
        file: '../src/style.ts',
        find: 'copy[axis] = Object.assign(Object.create(null), values)',
        replace: 'copy[axis] = values',
      },
    ],
    tests,
  },
  {
    // `protoKey.mutations.ts` holds the same guard for `extend`.
    name: 'add gathers the axes on an object with no prototype',
    edits: [
      {
        file: '../src/style.ts',
        find: 'const copy: Record<string, Record<string, StylePieces<Slots>>> = Object.create(null)',
        replace: 'const copy: Record<string, Record<string, StylePieces<Slots>>> = {}',
      },
    ],
    tests,
  },
  {
    name: "a selection's result checks the added pieces' slots",
    edits: [
      {
        file: '../src/style.ts',
        find: 'assertKnownSlots(slots, pieces as StylePieces<Slots>, `variants.${axis}.${value}`)',
        replace: '',
      },
    ],
    tests,
  },
]
