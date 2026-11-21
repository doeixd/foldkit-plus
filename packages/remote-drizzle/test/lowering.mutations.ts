/**
 * What the SQL compiler does around metakit's lowering, broken in turn:
 * `pnpm mutate packages/remote-drizzle/test/lowering.mutations.ts` checks that a
 * test fails for every one.
 */
const lowering = '../src/lowering.ts'
const compile = '../src/compile.ts'
const tests = [
  'packages/remote-drizzle/test/lowering.test.ts',
  'packages/remote-drizzle/test/lowering.differential.test.ts',
]

const render = '../src/render.ts'
const rewrites = '../src/rewrites.ts'

export default [
  {
    name: 'a strict operator with a null operand is sent to the database',
    edits: [
      {
        file: lowering,
        find: "node.op.nulls === 'strict' && node.args.some(isNull)",
        replace: 'false && node.args.some(isNull)',
      },
    ],
    tests,
  },
  {
    name: 'an input the request did not give is not null',
    edits: [
      {
        file: lowering,
        find: 'given[key] = Object.hasOwn(input, key) ? input[key] : null',
        replace: 'given[key] = input[key]',
      },
    ],
    tests,
  },
  {
    name: 'a fraction given to arithmetic is left untyped on Postgres',
    edits: [
      {
        file: rewrites,
        find: "(typeof arg.value === 'number' && !Number.isInteger(arg.value))",
        replace: 'false',
      },
    ],
    tests: [...tests, 'packages/remote-drizzle/test/conformance.test.ts'],
  },
  {
    name: 'a null given to arithmetic is left untyped on Postgres',
    edits: [{ file: rewrites, find: '(arg.value === null ||', replace: '(false ||' }],
    tests: ['packages/remote-drizzle/test/operatorConformance.test.ts'],
  },
  {
    name: 'a fraction beside an integer column is typed away before metakit refuses it',
    edits: [
      {
        file: render,
        find: '      unwrap(lowerNode(read, options), frame.subject)\n',
        replace: '',
      },
    ],
    tests,
  },
  {
    name: 'a comparison with its value first is written value first',
    edits: [
      {
        file: rewrites,
        find: "  if (node.op.id === 'eq.equals') return Node.Call({ op: node.op, args: [right, left] })",
        replace: '  if (node.op.id === "eq.equals") return node',
      },
    ],
    tests: ['packages/remote-drizzle/test/compile.test.ts'],
  },
  {
    name: 'a condition alone keeps the parentheses metakit writes',
    edits: [
      {
        file: render,
        find: '  return render(isConnective(wrote) ? pieces : unparenthesized(pieces), frame)',
        replace: '  return render(pieces, frame)',
      },
    ],
    tests: [
      'packages/remote-drizzle/test/compile.test.ts',
      'packages/remote-drizzle/test/lowering.test.ts',
    ],
  },
  {
    name: 'an or alone loses the parentheses that group it beside another condition',
    edits: [
      {
        file: render,
        find: '  return render(isConnective(wrote) ? pieces : unparenthesized(pieces), frame)',
        replace: '  return render(unparenthesized(pieces), frame)',
      },
    ],
    tests: ['packages/remote-drizzle/test/compile.test.ts'],
  },
  {
    name: 'a text comparison of a column is lowered by metakit, which no index serves',
    edits: [
      {
        file: render,
        find: '  const read = rewrite(rewrite(pastRow(node), columnFirst), collated)',
        replace: '  const read = rewrite(pastRow(node), columnFirst)',
      },
    ],
    tests: [
      'packages/remote-drizzle/test/compile.test.ts',
      'packages/remote-drizzle/test/lowering.test.ts',
    ],
  },
  {
    name: 'a column and a value are compared under the collation of the other side',
    edits: [
      {
        file: rewrites,
        find: "    collation: fold === 'binary' ? Collation.binary : Collation.asciiFold,",
        replace: '    collation: Collation.binary,',
      },
    ],
    tests: [
      'packages/remote-drizzle/test/compile.test.ts',
      'packages/remote-drizzle/test/lowering.test.ts',
    ],
  },
  {
    name: 'a predicate that reads the viewer is not given who asks',
    edits: [
      {
        file: lowering,
        find: '{ onNone: () => null, onSome: ({ id }) => ({ [ASKER]: id }) },',
        replace: '{ onNone: () => null, onSome: () => null },',
      },
    ],
    tests: ['packages/remote-drizzle/test/conformance.test.ts', ...tests],
  },
  {
    name: 'a viewer of another Entity is taken for the one that asks',
    edits: [
      {
        file: lowering,
        find: '      Option.filter(context.viewer, ref => ref.entity === name),\n      // A visitor',
        replace: '      context.viewer,\n      // A visitor',
      },
    ],
    tests: ['packages/remote-drizzle/test/conformance.test.ts', ...tests],
  },
  {
    name: 'a computed call finds the kernel operators nowhere',
    edits: [
      {
        file: compile,
        find: 'Option.orElse(tables.sql.named(operator), () => tables.memory.named(operator)),',
        replace: 'tables.sql.named(operator),',
      },
    ],
    tests: [
      'packages/remote-drizzle/test/lowering.test.ts',
      'packages/remote-drizzle/test/compute.test.ts',
    ],
  },
  {
    name: 'a computation casts no number',
    edits: [
      {
        file: render,
        find: 'return frame.castNumbers && typeof value',
        replace: 'return false && typeof value',
      },
    ],
    tests: ['packages/remote-drizzle/test/lowering.test.ts'],
  },
  {
    name: 'a hop goes through the relation of the wrong Entity',
    edits: [
      {
        file: render,
        find: '    at = relation.target()\n',
        replace: '',
      },
    ],
    tests: ['packages/remote-drizzle/test/conformance.test.ts'],
  },
]
