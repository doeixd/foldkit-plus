/**
 * Field names and record keys named like `Object.prototype` members:
 * `pnpm mutate packages/surface/test/protoKey.mutations.ts`.
 */
const tests = ['packages/surface/test/protoKey.test.ts']

export default [
  {
    name: 'a record reads a key it inherits',
    edits: [
      {
        file: '../src/index.ts',
        find: 'root === null || root === undefined || !Object.hasOwn(root, key)',
        replace: 'root === null || root === undefined',
      },
    ],
    tests,
  },
  {
    name: 'a field reference is assigned to the tree',
    edits: [
      {
        file: '../src/index.ts',
        find: '      Object.defineProperty(node, key, {\n        value: makeTree(',
        replace: '      node[key] = makeTree(',
      },
      {
        file: '../src/index.ts',
        find: '          owner,\n        ),\n        enumerable: true,\n        writable: true,\n        configurable: true,\n      })',
        replace: '          owner,\n        )',
      },
    ],
    tests,
  },
  {
    name: 'Projection.of picks into a plain object',
    edits: [
      {
        file: '../src/index.ts',
        find: '      const picked: Record<string, AnySchema> = Object.create(null)\n      const dependencies',
        replace: '      const picked: Record<string, AnySchema> = {}\n      const dependencies',
      },
    ],
    tests,
  },
  {
    name: 'Projection.of reads into a plain object',
    edits: [
      {
        file: '../src/index.ts',
        find: '        const out: Record<string, unknown> = Object.create(null)\n        for (const [key, reader] of readers) out[key] = reader(root)\n        return out\n      }',
        replace:
          '        const out: Record<string, unknown> = {}\n        for (const [key, reader] of readers) out[key] = reader(root)\n        return out\n      }',
      },
    ],
    tests,
  },
  {
    name: 'Projection.pick finds a picked field on a plain object',
    edits: [
      {
        file: '../src/index.ts',
        find: '    const paths: Record<string, string> = Object.create(null)\n    for (const ref of [...selected]) {',
        replace:
          '    const paths: Record<string, string> = {}\n    for (const ref of [...selected]) {',
      },
    ],
    tests,
  },
  {
    name: 'Projection.pick keeps its fields on a plain object',
    edits: [
      {
        file: '../src/index.ts',
        find: '    const fields: Record<string, AnySchema> = Object.create(null)\n    const paths: Record<string, string> = Object.create(null)\n    for (const ref of [...selected]) {',
        replace:
          '    const fields: Record<string, AnySchema> = {}\n    const paths: Record<string, string> = Object.create(null)\n    for (const ref of [...selected]) {',
      },
    ],
    tests,
  },
  {
    name: 'Projection.pick reads into a plain object',
    edits: [
      {
        file: '../src/index.ts',
        find: '        const out: Record<string, unknown> = Object.create(null)\n        for (const ref of selected)',
        replace:
          '        const out: Record<string, unknown> = {}\n        for (const ref of selected)',
      },
    ],
    tests,
  },
  {
    name: 'Projection.compose keeps its fields on a plain object',
    edits: [
      {
        file: '../src/index.ts',
        find: '    const fields: Record<string, AnySchema> = Object.create(null)\n    // Where each field',
        replace: '    const fields: Record<string, AnySchema> = {}\n    // Where each field',
      },
    ],
    tests,
  },
  {
    name: 'Projection.compose finds a field’s path on a plain object',
    edits: [
      {
        file: '../src/index.ts',
        find: '    // fields that would be read as one, as in `pick`.\n    const paths: Record<string, string> = Object.create(null)',
        replace:
          '    // fields that would be read as one, as in `pick`.\n    const paths: Record<string, string> = {}',
      },
    ],
    tests,
  },
  {
    name: 'Projection.compose reads into a plain object',
    edits: [
      {
        file: '../src/index.ts',
        find: '        const out: Record<string, unknown> = Object.create(null)\n        for (const part of parts)',
        replace:
          '        const out: Record<string, unknown> = {}\n        for (const part of parts)',
      },
    ],
    tests,
  },
]
