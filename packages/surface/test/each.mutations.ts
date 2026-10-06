/**
 * `Surface.each` and lone sources, broken in turn:
 * `pnpm mutate packages/surface/test/each.mutations.ts` checks that a test
 * fails for every one.
 */
const tests = ['packages/surface/test/each.test.ts']
const file = '../src/index.ts'

export default [
  {
    name: 'the parent is not consulted before deriving instances',
    edits: [
      {
        file,
        find: '      const parent = config.from.projectionOf(model)\n      if (Option.isNone(parent)) return []\n',
        replace: '',
      },
    ],
    tests,
  },
  {
    name: 'duplicate keys are silently kept',
    edits: [
      {
        file,
        find: '        if (seen.has(key))\n          throw new Error(`Surface.each: "${child.name}" has two instances keyed "${key}"`)',
        replace: '',
      },
    ],
    tests,
  },
  {
    name: '"__proto__" is admitted as an instance key',
    edits: [
      {
        file,
        find: '        if (key === \'__proto__\')\n          throw new Error(`Surface.each: "${child.name}" refuses "__proto__" as an instance key`)',
        replace: '',
      },
    ],
    tests,
  },
  {
    name: 'an inactive Surface.when still resolves its instance',
    edits: [
      {
        file,
        find: '      projectionOf: model => Option.map(paramsOf(model), surface.projection),\n      instancesOf: model => {\n        const value = paramsOf(model)\n        if (Option.isNone(value)) return []',
        replace:
          '      projectionOf: model => Option.map(paramsOf(model), surface.projection),\n      instancesOf: model => {\n        const value = paramsOf(model)\n        void value',
      },
    ],
    tests,
  },
]
