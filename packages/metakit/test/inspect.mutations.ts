/**
 * Mutations proving the `Inspect` tests catch a loose bound, a lost shape, a
 * wrong `required` list and an invented date format:
 *   `pnpm mutate packages/metakit/test/inspect.mutations.ts`
 */
const inspect = '../src/inspect.ts'
const inspectTests = ['packages/metakit/test/inspect.test.ts']

const mutation = (name: string, find: string, replace: string) => ({
  name,
  edits: [{ file: inspect, find, replace }],
  tests: inspectTests,
})

export default [
  mutation(
    'an exclusive lower bound is overwritten, not tightened',
    'exclusiveMin: tighter(bounds.exclusiveMin, value, Math.max)',
    'exclusiveMin: Option.some(value)',
  ),
  mutation(
    'an exclusive upper bound is overwritten, not tightened',
    'exclusiveMax: tighter(bounds.exclusiveMax, value, Math.min)',
    'exclusiveMax: Option.some(value)',
  ),
  mutation(
    'an inclusive and an exclusive bound on one side are both kept',
    'const bounds = tightest(boundsAt(',
    'const bounds = (boundsAt(',
  ),
  mutation(
    "a NullOr member's own checks are not read",
    'const bounds = tightest(boundsAt(boundsAt(unbounded, ownRules, []), rules, at))',
    'const bounds = tightest(boundsAt(unbounded, rules, at))',
  ),
  mutation(
    'an array states no item shape',
    "items: fieldJson(readField('', ast, false, [], []), []),",
    '',
  ),
  mutation(
    'a nested struct lists no properties',
    "{ ...objectJson(fieldsOf(inner, rules, field.at), rules), ...typed('object') }",
    "typed('object')",
  ),
  mutation(
    'an unknown kind claims to be a string',
    "case 'unknown':\n      return {}",
    "case 'unknown':\n      return typed('string')",
  ),
  mutation(
    'every key is required',
    'required: fields.filter(field => !field.spec.optional).map(field => field.spec.name)',
    'required: fields.map(field => field.spec.name)',
  ),
  mutation(
    'undefined stays a member of an optional field',
    'ast.types.filter(t => !SchemaAST.isNull(t) && !SchemaAST.isUndefined(t))',
    'ast.types.filter(t => !SchemaAST.isNull(t))',
  ),
  mutation(
    'a CalendarDay claims the date format',
    "if (Option.isSome(spec.domain)) json['x-metakit-domain'] = spec.domain.value",
    "if (Option.isSome(spec.domain)) json['x-metakit-domain'] = spec.domain.value\n  if (Option.isSome(spec.domain) && spec.domain.value.kind === 'calendarDay') json['format'] = 'date'",
  ),
]
