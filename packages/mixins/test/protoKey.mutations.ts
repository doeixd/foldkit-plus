/**
 * Slot, variant, token and knob names like `Object.prototype` members:
 * `pnpm mutate packages/mixins/test/protoKey.mutations.ts`.
 */
const tests = ['packages/mixins/test/protoKey.test.ts']

export default [
  {
    name: 'a Mixin keeps its contributions on a plain object',
    edits: [
      {
        file: '../src/mixin.ts',
        find: 'Object.freeze(Object.assign(Object.create(null), contributions))',
        replace: 'Object.freeze({ ...contributions })',
      },
    ],
    tests,
  },
  {
    name: 'a dynamic Mixin keeps its contributions on a plain object',
    edits: [
      {
        file: '../src/mixin.ts',
        find: '): Mixin<Message> => Object.freeze({ name, contributions: ownCopy(contributions) })',
        replace:
          '): Mixin<Message> => Object.freeze({ name, contributions: Object.freeze({ ...contributions }) })',
      },
    ],
    tests,
  },
  {
    name: 'Style.recipe records the chosen values on a plain object',
    edits: [
      {
        file: '../src/style.ts',
        find: '    const effective: Record<string, string> = Object.create(null)\n    for (const [variant',
        replace: '    const effective: Record<string, string> = {}\n    for (const [variant',
      },
    ],
    tests,
  },
  {
    name: 'Style.recipe reads the selection through the prototype',
    edits: [
      {
        file: '../src/style.ts',
        find: 'own(selection as Record<string, string | undefined>, variant)',
        replace: '(selection as Record<string, string | undefined>)[variant]',
      },
    ],
    tests,
  },
  {
    name: 'mergePieces merges onto a plain object',
    edits: [
      {
        file: '../src/style.ts',
        find: 'const merged: Record<string, StyleValue> = Object.create(null)',
        replace: 'const merged: Record<string, StyleValue> = {}',
      },
    ],
    tests,
  },
  {
    name: 'recipeFor records the chosen values on a plain object',
    edits: [
      {
        file: '../src/style.ts',
        find: '      const effective: Record<string, string> = Object.create(null)\n      for (const [axis',
        replace: '      const effective: Record<string, string> = {}\n      for (const [axis',
      },
    ],
    tests,
  },
  {
    name: 'recipeFor reads the selection through the prototype',
    edits: [
      {
        file: '../src/style.ts',
        find: 'own(selection as Record<string, string | null | undefined>, axis)',
        replace: '(selection as Record<string, string | null | undefined>)[axis]',
      },
    ],
    tests,
  },
  {
    name: 'extend gathers the axes on a plain object',
    edits: [
      {
        file: '../src/style.ts',
        find: 'const variants: Record<string, Record<string, StylePieces<Slots>>> = Object.create(null)',
        replace: 'const variants: Record<string, Record<string, StylePieces<Slots>>> = {}',
      },
    ],
    tests,
  },
  {
    name: 'forCapability gathers its pieces on a plain object',
    edits: [
      {
        file: '../src/style.ts',
        find: '    const pieces: Record<string, StyleValue> = Object.create(null)',
        replace: '    const pieces: Record<string, StyleValue> = {}',
      },
    ],
    tests,
  },
  {
    name: 'Theme.compose merges groups onto a plain object',
    edits: [
      {
        file: '../src/theme/core.ts',
        find: 'const merged: Record<string, Record<string, string>> = Object.create(null)',
        replace: 'const merged: Record<string, Record<string, string>> = {}',
      },
    ],
    tests,
  },
  {
    name: 'Theme.scoped gathers groups on a plain object',
    edits: [
      {
        file: '../src/theme/root.ts',
        find: 'const tokens: Record<string, Record<string, string>> = Object.create(null)',
        replace: 'const tokens: Record<string, Record<string, string>> = {}',
      },
    ],
    tests,
  },
  {
    name: 'Theme.scoped gathers names on a plain object',
    edits: [
      {
        file: '../src/theme/root.ts',
        find: 'const defined: Record<string, string> = Object.create(null)',
        replace: 'const defined: Record<string, string> = {}',
      },
    ],
    tests,
  },
  {
    name: "Theme.root reads omit's group through the prototype",
    edits: [
      {
        file: '../src/theme/root.ts',
        find: 'Object.hasOwn(own(omit, group) ?? {}, name)',
        replace: 'Object.hasOwn(omit[group] ?? {}, name)',
      },
    ],
    tests,
  },
  {
    name: 'Theme.set merges groups onto a plain object',
    edits: [
      {
        file: '../src/theme/knobs.ts',
        find: 'const merged: Record<string, Record<string, unknown>> = Object.create(null)',
        replace: 'const merged: Record<string, Record<string, unknown>> = {}',
      },
    ],
    tests,
  },
  {
    name: 'a set knob is read through the prototype',
    edits: [
      {
        file: '../src/theme/knobs.ts',
        find: 'own(own(values as Readonly<Record<string, Readonly<Record<string, unknown>>>>, group), name)',
        replace:
          '(values as Readonly<Record<string, Readonly<Record<string, unknown>> | undefined>>)[group]?.[name]',
      },
    ],
    tests,
  },
]
