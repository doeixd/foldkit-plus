export default [
  {
    name: 'canonicalization leaves free dollar-prefixed path heads unescaped',
    edits: [
      {
        file: '../src/artifact.ts',
        find: "const canonicalHead = renames.get(head) ?? (head.startsWith('$') ? `$${head}` : head)",
        replace: 'const canonicalHead = renames.get(head) ?? head',
      },
    ],
    tests: ['packages/metakit/test/artifact-canonical.test.ts'],
  },
]
