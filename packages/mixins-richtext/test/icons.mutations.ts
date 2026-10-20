/**
 * The chrome's icons, broken in turn:
 * `pnpm mutate packages/mixins-richtext/test/icons.mutations.ts` checks that a
 * test fails for every one.
 */
const icons = '../src/icons.ts'
const tests = ['packages/mixins-richtext/test/icons.test.ts']

export default [
  {
    name: 'a size is ignored',
    edits: [{ file: icons, find: '{ size: `${size}px` }', replace: '{}' }],
    tests,
  },
  {
    name: 'a name from the prototype has a drawing',
    edits: [{ file: icons, find: 'Object.hasOwn(icons, name)', replace: 'name in icons' }],
    tests,
  },
  {
    name: 'the mask draws another icon',
    edits: [
      { file: icons, find: 'Icon.maskUrl(icons[name])', replace: "Icon.maskUrl(icons['plus'])" },
    ],
    tests,
  },
]
