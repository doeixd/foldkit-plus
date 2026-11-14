/**
 * `reaches`: each reach variant, the own fields, the Unknown cases and the
 * owner comparison dropped. `pnpm mutate packages/remote/test/reaches.mutations.ts`.
 */
export default [
  {
    name: 'a body field is not read as its own',
    edits: [
      {
        file: '../src/reaches.ts',
        find: 'const own = read.fields.some(field => written(field.owner, field.key))',
        replace: 'const own = false',
      },
    ],
    tests: ['packages/remote/test/reaches.test.ts'],
  },
  {
    name: "a path's field is not read",
    edits: [
      {
        file: '../src/reaches.ts',
        find: '        Path: path =>\n          written(path.field.owner, path.field.key) ||\n',
        replace: '        Path: path =>\n          false ||\n',
      },
    ],
    tests: ['packages/remote/test/reaches.test.ts'],
  },
  {
    name: "a path's link is not read",
    edits: [
      {
        file: '../src/reaches.ts',
        find: '          path.via.some(relation => written(relation.owner, relation.key)),\n        Exists:',
        replace: '          false,\n        Exists:',
      },
    ],
    tests: ['packages/remote/test/reaches.test.ts'],
  },
  {
    name: "an exists' relation is not read",
    edits: [
      {
        file: '../src/reaches.ts',
        find: '          written(exists.relation.owner, exists.relation.key) ||\n',
        replace: '          false ||\n',
      },
    ],
    tests: ['packages/remote/test/reaches.test.ts'],
  },
  {
    name: 'the link an exists is reached by is not read',
    edits: [
      {
        file: '../src/reaches.ts',
        find: '          exists.via.some(relation => written(relation.owner, relation.key)) ||\n',
        replace: '',
      },
    ],
    tests: ['packages/remote/test/reaches.test.ts'],
  },
  {
    name: "an exists' where is not read",
    edits: [
      {
        file: '../src/reaches.ts',
        find: '          Option.exists(exists.where, where =>\n            dependenciesOf(where).fields.some(field => written(field.owner, field.key)),\n          ),\n',
        replace: '          false,\n',
      },
    ],
    tests: ['packages/remote/test/reaches.test.ts', 'packages/remote/test/writeTrace.test.ts'],
  },
  {
    name: "a path from the viewer's field is not read",
    edits: [
      {
        file: '../src/reaches.ts',
        find: '        ViewerPath: path =>\n          written(path.field.owner, path.field.key) ||\n',
        replace: '        ViewerPath: path =>\n          false ||\n',
      },
    ],
    tests: ['packages/remote/test/reaches.test.ts'],
  },
  {
    name: "a path from the viewer's link is not read",
    edits: [
      {
        file: '../src/reaches.ts',
        find: '          path.via.some(relation => written(relation.owner, relation.key)),\n      }),',
        replace: '          false,\n      }),',
      },
    ],
    tests: ['packages/remote/test/reaches.test.ts'],
  },
  {
    name: 'members are compared by their Entity name, not its identity',
    edits: [
      {
        file: '../src/reaches.ts',
        find: 'writes.some(member => member.owner.token === owner.token && member.key === key)',
        replace:
          'writes.some(member => (member.owner as { readonly name?: string }).name === (owner as { readonly name?: string }).name && member.key === key)',
      },
    ],
    tests: ['packages/remote/test/reaches.test.ts'],
  },
  {
    name: 'a query with no body is unaffected',
    edits: [
      {
        file: '../src/reaches.ts',
        find: "return Reach.Unknown({ why: 'NoBody' })",
        replace: 'return Reach.Unaffected()',
      },
    ],
    tests: ['packages/remote/test/reaches.test.ts', 'packages/remote/test/writeTrace.test.ts'],
  },
  {
    name: 'a handler mutation is unaffected',
    edits: [
      {
        file: '../src/reaches.ts',
        find: "return Reach.Unknown({ why: 'Handler' })",
        replace: 'return Reach.Unaffected()',
      },
    ],
    tests: ['packages/remote/test/reaches.test.ts'],
  },
  {
    name: 'a body-less query is named before a handler mutation',
    edits: [
      {
        file: '../src/reaches.ts',
        find: "  if (written === undefined) return Reach.Unknown({ why: 'Handler' })\n  if (query.body === undefined) return Reach.Unknown({ why: 'NoBody' })",
        replace:
          "  if (query.body === undefined) return Reach.Unknown({ why: 'NoBody' })\n  if (written === undefined) return Reach.Unknown({ why: 'Handler' })",
      },
    ],
    tests: ['packages/remote/test/reaches.test.ts'],
  },
  {
    name: 'a footprint is compared by its Entity name, not its identity',
    edits: [
      {
        file: '../src/reaches.ts',
        find: 'owner.token === touched.entity.token && writes.includes(key)',
        replace:
          '(owner as { readonly name?: string }).name === touched.entity.name && writes.includes(key)',
      },
    ],
    tests: ['packages/remote/test/reaches.test.ts'],
  },
  {
    name: 'an Unknown footprint is read as writing nothing',
    edits: [
      {
        file: '../src/reaches.ts',
        find: '    Unknown: () => undefined,',
        replace: '    Unknown: () => () => false,',
      },
    ],
    tests: ['packages/remote/test/reaches.test.ts'],
  },
  {
    name: 'a footprint names its reads as its writes',
    edits: [
      {
        file: '../src/reaches.ts',
        find: '({ writes }: { readonly writes: ReadonlyArray<string> }): Wrote =>',
        replace: '({ reads: writes }: { readonly reads: ReadonlyArray<string> }): Wrote =>',
      },
    ],
    tests: ['packages/remote/test/reaches.test.ts'],
  },
  {
    name: 'explain lists every mutation, reaching or not',
    edits: [
      {
        file: '../src/why.ts',
        find: '                Unaffected: () => false,',
        replace: '                Unaffected: () => true,',
      },
    ],
    tests: ['packages/remote/test/writeTrace.test.ts'],
  },
  {
    name: 'explain leaves out the mutations that reach',
    edits: [
      {
        file: '../src/why.ts',
        find: '                Reads: () => true,',
        replace: '                Reads: () => false,',
      },
    ],
    tests: ['packages/remote/test/writeTrace.test.ts'],
  },
]
