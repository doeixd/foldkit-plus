/**
 * `Remote.patch` writing relation refs as ref keys, broken in turn:
 * `pnpm mutate packages/remote/test/patchRef.mutations.ts` checks that a test
 * fails for every one.
 */
const tests = ['packages/remote/test/patchRef.test.ts']

export default [
  {
    name: 'a patch keeps refs as objects',
    edits: [
      {
        file: '../src/index.ts',
        find: 'descriptor.patch(id, wireValues(descriptor, values))',
        replace: 'descriptor.patch(id, values)',
      },
    ],
    tests,
  },
  {
    name: 'a ref to any Entity is taken',
    edits: [
      {
        file: '../src/patchValues.ts',
        find: '(value as Partial<EntityRef<string>>).entity === entity &&',
        replace: 'true &&',
      },
    ],
    tests,
  },
  {
    name: 'a required relation takes null',
    edits: [
      {
        file: '../src/patchValues.ts',
        find: 'return shape.nullable ? null : refuse()',
        replace: 'return null',
      },
    ],
    tests,
  },
  {
    name: 'a many relation takes one ref',
    edits: [
      {
        file: '../src/patchValues.ts',
        find: 'Array.isArray(value) ? value.map(key) : refuse()',
        replace: '[value].flat().map(key)',
      },
    ],
    tests,
  },
  {
    name: "a page's refs stay objects",
    edits: [
      {
        file: '../src/patchValues.ts',
        find: '{ refs: page.refs.map(key), hasNext',
        replace: '{ refs: page.refs, hasNext',
      },
    ],
    tests,
  },
  {
    name: 'anything is a page',
    edits: [
      {
        file: '../src/patchValues.ts',
        find: '  return Array.isArray(page.refs) &&',
        replace: '  return true &&',
      },
    ],
    tests,
  },
]
