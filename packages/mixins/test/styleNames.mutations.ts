/**
 * A protected or owned style property holds however a Mixin spells it, and
 * through its shorthands and sides (review of #523):
 * `pnpm mutate packages/mixins/test/styleNames.mutations.ts`.
 */
const resolver = '../src/resolver.ts'
const names = '../src/styleNames.ts'
const tests = ['packages/mixins/test/resolver.test.ts', 'packages/mixins/test/styleNames.test.ts']

export default [
  {
    name: 'a protected style property is compared by its spelling',
    edits: [
      {
        file: resolver,
        find: 'protectedStyle.find(name => overlaps(property, name))',
        replace: 'protectedStyle.find(name => name === property)',
      },
    ],
    tests,
  },
  {
    name: 'a style property is owned by its spelling',
    edits: [
      {
        file: resolver,
        find: '    const declaration = declarationName(property)\n',
        replace: '    const declaration = property\n',
      },
    ],
    tests,
  },
  {
    name: 'a physical inline side is not a logical one',
    edits: [
      {
        file: names,
        find: "  [/(^|-)(left|right)(?=-|$)/, ['inline-start', 'inline-end']],\n",
        replace: '',
      },
    ],
    tests,
  },
  {
    name: 'top is not the inset top',
    edits: [
      {
        file: names,
        find: 'const named = INSET_SIDES.has(declaration) ? `inset-${declaration}` : declaration',
        replace: 'const named = declaration',
      },
    ],
    tests,
  },
  {
    name: 'translate, rotate and scale stand apart from transform',
    edits: [
      { file: names, find: "  ['transform', ['translate', 'rotate', 'scale']],\n", replace: '' },
    ],
    tests,
  },
  {
    name: 'a shorthand does not cover the names that extend it',
    edits: [
      {
        file: names,
        find: '  return longhand.startsWith(`${shorthand}-`)',
        replace: '  return false',
      },
    ],
    tests,
  },
  {
    name: 'a shorthand covers every name that extends it',
    edits: [
      {
        file: names,
        find: 'if (apart === undefined || apart.has(longhand)) return false',
        replace: 'if (apart === undefined) return false',
      },
    ],
    tests,
  },
  {
    name: 'border-width does not cover a side width',
    edits: [
      {
        file: names,
        find: 'if (part !== undefined) return longhand.startsWith',
        replace: 'if (false as boolean) return longhand.startsWith',
      },
    ],
    tests,
  },
]
