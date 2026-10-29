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
]
