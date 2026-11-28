/**
 * `reaches`: each reach variant, the own fields, the Unknown cases and the
 * owner comparison dropped. `pnpm mutate packages/remote/test/reaches.mutations.ts`.
 *
 * `reaches` builds a `metakit/graph` of row edges (one namespace per Entity
 * identity) and asks which readers the write affects, so each entry drops the
 * edges one kind of read contributes, or changes how a namespace is named.
 */
const file = '../src/reaches.ts'
const tests = ['packages/remote/test/reaches.test.ts']
const edge = (owner: string, key: string) =>
  `knownEdge(rowPath(nsOf(${owner}), [${key}]), 'derived')`

export default [
  {
    name: 'a body field is not read as its own',
    edits: [
      {
        file,
        find: `const readEdges: Array<PathEdge> = read.fields.map(field =>\n    ${edge('field.owner', 'field.key')},\n  )`,
        replace: 'const readEdges: Array<PathEdge> = []',
      },
    ],
    tests,
  },
  {
    name: "a path's field is not read",
    edits: [
      {
        file,
        find: `        Path: path => {\n          readEdges.push(${edge('path.field.owner', 'path.field.key')})\n`,
        replace: '        Path: path => {\n',
      },
    ],
    tests,
  },
  {
    name: "a path's link is not read",
    edits: [
      {
        file,
        find: `for (const relation of path.via) {\n            readEdges.push(${edge('relation.owner', 'relation.key')})\n          }\n        },\n        Exists:`,
        replace: `for (const relation of path.via.slice(0, 0)) {\n            readEdges.push(${edge('relation.owner', 'relation.key')})\n          }\n        },\n        Exists:`,
      },
    ],
    tests,
  },
  {
    name: "an exists' relation is not read",
    edits: [
      {
        file,
        find: `          readEdges.push(\n            ${edge('exists.relation.owner', 'exists.relation.key')},\n          )\n`,
        replace: '',
      },
    ],
    tests,
  },
  {
    name: 'the link an exists is reached by is not read',
    edits: [
      {
        file,
        find: 'for (const relation of exists.via) {',
        replace: 'for (const relation of exists.via.slice(0, 0)) {',
      },
    ],
    tests,
  },
  {
    name: "an exists' where is not read",
    edits: [
      {
        file,
        find: 'for (const field of dependenciesOf(exists.where.value).fields) {',
        replace: 'for (const field of dependenciesOf(exists.where.value).fields.slice(0, 0)) {',
      },
    ],
    tests: [...tests, 'packages/remote/test/writeTrace.test.ts'],
  },
  {
    name: "a path from the viewer's field is not read",
    edits: [
      {
        file,
        find: `        ViewerPath: path => {\n          readEdges.push(${edge('path.field.owner', 'path.field.key')})\n`,
        replace: '        ViewerPath: path => {\n',
      },
    ],
    tests,
  },
  {
    name: "a path from the viewer's link is not read",
    edits: [
      {
        file,
        find: `for (const relation of path.via) {\n            readEdges.push(${edge('relation.owner', 'relation.key')})\n          }\n        },\n      }),`,
        replace: `for (const relation of path.via.slice(0, 0)) {\n            readEdges.push(${edge('relation.owner', 'relation.key')})\n          }\n        },\n      }),`,
      },
    ],
    tests,
  },
  {
    // One namespace per owner decides the members and the footprint alike: the
    // rewrite onto `metakit/graph` left a single place where owners are compared.
    name: 'members and footprints are compared by their Entity name, not its identity',
    edits: [
      {
        file,
        find: 'const known = ids.get(owner.token)',
        replace: 'const known = ids.get((owner as { readonly name?: string }).name as never)',
      },
      {
        file,
        find: 'ids.set(owner.token, id)',
        replace: 'ids.set((owner as { readonly name?: string }).name as never, id)',
      },
    ],
    tests,
  },
  {
    name: 'a query with no body is unaffected',
    edits: [
      {
        file,
        find: "return Reach.Unknown({ why: 'NoBody' })",
        replace: 'return Reach.Unaffected()',
      },
    ],
    tests: [...tests, 'packages/remote/test/writeTrace.test.ts'],
  },
  {
    name: 'a handler mutation is unaffected',
    edits: [
      {
        file,
        find: "return Reach.Unknown({ why: 'Handler' })",
        replace: 'return Reach.Unaffected()',
      },
    ],
    tests,
  },
  {
    name: 'a body-less query is named before a handler mutation',
    edits: [
      {
        file,
        find: "  if (writeEdges === undefined) return Reach.Unknown({ why: 'Handler' })\n  if (query.body === undefined) return Reach.Unknown({ why: 'NoBody' })",
        replace:
          "  if (query.body === undefined) return Reach.Unknown({ why: 'NoBody' })\n  if (writeEdges === undefined) return Reach.Unknown({ why: 'Handler' })",
      },
    ],
    tests,
  },
  {
    name: 'an Unknown footprint is read as writing nothing',
    edits: [
      {
        file,
        find: '    Unknown: () => undefined,',
        replace: '    Unknown: () => [],',
      },
    ],
    tests,
  },
  {
    name: 'a footprint names its reads as its writes',
    edits: [
      {
        file,
        find: "Derived: ({ writes }) => writes.map(key => knownEdge(rowPath(entityNs, [key]), 'derived')),",
        replace:
          "Derived: ({ reads }: { readonly reads: ReadonlyArray<string> }) => reads.map(key => knownEdge(rowPath(entityNs, [key]), 'derived')),",
      },
      {
        file,
        find: "Declared: ({ writes }) => writes.map(key => knownEdge(rowPath(entityNs, [key]), 'declared')),",
        replace:
          "Declared: ({ reads }: { readonly reads: ReadonlyArray<string> }) => reads.map(key => knownEdge(rowPath(entityNs, [key]), 'declared')),",
      },
    ],
    tests,
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
