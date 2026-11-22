/**
 * Computed assignments and `Write.apply`, broken in turn:
 * `pnpm mutate packages/entity/test/compute.mutations.ts`.
 */
const tests = ['packages/entity/test/compute.test.ts']
const write = '../src/write.ts'
const edit = (name: string, find: string, replace: string) => ({
  name,
  edits: [{ file: write, find, replace }],
  tests,
})

export default [
  // ---- declaring
  edit(
    'a field the Entity lacks is computed',
    'if (field === undefined) return fail(input, `computes "${fieldKey}", which is not a field`)',
    '',
  ),
  edit('the id is computed', "if (fieldKey === 'id') return fail(input, 'computes the id')", ''),
  edit(
    'a field an increment moves is computed too',
    '    declared.increments.some(increment => increment.field.key === fieldKey)',
    '    false',
  ),
  edit('the row after the write is read', 'if (reads.next.length > 0) {', 'if (false) {'),
  edit(
    "another Entity's field is read",
    'const stranger = reads.fields.find(read => read.owner.name !== input.entity.name)',
    'const stranger = reads.fields.find(() => false)',
  ),
  edit(
    'a value of any kind is stored',
    "const comes = [...kindsOf(expr.node)].filter(kind => kind !== 'null' && !stored.has(kind))",
    'const comes: Array<string> = []',
  ),
  edit(
    'an assignment alone sets nothing',
    '  write.increments.length === 0 &&\n',
    '  write.increments.length === 0 &&\n  false &&\n',
  ),

  // ---- what it writes and reads
  edit('its field is not a write', '...write.assignments.map(assignment => assignment.field),', ''),
  edit(
    'what it reads is not read',
    'write.assignments.forEach(assignment =>',
    'write.assignments.slice(0, 0).forEach(assignment =>',
  ),
  edit(
    'it is not bound',
    'put(assignments, field.key, computationOf(write, expr.node, input))',
    'void computationOf(write, expr.node, input)',
  ),

  // ---- the row it leaves
  edit(
    'a null under an amount is not known',
    "if (held === null || typeof held === 'number') {",
    "if (typeof held === 'number') {",
  ),
  edit(
    'an amount is not added',
    'args: [rowField(field), Node.Lit({ value: amount })]',
    'args: [rowField(field), Node.Lit({ value: 0 })]',
  ),
  edit(
    'a computation it cannot work out is not named',
    'onNone: () => unknown.push(field),',
    'onNone: () => 0,',
  ),
  edit(
    'a field the row lacks is read as absent',
    'Field: ({ key }) => (Object.hasOwn(row, key) ? Option.some(rowField(key)) : Option.none()),',
    'Field: ({ key }) => Option.some(rowField(key)),',
  ),
  edit(
    'an operator the table lacks is run anyway',
    'return Option.map(operators.named(operator), descriptor => {',
    'return Option.map(Option.some(operators.implementations[0]!.operator), descriptor => {',
  ),
  edit(
    'a computation reads nothing',
    'Field: ({ key }) => void keys.add(key),',
    'Field: () => undefined,',
  ),
  edit(
    'an amount reads nothing',
    'const keys = new Set(Object.keys(bound.increments))',
    'const keys = new Set<string>()',
  ),
  edit(
    'an assignment that may be null is let into a field storing none',
    "if (!stored.has('null') && mayBeNull(expr.node)) {",
    'if (false) {',
  ),
  edit(
    'a strict call over a nullable argument reads as never null',
    "operator.nulls === 'strict' && args.some(",
    'false && args.some(',
  ),

  // ---- into an integer field
  edit(
    'any number is let into an integer field',
    'if (storesIntegers(field.schema as unknown as Schema.Top) && !integer) {',
    'if (false) {',
  ),
  edit(
    'a field or input is an integer whatever it holds',
    'Option.exists(node.ast, holdsIntegers),',
    'true,',
  ),
  edit(
    'an operator is an integer whatever it answers',
    'storesIntegers(operator.output) ||',
    'true ||',
  ),
  edit(
    'a literal is an integer whatever it holds',
    '? node.value === null || Number.isInteger(node.value)',
    '? true',
  ),
  edit(
    'a null literal is not an integer',
    '? node.value === null || Number.isInteger(node.value)',
    '? Number.isInteger(node.value)',
  ),
  edit(
    'a nullable field is not an integer one',
    'const present = SchemaShape.present(ast)',
    'const present = [ast]',
  ),
]
