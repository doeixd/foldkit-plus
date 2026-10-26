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
    "const comes = [...kindsOf(expr)].filter(kind => kind !== 'null' && !stored.has(kind))",
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
    'assignments[field.key] = computationOf(write, expr, input)',
    'void computationOf',
  ),

  // ---- the row it leaves
  edit(
    'a null under an amount is not known',
    'if (held === null) after[field] = null',
    'if (false) after[field] = null',
  ),
  edit(
    'an amount is not added',
    "else if (typeof held === 'number') after[field] = held + amount",
    "else if (typeof held === 'number') after[field] = held",
  ),
  edit(
    'a computation it cannot work out is not named',
    'onNone: () => unknown.push(field),',
    'onNone: () => 0,',
  ),
  edit(
    'a field the row lacks is read as absent',
    'Field: ({ key }) => (Object.hasOwn(row, key) ? Option.some(row[key]) : Option.none()),',
    'Field: ({ key }) => Option.some(row[key]),',
  ),
  edit(
    'an operator the table lacks is run anyway',
    'Option.flatMap(operators.named(operator), descriptor =>',
    'Option.flatMap(Option.some(operators.implementations[0]!.operator), descriptor =>',
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
]
