/**
 * Variants of an Entity (#357), each part broken in turn:
 * `pnpm mutate packages/entity/test/variants.mutations.ts`.
 */
const tests = ['packages/entity/test/variants.test.ts']
const at = (file: string) => (name: string, find: string, replace: string) => ({
  name,
  edits: [{ file, find, replace }],
  tests,
})
const variants = at('../src/variants.ts')
const index = at('../src/index.ts')
const expr = at('../src/expr.ts')

export default [
  variants(
    'a shared field is stored nullable',
    '      holders.size === tags.length || storesNull(schema)\n',
    '      storesNull(schema)\n',
  ),
  variants(
    'a case field storing null already is wrapped again',
    '      holders.size === tags.length || storesNull(schema)\n',
    '      holders.size === tags.length\n',
  ),
  variants('one case is allowed', '  if (tags.length < 2) fail(', '  if (tags.length < 1) fail('),
  variants('a case may declare _tag', "      if (key === '_tag') fail(", '      if (false) fail('),
  variants(
    'an optional key is allowed',
    '      if (SchemaAST.isOptional(schema.ast))\n',
    '      if (false)\n',
  ),
  variants(
    'a key may have two schemas',
    '      else if (earlier.schema !== schema)\n',
    '      else if (false)\n',
  ),
  variants(
    'a stored row holding another case’s field decodes',
    '    return held.length === 0\n',
    '    return true\n',
  ),
  variants(
    'encoding leaves the other cases’ fields out',
    'Object.hasOwn(row, key) ? row[key] : null',
    'row[key]',
  ),
  index(
    'a descriptor has no variants',
    "    Object.defineProperty(entity, 'variants', { value: union, enumerable: true }),\n",
    '    undefined,\n',
  ),
  index(
    'the invariant does not refuse another case’s field',
    'foreign.map(key => Expr.isNull(row[key]!))',
    'foreign.map(key => Expr.or(Expr.isNull(row[key]!), Expr.isNotNull(row[key]!)))',
  ),
  index(
    'the invariant does not require a case’s own field',
    'held.map(key => Expr.isNotNull(row[key]!))',
    'held.map(key => Expr.or(Expr.isNull(row[key]!), Expr.isNotNull(row[key]!)))',
  ),
  index(
    'the invariant requires a field that stores null already',
    ' || !storesNull(own[key]!))',
    ' || true)',
  ),
  index(
    'a case with nothing to say gets an invariant anyway',
    '      if (reads.length === 0) continue\n',
    '      if (false) continue\n',
  ),
  expr('is ignores what is asked', '  if (build === undefined) return is\n', '  return is\n'),
  expr('is asks without the tag', '  return Expr.and(is, asked)\n', '  return asked\n'),
  expr(
    'is hands out the stored field',
    'read(Object.freeze({ ...stored[key]!, schema }))',
    'read(stored[key]!)',
  ),
  expr(
    'is reads the row judged through a relation',
    '    relation === undefined ? field : pathOf(relation, field)\n',
    '    field\n',
  ),
  expr(
    'is accepts a case the Entity lacks',
    '  if (!variants.tags.includes(tag)) {\n',
    '  if (false) {\n',
  ),
  index(
    'a variant Selection is a Struct',
    '        onSome: variants => variantSelection(entity, variants, fields),\n',
    '        onSome: () => Schema.Struct(fields),\n',
  ),
  index(
    'a Selection with _tag is the stored row',
    "  if (!Object.hasOwn(selected, '_tag')) {\n",
    '  if (true) {\n',
  ),
  index(
    'a case field is selected without _tag',
    '    if (untold.length > 0)\n',
    '    if (false)\n',
  ),
  index(
    'a case holds every selected field, as stored',
    '      else if (Object.hasOwn(own, key)) put(fields, key, own[key]!)\n',
    '      else put(fields, key, schema)\n',
  ),
  index(
    'a case drops the selected relations',
    '      if (!Object.hasOwn(entity.fields, key)) put(fields, key, schema)\n',
    '      if (false) put(fields, key, schema)\n',
  ),
]
