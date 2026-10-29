/**
 * A node id of `__proto__`, keyed into a plain object at each step:
 * `pnpm mutate packages/composition/test/protoKeys.mutations.ts` checks that a
 * test fails for every one.
 */
const struct = '../../surface/src/index.ts'

export default [
  {
    name: 'Projection.struct collects schemas in a plain object',
    edits: [
      {
        file: struct,
        find: 'must stay a key.\n    const picked: Record<string, AnySchema> = Object.create(null)',
        replace: 'must stay a key.\n    const picked: Record<string, AnySchema> = {}',
      },
    ],
    tests: ['packages/surface/test/edge.test.ts'],
  },
  {
    name: 'Projection.struct reads into a plain object',
    edits: [
      {
        file: struct,
        find: '    const read = (root: unknown): unknown => {\n      const out: Record<string, unknown> = Object.create(null)',
        replace:
          '    const read = (root: unknown): unknown => {\n      const out: Record<string, unknown> = {}',
      },
    ],
    tests: ['packages/surface/test/edge.test.ts'],
  },
  {
    name: 'a Surface Block page collects its reads in a plain object',
    edits: [
      {
        file: '../src/surface/index.ts',
        find: '    const entries: Record<string, Projection<Root, unknown>> = Object.create(null)',
        replace: '    const entries: Record<string, Projection<Root, unknown>> = {}',
      },
    ],
    tests: ['packages/composition/test/surface.test.ts'],
  },
  {
    name: 'a Query Block page collects its reads in a plain object',
    edits: [
      {
        file: '../src/remote/index.ts',
        find: '    const entries: Record<string, Projection<AppModel, RemoteData<unknown>>> = Object.create(null)',
        replace:
          '    const entries: Record<string, Projection<AppModel, RemoteData<unknown>>> = {}',
      },
    ],
    tests: ['packages/composition/test/remote.test.ts'],
  },
  {
    name: 'a drawn node reads its data through the record’s prototype',
    edits: [
      {
        file: '../src/foldkit/index.ts',
        find: '      options.data !== undefined && Object.hasOwn(options.data, id) ? options.data[id] : undefined,',
        replace: '      options.data?.[id],',
      },
    ],
    tests: ['packages/composition/test/remote.test.ts'],
  },
  // Names a Block declares, against a stored node that leaves them out.
  {
    name: 'a Region’s children are counted through the prototype',
    edits: [
      {
        file: '../src/foldkit/index.ts',
        find: 'const count = (own(node.regions, name) ?? []).length',
        replace: 'const count = (node.regions[name] ?? []).length',
      },
    ],
    tests: ['packages/composition/test/declaredNames.test.ts'],
  },
  {
    name: 'a Region’s children are drawn through the prototype',
    edits: [
      {
        file: '../src/foldkit/index.ts',
        find: '(own(node.regions, name) ?? []).map(draw)',
        replace: '(node.regions[name] ?? []).map(draw)',
      },
    ],
    tests: ['packages/composition/test/declaredNames.test.ts'],
  },
  {
    name: 'a look reads a node’s choice through the prototype',
    edits: [
      {
        file: '../src/appearance/index.ts',
        find: 'own(appearance, axis) ?? def?.defaults?.[axis]',
        replace: 'appearance[axis] ?? def?.defaults?.[axis]',
      },
    ],
    tests: ['packages/composition/test/declaredNames.test.ts'],
  },
  {
    name: 'an offered choice is assigned',
    edits: [
      {
        file: '../src/block.ts',
        find: 'put(offered, name, choice)',
        replace: '(offered[name] = choice)',
      },
    ],
    tests: ['packages/composition/test/declaredNames.test.ts'],
  },
  {
    name: 'an offered responsive choice is assigned',
    edits: [
      {
        file: '../src/block.ts',
        find: 'put(offered, name, kept)',
        replace: '(offered[name] = kept)',
      },
    ],
    tests: ['packages/composition/test/declaredNames.test.ts'],
  },
]
