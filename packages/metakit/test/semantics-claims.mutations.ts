const tests = ['packages/metakit/test/semantics-claims.test.ts']

const edit = (name: string, file: string, find: string, replace: string) => ({
  name,
  edits: [{ file: '../src/' + file, find, replace }],
  tests,
})

export default [
  edit(
    'coalesce refuses when its unused fallback refuses',
    'ops/null.ts',
    'evaluate: ([value, fallback]) => (value === null ? fallback : value),',
    'evaluate: ([value, fallback]) => (value === null || Node.isRefusal(fallback) ? fallback : value),',
  ),
  edit(
    'bool.and absorbs a refused operand beside false',
    'ops/bool.ts',
    'if (refused !== undefined) return refused\n    if (args.includes(decided)) return decided',
    "if (id === 'bool.and' && args.includes(false)) return false\n    if (refused !== undefined) return refused\n    if (args.includes(decided)) return decided",
  ),
  edit(
    'eq.is compares NaN as an ordinary value',
    'ops/eq.ts',
    'args.find(Node.isRefusal) ?? Node.refusedForEquality(id, args) ?? decide(args[0], args[1])',
    "args.find(Node.isRefusal) ?? Node.refusedForEquality(id, id === 'eq.is' ? args.filter(value => !Number.isNaN(value)) : args) ?? decide(args[0], args[1])",
  ),
  edit(
    'Match takes its fallback for a subject containing a NUL',
    'ops/eval.ts',
    "if (matchHoldsNul(target)) return { value: Node.unportable('match') }",
    '',
  ),
  edit(
    'ord.gte compares NaN as an ordinary number',
    'ops/ord.ts',
    'refuses: nan(id),',
    "refuses: id === 'ord.gte' ? () => undefined : nan(id),",
  ),
  edit(
    'If takes the else branch on a null condition',
    'ops/eval.ts',
    'if (cond === false) return { arm: node.otherwise }',
    'if (cond === false || cond === null) return { arm: node.otherwise }',
  ),
  edit(
    'strict operators let null decide before operand refusals',
    'node.ts',
    "if (op.nulls === 'strict') {\n    const refused",
    "if (op.nulls === 'strict') {\n    if (values.includes(null)) return null\n    const refused",
  ),
  edit(
    'a path leaves negative zero unchanged',
    'ops/eval.ts',
    'return current === undefined ? null : normalizeRead(current)',
    'return current === undefined ? null : current',
  ),
  edit(
    'a Match permits a case label containing a NUL',
    'expr.ts',
    '  checkNoNulLabels(name, keys)\n  const literals = literalsOf(on)',
    '  const literals = literalsOf(on)',
  ),
  edit(
    'a rule holds when evaluation gives null',
    'expr.ts',
    '): boolean => evalNode(expr.node, env, options?.foreign) === true',
    '): boolean => {\n  const value = evalNode(expr.node, env, options?.foreign)\n  return value === true || value === null\n}',
  ),
  edit(
    'any and every stop at the first refused element',
    'ops/rows.ts',
    'if (Node.isRefusal(passed)) refused ??= passed',
    'if (Node.isRefusal(passed)) return passed',
  ),
  edit(
    'a literal outside the value domain is built',
    'ops/core.ts',
    '  if (outsideDomain(value)) {',
    '  if (false) {',
  ),
]
