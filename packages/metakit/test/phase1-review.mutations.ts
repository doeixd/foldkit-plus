/**
 * The Phase 1 adversarial regressions, broken in turn (one mutation per case
 * of `phase1-review.test.ts`):
 *   `pnpm mutate packages/metakit/test/phase1-review.mutations.ts`
 */
const tests = ['packages/metakit/test/phase1-review.test.ts']

const mutation = (name: string, file: string, find: string, replace: string) => ({
  name,
  edits: [{ file, find, replace }],
  tests,
})

export default [
  mutation(
    'holdsNul does not look inside an array candidate',
    '../src/node.ts',
    "Array.isArray(value) ? holdsNul(value) : typeof value === 'string' && value.includes('\\u0000'),",
    "typeof value === 'string' && value.includes('\\u0000'),",
  ),
  mutation(
    'the NUL flag of a coalesce is that of both operands, taken or not',
    '../src/prove/text.ts',
    'return z3.If(first.isNull, nulOf(args[1]!), nulOf(args[0]!))',
    'return z3.Or(nulOf(args[0]!), nulOf(args[1]!))',
  ),
  mutation(
    'a coalesce is taken never to be null',
    '../src/prove/transition.ts',
    "if (op.id === 'null.coalesce') return args.every(arg => mayBeNull(arg, shape))",
    "if (op.id === 'null.coalesce') return false",
  ),
  {
    ...mutation(
      'a coalesce is null when one operand may be',
      '../src/prove/transition.ts',
      "if (op.id === 'null.coalesce') return args.every(arg => mayBeNull(arg, shape))",
      "if (op.id === 'null.coalesce') return args.some(arg => mayBeNull(arg, shape))",
    ),
    survives:
      'only more cautious: it adds the not-null obligation for a coalesce with a non-null operand, which holds and which the solver proves',
  },
  mutation(
    'eq text equality leaves a lone surrogate as it is',
    '../src/ops/eq.ts',
    "typeof value === 'string' ? Node.wellFormed(value) : value",
    'value',
  ),
  mutation(
    'equal to NaN marks the term valued',
    '../src/abstract/ops.ts',
    "if (typeof literal === 'number' && !Number.isFinite(literal)) {",
    'if (false) {',
  ),
  mutation(
    'a coalesce of a nullable number is taken to be finite',
    '../src/abstract/ops.ts',
    "onSome: info => info.kind !== 'number' || info.finite,\n      })\n    },\n  },\n  'str.lowerAscii'",
    "onSome: () => true,\n      })\n    },\n  },\n  'str.lowerAscii'",
  ),
  mutation(
    'a foreign call of another version than the implementation counts as implemented',
    '../src/ops/residualize.ts',
    'op => !Object.hasOwn(foreign, Node.foreignName(op)),',
    'op => !Object.hasOwn(foreign, op.id),',
  ),
]
