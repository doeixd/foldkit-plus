/**
 * A plan's family rows, broken in turn:
 * `pnpm mutate packages/ssr/test/family.mutations.ts` checks that a test
 * fails for every one.
 */
const tests = ['packages/ssr/test/family.test.ts']

export default [
  {
    name: 'the envelope drops what the parent reads',
    edits: [
      {
        file: '../src/shared.ts',
        find: '    const parent = from === undefined ? [] : Option.toArray(from.projectionOf(model))\n    return [...parent, ...origin.instancesOf(model).map(instance => instance.projection)]',
        replace:
          '    const parent = from === undefined ? [] : Option.toArray(from.projectionOf(model))\n    void parent\n    return [...origin.instancesOf(model).map(instance => instance.projection)]',
      },
    ],
    tests,
  },
  {
    name: 'coverage drops the instance rows',
    edits: [
      {
        file: '../src/index.ts',
        find: '  if (rows[0]?.active !== true) return rows',
        replace: '  return rows',
      },
    ],
    tests,
  },
  {
    name: 'an instance row loses its key',
    edits: [
      {
        file: '../src/index.ts',
        find: '          name: family.name,\n          key: instance.key,',
        replace: '          name: family.name,',
      },
    ],
    tests,
  },
  {
    name: 'shortfalls name the Surface alone',
    edits: [
      {
        file: '../src/index.ts',
        find: '  surface.key === undefined ? surface.name : `${surface.name}[${surface.key}]`',
        replace: '  surface.name',
      },
    ],
    tests,
  },
  {
    name: 'no Surface allows any binding',
    edits: [
      {
        file: '../src/shared.ts',
        find: 'plan.surfaces.flatMap(source =>\n      projectionsOf(source, model).length > 0 ? source.messages : [],\n    ),',
        replace: 'plan.surfaces.flatMap(source => []),',
      },
    ],
    tests,
  },
  {
    name: 'every active Surface allows a cheer',
    edits: [
      {
        file: '../src/shared.ts',
        find: '      projectionsOf(source, model).length > 0 ? source.messages : [],',
        replace:
          "      projectionsOf(source, model).length > 0 ? [...source.messages, 'Cheered'] : [],",
      },
    ],
    tests,
  },
]
