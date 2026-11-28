/**
 * The precision the checker and the judge regained after Phase 1, broken in
 * turn: a strict comparison of a double narrowed by the next double, a sum
 * with a negated operand read as the difference it is, a literal set read as
 * a fact, and an exists that cannot be refused. A mutation that narrows too far
 * must be caught by a test whose environment the checker would then
 * contradict: `pnpm mutate packages/metakit/test/checker-precision.mutations.ts`
 */
const interval = '../src/abstract/interval.ts'
const entail = '../src/abstract/entail.ts'
const fields = '../src/abstract/fields.ts'
const normalize = '../src/abstract/normalize.ts'
const check = '../src/abstract/check.ts'
const ops = '../src/abstract/ops.ts'
const kind = '../src/ops/kind.ts'
const judge = '../src/ops/judge.ts'

const precision = ['packages/metakit/test/checker-precision.test.ts']
const exists = ['packages/metakit/test/exists-refusal.test.ts']
const differential = [
  ...exists,
  'packages/metakit/test/lean-judge.differential.test.ts',
  'packages/entity/test/lower.test.ts',
]

const mutation = (
  tests: ReadonlyArray<string>,
  name: string,
  file: string,
  find: string,
  replace: string,
) => ({ name, edits: [{ file, find, replace }], tests })

export default [
  // The next double.
  mutation(
    precision,
    'zero steps past the least subnormal',
    interval,
    'if (n === 0) return Number.MIN_VALUE',
    'if (n === 0) return 2 * Number.MIN_VALUE',
  ),
  mutation(
    precision,
    'a negative double steps the wrong way',
    interval,
    'bits.setBigUint64(0, n > 0 ? at + 1n : at - 1n)',
    'bits.setBigUint64(0, at + 1n)',
  ),

  // A strict comparison of a double against a constant.
  mutation(
    precision,
    'below a constant is read as at most it',
    entail,
    'strictReal ? Interval.nextDown(rConst.value) : rConst.value + delta',
    'rConst.value + delta',
  ),
  mutation(
    precision,
    'below a constant is read as two doubles below it',
    entail,
    'strictReal ? Interval.nextDown(rConst.value) : rConst.value + delta',
    'strictReal ? Interval.nextDown(Interval.nextDown(rConst.value)) : rConst.value + delta',
  ),
  mutation(
    precision,
    'above a constant is read as at least it',
    entail,
    'strictReal ? Interval.nextUp(lConst.value) : lConst.value - delta',
    'lConst.value - delta',
  ),
  {
    ...mutation(
      precision,
      "a Schema's exclusive minimum is read as inclusive",
      fields,
      'Interval.between(isInt ? Math.floor(m) + 1 : Interval.nextUp(m), Infinity)',
      'Interval.between(isInt ? Math.floor(m) + 1 : m, Infinity)',
    ),
    survives:
      'the check is also read as a rule (`Expr.rulesOf`), which a strict comparison narrows as an assumption, so the wider interval is always met by the narrower one; reading too narrow is caught (the mutation below)',
  },
  mutation(
    precision,
    "a Schema's exclusive minimum is read as two doubles above it",
    fields,
    'Interval.between(isInt ? Math.floor(m) + 1 : Interval.nextUp(m), Infinity)',
    'Interval.between(isInt ? Math.floor(m) + 1 : Interval.nextUp(Interval.nextUp(m)), Infinity)',
  ),

  // A decrement written with a negation.
  mutation(
    precision,
    'a sum with a negated operand is kept a sum',
    normalize,
    'if (Option.isSome(right)) return Node.Call({ op: sum ? subOp : addOp, args: [a, right.value] })',
    '',
  ),
  mutation(
    precision,
    'a negated first operand is kept',
    normalize,
    'if (sum && Option.isSome(left))',
    'if (false && Option.isSome(left))',
  ),
  mutation(
    precision,
    'a double negation inside a sum is kept',
    normalize,
    'Option.match(Option.flatMap(negated(node), negated), { onNone: () => node, onSome: plain })',
    'node',
  ),
  mutation(
    precision,
    'a written value is read as written',
    check,
    'value: normalize(eq.value.node),',
    'value: eq.value.node,',
  ),
  mutation(
    precision,
    "a double's difference is not bounded by the difference's bounds",
    entail,
    'tighten(ZERO, id, this.zone.rawBound(rv.value, lv.value))\n        }\n        continue',
    '}\n        continue',
  ),
  mutation(
    precision,
    "a double's difference is related as an integer's",
    entail,
    'if (!exact) {',
    'if (false) {',
  ),

  // A literal set.
  mutation(
    precision,
    'a literal the set does not hold is not refuted',
    ops,
    'if (!holds(left.value, literal)) return refuted()',
    '',
  ),
  mutation(
    precision,
    'the one member left is not taken',
    ops,
    'if (left.value.length === 1 && isNull === false) return proved',
    'if (false) return proved',
  ),
  mutation(
    precision,
    'the one member left is taken where the value may be null',
    ops,
    'if (left.value.length === 1 && isNull === false) return proved',
    'if (left.value.length === 1) return proved',
  ),
  mutation(
    precision,
    'excluding all members but one does not leave it',
    ops,
    'state.eqFacts.set(pk, Node.textIdentity(left[0]))',
    'void left',
  ),
  mutation(
    precision,
    'excluding every member is a contradiction though the value may be null',
    ops,
    'if (state.nullFacts.get(pk) !== false) return',
    '',
  ),
  mutation(
    precision,
    'an equality assumed of a literal outside the set is kept',
    ops,
    'const outside = Option.exists(literalsLeft(state, pk), left => !holds(left, literal))',
    'const outside = false',
  ),

  // An exists that cannot be refused.
  mutation(
    exists,
    'every fold is taken to absorb a refused element',
    kind,
    "(rows.fold === 'any' || rows.fold === 'every') && sourceHolds && testCannotRefuse",
    'sourceHolds && testCannotRefuse',
  ),
  mutation(
    exists,
    'the test is not read',
    kind,
    'Option.match(rows.where, { onNone: () => true, onSome: cannotRefuse }),',
    'true,',
  ),
  mutation(
    exists,
    'a list read is taken for a list whatever its Schema',
    kind,
    'List: () => Option.exists(path.ast, ast => present(ast).every(SchemaAST.isArrays)),',
    'List: () => true,',
  ),
  mutation(
    exists,
    'a literal source is taken for a list whatever it holds',
    kind,
    'List: () => Array.isArray(value) && admitted(value),',
    'List: () => true,',
  ),
  mutation(
    exists,
    'a known source is taken for a row whatever it holds',
    kind,
    "Related: () => typeof value === 'object' && !Array.isArray(value) && !Node.isRefusal(value),",
    'Related: () => true,',
  ),
  mutation(
    differential,
    'the judge never shows an exists unrefused',
    judge,
    `              foldCannotRefuse(
                kept,`,
    `              false && foldCannotRefuse(
                kept,`,
  ),
  mutation(
    differential,
    "the judge does not read an exists' test",
    judge,
    'Option.isNone(kept.where) || view.cannotRefuse(body[0]),',
    'true,',
  ),
  mutation(
    differential,
    'the judge keeps no kind for an exists',
    judge,
    '              kindOf(kept),',
    '              Option.none(),',
  ),
]
