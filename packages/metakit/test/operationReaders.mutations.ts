const laws = '../src/ops/laws.ts'
const rowOf = '../src/abstract/rowOf.ts'
const tests = ['packages/metakit/test/operationReaders.test.ts']

const edit = (name: string, file: string, find: string, replace: string) => ({
  name,
  edits: [{ file, find, replace }],
  tests,
})

export default [
  edit(
    'rewriteForeign skips Schema check on identity operand',
    laws,
    '        isLit(right, value) &&\n        withinSchema(left, 0, strict)',
    '        isLit(right, value)',
  ),
  edit(
    'rewriteForeign allows null in absorbing dropped operand',
    laws,
    'view.cannotRefuse(operand) && withinSchema(operand, index, false)',
    'view.cannotRefuse(operand) && withinSchema(operand, index, true)',
  ),
  edit(
    'monotoneForeignTerm ignores none direction singleton requirement',
    rowOf,
    "if (dir === 'none' && iv.lo !== iv.hi) return Option.none()",
    'if (false && dir === "none" && iv.lo !== iv.hi) return Option.none()',
  ),
  edit(
    'monotoneForeignTerm ignores integer requirement on non-singleton interval',
    rowOf,
    'if (iv.lo !== iv.hi && (!shape.convex || (shape.isInt && isInts[i] !== true))) {',
    'if (false && iv.lo !== iv.hi && (!shape.convex || (shape.isInt && isInts[i] !== true))) {',
  ),
]
