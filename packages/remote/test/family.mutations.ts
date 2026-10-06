/**
 * A family's Remote reads, broken in turn:
 * `pnpm mutate packages/remote/test/family.mutations.ts` checks that a test
 * fails for every one.
 */
const tests = ['packages/remote/test/family.test.ts']
const file = '../src/index.ts'

export default [
  {
    name: 'a family drops its parent requirements',
    edits: [
      {
        file,
        find: '    return [\n      ...Option.toArray(from.projectionOf(model)).map(projection => ({\n        name: from.name,\n        projection,\n      })),\n      ...instances.map(instance => ({',
        replace: '    return [\n      ...instances.map(instance => ({',
      },
    ],
    tests,
  },
  {
    name: 'family instances are named by their Surface alone',
    edits: [
      {
        file,
        find: '        name: `${entry.name}[${instance.key}]`,',
        replace: '        name: entry.name,',
      },
    ],
    tests,
  },
  {
    name: 'subscriptions ask only an entry’s first projection',
    edits: [
      {
        file,
        find: '        const asked = (model: AppModel) =>\n          askedUnion(resolvedAt(model).map(({ projection }) => projection))',
        replace:
          '        const asked = (model: AppModel) =>\n          askedUnion(resolvedAt(model).slice(0, 1).map(({ projection }) => projection))',
      },
    ],
    tests,
  },
  {
    name: 'satisfy prefetches only an entry’s first projection',
    edits: [
      {
        file,
        find: '            for (const { projection } of resolvedOf(entry, current))',
        replace: '            for (const { projection } of resolvedOf(entry, current).slice(0, 1))',
      },
    ],
    tests,
  },
]
