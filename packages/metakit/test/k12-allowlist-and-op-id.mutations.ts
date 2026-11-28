const tests = ['packages/metakit/test/k12-allowlist-and-op-id.test.ts']

export default [
  {
    name: 'Operation.define accepts "@" in an operation id',
    edits: [
      {
        file: '../src/operation.ts',
        find: "  if (id.includes('@')) {",
        replace: "  if (false && id.includes('@')) {",
      },
    ],
    tests,
  },
  {
    name: 'interpreter allowlist matches bare operation id prefix before "@"',
    edits: [
      {
        file: '../src/interpreter.ts',
        find: '    if (Node.isForeignAllowed(key, allowlist)) {',
        replace:
          "    if (Node.isForeignAllowed(key, allowlist) || allowlist.has(key.split('@')[0] ?? key)) {",
      },
    ],
    tests,
  },
  {
    name: 'isForeignAllowed permits every operation even when allowlist is given',
    edits: [
      {
        file: '../src/node.ts',
        find: '): boolean => allowlist === undefined || allowlist.has(name)',
        replace: '): boolean => allowlist === undefined || true || allowlist.has(name)',
      },
    ],
    tests,
  },
]
